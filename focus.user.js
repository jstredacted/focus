// ==UserScript==
// @name         Focus
// @namespace    focus-youtube
// @version      1.0.0
// @description  Remove YouTube distractions — recommendations, Shorts, ads, and more.
// @match        https://www.youtube.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  if (location.hostname !== "www.youtube.com") return;

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  const TOGGLE_CLASS_MAP = {
    hideHomepage: "focus-hide-homepage",
    hideSidebar: "focus-hide-sidebar",
    hideEndScreen: "focus-hide-endscreen",
    hideComments: "focus-hide-comments",
    hideShorts: "focus-hide-shorts",
    hideAds: "focus-hide-ads",
    hideTrending: "focus-hide-trending",
    hideNotificationBadge: "focus-hide-notification-badge",
    hideLiveChat: "focus-hide-livechat",
  };

  const TOGGLE_LABELS = {
    hideHomepage: "Homepage",
    hideSidebar: "Sidebar",
    hideEndScreen: "End Screen",
    hideComments: "Comments",
    hideShorts: "Shorts",
    hideAds: "Ads",
    hideTrending: "Trending",
    hideNotificationBadge: "Notification Badge",
    hideLiveChat: "Live Chat",
  };

  const ALL_KEYS = Object.keys(TOGGLE_CLASS_MAP);

  // ---------------------------------------------------------------------------
  // State — load from GM storage, default all to true
  // ---------------------------------------------------------------------------

  let toggles = {};
  ALL_KEYS.forEach((key) => {
    toggles[key] = GM_getValue(key, true);
  });

  // Immediate redirect — before anything renders
  if (toggles.hideShorts && location.pathname.startsWith("/shorts")) {
    location.replace("/");
    return;
  }

  // ---------------------------------------------------------------------------
  // CSS injection — inject as early as possible (before body)
  // ---------------------------------------------------------------------------

  const CSS = `
/* Homepage */
.focus-hide-homepage ytd-rich-grid-renderer,
.focus-hide-homepage ytd-browse[page-subtype="home"] #contents { display: none !important; }

/* Sidebar */
.focus-hide-sidebar #secondary,
.focus-hide-sidebar #related { display: none !important; }

/* End Screen */
.focus-hide-endscreen .ytp-endscreen-content,
.focus-hide-endscreen .ytp-ce-element { display: none !important; }

/* Comments */
.focus-hide-comments #comments,
.focus-hide-comments ytd-comments { display: none !important; }

/* Shorts */
.focus-hide-shorts ytd-reel-shelf-renderer,
.focus-hide-shorts ytd-rich-shelf-renderer[is-shorts],
.focus-hide-shorts ytd-reel-item-renderer,
.focus-hide-shorts ytd-mini-guide-entry-renderer[aria-label="Shorts"],
.focus-hide-shorts ytd-guide-entry-renderer:has(a[href="/shorts"]),
.focus-hide-shorts ytd-mini-guide-entry-renderer:has(a[href="/shorts"]),
.focus-hide-shorts a[title="Shorts"],
.focus-hide-shorts [tab-identifier="FEshorts"],
.focus-hide-shorts ytd-pivot-bar-item-renderer:has(a[href="/shorts"]) { display: none !important; }

/* Ads */
.focus-hide-ads .ytd-ad-slot-renderer,
.focus-hide-ads ytd-ad-slot-renderer,
.focus-hide-ads ytd-promoted-sparkles-web-renderer,
.focus-hide-ads .ytp-ad-module,
.focus-hide-ads #player-ads,
.focus-hide-ads ytd-banner-promo-renderer,
.focus-hide-ads .ytp-ad-overlay-container { display: none !important; }

/* Notification Badge */
.focus-hide-notification-badge ytd-notification-topbar-button-renderer .notification-count { display: none !important; }

/* Live Chat */
.focus-hide-livechat ytd-live-chat-frame,
.focus-hide-livechat #chat,
.focus-hide-livechat #chat-container { display: none !important; }
`;

  function injectStyle() {
    const style = document.createElement("style");
    style.id = "focus-userscript-styles";
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  injectStyle();

  // ---------------------------------------------------------------------------
  // Body class management
  // ---------------------------------------------------------------------------

  function applyClasses() {
    if (!document.body) return;
    for (const [key, cls] of Object.entries(TOGGLE_CLASS_MAP)) {
      document.body.classList.toggle(cls, !!toggles[key]);
    }
  }

  // ---------------------------------------------------------------------------
  // MutationObserver for JS-only removals (ads, Shorts shelves, guide entries)
  // ---------------------------------------------------------------------------

  function anyJsToggleActive() {
    return toggles.hideAds || toggles.hideShorts || toggles.hideTrending;
  }

  function buildJsRemovalSelector() {
    const selectors = [];

    if (toggles.hideAds) {
      selectors.push(
        "ytd-ad-slot-renderer",
        "ytd-promoted-sparkles-web-renderer",
        "ytd-banner-promo-renderer"
      );
    }

    if (toggles.hideShorts) {
      selectors.push(
        "ytd-reel-shelf-renderer",
        "ytd-rich-shelf-renderer[is-shorts]"
      );
    }

    return selectors.length > 0 ? selectors.join(",") : null;
  }

  function isGuideEntryForPath(node, paths) {
    if (node.nodeName?.toLowerCase() !== "ytd-guide-entry-renderer") return false;
    const anchor = node.querySelector("a");
    if (!anchor) return false;
    const href = anchor.getAttribute("href") || "";
    return paths.some((p) => href.includes(p));
  }

  function processNode(node, combinedSelector) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    if (toggles.hideShorts && isGuideEntryForPath(node, ["/shorts"])) {
      node.remove();
      return;
    }
    if (
      toggles.hideTrending &&
      isGuideEntryForPath(node, ["/feed/trending", "/feed/explore"])
    ) {
      node.remove();
      return;
    }

    if (!combinedSelector) return;

    if (node.matches?.(combinedSelector)) {
      node.remove();
      return;
    }

    const children = node.querySelectorAll?.(combinedSelector);
    if (children) {
      children.forEach((child) => child.remove());
    }
  }

  let pendingMutations = [];
  let rafScheduled = false;

  function processPendingMutations() {
    rafScheduled = false;
    const nodes = pendingMutations;
    pendingMutations = [];

    const combinedSelector = buildJsRemovalSelector();
    for (const node of nodes) {
      processNode(node, combinedSelector);
    }
  }

  function onMutations(mutations) {
    if (!anyJsToggleActive()) return;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        pendingMutations.push(node);
      }
    }

    if (!rafScheduled && pendingMutations.length > 0) {
      rafScheduled = true;
      requestAnimationFrame(processPendingMutations);
    }
  }

  let observer = null;

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(onMutations);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function scanGuideEntries() {
    if (toggles.hideShorts) {
      document.querySelectorAll("ytd-guide-entry-renderer").forEach((el) => {
        if (isGuideEntryForPath(el, ["/shorts"])) el.remove();
      });
    }
    if (toggles.hideTrending) {
      document.querySelectorAll("ytd-guide-entry-renderer").forEach((el) => {
        if (isGuideEntryForPath(el, ["/feed/trending", "/feed/explore"]))
          el.remove();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // SPA navigation
  // ---------------------------------------------------------------------------

  function redirectIfShorts() {
    if (toggles.hideShorts && location.pathname.startsWith("/shorts")) {
      window.location.replace("/");
    }
  }

  document.addEventListener("yt-navigate-finish", () => {
    applyClasses();
    scanGuideEntries();
    redirectIfShorts();
  });

  // ---------------------------------------------------------------------------
  // Settings UI
  // ---------------------------------------------------------------------------

  function buildUI() {
    // --- Floating toggle button ---
    const fabBtn = document.createElement("button");
    fabBtn.id = "focus-fab";
    fabBtn.textContent = "F";
    fabBtn.setAttribute("aria-label", "Focus settings");
    fabBtn.setAttribute("title", "Focus settings");

    const fabStyle = document.createElement("style");
    fabStyle.textContent = `
#focus-fab {
  position: fixed;
  bottom: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  font-weight: 700;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  transition: opacity 0.15s;
  background: #ff0000;
  color: #fff;
  padding: 0;
  line-height: 1;
}
#focus-fab:hover { opacity: 0.85; }

#focus-panel {
  position: fixed;
  bottom: 56px;
  right: 16px;
  width: 240px;
  border-radius: 12px;
  padding: 16px;
  z-index: 2147483646;
  box-shadow: 0 4px 24px rgba(0,0,0,0.22);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  display: none;
}
#focus-panel.focus-panel-open { display: block; }

@media (prefers-color-scheme: dark) {
  #focus-panel {
    background: #1f1f1f;
    color: #e8e8e8;
    border: 1px solid #333;
  }
  .focus-panel-title { color: #fff; }
  .focus-row { border-bottom-color: #2e2e2e; }
}
@media (prefers-color-scheme: light) {
  #focus-panel {
    background: #fff;
    color: #111;
    border: 1px solid #e0e0e0;
  }
  .focus-panel-title { color: #111; }
  .focus-row { border-bottom-color: #f0f0f0; }
}

.focus-panel-title {
  font-size: 15px;
  font-weight: 700;
  margin: 0 0 12px 0;
}

.focus-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 0;
  border-bottom: 1px solid;
}
.focus-row:last-child { border-bottom: none; }

.focus-label {
  font-size: 13px;
  user-select: none;
}

/* Toggle switch */
.focus-switch {
  position: relative;
  width: 34px;
  height: 20px;
  flex-shrink: 0;
}
.focus-switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}
.focus-slider {
  position: absolute;
  inset: 0;
  border-radius: 20px;
  cursor: pointer;
  transition: background 0.2s;
  background: #ccc;
}
.focus-slider::before {
  content: "";
  position: absolute;
  width: 14px;
  height: 14px;
  left: 3px;
  top: 3px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
}
.focus-switch input:checked + .focus-slider {
  background: #ff0000;
}
.focus-switch input:checked + .focus-slider::before {
  transform: translateX(14px);
}
`;

    document.head.appendChild(fabStyle);

    // --- Panel ---
    const panel = document.createElement("div");
    panel.id = "focus-panel";

    const title = document.createElement("p");
    title.className = "focus-panel-title";
    title.textContent = "Focus";
    panel.appendChild(title);

    const switchRefs = {};

    ALL_KEYS.forEach((key) => {
      const row = document.createElement("div");
      row.className = "focus-row";

      const label = document.createElement("span");
      label.className = "focus-label";
      label.textContent = TOGGLE_LABELS[key];

      const switchWrap = document.createElement("label");
      switchWrap.className = "focus-switch";
      switchWrap.setAttribute("aria-label", TOGGLE_LABELS[key]);

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!toggles[key];

      const slider = document.createElement("span");
      slider.className = "focus-slider";

      switchWrap.appendChild(input);
      switchWrap.appendChild(slider);

      row.appendChild(label);
      row.appendChild(switchWrap);
      panel.appendChild(row);

      switchRefs[key] = input;

      input.addEventListener("change", () => {
        toggles[key] = input.checked;
        GM_setValue(key, input.checked);
        applyClasses();
        scanGuideEntries();
      });
    });

    document.body.appendChild(fabBtn);
    document.body.appendChild(panel);

    // --- Open/close logic ---
    let panelOpen = false;

    function openPanel() {
      panelOpen = true;
      panel.classList.add("focus-panel-open");
    }

    function closePanel() {
      panelOpen = false;
      panel.classList.remove("focus-panel-open");
    }

    fabBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      panelOpen ? closePanel() : openPanel();
    });

    document.addEventListener("click", (e) => {
      if (panelOpen && !panel.contains(e.target) && e.target !== fabBtn) {
        closePanel();
      }
    });

    // Keep switch states in sync if settings change externally
    // (not strictly needed for userscript but nice to have)
    function syncSwitches() {
      ALL_KEYS.forEach((key) => {
        if (switchRefs[key]) switchRefs[key].checked = !!toggles[key];
      });
    }

    return { syncSwitches };
  }

  // ---------------------------------------------------------------------------
  // Initialization — wait for document.body
  // ---------------------------------------------------------------------------

  function onBodyReady() {
    applyClasses();
    startObserver();
    scanGuideEntries();
    redirectIfShorts();
    buildUI();
  }

  function init() {
    if (document.body) {
      onBodyReady();
      return;
    }

    const root = document.documentElement;
    if (root) {
      const bodyObserver = new MutationObserver(() => {
        if (document.body) {
          bodyObserver.disconnect();
          onBodyReady();
        }
      });
      bodyObserver.observe(root, { childList: true });
    } else {
      document.addEventListener("DOMContentLoaded", onBodyReady);
    }
  }

  init();
})();

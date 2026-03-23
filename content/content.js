(function () {
  "use strict";

  // Early exit for non-main YouTube domains (Music, embeds, etc.)
  if (location.hostname !== "www.youtube.com") return;

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

  const ALL_KEYS = Object.keys(TOGGLE_CLASS_MAP);

  // Current toggle state — defaults to all-on if storage is empty
  let toggles = {};
  ALL_KEYS.forEach((key) => (toggles[key] = true));

  // --- Body class management ---

  function applyClasses() {
    if (!document.body) return;
    for (const [key, cls] of Object.entries(TOGGLE_CLASS_MAP)) {
      document.body.classList.toggle(cls, !!toggles[key]);
    }
  }

  // --- MutationObserver for JS-only removals ---

  // Check if any JS-removal toggle is active
  function anyJsToggleActive() {
    return toggles.hideAds || toggles.hideShorts || toggles.hideTrending;
  }

  // Build combined CSS selector for elements removed via JS
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

  // Check if a guide entry links to a specific path
  function isGuideEntryForPath(node, paths) {
    if (node.nodeName?.toLowerCase() !== "ytd-guide-entry-renderer") return false;
    const anchor = node.querySelector("a");
    if (!anchor) return false;
    const href = anchor.getAttribute("href") || "";
    return paths.some((p) => href.includes(p));
  }

  // Process a single added node against precomputed selector
  function processNode(node, combinedSelector) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    // JS-only removal: guide entries for Shorts, Trending/Explore
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

    // Selector-based removal for ads and Shorts shelves
    if (!combinedSelector) return;

    if (node.matches?.(combinedSelector)) {
      node.remove();
      return;
    }

    // Check children of added node
    const children = node.querySelectorAll?.(combinedSelector);
    if (children) {
      children.forEach((child) => child.remove());
    }
  }

  // RAF-batched MutationObserver
  let pendingMutations = [];
  let rafScheduled = false;

  function processPendingMutations() {
    rafScheduled = false;
    const nodes = pendingMutations;
    pendingMutations = [];

    // Build selector once per batch
    const combinedSelector = buildJsRemovalSelector();

    for (const node of nodes) {
      processNode(node, combinedSelector);
    }
  }

  function onMutations(mutations) {
    // Short-circuit immediately if no JS-removal toggles are active
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

  // --- SPA navigation handler ---

  function onNavigate() {
    applyClasses();
    scanGuideEntries();
  }

  document.addEventListener("yt-navigate-finish", onNavigate);

  // --- Storage integration ---

  function onStorageLoaded(result) {
    for (const key of ALL_KEYS) {
      // Default to true if key is missing (empty/uninitialized storage)
      toggles[key] = result[key] !== undefined ? result[key] : true;
    }
    applyClasses();
    startObserver();
    // Initial scan for guide entries (Shorts link, Trending link)
    scanGuideEntries();
  }

  function scanGuideEntries() {
    if (toggles.hideShorts) {
      document
        .querySelectorAll("ytd-guide-entry-renderer")
        .forEach((el) => {
          if (isGuideEntryForPath(el, ["/shorts"])) el.remove();
        });
    }
    if (toggles.hideTrending) {
      document
        .querySelectorAll("ytd-guide-entry-renderer")
        .forEach((el) => {
          if (isGuideEntryForPath(el, ["/feed/trending", "/feed/explore"]))
            el.remove();
        });
    }
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in toggles) {
        toggles[key] = newValue;
      }
    }
    applyClasses();
    onNavigate();
  });

  // --- Initialization: wait for document.body ---

  function init() {
    if (document.body) {
      browser.storage.local.get(ALL_KEYS).then(onStorageLoaded);
      return;
    }

    // Wait for body to exist — observe documentElement if available,
    // otherwise wait for it via DOMContentLoaded fallback
    const root = document.documentElement;
    if (root) {
      const bodyObserver = new MutationObserver(() => {
        if (document.body) {
          bodyObserver.disconnect();
          browser.storage.local.get(ALL_KEYS).then(onStorageLoaded);
        }
      });
      bodyObserver.observe(root, { childList: true });
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        browser.storage.local.get(ALL_KEYS).then(onStorageLoaded);
      });
    }
  }

  init();
})();

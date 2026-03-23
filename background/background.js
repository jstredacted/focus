(function () {
  "use strict";

  const DEFAULT_SETTINGS = {
    hideHomepage: true,
    hideSidebar: true,
    hideEndScreen: true,
    hideComments: true,
    hideShorts: true,
    hideAds: true,
    hideTrending: true,
    hideNotificationBadge: true,
    hideLiveChat: true,
  };

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      browser.storage.local.set(DEFAULT_SETTINGS);
    }
  });
})();

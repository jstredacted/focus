(function () {
  "use strict";

  const checkboxes = document.querySelectorAll('input[type="checkbox"][data-key]');
  const keys = Array.from(checkboxes).map((cb) => cb.dataset.key);

  // Load current state
  browser.storage.local.get(keys).then((result) => {
    checkboxes.forEach((cb) => {
      // Default to true if key missing
      cb.checked = result[cb.dataset.key] !== undefined ? result[cb.dataset.key] : true;
    });
  });

  // Save on toggle
  checkboxes.forEach((cb) => {
    cb.addEventListener("change", () => {
      browser.storage.local.set({ [cb.dataset.key]: cb.checked });
    });
  });
})();

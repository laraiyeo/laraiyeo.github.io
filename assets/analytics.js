// analytics.js
(function () {
  // Embedded mode detection — hide navbar, date-picker, screen-size-warning in iframes
  try {
    if (window !== window.top) {
      document.documentElement.classList.add("sh-embedded");
      var style = document.createElement("style");
      // NOTE: `:where()` keeps this selector's specificity at 0 so the
      // `.navbar` / `.date-picker-bar` hide rules below still win, while
      // modals are excluded so their inline display:none/​flex keeps working.
      var revertSel =
        ".sh-embedded body > *:where(:not(.screen-size-warning):not(.sb-modal-overlay):not(.sb-stream-overlay):not(.modal-overlay))";
      style.textContent =
        ".sh-embedded .navbar { display: none !important; }" +
        ".sh-embedded .date-picker-bar { display: none !important; }" +
        ".sh-embedded .date-picker-row { display: none !important; }" +
        ".sh-embedded .screen-size-warning { display: none !important; }" +
        ".sh-embedded .sh-split-btn { display: none !important; }" +
        ".sh-embedded .home-grid { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; }" +
        revertSel +
        " { display: revert !important; }" +
        "@media (max-width: 1365px) {" +
        "  .sh-embedded .screen-size-warning { display: none !important; }" +
        "  " +
        revertSel +
        " { display: revert !important; }" +
        "}";
      document.head.appendChild(style);
    }
  } catch (e) {
    // cross-origin iframe — ignore
  }

  var gtagScript = document.createElement("script");
  gtagScript.async = true;
  gtagScript.src = "https://www.googletagmanager.com/gtag/js?id=G-37VMZQ1G0E";
  document.head.appendChild(gtagScript);

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    dataLayer.push(arguments);
  }
  window.gtag = gtag;

  gtag("js", new Date());
  gtag("config", "G-37VMZQ1G0E");
})();

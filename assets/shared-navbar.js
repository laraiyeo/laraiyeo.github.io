/**
 * SportsHeart Web - Shared Navbar
 * Includes auth button, live tracker viewer, and sport navigation
 */
(function () {
  const NAVBAR_HTML = `
    <nav class="navbar" id="sportsheart-navbar">
      <div class="navbar-left">
        <a href="/" class="navbar-logo">
          <img src="/icon.png" alt="SportsHeart" onerror="this.style.display='none'">
          <span>SportsHeart ❤</span>
        </a>
      </div>
      <div class="navbar-center" id="navbar-sport-links">
        <!-- Populated by JS -->
      </div>
      <div class="navbar-right">
        <div id="live-tracker-global"></div>
        <div id="auth-button-container"></div>
      </div>
    </nav>
  `;

  const SPORT_LINKS = [
    { name: "NBA", href: "/nba/aio.html", sport: "nba" },
    { name: "WNBA", href: "/wnba/aio.html", sport: "wnba" },
    { name: "NFL", href: "/nfl/aio.html", sport: "nfl" },
    { name: "MLB", href: "/mlb/aio.html", sport: "mlb" },
    { name: "NHL", href: "/nhl/aio.html", sport: "nhl" },
  ];

  function getCurrentSport() {
    const path = window.location.pathname.toLowerCase();
    for (const link of SPORT_LINKS) {
      if (path.includes(`/${link.sport}/`)) return link.sport;
    }
    return null;
  }

  function renderNavbar() {
    // Insert navbar at the top of body
    const existing = document.getElementById("sportsheart-navbar");
    if (existing) existing.remove();

    const temp = document.createElement("div");
    temp.innerHTML = NAVBAR_HTML;
    const navbar = temp.firstElementChild;
    document.body.insertBefore(navbar, document.body.firstChild);

    // Populate sport links
    const linksContainer = document.getElementById("navbar-sport-links");
    const currentSport = getCurrentSport();
    SPORT_LINKS.forEach((link) => {
      const a = document.createElement("a");
      a.href = link.href;
      a.className = "nav-link" + (link.sport === currentSport ? " active" : "");
      a.textContent = link.name;
      linksContainer.appendChild(a);
    });

    // Add auth button
    const authContainer = document.getElementById("auth-button-container");
    if (authContainer && typeof createAuthButton === "function") {
      const authBtn = createAuthButton();
      authContainer.parentNode.replaceChild(authBtn, authContainer);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderNavbar);
  } else {
    renderNavbar();
  }
})();

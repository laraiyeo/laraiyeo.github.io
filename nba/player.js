/**
 * NBA Player Page
 */
(function () {
  var playerId = null;
  var playerData = null;
  var activeTab = "stats";

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  async function loadPlayerInfo() {
    var res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes/" +
        playerId,
    );
    var data = await res.json();
    playerData = data.athlete || data;
    var header = document.getElementById("playerHeader");
    var headshot = playerData.headshot?.href || "";
    var position =
      playerData.position?.displayName || playerData.position?.name || "";
    var team = playerData.team?.displayName || "";

    header.innerHTML =
      (headshot
        ? '<img src="' +
          headshot +
          '" alt="' +
          playerData.displayName +
          '" class="player-headshot" onerror="this.style.display=\'none\'">'
        : "") +
      '<div class="player-info">' +
      "<h1>" +
      playerData.displayName +
      "</h1>" +
      '<div class="player-meta">#' +
      (playerData.jersey || "--") +
      " | " +
      position +
      " | " +
      team +
      "</div>" +
      '<div class="player-meta">Height: ' +
      (playerData.displayHeight || "N/A") +
      " | Weight: " +
      (playerData.displayWeight || "N/A") +
      "</div>" +
      '<div class="player-meta">Born: ' +
      (playerData.birthDate || "") +
      " | " +
      (playerData.birthPlace?.city || "") +
      ", " +
      (playerData.birthPlace?.country || "") +
      "</div>" +
      "</div>";
    document.title = playerData.displayName + " - NBA - SportsHeart";
  }

  async function loadStatsTab() {
    var container = document.getElementById("playerContent");
    container.innerHTML =
      '<div class="loading"><div class="loading-spinner"></div></div>';
    var year = new Date().getFullYear();
    try {
      var url =
        "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/" +
        year +
        "/types/2/athletes/" +
        playerId +
        "/statistics?lang=en&region=us";
      var res = await fetch(url);
      var data = await res.json();
      var html =
        '<div class="section-card"><h3>Season Stats (' +
        year +
        ')</h3><div class="player-stats-grid">';
      if (data.splits?.categories) {
        data.splits.categories.forEach(function (cat) {
          (cat.stats || []).forEach(function (s) {
            html +=
              '<div class="stat-chip"><div class="stat-chip-label">' +
              (s.displayName || s.name || "") +
              "</div>" +
              '<div class="stat-chip-value">' +
              (s.displayValue || s.value || "0") +
              "</div>" +
              (s.rank
                ? '<div class="stat-chip-rank">#' + s.rank + "</div>"
                : "") +
              "</div>";
          });
        });
      }
      html += "</div></div>";
      container.innerHTML =
        html ||
        '<div class="empty-state"><div class="empty-state-text">No stats available</div></div>';
    } catch (err) {
      container.innerHTML =
        '<div class="empty-state"><div class="empty-state-text">Error loading stats</div></div>';
    }
  }

  async function loadGameLogTab() {
    var container = document.getElementById("playerContent");
    container.innerHTML =
      '<div class="empty-state"><div class="empty-state-text">Game log coming soon</div></div>';
  }

  async function loadCareerTab() {
    var container = document.getElementById("playerContent");
    container.innerHTML =
      '<div class="empty-state"><div class="empty-state-text">Career stats coming soon</div></div>';
  }

  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll(".team-tab").forEach(function (t) {
      t.classList.remove("active");
    });
    document
      .querySelector('.team-tab[data-tab="' + tab + '"]')
      .classList.add("active");
    if (tab === "stats") loadStatsTab();
    else if (tab === "gamelog") loadGameLogTab();
    else if (tab === "career") loadCareerTab();
  }

  async function init() {
    playerId = getParam("playerId");
    if (!playerId) {
      document.getElementById("playerContent").innerHTML =
        '<div class="empty-state"><div class="empty-state-text">No player ID provided</div></div>';
      return;
    }
    var authContainer = document.getElementById("auth-button-container");
    if (authContainer && typeof createAuthButton === "function") {
      authContainer.appendChild(createAuthButton());
    }
    document.querySelectorAll(".team-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        switchTab(this.dataset.tab);
      });
    });
    await loadPlayerInfo();
    loadStatsTab();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

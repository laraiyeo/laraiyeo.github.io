/**
 * MLB Player Page
 */
(function () {
  var playerId = null;
  var playerData = null;
  var activeTab = "stats";

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  // ── Load Player Info ─────────────────────────────
  async function loadPlayerInfo() {
    var res = await fetch("https://statsapi.mlb.com/api/v1/people/" + playerId);
    var data = await res.json();
    playerData = data.people[0];

    var header = document.getElementById("playerHeader");
    var headshot =
      "https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:good/v1/people/" +
      playerId +
      "/headshot/67/current";
    var primaryNumber = playerData.primaryNumber || "--";
    var position = playerData.primaryPosition?.name || "";
    var team = playerData.currentTeam?.name || "";

    header.innerHTML =
      '<img src="' +
      headshot +
      '" alt="' +
      playerData.fullName +
      '" class="player-headshot" onerror="this.style.display=\'none\'">' +
      '<div class="player-info">' +
      "<h1>" +
      playerData.fullName +
      "</h1>" +
      '<div class="player-meta">#' +
      primaryNumber +
      " | " +
      position +
      " | " +
      team +
      "</div>" +
      '<div class="player-meta">Bats: ' +
      (playerData.batSide?.description || "N/A") +
      " | Throws: " +
      (playerData.pitchHand?.description || "N/A") +
      "</div>" +
      '<div class="player-meta">Born: ' +
      (playerData.birthDate || "") +
      " | " +
      (playerData.birthCity || "") +
      ", " +
      (playerData.birthCountry || "") +
      "</div>" +
      "</div>";

    document.title = playerData.fullName + " - MLB - SportsHeart";
  }

  // ── Stats Tab ────────────────────────────────────
  async function loadStatsTab() {
    var container = document.getElementById("playerContent");
    container.innerHTML =
      '<div class="loading"><div class="loading-spinner"></div></div>';

    var year = new Date().getFullYear();
    try {
      var hittingRes = await fetch(
        "https://statsapi.mlb.com/api/v1/people/" +
          playerId +
          "/stats?stats=season&group=hitting&season=" +
          year,
      );
      var pitchingRes = await fetch(
        "https://statsapi.mlb.com/api/v1/people/" +
          playerId +
          "/stats?stats=season&group=pitching&season=" +
          year,
      );
      var hittingData = await hittingRes.json();
      var pitchingData = await pitchingRes.json();

      var html = "";

      if (hittingData.stats?.[0]?.splits?.[0]?.stat) {
        var s = hittingData.stats[0].splits[0].stat;
        html +=
          '<div class="section-card"><h3>Batting Stats (' +
          year +
          ')</h3><div class="player-stats-grid">' +
          statChip("GP", s.gamesPlayed || "0") +
          statChip("AVG", s.avg || ".000") +
          statChip("HR", s.homeRuns || "0") +
          statChip("RBI", s.rbi || "0") +
          statChip("R", s.runs || "0") +
          statChip("H", s.hits || "0") +
          statChip("SB", s.stolenBases || "0") +
          statChip("OBP", s.obp || ".000") +
          statChip("SLG", s.slg || ".000") +
          statChip("OPS", s.ops || ".000") +
          statChip("BB", s.baseOnBalls || "0") +
          statChip("SO", s.strikeOuts || "0") +
          "</div></div>";
      }

      if (pitchingData.stats?.[0]?.splits?.[0]?.stat) {
        var p = pitchingData.stats[0].splits[0].stat;
        html +=
          '<div class="section-card"><h3>Pitching Stats (' +
          year +
          ')</h3><div class="player-stats-grid">' +
          statChip("ERA", p.era || "0.00") +
          statChip("W", p.wins || "0") +
          statChip("L", p.losses || "0") +
          statChip("SO", p.strikeOuts || "0") +
          statChip("WHIP", p.whip || "0.00") +
          statChip("SV", p.saves || "0") +
          statChip("IP", p.inningsPitched || "0.0") +
          statChip("GS", p.gamesStarted || "0") +
          "</div></div>";
      }

      container.innerHTML =
        html ||
        '<div class="empty-state"><div class="empty-state-text">No stats available for ' +
          year +
          "</div></div>";
    } catch (err) {
      container.innerHTML =
        '<div class="empty-state"><div class="empty-state-text">Error loading stats</div></div>';
    }
  }

  function statChip(label, value) {
    return (
      '<div class="stat-chip"><div class="stat-chip-label">' +
      label +
      '</div><div class="stat-chip-value">' +
      value +
      "</div></div>"
    );
  }

  // ── Game Log Tab ─────────────────────────────────
  async function loadGameLogTab() {
    var container = document.getElementById("playerContent");
    container.innerHTML =
      '<div class="loading"><div class="loading-spinner"></div></div>';

    var year = new Date().getFullYear();
    try {
      var res = await fetch(
        "https://statsapi.mlb.com/api/v1/people/" +
          playerId +
          "/stats?stats=gameLog&group=hitting&season=" +
          year,
      );
      var data = await res.json();
      var splits = data.stats?.[0]?.splits || [];

      if (splits.length === 0) {
        container.innerHTML =
          '<div class="empty-state"><div class="empty-state-text">No game log data</div></div>';
        return;
      }

      var html = '<div class="section-card"><h3>Game Log (' + year + ")</h3>";
      html +=
        '<table class="standings-table"><thead><tr><th>Date</th><th>Opp</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>BB</th><th>SO</th><th>AVG</th></tr></thead><tbody>';

      splits.slice(0, 20).forEach(function (s) {
        var stat = s.stat;
        html +=
          "<tr>" +
          "<td>" +
          (s.date || "") +
          "</td>" +
          "<td>" +
          (s.opponent?.name || "") +
          "</td>" +
          "<td>" +
          (stat.atBats || 0) +
          "</td>" +
          "<td>" +
          (stat.runs || 0) +
          "</td>" +
          "<td>" +
          (stat.hits || 0) +
          "</td>" +
          "<td>" +
          (stat.rbi || 0) +
          "</td>" +
          "<td>" +
          (stat.baseOnBalls || 0) +
          "</td>" +
          "<td>" +
          (stat.strikeOuts || 0) +
          "</td>" +
          "<td>" +
          (stat.avg || ".000") +
          "</td>" +
          "</tr>";
      });

      html += "</tbody></table></div>";
      container.innerHTML = html;
    } catch (err) {
      container.innerHTML =
        '<div class="empty-state"><div class="empty-state-text">Error loading game log</div></div>';
    }
  }

  // ── Career Tab ───────────────────────────────────
  async function loadCareerTab() {
    var container = document.getElementById("playerContent");
    container.innerHTML =
      '<div class="loading"><div class="loading-spinner"></div></div>';

    try {
      var res = await fetch(
        "https://statsapi.mlb.com/api/v1/people/" +
          playerId +
          "/stats?stats=career&group=hitting",
      );
      var data = await res.json();
      var splits = data.stats?.[0]?.splits || [];

      if (splits.length === 0) {
        container.innerHTML =
          '<div class="empty-state"><div class="empty-state-text">No career data</div></div>';
        return;
      }

      var html = '<div class="section-card"><h3>Career Stats</h3>';
      html +=
        '<table class="standings-table"><thead><tr><th>Season</th><th>Team</th><th>GP</th><th>AVG</th><th>HR</th><th>RBI</th><th>SB</th><th>OPS</th></tr></thead><tbody>';

      splits.forEach(function (s) {
        var stat = s.stat;
        html +=
          "<tr>" +
          "<td>" +
          (s.season || "") +
          "</td>" +
          "<td>" +
          (s.team?.name || "") +
          "</td>" +
          "<td>" +
          (stat.gamesPlayed || 0) +
          "</td>" +
          "<td>" +
          (stat.avg || ".000") +
          "</td>" +
          "<td>" +
          (stat.homeRuns || 0) +
          "</td>" +
          "<td>" +
          (stat.rbi || 0) +
          "</td>" +
          "<td>" +
          (stat.stolenBases || 0) +
          "</td>" +
          "<td>" +
          (stat.ops || ".000") +
          "</td>" +
          "</tr>";
      });

      html += "</tbody></table></div>";
      container.innerHTML = html;
    } catch (err) {
      container.innerHTML =
        '<div class="empty-state"><div class="empty-state-text">Error loading career data</div></div>';
    }
  }

  // ── Tab Switching ────────────────────────────────
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

  // ── Init ─────────────────────────────────────────
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

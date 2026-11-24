/**
 * NHL Team Page - modeled after NHL app style
 */
(function () {
  var SPORT = "nhl";
  var teamId = null;
  var teamData = null;
  var activeTab = "games";

  var teamColors = {
    "Anaheim Ducks": "#F47A38",
    "Arizona Coyotes": "#8C2633",
    "Boston Bruins": "#FFB81C",
    "Buffalo Sabres": "#003087",
    "Calgary Flames": "#C8102E",
    "Carolina Hurricanes": "#CC0000",
    "Chicago Blackhawks": "#CF0A2C",
    "Colorado Avalanche": "#6F263D",
    "Columbus Blue Jackets": "#002654",
    "Dallas Stars": "#006847",
    "Detroit Red Wings": "#CE1126",
    "Edmonton Oilers": "#041E42",
    "Florida Panthers": "#041E42",
    "Los Angeles Kings": "#111111",
    "Minnesota Wild": "#154734",
    "Montreal Canadiens": "#AF1E2D",
    "Nashville Predators": "#FFB81C",
    "New Jersey Devils": "#CE1126",
    "New York Islanders": "#00539B",
    "New York Rangers": "#0038A8",
    "Ottawa Senators": "#C52032",
    "Philadelphia Flyers": "#F74902",
    "Pittsburgh Penguins": "#FFB81C",
    "Seattle Kraken": "#001628",
    "San Jose Sharks": "#006D75",
    "St. Louis Blues": "#002F87",
    "Tampa Bay Lightning": "#002868",
    "Toronto Maple Leafs": "#00205B",
    "Utah Hockey Club": "#6CAEDF",
    "Vancouver Canucks": "#00205B",
    "Vegas Golden Knights": "#B4975A",
    "Washington Capitals": "#041E42",
    "Winnipeg Jets": "#041E42",
  };

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  // ── Load Team Info ───────────────────────────────
  async function loadTeamInfo() {
    var res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/" +
        teamId,
    );
    var data = await res.json();
    teamData = data.team;
    var color = teamColors[teamData.displayName] || "#333333";
    var logo =
      teamData.logos?.[0]?.href ||
      "https://a.espncdn.com/i/teamlogos/nhl/500/scoreboard/" +
        (teamData.abbreviation || "").toLowerCase() +
        ".png";

    var header = document.getElementById("teamHeader");
    header.style.background =
      "linear-gradient(135deg, " + color + ", " + color + "dd)";
    header.style.color = "#fff";
    header.innerHTML =
      '<img src="' +
      logo +
      '" alt="' +
      teamData.displayName +
      '" class="team-header-logo" onerror="this.src=\'/icon.png\'">' +
      '<div class="team-header-info">' +
      "<h1>" +
      teamData.displayName +
      "</h1>" +
      '<div class="team-meta">' +
      (teamData.abbreviation || "") +
      " &bull; " +
      (teamData.location || "") +
      "</div>" +
      "</div>";

    document.title = teamData.displayName + " - NHL - SportsHeart";
  }

  // ── Games Tab ────────────────────────────────────
  async function loadGamesTab() {
    var container = document.getElementById("teamContent");
    container.innerHTML =
      '<div class="loading"><div class="loading-spinner"></div></div>';

    var today = new Date();
    var endDate =
      today.getFullYear() +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");
    var startDate = new Date(today);
    startDate.setDate(today.getDate() - 10);
    startDate =
      startDate.getFullYear() +
      String(startDate.getMonth() + 1).padStart(2, "0") +
      String(startDate.getDate()).padStart(2, "0");

    try {
      var url =
        "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=" +
        startDate +
        "-" +
        endDate;
      var res = await fetch(url);
      var data = await res.json();
      var allGames = data.events || [];
      var games = allGames.filter(function (g) {
        var comp = g.competitions?.[0];
        if (!comp) return false;
        return comp.competitors?.some(function (c) {
          return String(c.team?.id) === String(teamId);
        });
      });

      if (games.length === 0) {
        container.innerHTML =
          '<div class="empty-state"><div class="empty-state-text">No recent games</div></div>';
        return;
      }

      var html = '<div class="section-card"><h3>Recent & Upcoming Games</h3>';
      games.reverse().forEach(function (g) {
        var comp = g.competitions[0];
        var home = comp.competitors.find(function (c) {
          return c.homeAway === "home";
        });
        var away = comp.competitors.find(function (c) {
          return c.homeAway === "away";
        });
        var isLive = g.status?.type?.state === "in";
        var isFinal = g.status?.type?.completed === true;
        var statusBadge = isFinal
          ? '<span class="badge badge-final">FINAL</span>'
          : isLive
            ? '<span class="badge badge-live">LIVE</span>'
            : '<span class="badge badge-upcoming">' +
              new Date(g.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              }) +
              "</span>";

        html +=
          '<div class="game-card' +
          (isLive ? " live" : "") +
          '" style="margin-bottom:8px;cursor:pointer;" onclick="window.location.href=\'scoreboard.html?gameId=' +
          g.id +
          "'\">" +
          '<div class="game-card-header">' +
          statusBadge +
          "</div>" +
          '<div class="game-matchup">' +
          '<div class="game-team"><div class="game-team-name">' +
          (away?.team?.displayName || "Away") +
          "</div>" +
          (isFinal || isLive
            ? '<div class="game-team-score">' + (away?.score || "0") + "</div>"
            : "") +
          "</div>" +
          '<div class="game-info-center">' +
          (isLive
            ? '<div class="game-clock">P' +
              (comp.status?.period || "") +
              " " +
              (comp.status?.displayClock || "") +
              "</div>"
            : isFinal
              ? '<div class="game-period">Final</div>'
              : '<div class="game-time">' +
                new Date(g.date).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                }) +
                "</div>") +
          "</div>" +
          '<div class="game-team"><div class="game-team-name">' +
          (home?.team?.displayName || "Home") +
          "</div>" +
          (isFinal || isLive
            ? '<div class="game-team-score">' + (home?.score || "0") + "</div>"
            : "") +
          "</div>" +
          "</div></div>";
      });
      html += "</div>";
      container.innerHTML = html;
    } catch (err) {
      container.innerHTML =
        '<div class="empty-state"><div class="empty-state-text">Error loading games</div></div>';
    }
  }

  // ── Stats Tab ────────────────────────────────────
  async function loadStatsTab() {
    var container = document.getElementById("teamContent");
    container.innerHTML =
      '<div class="loading"><div class="loading-spinner"></div></div>';

    try {
      var year = new Date().getFullYear();
      var url =
        "https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl/seasons/" +
        year +
        "/types/2/teams/" +
        teamId +
        "/statistics?lang=en&region=us";
      var res = await fetch(url);
      var data = await res.json();

      var html =
        '<div class="section-card"><h3>Team Stats (' +
        year +
        ')</h3><div class="nhl-team-stats-grid">';
      if (data.splits?.categories) {
        data.splits.categories.forEach(function (cat) {
          (cat.stats || []).forEach(function (s) {
            html +=
              '<div class="nhl-stat-card"><div class="nhl-stat-card-label">' +
              (s.displayName || s.name || "") +
              "</div>" +
              '<div class="nhl-stat-card-value">' +
              (s.displayValue || s.value || "0") +
              "</div>" +
              (s.rank
                ? '<div class="nhl-stat-card-rank">#' + s.rank + "</div>"
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

  // ── Roster Tab ───────────────────────────────────
  async function loadRosterTab() {
    var container = document.getElementById("teamContent");
    container.innerHTML =
      '<div class="loading"><div class="loading-spinner"></div></div>';

    try {
      var res = await fetch(
        "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/" +
          teamId +
          "/roster",
      );
      var data = await res.json();
      var athletes = data.athletes || [];

      if (athletes.length === 0) {
        container.innerHTML =
          '<div class="empty-state"><div class="empty-state-text">No roster data</div></div>';
        return;
      }

      var html =
        '<div class="section-card"><h3>Roster (' +
        athletes.length +
        ' players)</h3><div class="games-grid">';
      athletes.forEach(function (a) {
        var headshot = a.headshot?.href || "";
        html +=
          '<div class="card" style="cursor:pointer;text-align:center;padding:12px;" onclick="window.location.href=\'player.html?playerId=' +
          a.id +
          "'\">" +
          (headshot
            ? '<img src="' +
              headshot +
              '" alt="' +
              a.displayName +
              '" style="width:64px;height:64px;border-radius:50%;object-fit:cover;margin-bottom:8px;" onerror="this.style.display=\'none\'">'
            : "") +
          '<div style="font-weight:700;font-size:0.9rem;">' +
          a.displayName +
          "</div>" +
          '<div style="font-size:0.75rem;color:var(--text-tertiary);">#' +
          (a.jersey || "--") +
          " | " +
          (a.position?.abbreviation || "") +
          "</div>" +
          "</div>";
      });
      html += "</div></div>";
      container.innerHTML = html;
    } catch (err) {
      container.innerHTML =
        '<div class="empty-state"><div class="empty-state-text">Error loading roster</div></div>';
    }
  }

  // ── Standings Tab ────────────────────────────────
  async function loadStandingsTab() {
    var container = document.getElementById("teamContent");
    container.innerHTML =
      '<div class="loading"><div class="loading-spinner"></div></div>';

    try {
      var res = await fetch(
        "https://site.web.api.espn.com/apis/v2/sports/hockey/nhl/standings",
      );
      var data = await res.json();
      var children = data.children || [];

      var html = '<div class="standings-conference">';
      children.forEach(function (conf) {
        html +=
          '<div class="standings-league"><h3>' + (conf.name || "") + "</h3>";
        (conf.standings?.entries || []).forEach(function (entry) {
          var isMyTeam = String(entry.team?.id) === String(teamId);
          html +=
            '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-primary);' +
            (isMyTeam ? "background:var(--bg-surface-secondary);" : "") +
            '">' +
            '<span style="font-weight:600;min-width:24px;">' +
            (entry.team?.seed || "") +
            "</span>" +
            '<img src="https://a.espncdn.com/i/teamlogos/nhl/500/scoreboard/' +
            (entry.team?.abbreviation || "").toLowerCase() +
            '.png" style="width:24px;height:24px;" onerror="this.style.display=\'none\'">' +
            '<span style="flex:1;font-weight:600;cursor:pointer;" onclick="window.location.href=\'team-page.html?teamId=' +
            entry.team?.id +
            "'\">" +
            entry.team?.displayName +
            (isMyTeam ? " ⬅" : "") +
            "</span>" +
            "<span>" +
            (entry.stats?.find(function (s) {
              return s.name === "wins";
            })?.displayValue || "0") +
            "</span>" +
            '<span style="margin:0 4px;">-</span>' +
            "<span>" +
            (entry.stats?.find(function (s) {
              return s.name === "losses";
            })?.displayValue || "0") +
            "</span>" +
            '<span style="margin-left:8px;color:var(--text-tertiary);">' +
            (entry.stats?.find(function (s) {
              return s.name === "points";
            })?.displayValue || "0") +
            " pts</span>" +
            "</div>";
        });
        html += "</div>";
      });
      html += "</div>";
      container.innerHTML = html;
    } catch (err) {
      container.innerHTML =
        '<div class="empty-state"><div class="empty-state-text">Error loading standings</div></div>';
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
    if (tab === "games") loadGamesTab();
    else if (tab === "stats") loadStatsTab();
    else if (tab === "roster") loadRosterTab();
    else if (tab === "standings") loadStandingsTab();
  }

  // ── Init ─────────────────────────────────────────
  async function init() {
    teamId = getParam("teamId");
    if (!teamId) {
      document.getElementById("teamContent").innerHTML =
        '<div class="empty-state"><div class="empty-state-text">No team ID provided</div></div>';
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

    await loadTeamInfo();
    loadGamesTab();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

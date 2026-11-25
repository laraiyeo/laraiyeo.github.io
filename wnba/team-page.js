/**
 * WNBA Team Page (same pattern as NBA)
 */
(function () {
  var SPORT = "wnba";
  var teamId = null;
  var teamData = null;
  var activeTab = "games";

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  async function loadTeamInfo() {
    var res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/" +
        teamId,
    );
    var data = await res.json();
    teamData = data.team;
    var color = teamData.color ? "#" + teamData.color : "#ff6b35";
    var logo =
      teamData.logos?.[0]?.href ||
      "https://a.espncdn.com/i/teamlogos/wnba/500/" +
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
    document.title = teamData.displayName + " - WNBA - SportsHeart";
  }

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
        "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=" +
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
        var isLive =
          g.status?.type?.state === "in" ||
          g.status?.type?.description === "In Progress" ||
          g.status?.type?.description === "Halftime";
        var isFinal =
          g.status?.type?.completed === true ||
          g.status?.type?.description === "Final";
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
          '" style="margin-bottom:8px;cursor:pointer;" onclick="window.location.href=\'scoreboard?gameId=' +
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
            ? '<div class="game-clock">Q' +
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

  async function loadStatsTab() {
    var container = document.getElementById("teamContent");
    container.innerHTML =
      '<div class="loading"><div class="loading-spinner"></div></div>';
    try {
      var year = new Date().getFullYear();
      var url =
        "https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/seasons/" +
        year +
        "/types/2/teams/" +
        teamId +
        "/statistics?lang=en&region=us";
      var res = await fetch(url);
      var data = await res.json();
      var html =
        '<div class="section-card"><h3>Team Stats (' +
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

  async function loadRosterTab() {
    var container = document.getElementById("teamContent");
    container.innerHTML =
      '<div class="loading"><div class="loading-spinner"></div></div>';
    try {
      var res = await fetch(
        "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/" +
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
          '<div class="card" style="cursor:pointer;text-align:center;padding:12px;" onclick="window.location.href=\'player?playerId=' +
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

  async function loadStandingsTab() {
    var container = document.getElementById("teamContent");
    container.innerHTML =
      '<div class="loading"><div class="loading-spinner"></div></div>';
    try {
      var res = await fetch(
        "https://site.web.api.espn.com/apis/v2/sports/basketball/wnba/standings",
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
            '<img src="https://a.espncdn.com/i/teamlogos/wnba/500/' +
            (entry.team?.abbreviation || "").toLowerCase() +
            '.png" style="width:24px;height:24px;" onerror="this.style.display=\'none\'">' +
            '<span style="flex:1;font-weight:600;cursor:pointer;" onclick="window.location.href=\'team-page?teamId=' +
            entry.team?.id +
            "'\">" +
            entry.team?.displayName +
            (isMyTeam ? " ⬅" : "") +
            "</span>" +
            "<span>" +
            (entry.stats?.find(function (s) {
              return s.name === "wins";
            })?.displayValue || "0") +
            "-</span>" +
            "<span>" +
            (entry.stats?.find(function (s) {
              return s.name === "losses";
            })?.displayValue || "0") +
            "</span>" +
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

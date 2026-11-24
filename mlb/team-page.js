/**
 * MLB Team Page
 * Modeled after MLB app style with tabs
 */
(function () {
  var SPORT = "mlb";
  var teamId = null;
  var teamData = null;
  var activeTab = "games";

  var teamColors = {
    "Arizona Diamondbacks": "#A71930",
    "Atlanta Braves": "#CE1141",
    "Baltimore Orioles": "#DF4601",
    "Boston Red Sox": "#BD3039",
    "Chicago White Sox": "#27251F",
    "Chicago Cubs": "#0E3386",
    "Cincinnati Reds": "#C6011F",
    "Cleveland Guardians": "#E50022",
    "Colorado Rockies": "#333366",
    "Detroit Tigers": "#0C2340",
    "Houston Astros": "#002D62",
    "Kansas City Royals": "#004687",
    "Los Angeles Angels": "#BA0021",
    "Los Angeles Dodgers": "#005A9C",
    "Miami Marlins": "#00A3E0",
    "Milwaukee Brewers": "#FFC52F",
    "Minnesota Twins": "#002B5C",
    "New York Yankees": "#003087",
    "New York Mets": "#FF5910",
    Athletics: "#EFB21E",
    "Philadelphia Phillies": "#E81828",
    "Pittsburgh Pirates": "#FDB827",
    "San Diego Padres": "#2F241D",
    "San Francisco Giants": "#FD5A1E",
    "Seattle Mariners": "#005C5C",
    "St. Louis Cardinals": "#C41E3A",
    "Tampa Bay Rays": "#092C5C",
    "Texas Rangers": "#003278",
    "Toronto Blue Jays": "#134A8E",
    "Washington Nationals": "#AB0003",
  };

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function getLogoUrl(name) {
    var abbrMap = {
      "Arizona Diamondbacks": "ari",
      "Atlanta Braves": "atl",
      "Baltimore Orioles": "bal",
      "Boston Red Sox": "bos",
      "Chicago White Sox": "cws",
      "Chicago Cubs": "chc",
      "Cincinnati Reds": "cin",
      "Cleveland Guardians": "cle",
      "Colorado Rockies": "col",
      "Detroit Tigers": "det",
      "Houston Astros": "hou",
      "Kansas City Royals": "kc",
      "Los Angeles Angels": "laa",
      "Los Angeles Dodgers": "lad",
      "Miami Marlins": "mia",
      "Milwaukee Brewers": "mil",
      "Minnesota Twins": "min",
      "New York Yankees": "nyy",
      "New York Mets": "nym",
      Athletics: "oak",
      "Philadelphia Phillies": "phi",
      "Pittsburgh Pirates": "pit",
      "San Diego Padres": "sd",
      "San Francisco Giants": "sf",
      "Seattle Mariners": "sea",
      "St. Louis Cardinals": "stl",
      "Tampa Bay Rays": "tb",
      "Texas Rangers": "tex",
      "Toronto Blue Jays": "tor",
      "Washington Nationals": "wsh",
    };
    var abbr = abbrMap[name] || "";
    return (
      "https://a.espncdn.com/combiner/i?img=/i/teamlogos/mlb/500/" +
      abbr +
      ".png"
    );
  }

  // ── Load Team Info ───────────────────────────────
  async function loadTeamInfo() {
    var res = await fetch("https://statsapi.mlb.com/api/v1/teams/" + teamId);
    var data = await res.json();
    teamData = data.teams[0];
    var color = teamColors[teamData.name] || "#333333";
    var logo = getLogoUrl(teamData.name);

    var header = document.getElementById("teamHeader");
    header.style.background =
      "linear-gradient(135deg, " + color + ", " + color + "dd)";
    header.style.color = "#fff";
    header.innerHTML =
      '<img src="' +
      logo +
      '" alt="' +
      teamData.name +
      '" class="team-header-logo" onerror="this.src=\'/icon.png\'">' +
      '<div class="team-header-info">' +
      "<h1>" +
      teamData.name +
      "</h1>" +
      '<div class="team-meta">' +
      (teamData.division?.name || "") +
      " &bull; " +
      (teamData.league?.name || "") +
      "</div>" +
      '<div class="team-meta">' +
      (teamData.venue?.name || "") +
      " &bull; Est. " +
      (teamData.firstYearOfPlay || "") +
      "</div>" +
      "</div>";

    document.title = teamData.name + " - MLB - SportsHeart";
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
      var res = await fetch(
        "https://statsapi.mlb.com/api/v1/schedule?teamId=" +
          teamId +
          "&startDate=" +
          startDate +
          "&endDate=" +
          endDate +
          "&sportId=1&hydrate=linescore,team",
      );
      var data = await res.json();
      var games =
        data.dates?.reduce(function (acc, d) {
          return acc.concat(d.games || []);
        }, []) || [];

      if (games.length === 0) {
        container.innerHTML =
          '<div class="empty-state"><div class="empty-state-text">No recent games</div></div>';
        return;
      }

      var html = '<div class="section-card"><h3>Recent & Upcoming Games</h3>';
      games.reverse().forEach(function (g) {
        var away = g.teams.away.team;
        var home = g.teams.home.team;
        var awayScore = g.teams.away.score || 0;
        var homeScore = g.teams.home.score || 0;
        var isLive = g.status.abstractGameState === "Live";
        var isFinal = g.status.abstractGameState === "Final";
        var statusBadge = isFinal
          ? '<span class="badge badge-final">FINAL</span>'
          : isLive
            ? '<span class="badge badge-live">LIVE</span>'
            : '<span class="badge badge-upcoming">' +
              new Date(g.gameDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              }) +
              "</span>";

        html +=
          '<div class="game-card' +
          (isLive ? " live" : "") +
          '" style="margin-bottom:8px;cursor:pointer;" onclick="window.location.href=\'scoreboard.html?gamePk=' +
          g.gamePk +
          "'\">" +
          '<div class="game-card-header">' +
          statusBadge +
          "</div>" +
          '<div class="game-matchup">' +
          '<div class="game-team">' +
          '<div class="game-team-name">' +
          away.name +
          "</div>" +
          (isFinal || isLive
            ? '<div class="game-team-score">' + awayScore + "</div>"
            : "") +
          "</div>" +
          '<div class="game-info-center">' +
          (isLive
            ? '<div class="game-clock">' +
              (g.linescore?.inningState || "") +
              " " +
              (g.linescore?.currentInning || "") +
              "</div>"
            : isFinal
              ? '<div class="game-period">Final</div>'
              : '<div class="game-time">' +
                new Date(g.gameDate).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                }) +
                "</div>") +
          "</div>" +
          '<div class="game-team">' +
          '<div class="game-team-name">' +
          home.name +
          "</div>" +
          (isFinal || isLive
            ? '<div class="game-team-score">' + homeScore + "</div>"
            : "") +
          "</div>" +
          "</div>" +
          "</div>";
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

    var year = new Date().getFullYear();
    try {
      var hittingRes = await fetch(
        "https://statsapi.mlb.com/api/v1/teams/" +
          teamId +
          "/stats?season=" +
          year +
          "&group=hitting&stats=season&gameType=R",
      );
      var pitchingRes = await fetch(
        "https://statsapi.mlb.com/api/v1/teams/" +
          teamId +
          "/stats?season=" +
          year +
          "&group=pitching&stats=season&gameType=R",
      );
      var hittingData = await hittingRes.json();
      var pitchingData = await pitchingRes.json();

      var html = "";
      if (hittingData.stats?.[0]?.splits?.[0]?.stat) {
        var s = hittingData.stats[0].splits[0].stat;
        html +=
          '<div class="section-card"><h3>Batting Stats (' +
          year +
          ")</h3>" +
          '<div class="player-stats-grid">' +
          statChip("AVG", s.avg || ".000") +
          statChip("HR", s.homeRuns || "0") +
          statChip("RBI", s.rbi || "0") +
          statChip("R", s.runs || "0") +
          statChip("H", s.hits || "0") +
          statChip("SB", s.stolenBases || "0") +
          statChip("OBP", s.obp || ".000") +
          statChip("SLG", s.slg || ".000") +
          statChip("OPS", s.ops || ".000") +
          "</div></div>";
      }
      if (pitchingData.stats?.[0]?.splits?.[0]?.stat) {
        var p = pitchingData.stats[0].splits[0].stat;
        html +=
          '<div class="section-card"><h3>Pitching Stats (' +
          year +
          ")</h3>" +
          '<div class="player-stats-grid">' +
          statChip("ERA", p.era || "0.00") +
          statChip("W", p.wins || "0") +
          statChip("L", p.losses || "0") +
          statChip("SO", p.strikeOuts || "0") +
          statChip("WHIP", p.whip || "0.00") +
          statChip("SV", p.saves || "0") +
          statChip("IP", p.inningsPitched || "0.0") +
          statChip("BAA", p.avg || ".000") +
          "</div></div>";
      }
      container.innerHTML =
        html ||
        '<div class="empty-state"><div class="empty-state-text">No stats available</div></div>';
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

  // ── Roster Tab ───────────────────────────────────
  async function loadRosterTab() {
    var container = document.getElementById("teamContent");
    container.innerHTML =
      '<div class="loading"><div class="loading-spinner"></div></div>';

    try {
      var res = await fetch(
        "https://statsapi.mlb.com/api/v1/teams/" +
          teamId +
          "/roster?season=" +
          new Date().getFullYear(),
      );
      var data = await res.json();
      var roster = data.roster || [];

      if (roster.length === 0) {
        container.innerHTML =
          '<div class="empty-state"><div class="empty-state-text">No roster data</div></div>';
        return;
      }

      var html =
        '<div class="section-card"><h3>Roster (' +
        roster.length +
        ' players)</h3><div class="games-grid">';
      roster.forEach(function (p) {
        var headshot =
          "https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:good/v1/people/" +
          p.person.id +
          "/headshot/67/current";
        html +=
          '<div class="card" style="cursor:pointer;text-align:center;padding:12px;" onclick="window.location.href=\'player.html?playerId=' +
          p.person.id +
          "'\">" +
          '<img src="' +
          headshot +
          '" alt="' +
          p.person.fullName +
          '" style="width:64px;height:64px;border-radius:50%;object-fit:cover;margin-bottom:8px;" onerror="this.style.display=\'none\'">' +
          '<div style="font-weight:700;font-size:0.9rem;">' +
          p.person.fullName +
          "</div>" +
          '<div style="font-size:0.75rem;color:var(--text-tertiary);">#' +
          (p.jerseyNumber || "--") +
          " | " +
          (p.position?.abbreviation || "") +
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
        "https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=" +
          new Date().getFullYear(),
      );
      var data = await res.json();
      var records = data.records || [];

      var html = '<div class="standings-conference">';
      records.forEach(function (league) {
        html +=
          '<div class="standings-league"><h3>' +
          (league.division?.name || league.league?.name || "") +
          "</h3>";
        html +=
          '<table class="standings-table"><thead><tr><th class="team-cell">Team</th><th>W</th><th>L</th><th>PCT</th><th>GB</th></tr></thead><tbody>';

        (league.teamRecords || []).forEach(function (tr) {
          var isMyTeam = String(tr.team.id) === String(teamId);
          html +=
            "<tr" +
            (isMyTeam
              ? ' style="background:var(--bg-surface-secondary);"'
              : "") +
            ">" +
            '<td class="team-cell" style="cursor:pointer;" onclick="window.location.href=\'team-page.html?teamId=' +
            tr.team.id +
            "'\">" +
            '<img src="' +
            getLogoUrl(tr.team.name) +
            '" alt="" onerror="this.style.display=\'none\'">' +
            tr.team.name +
            (isMyTeam ? " ⬅" : "") +
            "</td>" +
            "<td>" +
            tr.wins +
            "</td><td>" +
            tr.losses +
            "</td>" +
            "<td>" +
            tr.winningPercentage +
            "</td><td>" +
            (tr.gamesBack || "-") +
            "</td>" +
            "</tr>";
        });

        html += "</tbody></table></div>";
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

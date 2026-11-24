/**
 * MLB AIO - All Games View
 * Mirrors the app's MLBScoreboardScreen grid layout exactly:
 * - Same API call with all hydrate params
 * - Same data processing (processGameData)
 * - Grid cards with gradients, BSO dots, bases diamond, pitcher info
 * - Live viewer badges
 * - Date picker bar
 */
(function () {
  var SPORT = "mlb";
  var currentDate = null;
  var allGroups = [];
  var pollInterval = null;
  var currentIntervalMs = null;
  var INTERVAL_FAST = 5000;
  var INTERVAL_SLOW = 30000;

  // ── Team colors (mirrors MLBService.teamColors) ──
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

  var teamAbbrMap = {
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

  // ── Date helpers ─────────────────────────────────
  function getMLBDate() {
    var now = new Date();
    var estNow = new Date(
      now.toLocaleString("en-US", { timeZone: "America/New_York" }),
    );
    if (estNow.getHours() < 2) estNow.setDate(estNow.getDate() - 1);
    return (
      estNow.getFullYear() +
      "-" +
      String(estNow.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(estNow.getDate()).padStart(2, "0")
    );
  }

  function toDateStr(d) {
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function getOrdinalSuffix(num) {
    if (num % 100 >= 11 && num % 100 <= 13) return num + "th";
    switch (num % 10) {
      case 1:
        return num + "st";
      case 2:
        return num + "nd";
      case 3:
        return num + "rd";
      default:
        return num + "th";
    }
  }

  function formatRecord(record) {
    if (!record) return "";
    return record.wins + "-" + record.losses;
  }

  function getLogoUrl(teamName, teamAbbr) {
    var abbr = teamAbbrMap[teamName];
    if (!abbr && teamAbbr) abbr = teamAbbr.toLowerCase();
    if (!abbr) return "";
    return (
      "https://a.espncdn.com/combiner/i?img=/i/teamlogos/mlb/500-dark/" +
      abbr +
      ".png"
    );
  }

  function getHeadshotUrl(playerId) {
    if (!playerId) return "";
    return (
      "https://img.mlbstatic.com/mlb-photos/image/upload/w_80,q_auto:good/v1/people/" +
      playerId +
      "/headshot/67/current"
    );
  }

  function getShortPitcherName(fullName) {
    if (!fullName) return "Pitcher";
    var parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return fullName;
    return parts[0][0] + ". " + parts[parts.length - 1];
  }

  function getPitcherSummary(pitcher) {
    if (!pitcher || !pitcher.stats || !pitcher.stats.length) return "";
    var stat = pitcher.stats[pitcher.stats.length - 1];
    return stat && stat.stats && stat.stats.summary ? stat.stats.summary : "";
  }

  // ── Date Picker ──────────────────────────────────
  function buildDatePicker() {
    var bar = document.getElementById("datePickerBar");
    if (!bar) return;
    var today = new Date();
    var dates = [];
    for (var i = -3; i <= 3; i++) {
      var d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d);
    }

    bar.innerHTML = dates
      .map(function (d, idx) {
        var ds = toDateStr(d);
        var isToday = idx === 3;
        var label = isToday
          ? "Today"
          : new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            }).format(d);
        var active = ds === currentDate ? " active" : "";
        return (
          '<button class="date-picker-item' +
          active +
          '" data-date="' +
          ds +
          '">' +
          label +
          "</button>"
        );
      })
      .join("");

    bar.querySelectorAll(".date-picker-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        currentDate = this.dataset.date;
        bar.querySelectorAll(".date-picker-item").forEach(function (b) {
          b.classList.remove("active");
        });
        this.classList.add("active");
        loadGames();
      });
    });
  }

  // ── MLB API Fetch (mirrors MLBService.getScoreboard) ──
  function buildApiUrl(date) {
    var fields =
      "dates,games,linescore,currentInning,isTopInning,offense,first,second,third,balls,strikes,outs,gamePk,gameType,gameDate,status,statusCode,codedGameState,detailedState,reason,teams,away,team,id,name,leagueRecord,wins,losses,probablePitcher,id,fullName,stats,stats,summary,score,home,team,id,name,leagueRecord,wins,losses,score,venue,name,seriesDescription,description";
    // The CORS proxy responds with `Cache-Control: public, max-age=3600`, so the
    // browser would serve a stale schedule for up to an hour. Append a unique
    // cache-buster on every call so each poll actually hits the network.
    return (
      "https://corsproxy.io/?key=02fc2c87&url=https://statsapi.mlb.com/api/v1/schedule?sportId=1" +
      "&date=" +
      date +
      "&hydrate=linescore,probablePitcher,stats" +
      "&fields=" +
      encodeURIComponent(fields) +
      "&_=" +
      Date.now()
    );
  }

  function processGameData(game) {
    var awayTeam = game.teams && game.teams.away;
    var homeTeam = game.teams && game.teams.home;
    var linescore = game.linescore || {};
    var offense = linescore.offense || {};

    var bases = {
      first: !!offense.first,
      second: !!offense.second,
      third: !!offense.third,
    };

    var codedState =
      (game.status && (game.status.codedGameState || game.status.statusCode)) ||
      "";
    var isLive = !["S", "P", "D", "C", "O", "F", "Q", "R", "FM", "DI"].includes(
      String(codedState),
    );
    var isCompleted = ["F", "O", "FT", "D", "C", "Q", "R", "FM", "DI"].includes(
      String(codedState),
    );

    return {
      id: String(game.gamePk),
      date: game.gameDate,
      status: (game.status && game.status.detailedState) || "Unknown",
      statusType: (game.status && game.status.statusCode) || "U",
      reason: (game.status && game.status.reason) || null,
      isCompleted: isCompleted,
      isLive: isLive,
      gameType: game.gameType || "",
      venue: (game.venue && game.venue.name) || "",
      notes: game.seriesDescription || "",
      notes1: game.description || "",
      inning: linescore.currentInning || 0,
      inningState:
        linescore.isTopInning === true
          ? "Top"
          : linescore.isTopInning === false
            ? "Bottom"
            : "",
      balls: linescore.balls || 0,
      strikes: linescore.strikes || 0,
      outs: linescore.outs || 0,
      bases: bases,
      first: bases.first,
      second: bases.second,
      third: bases.third,
      awayTeam: {
        id: awayTeam && awayTeam.team ? String(awayTeam.team.id) : "",
        displayName: awayTeam && awayTeam.team ? awayTeam.team.name : "",
        abbreviation:
          awayTeam && awayTeam.team ? awayTeam.team.abbreviation : "",
        score: awayTeam ? String(awayTeam.score || 0) : "0",
        record: formatRecord(awayTeam && awayTeam.leagueRecord),
        logo: getLogoUrl(
          awayTeam && awayTeam.team ? awayTeam.team.name : "",
          awayTeam && awayTeam.team ? awayTeam.team.abbreviation : "",
        ),
        color:
          teamColors[awayTeam && awayTeam.team ? awayTeam.team.name : ""] ||
          "#333333",
        probablePitcher:
          awayTeam && awayTeam.probablePitcher
            ? {
                id: awayTeam.probablePitcher.id,
                fullName: awayTeam.probablePitcher.fullName || "",
                stats: Array.isArray(awayTeam.probablePitcher.stats)
                  ? awayTeam.probablePitcher.stats
                  : [],
              }
            : null,
      },
      homeTeam: {
        id: homeTeam && homeTeam.team ? String(homeTeam.team.id) : "",
        displayName: homeTeam && homeTeam.team ? homeTeam.team.name : "",
        abbreviation:
          homeTeam && homeTeam.team ? homeTeam.team.abbreviation : "",
        score: homeTeam ? String(homeTeam.score || 0) : "0",
        record: formatRecord(homeTeam && homeTeam.leagueRecord),
        logo: getLogoUrl(
          homeTeam && homeTeam.team ? homeTeam.team.name : "",
          homeTeam && homeTeam.team ? homeTeam.team.abbreviation : "",
        ),
        color:
          teamColors[homeTeam && homeTeam.team ? homeTeam.team.name : ""] ||
          "#333333",
        probablePitcher:
          homeTeam && homeTeam.probablePitcher
            ? {
                id: homeTeam.probablePitcher.id,
                fullName: homeTeam.probablePitcher.fullName || "",
                stats: Array.isArray(homeTeam.probablePitcher.stats)
                  ? homeTeam.probablePitcher.stats
                  : [],
              }
            : null,
      },
    };
  }

  async function fetchMLBGames(date) {
    var url = buildApiUrl(date);
    var res = await fetch(url, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    var data = await res.json();
    var games = [];
    if (data.dates && data.dates.length > 0) {
      data.dates.forEach(function (dateObj) {
        if (dateObj.games && dateObj.games.length > 0) {
          dateObj.games.forEach(function (game) {
            games.push(processGameData(game));
          });
        }
      });
    }
    return games;
  }

  // ── Group by date ────────────────────────────────
  function groupGamesByDate(games) {
    var map = {};
    games.forEach(function (game) {
      var d = new Date(game.date);
      var key = d.toDateString();
      if (!map[key]) {
        map[key] = {
          dateKey: key,
          dateTs: d.getTime(),
          label: formatDateGroupLabel(game.date),
          games: [],
        };
      }
      map[key].games.push(game);
    });
    return Object.values(map).sort(function (a, b) {
      return a.dateTs - b.dateTs;
    });
  }

  function formatDateGroupLabel(dateStr) {
    var date = new Date(dateStr);
    var today = new Date();
    var yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    var tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }

  // ── BSO Dots HTML ────────────────────────────────
  function bsoDots(filled, total, color) {
    var html = '<div class="mlb-bso-row">';
    for (var i = 0; i < total; i++) {
      html +=
        '<span class="mlb-bso-dot' +
        (i < filled ? " filled" : "") +
        '" style="' +
        (i < filled
          ? "background:" +
            color +
            ";border-color:" +
            color +
            ";box-shadow:0 0 3px " +
            color +
            ";"
          : "") +
        '"></span>';
    }
    html += "</div>";
    return html;
  }

  // ── Mini Bases Diamond HTML ──────────────────────
  function miniBasesDiamond(bases) {
    var first = bases && bases.first;
    var second = bases && bases.second;
    var third = bases && bases.third;
    function baseStyle(occ) {
      return occ
        ? "background:var(--accent-primary);border-color:var(--accent-primary);box-shadow:0 0 4px var(--accent-primary);"
        : "background:transparent;border:1px solid var(--border-secondary);";
    }
    return (
      '<div class="mlb-mini-bases">' +
      '<div class="mlb-mini-bases-row"><span class="mlb-mini-base" style="' +
      baseStyle(second) +
      '"></span></div>' +
      '<div class="mlb-mini-bases-row"><span class="mlb-mini-base" style="' +
      baseStyle(third) +
      '"></span><span class="mlb-mini-base" style="' +
      baseStyle(first) +
      '"></span></div>' +
      "</div>"
    );
  }

  // ── Grid Card Builder (mirrors MLBGridCard) ──────
  function buildGridCard(game) {
    var away = game.awayTeam;
    var home = game.homeTeam;
    var awayColor = away.color || "#333333";
    var homeColor = home.color || "#333333";
    var awayLogo = away.logo || "";
    var homeLogo = home.logo || "";
    var awayAbbr = (
      away.abbreviation ||
      teamAbbrMap[away.displayName] ||
      (away.displayName || "AWY").slice(0, 3)
    ).toUpperCase();
    var homeAbbr = (
      home.abbreviation ||
      teamAbbrMap[home.displayName] ||
      (home.displayName || "HME").slice(0, 3)
    ).toUpperCase();
    var isLive = game.isLive;
    var isFinished = game.isCompleted;
    var isScheduled = !isLive && !isFinished;
    var isPostponed = game.status === "Postponed";
    var reason = game.reason || "";

    var awayScore = away.score;
    var homeScore = home.score;
    var awayWins = isFinished && parseInt(awayScore) > parseInt(homeScore);
    var homeWins = isFinished && parseInt(homeScore) > parseInt(awayScore);

    var timeStr = "";
    if (game.date) {
      var d = new Date(game.date);
      timeStr = d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/New_York",
      });
    }

    var gradId = "mg_" + game.id;

    // Status / Time line
    var topHTML = "";
    if (isLive) {
      var arrow =
        game.inningState === "Top"
          ? "▲"
          : game.inningState === "Bottom"
            ? "▼"
            : "";
      topHTML =
        '<span class="mlb-grid-status-live">' +
        arrow +
        " " +
        getOrdinalSuffix(game.inning || 0) +
        "</span>";
    } else if (isFinished) {
      var showInning =
        game.statusType !== "DI" && game.inning && game.inning !== 9;
      topHTML =
        '<span class="mlb-grid-status-text">' +
        (game.status || "Final").slice(0, 9) +
        (showInning ? "/" + game.inning : "") +
        "</span>";
    } else if (isPostponed) {
      topHTML =
        '<span class="mlb-grid-status-text">PPD &middot; <span style="opacity:0.6">' +
        reason +
        "</span></span>";
    } else {
      topHTML = '<span class="mlb-grid-status-time">' + timeStr + "</span>";
    }

    // Away side
    var awaySideHTML = "";
    if (isScheduled) {
      awaySideHTML = awayLogo
        ? '<img src="' +
          awayLogo +
          '" class="mlb-grid-team-logo" onerror="this.style.display=\'none\'">'
        : '<div class="mlb-grid-team-logo-fb" style="background:' +
          awayColor +
          '"><span>' +
          awayAbbr[0] +
          "</span></div>";
    } else {
      awaySideHTML =
        '<div class="mlb-grid-score-cell">' +
        '<span class="mlb-grid-score" style="color:' +
        (awayWins ? "var(--accent-primary)" : "var(--text-primary)") +
        ";font-weight:" +
        (awayWins ? "700" : "400") +
        ";opacity:" +
        (isFinished && !awayWins ? "0.55" : "1") +
        '">' +
        (awayScore || "—") +
        "</span>" +
        (awayLogo
          ? '<img src="' +
            awayLogo +
            '" class="mlb-grid-score-logo" style="opacity:' +
            (isFinished && !awayWins ? "0.55" : "1") +
            '" onerror="this.style.display=\'none\'">'
          : '<div class="mlb-grid-score-logo-fb" style="background:' +
            awayColor +
            ";opacity:" +
            (isFinished && !awayWins ? "0.55" : "1") +
            '"><span>' +
            awayAbbr[0] +
            "</span></div>") +
        "</div>";
    }
    awaySideHTML +=
      '<span class="mlb-grid-team-abbr" style="opacity:' +
      (isFinished && !awayWins ? "0.55" : "1") +
      '">' +
      awayAbbr +
      "</span>";
    if (away.record) {
      awaySideHTML +=
        '<span class="mlb-grid-team-record" style="opacity:' +
        (isFinished && !awayWins ? "0.55" : "1") +
        '">' +
        away.record +
        "</span>";
    }

    // Home side
    var homeSideHTML = "";
    if (isScheduled) {
      homeSideHTML = homeLogo
        ? '<img src="' +
          homeLogo +
          '" class="mlb-grid-team-logo" onerror="this.style.display=\'none\'">'
        : '<div class="mlb-grid-team-logo-fb" style="background:' +
          homeColor +
          '"><span>' +
          homeAbbr[0] +
          "</span></div>";
    } else {
      homeSideHTML =
        '<div class="mlb-grid-score-cell">' +
        '<span class="mlb-grid-score" style="color:' +
        (homeWins ? "var(--accent-primary)" : "var(--text-primary)") +
        ";font-weight:" +
        (homeWins ? "700" : "400") +
        ";opacity:" +
        (isFinished && !homeWins ? "0.55" : "1") +
        '">' +
        (homeScore || "—") +
        "</span>" +
        (homeLogo
          ? '<img src="' +
            homeLogo +
            '" class="mlb-grid-score-logo" style="opacity:' +
            (isFinished && !homeWins ? "0.55" : "1") +
            '" onerror="this.style.display=\'none\'">'
          : '<div class="mlb-grid-score-logo-fb" style="background:' +
            homeColor +
            ";opacity:" +
            (isFinished && !homeWins ? "0.55" : "1") +
            '"><span>' +
            homeAbbr[0] +
            "</span></div>") +
        "</div>";
    }
    homeSideHTML +=
      '<span class="mlb-grid-team-abbr" style="opacity:' +
      (isFinished && !homeWins ? "0.55" : "1") +
      '">' +
      homeAbbr +
      "</span>";
    if (home.record) {
      homeSideHTML +=
        '<span class="mlb-grid-team-record" style="opacity:' +
        (isFinished && !homeWins ? "0.55" : "1") +
        '">' +
        home.record +
        "</span>";
    }

    // Pitcher info for scheduled games
    var awayPitcherHTML = "";
    var homePitcherHTML = "";
    if (isScheduled) {
      var awayP = away.probablePitcher;
      var homeP = home.probablePitcher;
      if (awayP) {
        var summary = getPitcherSummary(awayP);
        awayPitcherHTML =
          '<div class="mlb-grid-pitcher-wrap">' +
          (summary
            ? '<span class="mlb-grid-pitcher-summary">' + summary + "</span>"
            : "") +
          '<img src="' +
          getHeadshotUrl(awayP.id) +
          '" class="mlb-grid-pitcher-headshot" style="border-color:' +
          awayColor +
          '" onerror="this.style.display=\'none\'">' +
          '<span class="mlb-grid-pitcher-name">' +
          getShortPitcherName(awayP.fullName) +
          "</span>" +
          "</div>";
      }
      if (homeP) {
        var hsummary = getPitcherSummary(homeP);
        homePitcherHTML =
          '<div class="mlb-grid-pitcher-wrap">' +
          (hsummary
            ? '<span class="mlb-grid-pitcher-summary">' + hsummary + "</span>"
            : "") +
          '<img src="' +
          getHeadshotUrl(homeP.id) +
          '" class="mlb-grid-pitcher-headshot" style="border-color:' +
          homeColor +
          '" onerror="this.style.display=\'none\'">' +
          '<span class="mlb-grid-pitcher-name">' +
          getShortPitcherName(homeP.fullName) +
          "</span>" +
          "</div>";
      }
    }

    // Footer: venue or BSO + bases
    var footerHTML = "";
    if (isLive) {
      footerHTML =
        '<div class="mlb-grid-footer-live">' +
        '<div class="mlb-grid-bso-stack">' +
        bsoDots(game.balls || 0, 4, "var(--success)") +
        bsoDots(game.strikes || 0, 3, "var(--warning)") +
        bsoDots(game.outs || 0, 3, "var(--error)") +
        "</div>" +
        miniBasesDiamond(game.bases) +
        "</div>";
    } else {
      footerHTML =
        '<span class="mlb-grid-venue">' + (game.venue || "") + "</span>";
    }

    return (
      '<div class="mlb-grid-card" data-game-id="' +
      game.id +
      '" onclick="window.location.href=\'scoreboard.html?gamePk=' +
      game.id +
      "'\">" +
      // Gradient overlay
      '<div class="mlb-grid-card-gradient" style="background:linear-gradient(90deg,' +
      awayColor +
      "33 0%,transparent 30%,transparent 70%," +
      homeColor +
      '33 100%)"></div>' +
      // Top status
      '<div class="mlb-grid-card-top">' +
      topHTML +
      '<div class="mlb-grid-card-badge" id="lt-' +
      game.id +
      '"></div>' +
      "</div>" +
      // Teams row
      '<div class="mlb-grid-teams-row">' +
      '<div class="mlb-grid-team-side">' +
      awaySideHTML +
      (isScheduled ? awayPitcherHTML : "") +
      "</div>" +
      '<div class="mlb-grid-divider"></div>' +
      '<div class="mlb-grid-team-side">' +
      homeSideHTML +
      (isScheduled ? homePitcherHTML : "") +
      "</div>" +
      "</div>" +
      // Footer
      '<div class="mlb-grid-card-footer">' +
      footerHTML +
      "</div>" +
      "</div>"
    );
  }

  // ── Group Header ─────────────────────────────────
  function buildGroupHeader(group) {
    return (
      '<div class="mlb-grid-group-header">' +
      '<div class="mlb-grid-group-bubble">' +
      '<img src="/assets/mlb.png" class="mlb-grid-group-logo" onerror="this.style.display=\'none\'">' +
      '<span class="mlb-grid-group-name">' +
      group.label +
      "</span>" +
      '<span class="mlb-grid-group-count">' +
      group.games.length +
      "</span>" +
      "</div>" +
      "</div>"
    );
  }

  // ── Load & Display ───────────────────────────────
  var lastGridHtml = null;
  var hasLoadedOnce = false;

  // Only touch the DOM when the markup actually changed. Polling every few
  // seconds used to wipe and rebuild the grid even when nothing had changed,
  // which reloaded every logo/headshot and showed up as a visible flicker.
  function renderGrid(grid, html) {
    if (lastGridHtml === html) return false;
    lastGridHtml = html;
    grid.querySelectorAll(".live-tracker-badge").forEach(function (b) {
      if (typeof b.destroy === "function") b.destroy();
    });
    grid.innerHTML = html;
    return true;
  }

  async function loadGames() {
    var grid = document.getElementById("mlbGrid");
    if (!grid) return;
    if (!hasLoadedOnce)
      grid.innerHTML =
        '<div class="loading"><div class="loading-spinner"></div></div>';

    try {
      var games = await fetchMLBGames(currentDate);
      hasLoadedOnce = true;

      if (games.length === 0) {
        renderGrid(
          grid,
          '<div class="empty-state"><div class="empty-state-icon">⚾</div><div class="empty-state-text">No games scheduled for this date</div></div>',
        );
        schedulePolling([]);
        return;
      }

      allGroups = groupGamesByDate(games);

      // Sort games within each group: live → scheduled → finished
      allGroups.forEach(function (group) {
        group.games.sort(function (a, b) {
          var order = { live: 0, scheduled: 1, finished: 2 };
          function getState(g) {
            return g.isLive ? "live" : g.isCompleted ? "finished" : "scheduled";
          }
          var diff = order[getState(a)] - order[getState(b)];
          if (diff !== 0) return diff;
          return new Date(a.date) - new Date(b.date);
        });
      });

      var html = "";
      allGroups.forEach(function (group) {
        html += buildGroupHeader(group);
        html += '<div class="mlb-grid-cards-row">';
        group.games.forEach(function (game) {
          html += buildGridCard(game);
        });
        html += "</div>";
      });

      var changed = renderGrid(grid, html);
      if (changed) {
        // Attach live viewer badges to ALL games with status info
        games.forEach(function (g) {
          var el = document.getElementById("lt-" + g.id);
          if (el && typeof createLiveTrackerBadge === "function") {
            el.appendChild(createLiveTrackerBadge(SPORT, g.id, g));
          }
        });
      }

      schedulePolling(allGroups);
    } catch (err) {
      console.error("MLB load error:", err);
      renderGrid(
        grid,
        '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Error loading games</div></div>',
      );
    }
  }

  // ── Smart Polling (mirrors app's getPollingInterval) ──
  function schedulePolling(groups) {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }

    var allGames = [];
    groups.forEach(function (g) {
      allGames = allGames.concat(g.games);
    });

    if (allGames.length === 0) return;

    var hasLive = allGames.some(function (g) {
      return g.isLive;
    });
    var now = Date.now();
    var hasSoon = allGames.some(function (g) {
      if (g.isLive || g.isCompleted) return false;
      if (!g.date) return false;
      var msUntil = new Date(g.date).getTime() - now;
      return msUntil >= 0 && msUntil <= 5 * 60 * 1000;
    });

    var desired = hasLive || hasSoon ? INTERVAL_FAST : INTERVAL_SLOW;
    currentIntervalMs = desired;
    pollInterval = setInterval(loadGames, desired);
  }

  // ── Init ─────────────────────────────────────────
  function init() {
    currentDate = getMLBDate();
    buildDatePicker();
    loadGames();

    var authContainer = document.getElementById("auth-button-container");
    if (authContainer && typeof createAuthButton === "function") {
      authContainer.appendChild(createAuthButton());
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("beforeunload", function () {
    if (pollInterval) clearInterval(pollInterval);
    if (typeof LiveTrackerViewer !== "undefined") LiveTrackerViewer.stopAll();
  });
})();

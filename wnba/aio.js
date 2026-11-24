/**
 * WNBA AIO - All Games View
 * Mirrors app's grid pattern with team colors, gradients, quarter+clock
 */
(function () {
  var SPORT = "wnba";
  var currentDate = null;
  var pollInterval = null;
  var INTERVAL_FAST = 5000;
  var INTERVAL_SLOW = 30000;

  function getTodayStr() {
    var now = new Date();
    return (
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0")
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

  // ── Color helpers (mirrors app's getSmartTeamColors) ──
  function parseHexColor(hex) {
    if (!hex || typeof hex !== "string") return null;
    var raw = hex.trim().replace("#", "");
    if (raw.length !== 3 && raw.length !== 6) return null;
    var expanded =
      raw.length === 3
        ? raw
            .split("")
            .map(function (ch) {
              return ch + ch;
            })
            .join("")
        : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
    return {
      r: parseInt(expanded.slice(0, 2), 16),
      g: parseInt(expanded.slice(2, 4), 16),
      b: parseInt(expanded.slice(4, 6), 16),
    };
  }

  function areColorsSimilar(colorA, colorB) {
    var a = parseHexColor(colorA);
    var b = parseHexColor(colorB);
    if (!a || !b) return false;
    var dr = a.r - b.r,
      dg = a.g - b.g,
      db = a.b - b.b;
    return Math.sqrt(dr * dr + dg * dg + db * db) <= 60;
  }

  function getSmartTeamColors(home, away, fallback) {
    var homePrimary = home.color || null;
    var homeSecondary = home.alternateColor || null;
    var awayPrimary = away.color || null;
    var awaySecondary = away.alternateColor || null;
    var homeColor = homePrimary || homeSecondary || fallback;
    var awayColor = awayPrimary || awaySecondary || fallback;
    if (!areColorsSimilar(homePrimary, awayPrimary)) {
      return { homeColor: homeColor, awayColor: awayColor };
    }
    return { homeColor: homeColor, awayColor: awaySecondary || awayColor };
  }

  // ── Status / time helpers ──
  function formatLocalTime(dateString) {
    try {
      var d = new Date(dateString);
      var time = d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      var parts = time.split(" ");
      return { time: parts[0], ampm: parts[1] || "" };
    } catch (e) {
      return { time: "", ampm: "" };
    }
  }

  function getPeriodText(period) {
    if (period === 1) return "1st";
    if (period === 2) return "2nd";
    if (period === 3) return "3rd";
    if (period === 4) return "4th";
    if (period === 5) return "OT";
    return period - 4 + "OT";
  }

  function getLiveStatusLine(game) {
    var clock = game.clock || "";
    var period = getPeriodText(game.period || 1);
    if (game.status && /halftime/i.test(game.status)) return "Halftime";
    if (clock) return (clock === "0.0" ? "End" : clock) + " - " + period;
    return "Q" + (game.period || 1);
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

  function buildGroupHeader(group) {
    return (
      '<div class="mlb-grid-group-header">' +
      '<div class="mlb-grid-group-bubble">' +
      '<img src="/assets/wnba.png" class="mlb-grid-group-logo" onerror="this.style.display=\'none\'">' +
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

  function buildDatePicker() {
    var bar = document.getElementById("datePickerBar");
    if (!bar) return;
    var today = new Date(),
      dates = [];
    for (var i = -3; i <= 3; i++) {
      var d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d);
    }
    bar.innerHTML = dates
      .map(function (d, idx) {
        var ds = toDateStr(d);
        return (
          '<button class="date-picker-item' +
          (ds === currentDate ? " active" : "") +
          '" data-date="' +
          ds +
          '">' +
          (idx === 3
            ? "Today"
            : new Intl.DateTimeFormat("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              }).format(d)) +
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

  async function fetchGames(date) {
    var url =
      "https://r.jina.ai/https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=" +
      date.replace(/-/g, "");
    var res = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
    var text = await res.text();
    var jsonStart = text.indexOf("{");
    var jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("No JSON found in response");
    }
    var data = JSON.parse(text.substring(jsonStart, jsonEnd + 1));
    return (data.events || []).map(function (g) {
      var comp = g.competitions?.[0] || {};
      var home =
        comp.competitors?.find(function (c) {
          return c.homeAway === "home";
        }) || {};
      var away =
        comp.competitors?.find(function (c) {
          return c.homeAway === "away";
        }) || {};
      var st = g.status?.type || {};
      return {
        id: g.id,
        date: g.date,
        isLive:
          st.state === "in" ||
          st.description === "In Progress" ||
          st.description === "Halftime" ||
          st.description === "End of Period",
        isCompleted: st.completed === true || st.description === "Final",
        status: st.description || "Scheduled",
        period: comp.status?.period || 0,
        clock: comp.status?.displayClock || "",
        isHalftime: st.description === "Halftime",
        venue: comp.venue?.fullName || "",
        awayTeam: {
          id: away.team?.id,
          displayName: away.team?.displayName || away.team?.name || "",
          abbreviation: away.team?.abbreviation || "",
          score: away.score || "0",
          record: away.records?.[0]?.summary || "",
          logo:
            "https://a.espncdn.com/combiner/i?img=/i/teamlogos/wnba/500-dark/scoreboard/" +
            (away.team?.abbreviation || "").toLowerCase() +
            ".png&w=200&h=200",
          color: away.team?.color ? "#" + away.team.color : "#ff6b35",
          alternateColor: away.team?.alternateColor
            ? "#" + away.team.alternateColor
            : null,
        },
        homeTeam: {
          id: home.team?.id,
          displayName: home.team?.displayName || home.team?.name || "",
          abbreviation: home.team?.abbreviation || "",
          score: home.score || "0",
          record: home.records?.[0]?.summary || "",
          logo:
            "https://a.espncdn.com/combiner/i?img=/i/teamlogos/wnba/500-dark/scoreboard/" +
            (home.team?.abbreviation || "").toLowerCase() +
            ".png&w=200&h=200",
          color: home.team?.color ? "#" + home.team.color : "#ff6b35",
          alternateColor: home.team?.alternateColor
            ? "#" + home.team.alternateColor
            : null,
        },
      };
    });
  }

  function buildGridCard(game) {
    var away = game.awayTeam,
      home = game.homeTeam;
    var colors = getSmartTeamColors(home, away, "#ff6b35");
    var awayColor = colors.awayColor;
    var homeColor = colors.homeColor;
    var isLive = game.isLive,
      isFinished = game.isCompleted,
      isScheduled = !isLive && !isFinished;
    var awayWins = isFinished && parseInt(away.score) > parseInt(home.score);
    var homeWins = isFinished && parseInt(home.score) > parseInt(away.score);
    var awayAbbr = (away.abbreviation || "AWY").toUpperCase();
    var homeAbbr = (home.abbreviation || "HME").toUpperCase();
    var awayLogo = away.logo || "";
    var homeLogo = home.logo || "";
    var awayRecord = away.record || "";
    var homeRecord = home.record || "";
    var t = formatLocalTime(game.date);

    var statusLine = "";
    var statusLine2 = "";
    if (isLive) {
      statusLine = getLiveStatusLine(game);
    } else if (isFinished) {
      statusLine2 = "Final";
    } else {
      statusLine = t.time;
      statusLine2 = t.ampm;
    }

    var topHTML =
      '<span class="mlb-grid-status-' +
      (isLive ? "live" : isFinished ? "text" : "time") +
      '">' +
      statusLine +
      (statusLine2
        ? '<span style="font-weight:500;color:var(--text-secondary)"> ' +
          statusLine2 +
          "</span>"
        : "") +
      "</span>";

    function teamSide(t, isWinner, isLoser, logo, abbr, record, color) {
      var opacity = isFinished && isLoser ? "0.55" : "1";
      var html = "";
      if (isScheduled) {
        html = logo
          ? '<img src="' +
            logo +
            '" class="mlb-grid-team-logo" onerror="this.style.display=\'none\'">'
          : '<div class="mlb-grid-team-logo-fb" style="background:' +
            color +
            '"><span>' +
            abbr[0] +
            "</span></div>";
      } else {
        html =
          '<div class="mlb-grid-score-cell">' +
          '<span class="mlb-grid-score" style="color:' +
          (isWinner ? "var(--accent-primary)" : "var(--text-primary)") +
          ";font-weight:" +
          (isWinner ? "700" : "400") +
          ";opacity:" +
          opacity +
          '">' +
          (t.score || "—") +
          "</span>" +
          (logo
            ? '<img src="' +
              logo +
              '" class="mlb-grid-score-logo" style="opacity:' +
              opacity +
              '" onerror="this.style.display=\'none\'">'
            : "") +
          "</div>";
      }
      html +=
        '<span class="mlb-grid-team-abbr" style="opacity:' +
        opacity +
        '">' +
        abbr +
        "</span>";
      if (record) {
        html +=
          '<span class="mlb-grid-team-record" style="opacity:' +
          opacity +
          '">' +
          record +
          "</span>";
      }
      return html;
    }

    return (
      '<div class="mlb-grid-card" data-game-id="' +
      game.id +
      '" onclick="window.location.href=\'scoreboard.html?gameId=' +
      game.id +
      "'\">" +
      '<div class="mlb-grid-card-gradient" style="background:linear-gradient(90deg,' +
      awayColor +
      "33 0%,transparent 30%,transparent 70%," +
      homeColor +
      '33 100%)"></div>' +
      '<div class="mlb-grid-card-top">' +
      topHTML +
      '<div class="mlb-grid-card-badge" id="lt-' +
      game.id +
      '"></div>' +
      "</div>" +
      '<div class="mlb-grid-teams-row">' +
      '<div class="mlb-grid-team-side">' +
      teamSide(
        away,
        awayWins,
        isFinished && !awayWins,
        awayLogo,
        awayAbbr,
        awayRecord,
        awayColor,
      ) +
      "</div>" +
      '<div class="mlb-grid-divider"></div>' +
      '<div class="mlb-grid-team-side">' +
      teamSide(
        home,
        homeWins,
        isFinished && !homeWins,
        homeLogo,
        homeAbbr,
        homeRecord,
        homeColor,
      ) +
      "</div>" +
      "</div>" +
      '<div class="mlb-grid-card-footer"><span class="mlb-grid-venue">' +
      (game.venue || "") +
      "</span></div>" +
      "</div>"
    );
  }

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
      var games = await fetchGames(currentDate);
      hasLoadedOnce = true;
      if (games.length === 0) {
        renderGrid(
          grid,
          '<div class="empty-state"><div class="empty-state-icon">🏀</div><div class="empty-state-text">No games scheduled for this date</div></div>',
        );
        schedulePolling([]);
        return;
      }
      var groups = groupGamesByDate(games);
      groups.forEach(function (group) {
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
      groups.forEach(function (group) {
        html += buildGroupHeader(group);
        html += '<div class="mlb-grid-cards-row">';
        group.games.forEach(function (game) {
          html += buildGridCard(game);
        });
        html += "</div>";
      });
      var changed = renderGrid(grid, html);
      if (changed) {
        games.forEach(function (g) {
          var el = document.getElementById("lt-" + g.id);
          if (el && typeof createLiveTrackerBadge === "function")
            el.appendChild(createLiveTrackerBadge(SPORT, g.id, g));
        });
      }
      schedulePolling(groups);
    } catch (err) {
      renderGrid(
        grid,
        '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Error loading games</div></div>',
      );
    }
  }

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
    pollInterval = setInterval(
      loadGames,
      hasLive || hasSoon ? INTERVAL_FAST : INTERVAL_SLOW,
    );
  }

  function init() {
    currentDate = getTodayStr();
    buildDatePicker();
    loadGames();
    var c = document.getElementById("auth-button-container");
    if (c && typeof createAuthButton === "function")
      c.appendChild(createAuthButton());
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
  window.addEventListener("beforeunload", function () {
    if (pollInterval) clearInterval(pollInterval);
    if (typeof LiveTrackerViewer !== "undefined") LiveTrackerViewer.stopAll();
  });
})();

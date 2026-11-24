// ─── NFL Scoreboard ───────────────────────────────────────────────────────────
// Mirrors the app's GameDetailsScreen: NHL-style header (venue row, team sides
// with score-beside-logo, possession badge, status center, down & distance),
// sticky mini header, 5-tab split view (Main / Drives / Away / Home / Stats),
// player modal and live streaming. No copy/share cards.
// Data source: ESPN summary API + ESPN core drives API
// Pattern follows mlb/scoreboard.js (render guard, tab mutual exclusion,
// split-view collapse, quiet polling, LiveTrackerViewer).

(function () {
  "use strict";

  const POLL_LIVE_MS = 5000;
  const POLL_IDLE_MS = 30000;
  const DRIVES_BASE =
    "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events";

  let gameId = null;
  let gameData = null; // ESPN summary JSON
  let drivesData = null; // resolved drives (teams + plays)
  let pollTimer = null;
  // Persist resolved team $refs across polls so each team is fetched once.
  const teamRefCache = new Map();
  let leftTab = "Main";
  let rightTab = "Drives";
  let splitViewActive = false;
  let selectedDriveIdx = null; // index within reversed (newest-first) list
  let expandedPlayId = null;
  let teamFilter = { away: "", home: "" }; // boxscore category filter per side

  // ─── Streaming state ────────────────────────────────────────────────────────
  let streamModalVisible = false;
  let currentStreamType = "";
  let availableStreams = {};
  let streamUrl = "";

  const $ = (s) => document.querySelector(s);
  const sbHeader = $("#sbHeader");
  const sbStickyHeader = $("#sbStickyHeader");
  const sbLeftTabs = $("#sbLeftTabs");
  const sbRightTabs = $("#sbRightTabs");
  const sbLeftBody = $("#sbLeftBody");
  const sbRightBody = $("#sbRightBody");

  // ─── Render guard ───────────────────────────────────────────────────────────
  // Polling re-renders every panel every few seconds. Rewriting innerHTML with
  // identical markup reloads every headshot/logo (flicker), so skip the write.
  const lastPanelHtml = new WeakMap();
  function setPanelHtml(el, html) {
    if (!el) return false;
    if (lastPanelHtml.get(el) === html) return false;
    lastPanelHtml.set(el, html);
    el.innerHTML = html;
    return true;
  }

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COLORS — same contrast-aware logic as the app's resolveMatchColors
  // ═══════════════════════════════════════════════════════════════════════════
  const NFL_TEAM_ID_TO_ABBR = {
    2: "BUF",
    15: "MIA",
    17: "NE",
    20: "NYJ",
    33: "BAL",
    4: "CIN",
    5: "CLE",
    23: "PIT",
    34: "HOU",
    11: "IND",
    30: "JAX",
    10: "TEN",
    7: "DEN",
    12: "KC",
    13: "LV",
    24: "LAC",
    6: "DAL",
    19: "NYG",
    21: "PHI",
    28: "WAS",
    3: "CHI",
    8: "DET",
    9: "GB",
    16: "MIN",
    1: "ATL",
    29: "CAR",
    18: "NO",
    27: "TB",
    22: "ARI",
    14: "LAR",
    25: "SF",
    26: "SEA",
  };

  const FALLBACK_ABBR_COLORS = {
    ARI: "#A71930",
    ATL: "#A71930",
    BAL: "#241773",
    BUF: "#00338D",
    CAR: "#0085CA",
    CHI: "#0B162A",
    CIN: "#FB4F14",
    CLE: "#311D00",
    DAL: "#003594",
    DEN: "#FB4F14",
    DET: "#0076B6",
    GB: "#203731",
    HOU: "#03202F",
    IND: "#002C5F",
    JAX: "#006778",
    KC: "#E31837",
    LAC: "#0080C6",
    LAR: "#003594",
    LV: "#000000",
    MIA: "#008E97",
    MIN: "#4F2683",
    NE: "#002244",
    NO: "#D3BC8D",
    NYG: "#0B2265",
    NYJ: "#125740",
    PHI: "#004C54",
    PIT: "#FFB612",
    SEA: "#69BE28",
    SF: "#AA0000",
    TB: "#D50A0A",
    TEN: "#4B92DB",
    WAS: "#5A1414",
  };

  function parseHexColor(hex) {
    if (!hex || typeof hex !== "string") return null;
    const raw = hex.trim().replace("#", "");
    const expanded =
      raw.length === 3
        ? raw
            .split("")
            .map((ch) => ch + ch)
            .join("")
        : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
    return {
      r: parseInt(expanded.slice(0, 2), 16),
      g: parseInt(expanded.slice(2, 4), 16),
      b: parseInt(expanded.slice(4, 6), 16),
    };
  }

  function areColorsSimilar(a, b) {
    const ca = parseHexColor(a);
    const cb = parseHexColor(b);
    if (!ca || !cb) return false;
    const dr = ca.r - cb.r;
    const dg = ca.g - cb.g;
    const db = ca.b - cb.b;
    return Math.sqrt(dr * dr + dg * dg + db * db) <= 60;
  }

  function resolveMatchColors({
    homePrimary,
    homeSecondary,
    awayPrimary,
    awaySecondary,
    homeFallback,
    awayFallback,
  }) {
    const homeColors = [homePrimary, homeSecondary, homeFallback].filter(
      Boolean,
    );
    const awayColors = [awayPrimary, awaySecondary, awayFallback].filter(
      Boolean,
    );
    for (const homeColor of homeColors) {
      for (const awayColor of awayColors) {
        if (!areColorsSimilar(homeColor, awayColor)) {
          return { homeColor, awayColor };
        }
      }
    }
    return { homeColor: homeColors[0], awayColor: awayColors[0] };
  }

  function getTeamAbbr(team) {
    if (!team) return "";
    if (team.abbreviation) return String(team.abbreviation).toUpperCase();
    return NFL_TEAM_ID_TO_ABBR[team.id] || "";
  }

  function getTeamLogoUrl(team) {
    if (!team) return "";
    if (team.logos && team.logos.length)
      return team.logos[0].href || team.logos[1]?.href || "";
    return team.logo || "";
  }

  function headshotUrl(id) {
    return `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${id}.png&w=150`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GAME DATA ACCESSORS
  // ═══════════════════════════════════════════════════════════════════════════
  function getCompetition() {
    return (
      gameData?.header?.competitions?.[0] || gameData?.competitions?.[0] || null
    );
  }

  function getTeams() {
    const comp = getCompetition();
    if (!comp) return { home: null, away: null };
    return {
      home: comp.competitors?.find((c) => c.homeAway === "home") || null,
      away: comp.competitors?.find((c) => c.homeAway === "away") || null,
    };
  }

  function getStatus() {
    const comp = getCompetition();
    return comp?.status || gameData?.header?.status || null;
  }

  function isScheduled() {
    return (getStatus()?.type?.description || "")
      .toLowerCase()
      .includes("scheduled");
  }

  function isFinal() {
    return !!getStatus()?.type?.completed;
  }

  function isLive() {
    const s = getStatus();
    if (isScheduled() || isFinal()) return false;
    return (
      s?.type?.state === "in" ||
      s?.type?.description === "In Progress" ||
      (s?.period && s.period > 0)
    );
  }

  // Contrast-aware pair for the two game teams (app's getSmartTeamColors)
  function getMatchColors() {
    const { home, away } = getTeams();
    return resolveMatchColors({
      homePrimary: home?.team?.color ? `#${home.team.color}` : null,
      homeSecondary: home?.team?.alternateColor
        ? `#${home.team.alternateColor}`
        : null,
      awayPrimary: away?.team?.color ? `#${away.team.color}` : null,
      awaySecondary: away?.team?.alternateColor
        ? `#${away.team.alternateColor}`
        : null,
      homeFallback: "#013369",
      awayFallback: "#666666",
    });
  }

  // Smart color for any team object (game teams use the resolved pair so the
  // two sides never clash; other teams — drives/last-5 — use their own color).
  function getSmartColor(team) {
    if (!team) return "#1a1a2e";
    const { home, away } = getTeams();
    const pair = getMatchColors();
    if (home && String(home.team?.id) === String(team.id))
      return pair.homeColor;
    if (away && String(away.team?.id) === String(team.id))
      return pair.awayColor;
    if (team.color) return `#${team.color}`;
    return FALLBACK_ABBR_COLORS[getTeamAbbr(team)] || "#1a1a2e";
  }

  function statusLine1() {
    const s = getStatus();
    if (isFinal()) return "Final";
    if (s?.type?.description === "Halftime") return "Halftime";
    if (s?.period && s.period > 0) {
      return s.period <= 4
        ? `${["1st", "2nd", "3rd", "4th"][s.period - 1]} QTR`
        : `OT ${s.period - 4}`;
    }
    return s?.type?.description || s?.type?.name || "Scheduled";
  }

  function statusLine2() {
    const s = getStatus();
    const comp = getCompetition();
    if (isLive() && s?.displayClock && s?.type?.description !== "Halftime") {
      return s.displayClock;
    }
    const d = new Date(comp?.date);
    if (isNaN(d.getTime())) return "";
    return (
      d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }) +
      " · " +
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    );
  }

  function getCurrentDrive() {
    if (!Array.isArray(drivesData)) return null;
    return (
      drivesData.find((d) => !d.end?.text && d.result !== "End of Game") || null
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ═══════════════════════════════════════════════════════════════════════════
  // ESPN endpoints are read through the r.jina.ai proxy (same as nfl/aio.js)
  // so the request goes through. It returns the payload as text, so pull the
  // JSON object out the same way aio does. Falls back to a direct fetch if
  // the proxy errors out.
  async function fetchJson(url) {
    try {
      const res = await fetch("https://r.jina.ai/" + url, {
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      if (!res.ok) throw new Error(`proxy HTTP ${res.status}`);
      const text = await res.text();
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start === -1 || end === -1 || end < start)
        throw new Error("No JSON found in proxy response");
      return JSON.parse(text.substring(start, end + 1));
    } catch (proxyErr) {
      const res = await fetch(url, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
  }

  async function resolveTeamRef(ref, cache) {
    const url = String(ref).replace(/^http:/i, "https:");
    // Cache the in-flight promise (not just the resolved value) so concurrent
    // drives referencing the same team share a single request instead of each
    // firing its own fetch. The cache is module-level so it also persists
    // across polls.
    if (cache.has(url)) return cache.get(url);
    const promise = (async () => {
      try {
        const t = await fetchJson(url);
        return {
          ...t,
          logo: t.logos?.[1]?.href || t.logos?.[0]?.href || "",
        };
      } catch (e) {
        console.warn("NFL scoreboard team resolve failed:", e);
        return null;
      }
    })();
    cache.set(url, promise);
    return promise;
  }

  // Mirrors NFLService.getDrivesComplete: resolve drive teams, endTeam and
  // play-level team $refs (inline plays.items — no extra play fetches).
  async function fetchDrives() {
    try {
      const url = `${DRIVES_BASE}/${gameId}/competitions/${gameId}/drives?lang=en&region=us&limit=50`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const items = json.items || [];
      const cache = teamRefCache;

      const resolved = await Promise.all(
        items.map(async (drive) => {
          try {
            const team = drive.team?.$ref
              ? await resolveTeamRef(drive.team.$ref, cache)
              : null;
            const endTeam = drive.endTeam?.$ref
              ? await resolveTeamRef(drive.endTeam.$ref, cache)
              : null;
            const plays = (drive.plays?.items || []).map((play) => {
              if (play.team?.$ref) {
                const m = play.team.$ref.match(/\/teams\/(\d+)/);
                if (m) {
                  if (team && String(team.id) === m[1])
                    return { ...play, team };
                  if (endTeam && String(endTeam.id) === m[1])
                    return { ...play, team: endTeam };
                }
              }
              return play;
            });
            return { ...drive, team, endTeam, plays };
          } catch (e) {
            return { ...drive, team: null, endTeam: null, plays: [] };
          }
        }),
      );
      drivesData = resolved;
    } catch (err) {
      console.error("NFL scoreboard drives fetch error:", err);
    }
  }

  async function fetchGameData() {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`;
      gameData = await fetchJson(url);

      // Drives power the Main-tab live field, down & distance and Drives tab.
      if (!isScheduled()) {
        await fetchDrives();
      } else {
        drivesData = null;
      }

      renderAll();
      schedulePoll();
    } catch (err) {
      console.error("NFL scoreboard fetch error:", err);
      sbHeader.innerHTML =
        '<div class="sb-error">Failed to load game data. <button onclick="location.reload()">Retry</button></div>';
    }
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    // Pause background fetching while the stream modal is open (matches app).
    if (streamModalVisible) return;
    pollTimer = setTimeout(
      fetchGameDataQuiet,
      isLive() ? POLL_LIVE_MS : POLL_IDLE_MS,
    );
  }

  // Quiet poll: same data path as the initial load (r.jina.ai proxy + drives),
  // but re-renders without touching the tab bars so the DOM doesn't flicker.
  async function fetchGameDataQuiet() {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`;
      gameData = await fetchJson(url);

      // Keep drives fresh — they power the live field, down & distance and
      // the Drives tab.
      if (!isScheduled()) {
        await fetchDrives();
      } else {
        drivesData = null;
      }

      renderAllQuiet();
      schedulePoll();
    } catch (err) {
      console.error("NFL scoreboard quiet fetch error:", err);
      // Always reschedule so one transient failure doesn't kill polling.
      schedulePoll();
    }
  }

  function renderAll() {
    renderHeader();
    renderTabBars();
    renderPanel("left");
    renderPanel("right");
  }

  // Non-flickering update: re-render header + panels, not the tab bars.
  function renderAllQuiet() {
    renderHeader();
    // Keep the sticky mini header in sync when the user is scrolled down.
    if (sbStickyHeader.style.display === "flex") renderStickyHeader();
    renderPanel("left");
    renderPanel("right");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER — mirrors app NflHeaderGradient + NflTeamSide + NflStatusBadge
  // ═══════════════════════════════════════════════════════════════════════════
  function renderHeader() {
    const { home, away } = getTeams();
    if (!home || !away) {
      if (!sbHeader.querySelector(".sb-error"))
        sbHeader.innerHTML = '<div class="sb-error">No game data</div>';
      return;
    }

    const pair = getMatchColors();
    const awayColor = pair.awayColor;
    const homeColor = pair.homeColor;
    const live = isLive();
    const final = isFinal();
    const pre = isScheduled();
    const showScores = !pre;

    const awayScore = away.score ?? "0";
    const homeScore = home.score ?? "0";
    const awayWon = final && Number(awayScore) > Number(homeScore);
    const homeWon = final && Number(homeScore) > Number(awayScore);

    const awayAbbr = getTeamAbbr(away.team) || "AWY";
    const homeAbbr = getTeamAbbr(home.team) || "HME";
    const awayLogo = getTeamLogoUrl(away.team);
    const homeLogo = getTeamLogoUrl(home.team);
    const awayName =
      away.team?.shortDisplayName ||
      away.team?.displayName ||
      away.team?.name ||
      "Away";
    const homeName =
      home.team?.shortDisplayName ||
      home.team?.displayName ||
      home.team?.name ||
      "Home";
    const awayRecord = away.record?.[0]?.summary || "";
    const homeRecord = home.record?.[0]?.summary || "";

    // Possession from the current drive
    const currentDrive = getCurrentDrive();
    const possId = currentDrive?.team?.id;
    const showPossession =
      live && getStatus()?.type?.description !== "Halftime" && possId != null;
    const awayPoss = showPossession && String(possId) === String(away.team?.id);
    const homePoss = showPossession && String(possId) === String(home.team?.id);

    const comp = getCompetition();
    const venue =
      gameData?.gameInfo?.venue?.fullName || comp?.venue?.fullName || "";
    const gameNote = gameData?.header?.gameNote || null;
    const headerText =
      gameData?.season?.type !== 3
        ? `${
            gameData?.header?.season?.type === 1
              ? "Preseason"
              : gameData?.header?.season?.type === 2
                ? "Regular Season"
                : ""
          } Week ${
            (gameData?.header?.week || 0) +
            (gameData?.header?.season?.type === 1 ? -1 : 0)
          }`.trim()
        : null;
    const leagueLine = [venue || "NFL", gameNote || headerText || "NFL"]
      .filter(Boolean)
      .join(" · ");

    const teamSide = (
      team,
      score,
      side,
      color,
      logo,
      abbr,
      name,
      record,
      isWinner,
      isLoser,
      hasPoss,
    ) => {
      const scoreEl = showScores
        ? `<span class="sb-team-score" style="color:${final && isLoser ? "var(--text-secondary)" : "var(--text-primary)"};font-weight:${isWinner || live ? "800" : "400"}">${esc(score)}</span>`
        : "";
      const logoEl = logo
        ? `<img src="${esc(logo)}" class="sb-team-logo" alt="${esc(name)}" onerror="this.parentElement.innerHTML='<div class=\\'sb-team-logo-fallback\\' style=\\'background:${color}\\'>${abbr[0]}</div>'">`
        : `<div class="sb-team-logo-fallback" style="background:${color}">${abbr[0]}</div>`;
      const possBadge = hasPoss
        ? `<span class="sb-poss-badge sb-poss-${side}">🏈</span>`
        : "";
      const logoScoreRow =
        side === "home"
          ? `${scoreEl}<div class="sb-team-logo-wrap">${logoEl}${possBadge}</div>`
          : `<div class="sb-team-logo-wrap">${logoEl}${possBadge}</div>${scoreEl}`;
      return `
        <div class="sb-team-col">
          <a href="team-page.html?id=${esc(team.team?.id)}" class="sb-team-link" style="text-decoration:none">
            <div class="sb-logo-score-row">${logoScoreRow}</div>
            <div class="sb-team-name" style="opacity:${final && !isWinner ? "0.55" : "1"}">${esc(name)}</div>
            ${record ? `<div class="sb-team-record" style="opacity:${final && !isWinner ? "0.55" : "1"}">${esc(record)}</div>` : ""}
          </a>
        </div>`;
    };

    // Down & distance from the latest play of the current drive
    let downDistHtml = "";
    if (live && currentDrive?.plays?.length) {
      const sorted = [...currentDrive.plays].sort(
        (a, b) =>
          (parseInt(b.sequenceNumber) || 0) - (parseInt(a.sequenceNumber) || 0),
      );
      const latest = sorted[0];
      const dd =
        latest?.end?.shortDownDistanceText ||
        latest?.start?.shortDownDistanceText ||
        "";
      const possText = latest?.end?.possessionText || "";
      if (dd) {
        downDistHtml = `
          <div class="sb-down-row">
            <span class="sb-down-text">${esc(dd)}</span>
            ${possText ? `<span class="sb-poss-label">${esc(possText)}</span>` : ""}
          </div>`;
      }
    }

    const streamBtn =
      live && typeof Auth !== "undefined" && Auth.isLoggedIn
        ? `<button class="sb-stream-btn" id="sbStreamOpen" style="margin-top:8px"><span class="sb-stream-dot"></span> Stream</button>`
        : "";

    setPanelHtml(
      sbHeader,
      `
      <div class="sb-header-inner">
        <div class="sb-header-gradient" style="background:linear-gradient(90deg,${awayColor}33 0%,transparent 40%,transparent 60%,${homeColor}33 100%)"></div>
        <div class="sb-league-row">${esc(leagueLine)}</div>
        <div class="sb-teams-row">
          ${teamSide(away, awayScore, "away", awayColor, awayLogo, awayAbbr, awayName, awayRecord, awayWon, homeWon, awayPoss)}
          <div class="sb-status-center">
            <div class="sb-status-top" style="color:${live ? "var(--accent-success, #27ae60)" : "var(--text-secondary)"}">${esc(statusLine1())}</div>
            ${statusLine2() ? `<div class="sb-status-bottom">${esc(statusLine2())}</div>` : ""}
            ${streamBtn}
          </div>
          ${teamSide(home, homeScore, "home", homeColor, homeLogo, homeAbbr, homeName, homeRecord, homeWon, awayWon, homePoss)}
        </div>
        ${downDistHtml}
      </div>`,
    );
  }

  function renderStickyHeader() {
    const { home, away } = getTeams();
    if (!home || !away) return;
    const pair = getMatchColors();
    const final = isFinal();
    const pre = isScheduled();
    const live = isLive();
    const awayScore = away.score ?? "0";
    const homeScore = home.score ?? "0";
    const awayWon = final && Number(awayScore) > Number(homeScore);
    const homeWon = final && Number(homeScore) > Number(awayScore);
    const awayAbbr = getTeamAbbr(away.team) || "AWY";
    const homeAbbr = getTeamAbbr(home.team) || "HME";
    const awayLogo = getTeamLogoUrl(away.team);
    const homeLogo = getTeamLogoUrl(home.team);

    sbStickyHeader.innerHTML = `
      <div class="sb-sticky-inner">
        <div class="sb-sticky-gradient" style="background:linear-gradient(90deg,${pair.awayColor}33,transparent 30%,transparent 70%,${pair.homeColor}33)"></div>
        <div class="sb-sticky-side">
          ${awayLogo ? `<img src="${esc(awayLogo)}" class="sb-sticky-logo" onerror="this.style.display='none'">` : ""}
          <span class="sb-sticky-abbr" style="opacity:${final && !awayWon ? "0.55" : "1"}">${awayAbbr}</span>
          ${!pre ? `<span class="sb-sticky-score" style="font-weight:${awayWon || live ? "800" : "400"};color:${final && !awayWon ? "var(--text-secondary)" : "var(--text-primary)"}">${awayScore}</span>` : ""}
        </div>
        <div class="sb-sticky-status-block">
          <div class="sb-sticky-status-line">${esc(statusLine1())}</div>
          ${statusLine2() ? `<div class="sb-sticky-status-sub">${esc(statusLine2())}</div>` : ""}
        </div>
        <div class="sb-sticky-side sb-sticky-right">
          ${!pre ? `<span class="sb-sticky-score" style="font-weight:${homeWon || live ? "800" : "400"};color:${final && !homeWon ? "var(--text-secondary)" : "var(--text-primary)"}">${homeScore}</span>` : ""}
          <span class="sb-sticky-abbr" style="opacity:${final && !homeWon ? "0.55" : "1"}">${homeAbbr}</span>
          ${homeLogo ? `<img src="${esc(homeLogo)}" class="sb-sticky-logo" onerror="this.style.display='none'">` : ""}
        </div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB BARS — app tabs: Main / Drives / Away / Home / Stats
  // Same tab cannot be open on both sides (MLB pattern)
  // ═══════════════════════════════════════════════════════════════════════════
  function renderTabBars() {
    const sched = isScheduled();
    const allTabs = sched
      ? ["Main", "Away", "Home", "Stats"]
      : ["Main", "Drives", "Away", "Home", "Stats"];
    if (splitViewActive) {
      renderOneTabBar(sbLeftTabs, "left", allTabs, true);
      return;
    }
    renderOneTabBar(sbLeftTabs, "left", allTabs);
    renderOneTabBar(sbRightTabs, "right", allTabs);
  }

  function renderOneTabBar(container, side, allTabs, noDisable) {
    const currentTab = side === "left" ? leftTab : rightTab;
    const tabsHtml = allTabs
      .map((t) => {
        const disabled = noDisable
          ? false
          : (side === "left" && t === rightTab) ||
            (side === "right" && t === leftTab);
        return `<button class="sb-tab${t === currentTab ? " active" : ""}${disabled ? " disabled" : ""}" data-tab="${t}"${disabled ? " disabled" : ""}>${t}</button>`;
      })
      .join("");

    if (!setPanelHtml(container, tabsHtml)) return;

    container.querySelectorAll(".sb-tab:not(.disabled)").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        if (side === "left") leftTab = tab;
        else rightTab = tab;
        // Reset drive selection when the Drives tab is (re)opened so the
        // newest drive is selected.
        if (tab === "Drives") {
          selectedDriveIdx = null;
          expandedPlayId = null;
        }
        renderTabBars(); // re-render both to update disabled states
        renderPanel(side);
      });
    });
  }

  function renderPanel(side) {
    const tab = side === "left" ? leftTab : rightTab;
    const body = side === "left" ? sbLeftBody : sbRightBody;
    if (!gameData) return;

    switch (tab) {
      case "Main":
        renderMainPanel(body);
        break;
      case "Drives":
        renderDrivesPanel(body);
        break;
      case "Away":
        renderTeamPanel(body, "away");
        break;
      case "Home":
        renderTeamPanel(body, "home");
        break;
      case "Stats":
        renderStatsPanel(body);
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN PANEL — live field, linescore, scoring summary, officials, weather,
  // last-5 games, venue (app renderMainContent, no copy cards)
  // ═══════════════════════════════════════════════════════════════════════════
  function renderMainPanel(body) {
    const { home, away } = getTeams();
    if (!home || !away) {
      setPanelHtml(body, '<div class="sb-empty">No game data</div>');
      return;
    }
    const pair = getMatchColors();
    const awayColor = pair.awayColor;
    const homeColor = pair.homeColor;
    const live = isLive();

    let html = "";

    // ── Live Field (latest play) ──
    if (live) html += renderLiveFieldCard();

    // ── Linescore ──
    html += renderLinescoreCard(away, home, awayColor, homeColor);

    // ── Scoring Summary ──
    html += renderScoringCard(away, home, awayColor, homeColor);

    // ── Officials ──
    html += renderOfficialsCard();

    // ── Weather ──
    html += renderWeatherCard();

    // ── Last 5 Games ──
    html += renderLast5Cards();

    // ── Venue ──
    html += renderVenueCard();

    setPanelHtml(
      body,
      html || '<div class="sb-empty">No game information available</div>',
    );
  }

  // ── Live Field: latest play across all drives (app Main tab) ────────────────
  function collectAllPlays() {
    const all = [];
    if (Array.isArray(drivesData)) {
      for (const drive of drivesData) {
        if (drive.plays?.length) {
          for (const play of drive.plays) all.push({ play, drive });
        }
      }
    }
    all.sort(
      (a, b) =>
        (parseInt(a.play.sequenceNumber) || 0) -
        (parseInt(b.play.sequenceNumber) || 0),
    );
    return all;
  }

  function renderLiveFieldCard() {
    const allPlays = collectAllPlays();
    const entry = allPlays[allPlays.length - 1];
    if (!entry) {
      return `<div class="sb-card"><div class="sb-card-header"><span class="sb-card-title">Live Field</span></div><div class="sb-empty">No plays available</div></div>`;
    }
    const { play, drive } = entry;
    const awayAbbr = getTeamAbbr(getTeams().away?.team) || "AWY";
    const homeAbbr = getTeamAbbr(getTeams().home?.team) || "HME";

    const playTeam = play.team || drive.team;
    const playTeamColor = getSmartColor(playTeam);
    const playTeamAbbr = getTeamAbbr(playTeam);

    const playTypeId = play.type?.id;
    const playTypeText = play.type?.text || play.type?.abbreviation || "";
    const playText = play.text || play.shortText || "";
    const ddText =
      play.start?.downDistanceText || play.end?.downDistanceText || "";
    const period = play.period?.number || 0;
    const clock = play.clock?.displayValue || "";
    const periodLabel =
      period <= 4 ? `Q${period}` : period > 4 ? `OT${period - 4}` : "";
    const isScoring = !!play.scoringPlay;

    // Field yard selection (scoring plays with same-team drive use drive yards)
    const driveTeamAbbr = getTeamAbbr(drive?.team);
    const driveEndAbbr = getTeamAbbr(drive?.endTeam);
    const driveHasEndTeam = driveEndAbbr && driveEndAbbr !== driveTeamAbbr;
    const useDriveYards =
      isScoring && !driveHasEndTeam && drive?.end?.yardLine != null;
    const startYard = useDriveYards
      ? drive.start?.yardLine
      : play.start?.yardLine;
    const endYard = useDriveYards
      ? drive.end?.yardLine
      : (play.end?.yardLine ?? play.start?.yardLine);

    // Enrich participants ($ref → boxscore athletes, same as the app)
    const enriched = enrichParticipants(play, drive);
    let participants = [...enriched].sort(
      (a, b) => (a.order || 0) - (b.order || 0),
    );

    const specialTypes = ["53", "26", "36", "52", "29", "80", "7", "32", "34"];
    const isSpecial = specialTypes.includes(playTypeId);
    const isRush = playTypeId === "5";
    const isPass = playTypeId === "24";
    const scoringLike =
      isScoring || (play.text || "").toLowerCase().includes("touchdown");

    let mainPlayer = null;
    if (scoringLike) {
      mainPlayer = participants.find(
        (p) =>
          p.type === "scorer" || p.type === "rusher" || p.type === "receiver",
      );
    }
    if (!mainPlayer) {
      if (isSpecial && participants.length > 1) {
        mainPlayer = participants.find(
          (p) =>
            p.type === "recoverer" ||
            p.type === "returner" ||
            p.type === "sackedBy" ||
            p.type === "passDefender",
        );
      } else if (isRush) {
        mainPlayer = participants.find((p) => p.type === "rusher");
      } else if (isPass) {
        mainPlayer = participants.find((p) => p.type === "receiver");
      }
      if (!mainPlayer) mainPlayer = participants[0];
    }
    if (mainPlayer && (isSpecial || isRush || isPass || scoringLike)) {
      participants = [
        mainPlayer,
        ...participants.filter(
          (p) => p.athlete?.displayName !== mainPlayer?.athlete?.displayName,
        ),
      ];
    }

    const athlete = mainPlayer?.athlete;
    const mainStats = mainPlayer
      ? getPlayPlayerStats(mainPlayer, playTypeId, mainPlayer.type)
      : [];
    const meta = [
      playTeamAbbr,
      athlete?.jersey ? `#${athlete.jersey}` : "",
      (mainPlayer?.type || athlete?.position?.abbreviation || "").toUpperCase(),
    ]
      .filter(Boolean)
      .join(" · ");

    const playerRow = athlete
      ? `
        <div class="sb-lf-player">
          <div class="sb-lf-player-info">
            <div class="sb-lf-player-name">${esc(
              athlete.displayName ||
                athlete.fullName ||
                `${athlete.firstName || ""} ${athlete.lastName || ""}`.trim() ||
                "Unknown",
            )}</div>
            ${meta ? `<div class="sb-lf-player-meta">${esc(meta)}</div>` : ""}
            ${
              mainStats.length
                ? `<div class="sb-lf-stats">${mainStats
                    .map((s) => {
                      const parts = String(s).split(" ");
                      const val = parts.shift() || "—";
                      const lbl = parts.join(" ");
                      return `<div class="sb-lf-stat"><div class="sb-lf-stat-val">${esc(val)}</div><div class="sb-lf-stat-lbl">${esc(lbl || "STAT")}</div></div>`;
                    })
                    .join("")}</div>`
                : ""
            }
          </div>
          <div class="sb-lf-headshot" style="border-color:${playTeamColor};background:${playTeamColor}66">
            <img src="${esc(headshotUrl(athlete.id))}" alt="" onerror="this.style.display='none'">
            <span class="sb-lf-hs-badge" style="border-color:${playTeamColor}">
              <img src="${esc(getTeamLogoUrl(playTeam || drive?.team))}" alt="" onerror="this.style.display='none'">
            </span>
          </div>
        </div>`
      : `<div class="sb-lf-none">No player tagged for this play</div>`;

    return `
      <div class="sb-card sb-field-card">
        <div class="sb-card-header"><span class="sb-card-title">Live Field</span></div>
        <div class="sb-field-body">
          ${fieldSvg(playTeamColor, startYard, endYard, play)}
          <div class="sb-lf-playinfo">
            <div class="sb-lf-playinfo-top">
              <span class="sb-lf-playtype" style="color:${isScoring ? playTeamColor : "var(--text-secondary)"}">${esc(playTypeText)}</span>
              <span class="sb-lf-playclock">${esc(periodLabel)} ${esc(clock)}</span>
            </div>
            <div class="sb-lf-playtext">${esc(playText)}</div>
            ${
              ddText || play.awayScore !== undefined
                ? `<div class="sb-lf-playinfo-bottom">
                    ${ddText ? `<span class="sb-lf-dd">${esc(ddText)}</span>` : "<span></span>"}
                    ${play.awayScore !== undefined ? `<span class="sb-lf-score">${awayAbbr} ${play.awayScore} - ${play.homeScore} ${homeAbbr}</span>` : ""}
                  </div>`
                : ""
            }
          </div>
          <div class="sb-lf-players" style="--pc:${playTeamColor}">
            <div class="sb-lf-players-grad" style="background:linear-gradient(90deg,${playTeamColor}38,transparent 70%)"></div>
            <div class="sb-lf-players-head">
              <span style="color:${playTeamColor}">${esc(
                (
                  playTeam?.displayName ||
                  playTeam?.name ||
                  playTeamAbbr ||
                  ""
                ).toUpperCase(),
              )}</span>
              <span>${playTeamAbbr === awayAbbr ? "AWAY" : "HOME"}</span>
            </div>
            ${playerRow}
          </div>
        </div>
      </div>`;
  }

  // Resolve play participants from $ref using boxscore athletes (app logic)
  function enrichParticipants(play, drive) {
    const out = [];
    if (!play?.participants?.length) return out;
    const findInBoxscore = (athleteId) => {
      const teams = gameData?.boxscore?.players || [];
      for (const teamData of teams) {
        for (const cat of teamData.statistics || []) {
          for (const a of cat.athletes || []) {
            const athlete = a.athlete;
            if (
              athlete &&
              (athlete.id === athleteId ||
                String(athlete.id) === String(athleteId))
            ) {
              return athlete;
            }
          }
        }
      }
      return null;
    };

    for (const p of play.participants) {
      if (p.athlete && typeof p.athlete === "object" && p.athlete.displayName) {
        out.push({ ...p, team: p.team || drive?.team });
        continue;
      }
      if (p.athlete && p.athlete.$ref) {
        const m = p.athlete.$ref.match(/\/athletes\/(\d+)/);
        if (m) {
          const found = findInBoxscore(m[1]);
          if (found) {
            out.push({
              ...p,
              athlete: { ...found, id: m[1] },
              team: p.team || drive?.team,
            });
          }
        }
      }
    }
    return out;
  }

  // Play-type aware boxscore stat extraction (app getPlayPlayerStats)
  function getPlayPlayerStats(player, playTypeId, participantType) {
    if (!gameData?.boxscore?.players || !player?.athlete?.id) return [];
    const box = {};
    for (const teamData of gameData.boxscore.players) {
      for (const cat of teamData.statistics || []) {
        for (const a of cat.athletes || []) {
          if (
            a.athlete &&
            (a.athlete.id === player.athlete.id ||
              String(a.athlete.id) === String(player.athlete.id))
          ) {
            box[cat.name] = a.stats || [];
          }
        }
      }
    }
    if (!Object.keys(box).length) return [];

    const stats = [];
    const t = String(playTypeId);
    if (t === "26" || t === "36") {
      if (participantType === "passer") {
        const p = box.passing || [];
        if (p[1]) stats.push(`${p[1]} yds`);
        if (p[4]) stats.push(`${p[4]} INT`);
      } else if (participantType === "passDefender") {
        const d = box.interceptions || [];
        if (d[0]) stats.push(`${d[0]} INT`);
        if (d[1]) stats.push(`${d[1]} INT yds`);
      } else if (participantType === "returner") {
        const r = box.receiving || [];
        if (r[5]) stats.push(`${r[5]} tgt`);
        if (r[1]) stats.push(`${r[1]} yds`);
      } else if (
        participantType === "tackler" ||
        participantType === "assistedBy"
      ) {
        const d = box.defensive || [];
        if (d[0]) stats.push(`${d[0]} tkl`);
      }
    } else if (t === "53") {
      if (participantType === "returner") {
        const r = box.kickReturns || [];
        if (r[0]) stats.push(`${r[0]} ret`);
        if (r[1]) stats.push(`${r[1]} yds`);
      } else if (
        participantType === "tackler" ||
        participantType === "assistedBy"
      ) {
        const d = box.defensive || [];
        if (d[0]) stats.push(`${d[0]} tkl`);
      }
    } else if (t === "32") {
      if (participantType === "returner" || participantType === "scorer") {
        const r = box.kickReturns || [];
        if (r[0]) stats.push(`${r[0]} ret`);
        if (r[1]) stats.push(`${r[1]} yds`);
        if (r[4]) stats.push(`${r[4]} TD`);
      } else if (
        participantType === "patScorer" ||
        participantType === "kicker"
      ) {
        const k = box.kicking || [];
        if (k[3]) stats.push(`${k[3]} XP`);
      }
    } else if (t === "52" || t === "34") {
      if (participantType === "returner") {
        const r = box.puntReturns || [];
        if (r[0]) stats.push(`${r[0]} ret`);
        if (r[1]) stats.push(`${r[1]} yds`);
      } else if (
        participantType === "tackler" ||
        participantType === "assistedBy"
      ) {
        const d = box.defensive || [];
        if (d[0]) stats.push(`${d[0]} tkl`);
      } else if (participantType === "punter") {
        const p = box.punting || [];
        if (p[0]) stats.push(`${p[0]} punts`);
        if (p[1]) stats.push(`${p[1]} yds`);
      } else if (
        participantType === "patScorer" ||
        participantType === "kicker"
      ) {
        const k = box.kicking || [];
        if (k[3]) stats.push(`${k[3]} XP`);
      }
    } else if (t === "29" || t === "80") {
      if (
        participantType === "fumbler" ||
        participantType === "rusher" ||
        participantType === "passer"
      ) {
        const f = box.fumbles || [];
        if (f[0]) stats.push(`${f[0]} fum`);
      } else if (participantType === "recoverer") {
        const f = box.fumbles || [];
        if (f[2]) stats.push(`${f[2]} rec`);
      } else if (
        participantType === "tackler" ||
        participantType === "assistedBy" ||
        participantType === "forcedBy"
      ) {
        const d = box.defensive || [];
        if (d[0]) stats.push(`${d[0]} tkl`);
      }
    } else if (t === "7") {
      if (participantType === "passer") {
        const p = box.passing || [];
        if (p[5]) stats.push(`${p[5]} sck`);
        if (p[1]) stats.push(`${p[1]} yds`);
      } else if (
        participantType === "sackedBy" ||
        participantType === "tackler" ||
        participantType === "assistedBy"
      ) {
        const d = box.defensive || [];
        if (d[2]) stats.push(`${d[2]} sck`);
        if (d[0]) stats.push(`${d[0]} tkl`);
      }
    } else if (t === "59") {
      if (participantType === "kicker") {
        const k = box.kicking || [];
        if (k[0]) stats.push(`${k[0]} FG`);
        if (k[1]) stats.push(`${k[1]}%`);
      }
    } else {
      if (participantType === "rusher") {
        const r = box.rushing || [];
        if (r[0]) stats.push(`${r[0]} att`);
        if (r[1]) stats.push(`${r[1]} yds`);
        if (r[3]) stats.push(`${r[3]} TD`);
      } else if (participantType === "passer") {
        const p = box.passing || [];
        if (p[0]) stats.push(`${p[0]} c/att`);
        if (p[1]) stats.push(`${p[1]} yds`);
        if (p[3]) stats.push(`${p[3]} TD`);
      } else if (participantType === "receiver") {
        const r = box.receiving || [];
        if (r[0]) stats.push(`${r[0]} rec`);
        if (r[1]) stats.push(`${r[1]} yds`);
        if (r[3]) stats.push(`${r[3]} TD`);
      } else if (
        participantType === "assistedBy" ||
        participantType === "tackler"
      ) {
        const d = box.defensive || [];
        if (d[0]) stats.push(`${d[0]} tkl`);
      } else if (participantType === "passDefender") {
        const d = box.defensive || [];
        if (d[4]) stats.push(`${d[4]} PD`);
      } else if (participantType === "kicker") {
        const k = box.kicking || [];
        if (k[3]) stats.push(`${k[3]} XP`);
      } else if (participantType === "punter") {
        const p = box.punting || [];
        if (p[0]) stats.push(`${p[0]} punts`);
        if (p[1]) stats.push(`${p[1]} yds`);
      }
    }
    return stats;
  }

  // ── Field SVG (same geometry as the app's NflPlayFieldMini) ────────────────
  function fieldSvg(teamColor, startYard, endYard, play) {
    const c = teamColor || "#888888";
    const W = 300;
    const H = 130;
    const inL = 30; // interior left (10%)
    const inW = 240; // interior width (80%)

    const xOfInteriorPct = (pct) => inL + (pct / 100) * inW;

    let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="sb-field-svg">`;
    // End zones
    s += `<rect x="0" y="0" width="30" height="${H}" fill="${c}" opacity="0.65"/>`;
    s += `<rect x="${W - 30}" y="0" width="30" height="${H}" fill="${c}" opacity="0.65"/>`;
    s += `<text x="15" y="70" text-anchor="middle" fill="#fff" font-size="7" font-weight="800">NFL</text>`;
    s += `<text x="${W - 15}" y="70" text-anchor="middle" fill="#fff" font-size="7" font-weight="800">NFL</text>`;

    // Yard markers + labels (marker at 10..90% of interior)
    const yardLabels = [10, 20, 30, 40, 50, 40, 30, 20, 10];
    for (let i = 0; i < 9; i++) {
      const x = xOfInteriorPct(10 + i * 10);
      s += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#fff" stroke-width="1" opacity="0.45"/>`;
      s += `<line x1="${x - 2}" y1="${H * 0.15}" x2="${x + 2}" y2="${H * 0.15}" stroke="#fff" stroke-width="1.5"/>`;
      s += `<line x1="${x - 2}" y1="${H * 0.85}" x2="${x + 2}" y2="${H * 0.85}" stroke="#fff" stroke-width="1.5"/>`;
      s += `<text x="${x}" y="12" text-anchor="middle" fill="#fff" font-size="8" font-weight="800">${yardLabels[i]}</text>`;
      s += `<text x="${x}" y="${H - 5}" text-anchor="middle" fill="#fff" font-size="8" font-weight="800" transform="rotate(180 ${x} ${H - 9})">${yardLabels[i]}</text>`;
    }

    // Hash marks
    for (let i = 1; i < 100; i++) {
      const x = inL + (i / 100) * inW;
      s += `<line x1="${x}" y1="0" x2="${x}" y2="3" stroke="#fff" stroke-width="1" opacity="0.35"/>`;
      s += `<line x1="${x}" y1="${H - 3}" x2="${x}" y2="${H}" stroke="#fff" stroke-width="1" opacity="0.35"/>`;
    }

    // Midfield line
    s += `<line x1="${inL + inW / 2}" y1="0" x2="${inL + inW / 2}" y2="${H}" stroke="#fff" stroke-width="2"/>`;

    // Drive/play gradient
    if (startYard != null && endYard != null) {
      const startPos = 100 - startYard;
      const endPos = 100 - endYard;
      const min = Math.min(startPos, endPos);
      const max = Math.max(startPos, endPos);
      const x1 = xOfInteriorPct(min);
      const x2 = xOfInteriorPct(max);
      const width = Math.max(0, x2 - x1);
      const startIsLeft = startPos <= endPos;
      const gid = `fldg-${Math.round(startYard)}-${Math.round(endYard)}`;
      if (width > 0) {
        s += `<defs><linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="0%">`;
        s += startIsLeft
          ? `<stop offset="0%" stop-color="${c}" stop-opacity="0.35"/><stop offset="100%" stop-color="${c}" stop-opacity="0.95"/>`
          : `<stop offset="0%" stop-color="${c}" stop-opacity="0.95"/><stop offset="100%" stop-color="${c}" stop-opacity="0.35"/>`;
        s += `</linearGradient></defs>`;
        s += `<rect x="${x1}" y="0" width="${width}" height="${H}" fill="url(#${gid})"/>`;
      }
      s += `<line x1="${x1}" y1="0" x2="${x1}" y2="${H}" stroke="${c}" stroke-width="1.5"/>`;
      if (width > 0)
        s += `<line x1="${x2}" y1="0" x2="${x2}" y2="${H}" stroke="${c}" stroke-width="1.5"/>`;
    }

    // First-down marker (yellow) — same skip/parse rules as the app
    const fdPct = firstDownMarkerPct(play, startYard);
    if (fdPct != null) {
      const x = xOfInteriorPct(fdPct);
      s += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#FFD700" stroke-width="2" opacity="0.85"/>`;
    }

    s += `</svg>`;
    return s;
  }

  function firstDownMarkerPct(play, startYard) {
    if (startYard == null) return null;
    const typeText = (
      play?.type?.text ||
      play?.type?.abbreviation ||
      ""
    ).toLowerCase();
    const descText = (play?.text || play?.shortText || "").toLowerCase();
    const skip = [
      "kickoff",
      "touchdown",
      "official timeout",
      "punt",
      "extra point",
      "field goal",
      "end of",
      "two-point",
    ];
    if (skip.some((t) => typeText.includes(t) || descText.includes(t)))
      return null;

    const dd =
      play?.start?.downDistanceText || play?.end?.downDistanceText || "";
    const m = dd.match(/&\s*(.+)/);
    if (!m) return null;
    const distStr = m[1].trim().toLowerCase();
    if (distStr === "goal") return null;
    let distance;
    if (distStr === "inches") distance = 1;
    else {
      distance = parseInt(distStr, 10);
      if (isNaN(distance) || distance <= 0) return null;
    }

    const yardsToEndzone =
      play?.start?.yardsToEndzone ?? play?.end?.yardsToEndzone;
    let goingRight;
    if (yardsToEndzone != null) {
      const distToFar = Math.abs(yardsToEndzone - (100 - startYard));
      const distToNear = Math.abs(yardsToEndzone - startYard);
      goingRight = distToFar <= distToNear;
    } else {
      goingRight = startYard <= 50;
    }
    const firstDownYard = goingRight
      ? startYard + distance
      : startYard - distance;
    if (firstDownYard < 0 || firstDownYard > 100) return null;
    return 100 - firstDownYard;
  }

  // ── Linescore ──────────────────────────────────────────────────────────────
  function renderLinescoreCard(away, home, awayColor, homeColor) {
    const awayLS = away?.linescores || [];
    const homeLS = home?.linescores || [];
    if (!awayLS.length && !homeLS.length) return "";

    const maxPeriods = Math.max(awayLS.length, homeLS.length, 4);
    const labels = [];
    for (let i = 0; i < maxPeriods; i++) {
      labels.push(i < 4 ? String(i + 1) : `OT${i - 3}`);
    }
    const awayAbbr = getTeamAbbr(away.team) || "AWY";
    const homeAbbr = getTeamAbbr(home.team) || "HME";

    return `
      <div class="sb-linescore">
        <div class="sb-ls-grid">
          <div class="sb-ls-col sb-ls-label-col">
            <div class="sb-ls-cell sb-ls-head"></div>
            <div class="sb-ls-cell" style="border-bottom:2px solid ${awayColor}"><span class="sb-ls-abbr">${awayAbbr}</span></div>
            <div class="sb-ls-cell" style="border-bottom:2px solid ${homeColor}"><span class="sb-ls-abbr">${homeAbbr}</span></div>
          </div>
          <div class="sb-ls-scroll">
            ${labels
              .map(
                (label, i) => `
              <div class="sb-ls-col">
                <div class="sb-ls-cell sb-ls-head"><span>${label}</span></div>
                <div class="sb-ls-cell" style="border-bottom:2px solid ${awayColor}">${esc(awayLS[i]?.displayValue || "-")}</div>
                <div class="sb-ls-cell" style="border-bottom:2px solid ${homeColor}">${esc(homeLS[i]?.displayValue || "-")}</div>
              </div>`,
              )
              .join("")}
          </div>
          <div class="sb-ls-col sb-ls-total-col">
            <div class="sb-ls-cell sb-ls-head"><span>T</span></div>
            <div class="sb-ls-cell" style="border-bottom:2px solid ${awayColor}">${esc(away.score ?? "0")}</div>
            <div class="sb-ls-cell" style="border-bottom:2px solid ${homeColor}">${esc(home.score ?? "0")}</div>
          </div>
        </div>
      </div>`;
  }

  // ── Scoring Summary ────────────────────────────────────────────────────────
  function renderScoringCard(away, home, awayColor, homeColor) {
    const scoring = gameData?.scoringPlays || [];
    if (!scoring.length) return "";
    const rows = scoring
      .map((play, idx) => {
        const isHome = String(play.team?.id) === String(home.team?.id);
        const color = isHome ? homeColor : awayColor;
        const p = play.period?.number || 0;
        return `
          <div class="sb-scoring-row" style="border-left-color:${color}">
            <div class="sb-scoring-time">
              <div class="sb-scoring-period">${p <= 4 ? `Q${p || "?"}` : `OT${p - 4 || "?"}`}</div>
              <div class="sb-scoring-clock">${esc(play.clock?.displayValue || "")}</div>
            </div>
            <div class="sb-scoring-info">
              <div class="sb-scoring-text">${esc(play.text || "")}</div>
              <div class="sb-scoring-score">${esc(play.awayScore)} - ${esc(play.homeScore)}</div>
            </div>
          </div>`;
      })
      .join("");
    return `
      <div class="sb-card">
        <div class="sb-card-header"><span class="sb-card-title">Scoring Summary</span></div>
        <div class="sb-card-body sb-scoring-body">${rows}</div>
      </div>`;
  }

  // ── Officials ──────────────────────────────────────────────────────────────
  function renderOfficialsCard() {
    const officials = gameData?.gameInfo?.officials || [];
    if (!officials.length) return "";
    const rows = officials
      .map(
        (o) => `
        <div class="sb-official-row">
          <span class="sb-official-name">${esc(o.displayName || o.fullName || "")}</span>
          <span class="sb-official-role">${esc(o.position?.displayName || o.position?.name || "")}</span>
        </div>`,
      )
      .join("");
    return `
      <div class="sb-card">
        <div class="sb-card-header"><span class="sb-card-title">Officials</span></div>
        <div class="sb-card-body">${rows}</div>
      </div>`;
  }

  // ── Weather ────────────────────────────────────────────────────────────────
  function renderWeatherCard() {
    const w = gameData?.gameInfo?.weather;
    if (!w) return "";
    const item = (val, label) => `
      <div class="sb-weather-item">
        <div class="sb-weather-val">${esc(val)}</div>
        <div class="sb-weather-lbl">${label}</div>
      </div>`;
    return `
      <div class="sb-card">
        <div class="sb-card-header"><span class="sb-card-title">Weather</span></div>
        <div class="sb-card-body sb-weather-row">
          ${item(w.temperature != null ? `${w.temperature}°F` : "—", "Temperature")}
          ${item(w.precipitation != null ? `${w.precipitation}%` : "—", "Precipitation")}
          ${item(w.gust != null ? `${w.gust} mph` : "—", "Wind Gust")}
        </div>
      </div>`;
  }

  // ── Last 5 Games ───────────────────────────────────────────────────────────
  function renderLast5Cards() {
    const lastFive = gameData?.lastFiveGames;
    if (!Array.isArray(lastFive) || !lastFive.length) return "";
    return lastFive
      .map((entry) => {
        const teamInfo = entry?.team;
        const events = entry?.events || [];
        if (!teamInfo || !events.length) return "";
        const color = getSmartColor(teamInfo);
        const rows = events
          .slice()
          .reverse()
          .map((evt) => {
            const isWin = evt.gameResult === "W";
            const isLoss = evt.gameResult === "L";
            const opp = evt.opponent || {};
            const dateStr = evt.gameDate
              ? new Date(evt.gameDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              : "";
            return `
              <a class="sb-last5-row" href="scoreboard.html?id=${esc(evt.id)}">
                <span class="sb-last5-badge" style="background:${isWin ? "#27ae60" : isLoss ? "#e74c3c" : "var(--text-secondary)"}">${esc(evt.gameResult || "-")}</span>
                <span class="sb-last5-opp">${esc(evt.atVs || "")} ${esc(opp.displayName || opp.abbreviation || "")}</span>
                <span class="sb-last5-score">${esc(evt.score || "")}</span>
                <span class="sb-last5-date">${esc(dateStr)}</span>
              </a>`;
          })
          .join("");
        return `
          <div class="sb-card">
            <div class="sb-card-header sb-card-header-split">
              <span class="sb-last5-team" style="color:${color}">
                ${teamInfo.logo ? `<img src="${esc(teamInfo.logo)}" alt="" onerror="this.style.display='none'">` : ""}
                ${esc(teamInfo.displayName || teamInfo.abbreviation || "")}
              </span>
              <span class="sb-card-subtitle">Last ${events.length} Games</span>
            </div>
            <div class="sb-last5-body">${rows}</div>
          </div>`;
      })
      .join("");
  }

  // ── Venue ──────────────────────────────────────────────────────────────────
  function renderVenueCard() {
    const comp = getCompetition();
    const venue =
      gameData?.gameInfo?.venue?.fullName || comp?.venue?.fullName || "";
    if (!venue) return "";
    const date = comp?.date ? new Date(comp.date) : null;
    const dateStr =
      date && !isNaN(date.getTime())
        ? date.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : "";
    return `
      <div class="sb-card sb-venue-card">
        <div class="sb-venue-name">${esc(venue)}</div>
        ${dateStr ? `<div class="sb-venue-date">${esc(dateStr)}</div>` : ""}
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DRIVES PANEL — drive chips, result banner, play cards (app Drives tab)
  // ═══════════════════════════════════════════════════════════════════════════
  function renderDrivesPanel(body) {
    if (!drivesData || !drivesData.length) {
      setPanelHtml(
        body,
        `<div class="sb-empty">${isScheduled() ? "Drives are not available for scheduled games" : "No drive information available"}</div>`,
      );
      return;
    }

    const total = drivesData.length;
    const reversed = [...drivesData].reverse();
    const activeIdx =
      selectedDriveIdx != null && selectedDriveIdx < reversed.length
        ? selectedDriveIdx
        : 0;
    const origIdx = total - 1 - activeIdx;
    const activeDrive = drivesData[origIdx] || drivesData[total - 1];
    const activeDriveNum = origIdx + 1;

    const driveTeam = activeDrive?.team;
    const driveEndTeam = activeDrive?.endTeam;
    const driveTeamAbbr = getTeamAbbr(driveTeam);
    const driveEndAbbr = getTeamAbbr(driveEndTeam);
    const hasEndTeam = driveEndAbbr && driveEndAbbr !== driveTeamAbbr;
    const driveColor = getSmartColor(driveTeam);
    const endColor = hasEndTeam ? getSmartColor(driveEndTeam) : driveColor;
    const isTD = !!activeDrive?.isScore;

    // Drive chips
    const chips = reversed
      .map((drive, revIdx) => {
        const num = total - revIdx;
        const isActive = revIdx === activeIdx;
        const abbr = getTeamAbbr(drive.team);
        const endAbbr = getTeamAbbr(drive.endTeam);
        const chipHasEnd = endAbbr && endAbbr !== abbr;
        const chipTD = !!drive.isScore;
        const chipColor =
          chipHasEnd && chipTD
            ? getSmartColor(drive.endTeam)
            : getSmartColor(drive.team);
        const logo = getTeamLogoUrl(drive.team);
        const endLogo = getTeamLogoUrl(drive.endTeam);
        const logoHtml = chipHasEnd
          ? `<span class="sb-drive-chip-logos">${logo ? `<img src="${esc(logo)}" alt="">` : ""}<span class="sb-drive-chip-div">|</span>${endLogo ? `<img src="${esc(endLogo)}" alt="">` : ""}</span>`
          : logo
            ? `<img class="sb-drive-chip-logo" src="${esc(logo)}" alt="">`
            : "";
        return `
          <button class="sb-drive-chip${isActive ? " active" : ""}${chipTD ? " td" : ""}" data-drive="${revIdx}"
            style="border-color:${isActive ? chipColor : "var(--bg-border)"};background:${chipTD ? chipColor + "33" : isActive ? "var(--bg-surface-secondary)" : "var(--bg-surface)"}">
            ${logoHtml}
            <span style="color:${isActive ? "var(--text-primary)" : "var(--text-secondary)"};font-weight:${isActive ? "800" : "600"}">${num}</span>
          </button>`;
      })
      .join("");

    // Banner
    const bannerLogo = hasEndTeam
      ? `<span class="sb-drive-banner-logo-stack">
           <img src="${esc(getTeamLogoUrl(driveEndTeam))}" alt="">
           <span class="sb-drive-banner-overlay" style="border-color:${driveColor}"><img src="${esc(getTeamLogoUrl(driveTeam))}" alt=""></span>
         </span>`
      : getTeamLogoUrl(driveTeam)
        ? `<img class="sb-drive-banner-logo" src="${esc(getTeamLogoUrl(driveTeam))}" alt="">`
        : "";

    const banner = `
      <div class="sb-drive-banner" style="border-color:${hasEndTeam ? endColor : driveColor}">
        <div class="sb-drive-banner-info">
          <div class="sb-drive-banner-title">Drive ${activeDriveNum}</div>
          <div class="sb-drive-banner-result" style="color:${isTD ? endColor : "var(--text-secondary)"}">${esc(
            activeDrive?.displayResult || activeDrive?.result || "In Progress",
          )}</div>
          ${activeDrive?.description ? `<div class="sb-drive-banner-desc">${esc(activeDrive.description)}</div>` : ""}
        </div>
        <div class="sb-drive-banner-logo-wrap">${bannerLogo}</div>
      </div>`;

    // Play cards
    const drivePlays = [...(activeDrive?.plays || [])].reverse();
    const playsHtml = drivePlays.length
      ? drivePlays
          .map((play) => {
            const playId = String(play.id || play.sequenceNumber || "");
            const isExpanded = expandedPlayId === playId;
            const period = play.period?.number || 0;
            const clock = play.clock?.displayValue || "";
            const periodLabel =
              period <= 4 ? `Q${period}` : period > 4 ? `OT${period - 4}` : "";
            const playType = play.type?.text || play.type?.abbreviation || "";
            const playText = play.text || play.shortText || "";
            const ddText =
              play.start?.downDistanceText || play.end?.downDistanceText || "";
            const isScoring = !!play.scoringPlay;
            const winPct = getPlayWinPct(play, driveTeam?.id);

            const playTeamAbbr = getTeamAbbr(play.team) || driveTeamAbbr;
            const playTeamColor = getSmartColor(play.team || driveTeam);
            const playTeamDiffers =
              playTeamAbbr && driveTeamAbbr && playTeamAbbr !== driveTeamAbbr;
            const cardBorder = isScoring
              ? hasEndTeam
                ? endColor
                : playTeamColor
              : playTeamDiffers
                ? playTeamColor
                : "var(--bg-border)";
            const accent = isScoring
              ? hasEndTeam
                ? endColor
                : playTeamColor
              : "var(--text-primary)";

            const hasYardLine =
              play.start?.yardLine !== undefined ||
              play.end?.yardLine !== undefined;
            const canExpand = hasYardLine;

            let expanded = "";
            if (isExpanded && hasYardLine) {
              const useDriveYards =
                isScoring && !hasEndTeam && activeDrive?.end?.yardLine != null;
              const sY = useDriveYards
                ? activeDrive.start?.yardLine
                : play.start?.yardLine;
              const eY = useDriveYards
                ? activeDrive.end?.yardLine
                : (play.end?.yardLine ?? play.start?.yardLine);
              expanded = `<div class="sb-drive-play-expanded">${fieldSvg(playTeamColor, sY, eY, play)}</div>`;
            }

            return `
              <div class="sb-drive-play-row">
                <div class="sb-drive-play-time">
                  <div class="sb-drive-play-clock">${esc(clock || "--:--")}</div>
                  <div class="sb-drive-play-period">${periodLabel}</div>
                </div>
                <div class="sb-drive-play-card${isExpanded ? " expanded" : ""}" data-play="${esc(playId)}" data-expand="${canExpand ? "1" : "0"}"
                     style="border-color:${cardBorder};background:${isScoring ? (hasEndTeam ? endColor : playTeamColor) + "18" : "var(--bg-surface)"}">
                  <div class="sb-drive-play-head">
                    <span style="color:${accent}">${esc(playType)}</span>
                    <span class="sb-drive-play-scores" style="color:${accent}">
                      ${play.awayScore != null ? esc(play.awayScore) : ""}${play.awayScore != null || play.homeScore != null ? " - " : ""}${play.homeScore != null ? esc(play.homeScore) : ""}
                    </span>
                  </div>
                  <div class="sb-drive-play-text">${esc(playText)}</div>
                  ${
                    ddText || winPct !== null
                      ? `
                    <div class="sb-drive-play-sub">
                      ${ddText ? `<span>${esc(ddText)}</span>` : ""}
                      ${winPct !== null ? `<span>W ${winPct.toFixed(1)}%</span>` : ""}
                    </div>`
                      : ""
                  }
                  ${expanded}
                </div>
              </div>`;
          })
          .join("")
      : `<div class="sb-empty">No plays available for this drive</div>`;

    const html = `
      <div class="sb-drives-wrap">
        <div class="sb-drive-chips">${chips}</div>
        ${banner}
        <div class="sb-drive-plays">${playsHtml}</div>
      </div>`;

    if (!setPanelHtml(body, html)) return;

    body.querySelectorAll(".sb-drive-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        selectedDriveIdx = Number(chip.dataset.drive);
        expandedPlayId = null;
        renderDrivesPanel(body);
      });
    });
    body
      .querySelectorAll('.sb-drive-play-card[data-expand="1"]')
      .forEach((card) => {
        card.addEventListener("click", () => {
          const id = card.dataset.play;
          expandedPlayId = expandedPlayId === id ? null : id;
          renderDrivesPanel(body);
        });
      });
  }

  // Win probability for a play (app getPlayWinPct)
  function getPlayWinPct(play, driveTeamId) {
    if (!play) return null;
    const wpArr = gameData?.winprobability;
    if (!Array.isArray(wpArr) || !wpArr.length) return null;
    const playId = String(play.id || "");
    let entry = wpArr.find((w) => String(w.playId) === playId);
    if (!entry) {
      const seq = Number(play.sequenceNumber) || 0;
      let best = null;
      let bestDist = Infinity;
      for (const w of wpArr) {
        const wSeq = Number(String(w.playId || "").replace(/\D/g, "")) || 0;
        const dist = Math.abs(wSeq - seq);
        if (dist < bestDist) {
          bestDist = dist;
          best = w;
        }
      }
      if (best && bestDist < 500) entry = best;
    }
    if (!entry) return null;
    const { home } = getTeams();
    const homePct = entry.homeWinPercentage ?? entry.homeWinProbability ?? 0.5;
    const isHomeDriving = String(driveTeamId) === String(home?.team?.id);
    const raw = isHomeDriving ? homePct : 1 - homePct;
    return Math.round(raw * 1000) / 10;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM PANEL (Away/Home) — injuries when scheduled, else category chips +
  // player cards (app renderTeamContent). Player click opens the player modal.
  // ═══════════════════════════════════════════════════════════════════════════
  function renderTeamPanel(body, side) {
    const { home, away } = getTeams();
    const comp = side === "away" ? away : home;
    if (!comp) {
      setPanelHtml(body, '<div class="sb-empty">No team data</div>');
      return;
    }
    const teamColor = getSmartColor(comp.team);

    if (isScheduled()) {
      setPanelHtml(body, renderInjuries(comp, teamColor));
      return;
    }

    const teamBoxScore = (gameData?.boxscore?.players || []).find(
      (p) =>
        String(p.team?.id) === String(comp.team?.id) ||
        p.team?.abbreviation === comp.team?.abbreviation,
    );
    if (!teamBoxScore || !teamBoxScore.statistics) {
      setPanelHtml(
        body,
        '<div class="sb-empty">No statistics available for this team</div>',
      );
      return;
    }

    const categories = teamBoxScore.statistics
      .filter((c) => c.athletes && c.athletes.length > 0)
      .map((c) => ({
        name: c.name,
        text: c.text || c.name,
        labels: c.labels || [],
      }));
    const catNames = categories.map((c) => c.name);
    if (!catNames.length) {
      setPanelHtml(
        body,
        '<div class="sb-empty">No statistics available for this team</div>',
      );
      return;
    }
    const active = catNames.includes(teamFilter[side])
      ? teamFilter[side]
      : catNames[0];
    teamFilter[side] = active;

    const fmtCat = (name) =>
      name
        ? name
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (s) => s.toUpperCase())
            .trim()
        : "";

    const cat = teamBoxScore.statistics.find((c) => c.name === active);
    const labels = cat?.labels || [];
    const seen = new Set();
    const players = [];
    for (const entry of cat?.athletes || []) {
      const athlete = entry.athlete;
      if (!athlete || seen.has(athlete.id)) continue;
      seen.add(athlete.id);
      const stats = (entry.stats || []).slice(0, 6).map((v, i) => ({
        label: labels[i] || `S${i + 1}`,
        value: String(v ?? "0"),
      }));
      if (stats.length) players.push({ athlete, stats });
    }

    const chips = catNames
      .map((name) => {
        const isActive = name === active;
        return `<button class="sb-pos-chip${isActive ? " active" : ""}" data-cat="${esc(name)}"
          style="border-color:${isActive ? teamColor : "var(--bg-border)"};background:${isActive ? teamColor + "22" : "var(--bg-surface)"};color:${isActive ? "var(--text-primary)" : "var(--text-secondary)"}">${esc(fmtCat(name))}</button>`;
      })
      .join("");

    const cards = players.length
      ? players
          .map(
            (p) => `
          <div class="sb-player-card" data-athlete="${esc(p.athlete.id)}" style="border-color:${teamColor}">
            <div class="sb-pc-top">
              <div class="sb-pc-headshot-wrap" style="background:${teamColor}33;border-color:${teamColor}">
                <img src="${esc(headshotUrl(p.athlete.id))}" alt="" loading="lazy" onerror="this.style.display='none'">
              </div>
              <div class="sb-pc-info">
                <div class="sb-pc-name">${esc(
                  p.athlete.displayName ||
                    `${p.athlete.firstName || ""} ${p.athlete.lastName || ""}`.trim() ||
                    "Unknown",
                )}</div>
                <div class="sb-pc-meta">${[
                  p.athlete.jersey ? `#${p.athlete.jersey}` : "",
                  p.athlete.position?.abbreviation || "",
                ]
                  .filter(Boolean)
                  .join(" · ")}</div>
              </div>
            </div>
            <div class="sb-pc-stats">
              ${p.stats
                .map(
                  (s) => `
                <div class="sb-pc-stat">
                  <div class="sb-pc-stat-val">${esc(s.value)}</div>
                  <div class="sb-pc-stat-lbl">${esc(s.label)}</div>
                </div>`,
                )
                .join("")}
            </div>
          </div>`,
          )
          .join("")
      : '<div class="sb-empty">No players found</div>';

    const html = `
      <div class="sb-team-wrap">
        <div class="sb-pos-bar">${chips}</div>
        <div class="sb-player-list">${cards}</div>
      </div>`;

    if (!setPanelHtml(body, html)) return;

    body.querySelectorAll(".sb-pos-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        teamFilter[side] = chip.dataset.cat;
        renderTeamPanel(body, side);
      });
    });
    body.querySelectorAll(".sb-player-card[data-athlete]").forEach((card) => {
      card.addEventListener("click", () => {
        openPlayerModal(card.dataset.athlete, teamFilter[side]);
      });
    });
  }

  // Injury report for scheduled games (app renderTeamInjuries)
  function renderInjuries(comp, teamColor) {
    const injuries = gameData?.injuries || [];
    const entry = injuries.find(
      (e) => String(e?.team?.id) === String(comp.team?.id),
    );
    const list = entry?.injuries || [];
    if (!list.length) {
      return '<div class="sb-empty">No injury report available</div>';
    }
    const cards = list
      .map((inj) => {
        const athlete = inj?.athlete;
        if (!athlete) return "";
        const statusText = inj.status || inj.type?.description || "";
        const statusColor = /out/i.test(statusText)
          ? "#e74c3c"
          : /questionable/i.test(statusText)
            ? "#f39c12"
            : /doubtful/i.test(statusText)
              ? "#e67e22"
              : "var(--text-secondary)";
        const type = inj.details?.type || "";
        const location = inj.details?.location || "";
        const detail =
          inj.details?.detail && inj.details.detail !== "Not Specified"
            ? inj.details.detail
            : "";
        const returnDate = inj.details?.returnDate
          ? new Date(inj.details.returnDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          : "";
        const cell = (val, label) => `
          <div class="sb-pc-stat">
            <div class="sb-pc-stat-val" style="font-size:12px">${esc(val || "—")}</div>
            <div class="sb-pc-stat-lbl">${label}</div>
          </div>`;
        return `
          <div class="sb-player-card" style="border-color:${teamColor}">
            <div class="sb-pc-top">
              <div class="sb-pc-headshot-wrap" style="background:${teamColor}33;border-color:${teamColor}">
                <img src="${esc(headshotUrl(athlete.id))}" alt="" loading="lazy" onerror="this.style.display='none'">
              </div>
              <div class="sb-pc-info">
                <div class="sb-pc-name">${esc(
                  athlete.displayName ||
                    athlete.fullName ||
                    `${athlete.firstName || ""} ${athlete.lastName || ""}`.trim(),
                )}</div>
                <div class="sb-pc-meta">${[
                  athlete.jersey ? `#${athlete.jersey}` : "",
                  athlete.position?.displayName || "",
                ]
                  .filter(Boolean)
                  .join(" · ")}</div>
              </div>
            </div>
            <div class="sb-pc-stats">
              <div class="sb-pc-stat">
                <div class="sb-pc-stat-val" style="color:${statusColor};font-size:12px">${esc(
                  statusText
                    ? statusText[0].toUpperCase() + statusText.slice(1)
                    : "—",
                )}</div>
                <div class="sb-pc-stat-lbl">Status</div>
              </div>
              ${cell(type, "Injury")}
              ${cell([detail, location].filter(Boolean).join(" · "), "Location")}
              ${cell(returnDate, "Return")}
            </div>
          </div>`;
      })
      .join("");
    return `<div class="sb-player-list">${cards}</div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATS PANEL — possession ring, bar stats, game leaders, prediction
  // (app renderStatsContent)
  // ═══════════════════════════════════════════════════════════════════════════
  function renderStatsPanel(body) {
    const { home, away } = getTeams();
    if (!home || !away) {
      setPanelHtml(body, '<div class="sb-empty">No game data</div>');
      return;
    }
    const pair = getMatchColors();
    const awayColor = pair.awayColor;
    const homeColor = pair.homeColor;

    const awayStats = gameData?.boxscore?.teams?.[0]?.statistics || [];
    const homeStats = gameData?.boxscore?.teams?.[1]?.statistics || [];
    const findStat = (stats, key) => stats.find((s) => s.name === key);

    const parseNum = (val) => {
      if (val == null) return 0;
      const s = String(val);
      const slash = s.match(/^(\d+(?:\.\d+)?)/);
      if (slash) return Number(slash[1]) || 0;
      const n = Number(s.replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(n) ? n : 0;
    };

    const barStats = [
      { key: "totalYards", label: "Total Yards" },
      { key: "netPassingYards", label: "Passing Yards" },
      { key: "rushingYards", label: "Rushing Yards" },
      { key: "firstDowns", label: "First Downs" },
      { key: "thirdDownEff", label: "3rd Down Conv" },
      { key: "fourthDownEff", label: "4th Down Conv" },
      { key: "turnovers", label: "Turnovers", opp: true },
      { key: "totalPenaltiesYards", label: "Penalties", opp: true },
      { key: "sacksYardsLost", label: "Sacks", opp: true },
    ];
    const schedBarStats = [
      { key: "totalPointsPerGame", label: "Points Per Game" },
      { key: "yardsPerGame", label: "Yards Per Game" },
      { key: "passingYardsPerGame", label: "Passing Yards Per Game" },
      { key: "rushingYardsPerGame", label: "Rushing Yards Per Game" },
      {
        key: "totalPointsPerGameAllowed",
        label: "Points Per Game Allowed",
        opp: true,
      },
      {
        key: "yardsPerGameAllowed",
        label: "Yards Per Game Allowed",
        opp: true,
      },
      {
        key: "passingYardsPerGameAllowed",
        label: "Passing Yards Allowed",
        opp: true,
      },
      {
        key: "rushingYardsPerGameAllowed",
        label: "Rushing Yards Allowed",
        opp: true,
      },
    ];

    // Possession ring
    const awayPoss = findStat(awayStats, "possessionTime");
    const homePoss = findStat(homeStats, "possessionTime");
    const aSecs = Number(awayPoss?.value) || 0;
    const hSecs = Number(homePoss?.value) || 0;
    const totalPoss = aSecs + hSecs;
    const aPct = totalPoss > 0 ? aSecs / totalPoss : 0.5;
    const hPct = totalPoss > 0 ? hSecs / totalPoss : 0.5;

    const R = 52;
    const STROKE = 20;
    const SIZE = R * 2 + STROKE * 2;
    const CIRC = 2 * Math.PI * R;
    const homeLen = CIRC * Math.max(0, Math.min(1, hPct));

    let possHtml = "";
    if (totalPoss > 0) {
      possHtml = `
        <div class="sb-stats-feature">
          <div class="sb-stats-feature-label">Time of Possession</div>
          <div class="sb-stats-feature-row">
            <div class="sb-stats-feature-val">${esc(awayPoss?.displayValue || "0:00")}</div>
            <div class="sb-ring-wrap">
              <svg width="${SIZE}" height="${SIZE}" style="transform:rotate(-90deg)">
                <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}" fill="none" stroke="${awayColor}" stroke-width="${STROKE}"/>
                <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}" fill="none" stroke="${homeColor}" stroke-width="${STROKE}"
                  stroke-dasharray="${homeLen} ${Math.max(0, CIRC - homeLen)}" stroke-linecap="butt"/>
              </svg>
              <div class="sb-ring-inner">
                <span class="sb-ring-pct" style="left:4px">${(aPct * 100).toFixed(1)}%</span>
                <span class="sb-ring-split"></span>
                <span class="sb-ring-pct" style="right:4px">${(hPct * 100).toFixed(1)}%</span>
              </div>
            </div>
            <div class="sb-stats-feature-val">${esc(homePoss?.displayValue || "0:00")}</div>
          </div>
        </div>`;
    }

    const rows = (isScheduled() ? schedBarStats : barStats)
      .map((stat) => {
        const a = findStat(awayStats, stat.key);
        const h = findStat(homeStats, stat.key);
        const aNum = parseNum(a?.displayValue);
        const hNum = parseNum(h?.displayValue);
        const dA = stat.opp ? hNum : aNum;
        const dH = stat.opp ? aNum : hNum;
        const tot = dA + dH;
        const aShare = tot > 0 ? dA / tot : 0.5;
        const hShare = tot > 0 ? dH / tot : 0.5;
        return `
          <div class="sb-stats-row">
            <div class="sb-stats-vals"><span>${esc(a?.displayValue || "-")}</span><span>${esc(h?.displayValue || "-")}</span></div>
            <div class="sb-stats-bar">
              <div style="width:${Math.max(0, Math.min(100, aShare * 100))}%;background:${awayColor}"></div>
              <div style="width:${Math.max(0, Math.min(100, hShare * 100))}%;background:${homeColor}"></div>
            </div>
            <div class="sb-stats-lbl">${esc(stat.label.toUpperCase())}</div>
          </div>`;
      })
      .join("");

    let html = `
      <div class="sb-card">
        <div class="sb-card-header"><span class="sb-card-title">Stats</span></div>
        <div class="sb-card-body">${possHtml}${rows}</div>
      </div>`;

    // Game leaders
    html += renderLeadersCard(away, home);

    // Prediction (scheduled only)
    if (isScheduled() && gameData?.predictor) {
      const pred = gameData.predictor;
      const aWin = parseFloat(pred.awayTeam?.gameProjection || "0");
      const hWin = parseFloat(pred.homeTeam?.gameProjection || "0");
      html += `
        <div class="sb-card">
          <div class="sb-card-header"><span class="sb-card-title">${esc(pred.header || "Prediction")}</span></div>
          <div class="sb-card-body">
            <div class="sb-pred-teams">
              <span style="color:${awayColor}">${esc(getTeamAbbr(away.team))}</span>
              <span>vs</span>
              <span style="color:${homeColor}">${esc(getTeamAbbr(home.team))}</span>
            </div>
            <div class="sb-pred-bar">
              <div style="width:${aWin}%;background:${awayColor}"></div>
              <div style="width:${hWin}%;background:${homeColor}"></div>
            </div>
            <div class="sb-pred-vals"><span>${aWin.toFixed(1)}%</span><span>${hWin.toFixed(1)}%</span></div>
          </div>
        </div>`;
    }

    setPanelHtml(body, html);
  }

  function renderLeadersCard(away, home) {
    const leaders = gameData?.leaders;
    if (!leaders || !leaders.length) return "";
    const awayLeaders = leaders.find(
      (t) =>
        String(t.team?.id) === String(away.team?.id) ||
        t.team?.abbreviation === away.team?.abbreviation,
    );
    const homeLeaders = leaders.find(
      (t) =>
        String(t.team?.id) === String(home.team?.id) ||
        t.team?.abbreviation === home.team?.abbreviation,
    );
    if (!awayLeaders || !homeLeaders) return "";

    const categories = ["passingYards", "rushingYards", "receivingYards"];
    const awayColor = getSmartColor(away.team);
    const homeColor = getSmartColor(home.team);

    let bodyHtml = "";
    for (const category of categories) {
      const aCat = awayLeaders.leaders?.find((l) => l.name === category);
      const hCat = homeLeaders.leaders?.find((l) => l.name === category);
      const aL = aCat?.leaders?.[0];
      const hL = hCat?.leaders?.[0];
      if (!aL || !hL) continue;

      const row = (leader, team, color) => `
        <div class="sb-leader-row">
          <div class="sb-leader-team">
            <img src="${esc(getTeamLogoUrl(team.team))}" alt="" onerror="this.style.display='none'">
            <span>${esc(leader.athlete?.jersey || "#")}</span>
          </div>
          <img class="sb-leader-headshot" src="${esc(headshotUrl(leader.athlete?.id))}" alt="" loading="lazy" onerror="this.style.display='none'">
          <div class="sb-leader-info">
            <div class="sb-leader-name">${esc(leader.athlete?.shortName || leader.athlete?.displayName || "")}
              <span class="sb-leader-pos">${esc(leader.athlete?.position?.abbreviation || "")}</span>
            </div>
            <div class="sb-leader-val" style="color:${color}">${esc(leader.displayValue || "")}</div>
          </div>
        </div>`;

      bodyHtml += `
        <div class="sb-leader-cat">
          <div class="sb-leader-cat-title">${esc(aCat.displayName || category)}</div>
          ${row(aL, away, awayColor)}
          ${row(hL, home, homeColor)}
        </div>`;
    }
    if (!bodyHtml) return "";

    return `
      <div class="sb-card">
        <div class="sb-card-header"><span class="sb-card-title">${isScheduled() ? "Team Leaders" : "Game Leaders"}</span></div>
        <div class="sb-card-body">${bodyHtml}</div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAYER MODAL (no copy card — header + stat grid only)
  // ═══════════════════════════════════════════════════════════════════════════
  let modalCategories = [];
  let modalActiveCat = "";
  let modalTeamColor = "#1a1a2e";

  function openPlayerModal(athleteId, activeCat) {
    const boxscorePlayers = gameData?.boxscore?.players || [];
    const categoryMap = {};
    let athleteInfo = null;
    let teamInfo = null;

    for (const teamData of boxscorePlayers) {
      if (!teamData?.statistics) continue;
      for (const cat of teamData.statistics) {
        if (!cat?.athletes) continue;
        for (const entry of cat.athletes) {
          const athlete = entry?.athlete;
          if (!athlete) continue;
          if (String(athlete.id) === String(athleteId)) {
            athleteInfo = athleteInfo || athlete;
            teamInfo = teamInfo || teamData.team;
            categoryMap[cat.name] = {
              stats: entry.stats || [],
              text: cat.text || cat.name,
              labels: cat.labels || [],
            };
          }
        }
      }
    }
    if (!athleteInfo) return;

    modalCategories = Object.keys(categoryMap).map((name) => ({
      name,
      text: categoryMap[name].text || name,
      labels: categoryMap[name].labels || [],
      stats: categoryMap[name].stats || [],
    }));
    modalActiveCat =
      modalCategories.find((c) => c.name === activeCat)?.name ||
      modalCategories[0]?.name ||
      "";
    modalTeamColor = getSmartColor(teamInfo);

    const name =
      athleteInfo.displayName ||
      `${athleteInfo.firstName || ""} ${athleteInfo.lastName || ""}`.trim() ||
      "Unknown";
    const jersey = athleteInfo.jersey ? `#${athleteInfo.jersey}` : "";
    const pos = athleteInfo.position?.abbreviation || "";
    const posName = athleteInfo.position?.displayName || "";
    const height = (athleteInfo.height || "").replace(/\\"/g, "") || "—";
    const bats = athleteInfo.batSide?.code || "—";

    $("#sbPlayerModalBody").innerHTML = `
      <div class="sb-pm-header" style="border-bottom-color:${modalTeamColor}">
        <div class="sb-pm-headshot-wrap">
          <img class="sb-pm-headshot" style="border-color:${modalTeamColor}" src="${esc(headshotUrl(athleteInfo.id))}" alt="" onerror="this.style.display='none'">
          <span class="sb-pm-pos-badge">${esc(pos)}</span>
        </div>
        <div class="sb-pm-name">${esc(name)}</div>
        <div class="sb-pm-meta">${[jersey, teamInfo?.name || teamInfo?.abbreviation || ""].filter(Boolean).join(" · ")}</div>
        <div class="sb-pm-tri">
          <div class="sb-pm-tri-cell"><span>${esc(pos || "—")}</span><span>${esc(posName)}</span></div>
          <div class="sb-pm-tri-cell mid"><span>${esc(height)}</span><span>Height</span></div>
          <div class="sb-pm-tri-cell"><span>${esc(bats)}</span><span>Bats</span></div>
        </div>
      </div>
      ${
        modalCategories.length > 1
          ? `<div class="sb-pm-cats">${modalCategories
              .map(
                (c) =>
                  `<button class="sb-pm-cat${c.name === modalActiveCat ? " active" : ""}" data-cat="${esc(c.name)}">${esc(c.text)}</button>`,
              )
              .join("")}</div>`
          : ""
      }
      <div class="sb-pm-stats" id="sbPmStats"></div>`;

    renderPlayerModalStats();

    $("#sbPlayerModal").style.display = "flex";

    $("#sbPlayerModalBody")
      .querySelectorAll(".sb-pm-cat")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          modalActiveCat = btn.dataset.cat;
          $("#sbPlayerModalBody")
            .querySelectorAll(".sb-pm-cat")
            .forEach((b) =>
              b.classList.toggle("active", b.dataset.cat === modalActiveCat),
            );
          renderPlayerModalStats();
        });
      });
  }

  function renderPlayerModalStats() {
    const cat = modalCategories.find((c) => c.name === modalActiveCat);
    const el = $("#sbPmStats");
    if (!el) return;
    if (!cat || !cat.stats.length) {
      el.innerHTML = '<div class="sb-empty">No stats available</div>';
      return;
    }
    el.innerHTML = cat.stats
      .map(
        (v, i) => `
        <div class="sb-pm-stat">
          <div class="sb-pm-stat-val">${esc(String(v ?? "—"))}</div>
          <div class="sb-pm-stat-lbl">${esc(cat.labels[i] || `S${i + 1}`)}</div>
        </div>`,
      )
      .join("");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STREAMING — StreamFree (streamfree.top) via /assets/stream-service.js
  // ═══════════════════════════════════════════════════════════════════════════
  const STREAM_SPORT = "nfl";

  function normalizeTeamName(teamName) {
    return StreamService.normalizeTeamName(teamName);
  }

  // Returns { sources, match } where sources is a label -> { url, ... } map.
  async function findMatchStreams(homeTeamName, awayTeamName) {
    try {
      return await StreamService.findMatchStreams({
        homeTeamName,
        awayTeamName,
        sport: STREAM_SPORT,
      });
    } catch (error) {
      console.error("Error in findMatchStreams:", error);
      return { sources: {}, match: null };
    }
  }

  function renderStreamButtons() {
    const container = $("#sbStreamButtons");
    if (!container) return;
    const keys = Object.keys(availableStreams);
    if (!keys.length) {
      container.innerHTML =
        '<span class="sb-stream-no-streams">No live streams found for this game</span>';
      return;
    }
    container.innerHTML = keys
      .map((key) => {
        const entry = availableStreams[key] || {};
        const label = entry.label || key;
        const quality = entry.quality ? ` · ${entry.quality}` : "";
        return `<button class="sb-stream-btn${currentStreamType === key ? " active" : ""}" data-stream="${esc(key)}">${esc(label)}${esc(quality)}</button>`;
      })
      .join("");
    container.querySelectorAll(".sb-stream-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchStream(btn.dataset.stream));
    });
  }

  function setStreamFrame(url) {
    const frame = $("#sbStreamFrame");
    const loading = $("#sbStreamLoading");
    if (!frame) return;
    if (loading) loading.hidden = false;
    frame.style.display = "none";
    frame.src =
      url + (url.includes("?") ? "&" : "?") + "_nocache=" + Date.now();
    frame.onload = () => {
      if (loading) loading.hidden = true;
      frame.style.display = "block";
    };
  }

  async function openStreamModal() {
    const { home, away } = getTeams();
    const homeName = home?.team?.displayName || home?.team?.name || "";
    const awayName = away?.team?.displayName || away?.team?.name || "";
    if (!homeName || !awayName) return;

    streamModalVisible = true;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    $("#sbStreamModal").style.display = "flex";
    $("#sbStreamButtons").innerHTML =
      '<span class="sb-stream-no-streams">Finding streams…</span>';
    $("#sbStreamFrame").style.display = "none";
    $("#sbStreamLoading").hidden = false;

    const { sources } = await findMatchStreams(homeName, awayName);
    availableStreams = sources || {};

    const keys = Object.keys(availableStreams);
    if (keys.length) {
      currentStreamType = keys[0];
      streamUrl = availableStreams[currentStreamType].url;
    } else {
      currentStreamType = "";
      streamUrl = "";
    }

    renderStreamButtons();
    if (streamUrl) setStreamFrame(streamUrl);
    else if ($("#sbStreamLoading")) $("#sbStreamLoading").hidden = true;
  }

  function switchStream(streamType) {
    const entry = availableStreams[streamType];
    if (!entry) return;
    currentStreamType = streamType;
    streamUrl = entry.url;
    renderStreamButtons();
    setStreamFrame(streamUrl);
  }

  function closeStreamModal() {
    streamModalVisible = false;
    $("#sbStreamModal").style.display = "none";
    const frame = $("#sbStreamFrame");
    if (frame) {
      frame.src = "about:blank";
      frame.style.display = "none";
    }
    streamUrl = "";
    currentStreamType = "";
    availableStreams = {};
    // Resume background polling (and refresh immediately, like the app).
    fetchGameDataQuiet();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT / LISTENERS
  // ═══════════════════════════════════════════════════════════════════════════
  function onSbScroll() {
    const rect = sbHeader.getBoundingClientRect();
    if (rect.bottom < 0) {
      if (sbStickyHeader.style.display !== "flex") {
        sbStickyHeader.style.display = "flex";
        renderStickyHeader();
      } else {
        renderStickyHeader();
      }
    } else if (sbStickyHeader.style.display !== "none") {
      sbStickyHeader.style.display = "none";
    }
  }

  function setupScrollListener() {
    window.addEventListener("scroll", onSbScroll, { passive: true });
    // In split view the left panel is the scroll container, not the window.
    const leftPanel = document.getElementById("sh-left-panel");
    if (leftPanel)
      leftPanel.addEventListener("scroll", onSbScroll, { passive: true });
  }

  function setupModalListeners() {
    const playerModal = $("#sbPlayerModal");
    const streamModal = $("#sbStreamModal");
    const playerClose = $("#sbPlayerModalClose");
    if (playerClose)
      playerClose.addEventListener("click", () => {
        playerModal.style.display = "none";
      });
    if (playerModal)
      playerModal.addEventListener("click", (e) => {
        if (e.target === playerModal) playerModal.style.display = "none";
      });
    const streamClose = $("#sbStreamClose");
    if (streamClose) streamClose.addEventListener("click", closeStreamModal);
    if (streamModal)
      streamModal.addEventListener("click", (e) => {
        if (e.target === streamModal) closeStreamModal();
      });
  }

  function setupStreamListeners() {
    // The Stream button lives inside the header, which is re-rendered on every
    // poll, so use event delegation on the header container.
    sbHeader.addEventListener("click", (e) => {
      const btn = e.target.closest("#sbStreamOpen");
      if (btn) openStreamModal();
    });
  }

  function isInIframe() {
    try {
      return window !== window.top;
    } catch (e) {
      return true;
    }
  }

  function setupSplitViewListeners() {
    window.addEventListener("sh-split-activated", function () {
      splitViewActive = true;
      const rightPanel = document.getElementById("sbRightPanel");
      if (rightPanel) rightPanel.style.display = "none";
      renderTabBars();
      renderPanel("left");
      const leftPanel = document.getElementById("sh-left-panel");
      if (leftPanel && !leftPanel.dataset.sbScrollBound) {
        leftPanel.dataset.sbScrollBound = "1";
        leftPanel.addEventListener("scroll", onSbScroll, { passive: true });
      }
    });
    window.addEventListener("sh-split-deactivated", function () {
      splitViewActive = false;
      const rightPanel = document.getElementById("sbRightPanel");
      if (rightPanel) rightPanel.style.display = "";
      renderTabBars();
      renderPanel("left");
      renderPanel("right");
    });
    if (document.getElementById("sh-split-wrapper")) {
      splitViewActive = true;
      const rp = document.getElementById("sbRightPanel");
      if (rp) rp.style.display = "none";
    }
    if (isInIframe()) {
      splitViewActive = true;
      const rp2 = document.getElementById("sbRightPanel");
      if (rp2) rp2.style.display = "none";
    }
  }

  function init() {
    const params = new URLSearchParams(window.location.search);
    gameId = params.get("id") || params.get("gameId");
    if (!gameId) {
      sbHeader.innerHTML =
        '<div class="sb-error">No game specified. <a href="aio.html">Back to games</a></div>';
      return;
    }
    fetchGameData();
    setupScrollListener();
    setupModalListeners();
    setupStreamListeners();
    setupSplitViewListeners();
    // Record view + subscribe to count (matches app's useGamePresence)
    if (typeof LiveTrackerViewer !== "undefined")
      LiveTrackerViewer.startPollingAndRecord("nfl", gameId);
    // Auth button
    const authContainer = document.getElementById("auth-button-container");
    if (authContainer && typeof createAuthButton === "function") {
      authContainer.appendChild(createAuthButton());
    }
    // Re-render the header when auth state changes so the Stream button
    // appears/disappears based on sign-in status.
    if (typeof Auth !== "undefined" && Auth.onChange) {
      Auth.onChange(function () {
        renderHeader();
      });
    }
  }

  init();
})();

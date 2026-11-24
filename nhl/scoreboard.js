// ─── NHL Scoreboard ───────────────────────────────────────────────────────────
// Mirrors the app's NHL GameDetailsScreen: header (venue row, team sides with
// score-beside-logo, power-play badge, status center, scorers row), sticky mini
// header, split view with tabs (Main / Away / Home / Stats / Plays / Shifts /
// Series), player modal and live streaming. No copy/share cards.
// Data source: sportsheart-hockey backend (same link as the app).
// Pattern follows nfl/scoreboard.js (render guard, tab mutual exclusion,
// split-view collapse, quiet polling, LiveTrackerViewer).

(function () {
  "use strict";

  const BACKEND = "https://sportsheart-hockey.up.railway.app";
  const POLL_LIVE_MS = 5000;
  const POLL_IDLE_MS = 30000;

  let gameId = null;
  let rawDetails = null; // backend JSON
  let game = null; // normalized game
  let pollTimer = null;
  let leftTab = "Main";
  let rightTab = "Away";
  let splitViewActive = false;
  let rosterSection = { left: null, right: null };
  let playsFilter = { left: "ALL", right: "ALL" };
  let playsPeriodIdx = { left: 0, right: 0 };
  let expandedPlayKey = { left: null, right: null };
  let shiftsFilter = {
    left: { teamId: null, playerKey: null, period: null },
    right: { teamId: null, playerKey: null, period: null },
  };

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
  // COLORS — same map as NHLService.getTeamColor
  // ═══════════════════════════════════════════════════════════════════════════
  const TEAM_COLOR_MAP = {
    ANA: "#F47A38",
    ARI: "#8C2633",
    BOS: "#FFB81C",
    BUF: "#003087",
    CGY: "#C8102E",
    CAR: "#CC0000",
    CHI: "#CF0A2C",
    COL: "#6F263D",
    CBJ: "#002654",
    DAL: "#006847",
    DET: "#CE1126",
    EDM: "#041E42",
    FLA: "#041E42",
    LAK: "#111111",
    MIN: "#154734",
    MTL: "#AF1E2D",
    NSH: "#FFB81C",
    NJD: "#CE1126",
    NYI: "#00539B",
    NYR: "#0038A8",
    OTT: "#C52032",
    PHI: "#F74902",
    PIT: "#FFB81C",
    SEA: "#001628",
    SJS: "#006D75",
    STL: "#002F87",
    TBL: "#002868",
    TOR: "#00205B",
    UTA: "#6CAEDF",
    VAN: "#00205B",
    VGK: "#B4975A",
    WSH: "#041E42",
    WPG: "#041E42",
  };

  function getTeamColor(abbr, fallback) {
    const key = String(abbr || "").toUpperCase();
    return TEAM_COLOR_MAP[key] || fallback || "#888888";
  }

  function withAlpha30(color) {
    const raw = String(color || "").trim();
    const full = raw.match(/^#([0-9a-fA-F]{6})$/);
    if (full) return `#${full[1]}4D`;
    const short = raw.match(/^#([0-9a-fA-F]{3})$/);
    if (short) {
      const e = short[1]
        .split("")
        .map((c) => c + c)
        .join("");
      return `#${e}4D`;
    }
    return "rgba(255,255,255,0.18)";
  }

  function withAlpha66(color) {
    const raw = String(color || "").trim();
    const full = raw.match(/^#([0-9a-fA-F]{6})$/);
    if (full) return `#${full[1]}A6`;
    const short = raw.match(/^#([0-9a-fA-F]{3})$/);
    if (short) {
      const e = short[1]
        .split("")
        .map((c) => c + c)
        .join("");
      return `#${e}A6`;
    }
    return "rgba(128,128,128,0.4)";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES (ported from the app)
  // ═══════════════════════════════════════════════════════════════════════════
  function toOrdinal(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return "";
    if (v % 100 >= 11 && v % 100 <= 13) return `${v}th`;
    if (v % 10 === 1) return `${v}st`;
    if (v % 10 === 2) return `${v}nd`;
    if (v % 10 === 3) return `${v}rd`;
    return `${v}th`;
  }

  function parseClockSecs(mmss) {
    const m = String(mmss || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return NaN;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function pad2(v) {
    return String(Math.max(0, v)).padStart(2, "0");
  }

  function formatRemainingClock(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    const mm = Math.floor(safe / 60);
    const ss = safe % 60;
    return `${mm}:${pad2(ss)}`;
  }

  function formatLocalTime(dateString) {
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return { time: "", ampm: "" };
      let h = d.getHours();
      const m = d.getMinutes();
      const ampm = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      return { time: `${h}:${pad2(m)}`, ampm };
    } catch {
      return { time: "", ampm: "" };
    }
  }

  function isNhlPlayoffGameType(gameType) {
    return Number(gameType) === 3;
  }

  function getNhlExtraPeriodLabel({ number, gameType, longForm = false }) {
    const n = Number(number || 0);
    if (!Number.isFinite(n) || n <= 3) return "";
    if (isNhlPlayoffGameType(gameType)) {
      return longForm ? `${toOrdinal(n)} Overtime` : `OT${n - 3}`;
    }
    if (n === 4) return longForm ? "Overtime" : "OT";
    if (n === 5) return longForm ? "Shootout" : "SO";
    return longForm ? `${toOrdinal(n)} Period` : `P${n}`;
  }

  function getPeriodLabel(number, gameType) {
    const n = Number(number || 0);
    if (!Number.isFinite(n) || n <= 0) return "";
    if (n === 1) return "1st";
    if (n === 2) return "2nd";
    if (n === 3) return "3rd";
    return getNhlExtraPeriodLabel({ number: n, gameType, longForm: false });
  }

  function getPeriodHeaderLabel(number, gameType) {
    const n = Number(number || 0);
    if (!Number.isFinite(n) || n <= 0) return "";
    if (n <= 3) return `${toOrdinal(n)} Period`;
    return getNhlExtraPeriodLabel({ number: n, gameType, longForm: true });
  }

  function getScorerPeriodLabel(number, gameType) {
    const n = Number(number || 0);
    if (!Number.isFinite(n) || n <= 0) return "";
    if (n <= 3) return `${toOrdinal(n)}`;
    return getNhlExtraPeriodLabel({ number: n, gameType, longForm: false });
  }

  function isNhlGameLive(g) {
    const state = String(g?.rawState || "").toUpperCase();
    return state === "LIVE" || state === "CRIT" || state === "IN";
  }

  function isNhlGameFinished(g) {
    const state = String(g?.rawState || "").toUpperCase();
    return ["OFF", "FINAL", "OVER", "POST"].includes(state);
  }

  function getNhlSeasonSpan(now = new Date()) {
    const year = now.getFullYear();
    const month = now.getMonth();
    return month >= 8 ? `${year}${year + 1}` : `${year - 1}${year}`;
  }

  function getNhlMugHeadshotUrl({ seasonCode, teamAbbrev, playerId }) {
    const season = String(seasonCode || "").trim();
    const team = String(teamAbbrev || "")
      .trim()
      .toUpperCase();
    const id = Number(playerId);
    if (!season || !team || !Number.isFinite(id)) return "";
    return `https://assets.nhle.com/mugs/nhl/${season}/${team}/${id}.png`;
  }

  function startCaseFromHyphen(value) {
    return String(value || "")
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  function formatStatLabel(category) {
    return String(category || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  function parseStatPrimaryNumber(value) {
    if (value == null) return 0;
    if (typeof value === "number") return value;
    const raw = String(value).trim();
    const ratio = raw.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (ratio) return Number(ratio[1]) || 0;
    const n = Number(raw.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function toSafeStatValue(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function formatNhlStatVal(key, value) {
    if (value == null || value === "") return "-";
    if (key === "plusMinus") {
      const n = Number(value);
      if (!Number.isFinite(n)) return String(value);
      return n > 0 ? `+${n}` : String(n);
    }
    if (key === "savePctg") {
      const n = Number(value);
      if (!Number.isFinite(n)) return String(value);
      return (n <= 1 ? n * 100 : n).toFixed(1);
    }
    if (/pctg$|pct$/i.test(String(key || ""))) {
      const n = Number(value);
      if (!Number.isFinite(n)) return String(value);
      return (n <= 1 ? n * 100 : n).toFixed(1);
    }
    if (key === "goalsAgainstAvg" || key === "gaa") {
      const n = Number(value);
      if (!Number.isFinite(n)) return String(value);
      return n.toFixed(2);
    }
    if (typeof value === "number") {
      return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }
    return String(value);
  }

  function splitOfficialName(value) {
    const parts = String(value || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return { first: "", last: "" };
    if (parts.length === 1) return { first: parts[0], last: "" };
    return { first: parts[0], last: parts.slice(1).join(" ") };
  }

  function formatPenaltyLine(penalty) {
    const rawType = String(
      penalty?.type || penalty?.typeDescKey || penalty?.typeKey || "Penalty",
    ).trim();
    const type = /^[A-Z0-9]+$/.test(rawType)
      ? rawType
      : startCaseFromHyphen(rawType);
    const desc = startCaseFromHyphen(penalty?.descKey || penalty?.desc || "");
    return desc ? `${type} - ${desc}` : type;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAYER META HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  const NHL_PLAYER_META_KEYS = new Set([
    "playerId",
    "id",
    "personId",
    "sweaterNumber",
    "name",
    "position",
    "firstName",
    "lastName",
    "headshot",
    "teamId",
    "teamAbbrev",
    "teamName",
    "teamSide",
    "decision",
  ]);

  function extractNhlStatsFromEntry(entry) {
    if (!entry || typeof entry !== "object") return {};
    const stats = {};
    Object.entries(entry).forEach(([key, value]) => {
      if (NHL_PLAYER_META_KEYS.has(key)) return;
      if (value == null || value === "") return;
      if (typeof value === "object") return;
      stats[key] = value;
    });
    return stats;
  }

  function buildPlayerMetaById(boxscore) {
    const map = {};
    const byGameStats = boxscore?.playerByGameStats;
    const buckets = [
      byGameStats?.awayTeam?.forwards,
      byGameStats?.awayTeam?.defense,
      byGameStats?.awayTeam?.goalies,
      byGameStats?.homeTeam?.forwards,
      byGameStats?.homeTeam?.defense,
      byGameStats?.homeTeam?.goalies,
    ];
    buckets.forEach((bucket) => {
      (Array.isArray(bucket) ? bucket : []).forEach((entry) => {
        const id = Number(entry?.playerId ?? entry?.id);
        if (!Number.isFinite(id)) return;
        map[id] = {
          id,
          playerId: id,
          name: String(entry?.name || "").trim(),
          firstName: String(
            entry?.firstName?.default || entry?.firstName || "",
          ).trim(),
          lastName: String(
            entry?.lastName?.default || entry?.lastName || "",
          ).trim(),
          sweaterNumber: entry?.sweaterNumber,
          position: String(entry?.position || "").trim(),
          headshot: entry?.headshot || null,
          teamId: Number(entry?.teamId),
          stats: extractNhlStatsFromEntry(entry),
        };
      });
    });
    return map;
  }

  function buildPlayRosterSpots(playPayload) {
    const spots = Array.isArray(playPayload?.rosterSpots)
      ? playPayload.rosterSpots
      : [];
    return spots
      .map((spot) => ({
        playerId: Number(spot?.playerId),
        firstName: String(
          spot?.firstName?.default || spot?.firstName || "",
        ).trim(),
        lastName: String(spot?.lastName?.default || spot?.lastName || "").trim(),
        sweaterNumber: spot?.sweaterNumber,
        positionCode: String(spot?.positionCode || "").trim(),
        teamId: Number(spot?.teamId),
        headshot: spot?.headshot || null,
      }))
      .filter((s) => Number.isFinite(s.playerId));
  }

  function getNhlBoxscoreStatsByPlayerId(g, playerId) {
    const id = Number(playerId);
    if (!Number.isFinite(id)) return {};
    const byGame = g?.boxscorePlayerByGameStats || {};
    const groups = [
      byGame?.awayTeam?.forwards,
      byGame?.awayTeam?.defense,
      byGame?.awayTeam?.goalies,
      byGame?.homeTeam?.forwards,
      byGame?.homeTeam?.defense,
      byGame?.homeTeam?.goalies,
    ];
    for (const group of groups) {
      for (const entry of Array.isArray(group) ? group : []) {
        const entryId = Number(entry?.playerId ?? entry?.id);
        if (entryId === id) return entry;
      }
    }
    return {};
  }

  function getNhlDisplayName(player, g) {
    const id = Number(player?.id ?? player?.playerId);
    if (Number.isFinite(id)) {
      const meta = g?.playerMetaById?.[id];
      if (meta) {
        const full = [meta.firstName, meta.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();
        if (full) return full;
        if (meta.name) return meta.name;
      }
    }
    const directName = [player?.firstName, player?.lastName]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    if (directName) return directName;
    return String(player?.name || "").trim() || "Unknown Player";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMALIZE GAME DATA (backend landing shape)
  // ═══════════════════════════════════════════════════════════════════════════
  function normalizeGameData(details) {
    if (!details) return null;
    const landing = details?.data?.landing;
    if (!landing) return null;

    const away = landing?.awayTeam || {};
    const home = landing?.homeTeam || {};
    const state = String(landing?.gameState || "").toUpperCase();
    const gameDate = landing?.startTimeUTC || landing?.gameDate || "";
    const periodNumber = Number(landing?.periodDescriptor?.number || 0);
    const intermission = landing?.clock?.inIntermission === true;
    const remaining = landing?.clock?.timeRemaining || "";
    const periodType = landing?.periodDescriptor?.periodType || "";

    let statusMain = "FT";
    let statusSub = "Final";
    let isPre = false;
    let isFinished = false;

    if (state === "FUT" || state === "PRE") {
      const dt = new Date(gameDate || Date.now());
      statusMain = dt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      statusSub = dt.toLocaleDateString([], { month: "short", day: "numeric" });
      isPre = true;
    } else if (state === "LIVE" || state === "CRIT") {
      statusMain = remaining || "0:00";
      statusSub = `${toOrdinal(periodNumber) || "1st"} Period`;
    } else if (
      state === "OFF" ||
      state === "FINAL" ||
      state === "OVER" ||
      state === "POST"
    ) {
      const { time, ampm } = formatLocalTime(gameDate);
      statusMain =
        "FT" + (periodType && periodType !== "REG" ? ` (${periodType})` : "");
      statusSub = `${time} ${ampm}`.trim();
      isFinished = true;
    }

    const awayRecord =
      landing?.matchup?.goalieComparison?.awayTeam?.teamTotals?.record ||
      away?.record ||
      "";
    const homeRecord =
      landing?.matchup?.goalieComparison?.homeTeam?.teamTotals?.record ||
      home?.record ||
      "";

    return {
      venue: landing?.venue || "",
      leagueName: "NHL",
      startTimeUtc: gameDate,
      gameState: state,
      statusMain,
      statusSub,
      isPre,
      isFinished,
      rawState: state,
      gameType: Number(landing?.gameType || 0),
      periodNumber,
      intermission,
      clockSecondsRemaining: Number(
        landing?.clock?.secondsRemaining ?? parseClockSecs(remaining),
      ),
      clockRunning: landing?.clock?.running === true,
      away: {
        id: String(away?.id || ""),
        abbreviation: away?.abbrev || "",
        name: away?.commonName || away?.placeName || away?.abbrev || "Away",
        score: Number(away?.score || 0),
        logo: away?.darkLogo || away?.logo || away?.logoLight || null,
        record: String(awayRecord || "").trim(),
      },
      home: {
        id: String(home?.id || ""),
        abbreviation: home?.abbrev || "",
        name: home?.commonName || home?.placeName || home?.abbrev || "Home",
        score: Number(home?.score || 0),
        logo: home?.darkLogo || home?.logo || home?.logoLight || null,
        record: String(homeRecord || "").trim(),
      },
      matchup: landing?.matchup || {},
      summaryScoring: landing?.summary?.scoring || [],
      summaryPenalties: landing?.summary?.penalties || [],
      summaryShootout: landing?.summary?.shootout || null,
      threeStars: landing?.summary?.threeStars || [],
      referees: (details?.data?.rightRail?.gameInfo?.referees || [])
        .map((entry) => String(entry?.default || entry?.name || "").trim())
        .filter(Boolean),
      linesmen: (details?.data?.rightRail?.gameInfo?.linesmen || [])
        .map((entry) => String(entry?.default || entry?.name || "").trim())
        .filter(Boolean),
      lineScoreByPeriod: details?.data?.rightRail?.linescore?.byPeriod || [],
      teamGameStats: details?.data?.rightRail?.teamGameStats || [],
      teamSeasonStats: details?.data?.rightRail?.teamSeasonStats || {},
      seasonSeries: details?.data?.rightRail?.seasonSeries || [],
      shifts: details?.data?.shifts || {},
      plays: details?.data?.plays?.plays || [],
      playerMetaById: buildPlayerMetaById(details?.data?.boxscore),
      playRosterSpots: buildPlayRosterSpots(details?.data?.plays),
      boxscorePlayerByGameStats:
        details?.data?.boxscore?.playerByGameStats || {},
      iceSurface: landing?.summary?.iceSurface || {},
      injuriesByTeam: {
        away: details?.data?.rightRail?.gameInfo?.awayTeam?.scratches || [],
        home: details?.data?.rightRail?.gameInfo?.homeTeam?.scratches || [],
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA ACCESSORS
  // ═══════════════════════════════════════════════════════════════════════════
  function isLive() {
    return isNhlGameLive(game);
  }
  function isFinal() {
    return isNhlGameFinished(game);
  }
  function isScheduled() {
    return !!game?.isPre;
  }

  function statusLine1() {
    if (!game) return "--";
    if (isLive()) return game.statusMain || "0:00";
    if (isFinal()) return game.statusMain || "FT";
    return game.statusMain || "--";
  }
  function statusLine2() {
    if (!game) return "";
    return game.statusSub || "";
  }

  function awayColor() {
    return getTeamColor(game?.away?.abbreviation, "#2563eb");
  }
  function homeColor() {
    return getTeamColor(game?.home?.abbreviation, "#e03131");
  }

  function awayLogo() {
    return (
      game?.away?.logo ||
      `https://assets.nhle.com/logos/nhl/svg/${String(
        game?.away?.abbreviation || "",
      ).toUpperCase()}_light.svg`
    );
  }
  function homeLogo() {
    return (
      game?.home?.logo ||
      `https://assets.nhle.com/logos/nhl/svg/${String(
        game?.home?.abbreviation || "",
      ).toUpperCase()}_light.svg`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ═══════════════════════════════════════════════════════════════════════════
  async function fetchJson(url) {
    try {
      const res = await fetch(url, {
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

  async function fetchGameData() {
    try {
      const url = `${BACKEND}/nhl/game/${encodeURIComponent(gameId)}`;
      rawDetails = await fetchJson(url);
      game = normalizeGameData(rawDetails);
      if (!game) throw new Error("No game data in response");
      renderAll();
      schedulePoll();
    } catch (err) {
      console.error("NHL scoreboard fetch error:", err);
      sbHeader.innerHTML =
        '<div class="sb-error">Failed to load game data. <button onclick="location.reload()">Retry</button></div>';
    }
  }

  async function fetchGameDataQuiet() {
    try {
      const url = `${BACKEND}/nhl/game/${encodeURIComponent(gameId)}`;
      rawDetails = await fetchJson(url);
      const next = normalizeGameData(rawDetails);
      if (next) game = next;
      renderAllQuiet();
      schedulePoll();
    } catch (err) {
      console.error("NHL scoreboard quiet fetch error:", err);
      schedulePoll();
    }
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    if (streamModalVisible) return;
    pollTimer = setTimeout(
      fetchGameDataQuiet,
      isLive() ? POLL_LIVE_MS : POLL_IDLE_MS,
    );
  }

  function renderAll() {
    renderHeader();
    renderTabBars();
    renderPanel("left");
    renderPanel("right");
  }

  function renderAllQuiet() {
    renderHeader();
    if (sbStickyHeader.style.display === "flex") renderStickyHeader();
    renderPanel("left");
    renderPanel("right");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER — mirrors app HeaderGradient + TeamSide + StatusBadge + scorers
  // ═══════════════════════════════════════════════════════════════════════════
  function buildScorers() {
    const awayAbbr = String(game?.away?.abbreviation || "").toUpperCase();
    const homeAbbr = String(game?.home?.abbreviation || "").toUpperCase();
    const awayGoals = [];
    const homeGoals = [];
    const playoffGame = isNhlPlayoffGameType(game?.gameType);

    const addGoal = (bucket, name, timeInPeriod, periodNumber, strength) => {
      bucket.push({ name, timeInPeriod, periodNumber, strength });
    };

    if (Array.isArray(game?.summaryScoring) && game.summaryScoring.length) {
      game.summaryScoring.forEach((periodBlock) => {
        const periodNumber = Number(periodBlock?.periodDescriptor?.number || 0);
        const periodType = String(
          periodBlock?.periodDescriptor?.periodType || "REG",
        ).toUpperCase();
        if (periodType === "SO" || (!playoffGame && periodNumber >= 5)) return;
        const goals = Array.isArray(periodBlock?.goals)
          ? periodBlock.goals
          : [];
        goals.forEach((goal) => {
          const teamAbbr = String(goal?.teamAbbrev || "").toUpperCase();
          const name = getNhlDisplayName(
            {
              id: goal?.scoringPlayerId,
              playerId: goal?.scoringPlayerId,
              firstName: goal?.firstName,
              lastName: goal?.lastName,
              name: goal?.name,
            },
            game,
          );
          const time = goal?.timeInPeriod || goal?.timeRemaining || "";
          const strength = String(goal?.strength || "").toUpperCase();
          if (teamAbbr === awayAbbr)
            addGoal(awayGoals, name, time, periodNumber, strength);
          else if (teamAbbr === homeAbbr)
            addGoal(homeGoals, name, time, periodNumber, strength);
        });
      });
    }

    if (awayGoals.length === 0 && homeGoals.length === 0) {
      (game?.plays || []).forEach((play) => {
        const typeKey = String(play?.typeDescKey || "").toLowerCase();
        if (typeKey !== "goal") return;
        const details = play?.details || {};
        const ownerId = Number(details?.eventOwnerTeamId);
        const periodNumber = Number(play?.periodDescriptor?.number || 0);
        const name = getNhlDisplayName(
          { id: details?.scoringPlayerId, playerId: details?.scoringPlayerId },
          game,
        );
        const time = play?.timeInPeriod || play?.timeRemaining || "";
        if (String(ownerId) === String(game?.away?.id))
          addGoal(awayGoals, name, time, periodNumber, "");
        else if (String(ownerId) === String(game?.home?.id))
          addGoal(homeGoals, name, time, periodNumber, "");
      });
    }

    const formatGroupedByPlayer = (goals) => {
      const byPlayer = new Map();
      goals.forEach((goal) => {
        const key = goal.name || "Unknown";
        if (!byPlayer.has(key)) byPlayer.set(key, []);
        byPlayer.get(key).push(goal);
      });
      const lines = [];
      byPlayer.forEach((list, name) => {
        const count = list.length;
        const moments = list
          .map(
            (goal) =>
              `${goal.timeInPeriod} (${getScorerPeriodLabel(
                goal.periodNumber,
                game?.gameType,
              )}${goal.strength && goal.strength !== "EV" ? ` · ${goal.strength}` : ""})`,
          )
          .join(", ");
        lines.push(`${name}${count > 1 ? ` (${count})` : ""} ${moments}`);
      });
      return lines;
    };

    return {
      away: formatGroupedByPlayer(awayGoals),
      home: formatGroupedByPlayer(homeGoals),
    };
  }

  function renderHeader() {
    if (!game) {
      if (!sbHeader.querySelector(".sb-error"))
        sbHeader.innerHTML = '<div class="sb-error">No game data</div>';
      return;
    }

    const aColor = awayColor();
    const hColor = homeColor();
    const live = isLive();
    const final = isFinal();
    const pre = isScheduled();
    const showScores = !pre;

    const awayScore = game.away.score ?? 0;
    const homeScore = game.home.score ?? 0;
    const awayWon = final && awayScore > homeScore;
    const homeWon = final && homeScore > awayScore;

    const awayAbbr = String(game.away.abbreviation || "AWY").toUpperCase();
    const homeAbbr = String(game.home.abbreviation || "HME").toUpperCase();
    const aLogo = awayLogo();
    const hLogo = homeLogo();

    // Power play detection (from iceSurface penalty boxes)
    const awayBox = game?.iceSurface?.awayTeam?.penaltyBox;
    const homeBox = game?.iceSurface?.homeTeam?.penaltyBox;
    const awayBoxCount = Array.isArray(awayBox) ? awayBox.length : 0;
    const homeBoxCount = Array.isArray(homeBox) ? homeBox.length : 0;
    const awayHasPP = homeBoxCount > 0 && homeBoxCount > awayBoxCount;
    const homeHasPP = awayBoxCount > 0 && awayBoxCount > homeBoxCount;

    const teamSide = (
      team,
      score,
      side,
      color,
      logo,
      abbr,
      isWinner,
      isLoser,
      hasPP,
    ) => {
      const scoreEl = showScores
        ? `<span class="sb-team-score" style="color:${
            final && isLoser ? "var(--text-secondary)" : "var(--text-primary)"
          };font-weight:${isWinner || live ? "800" : "400"}">${esc(score)}</span>`
        : "";
      const logoEl = logo
        ? `<img src="${esc(logo)}" class="sb-team-logo" alt="${esc(
            team.name,
          )}" onerror="this.parentElement.innerHTML='<div class=\\'sb-team-logo-fallback\\' style=\\'background:${color}\\'>${abbr[0]}</div>'">`
        : `<div class="sb-team-logo-fallback" style="background:${color}">${abbr[0]}</div>`;
      const ppBadge = hasPP
        ? `<span class="sb-pp-badge">(PP)</span>`
        : "";
      const logoScoreRow =
        side === "home"
          ? `${scoreEl}<div class="sb-team-logo-wrap">${logoEl}</div>`
          : `<div class="sb-team-logo-wrap">${logoEl}</div>${scoreEl}`;
      return `
        <div class="sb-team-col">
          <a href="team-page.html?id=${esc(team.id)}" class="sb-team-link" style="text-decoration:none">
            <div class="sb-logo-score-row">${logoScoreRow}</div>
            <div class="sb-team-name-row">
              <span class="sb-team-name" style="opacity:${final && !isWinner ? "0.55" : "1"}">${esc(team.name)}</span>
              ${ppBadge}
            </div>
            ${team.record ? `<div class="sb-team-record" style="opacity:${final && !isWinner ? "0.55" : "1"}">${esc(team.record)}</div>` : ""}
          </a>
        </div>`;
    };

    const scorers = buildScorers();
    const hasScorers = scorers.away.length > 0 || scorers.home.length > 0;
    const scorersHtml = hasScorers
      ? `
      <div class="sb-scorers">
        <div class="sb-scorers-side sb-scorers-left">${scorers.away
          .map((line) => `<div class="sb-scorer-text">${esc(line)}</div>`)
          .join("")}</div>
        <div class="sb-scorers-puck">🏒</div>
        <div class="sb-scorers-side sb-scorers-right">${scorers.home
          .map((line) => `<div class="sb-scorer-text">${esc(line)}</div>`)
          .join("")}</div>
      </div>`
      : "";

    const streamBtn =
      live && typeof Auth !== "undefined" && Auth.isLoggedIn
        ? `<button class="sb-stream-btn" id="sbStreamOpen"><span class="sb-stream-dot"></span> Stream</button>`
        : "";

    setPanelHtml(
      sbHeader,
      `
      <div class="sb-header-inner">
        <div class="sb-header-gradient" style="background:linear-gradient(90deg,${aColor}4D 0%,transparent 40%,transparent 60%,${hColor}4D 100%)"></div>
        <div class="sb-league-row">${esc(
          [game.venue, game.leagueName].filter(Boolean).join(" · "),
        )}</div>
        <div class="sb-teams-row">
          ${teamSide(
            game.away,
            awayScore,
            "away",
            aColor,
            aLogo,
            awayAbbr,
            awayWon,
            homeWon,
            awayHasPP,
          )}
          <div class="sb-status-center">
            <div class="sb-status-top" style="color:${
              final
                ? "var(--text-secondary)"
                : pre
                  ? "var(--text-primary)"
                  : "var(--accent-success, #27ae60)"
            }">${esc(statusLine1())}</div>
            ${statusLine2() ? `<div class="sb-status-bottom">${esc(statusLine2())}</div>` : ""}
            ${streamBtn}
          </div>
          ${teamSide(
            game.home,
            homeScore,
            "home",
            hColor,
            hLogo,
            homeAbbr,
            homeWon,
            awayWon,
            homeHasPP,
          )}
        </div>
        ${scorersHtml}
      </div>`,
    );
  }

  function renderStickyHeader() {
    if (!game) return;
    const final = isFinal();
    const pre = isScheduled();
    const live = isLive();
    const awayScore = game.away.score ?? 0;
    const homeScore = game.home.score ?? 0;
    const awayWon = final && awayScore > homeScore;
    const homeWon = final && homeScore > awayScore;
    const awayAbbr = String(game.away.abbreviation || "AWY").toUpperCase();
    const homeAbbr = String(game.home.abbreviation || "HME").toUpperCase();
    const aLogo = awayLogo();
    const hLogo = homeLogo();

    sbStickyHeader.innerHTML = `
      <div class="sb-sticky-inner">
        <div class="sb-sticky-gradient" style="background:linear-gradient(90deg,${awayColor()}4D,transparent 30%,transparent 70%,${homeColor()}4D)"></div>
        <div class="sb-sticky-side">
          ${aLogo ? `<img src="${esc(aLogo)}" class="sb-sticky-logo" onerror="this.style.display='none'">` : ""}
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
          ${hLogo ? `<img src="${esc(hLogo)}" class="sb-sticky-logo" onerror="this.style.display='none'">` : ""}
        </div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB BARS — app tabs: Main / Away / Home / Stats / Plays / Shifts / Series
  // ═══════════════════════════════════════════════════════════════════════════
  function allTabs() {
    const base = ["Main", "Away", "Home", "Stats", "Plays", "Shifts", "Series"];
    if (isScheduled()) return base.filter((t) => t !== "Plays" && t !== "Shifts");
    return base;
  }

  function renderTabBars() {
    const tabs = allTabs();
    if (splitViewActive) {
      renderOneTabBar(sbLeftTabs, "left", tabs, true);
      return;
    }
    renderOneTabBar(sbLeftTabs, "left", tabs);
    renderOneTabBar(sbRightTabs, "right", tabs);
  }

  function renderOneTabBar(container, side, tabs, noDisable) {
    const currentTab = side === "left" ? leftTab : rightTab;
    const tabsHtml = tabs
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
        renderTabBars();
        renderPanel(side);
      });
    });
  }

  function renderPanel(side) {
    const tab = side === "left" ? leftTab : rightTab;
    const body = side === "left" ? sbLeftBody : sbRightBody;
    if (!game) return;

    switch (tab) {
      case "Main":
        renderMainPanel(body, side);
        break;
      case "Away":
        renderRosterPanel(body, side, "away");
        break;
      case "Home":
        renderRosterPanel(body, side, "home");
        break;
      case "Stats":
        renderStatsPanel(body, side);
        break;
      case "Plays":
        renderPlaysPanel(body, side);
        break;
      case "Shifts":
        renderShiftsPanel(body, side);
        break;
      case "Series":
        renderSeriesPanel(body, side);
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN PANEL
  // ═══════════════════════════════════════════════════════════════════════════
  function renderMainPanel(body, side) {
    const aColor = awayColor();
    const hColor = homeColor();
    let html = "";
    html += renderSkaterComparison(aColor, hColor);
    html += renderGoalieComparison(aColor, hColor);
    html += renderLinescore(aColor, hColor);
    if (isLive()) html += renderLivePlay();
    html += renderEvents();
    html += renderThreeStars();
    html += renderOfficials();
    setPanelHtml(
      body,
      html || '<div class="sb-empty">No game information available</div>',
    );
    wireMainPanel(body, side);
  }

  function wireMainPanel(body, side) {
    body.querySelectorAll("[data-player]").forEach((el) => {
      el.addEventListener("click", () => {
        try {
          const p = JSON.parse(el.dataset.player);
          openPlayerModal(p);
        } catch (e) {
          /* ignore */
        }
      });
    });
  }

  // ── Skater comparison ──────────────────────────────────────────────────────
  function renderSkaterComparison(aColor, hColor) {
    const leaders = Array.isArray(game?.matchup?.skaterComparison?.leaders)
      ? game.matchup.skaterComparison.leaders
      : [];
    const rows = leaders
      .map((entry, idx) => {
        const awayLeader = entry?.awayLeader || null;
        const homeLeader = entry?.homeLeader || null;
        if (!awayLeader && !homeLeader) return null;
        return {
          key: `skater-${idx}`,
          category: String(entry?.category || "Comparison").toUpperCase(),
          awayLeader,
          homeLeader,
        };
      })
      .filter(Boolean);
    if (!rows.length) return "";

    const nameParts = (leader) => {
      const first = String(leader?.firstName || "").trim();
      const last = String(leader?.lastName || "").trim();
      if (first || last) return { first, last };
      const name = String(leader?.name || "").trim();
      if (!name) return { first: "", last: "" };
      const bits = name.split(/\s+/).filter(Boolean);
      if (bits.length === 1) return { first: bits[0], last: "" };
      return { first: bits.slice(0, -1).join(" "), last: bits[bits.length - 1] };
    };

    const headshot = (leader, side, color) => {
      const abbr = side === "away" ? game.away.abbreviation : game.home.abbreviation;
      const mug = getNhlMugHeadshotUrl({
        seasonCode: getNhlSeasonSpan(),
        teamAbbrev: abbr,
        playerId: leader?.playerId,
      });
      const src = mug || leader?.headshot || "";
      const pos = String(leader?.positionCode || "-").toUpperCase();
      const playerJson = esc(
        JSON.stringify({
          id: Number(leader?.playerId),
          name: [leader?.firstName, leader?.lastName]
            .filter(Boolean)
            .join(" ")
            .trim(),
          position: leader?.positionCode,
          teamSide: side,
          teamAbbrev: abbr,
          headshot: leader?.headshot || null,
          stats: Number.isFinite(Number(leader?.value))
            ? { [String(leader?.category || "").toLowerCase()]: Number(leader.value) }
            : {},
        }),
      );
      return `
        <div class="sb-mh-wrap" data-player="${playerJson}" style="border-color:${color};background:${withAlpha66(color)}">
          ${src ? `<img class="sb-mh-img" src="${esc(src)}" alt="" onerror="this.style.display='none'">` : `<div class="sb-mh-fallback">👤</div>`}
          <span class="sb-mh-pos" style="border-color:${color}">${esc(pos)}</span>
        </div>`;
    };

    return rows
      .map((row) => {
        const awayName = nameParts(row.awayLeader);
        const homeName = nameParts(row.homeLeader);
        const awayValue = row.awayLeader?.value ?? "-";
        const homeValue = row.homeLeader?.value ?? "-";
        const aNum = Number(row.awayLeader?.value);
        const hNum = Number(row.homeLeader?.value);
        const safeA = Number.isFinite(aNum) ? aNum : 0;
        const safeH = Number.isFinite(hNum) ? hNum : 0;
        const total = safeA + safeH;
        const aFlex = total > 0 ? safeA : 1;
        const hFlex = total > 0 ? safeH : 1;
        return `
        <div class="sb-matchup-card">
          <div class="sb-matchup-header">${esc(row.category)} - LAST 5 GAMES</div>
          <div class="sb-matchup-skater-body">
            <div class="sb-matchup-side sb-matchup-side-away">
              ${row.awayLeader ? headshot(row.awayLeader, "away", aColor) : ""}
              <div class="sb-matchup-name-away">
                <div class="sb-matchup-first">${esc(awayName.first || "-")}</div>
                <div class="sb-matchup-last">${esc(awayName.last || "-")}</div>
              </div>
            </div>
            <div class="sb-matchup-vs">VS</div>
            <div class="sb-matchup-side sb-matchup-side-home">
              <div class="sb-matchup-name-home">
                <div class="sb-matchup-first">${esc(homeName.first || "-")}</div>
                <div class="sb-matchup-last">${esc(homeName.last || "-")}</div>
              </div>
              ${row.homeLeader ? headshot(row.homeLeader, "home", hColor) : ""}
            </div>
          </div>
          <div class="sb-matchup-fill-row">
            <div class="sb-matchup-fill" style="background:${aColor};flex:${aFlex}">${esc(awayValue)}</div>
            <div class="sb-matchup-fill-div"></div>
            <div class="sb-matchup-fill" style="background:${hColor};flex:${hFlex}">${esc(homeValue)}</div>
          </div>
        </div>`;
      })
      .join("");
  }

  // ── Goalie comparison ──────────────────────────────────────────────────────
  function renderGoalieComparison(aColor, hColor) {
    const awayLeaders = Array.isArray(
      game?.matchup?.goalieComparison?.awayTeam?.leaders,
    )
      ? game.matchup.goalieComparison.awayTeam.leaders
      : [];
    const homeLeaders = Array.isArray(
      game?.matchup?.goalieComparison?.homeTeam?.leaders,
    )
      ? game.matchup.goalieComparison.homeTeam.leaders
      : [];
    if (!awayLeaders.length && !homeLeaders.length) return "";

    const formatPct = (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return "-";
      return `${(n <= 1 ? n * 100 : n).toFixed(1)}%`;
    };
    const formatGaa = (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return "-";
      return n.toFixed(2);
    };
    const metricsFor = (leader) => [
      { label: "GP", value: Number(leader?.gamesPlayed ?? 0) },
      { label: "SP", value: Number(leader?.seasonPoints ?? 0) },
      { label: "RCD", value: String(leader?.record || "-") },
      { label: "GAA", value: formatGaa(leader?.gaa) },
      { label: "SV%", value: formatPct(leader?.savePcts ?? leader?.savePctg) },
      { label: "SO", value: Number(leader?.shutouts ?? 0) },
    ];

    const goalieRow = (leader, side, color) => {
      const fullName =
        [leader?.firstName, leader?.lastName].filter(Boolean).join(" ").trim() ||
        "-";
      const abbr = side === "away" ? game.away.abbreviation : game.home.abbreviation;
      const mug = getNhlMugHeadshotUrl({
        seasonCode: getNhlSeasonSpan(),
        teamAbbrev: abbr,
        playerId: leader?.playerId,
      });
      const src = mug || leader?.headshot || "";
      const playerJson = esc(
        JSON.stringify({
          id: Number(leader?.playerId),
          name: fullName,
          position: leader?.positionCode || "G",
          teamSide: side,
          teamAbbrev: abbr,
          headshot: leader?.headshot || null,
          stats: {
            gamesPlayed: Number(leader?.gamesPlayed),
            wins: Number(leader?.wins),
            losses: Number(leader?.losses),
            otLosses: Number(leader?.otLosses),
            savePctg: Number(leader?.savePcts ?? leader?.savePctg),
            gaa: Number(leader?.gaa),
            shutouts: Number(leader?.shutouts),
          },
        }),
      );
      const info = `
        <div class="sb-goalie-info sb-goalie-info-${side}">
          <div class="sb-goalie-name">${esc(fullName)}</div>
          <div class="sb-goalie-stats">
            ${metricsFor(leader)
              .map(
                (m) =>
                  `<div class="sb-goalie-stat"><div class="sb-goalie-stat-val">${esc(m.value)}</div><div class="sb-goalie-stat-lbl">${esc(m.label)}</div></div>`,
              )
              .join("")}
          </div>
        </div>`;
      const avatar = `
        <div class="sb-mh-wrap" data-player="${playerJson}" style="border-color:${color};background:${withAlpha66(color)}">
          ${src ? `<img class="sb-mh-img" src="${esc(src)}" alt="" onerror="this.style.display='none'">` : `<div class="sb-mh-fallback">👤</div>`}
          <span class="sb-mh-pos" style="border-color:${color}">G</span>
        </div>`;
      return `
        <div class="sb-goalie-row sb-goalie-row-${side}">
          ${side === "home" ? info : ""}
          ${avatar}
          ${side === "away" ? info : ""}
        </div>`;
    };

    return `
      <div class="sb-matchup-card">
        <div class="sb-matchup-header">GOALIE COMPARISON</div>
        ${
          awayLeaders.length
            ? `<div class="sb-goalie-body" style="background:linear-gradient(90deg,${withAlpha30(aColor)},transparent 70%)">${awayLeaders
                .map((l) => goalieRow(l, "away", aColor))
                .join("")}</div>`
            : ""
        }
        ${
          homeLeaders.length
            ? `<div class="sb-goalie-body" style="background:linear-gradient(270deg,${withAlpha30(hColor)},transparent 70%)">${homeLeaders
                .map((l) => goalieRow(l, "home", hColor))
                .join("")}</div>`
            : ""
        }
      </div>`;
  }

  // ── Linescore ──────────────────────────────────────────────────────────────
  function renderLinescore(aColor, hColor) {
    const byPeriod = Array.isArray(game?.lineScoreByPeriod)
      ? game.lineScoreByPeriod
      : [];
    if (!byPeriod.length) return "";
    const awayAbbr = String(game.away.abbreviation || "AWY").toUpperCase();
    const homeAbbr = String(game.home.abbreviation || "HME").toUpperCase();
    const awayTotal = Number(game.away.score ?? 0);
    const homeTotal = Number(game.home.score ?? 0);

    const sogStat = (game.teamGameStats || []).find(
      (row) => String(row?.category || "").toLowerCase() === "sog",
    );
    const awaySog = Number.isFinite(Number(sogStat?.awayValue))
      ? Number(sogStat.awayValue)
      : 0;
    const homeSog = Number.isFinite(Number(sogStat?.homeValue))
      ? Number(sogStat.homeValue)
      : 0;

    const periodCells = byPeriod
      .map(
        (row, idx) => `
        <div class="sb-ls-col">
          <div class="sb-ls-cell sb-ls-head">${idx + 1 <= 3 ? idx + 1 : getNhlExtraPeriodLabel({ number: idx + 1, gameType: game.gameType, longForm: false })}</div>
          <div class="sb-ls-cell" style="border-bottom:2px solid ${aColor}">${Number(row?.away ?? 0)}</div>
          <div class="sb-ls-cell" style="border-bottom:2px solid ${hColor}">${Number(row?.home ?? 0)}</div>
        </div>`,
      )
      .join("");

    return `
      <div class="sb-linescore">
        <div class="sb-ls-grid">
          <div class="sb-ls-col sb-ls-label-col">
            <div class="sb-ls-cell sb-ls-head"></div>
            <div class="sb-ls-cell" style="border-bottom:2px solid ${aColor}"><span class="sb-ls-abbr">${awayAbbr}</span></div>
            <div class="sb-ls-cell" style="border-bottom:2px solid ${hColor}"><span class="sb-ls-abbr">${homeAbbr}</span></div>
          </div>
          <div class="sb-ls-scroll">${periodCells}</div>
          <div class="sb-ls-col sb-ls-total-col">
            <div class="sb-ls-cell sb-ls-head"><span>T</span></div>
            <div class="sb-ls-cell" style="border-bottom:2px solid ${aColor}">${awayTotal}</div>
            <div class="sb-ls-cell" style="border-bottom:2px solid ${hColor}">${homeTotal}</div>
          </div>
          <div class="sb-ls-col sb-ls-total-col">
            <div class="sb-ls-cell sb-ls-head"><span>SOG</span></div>
            <div class="sb-ls-cell" style="border-bottom:2px solid ${aColor}">${awaySog}</div>
            <div class="sb-ls-cell" style="border-bottom:2px solid ${hColor}">${homeSog}</div>
          </div>
        </div>
      </div>`;
  }

  // ── Live play (latest coordinate play) ─────────────────────────────────────
  // Resolve a player profile for a play participant (mirrors app resolvePlayPlayer)
  function resolveLivePlayPlayer(playerId, sideHint) {
    const id = Number(playerId);
    if (!Number.isFinite(id)) return null;
    const awayTeamId = Number(game?.away?.id);
    const homeTeamId = Number(game?.home?.id);
    const profile = game?.playerMetaById?.[id] || {};
    const roster = (game?.playRosterSpots || []).find(
      (s) => Number(s?.playerId) === id,
    ) || {};
    const boxscoreEntry = getNhlBoxscoreStatsByPlayerId(game, id) || {};
    const extractedStats = extractNhlStatsFromEntry(boxscoreEntry || {});

    const teamId = Number(profile?.teamId ?? roster?.teamId);
    let teamSide =
      teamId === awayTeamId
        ? "away"
        : teamId === homeTeamId
          ? "home"
          : sideHint || null;
    if (teamSide !== "away" && teamSide !== "home") teamSide = sideHint || null;
    if (!teamSide) return null;

    const first = String(roster?.firstName || profile?.firstName || "").trim();
    const last = String(roster?.lastName || profile?.lastName || "").trim();
    const fullFromParts = [first, last].filter(Boolean).join(" ").trim();
    const fullName =
      getNhlDisplayName({ id, playerId: id }, game) ||
      fullFromParts ||
      String(profile?.name || boxscoreEntry?.name || "").trim() ||
      "Unknown Player";

    const number = Number(
      profile?.sweaterNumber ??
        roster?.sweaterNumber ??
        boxscoreEntry?.sweaterNumber,
    );
    const position = String(
      profile?.position ||
        roster?.positionCode ||
        boxscoreEntry?.position ||
        "",
    )
      .trim()
      .toUpperCase();

    const abbr =
      teamSide === "home"
        ? String(game?.home?.abbreviation || "HME").toUpperCase()
        : String(game?.away?.abbreviation || "AWY").toUpperCase();

    const stats = { ...(profile?.stats || {}), ...(extractedStats || {}) };
    const toi =
      String(stats?.toi ?? boxscoreEntry?.toi ?? profile?.stats?.toi ?? "").trim() ||
      "-";

    return {
      id,
      playerId: id,
      name: fullName,
      number: Number.isFinite(number) ? number : null,
      position,
      teamAbbrev: abbr,
      teamSide,
      headshot:
        String(
          profile?.headshot ||
            roster?.headshot ||
            boxscoreEntry?.headshot ||
            "",
        ).trim() || null,
      stats: { ...stats, toi },
    };
  }

  function buildLivePlayStatItems(player) {
    const isGoalie =
      String(player?.position || "").trim().toUpperCase() === "G";
    if (isGoalie) {
      const formatSavePct = (value) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return "-";
        return `${(n <= 1 ? n * 100 : n).toFixed(1)}%`;
      };
      return [
        { label: "GA", value: toSafeStatValue(player?.stats?.goalsAgainst) },
        { label: "SA", value: toSafeStatValue(player?.stats?.shotsAgainst) },
        { label: "SV", value: toSafeStatValue(player?.stats?.saves) },
        { label: "SV%", value: formatSavePct(player?.stats?.savePctg) },
        { label: "TOI", value: String(player?.stats?.toi || "-") },
      ];
    }
    const plusMinusRaw = Number(player?.stats?.plusMinus);
    const plusMinusDisplay = Number.isFinite(plusMinusRaw)
      ? plusMinusRaw > 0
        ? `+${plusMinusRaw}`
        : String(plusMinusRaw)
      : "-";
    return [
      { label: "GLS", value: toSafeStatValue(player?.stats?.goals) },
      { label: "AST", value: toSafeStatValue(player?.stats?.assists) },
      { label: "PTS", value: toSafeStatValue(player?.stats?.points) },
      { label: "+/-", value: plusMinusDisplay },
      { label: "TOI", value: String(player?.stats?.toi || "-") },
    ];
  }

  function livePlayHeadshot(player, side, teamColor) {
    const mug = getNhlMugHeadshotUrl({
      seasonCode: getNhlSeasonSpan(),
      teamAbbrev: player?.teamAbbrev,
      playerId: player?.id,
    });
    const src = mug || player?.headshot || "";
    const pos = String(player?.position || "-").toUpperCase();
    const logo =
      side === "home" ? homeLogo() : awayLogo();
    const playerJson = esc(JSON.stringify(player));
    return `
      <div class="sb-lp-hs" data-player="${playerJson}" style="border-color:${teamColor};background:${withAlpha66(teamColor)}">
        ${src ? `<img class="sb-lp-hs-img" src="${esc(src)}" alt="" onerror="this.style.display='none'">` : `<div class="sb-lp-hs-fallback">👤</div>`}
        <span class="sb-lp-hs-logo ${side === "away" ? "away" : "home"}" style="border-color:${teamColor};background:${withAlpha66(teamColor)}">
          <img src="${esc(logo)}" alt="" onerror="this.style.display='none'">
        </span>
        <span class="sb-lp-hs-pos ${side === "away" ? "away" : "home"}" style="border-color:${teamColor}">${esc(pos)}</span>
      </div>`;
  }

  function livePlayPlayerRow(player, side, teamColor) {
    const number =
      player?.number != null && Number.isFinite(Number(player.number))
        ? `#${Number(player.number)}`
        : "";
    const meta = [player?.teamAbbrev, number, player?.position]
      .filter(Boolean)
      .join(" · ");
    const statItems = buildLivePlayStatItems(player);
    const info = `
      <div class="sb-lp-info ${side === "home" ? "home" : "away"}">
        <div class="sb-lp-name">${esc(player?.name || "Unknown Player")}</div>
        ${meta ? `<div class="sb-lp-meta">${esc(meta)}</div>` : ""}
        <div class="sb-lp-stats ${side === "home" ? "home" : "away"}">
          ${statItems
            .map(
              (s) =>
                `<div class="sb-lp-stat"><div class="sb-lp-stat-val">${esc(String(s.value))}</div><div class="sb-lp-stat-lbl">${esc(s.label)}</div></div>`,
            )
            .join("")}
        </div>
      </div>`;
    const hs = livePlayHeadshot(player, side, teamColor);
    return `
      <div class="sb-lp-row ${side === "home" ? "home" : "away"}">
        ${side === "home" ? info : ""}
        ${hs}
        ${side === "away" ? info : ""}
      </div>`;
  }

  function renderLivePlay() {
    const plays = Array.isArray(game?.plays) ? game.plays : [];
    const awayTeamId = Number(game?.away?.id);
    const homeTeamId = Number(game?.home?.id);
    const rows = plays
      .map((play, idx) => {
        const details = play?.details || {};
        const x = Number(details?.xCoord);
        const y = Number(details?.yCoord);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const ownerId = Number(details?.eventOwnerTeamId);
        const side =
          ownerId === awayTeamId ? "away" : ownerId === homeTeamId ? "home" : null;
        if (!side) return null;
        const period = Number(play?.periodDescriptor?.number || 0);
        const remaining = parseClockSecs(play?.timeRemaining);
        const periodType = String(
          play?.periodDescriptor?.periodType || "",
        ).toUpperCase();
        const playoff = isNhlPlayoffGameType(game?.gameType);
        const shootout = periodType === "SO" || (!playoff && period >= 5);
        const ot = !shootout && (periodType === "OT" || period > 3);
        const len = shootout ? 0 : ot ? (playoff ? 1200 : 300) : 1200;
        const elapsed = Number.isFinite(remaining)
          ? Math.max(0, len - remaining)
          : 0;
        return {
          idx,
          sortKey: period * 100000 + elapsed * 10 + idx,
          typeKey: String(play?.typeDescKey || "update").toLowerCase(),
          period,
          timeRemaining: String(play?.timeRemaining || "--:--"),
          side,
          x,
          y,
          details,
          homeTeamDefendingSide: String(play?.homeTeamDefendingSide || "")
            .trim()
            .toLowerCase(),
          awayScore: Number(details?.awayScore),
          homeScore: Number(details?.homeScore),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.sortKey - a.sortKey);

    const active = rows[0] || null;
    const aColor = awayColor();
    const hColor = homeColor();

    if (!active) {
      return `
        <div class="sb-card">
          <div class="sb-card-header"><span class="sb-card-title">Live Play</span></div>
          <div class="sb-empty">No live coordinate plays yet</div>
        </div>`;
    }

    const teamColor = active.side === "home" ? hColor : aColor;
    const abbr = String(
      active.side === "home"
        ? game.home.abbreviation
        : game.away.abbreviation,
    ).toUpperCase();
    const scoreText =
      Number.isFinite(active.awayScore) && Number.isFinite(active.homeScore)
        ? `${active.awayScore} - ${active.homeScore}`
        : `${game.away.score} - ${game.home.score}`;

    // Resolve tagged players for this play (owner side vs opponent side)
    const opposite = (s) => (s === "home" ? "away" : "home");
    const ownerKeys = new Set([
      "playerId",
      "scoringPlayerId",
      "shootingPlayerId",
      "hittingPlayerId",
      "committedByPlayerId",
      "winningPlayerId",
      "assist1PlayerId",
      "assist2PlayerId",
    ]);
    const opponentKeys = new Set([
      "hitteePlayerId",
      "blockingPlayerId",
      "drawnByPlayerId",
      "losingPlayerId",
      "goalieInNetId",
      "goalieId",
    ]);
    const playerIdKeys = [
      "playerId",
      "scoringPlayerId",
      "shootingPlayerId",
      "hittingPlayerId",
      "hitteePlayerId",
      "blockingPlayerId",
      "winningPlayerId",
      "losingPlayerId",
      "committedByPlayerId",
      "drawnByPlayerId",
      "goalieInNetId",
      "goalieId",
      "assist1PlayerId",
      "assist2PlayerId",
    ];
    const playersBySide = { away: [], home: [] };
    const seen = new Set();
    playerIdKeys.forEach((key) => {
      const sideHint = ownerKeys.has(key)
        ? active.side
        : opponentKeys.has(key)
          ? opposite(active.side)
          : null;
      const resolved = resolveLivePlayPlayer(active.details?.[key], sideHint);
      if (!resolved || !resolved.teamSide) return;
      const dedupeKey = `id_${resolved.id}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      playersBySide[resolved.teamSide].push(resolved);
    });

    const topSide = active.side === "home" ? "home" : "away";
    const bottomSide = topSide === "home" ? "away" : "home";

    const teamBlock = (side) => {
      const color = side === "home" ? hColor : aColor;
      const teamAbbr = String(
        side === "home" ? game.home.abbreviation : game.away.abbreviation,
      ).toUpperCase();
      const teamName = String(
        side === "home" ? game.home.name : game.away.name,
      ).toUpperCase();
      const sidePlayers = playersBySide[side] || [];
      return `
        <div class="sb-lp-team" style="background:linear-gradient(${side === "home" ? "270deg" : "90deg"},${withAlpha30(color)},transparent 70%)">
          <div class="sb-lp-team-head">
            <span style="color:${color}">${esc(teamName || teamAbbr)}</span>
            <span>${side === active.side ? "ON PLAY" : "OPPONENT"}</span>
          </div>
          ${
            sidePlayers.length
              ? sidePlayers
                  .map((p) => livePlayPlayerRow(p, side, color))
                  .join("")
              : `<div class="sb-lp-none">No players tagged for this side</div>`
          }
        </div>`;
    };

    return `
      <div class="sb-card">
        <div class="sb-card-header">
          <span class="sb-card-accent" style="background:${teamColor}"></span>
          <span class="sb-card-title">Live Play</span>
        </div>
        <div class="sb-liveplay-body">
          <div class="sb-liveplay-meta">
            <span class="sb-liveplay-type">${esc(startCaseFromHyphen(active.typeKey).toUpperCase())}</span>
            <span class="sb-liveplay-time">${esc(active.timeRemaining)} • ${esc(getScorerPeriodLabel(active.period, game.gameType))}</span>
          </div>
          <div class="sb-liveplay-meta">
            <span class="sb-liveplay-team" style="color:${teamColor}">${esc(abbr)}</span>
            <span class="sb-liveplay-score">${esc(scoreText)}</span>
          </div>
          <div class="sb-liveplay-rink" style="border-color:${teamColor}">
            ${rinkSvg({
              xCoord: active.x,
              yCoord: active.y,
              teamColor,
              teamSide: active.side,
              homeTeamDefendingSide: active.homeTeamDefendingSide,
              isScoring: active.typeKey === "goal",
              showTargetPath:
                active.typeKey === "shot-on-goal" || active.typeKey === "goal",
            })}
          </div>
          <div class="sb-lp-players">
            ${teamBlock(topSide)}
            ${teamBlock(bottomSide)}
          </div>
        </div>
      </div>`;
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  function renderEvents() {
    const byPeriod = Array.isArray(game?.lineScoreByPeriod)
      ? game.lineScoreByPeriod
      : [];
    const periodMap = new Map();
    const pushEvent = (periodNumber, event) => {
      const p = Number(periodNumber || 0);
      if (!p) return;
      if (!periodMap.has(p)) periodMap.set(p, []);
      periodMap.get(p).push(event);
    };

    const cumulativeMap = new Map();
    const periodOnlyMap = new Map();
    let awayTotal = 0;
    let homeTotal = 0;
    byPeriod.forEach((row, idx) => {
      const period = idx + 1;
      const away = Number(row?.away || 0);
      const home = Number(row?.home || 0);
      awayTotal += away;
      homeTotal += home;
      cumulativeMap.set(period, { away: awayTotal, home: homeTotal });
      periodOnlyMap.set(period, { away, home });
    });

    const awayAbbr = String(game?.away?.abbreviation || "").toUpperCase();
    const homeAbbr = String(game?.home?.abbreviation || "").toUpperCase();
    const playoff = isNhlPlayoffGameType(game?.gameType);

    (game?.summaryScoring || []).forEach((periodBlock) => {
      const periodNumber = Number(periodBlock?.periodDescriptor?.number || 0);
      const periodType = String(
        periodBlock?.periodDescriptor?.periodType || "REG",
      ).toUpperCase();
      if (periodType === "SO" || (!playoff && periodNumber >= 5)) return;
      (Array.isArray(periodBlock?.goals) ? periodBlock.goals : []).forEach(
        (goal) => {
          const scorerId = Number(goal?.scoringPlayerId);
          const name = getNhlDisplayName(
            {
              id: scorerId,
              playerId: scorerId,
              firstName: goal?.firstName,
              lastName: goal?.lastName,
              name: goal?.name,
            },
            game,
          );
          const assists = (Array.isArray(goal?.assists) ? goal.assists : [])
            .map((a) => {
              const aid = Number(a?.playerId ?? a?.id);
              return Number.isFinite(aid)
                ? getNhlDisplayName({ id: aid, playerId: aid }, game)
                : String(a?.name || "").trim();
            })
            .filter(Boolean);
          pushEvent(periodNumber, {
            type: "goal",
            teamAbbr: String(goal?.teamAbbrev || "").toUpperCase(),
            timeInPeriod: goal?.timeInPeriod || goal?.timeRemaining || "",
            sortSecs: parseClockSecs(goal?.timeInPeriod || goal?.timeRemaining),
            mainText: name,
            subText: assists.length ? `Assists: ${assists.join(", ")}` : "",
            strength: String(goal?.strength || "").toUpperCase(),
            awayScoreAfter: Number(goal?.awayScore ?? goal?.scoreAway),
            homeScoreAfter: Number(goal?.homeScore ?? goal?.scoreHome),
            period: periodNumber,
          });
        },
      );
    });

    (game?.summaryPenalties || []).forEach((penaltyOrBlock) => {
      const blockPeriod = Number(
        penaltyOrBlock?.periodDescriptor?.number ||
          penaltyOrBlock?.period ||
          0,
      );
      const penalties = Array.isArray(penaltyOrBlock?.penalties)
        ? penaltyOrBlock.penalties
        : [penaltyOrBlock];
      penalties.forEach((penalty) => {
        if (!penalty || typeof penalty !== "object") return;
        const periodNumber = Number(
          penalty?.periodDescriptor?.number ||
            penalty?.period ||
            blockPeriod ||
            byPeriod.length ||
            game?.periodNumber ||
            1,
        );
        const committedBy = penalty?.committedByPlayer || {};
        const pid = Number(
          penalty?.committedByPlayerId ??
            penalty?.playerId ??
            committedBy?.playerId ??
            committedBy?.id,
        );
        const name = Number.isFinite(pid)
          ? getNhlDisplayName({ id: pid, playerId: pid }, game)
          : [committedBy?.firstName, committedBy?.lastName]
              .filter(Boolean)
              .join(" ")
              .trim();
        pushEvent(periodNumber, {
          type: "penalty",
          teamAbbr: String(penalty?.teamAbbrev || "").toUpperCase(),
          timeInPeriod: penalty?.timeInPeriod || penalty?.timeRemaining || "",
          sortSecs: parseClockSecs(
            penalty?.timeInPeriod || penalty?.timeRemaining,
          ),
          mainText: name || "Penalty",
          subText: formatPenaltyLine(penalty),
          period: periodNumber,
        });
      });
    });

    const maxPeriod = Math.max(
      Number(game?.periodNumber || 0),
      byPeriod.length,
      Math.max(0, ...Array.from(periodMap.keys())),
    );
    if (maxPeriod <= 0) return "";
    const allPeriods = Array.from({ length: maxPeriod }, (_, i) => i + 1);
    const live = isLive();
    const ordered = live ? [...allPeriods].reverse() : allPeriods;

    const periodsHtml = ordered
      .map((period) => {
        const rows = (periodMap.get(period) || []).sort((a, b) =>
          live ? b.sortSecs - a.sortSecs : a.sortSecs - b.sortSecs,
        );
        const total = cumulativeMap.get(period) || {
          away: game?.away?.score ?? 0,
          home: game?.home?.score ?? 0,
        };
        const periodScore = periodOnlyMap.get(period) || { away: 0, home: 0 };
        const divider = `
          <div class="sb-period-divider">
            <div class="sb-period-line"></div>
            <div class="sb-period-badge">
              <span class="sb-period-label">${esc(getPeriodHeaderLabel(period, game?.gameType))}</span>
              <span class="sb-period-score">${periodScore.away} - ${periodScore.home} (${total.away} - ${total.home})</span>
            </div>
            <div class="sb-period-line"></div>
          </div>`;
        const eventsHtml = rows.length
          ? rows
              .map((event) => {
                const isAway = event.teamAbbr === awayAbbr;
                const showScore =
                  event.type === "goal" &&
                  event.homeScoreAfter != null &&
                  event.awayScoreAfter != null;
                const icon = event.type === "goal" ? "🏒" : "🚫";
                return `
                  <div class="sb-event-lane ${isAway ? "away" : "home"}">
                    <div class="sb-event-inline">
                      ${isAway ? `<span class="sb-event-time">${esc(event.timeInPeriod)}</span><span class="sb-event-icon">${icon}</span>` : ""}
                      <div class="sb-event-text-block ${isAway ? "" : "away"}">
                        <div class="sb-event-text">${esc(event.mainText)}${showScore ? ` (${event.awayScoreAfter} - ${event.homeScoreAfter})${event.strength && event.strength !== "EV" ? ` · ${event.strength}` : ""}` : ""}</div>
                        ${event.subText ? `<div class="sb-event-sub">${esc(event.subText)}</div>` : ""}
                      </div>
                      ${!isAway ? `<span class="sb-event-icon">${icon}</span><span class="sb-event-time">${esc(event.timeInPeriod)}</span>` : ""}
                    </div>
                  </div>`;
              })
              .join("")
          : `<div class="sb-no-events">NO EVENTS</div>`;
        return `<div class="sb-period-block">${live ? divider : ""}${eventsHtml}${!live ? divider : ""}</div>`;
      })
      .join("");

    return `
      <div class="sb-card">
        <div class="sb-card-header"><span class="sb-card-title">Events</span></div>
        <div class="sb-events-body">${periodsHtml}</div>
      </div>`;
  }

  // ── Three stars ────────────────────────────────────────────────────────────
  function renderThreeStars() {
    const stars = (Array.isArray(game?.threeStars) ? game.threeStars : [])
      .filter((e) => e && typeof e === "object")
      .sort((a, b) => Number(b?.star || 0) - Number(a?.star || 0));
    if (!stars.length) return "";

    const awayAbbr = String(game?.away?.abbreviation || "").toUpperCase();
    const homeAbbr = String(game?.home?.abbreviation || "").toUpperCase();
    const logoFor = (abbr) => {
      const a = String(abbr || "").toUpperCase();
      if (a === awayAbbr) return awayLogo();
      if (a === homeAbbr) return homeLogo();
      return `https://assets.nhle.com/logos/nhl/svg/${a}_light.svg`;
    };

    const rows = stars
      .map((entry) => {
        const abbr = String(entry?.teamAbbrev || "").toUpperCase();
        const color = getTeamColor(abbr, "#2563eb");
        const isGoalie = entry?.position === "G";
        const stats = isGoalie
          ? [
              { label: "GAA", value: toSafeStatValue(entry?.goalsAgainstAverage) },
              {
                label: "SV%",
                value: `${(toSafeStatValue(entry?.savePctg) * 100).toFixed(1)}%`,
              },
            ]
          : [
              { label: "GLS", value: toSafeStatValue(entry?.goals) },
              { label: "AST", value: toSafeStatValue(entry?.assists) },
              { label: "PTS", value: toSafeStatValue(entry?.points) },
            ];
        return `
          <div class="sb-star-row" style="background:linear-gradient(90deg,${withAlpha30(color)},transparent 55%)">
            <div class="sb-star-left">
              <div class="sb-star-headshot-wrap" style="border-color:${color}">
                ${entry?.headshot ? `<img class="sb-star-headshot" src="${esc(entry.headshot)}" alt="" onerror="this.style.display='none'">` : ""}
                <span class="sb-star-count">⭐</span>
                <span class="sb-star-team-badge" style="border-color:${color}"><img src="${esc(logoFor(abbr))}" alt="" onerror="this.style.display='none'"></span>
                <span class="sb-star-pos" style="border-color:${color}">${esc(String(entry?.position || "-").toUpperCase())}</span>
              </div>
            </div>
            <div class="sb-star-mid">
              <div class="sb-star-name">${esc(String(entry?.name || "Unknown"))}</div>
              <div class="sb-star-abbr">${entry?.sweaterNo ? `#${esc(entry.sweaterNo)} · ` : ""}${esc(abbr || "---")}</div>
            </div>
            <div class="sb-star-stats">
              ${stats
                .map(
                  (s) =>
                    `<div class="sb-star-stat"><div class="sb-star-stat-val">${esc(s.value)}</div><div class="sb-star-stat-lbl">${esc(s.label)}</div></div>`,
                )
                .join("")}
            </div>
          </div>`;
      })
      .join("");

    return `
      <div class="sb-card">
        <div class="sb-card-header"><span class="sb-card-title">Three Stars</span></div>
        ${rows}
      </div>`;
  }

  // ── Officials ──────────────────────────────────────────────────────────────
  function renderOfficials() {
    const referees = Array.isArray(game?.referees) ? game.referees : [];
    const linesmen = Array.isArray(game?.linesmen) ? game.linesmen : [];
    if (!referees.length && !linesmen.length) return "";
    const renderList = (names) =>
      names
        .map((name) => {
          const s = splitOfficialName(name);
          return `<div class="sb-official-item"><div class="sb-official-first">${esc(s.first)}</div>${s.last ? `<div class="sb-official-last">${esc(s.last)}</div>` : ""}</div>`;
        })
        .join("");
    return `
      <div class="sb-card">
        <div class="sb-card-header"><span class="sb-card-title">Officials</span></div>
        <div class="sb-officials-body">
          <div class="sb-officials-col">
            <div class="sb-officials-role">Referees</div>
            <div class="sb-officials-names">${renderList(referees)}</div>
          </div>
          <div class="sb-officials-divider"></div>
          <div class="sb-officials-col">
            <div class="sb-officials-role">Linesmen</div>
            <div class="sb-officials-names">${renderList(linesmen)}</div>
          </div>
        </div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROSTER PANEL (Away / Home)
  // ═══════════════════════════════════════════════════════════════════════════
  function rosterPlayersForSide(side) {
    const boxscoreKey = side === "home" ? "homeTeam" : "awayTeam";
    const teamAbbrev = String(
      side === "home" ? game?.home?.abbreviation : game?.away?.abbreviation,
    )
      .trim()
      .toUpperCase();
    const seasonCode = getNhlSeasonSpan();
    const rosterSpotById = {};
    (game?.playRosterSpots || []).forEach((spot) => {
      const id = Number(spot?.playerId);
      if (Number.isFinite(id)) rosterSpotById[id] = spot;
    });
    const boxscoreSide = game?.boxscorePlayerByGameStats?.[boxscoreKey] || {};
    const boxscoreEntryById = {};
    [boxscoreSide?.forwards, boxscoreSide?.defense, boxscoreSide?.goalies].forEach(
      (bucket) => {
        (Array.isArray(bucket) ? bucket : []).forEach((entry) => {
          const id = Number(entry?.playerId ?? entry?.id);
          if (Number.isFinite(id)) boxscoreEntryById[id] = entry;
        });
      },
    );

    const toCard = (entry, fallbackKey) => {
      const playerId = Number(entry?.playerId ?? entry?.id);
      const boxEntry = Number.isFinite(playerId)
        ? boxscoreEntryById[playerId] || null
        : null;
      const source = { ...(boxEntry || {}), ...(entry || {}) };
      const meta = Number.isFinite(playerId)
        ? game?.playerMetaById?.[playerId] || null
        : null;
      const roster = Number.isFinite(playerId)
        ? rosterSpotById[playerId] || null
        : null;
      const number =
        source?.sweaterNumber != null
          ? Number(source.sweaterNumber)
          : roster?.sweaterNumber != null
            ? Number(roster.sweaterNumber)
            : null;
      const mug = getNhlMugHeadshotUrl({
        seasonCode,
        teamAbbrev,
        playerId,
      });
      const fallbackHeadshot = String(
        roster?.headshot || source?.headshot || "",
      ).trim();
      const stats = extractNhlStatsFromEntry(source);
      const first = String(
        roster?.firstName || source?.firstName?.default || source?.firstName || "",
      ).trim();
      const last = String(
        roster?.lastName || source?.lastName?.default || source?.lastName || "",
      ).trim();
      const name =
        [first, last].filter(Boolean).join(" ").trim() ||
        String(source?.name || meta?.name || "").trim();
      return {
        key: Number.isFinite(playerId)
          ? `${fallbackKey}_${playerId}`
          : `${fallbackKey}_${name}`,
        id: Number.isFinite(playerId) ? playerId : null,
        name,
        firstName: first,
        lastName: last,
        number,
        position: String(source?.position || meta?.position || "").trim(),
        teamSide: side,
        teamAbbrev,
        headshot: mug || fallbackHeadshot || null,
        decision: String(source?.decision || "").trim().toUpperCase() || null,
        stats: {
          ...stats,
          toi: String(stats?.toi ?? source?.toi ?? "").trim() || "-",
          avgTimeOnIce: String(
            stats?.avgTimeOnIce ?? source?.avgTimeOnIce ?? "",
          ).trim(),
        },
      };
    };

    const dedupe = (rows) => {
      const seen = new Set();
      return rows.filter((row, idx) => {
        const key = Number.isFinite(Number(row.id))
          ? `id_${Number(row.id)}`
          : `name_${row.name}_${idx}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const skaters = dedupe([
      ...(Array.isArray(boxscoreSide?.forwards) ? boxscoreSide.forwards : []),
      ...(Array.isArray(boxscoreSide?.defense) ? boxscoreSide.defense : []),
    ].map((e) => toCard(e, "skater")));
    const goalies = dedupe(
      (Array.isArray(boxscoreSide?.goalies) ? boxscoreSide.goalies : []).map(
        (e) => toCard(e, "goalie"),
      ),
    );
    const injured = dedupe(
      (Array.isArray(game?.injuriesByTeam?.[side])
        ? game.injuriesByTeam[side]
        : []
      ).map((e) => toCard(e, "injured")),
    );

    // On-ice (live)
    const iceSide = game?.iceSurface?.[boxscoreKey] || {};
    const onIce = dedupe([
      ...(Array.isArray(iceSide?.forwards) ? iceSide.forwards : []),
      ...(Array.isArray(iceSide?.defensemen) ? iceSide.defensemen : []),
    ].map((e) => toCard(e, "onice")));
    const onIceGoalies = dedupe(
      (Array.isArray(iceSide?.goalies) ? iceSide.goalies : []).map((e) =>
        toCard({ ...e, position: String(e?.position || "G").trim() || "G" }, "onice_goalie"),
      ),
    );
    const penaltyBox = dedupe(
      (Array.isArray(iceSide?.penaltyBox) ? iceSide.penaltyBox : []).map((e) =>
        toCard(e, "penalty_box"),
      ),
    );

    const identity = (p) =>
      Number.isFinite(Number(p.id))
        ? `id_${Number(p.id)}`
        : `name_${String(p.name || "").toLowerCase()}_${p.number || ""}`;
    const onIceSet = new Set([...onIce, ...onIceGoalies].map(identity));
    const benchSkaters = skaters.filter((p) => !onIceSet.has(identity(p)));
    const benchGoalies = goalies.filter((p) => !onIceSet.has(identity(p)));

    return {
      skaters,
      goalies,
      injured,
      onIce,
      onIceGoalies,
      penaltyBox,
      benchSkaters,
      benchGoalies,
    };
  }

  function rosterSections(side) {
    const data = rosterPlayersForSide(side);
    const goalieLabel = data.goalies.length > 1 ? "Goalies" : "Goalie";
    if (isFinal()) {
      return [
        { key: "skaters", label: "Skaters", players: data.skaters },
        { key: "goalies", label: goalieLabel, players: data.goalies },
        { key: "injured", label: "Injured", players: data.injured },
      ].filter((s) => s.players.length > 0);
    }
    if (isLive()) {
      if (!data.onIce.length && !data.onIceGoalies.length) {
        return [
          { key: "skaters", label: "Skaters", players: data.skaters },
          { key: "goalies", label: goalieLabel, players: data.goalies },
        ].filter((s) => s.players.length > 0);
      }
      const sections = [
        {
          key: "onice",
          label: "On Ice",
          players: data.onIce,
          penaltyBox: data.penaltyBox,
        },
        { key: "goalies", label: goalieLabel, players: data.onIceGoalies },
      ].filter((s) => s.players.length > 0);
      if (data.benchSkaters.length || data.benchGoalies.length) {
        sections.push({
          key: "bench",
          label: "Bench",
          players: [...data.benchSkaters, ...data.benchGoalies],
        });
      }
      return sections;
    }
    const sections = [];
    if (data.skaters.length)
      sections.push({ key: "skaters", label: "Skaters", players: data.skaters });
    if (data.goalies.length)
      sections.push({ key: "goalies", label: goalieLabel, players: data.goalies });
    if (data.injured.length)
      sections.push({ key: "injured", label: "Injured", players: data.injured });
    return sections;
  }

  function playerCardHtml(player, teamColor, showStats) {
    const isGoalie =
      String(player?.position || "").trim().toUpperCase() === "G";
    const plusMinusRaw = Number(player?.stats?.plusMinus);
    const plusMinusDisplay = Number.isFinite(plusMinusRaw)
      ? plusMinusRaw > 0
        ? `+${plusMinusRaw}`
        : String(plusMinusRaw)
      : "-";
    const formatSavePct = (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return "-";
      return `${(n <= 1 ? n * 100 : n).toFixed(1)}%`;
    };
    const hasSeasonSkater =
      Number.isFinite(Number(player?.stats?.gamesPlayed)) &&
      String(player?.stats?.avgTimeOnIce || "").trim().length > 0;
    const hasSeasonGoalie =
      Number.isFinite(Number(player?.stats?.wins)) &&
      Number.isFinite(Number(player?.stats?.losses));
    const goalieRecord = hasSeasonGoalie
      ? `${Number(player?.stats?.wins)}-${Number(player?.stats?.losses)}-${Number(player?.stats?.otLosses ?? 0)}`
      : "-";

    let statItems;
    if (isGoalie) {
      statItems = [
        { label: "GA", value: toSafeStatValue(player?.stats?.goalsAgainst) },
        { label: "SA", value: toSafeStatValue(player?.stats?.shotsAgainst) },
        { label: "SV", value: toSafeStatValue(player?.stats?.saves) },
        { label: "SV%", value: formatSavePct(player?.stats?.savePctg) },
        { label: "TOI", value: String(player?.stats?.toi || "-") },
      ];
      if (isScheduled() && hasSeasonGoalie) {
        statItems = [
          {
            label: "GA",
            value: toSafeStatValue(
              player?.stats?.goalsAgainst ?? player?.stats?.goalsAgainstAvg,
            ),
          },
          { label: "SA", value: toSafeStatValue(player?.stats?.shotsAgainst) },
          { label: "SV", value: toSafeStatValue(player?.stats?.saves) },
          { label: "SV%", value: formatSavePct(player?.stats?.savePctg) },
          { label: "RCD", value: goalieRecord },
        ];
      }
    } else if (hasSeasonSkater) {
      statItems = [
        { label: "GLS", value: toSafeStatValue(player?.stats?.goals) },
        { label: "AST", value: toSafeStatValue(player?.stats?.assists) },
        { label: "PTS", value: toSafeStatValue(player?.stats?.points) },
        { label: "+/-", value: plusMinusDisplay },
        { label: "AVG TOI", value: String(player?.stats?.avgTimeOnIce || "-") },
        { label: "GP", value: toSafeStatValue(player?.stats?.gamesPlayed) },
      ];
    } else {
      statItems = [
        { label: "GLS", value: toSafeStatValue(player?.stats?.goals) },
        { label: "AST", value: toSafeStatValue(player?.stats?.assists) },
        { label: "PTS", value: toSafeStatValue(player?.stats?.points) },
        { label: "+/-", value: plusMinusDisplay },
        { label: "TOI", value: String(player?.stats?.toi || "-") },
      ];
    }

    const decisionLabel =
      player?.decision === "W" ? "WON" : player?.decision === "L" ? "LOSS" : "";
    const decisionColor =
      player?.decision === "W"
        ? "var(--accent-success, #27ae60)"
        : player?.decision === "L"
          ? "var(--accent-error, #e03131)"
          : "var(--text-secondary)";
    const meta = [
      player?.number != null ? `#${player.number}` : "",
      player?.position || "",
    ]
      .filter(Boolean)
      .join(" · ");
    const initials =
      String(player?.name || "")
        .split(/\s+/)
        .filter(Boolean)
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "?";
    const playerJson = esc(JSON.stringify(player));

    return `
      <div class="sb-player-card" data-player="${playerJson}" style="border-color:${teamColor}">
        <div class="sb-pc-top">
          <div class="sb-pc-headshot-wrap" style="background:${withAlpha66(teamColor)};border-color:${teamColor}">
            ${player?.headshot ? `<img src="${esc(player.headshot)}" alt="" loading="lazy" onerror="this.style.display='none'">` : `<span class="sb-pc-initials">${esc(initials)}</span>`}
          </div>
          <div class="sb-pc-info">
            <div class="sb-pc-name-row">
              <span class="sb-pc-name">${esc(player?.name || "Unknown")}</span>
              ${decisionLabel ? `<span class="sb-pc-decision" style="color:${decisionColor}">${decisionLabel}</span>` : ""}
            </div>
            ${meta ? `<div class="sb-pc-meta">${esc(meta)}</div>` : ""}
          </div>
        </div>
        ${
          showStats
            ? `<div class="sb-pc-stats">${statItems
                .map(
                  (s) =>
                    `<div class="sb-pc-stat"><div class="sb-pc-stat-val">${esc(s.value)}</div><div class="sb-pc-stat-lbl">${esc(s.label)}</div></div>`,
                )
                .join("")}</div>`
            : ""
        }
      </div>`;
  }

  function renderRosterPanel(body, side, teamSide) {
    const sections = rosterSections(teamSide);
    const teamColor = teamSide === "home" ? homeColor() : awayColor();
    if (!sections.length) {
      setPanelHtml(body, '<div class="sb-empty">No roster data available.</div>');
      return;
    }
    let activeKey = rosterSection[side];
    if (!sections.some((s) => s.key === activeKey)) activeKey = sections[0].key;
    rosterSection[side] = activeKey;
    const active = sections.find((s) => s.key === activeKey) || sections[0];

    const toggle =
      sections.length > 1
        ? `<div class="sb-roster-toggle">${sections
            .map(
              (s) =>
                `<button class="sb-roster-toggle-btn${s.key === activeKey ? " active" : ""}" data-section="${s.key}">${esc(s.label)}</button>`,
            )
            .join("")}</div>`
        : "";

    const showStats = active.key !== "injured";
    let cards = active.players
      .map((p) => playerCardHtml(p, teamColor, showStats))
      .join("");

    if (active.key === "onice" && active.penaltyBox?.length) {
      cards += `<div class="sb-roster-subhead" style="color:var(--accent-error, #e03131)">PENALTY BOX</div>`;
      cards += active.penaltyBox
        .map((p) => playerCardHtml(p, teamColor, true))
        .join("");
    }

    const html = `<div class="sb-roster-wrap">${toggle}${cards}</div>`;
    if (!setPanelHtml(body, html)) return;

    body.querySelectorAll(".sb-roster-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        rosterSection[side] = btn.dataset.section;
        renderRosterPanel(body, side, teamSide);
      });
    });
    body.querySelectorAll("[data-player]").forEach((el) => {
      el.addEventListener("click", () => {
        try {
          openPlayerModal(JSON.parse(el.dataset.player));
        } catch (e) {
          /* ignore */
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATS PANEL
  // ═══════════════════════════════════════════════════════════════════════════
  function renderStatsPanel(body, side) {
    const aColor = awayColor();
    const hColor = homeColor();
    const isSched = isScheduled();

    const rows = (Array.isArray(game?.teamGameStats) ? game.teamGameStats : [])
      .map((row, idx) => {
        const category = String(row?.category || `stat_${idx}`);
        const key = category.toLowerCase();
        return {
          key: `${category}_${idx}`,
          category,
          keyNorm: key,
          homeText: String(row?.homeValue ?? "0"),
          awayText: String(row?.awayValue ?? "0"),
          homeNum: parseStatPrimaryNumber(row?.homeValue),
          awayNum: parseStatPrimaryNumber(row?.awayValue),
        };
      })
      .filter((r) => r.category);

    const toPctBase = (key) =>
      String(key || "")
        .replace(/percentage$/i, "")
        .replace(/pctg$/i, "")
        .replace(/pct$/i, "");
    const percentByBase = new Map(
      rows
        .filter((r) => /percentage$|pctg$|pct$/i.test(r.keyNorm))
        .map((r) => [toPctBase(r.keyNorm), r]),
    );
    const faceoff = rows.find((r) => r.keyNorm === "faceoffwins") || null;
    const faceoffPct =
      rows.find((r) => r.keyNorm === "faceoffwinningpctg") || null;
    const sog = rows.find((r) => r.keyNorm === "sog") || null;
    const others = rows
      .filter((r) => {
        if (r.keyNorm === "faceoffwins" || r.keyNorm === "sog") return false;
        if (r.keyNorm === "faceoffwinningpctg") return false;
        if (/percentage$|pctg$|pct$/i.test(r.keyNorm)) return false;
        return true;
      })
      .map((r) => {
        const pctRow = percentByBase.get(r.keyNorm);
        const fmt = (v) => {
          const n = Number(v);
          if (!Number.isFinite(n)) return null;
          return `${(n <= 1 ? n * 100 : n).toFixed(1)}%`;
        };
        const aPct = pctRow ? fmt(pctRow.awayNum) : null;
        const hPct = pctRow ? fmt(pctRow.homeNum) : null;
        return {
          ...r,
          awayText: aPct ? `${r.awayText} (${aPct})` : r.awayText,
          homeText: hPct ? `${r.homeText} (${hPct})` : r.homeText,
        };
      });

    const barStat = (row) => {
      const total = row.homeNum + row.awayNum;
      const hShare = total > 0 ? row.homeNum / total : 0.5;
      const aShare = total > 0 ? row.awayNum / total : 0.5;
      return `
        <div class="sb-stat-row">
          <div class="sb-stat-vals"><span>${esc(row.awayText)}</span><span>${esc(row.homeText)}</span></div>
          <div class="sb-stat-bar">
            <div style="width:${Math.max(0, Math.min(100, aShare * 100))}%;background:${aColor}"></div>
            <div style="width:${Math.max(0, Math.min(100, hShare * 100))}%;background:${hColor}"></div>
          </div>
          <div class="sb-stat-lbl">${esc(formatStatLabel(row.category).toUpperCase())}</div>
        </div>`;
    };

    let featureHtml = "";
    if (!isSched && faceoff) {
      const total = faceoff.homeNum + faceoff.awayNum;
      const hShareRaw = total > 0 ? faceoff.homeNum / total : 0.5;
      const aShareRaw = total > 0 ? faceoff.awayNum / total : 0.5;
      const clamp = (v) => Math.max(0, Math.min(1, v));
      const hShare = Number.isFinite(Number(faceoffPct?.homeNum))
        ? clamp(
            Number(faceoffPct.homeNum) <= 1
              ? Number(faceoffPct.homeNum)
              : Number(faceoffPct.homeNum) / 100,
          )
        : hShareRaw;
      const aShare = Number.isFinite(Number(faceoffPct?.awayNum))
        ? clamp(
            Number(faceoffPct.awayNum) <= 1
              ? Number(faceoffPct.awayNum)
              : Number(faceoffPct.awayNum) / 100,
          )
        : aShareRaw;
      const R = 52;
      const STROKE = 20;
      const SIZE = R * 2 + STROKE * 2;
      const CIRC = 2 * Math.PI * R;
      const homeLen = CIRC * clamp(hShare);
      featureHtml += `
        <div class="sb-stats-feature">
          <div class="sb-stats-feature-label">Faceoff Wins</div>
          <div class="sb-stats-feature-row">
            <div class="sb-stats-feature-val">${esc(faceoff.awayText)}</div>
            <div class="sb-ring-wrap">
              <svg width="${SIZE}" height="${SIZE}" style="transform:rotate(-90deg)">
                <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}" fill="none" stroke="${aColor}" stroke-width="${STROKE}"/>
                <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}" fill="none" stroke="${hColor}" stroke-width="${STROKE}" stroke-dasharray="${homeLen} ${Math.max(0, CIRC - homeLen)}"/>
              </svg>
              <div class="sb-ring-inner">
                <span class="sb-ring-pct" style="left:4px">${(aShare * 100).toFixed(1)}%</span>
                <span class="sb-ring-split"></span>
                <span class="sb-ring-pct" style="right:4px">${(hShare * 100).toFixed(1)}%</span>
              </div>
            </div>
            <div class="sb-stats-feature-val">${esc(faceoff.homeText)}</div>
          </div>
        </div>`;
    }
    if (!isSched && sog) {
      const total = sog.homeNum + sog.awayNum;
      const hShare = total > 0 ? sog.homeNum / total : 0.5;
      const aShare = total > 0 ? sog.awayNum / total : 0.5;
      featureHtml += `
        <div class="sb-stats-feature">
          <div class="sb-stats-feature-label">SHOTS ON GOAL</div>
          <div class="sb-sog-outer">
            <div class="sb-sog-inner">
              <div class="sb-sog-fill-left" style="width:${Math.max(0, Math.min(100, aShare * 100))}%;background:${aColor}">${esc(sog.awayText)}</div>
              <div class="sb-sog-fill-right" style="width:${Math.max(0, Math.min(100, hShare * 100))}%;background:${hColor}">${esc(sog.homeText)}</div>
            </div>
          </div>
        </div>`;
    }

    let bodyHtml = "";
    if (isSched) {
      const schedRows = buildScheduledStatRows();
      bodyHtml = schedRows.length
        ? schedRows.map(barStat).join("")
        : '<div class="sb-empty">No stats available</div>';
    } else {
      bodyHtml =
        featureHtml + others.map(barStat).join("");
      if (!featureHtml && !others.length)
        bodyHtml = '<div class="sb-empty">No stats available</div>';
    }

    setPanelHtml(
      body,
      `<div class="sb-card"><div class="sb-card-header"><span class="sb-card-title">Stats</span></div><div class="sb-stats-body">${bodyHtml}</div></div>`,
    );
  }

  function buildScheduledStatRows() {
    const away =
      game?.teamSeasonStats && typeof game.teamSeasonStats === "object"
        ? game.teamSeasonStats.awayTeam || {}
        : {};
    const home =
      game?.teamSeasonStats && typeof game.teamSeasonStats === "object"
        ? game.teamSeasonStats.homeTeam || {}
        : {};
    const keys = Array.from(
      new Set([...Object.keys(away || {}), ...Object.keys(home || {})]),
    )
      .filter((k) => !/Rank$/i.test(k))
      .filter((k) => {
        const a = Number(away?.[k]);
        const h = Number(home?.[k]);
        return Number.isFinite(a) || Number.isFinite(h);
      });
    const formatVal = (key, value, rank) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return "-";
      const isPct = /pctg|pct|percentage/i.test(key);
      const display = isPct
        ? `${(n <= 1 ? n * 100 : n).toFixed(1)}%`
        : `${Number.isInteger(n) ? n : n.toFixed(2).replace(/\.00$/, "")}`;
      const ord = toOrdinal(rank);
      return ord ? `${display} (${ord})` : display;
    };
    return keys.map((key, idx) => {
      const aNum = Number(away?.[key]);
      const hNum = Number(home?.[key]);
      return {
        key: `${key}_${idx}`,
        category: key,
        awayNum: Number.isFinite(aNum) ? aNum : 0,
        homeNum: Number.isFinite(hNum) ? hNum : 0,
        awayText: formatVal(key, away?.[key], Number(away?.[`${key}Rank`])),
        homeText: formatVal(key, home?.[key], Number(home?.[`${key}Rank`])),
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAYS PANEL
  // ═══════════════════════════════════════════════════════════════════════════
  function preparePlays() {
    const plays = Array.isArray(game?.plays) ? game.plays : [];
    const awayTeamId = Number(game?.away?.id);
    const homeTeamId = Number(game?.home?.id);
    const rosterSpotById = {};
    (game?.playRosterSpots || []).forEach((s) => {
      const id = Number(s?.playerId);
      if (Number.isFinite(id)) rosterSpotById[id] = s;
    });
    const playerMetaById = game?.playerMetaById || {};

    const profile = (playerId, fallback = "") => {
      const id = Number(playerId);
      if (!Number.isFinite(id))
        return { name: String(fallback || "").trim(), firstName: "", lastName: "", sweaterNumber: null, headshot: null, position: null, teamId: null };
      const roster = rosterSpotById[id] || {};
      const meta = playerMetaById[id] || {};
      const first = String(roster?.firstName || "").trim();
      const last = String(roster?.lastName || "").trim();
      return {
        id,
        name:
          [first, last].filter(Boolean).join(" ").trim() ||
          String(meta?.name || fallback || "").trim(),
        firstName: first,
        lastName: last,
        sweaterNumber:
          roster?.sweaterNumber != null
            ? Number(roster.sweaterNumber)
            : meta?.sweaterNumber != null
              ? Number(meta.sweaterNumber)
              : null,
        headshot: roster?.headshot || null,
        position: String(meta?.position || "").trim() || null,
        teamId: Number(roster?.teamId),
      };
    };
    const displayName = (p, fallback = "") => {
      const first = String(p?.firstName || "").trim();
      const last = String(p?.lastName || "").trim();
      if (first && last) return `${first} ${last}`;
      return String(p?.name || fallback || "").trim();
    };
    const sweaterTag = (p) =>
      Number.isFinite(Number(p?.sweaterNumber))
        ? ` (#${Number(p.sweaterNumber)})`
        : "";
    const ordinalSafe = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? toOrdinal(n) : null;
    };
    const cleanKeyWords = (v) =>
      String(v || "")
        .split("-")
        .filter(Boolean)
        .join(" ");
    const toTypeLabel = (raw) =>
      String(raw || "update")
        .split("-")
        .filter(Boolean)
        .join(" ")
        .toUpperCase();

    const detailText = (play, eventTeam) => {
      const d = play?.details || {};
      const typeKey = String(play?.typeDescKey || "").toLowerCase();
      const teamLabel = eventTeam?.abbr || "GAME";
      if (typeKey === "goal") {
        const sp = profile(d?.scoringPlayerId, "Scorer");
        const scorer = displayName(sp, "Scorer");
        const shotType = String(d?.shotType || "").toLowerCase();
        const teamName =
          Number(eventTeam?.id) === awayTeamId
            ? game?.away?.name || teamLabel
            : Number(eventTeam?.id) === homeTeamId
              ? game?.home?.name || teamLabel
              : teamLabel;
        const seasonTotal = ordinalSafe(d?.scoringPlayerTotal);
        const assistLines = [];
        const assistNames = [];
        const assistProfiles = [];
        [1, 2].forEach((idx) => {
          const idKey = idx === 1 ? "assist1PlayerId" : "assist2PlayerId";
          const totalKey = idx === 1 ? "assist1PlayerTotal" : "assist2PlayerTotal";
          const ap = profile(d?.[idKey], "");
          const an = displayName(ap, "");
          if (!an) return;
          assistNames.push(an);
          assistProfiles.push(ap);
          const total = Number(d?.[totalKey]);
          assistLines.push(
            `${an}${sweaterTag(ap)}${Number.isFinite(total) ? ` (${total})` : ""}`,
          );
        });
        return {
          main: `${scorer}${sweaterTag(sp)} scores for ${teamName}${shotType ? ` with a ${shotType} shot` : ""}.${seasonTotal ? ` His ${seasonTotal} goal of the season.` : ""}`,
          sub: assistLines.length ? `Assists: ${assistLines.join(", ")}` : null,
          assistNames,
          assistProfiles,
        };
      }
      if (typeKey === "penalty") {
        const cp = profile(d?.committedByPlayerId, "Player");
        const committedBy = displayName(cp, "Player");
        const dp = profile(d?.drawnByPlayerId, "");
        const drawnBy = displayName(dp, "");
        const desc = cleanKeyWords(d?.descKey || "penalty");
        const duration = Number(d?.duration);
        return {
          main: `${committedBy}${sweaterTag(cp)} ${Number.isFinite(duration) ? `${duration} minutes` : ""} for ${desc}`.trim(),
          sub: drawnBy ? `Drawn by ${drawnBy}${sweaterTag(dp)}` : null,
        };
      }
      if (typeKey === "faceoff") {
        const wp = profile(d?.winningPlayerId, "Winner");
        const lp = profile(d?.losingPlayerId, "Loser");
        return {
          main: `${displayName(wp, "Winner")}${sweaterTag(wp)} faceoff won against ${displayName(lp, "Loser")}${sweaterTag(lp)}`,
          sub: null,
        };
      }
      if (typeKey === "hit") {
        const hp = profile(d?.hittingPlayerId, "Player");
        const tp = profile(d?.hitteePlayerId, "");
        return {
          main: `${displayName(hp, "Player")}${sweaterTag(hp)} hit ${displayName(tp, "")}${sweaterTag(tp)}`,
          sub: null,
        };
      }
      if (typeKey === "shot-on-goal") {
        const sp = profile(d?.shootingPlayerId, "Player");
        const gp = profile(d?.goalieInNetId, "Goalie");
        const shotType = String(d?.shotType || "").toLowerCase();
        return {
          main: `${displayName(sp, "Player")}${sweaterTag(sp)} ${shotType ? `${shotType} ` : ""}shot saved by ${displayName(gp, "Goalie")}${sweaterTag(gp)}`,
          sub: null,
        };
      }
      if (typeKey === "missed-shot") {
        const sp = profile(d?.shootingPlayerId, "Player");
        const shotType = String(d?.shotType || "").toLowerCase();
        const reason = cleanKeyWords(d?.reason || "");
        return {
          main: `${displayName(sp, "Player")}${sweaterTag(sp)} ${shotType ? `${shotType} ` : ""}shot${reason ? ` ${reason}` : ""}`,
          sub: null,
        };
      }
      if (typeKey === "blocked-shot") {
        const sp = profile(d?.shootingPlayerId, "Shooter");
        const reason = cleanKeyWords(d?.reason || "");
        return {
          main: `${displayName(sp, "Shooter")}${sweaterTag(sp)}${reason ? ` ${reason}` : ""}`,
          sub: null,
        };
      }
      if (typeKey === "takeaway") {
        const p = profile(d?.playerId, "Player");
        return { main: `Takeaway by ${displayName(p, "Player")}${sweaterTag(p)}`, sub: null };
      }
      if (typeKey === "giveaway") {
        const p = profile(d?.playerId, "Player");
        return { main: `Giveaway by ${displayName(p, "Player")}${sweaterTag(p)}`, sub: null };
      }
      if (typeKey === "stoppage") {
        const reason = String(d?.reason || "stoppage").replace(/-/g, " ").toUpperCase();
        const secondary = String(d?.secondaryReason || "").replace(/-/g, " ").toUpperCase();
        return { main: reason, sub: secondary || null };
      }
      return { main: `${teamLabel} - ${toTypeLabel(typeKey)}`, sub: null };
    };

    const rows = plays
      .map((play, idx) => {
        const period = Number(play?.periodDescriptor?.number || 0);
        const periodType = String(play?.periodDescriptor?.periodType || "").toUpperCase();
        const remaining = parseClockSecs(play?.timeRemaining);
        const playoff = isNhlPlayoffGameType(game?.gameType);
        const shootout = periodType === "SO" || (!playoff && period >= 5);
        const ot = !shootout && (periodType === "OT" || period > 3);
        const len = shootout ? 0 : ot ? (playoff ? 1200 : 300) : 1200;
        const elapsed = Number.isFinite(remaining) ? Math.max(0, len - remaining) : 0;
        return { play, idx, period, elapsed, sortKey: period * 100000 + elapsed * 10 + idx };
      })
      .sort((a, b) => a.sortKey - b.sortKey);

    let awayScore = 0;
    let homeScore = 0;
    const goalCounts = {};
    const annotated = rows.map((row) => {
      const play = row.play;
      const d = play?.details || {};
      const typeKey = String(play?.typeDescKey || "").toLowerCase();
      const ownerId = Number(d?.eventOwnerTeamId);
      const eventTeam =
        ownerId === awayTeamId
          ? { id: awayTeamId, abbr: String(game?.away?.abbreviation || "AWY").toUpperCase() }
          : ownerId === homeTeamId
            ? { id: homeTeamId, abbr: String(game?.home?.abbreviation || "HME").toUpperCase() }
            : null;
      const x = Number(d?.xCoord);
      const y = Number(d?.yCoord);
      const eventTeamSide =
        ownerId === awayTeamId ? "away" : ownerId === homeTeamId ? "home" : null;
      const directAway = Number(d?.awayScore);
      const directHome = Number(d?.homeScore);
      const hasDirect = Number.isFinite(directAway) && Number.isFinite(directHome);
      const scoreBefore = { away: awayScore, home: homeScore };
      if (hasDirect) {
        awayScore = directAway;
        homeScore = directHome;
      } else if (typeKey === "goal") {
        if (ownerId === awayTeamId) awayScore += 1;
        else if (ownerId === homeTeamId) homeScore += 1;
      }
      const teamColor = eventTeam
        ? getTeamColor(eventTeam.abbr, "#2563eb")
        : "#2563eb";
      const detail = detailText(play, eventTeam);
      let scoringSide = null;
      if (typeKey === "goal") {
        if (awayScore > scoreBefore.away) scoringSide = "away";
        else if (homeScore > scoreBefore.home) scoringSide = "home";
        else if (ownerId === awayTeamId) scoringSide = "away";
        else if (ownerId === homeTeamId) scoringSide = "home";
      }
      const scorerId = Number(d?.scoringPlayerId);
      const scorerProfile = profile(scorerId, "Scorer");
      if (Number.isFinite(scorerId) && !goalCounts[scorerId]) goalCounts[scorerId] = 0;
      if (typeKey === "goal" && Number.isFinite(scorerId)) goalCounts[scorerId] += 1;
      return {
        key: `${row.idx}-${typeKey}-${row.period}`,
        typeKey,
        typeLabel: toTypeLabel(typeKey),
        period: row.period,
        periodLabel:
          row.period <= 3
            ? `P${row.period}`
            : getNhlExtraPeriodLabel({ number: row.period, gameType: game?.gameType, longForm: false }) || `P${row.period}`,
        timeRemaining: String(play?.timeRemaining || "--:--"),
        scoreAt: { away: awayScore, home: homeScore },
        scoringSide,
        isGoal: typeKey === "goal",
        teamColor,
        detailMain: detail.main,
        detailSub: detail.sub,
        assistNames: detail.assistNames || [],
        assistProfiles: detail.assistProfiles || [],
        scorerProfile,
        scorerName: displayName(scorerProfile, "Scorer"),
        scorerGoalsInGame:
          typeKey === "goal" && Number.isFinite(scorerId) ? goalCounts[scorerId] : 0,
        eventTeamAbbr: eventTeam?.abbr || null,
        eventTeamSide,
        homeTeamDefendingSide: String(play?.homeTeamDefendingSide || "").trim().toLowerCase() || null,
        xCoord: Number.isFinite(x) ? x : null,
        yCoord: Number.isFinite(y) ? y : null,
      };
    });
    return annotated.reverse();
  }

  function renderPlaysPanel(body, side) {
    const prepared = preparePlays();
    if (!prepared.length) {
      setPanelHtml(body, '<div class="sb-empty">No plays available</div>');
      return;
    }
    const filterTypes = (() => {
      const unique = new Set(prepared.map((r) => r.typeLabel));
      const ordered = ["ALL"];
      [
        "GOAL",
        "PENALTY",
        "SHOT ON GOAL",
        "MISSED SHOT",
        "BLOCKED SHOT",
        "HIT",
        "FACEOFF",
        "STOPPAGE",
        "TAKEAWAY",
        "GIVEAWAY",
      ].forEach((t) => {
        if (unique.has(t)) ordered.push(t);
      });
      unique.forEach((t) => {
        if (!ordered.includes(t)) ordered.push(t);
      });
      return ordered;
    })();
    if (!filterTypes.includes(playsFilter[side])) playsFilter[side] = "ALL";
    const activeType = playsFilter[side];

    const periodOptions = [
      ...new Set(prepared.map((r) => Number(r.period)).filter((p) => p > 0)),
    ].sort((a, b) => b - a);
    if (playsPeriodIdx[side] >= periodOptions.length) playsPeriodIdx[side] = 0;
    const selectedPeriod = periodOptions[playsPeriodIdx[side]] || null;

    const visible = prepared
      .filter((r) => activeType === "ALL" || r.typeLabel === activeType)
      .filter((r) => !selectedPeriod || r.period === selectedPeriod);

    const chips = filterTypes
      .map(
        (t) =>
          `<button class="sb-plays-chip${t === activeType ? " active" : ""}" data-type="${esc(t)}">${esc(t)}</button>`,
      )
      .join("");

    const cards = visible.length
      ? visible
          .map((row) => {
            const headerColor = row.isGoal ? "#fff" : "var(--text-primary)";
            const bodyColor = row.isGoal ? "rgba(255,255,255,0.9)" : "var(--text-secondary)";
            const canExpand =
              !row.isGoal &&
              Number.isFinite(Number(row.xCoord)) &&
              Number.isFinite(Number(row.yCoord));
            const expanded = canExpand && expandedPlayKey[side] === row.key;
            const playerJson = esc(JSON.stringify(row.scorerProfile));
            return `
              <div class="sb-play-row">
                <div class="sb-play-time-col">
                  <div class="sb-play-minute">${esc(row.timeRemaining)}</div>
                  <div class="sb-play-period">${esc(row.periodLabel)}</div>
                </div>
                <div class="sb-play-card${row.isGoal ? " goal" : ""}" data-play="${esc(row.key)}" data-expand="${canExpand ? "1" : "0"}"
                     style="border-color:${row.teamColor};background:${row.isGoal ? row.teamColor + "66" : "var(--bg-surface)"}">
                  <div class="sb-play-card-head">
                    <span style="color:${headerColor}">${esc(row.typeLabel)}</span>
                    <span style="color:${headerColor}">${row.scoreAt.away} - ${row.scoreAt.home}</span>
                  </div>
                  ${row.detailMain ? `<div class="sb-play-card-main" style="color:${bodyColor}">${esc(row.detailMain)}</div>` : ""}
                  ${row.detailSub && !row.isGoal ? `<div class="sb-play-card-sub" style="color:${bodyColor}">${esc(row.detailSub)}</div>` : ""}
                  ${
                    row.isGoal
                      ? `<div class="sb-play-goal-row">
                          <div class="sb-play-goal-avatar" data-player="${playerJson}" style="border-color:${row.teamColor}">
                            ${row.scorerProfile?.headshot ? `<img src="${esc(row.scorerProfile.headshot)}" alt="" onerror="this.style.display='none'">` : `<span>${esc(String(row.scorerName || "P").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase())}</span>`}
                            <span class="sb-play-goal-count">🏒 ${row.scorerGoalsInGame}</span>
                          </div>
                          <div class="sb-play-goal-text">
                            <div class="sb-play-goal-name" style="color:${bodyColor}">${esc(row.scorerName)}</div>
                            ${row.detailSub ? `<div class="sb-play-goal-assist" style="color:${bodyColor}">${esc(row.detailSub)}</div>` : ""}
                          </div>
                        </div>`
                      : ""
                  }
                  ${expanded ? `<div class="sb-play-rink" style="border-color:${row.teamColor}">${rinkSvg({ xCoord: row.xCoord, yCoord: row.yCoord, teamColor: row.teamColor, teamSide: row.eventTeamSide, homeTeamDefendingSide: row.homeTeamDefendingSide, isScoring: false, showTargetPath: row.typeKey === "shot-on-goal" })}</div>` : ""}
                </div>
              </div>`;
          })
          .join("")
      : '<div class="sb-empty">No plays for this filter</div>';

    const html = `
      <div class="sb-plays-wrap">
        <div class="sb-plays-filters">${chips}</div>
        <div class="sb-plays-cards">${cards}</div>
        <div class="sb-plays-pager">
          <button class="sb-plays-pager-btn" data-pager="prev"${playsPeriodIdx[side] <= 0 ? " disabled" : ""}>Previous</button>
          <span class="sb-plays-pager-label">${selectedPeriod ? (selectedPeriod <= 3 ? `P${selectedPeriod}` : getNhlExtraPeriodLabel({ number: selectedPeriod, gameType: game?.gameType, longForm: false })) : "P?"}</span>
          <button class="sb-plays-pager-btn" data-pager="next"${playsPeriodIdx[side] >= periodOptions.length - 1 ? " disabled" : ""}>Next</button>
        </div>
      </div>`;

    if (!setPanelHtml(body, html)) return;

    body.querySelectorAll(".sb-plays-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        playsFilter[side] = chip.dataset.type;
        expandedPlayKey[side] = null;
        renderPlaysPanel(body, side);
      });
    });
    body.querySelectorAll(".sb-plays-pager-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.pager === "prev")
          playsPeriodIdx[side] = Math.max(0, playsPeriodIdx[side] - 1);
        else
          playsPeriodIdx[side] = Math.min(
            periodOptions.length - 1,
            playsPeriodIdx[side] + 1,
          );
        expandedPlayKey[side] = null;
        renderPlaysPanel(body, side);
      });
    });
    body.querySelectorAll('.sb-play-card[data-expand="1"]').forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("[data-player]")) return;
        const key = card.dataset.play;
        expandedPlayKey[side] = expandedPlayKey[side] === key ? null : key;
        renderPlaysPanel(body, side);
      });
    });
    body.querySelectorAll("[data-player]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        try {
          openPlayerModal(JSON.parse(el.dataset.player));
        } catch (err) {
          /* ignore */
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHIFTS PANEL
  // ═══════════════════════════════════════════════════════════════════════════
  function renderShiftsPanel(body, side) {
    const shiftsByTeam =
      game?.shifts && typeof game.shifts === "object" ? game.shifts : {};
    const PX_PER_MIN = 18;
    const filter = shiftsFilter[side];

    const getPeriodStartMin = (p) => {
      const n = Number(p || 0);
      if (!Number.isFinite(n) || n <= 0) return 0;
      if (n <= 3) return (n - 1) * 20;
      return 60 + (n - 4) * 5;
    };
    const getPeriodLengthMin = (p) => {
      const n = Number(p || 0);
      if (!Number.isFinite(n) || n <= 0) return 20;
      return n <= 3 ? 20 : 5;
    };
    const parseShiftClockToMinutes = (clock) => {
      const secs = parseClockSecs(clock);
      if (!Number.isFinite(secs) || secs < 0) return null;
      return secs / 60;
    };
    const formatAxisLabel = (minuteValue) => {
      const totalSecs = Math.max(0, Math.round((Number(minuteValue) || 0) * 60));
      const h = Math.floor(totalSecs / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      const s = totalSecs % 60;
      if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
      return `${pad2(m)}:${pad2(s)}`;
    };

    const teamOptions = Object.keys(shiftsByTeam)
      .map((id) => {
        const isAway = String(game?.away?.id || "") === String(id);
        const isHome = String(game?.home?.id || "") === String(id);
        const abbr = isAway
          ? game?.away?.abbreviation || "AWY"
          : isHome
            ? game?.home?.abbreviation || "HME"
            : `T${id}`;
        const name = isAway
          ? game?.away?.name || abbr
          : isHome
            ? game?.home?.name || abbr
            : abbr;
        return {
          id: String(id),
          abbr,
          name,
          logo:
            (isAway ? awayLogo() : isHome ? homeLogo() : "") ||
            `https://assets.nhle.com/logos/nhl/svg/${String(abbr).toUpperCase()}_light.svg`,
          color: getTeamColor(abbr, "#2563eb"),
        };
      })
      .sort((a, b) => {
        if (String(a.id) === String(game?.away?.id || "")) return -1;
        if (String(b.id) === String(game?.away?.id || "")) return 1;
        if (String(a.id) === String(game?.home?.id || "")) return -1;
        if (String(b.id) === String(game?.home?.id || "")) return 1;
        return a.name.localeCompare(b.name);
      });

    const playerSections = (filter.teamId
      ? teamOptions.filter((t) => t.id === String(filter.teamId))
      : teamOptions
    ).map((team) => {
      const playersObj = shiftsByTeam?.[team.id] || {};
      const names = Object.keys(playersObj || {})
        .map((n) => String(n || "").trim())
        .filter(Boolean);
      const seen = new Set();
      const deduped = [];
      names.forEach((n) => {
        const k = n.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        deduped.push(n);
      });
      deduped.sort((a, b) => {
        const af = a.split(/\s+/)[0] || a;
        const bf = b.split(/\s+/)[0] || b;
        const c = af.localeCompare(bf);
        return c !== 0 ? c : a.localeCompare(b);
      });
      return {
        team,
        players: deduped.map((name) => ({ key: `${team.id}::${name}`, name, team })),
      };
    });

    const periodOptions = (() => {
      const periods = new Set();
      Object.values(shiftsByTeam).forEach((teamObj) => {
        Object.values(teamObj || {}).forEach((playerShifts) => {
          (Array.isArray(playerShifts) ? playerShifts : []).forEach((shift) => {
            const p = Number(shift?.period ?? shift?.periodNumber ?? 0);
            if (Number.isFinite(p) && p > 0) periods.add(p);
          });
        });
      });
      return Array.from(periods).sort((a, b) => a - b);
    })();

    const selectedTeam = teamOptions.find((t) => t.id === String(filter.teamId)) || null;
    const selectedPlayer = (() => {
      if (!filter.playerKey) return null;
      for (const s of playerSections) {
        const found = s.players.find((p) => p.key === filter.playerKey);
        if (found) return found;
      }
      return null;
    })();

    const periodWindow = filter.period
      ? {
          startMin: getPeriodStartMin(filter.period),
          endMin: getPeriodStartMin(filter.period) + getPeriodLengthMin(filter.period),
        }
      : null;

    const chartSections = [];
    playerSections.forEach((section) => {
      const rows = section.players
        .filter((p) => !filter.playerKey || p.key === filter.playerKey)
        .map((player) => {
          const rawShifts = Array.isArray(shiftsByTeam?.[section.team.id]?.[player.name])
            ? shiftsByTeam[section.team.id][player.name]
            : [];
          const seenShift = new Set();
          const bars = [];
          rawShifts.forEach((shift) => {
            const period = Number(shift?.period ?? shift?.periodNumber ?? 0);
            if (!period || (filter.period && period !== filter.period)) return;
            const startClock = String(shift?.startTime || shift?.start || "");
            const endClock = String(shift?.endTime || shift?.end || "");
            const dk = `${period}|${startClock}|${endClock}`;
            if (seenShift.has(dk)) return;
            seenShift.add(dk);
            const sIn = parseShiftClockToMinutes(startClock);
            const eIn = parseShiftClockToMinutes(endClock);
            if (sIn === null || eIn === null) return;
            const base = getPeriodStartMin(period);
            let startMin = base + sIn;
            let endMin = base + eIn;
            if (endMin < startMin) {
              const t = startMin;
              startMin = endMin;
              endMin = t;
            }
            if (periodWindow) {
              if (endMin < periodWindow.startMin || startMin > periodWindow.endMin) return;
            }
            bars.push({ period, startMin, endMin });
          });
          bars.sort((a, b) => a.startMin - b.startMin);
          return { type: "player", team: section.team, player, bars };
        })
        .filter((r) => r.bars.length > 0);
      rows.sort((a, b) => {
        const s = a.bars[0].startMin - b.bars[0].startMin;
        if (s !== 0) return s;
        const d = (b.bars[0].endMin - b.bars[0].startMin) - (a.bars[0].endMin - a.bars[0].startMin);
        if (d !== 0) return d;
        return a.player.name.localeCompare(b.player.name);
      });
      if (rows.length) chartSections.push({ type: "team", team: section.team, rows });
    });

    const chartRows = [];
    chartSections.forEach((s) => {
      chartRows.push({ type: "team", team: s.team });
      s.rows.forEach((r) => chartRows.push(r));
    });

    let minStart = periodWindow ? periodWindow.startMin : 0;
    let maxEnd = periodWindow ? periodWindow.endMin : 65;
    chartRows.forEach((row) => {
      if (row.type !== "player") return;
      row.bars.forEach((bar) => {
        minStart = Math.min(minStart, bar.startMin);
        maxEnd = Math.max(maxEnd, bar.endMin);
      });
    });
    if (!periodWindow) {
      maxEnd = Math.max(65, Math.ceil(maxEnd / 5) * 5);
      minStart = 0;
    }
    const axisTicks = [];
    for (let t = Math.floor(minStart / 5) * 5; t <= Math.ceil(maxEnd / 5) * 5; t += 5)
      axisTicks.push(t);
    const timelineWidth = Math.max(420, (maxEnd - minStart) * PX_PER_MIN);

    const goalMarkers = (() => {
      const plays = Array.isArray(game?.plays) ? game.plays : [];
      const markers = [];
      plays.forEach((play, idx) => {
        const typeKey = String(play?.typeDescKey || "").toLowerCase();
        const isGoal =
          Number(play?.typeCode) === 505 || typeKey === "goal" || play?.scoringPlay === true;
        if (!isGoal) return;
        const period = Number(play?.periodDescriptor?.number || 0);
        if (!Number.isFinite(period) || period <= 0) return;
        if (filter.period && period !== filter.period) return;
        const base = getPeriodStartMin(period);
        const lenSecs = Math.round(getPeriodLengthMin(period) * 60);
        const remaining = parseClockSecs(play?.timeRemaining);
        const elapsedFromRemaining = Number.isFinite(remaining)
          ? Math.max(0, lenSecs - remaining)
          : null;
        const elapsedFromInPeriod = parseClockSecs(play?.timeInPeriod);
        const elapsed = Number.isFinite(elapsedFromRemaining)
          ? elapsedFromRemaining
          : Number.isFinite(elapsedFromInPeriod)
            ? elapsedFromInPeriod
            : null;
        if (!Number.isFinite(elapsed)) return;
        const minute = base + elapsed / 60;
        if (periodWindow && (minute < periodWindow.startMin || minute > periodWindow.endMin))
          return;
        const ownerId = Number(play?.details?.eventOwnerTeamId);
        const isAway = String(ownerId) === String(game?.away?.id);
        const isHome = String(ownerId) === String(game?.home?.id);
        const abbr = isAway
          ? String(game?.away?.abbreviation || "AWY").toUpperCase()
          : isHome
            ? String(game?.home?.abbreviation || "HME").toUpperCase()
            : "UNK";
        const logo = isAway ? awayLogo() : isHome ? homeLogo() : "";
        markers.push({
          key: `gm-${idx}`,
          dedupeKey: `${abbr}|${period}|${Math.round(minute * 10)}`,
          minute,
          teamColor: getTeamColor(abbr, "#2563eb"),
          teamLogo: logo,
        });
      });
      const seen = new Set();
      return markers
        .filter((m) => {
          if (seen.has(m.dedupeKey)) return false;
          seen.add(m.dedupeKey);
          return true;
        })
        .sort((a, b) => a.minute - b.minute);
    })();

    const filtersHtml = `
      <div class="sb-shifts-filters">
        <button class="sb-shifts-filter" data-picker="team" style="border-color:${selectedTeam?.color || "var(--bg-border)"}">
          ${selectedTeam?.logo ? `<img src="${esc(selectedTeam.logo)}" alt="" onerror="this.style.display='none'">` : ""}
          <span>${esc(selectedTeam ? selectedTeam.abbr : "Team")}</span>
        </button>
        <button class="sb-shifts-filter sb-shifts-filter-player" data-picker="player" style="border-color:${selectedPlayer?.team?.color || "var(--bg-border)"}">
          <span>${esc(selectedPlayer ? selectedPlayer.name : "Player")}</span>
        </button>
        <button class="sb-shifts-filter" data-picker="period">
          <span>${filter.period ? (filter.period <= 3 ? `P${filter.period}` : getNhlExtraPeriodLabel({ number: filter.period, gameType: game?.gameType, longForm: false })) : "Period"}</span>
        </button>
      </div>`;

    let chartHtml;
    if (!chartRows.length) {
      chartHtml = '<div class="sb-empty">No shifts found for the selected filters.</div>';
    } else {
      const namesCol = chartRows
        .map((row) =>
          row.type === "team"
            ? `<div class="sb-shifts-team-name"><span style="color:${row.team.color}">${esc(row.team.name)}</span></div>`
            : `<div class="sb-shifts-player-name">${esc(row.player.name)}</div>`,
        )
        .join("");
      const timelineRows = chartRows
        .map((row) =>
          row.type === "team"
            ? `<div class="sb-shifts-team-row"><div class="sb-shifts-team-div" style="background:${row.team.color}"></div></div>`
            : `<div class="sb-shifts-player-row">${row.bars
                .map((bar) => {
                  const left = (bar.startMin - minStart) * PX_PER_MIN;
                  const width = Math.max(2, (bar.endMin - bar.startMin) * PX_PER_MIN);
                  return `<div class="sb-shifts-bar" style="left:${left}px;width:${width}px;background:${row.team.color}"></div>`;
                })
                .join("")}</div>`,
        )
        .join("");
      const topTicks = axisTicks
        .map(
          (t) =>
            `<span class="sb-shifts-tick" style="left:${(t - minStart) * PX_PER_MIN}px">${formatAxisLabel(t)}</span>`,
        )
        .join("");
      const goalLines = goalMarkers
        .map(
          (m) =>
            `<div class="sb-shifts-goal-line" style="left:${(m.minute - minStart) * PX_PER_MIN}px;background:${m.teamColor}"></div>`,
        )
        .join("");
      const goalLogos = goalMarkers
        .filter((m) => m.teamLogo)
        .map(
          (m) =>
            `<img class="sb-shifts-goal-logo" src="${esc(m.teamLogo)}" style="left:${(m.minute - minStart) * PX_PER_MIN}px;border-color:${m.teamColor}" onerror="this.style.display='none'">`,
        )
        .join("");
      chartHtml = `
        <div class="sb-shifts-chart">
          <div class="sb-shifts-names-col">
            <div class="sb-shifts-axis-pad"></div>
            ${namesCol}
          </div>
          <div class="sb-shifts-timeline-scroll">
            <div class="sb-shifts-timeline" style="width:${timelineWidth}px">
              <div class="sb-shifts-axis-pad">${topTicks}</div>
              <div class="sb-shifts-goal-overlay">${goalLines}</div>
              ${timelineRows}
              <div class="sb-shifts-axis-bottom">${topTicks}${goalLogos}</div>
            </div>
          </div>
        </div>`;
    }

    const html = `<div class="sb-shifts-wrap">${filtersHtml}${chartHtml}</div>`;
    if (!setPanelHtml(body, html)) return;

    body.querySelectorAll(".sb-shifts-filter").forEach((btn) => {
      btn.addEventListener("click", () => {
        const picker = btn.dataset.picker;
        if (picker === "team") {
          const idx = teamOptions.findIndex((t) => t.id === String(filter.teamId));
          const next = teamOptions[idx + 1] || null;
          filter.teamId = next ? next.id : null;
          filter.playerKey = null;
        } else if (picker === "player") {
          const all = playerSections.flatMap((s) => s.players);
          const idx = all.findIndex((p) => p.key === filter.playerKey);
          const next = all[idx + 1] || null;
          filter.playerKey = next ? next.key : null;
          if (next) filter.teamId = next.team.id;
        } else {
          const idx = periodOptions.indexOf(filter.period);
          const next = periodOptions[idx + 1] || null;
          filter.period = next;
        }
        renderShiftsPanel(body, side);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERIES PANEL
  // ═══════════════════════════════════════════════════════════════════════════
  function renderSeriesPanel(body, side) {
    const aColor = awayColor();
    const hColor = homeColor();
    const matches = Array.isArray(game?.seasonSeries) ? game.seasonSeries : [];
    const currentHomeId = Number(game?.home?.id);
    const currentAwayId = Number(game?.away?.id);

    const filtered = matches
      .filter((m) => {
        if (!m) return false;
        const ids = [Number(m?.homeTeam?.id), Number(m?.awayTeam?.id)];
        return ids.includes(currentHomeId) && ids.includes(currentAwayId);
      })
      .sort((a, b) => {
        const at = new Date(a?.startTimeUTC || a?.gameDate || 0).getTime();
        const bt = new Date(b?.startTimeUTC || b?.gameDate || 0).getTime();
        return (Number.isNaN(bt) ? 0 : bt) - (Number.isNaN(at) ? 0 : at);
      });

    let homeWins = 0;
    let awayWins = 0;
    filtered.forEach((m) => {
      const hs = Number(m?.homeTeam?.score);
      const as = Number(m?.awayTeam?.score);
      if (!Number.isFinite(hs) || !Number.isFinite(as) || hs === as) return;
      const winner = hs > as ? Number(m?.homeTeam?.id) : Number(m?.awayTeam?.id);
      if (winner === currentHomeId) homeWins += 1;
      else if (winner === currentAwayId) awayWins += 1;
    });

    const total = homeWins + awayWins;
    const hFlex = total > 0 ? homeWins : 1;
    const aFlex = total > 0 ? awayWins : 1;

    const summary = `
      <div class="sb-series-card">
        <div class="sb-series-header">
          <span class="sb-series-title">${isNhlPlayoffGameType(game?.gameType) ? "PLAYOFF SERIES" : "SEASON SERIES"}</span>
        </div>
        <div class="sb-series-body">
          <div class="sb-series-side">
            <img src="${esc(awayLogo())}" alt="" onerror="this.style.display='none'">
            <span class="sb-series-wins">${awayWins}</span>
          </div>
          <div class="sb-series-vs">VS</div>
          <div class="sb-series-side sb-series-side-right">
            <span class="sb-series-wins">${homeWins}</span>
            <img src="${esc(homeLogo())}" alt="" onerror="this.style.display='none'">
          </div>
        </div>
        <div class="sb-series-footer">
          <div style="flex:${aFlex};background:${aColor}"></div>
          <div style="flex:${hFlex};background:${hColor}"></div>
        </div>
      </div>`;

    const matchCards = filtered.length
      ? filtered
          .map((match) => {
            const left = match?.awayTeam || {};
            const right = match?.homeTeam || {};
            const leftId = Number(left?.id);
            const rightId = Number(right?.id);
            const leftAbbr = String(
              left?.abbrev ||
                (leftId === currentAwayId
                  ? game?.away?.abbreviation
                  : game?.home?.abbreviation) ||
                "",
            ).toUpperCase();
            const rightAbbr = String(
              right?.abbrev ||
                (rightId === currentHomeId
                  ? game?.home?.abbreviation
                  : game?.away?.abbreviation) ||
                "",
            ).toUpperCase();
            const leftColor = getTeamColor(leftAbbr, aColor);
            const rightColor = getTeamColor(rightAbbr, hColor);
            const leftScore = left?.score != null && left?.score !== "" ? Number(left.score) : null;
            const rightScore = right?.score != null && right?.score !== "" ? Number(right.score) : null;
            const hasScore = leftScore != null && rightScore != null;
            const state = String(match?.gameState || "").toUpperCase();
            const live = state === "LIVE" || state === "CRIT" || state === "IN";
            const leftWon = hasScore && !live && leftScore > rightScore;
            const rightWon = hasScore && !live && rightScore > leftScore;
            const { time, ampm } = formatLocalTime(match?.startTimeUTC || match?.gameDate);
            let topDate = "";
            try {
              const d = new Date(match?.startTimeUTC || match?.gameDate);
              if (!Number.isNaN(d.getTime())) {
                const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                topDate = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
              }
            } catch {
              topDate = "";
            }
            const gameTypeDesc =
              Number(match?.gameType) === 1
                ? "Preseason"
                : Number(match?.gameType) === 2
                  ? "Regular Season"
                  : Number(match?.gameType) === 3
                    ? "Playoffs"
                    : "NHL";
            const topLine = topDate ? `${topDate} · ${gameTypeDesc}` : gameTypeDesc;
            const leftLogo =
              left?.logo ||
              (leftId === currentAwayId ? awayLogo() : homeLogo());
            const rightLogo =
              right?.logo ||
              (rightId === currentHomeId ? homeLogo() : awayLogo());
            return `
              <a class="sb-series-match" href="scoreboard.html?id=${esc(match?.id)}">
                <div class="sb-series-match-top">${esc(topLine)}</div>
                <div class="sb-series-match-body" style="background:linear-gradient(90deg,${withAlpha30(leftColor)},transparent 35%,transparent 65%,${withAlpha30(rightColor)})">
                  <div class="sb-series-match-side">
                    <img src="${esc(leftLogo)}" alt="" style="opacity:${!hasScore ? 1 : leftWon ? 1 : 0.55}" onerror="this.style.display='none'">
                    <span class="sb-series-match-name" style="opacity:${!hasScore ? 1 : leftWon ? 1 : 0.55};font-weight:${leftWon ? "700" : "500"}">${esc(left?.commonName || left?.placeName || leftAbbr || "Away")}</span>
                  </div>
                  <div class="sb-series-match-score">
                    ${
                      hasScore
                        ? `<span style="color:${live ? "var(--accent-error, #e03131)" : leftWon ? "var(--text-primary)" : "var(--text-secondary)"};font-weight:${leftWon ? "800" : "500"}">${leftScore}</span><span class="sb-series-dash">-</span><span style="color:${live ? "var(--accent-error, #e03131)" : rightWon ? "var(--text-primary)" : "var(--text-secondary)"};font-weight:${rightWon ? "800" : "500"}">${rightScore}</span>`
                        : `<span class="sb-series-time">${esc(time)}</span><span class="sb-series-ampm">${esc(ampm.toUpperCase())}</span>`
                    }
                  </div>
                  <div class="sb-series-match-side sb-series-match-side-right">
                    <span class="sb-series-match-name" style="opacity:${!hasScore ? 1 : rightWon ? 1 : 0.55};font-weight:${rightWon ? "700" : "500"}">${esc(right?.commonName || right?.placeName || rightAbbr || "Home")}</span>
                    <img src="${esc(rightLogo)}" alt="" style="opacity:${!hasScore ? 1 : rightWon ? 1 : 0.55}" onerror="this.style.display='none'">
                  </div>
                </div>
              </a>`;
          })
          .join("")
      : '<div class="sb-empty">No series matches available.</div>';

    setPanelHtml(body, `<div class="sb-series-wrap">${summary}${matchCards}</div>`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RINK SVG (ported from app NHLRinkGraphic, horizontal)
  // ═══════════════════════════════════════════════════════════════════════════
  function rinkSvg({
    xCoord,
    yCoord,
    teamColor,
    teamSide,
    homeTeamDefendingSide,
    isScoring,
    showTargetPath,
  }) {
    const blue = "#0B71B8";
    const red = "#F0131E";
    const rinkFrame = { x: 10, y: 10, width: 300, height: 168 };
    const leftGoalRect = { x: 28, y: 82, width: 6, height: 24 };
    const rightGoalRect = { x: 286, y: 82, width: 6, height: 24 };
    const coordBounds = { xMin: -99, xMax: 99, yMin: -42, yMax: 42 };
    const toCoordX = (rinkPx) =>
      coordBounds.xMin +
      ((rinkPx - rinkFrame.x) / rinkFrame.width) *
        (coordBounds.xMax - coordBounds.xMin);
    const toCoordY = (rinkPy) =>
      coordBounds.yMin +
      ((rinkPy - rinkFrame.y) / rinkFrame.height) *
        (coordBounds.yMax - coordBounds.yMin);
    const goalSampleRects = {
      left: {
        x: toCoordX(leftGoalRect.x + leftGoalRect.width / 2),
        y: toCoordY(leftGoalRect.y + leftGoalRect.height / 2),
      },
      right: {
        x: toCoordX(rightGoalRect.x + rightGoalRect.width / 2),
        y: toCoordY(rightGoalRect.y + rightGoalRect.height / 2),
      },
    };

    const safeTeamColor = String(teamColor || "#2563eb");
    const safeTeamSide = String(teamSide || "").trim().toLowerCase();
    const safeDefendingSide = String(homeTeamDefendingSide || "")
      .trim()
      .toLowerCase();
    const shotXRaw =
      xCoord === null || xCoord === undefined || xCoord === ""
        ? null
        : Number(xCoord);
    const shotYRaw =
      yCoord === null || yCoord === undefined || yCoord === ""
        ? null
        : Number(yCoord);
    const hasShot = Number.isFinite(shotXRaw) && Number.isFinite(shotYRaw);
    const shotX = hasShot ? shotXRaw : null;
    const shotY = hasShot ? shotYRaw : null;

    let targetGoal = goalSampleRects.right;
    if (safeDefendingSide === "left") {
      targetGoal =
        safeTeamSide === "away" ? goalSampleRects.left : goalSampleRects.right;
    } else if (safeDefendingSide === "right") {
      targetGoal =
        safeTeamSide === "home" ? goalSampleRects.left : goalSampleRects.right;
    } else if (hasShot) {
      targetGoal = shotX < 0 ? goalSampleRects.left : goalSampleRects.right;
    }

    const shotBorderColor = isScoring ? "#FFFFFF" : safeTeamColor;
    const shotFillColor = isScoring ? safeTeamColor : "#FFFFFF";
    const goalFillColor = safeTeamColor;
    const shotRadius = 7.5;
    const goalRadius = 4;
    const shouldShowTargetPath = Boolean(showTargetPath);
    const rinkX = (x) =>
      rinkFrame.x +
      ((x - coordBounds.xMin) / (coordBounds.xMax - coordBounds.xMin)) *
        rinkFrame.width;
    const rinkY = (y) =>
      rinkFrame.y +
      ((y - coordBounds.yMin) / (coordBounds.yMax - coordBounds.yMin)) *
        rinkFrame.height;

    let s = `<svg viewBox="0 0 320 188" preserveAspectRatio="xMidYMid meet" class="sb-rink-svg">`;
    s += `<rect x="10" y="10" width="300" height="168" rx="36" fill="#FFFFFF" stroke="${blue}" stroke-width="3.5"/>`;
    s += `<line x1="160" y1="10" x2="160" y2="178" stroke="${red}" stroke-width="2.5"/>`;
    s += `<line x1="108" y1="10" x2="108" y2="178" stroke="${blue}" stroke-width="2"/>`;
    s += `<line x1="212" y1="10" x2="212" y2="178" stroke="${blue}" stroke-width="2"/>`;
    s += `<line x1="34" y1="10" x2="34" y2="178" stroke="${red}" stroke-width="1.8"/>`;
    s += `<line x1="286" y1="10" x2="286" y2="178" stroke="${red}" stroke-width="1.8"/>`;
    s += `<circle cx="160" cy="94" r="22" fill="none" stroke="${blue}" stroke-width="2"/>`;
    s += `<circle cx="160" cy="94" r="2.3" fill="${blue}"/>`;
    [
      [70, 53],
      [70, 135],
      [250, 53],
      [250, 135],
    ].forEach(([cx, cy]) => {
      s += `<circle cx="${cx}" cy="${cy}" r="22" fill="none" stroke="${red}" stroke-width="2"/>`;
    });
    [
      [64, 53, 76, 53],
      [70, 47, 70, 59],
      [244, 53, 256, 53],
      [250, 47, 250, 59],
      [64, 135, 76, 135],
      [70, 129, 70, 141],
      [244, 135, 256, 135],
      [250, 129, 250, 141],
    ].forEach(([x1, y1, x2, y2]) => {
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${red}" stroke-width="1.6"/>`;
    });
    [
      [62, 30, 62, 38],
      [78, 30, 78, 38],
      [62, 150, 62, 158],
      [78, 150, 78, 158],
      [242, 30, 242, 38],
      [258, 30, 258, 38],
      [242, 150, 242, 158],
      [258, 150, 258, 158],
    ].forEach(([x1, y1, x2, y2]) => {
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${red}" stroke-width="1.6"/>`;
    });
    [
      [128, 57],
      [192, 57],
      [128, 131],
      [192, 131],
    ].forEach(([cx, cy]) => {
      s += `<circle cx="${cx}" cy="${cy}" r="1.9" fill="${red}"/>`;
    });
    s += `<circle cx="34" cy="94" r="12" fill="none" stroke="${blue}" stroke-width="2"/>`;
    s += `<circle cx="286" cy="94" r="12" fill="none" stroke="${blue}" stroke-width="2"/>`;
    s += `<rect x="${leftGoalRect.x}" y="${leftGoalRect.y}" width="${leftGoalRect.width}" height="${leftGoalRect.height}" rx="3" fill="#FFFFFF" stroke="${red}" stroke-width="1.6"/>`;
    s += `<rect x="${rightGoalRect.x}" y="${rightGoalRect.y}" width="${rightGoalRect.width}" height="${rightGoalRect.height}" rx="3" fill="#FFFFFF" stroke="${red}" stroke-width="1.6"/>`;

    if (hasShot && shouldShowTargetPath) {
      s += `<line x1="${rinkX(shotX)}" y1="${rinkY(shotY)}" x2="${rinkX(targetGoal.x)}" y2="${rinkY(targetGoal.y)}" stroke="${safeTeamColor}" stroke-width="1.6" stroke-opacity="0.9"/>`;
    }
    if (hasShot) {
      s += `<circle cx="${rinkX(shotX)}" cy="${rinkY(shotY)}" r="${shotRadius + 2}" fill="none" stroke="${shotFillColor}" stroke-width="1.3"/>`;
      s += `<circle cx="${rinkX(shotX)}" cy="${rinkY(shotY)}" r="${shotRadius}" fill="${shotFillColor}" stroke="${shotBorderColor}" stroke-width="2.6"/>`;
    }
    if (shouldShowTargetPath) {
      s += `<circle cx="${rinkX(targetGoal.x)}" cy="${rinkY(targetGoal.y)}" r="${goalRadius + 1.6}" fill="none" stroke="${goalFillColor}" stroke-width="1.1"/>`;
      s += `<circle cx="${rinkX(targetGoal.x)}" cy="${rinkY(targetGoal.y)}" r="${goalRadius}" fill="${goalFillColor}" stroke="#FFFFFF" stroke-width="2"/>`;
    }
    s += `</svg>`;
    return s;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAYER MODAL
  // ═══════════════════════════════════════════════════════════════════════════
  function openPlayerModal(player) {
    if (!player) return;
    const id = Number(player?.id ?? player?.playerId);
    const meta = Number.isFinite(id) ? game?.playerMetaById?.[id] || {} : {};
    const name =
      String(player?.name || "").trim() ||
      [meta.firstName, meta.lastName].filter(Boolean).join(" ").trim() ||
      "Unknown Player";
    const abbr = String(
      player?.teamAbbrev ||
        (player?.teamSide === "home"
          ? game?.home?.abbreviation
          : game?.away?.abbreviation) ||
        "",
    ).toUpperCase();
    const color = getTeamColor(abbr, "#2563eb");
    const number =
      player?.number != null
        ? `#${player.number}`
        : meta?.sweaterNumber != null
          ? `#${meta.sweaterNumber}`
          : "";
    const position = String(player?.position || meta?.position || "").trim();
    const headshot =
      player?.headshot ||
      getNhlMugHeadshotUrl({
        seasonCode: getNhlSeasonSpan(),
        teamAbbrev: abbr,
        playerId: id,
      });

    const stats = { ...(meta?.stats || {}), ...(player?.stats || {}) };
    const isGoalie = position.toUpperCase() === "G";
    const defs = isGoalie
      ? [
          ["wins", "W"],
          ["losses", "L"],
          ["otLosses", "OTL"],
          ["savePctg", "SV%"],
          ["goalsAgainstAvg", "GAA"],
          ["gaa", "GAA"],
          ["shutouts", "SO"],
          ["shotsAgainst", "SA"],
          ["saves", "SV"],
          ["goalsAgainst", "GA"],
          ["toi", "TOI"],
        ]
      : [
          ["goals", "GLS"],
          ["assists", "AST"],
          ["points", "PTS"],
          ["plusMinus", "+/-"],
          ["sog", "SOG"],
          ["shots", "SHT"],
          ["hits", "HIT"],
          ["blockedShots", "BLK"],
          ["pim", "PIM"],
          ["toi", "TOI"],
          ["avgTimeOnIce", "AVG TOI"],
          ["gamesPlayed", "GP"],
        ];
    const seen = new Set();
    const statItems = [];
    defs.forEach(([key, label]) => {
      if (seen.has(label)) return;
      const v = stats[key];
      if (v == null || v === "") return;
      seen.add(label);
      statItems.push({ label, value: formatNhlStatVal(key, v) });
    });

    const initials =
      name
        .split(/\s+/)
        .filter(Boolean)
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "?";

    $("#sbPlayerModalBody").innerHTML = `
      <div class="sb-pm-header" style="border-bottom-color:${color}">
        <div class="sb-pm-headshot-wrap">
          ${headshot ? `<img class="sb-pm-headshot" style="border-color:${color}" src="${esc(headshot)}" alt="" onerror="this.style.display='none'">` : `<div class="sb-pm-headshot sb-pm-headshot-fallback" style="border-color:${color};background:${withAlpha66(color)}">${esc(initials)}</div>`}
          ${position ? `<span class="sb-pm-pos-badge">${esc(position.toUpperCase())}</span>` : ""}
        </div>
        <div class="sb-pm-name">${esc(name)}</div>
        <div class="sb-pm-meta">${esc([number, abbr].filter(Boolean).join(" · "))}</div>
      </div>
      <div class="sb-pm-stats">
        ${
          statItems.length
            ? statItems
                .map(
                  (s) =>
                    `<div class="sb-pm-stat"><div class="sb-pm-stat-val">${esc(s.value)}</div><div class="sb-pm-stat-lbl">${esc(s.label)}</div></div>`,
                )
                .join("")
            : '<div class="sb-empty">No stats available</div>'
        }
      </div>`;

    $("#sbPlayerModal").style.display = "flex";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STREAMING — StreamFree (streamfree.top) via /assets/stream-service.js
  // ═══════════════════════════════════════════════════════════════════════════
  const STREAM_SPORT = "nhl";

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
    frame.src = url + (url.includes("?") ? "&" : "?") + "_nocache=" + Date.now();
    frame.onload = () => {
      if (loading) loading.hidden = true;
      frame.style.display = "block";
    };
  }

  async function openStreamModal() {
    const homeName = game?.home?.name || game?.home?.abbreviation || "";
    const awayName = game?.away?.name || game?.away?.abbreviation || "";
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
    if (typeof LiveTrackerViewer !== "undefined")
      LiveTrackerViewer.startPollingAndRecord("nhl", gameId);
    const authContainer = document.getElementById("auth-button-container");
    if (authContainer && typeof createAuthButton === "function") {
      authContainer.appendChild(createAuthButton());
    }
    if (typeof Auth !== "undefined" && Auth.onChange) {
      Auth.onChange(function () {
        renderHeader();
      });
    }
  }

  init();
})();

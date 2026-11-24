// ─── WNBA Scoreboard ──────────────────────────────────────────────────────────
// Mirrors the app's WNBA GameDetailsScreen: NHL-style header (venue row, team
// sides with score-beside-logo, status center, stream button), sticky mini
// header, single tab bar (Stats / Away / Home / Plays / Series), linescore,
// stats bars, leaders, rosters, plays, player modal and live streaming.
// Data source: ESPN summary API (read through the r.jina.ai proxy).
// Pattern follows nhl/scoreboard.js + nfl/scoreboard.js.

(function () {
  "use strict";

  const SPORT = "wnba";
  const ESPN_PATH = "basketball/wnba";
  const LOGO_PATH = "wnba";
  const FALLBACK_COLOR = "#ff6b35";
  const POLL_LIVE_MS = 5000;
  const POLL_IDLE_MS = 30000;

  let gameId = null;
  let gameData = null; // ESPN summary JSON
  let pollTimer = null;
  let leftTab = "Stats";
  let rightTab = "Away";
  let splitViewActive = false;
  let rosterSection = { left: null, right: null };
  let playsState = { left: { type: "ALL", period: null }, right: { type: "ALL", period: null } };

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
  // COLORS — same contrast-aware logic as the app's getSmartTeamColors
  // ═══════════════════════════════════════════════════════════════════════════
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
  }) {
    const homeColors = [homePrimary, homeSecondary, FALLBACK_COLOR].filter(
      Boolean,
    );
    const awayColors = [awayPrimary, awaySecondary, "#111111"].filter(Boolean);
    for (const h of homeColors) {
      for (const a of awayColors) {
        if (!areColorsSimilar(h, a)) return { homeColor: h, awayColor: a };
      }
    }
    return { homeColor: homeColors[0], awayColor: awayColors[0] };
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

  function getTeamColor(abbr, fallback) {
    const map = {
      ATL: "#C8102E",
      CHI: "#5091CD",
      CON: "#FF6B35",
      CONN: "#FF6B35",
      DAL: "#002B5C",
      IND: "#E03A3E",
      LV: "#000000",
      LAS: "#552583",
      LA: "#552583",
      MIN: "#236192",
      NY: "#6ECEB2",
      NYL: "#6ECEB2",
      PHX: "#E56020",
      PHO: "#E56020",
      SEA: "#2C5234",
      WSH: "#C8102E",
      WAS: "#C8102E",
    };
    const key = String(abbr || "").toUpperCase();
    return map[key] || fallback || FALLBACK_COLOR;
  }

  function headshotUrl(id) {
    const n = Number(id);
    if (!Number.isFinite(n)) return "";
    return `https://a.espncdn.com/combiner/i?img=/i/headshots/${LOGO_PATH}/players/full/${n}.png&w=150`;
  }

  function getTeamAbbr(team) {
    return String(team?.abbreviation || "").toUpperCase();
  }

  function getTeamLogoUrl(team) {
    if (!team) return "";
    if (team.logos && team.logos.length)
      return team.logos[0].href || team.logos[1]?.href || "";
    if (team.logo) return team.logo;
    const abbr = getTeamAbbr(team).toLowerCase();
    return abbr
      ? `https://a.espncdn.com/i/teamlogos/${LOGO_PATH}/500/${abbr}.png`
      : "";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GAME DATA ACCESSORS
  // ═══════════════════════════════════════════════════════════════════════════
  function getCompetition() {
    return (
      gameData?.header?.competitions?.[0] ||
      gameData?.competitions?.[0] ||
      null
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
    const st = getStatus()?.type || {};
    return st.state === "pre" || /scheduled/i.test(st.description || "");
  }

  function isFinal() {
    const st = getStatus()?.type || {};
    return (
      st.completed === true ||
      st.state === "post" ||
      /final/i.test(st.description || "")
    );
  }

  function isHalftime() {
    return /halftime/i.test(getStatus()?.type?.description || "");
  }

  function isLive() {
    if (isScheduled() || isFinal()) return false;
    const st = getStatus()?.type || {};
    return st.state === "in" || isHalftime();
  }

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
    });
  }

  function getSmartColor(team) {
    if (!team) return FALLBACK_COLOR;
    const { home, away } = getTeams();
    const pair = getMatchColors();
    if (home && String(home.team?.id) === String(team.id)) return pair.homeColor;
    if (away && String(away.team?.id) === String(team.id)) return pair.awayColor;
    if (team.color) return `#${team.color}`;
    return getTeamColor(getTeamAbbr(team));
  }

  function periodLabel(n) {
    const p = Number(n || 0);
    if (p <= 0) return "";
    if (p <= 4) return `Q${p}`;
    return `OT${p - 4}`;
  }

  function statusLine1() {
    const st = getStatus()?.type || {};
    if (isFinal()) return "Final";
    if (isHalftime()) return "Halftime";
    if (isLive()) {
      const p = getStatus()?.period;
      return p && p > 0 ? periodLabel(p) : "Live";
    }
    return st.shortDetail || st.description || "Scheduled";
  }

  function statusLine2() {
    const comp = getCompetition();
    const s = getStatus();
    if (isLive() && s?.displayClock && !isHalftime()) return s.displayClock;
    const d = new Date(comp?.date || gameData?.header?.competitions?.[0]?.date);
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

  function leagueLine() {
    const comp = getCompetition();
    const venue =
      gameData?.gameInfo?.venue?.fullName || comp?.venue?.fullName || "";
    const note = gameData?.header?.gameNote || null;
    return [venue || "WNBA", note || "WNBA"].filter(Boolean).join(" · ");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA FETCHING (ESPN read through r.jina.ai)
  // ═══════════════════════════════════════════════════════════════════════════
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

  async function fetchGameData() {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH}/summary?event=${gameId}`;
      gameData = await fetchJson(url);
      renderAll();
      schedulePoll();
    } catch (err) {
      console.error("WNBA scoreboard fetch error:", err);
      sbHeader.innerHTML =
        '<div class="sb-error">Failed to load game data. <button onclick="location.reload()">Retry</button></div>';
    }
  }

  async function fetchGameDataQuiet() {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH}/summary?event=${gameId}`;
      gameData = await fetchJson(url);
      renderAllQuiet();
      schedulePoll();
    } catch (err) {
      console.error("WNBA scoreboard quiet fetch error:", err);
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
  // HEADER — mirrors app HeaderGradient + SimpleTeamDisplay + status center
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
      away.team?.shortDisplayName || away.team?.displayName || "Away";
    const homeName =
      home.team?.shortDisplayName || home.team?.displayName || "Home";
    const awayRecord = away.record?.[0]?.summary || "";
    const homeRecord = home.record?.[0]?.summary || "";

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
    ) => {
      const scoreEl = showScores
        ? `<span class="sb-team-score" style="color:${final && isLoser ? "var(--text-secondary)" : "var(--text-primary)"};font-weight:${isWinner || live ? "800" : "400"}">${esc(score)}</span>`
        : "";
      const logoEl = logo
        ? `<img src="${esc(logo)}" class="sb-team-logo" alt="${esc(name)}" onerror="this.parentElement.innerHTML='<div class=\\'sb-team-logo-fallback\\' style=\\'background:${color}\\'>${abbr[0]}</div>'">`
        : `<div class="sb-team-logo-fallback" style="background:${color}">${abbr[0]}</div>`;
      const logoScoreRow =
        side === "home"
          ? `${scoreEl}<div class="sb-team-logo-wrap">${logoEl}</div>`
          : `<div class="sb-team-logo-wrap">${logoEl}</div>${scoreEl}`;
      return `
        <div class="sb-team-col">
          <a href="team-page.html?id=${esc(team.id)}" class="sb-team-link">
            <div class="sb-logo-score-row">${logoScoreRow}</div>
            <div class="sb-team-name" style="opacity:${final && isLoser ? "0.55" : "1"}">${esc(name)}</div>
          </a>
          ${record ? `<div class="sb-team-record" style="opacity:${final && isLoser ? "0.55" : "1"}">${esc(record)}</div>` : ""}
        </div>`;
    };

    const streamBtn =
      live && typeof Auth !== "undefined" && Auth.isLoggedIn
        ? `<button class="sb-stream-btn" id="sbStreamOpen"><span class="sb-stream-dot"></span> Stream</button>`
        : "";

    setPanelHtml(
      sbHeader,
      `
      <div class="sb-header-inner">
        <div class="sb-header-gradient" style="background:linear-gradient(90deg,${awayColor}33 0%,transparent 40%,transparent 60%,${homeColor}33 100%)"></div>
        <div class="sb-league-row">${esc(leagueLine())}</div>
        <div class="sb-teams-row">
          ${teamSide(away, awayScore, "away", awayColor, awayLogo, awayAbbr, awayName, awayRecord, awayWon, homeWon)}
          <div class="sb-status-center">
            <div class="sb-status-top" style="color:${final ? "var(--text-secondary)" : live ? "var(--accent-success, #27ae60)" : "var(--text-primary)"}">${esc(statusLine1())}</div>
            ${statusLine2() ? `<div class="sb-status-bottom">${esc(statusLine2())}</div>` : ""}
            ${streamBtn}
          </div>
          ${teamSide(home, homeScore, "home", homeColor, homeLogo, homeAbbr, homeName, homeRecord, homeWon, awayWon)}
        </div>
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
  // TAB BAR — single bar (Stats / Away / Home / Plays / Series?)
  // ═══════════════════════════════════════════════════════════════════════════
  function hasSeriesData() {
    const ss = gameData?.seasonseries;
    if (Array.isArray(ss) && ss.length > 0) return true;
    const comp = getCompetition();
    return !!(gameData?.seriesSummary || comp?.series);
  }

  function allTabs() {
    const tabs = ["Stats", "Away", "Home", "Plays"];
    if (hasSeriesData()) tabs.push("Series");
    return tabs;
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
    if (!tabs.includes(currentTab)) {
      if (side === "left") leftTab = tabs[0];
      else rightTab = tabs[1] || tabs[0];
    }
    const active = side === "left" ? leftTab : rightTab;
    const tabsHtml = tabs
      .map((t) => {
        const disabled = noDisable
          ? false
          : (side === "left" && t === rightTab) ||
            (side === "right" && t === leftTab);
        return `<button class="sb-tab${t === active ? " active" : ""}${disabled ? " disabled" : ""}" data-tab="${t}"${disabled ? " disabled" : ""}>${t}</button>`;
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
    if (!gameData) return;
    const tab = side === "left" ? leftTab : rightTab;
    const body = side === "left" ? sbLeftBody : sbRightBody;
    switch (tab) {
      case "Stats":
        renderStatsPanel(body);
        break;
      case "Away":
        renderRosterPanel(body, side, "away");
        break;
      case "Home":
        renderRosterPanel(body, side, "home");
        break;
      case "Plays":
        renderPlaysPanel(body, side);
        break;
      case "Series":
        renderSeriesPanel(body);
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATS PANEL — linescore + stat bars + leaders
  // ═══════════════════════════════════════════════════════════════════════════
  function renderStatsPanel(body) {
    const pair = getMatchColors();
    let html = "";
    html += renderLinescore(pair.awayColor, pair.homeColor);
    html += renderStatBars(pair.awayColor, pair.homeColor);
    html += renderLeadersCard();
    setPanelHtml(
      body,
      html || '<div class="sb-empty">No game information available</div>',
    );
  }

  function renderLinescore(aColor, hColor) {
    const comp = getCompetition();
    const { home, away } = getTeams();
    if (!comp || !home || !away) return "";
    const awayLS = away.linescores || [];
    const homeLS = home.linescores || [];
    const maxPeriods = Math.max(awayLS.length, homeLS.length);
    if (maxPeriods === 0) return "";
    const labels = [];
    for (let i = 0; i < maxPeriods; i++)
      labels.push(i < 4 ? String(i + 1) : `OT${i > 4 ? i - 3 : ""}`);
    const awayAbbr = getTeamAbbr(away.team) || "AWY";
    const homeAbbr = getTeamAbbr(home.team) || "HME";

    return `
      <div class="sb-linescore">
        <div class="sb-ls-grid">
          <div class="sb-ls-col sb-ls-label-col">
            <div class="sb-ls-cell sb-ls-head"></div>
            <div class="sb-ls-cell" style="border-bottom:2px solid ${aColor}"><span class="sb-ls-abbr">${awayAbbr}</span></div>
            <div class="sb-ls-cell" style="border-bottom:2px solid ${hColor}"><span class="sb-ls-abbr">${homeAbbr}</span></div>
          </div>
          <div class="sb-ls-scroll">
            ${labels
              .map(
                (label, i) => `
              <div class="sb-ls-col">
                <div class="sb-ls-cell sb-ls-head"><span>${label}</span></div>
                <div class="sb-ls-cell" style="border-bottom:2px solid ${aColor}">${esc(awayLS[i]?.displayValue || "0")}</div>
                <div class="sb-ls-cell" style="border-bottom:2px solid ${hColor}">${esc(homeLS[i]?.displayValue || "0")}</div>
              </div>`,
              )
              .join("")}
          </div>
          <div class="sb-ls-col sb-ls-total-col">
            <div class="sb-ls-cell sb-ls-head"><span>T</span></div>
            <div class="sb-ls-cell" style="border-bottom:2px solid ${aColor}">${esc(away.score ?? "0")}</div>
            <div class="sb-ls-cell" style="border-bottom:2px solid ${hColor}">${esc(home.score ?? "0")}</div>
          </div>
        </div>
      </div>`;
  }

  function renderStatBars(aColor, hColor) {
    const teams = gameData?.boxscore?.teams || [];
    if (!teams.length) return "";
    const awayTeam = teams.find((t) => t.homeAway === "away") || teams[0];
    const homeTeam = teams.find((t) => t.homeAway === "home") || teams[1];

    const keyStats = isScheduled()
      ? [
          "avgPoints",
          "avgRebounds",
          "avgAssists",
          "fieldGoalPct",
          "threePointFieldGoalPct",
          "freeThrowPct",
        ]
      : [
          "fieldGoalsMade-fieldGoalsAttempted",
          "fieldGoalPct",
          "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
          "freeThrowsMade-freeThrowsAttempted",
          "totalRebounds",
          "assists",
          "steals",
          "blocks",
          "turnovers",
          "largestLead",
        ];

    const parseNum = (val) => {
      if (val == null) return 0;
      const s = String(val);
      const slash = s.match(/^(\d+)-(\d+)$/);
      if (slash) return parseInt(slash[1], 10);
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : 0;
    };

    const rows = keyStats
      .map((name) => {
        const aS = awayTeam?.statistics?.find((s) => s.name === name);
        const hS = homeTeam?.statistics?.find((s) => s.name === name);
        if (!aS && !hS) return null;
        const awayVal = aS?.displayValue || "0";
        const homeVal = hS?.displayValue || "0";
        return {
          label: aS?.label || hS?.label || name,
          awayVal,
          homeVal,
          awayNum: parseNum(awayVal),
          homeNum: parseNum(homeVal),
        };
      })
      .filter(Boolean);

    if (!rows.length) return "";

    return `
      <div class="sb-card">
        <div class="sb-card-header"><span class="sb-card-title">Stats</span></div>
        <div class="sb-stats-body">
          ${rows
            .map((row) => {
              const total = row.awayNum + row.homeNum;
              const awayShare = total > 0 ? row.awayNum / total : 0.5;
              const homeShare = total > 0 ? row.homeNum / total : 0.5;
              return `
                <div class="sb-stat-row">
                  <div class="sb-stat-vals">
                    <span>${esc(row.awayVal)}</span>
                    <span>${esc(row.homeVal)}</span>
                  </div>
                  <div class="sb-stat-bar">
                    <div style="width:${Math.max(0, Math.min(100, awayShare * 100))}%;background:${aColor}"></div>
                    <div style="width:${Math.max(0, Math.min(100, homeShare * 100))}%;background:${hColor}"></div>
                  </div>
                  <div class="sb-stat-lbl">${esc(String(row.label).toUpperCase())}</div>
                </div>`;
            })
            .join("")}
        </div>
      </div>`;
  }

  function renderLeadersCard() {
    const leaders = gameData?.leaders;
    if (!Array.isArray(leaders) || !leaders.length) return "";
    const { home, away } = getTeams();
    const awayAbbr = getTeamAbbr(away?.team);
    const sorted = [...leaders].sort((a, b) => {
      const aAway = getTeamAbbr(a?.team) === awayAbbr;
      const bAway = getTeamAbbr(b?.team) === awayAbbr;
      return (bAway ? 1 : 0) - (aAway ? 1 : 0);
    });

    const blocks = sorted
      .map((teamLeaders) => {
        const color = getSmartColor(teamLeaders.team);
        const teamLogo = getTeamLogoUrl(teamLeaders.team);
        const cats = (teamLeaders.leaders || [])
          .map((cat) => {
            const rows = (cat.leaders || [])
              .slice(0, 3)
              .map((leader) => {
                const ath = leader.athlete || {};
                const name = ath.displayName || ath.fullName || "";
                const shot = ath.headshot?.href || ath.headshot || "";
                const jersey = ath.jersey ? `#${ath.jersey}` : "";
                const pos = ath.position?.abbreviation || "";
                return `
                  <div class="sb-leader-row">
                    <div class="sb-leader-hs" style="border-color:${color};background:${withAlpha66(color)}">
                      ${shot ? `<img src="${esc(shot)}" alt="" onerror="this.style.display='none'">` : `<span>${esc((name || "?").charAt(0))}</span>`}
                    </div>
                    <div class="sb-leader-name-col">
                      <div class="sb-leader-name">${esc(name)}</div>
                      <div class="sb-leader-meta">${esc([jersey, pos].filter(Boolean).join(" · "))}</div>
                    </div>
                    <div class="sb-leader-val">${esc(leader.displayValue || "")}</div>
                  </div>`;
              })
              .join("");
            if (!rows) return "";
            return `<div class="sb-leader-cat"><div class="sb-leader-cat-title">${esc(cat.displayName || "")}</div>${rows}</div>`;
          })
          .join("");
        if (!cats) return "";
        return `
          <div class="sb-leaders-team">
            <div class="sb-leaders-team-head" style="background:${withAlpha30(color)}">
              ${teamLogo ? `<img src="${esc(teamLogo)}" alt="" onerror="this.style.display='none'">` : ""}
              <span style="color:var(--text-primary)">${esc(teamLeaders.team?.displayName || getTeamAbbr(teamLeaders.team))}</span>
            </div>
            <div class="sb-leaders-team-body">${cats}</div>
          </div>`;
      })
      .join("");

    if (!blocks) return "";
    return `
      <div class="sb-card">
        <div class="sb-card-header"><span class="sb-card-title">Leaders</span></div>
        <div class="sb-leaders-body">${blocks}</div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROSTER PANEL (Away / Home)
  // ═══════════════════════════════════════════════════════════════════════════
  function teamRoster(side) {
    const comp = side === "home" ? getTeams().home : getTeams().away;
    if (!comp) return { groups: [], players: [] };
    const playersBox = gameData?.boxscore?.players || [];
    const teamBox = playersBox.find(
      (pb) =>
        String(pb?.team?.id) === String(comp.team?.id) ||
        getTeamAbbr(pb?.team) === getTeamAbbr(comp.team),
    );
    const groups = (teamBox?.statistics || []).filter(
      (g) => Array.isArray(g?.athletes) && g.athletes.length,
    );
    const players = [];
    groups.forEach((g) => {
      g.athletes.forEach((entry) => {
        const ath = entry.athlete || entry;
        if (!ath?.id && !ath?.displayName) return;
        players.push({
          id: ath.id,
          name: ath.displayName || ath.fullName || ath.shortName || "Unknown",
          headshot: ath.headshot?.href || ath.headshot || headshotUrl(ath.id),
          jersey: ath.jersey || "",
          position: ath.position?.abbreviation || "",
          starter: entry.starter === true,
          active: entry.active === true,
          labels: g.labels || g.names || [],
          stats: entry.stats || [],
        });
      });
    });
    return { groups, players, comp };
  }

  function statLookup(labels, stats) {
    const map = {};
    (labels || []).forEach((l, i) => {
      const key = String(l).toUpperCase();
      if (!map[key]) map[key] = stats[i];
    });
    return map;
  }

  function rosterSections(side) {
    const { players } = teamRoster(side);
    if (!players.length) return [];
    const sections = [];
    if (isScheduled() || isFinal()) {
      const starters = players.filter((p) => p.starter);
      const bench = players.filter((p) => !p.starter);
      if (starters.length)
        sections.push({ key: "starters", label: "Starters", players: starters });
      if (bench.length)
        sections.push({ key: "bench", label: "Bench", players: bench });
      return sections;
    }
    // live
    const onCourt = players.filter((p) => p.active);
    const bench = players.filter((p) => !p.active);
    if (onCourt.length)
      sections.push({ key: "oncourt", label: "On Court", players: onCourt });
    if (bench.length)
      sections.push({ key: "bench", label: "Bench", players: bench });
    return sections.length
      ? sections
      : [{ key: "all", label: "Roster", players }];
  }

  function playerCardHtml(player, teamColor) {
    const map = statLookup(player.labels, player.stats);
    const val = (k) => (map[k] != null ? String(map[k]) : "—");
    const items = [
      { label: "PTS", value: val("PTS") },
      { label: "REB", value: val("REB") },
      { label: "AST", value: val("AST") },
      { label: "MIN", value: val("MIN") },
    ];
    const initials =
      String(player.name || "")
        .split(/\s+/)
        .filter(Boolean)
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "?";
    const playerJson = esc(JSON.stringify(player));
    const meta = [player.jersey ? `#${player.jersey}` : "", player.position]
      .filter(Boolean)
      .join(" · ");
    return `
      <div class="sb-player-card" data-player="${playerJson}" style="border-color:${teamColor}">
        <div class="sb-pc-top">
          <div class="sb-pc-headshot-wrap" style="background:${withAlpha66(teamColor)};border-color:${teamColor}">
            ${player.headshot ? `<img src="${esc(player.headshot)}" alt="" loading="lazy" onerror="this.style.display='none'">` : `<span class="sb-pc-initials">${esc(initials)}</span>`}
          </div>
          <div class="sb-pc-info">
            <div class="sb-pc-name">${esc(player.name)}</div>
            ${meta ? `<div class="sb-pc-meta">${esc(meta)}</div>` : ""}
          </div>
        </div>
        <div class="sb-pc-stats">
          ${items
            .map(
              (s) =>
                `<div class="sb-pc-stat"><div class="sb-pc-stat-val">${esc(s.value)}</div><div class="sb-pc-stat-lbl">${s.label}</div></div>`,
            )
            .join("")}
        </div>
      </div>`;
  }

  function renderRosterPanel(body, side, teamSide) {
    const sections = rosterSections(teamSide);
    const teamColor =
      teamSide === "home" ? getMatchColors().homeColor : getMatchColors().awayColor;
    if (!sections.length) {
      setPanelHtml(body, '<div class="sb-empty">No players available</div>');
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

    const cards = active.players
      .map((p) => playerCardHtml(p, teamColor))
      .join("");
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
  // PLAYS PANEL — filter chips + shot cards + period pager (app parity)
  // ═══════════════════════════════════════════════════════════════════════════
  function nbaClassifyPlayType(play) {
    if (play?.scoringPlay) return "SCORING";
    const text = String(play?.text || play?.description || "").toLowerCase();
    if (text.includes("foul")) return "FOUL";
    if (text.includes("turnover")) return "TURNOVER";
    if (text.includes("rebound")) return "REBOUND";
    if (text.includes("block")) return "BLOCK";
    if (text.includes("steal")) return "STEAL";
    if (text.includes("timeout")) return "TIMEOUT";
    if (text.includes("substitution")) return "SUBSTITUTION";
    if (text.includes("violation")) return "VIOLATION";
    if (text.includes("free throw")) return "FREE THROW";
    if (text.includes("miss")) return "MISS";
    return "PLAY";
  }

  function nbaPeriodChip(n) {
    const v = Number(n || 0);
    if (v <= 0) return "";
    return v <= 4 ? `Q${v}` : `OT${v - 4}`;
  }

  function nbaFindPlayerBoxscore(athleteId) {
    if (!athleteId) return null;
    const playersBox = gameData?.boxscore?.players || [];
    for (const teamBox of playersBox) {
      for (const group of teamBox?.statistics || []) {
        if (!Array.isArray(group?.athletes)) continue;
        const entry = group.athletes.find(
          (a) => String(a?.athlete?.id) === String(athleteId),
        );
        if (entry) {
          const ath = entry.athlete || {};
          return {
            id: ath.id,
            name: ath.displayName || ath.fullName || ath.shortName || "Unknown",
            jersey: ath.jersey || "",
            position: ath.position?.abbreviation || "",
            headshot: ath.headshot?.href || ath.headshot || headshotUrl(ath.id),
            labels: group.labels || group.names || [],
            stats: entry.stats || [],
            teamAbbrev: getTeamAbbr(teamBox?.team),
          };
        }
      }
    }
    return null;
  }

  function nbaBoxPoints(box) {
    if (!box) return "";
    const labels = (box.labels || []).map((l) => String(l).toUpperCase());
    const idx =
      labels.indexOf("PTS") >= 0
        ? labels.indexOf("PTS")
        : labels.indexOf("POINTS");
    if (idx < 0) return "";
    const raw = box.stats[idx];
    return raw != null ? String(raw) : "";
  }

  function prepareNbaPlays() {
    const plays = gameData?.plays || [];
    if (!plays.length) return [];
    const { home, away } = getTeams();
    const pair = getMatchColors();
    const homeId = String(home?.team?.id || "");
    const awayId = String(away?.team?.id || "");
    const awayAbbr = getTeamAbbr(away?.team) || "AWY";
    const homeAbbr = getTeamAbbr(home?.team) || "HME";
    const awayLogo = getTeamLogoUrl(away?.team);
    const homeLogo = getTeamLogoUrl(home?.team);

    const scored = { away: 0, home: 0 };
    const scorerCounts = {};

    const rows = plays.map((play, idx) => {
      const text = play?.text || play?.description || "";
      const periodNumber = Number(play?.period?.number || 0);
      const periodLabel = nbaPeriodChip(periodNumber);
      const clock = play?.clock?.displayValue || "--:--";
      const isScoring = !!play?.scoringPlay;
      const scoreValue = play?.scoreValue || play?.pointsAttempted || 0;
      const playTeamId = String(play?.team?.id || "");
      const coordX = play?.coordinate?.x;
      const coordY = play?.coordinate?.y;
      const typeKey = nbaClassifyPlayType(play);

      const scorerId =
        play?.participants && play.participants.length > 0
          ? play.participants[0]?.athlete?.id || null
          : null;
      const scorerBox = scorerId ? nbaFindPlayerBoxscore(scorerId) : null;

      if (scorerId && isScoring) {
        scorerCounts[scorerId] = (scorerCounts[scorerId] || 0) + 1;
      }

      const isAway = playTeamId === awayId;
      const isHome = playTeamId === homeId;
      const teamColor = isAway
        ? pair.awayColor
        : isHome
          ? pair.homeColor
          : "var(--bg-border)";
      const teamAbbr = isAway ? awayAbbr : isHome ? homeAbbr : null;
      const teamLogo = isAway ? awayLogo : isHome ? homeLogo : null;

      const scoreBefore = { away: scored.away, home: scored.home };
      if (play?.awayScore != null && play?.homeScore != null) {
        scored.away = Number(play.awayScore) || 0;
        scored.home = Number(play.homeScore) || 0;
      } else if (isScoring && isAway) {
        scored.away += Number(scoreValue) || 2;
      } else if (isScoring && isHome) {
        scored.home += Number(scoreValue) || 2;
      }

      let scoringSide = null;
      if (isScoring) {
        if (scored.away > scoreBefore.away) scoringSide = "away";
        else if (scored.home > scoreBefore.home) scoringSide = "home";
        else if (isAway) scoringSide = "away";
        else if (isHome) scoringSide = "home";
      }

      const xNum = Number(coordX);
      const yNum = Number(coordY);
      const hasCoords =
        Number.isFinite(xNum) &&
        Number.isFinite(yNum) &&
        Math.abs(xNum) < 1000 &&
        Math.abs(yNum) < 1000;

      return {
        key: `${idx}-${typeKey}-${periodNumber}`,
        typeKey,
        typeLabel: String(typeKey).toUpperCase(),
        text,
        period: periodNumber,
        periodLabel,
        clock,
        isScoring,
        scoreValue,
        scoreAt: { away: scored.away, home: scored.home },
        scoringSide,
        teamColor,
        teamAbbr,
        teamLogo,
        playTeamId,
        isAway,
        isHome,
        hasCoords,
        coordX: hasCoords ? xNum : null,
        coordY: hasCoords ? yNum : null,
        scorerId,
        scorerBox,
        scorerName: scorerBox?.name || "",
        scorerHeadshot: scorerBox?.headshot || "",
        scorerPosition: scorerBox?.position || "",
        scorerPoints: nbaBoxPoints(scorerBox),
        scorerGoalsInGame:
          isScoring && scorerId ? scorerCounts[scorerId] || 1 : 0,
      };
    });

    return rows.reverse();
  }

  function nbaCourtSvg({ x, y, teamSide, teamColor, isScoring }) {
    const c = String(teamColor || FALLBACK_COLOR);
    const W = 320;
    const H = 188;
    const padL = 22;
    const padT = 14;
    const iw = 276;
    const ih = 160;
    const isHome = teamSide === "home";
    const xNorm = isHome ? Number(x) : 50 - Number(x);
    const yNorm = isHome ? Number(y) : 47 - Number(y);
    const sx = padL + Math.max(0, Math.min(50, xNorm)) / 50 * iw;
    const sy = padT + Math.max(0, Math.min(47, yNorm)) / 47 * ih;

    let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="sb-court-svg">`;
    s += `<rect x="${padL}" y="${padT}" width="${iw}" height="${ih}" fill="#F2E3CF" stroke="${c}" stroke-width="2.5" rx="4"/>`;
    s += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + ih}" stroke="${c}" stroke-width="2"/>`;
    const halfX = padL + iw;
    s += `<line x1="${halfX}" y1="${padT}" x2="${halfX}" y2="${padT + ih}" stroke="${c}" stroke-width="2"/>`;
    const hoopX = padL + 0.055 * iw;
    const midY = padT + ih / 2;
    s += `<line x1="${padL + 0.02 * iw}" y1="${midY - 3}" x2="${padL + 0.02 * iw}" y2="${midY + 3}" stroke="${c}" stroke-width="2.5"/>`;
    s += `<circle cx="${hoopX}" cy="${midY}" r="4" fill="none" stroke="${c}" stroke-width="2"/>`;
    const keyW = (16 / 50) * iw;
    const keyH = (16 / 47) * ih;
    s += `<rect x="${padL}" y="${midY - keyH / 2}" width="${keyW}" height="${keyH}" fill="none" stroke="${c}" stroke-width="1.6"/>`;
    s += `<circle cx="${padL + keyW}" cy="${midY}" r="${keyH / 2}" fill="none" stroke="${c}" stroke-width="1.6"/>`;
    s += `<circle cx="${sx}" cy="${sy}" r="7" fill="${isScoring ? c : "#fff"}" stroke="${isScoring ? "#fff" : c}" stroke-width="2"/>`;
    s += `</svg>`;
    return s;
  }

  function renderPlaysPanel(body, side) {
    const prepared = prepareNbaPlays();
    if (!prepared.length) {
      setPanelHtml(body, '<div class="sb-empty">No plays available</div>');
      return;
    }
    const state =
      playsState[side] || (playsState[side] = { type: "ALL", period: null });

    const filterTypes = (() => {
      const unique = new Set(prepared.map((r) => r.typeLabel));
      const ordered = ["ALL"];
      [
        "SCORING",
        "FOUL",
        "TURNOVER",
        "REBOUND",
        "BLOCK",
        "STEAL",
        "FREE THROW",
        "MISS",
        "TIMEOUT",
        "SUBSTITUTION",
        "VIOLATION",
        "PLAY",
      ].forEach((t) => {
        if (unique.has(t)) ordered.push(t);
      });
      unique.forEach((t) => {
        if (!ordered.includes(t)) ordered.push(t);
      });
      return ordered;
    })();
    if (!filterTypes.includes(state.type)) state.type = "ALL";

    const order = ["Q1", "Q2", "Q3", "Q4", "OT"];
    const periodOptions = [
      ...new Set(prepared.map((r) => r.periodLabel).filter(Boolean)),
    ].sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai >= 0 ? ai : 99) - (bi >= 0 ? bi : 99);
    });
    if (
      !periodOptions.length ||
      state.period == null ||
      !periodOptions.includes(state.period)
    ) {
      state.period = periodOptions[periodOptions.length - 1] || null;
    }
    const selectedPeriod = state.period;

    const visibleRows = prepared
      .filter((r) => state.type === "ALL" || r.typeLabel === state.type)
      .filter((r) => !selectedPeriod || r.periodLabel === selectedPeriod);

    const typeChips = filterTypes
      .map(
        (t) =>
          `<button class="sb-plays-chip${t === state.type ? " active" : ""}" data-type="${esc(t)}">${esc(t)}</button>`,
      )
      .join("");

    const cards = visibleRows.length
      ? visibleRows
          .map((row) => {
            const headerColor = row.isScoring
              ? "#FFFFFF"
              : "var(--text-primary)";
            const bodyColor = row.isScoring
              ? "rgba(255,255,255,0.92)"
              : "var(--text-secondary)";
            const awayBold = row.isScoring && row.scoringSide === "away";
            const homeBold = row.isScoring && row.scoringSide === "home";

            const scorerAvatar =
              row.isScoring && row.scorerId
                ? `<div class="sb-play-goal-avatar" data-player='${esc(JSON.stringify({ id: row.scorerId, name: row.scorerName, jersey: row.scorerBox?.jersey || "", position: row.scorerPosition, headshot: row.scorerHeadshot, labels: row.scorerBox?.labels || [], stats: row.scorerBox?.stats || [], teamAbbrev: row.teamAbbr || "" }))}' style="border-color:${row.teamColor};background:${withAlpha66(row.teamColor)}">
                     ${row.scorerHeadshot ? `<img src="${esc(row.scorerHeadshot)}" alt="" onerror="this.style.display='none'">` : `<span>${esc(String(row.scorerName || "P").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase())}</span>`}
                     ${row.teamLogo ? `<span class="sb-play-goal-team" style="border-color:${row.teamColor};background:${withAlpha66(row.teamColor)}"><img src="${esc(row.teamLogo)}" alt="" onerror="this.style.display='none'"></span>` : ""}
                     ${row.scorerPosition ? `<span class="sb-play-goal-pos" style="border-color:${row.teamColor}">${esc(row.scorerPosition)}</span>` : ""}
                     <span class="sb-play-goal-count">🏀 ${esc(row.scorerPoints || row.scorerGoalsInGame || "")}</span>
                   </div>`
                : "";

            return `
              <div class="sb-play-row">
                <div class="sb-play-time-col">
                  <div class="sb-play-minute">${esc(row.clock)}</div>
                  <div class="sb-play-period">${esc(row.periodLabel)}</div>
                </div>
                <div class="sb-play-card${row.isScoring ? " goal" : ""}${row.hasCoords ? " expandable" : ""}" data-key="${esc(row.key)}" data-coords='${row.hasCoords ? esc(JSON.stringify({ x: row.coordX, y: row.coordY, side: row.isAway ? "away" : "home", color: row.teamColor })) : ""}'
                     style="border-color:${row.teamColor};background:${row.isScoring ? withAlpha66(row.teamColor) : "var(--bg-surface)"}">
                  <div class="sb-play-card-head">
                    <span style="color:${headerColor}">${esc(row.typeLabel)}</span>
                    <span style="color:${headerColor}"><span style="font-weight:${awayBold ? "800" : "500"}">${esc(row.scoreAt.away)}</span> - <span style="font-weight:${homeBold ? "800" : "500"}">${esc(row.scoreAt.home)}</span></span>
                  </div>
                  ${row.text ? `<div class="sb-play-card-main" style="color:${bodyColor}">${esc(row.text)}</div>` : ""}
                  ${row.isScoring && row.scorerName ? `<div class="sb-play-goal-row">${scorerAvatar}<div class="sb-play-goal-text"><div class="sb-play-goal-name" style="color:${bodyColor}">${esc(row.scorerName)}</div></div></div>` : ""}
                </div>
              </div>`;
          })
          .join("")
      : '<div class="sb-empty">No plays for this filter</div>';

    const pager =
      periodOptions.length > 1
        ? `<div class="sb-plays-pager">
             <button class="sb-plays-pager-btn" data-pager="next"${periodOptions.indexOf(selectedPeriod) >= periodOptions.length - 1 ? " disabled" : ""}>Next</button>
             <span class="sb-plays-pager-label">${esc(selectedPeriod || "?")}</span>
             <button class="sb-plays-pager-btn" data-pager="prev"${periodOptions.indexOf(selectedPeriod) <= 0 ? " disabled" : ""}>Previous</button>
           </div>`
        : "";

    const html = `
      <div class="sb-plays-wrap">
        <div class="sb-plays-filters">${typeChips}</div>
        <div class="sb-plays-cards">${cards}</div>
        ${pager}
      </div>`;

    if (!setPanelHtml(body, html)) return;

    body.querySelectorAll(".sb-plays-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.type = chip.dataset.type;
        renderPlaysPanel(body, side);
      });
    });
    body.querySelectorAll(".sb-plays-pager-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = periodOptions.indexOf(state.period);
        if (btn.dataset.pager === "next")
          state.period =
            periodOptions[Math.min(periodOptions.length - 1, idx + 1)];
        else state.period = periodOptions[Math.max(0, idx - 1)];
        renderPlaysPanel(body, side);
      });
    });
    body.querySelectorAll(".sb-play-card.expandable").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("[data-player]")) return;
        const existing = card.querySelector(".sb-play-court");
        if (existing) {
          existing.remove();
          return;
        }
        let info = null;
        try {
          info = JSON.parse(card.dataset.coords || "null");
        } catch (err) {
          /* ignore */
        }
        if (!info) return;
        const wrap = document.createElement("div");
        wrap.className = "sb-play-court";
        wrap.style.borderColor = info.color;
        wrap.innerHTML = nbaCourtSvg({
          x: info.x,
          y: info.y,
          teamSide: info.side,
          teamColor: info.color,
          isScoring: false,
        });
        card.appendChild(wrap);
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
  // SERIES PANEL — summary + season-series match cards (app parity)
  // ═══════════════════════════════════════════════════════════════════════════
  function renderSeriesPanel(body) {
    const comp = getCompetition();
    const { home, away } = getTeams();
    const pair = getMatchColors();
    const homeTeamId = String(home?.team?.id || "");
    const awayTeamId = String(away?.team?.id || "");

    const rawEvents = [];
    const ss = gameData?.seasonseries;
    if (Array.isArray(ss)) {
      ss.forEach((s) => {
        (s?.events || []).forEach((e) => {
          if (e) rawEvents.push(e);
        });
      });
    }
    const series = gameData?.seriesSummary || comp?.series;
    if (!rawEvents.length && !series) {
      setPanelHtml(body, '<div class="sb-empty">No series data</div>');
      return;
    }

    const filtered = rawEvents
      .filter((e) => {
        const eh = String(
          e?.competitors?.find((c) => c.homeAway === "home")?.team?.id || "",
        );
        const ea = String(
          e?.competitors?.find((c) => c.homeAway === "away")?.team?.id || "",
        );
        return (
          [eh, ea].includes(homeTeamId) && [eh, ea].includes(awayTeamId)
        );
      })
      .sort((a, b) => {
        const at = new Date(a?.date || 0).getTime();
        const bt = new Date(b?.date || 0).getTime();
        return (Number.isNaN(bt) ? 0 : bt) - (Number.isNaN(at) ? 0 : at);
      });

    let homeWins = 0;
    let awayWins = 0;
    filtered.forEach((e) => {
      const hc = e?.competitors?.find((c) => c.homeAway === "home");
      const ac = e?.competitors?.find((c) => c.homeAway === "away");
      const hs = Number(hc?.score);
      const as = Number(ac?.score);
      if (!Number.isFinite(hs) || !Number.isFinite(as) || hs === as) return;
      const winner = String(hs > as ? hc?.team?.id : ac?.team?.id);
      if (winner === homeTeamId) homeWins++;
      else if (winner === awayTeamId) awayWins++;
    });
    if (!filtered.length && series) {
      homeWins = Number(series.homeWins ?? 0);
      awayWins = Number(series.awayWins ?? 0);
    }

    const summary = `
      <div class="sb-series-card">
        <div class="sb-series-header"><span class="sb-series-title">${esc(series?.title || "SEASON SERIES")}</span></div>
        <div class="sb-series-body">
          <div class="sb-series-side">
            <img src="${esc(getTeamLogoUrl(away?.team))}" alt="" onerror="this.style.display='none'">
            <span class="sb-series-wins">${esc(awayWins)}</span>
          </div>
          <div class="sb-series-vs">VS</div>
          <div class="sb-series-side sb-series-side-right">
            <span class="sb-series-wins">${esc(homeWins)}</span>
            <img src="${esc(getTeamLogoUrl(home?.team))}" alt="" onerror="this.style.display='none'">
          </div>
        </div>
        <div class="sb-series-footer">
          <div style="flex:${awayWins || 1};background:${pair.awayColor}"></div>
          <div style="flex:${homeWins || 1};background:${pair.homeColor}"></div>
        </div>
      </div>`;

    const matchCards = filtered.length
      ? filtered
          .map((e) => {
            const left =
              e.competitors?.find((c) => c.homeAway === "away") || {};
            const right =
              e.competitors?.find((c) => c.homeAway === "home") || {};
            const leftAbbr = String(
              left?.team?.abbreviation || "AWY",
            ).toUpperCase();
            const rightAbbr = String(
              right?.team?.abbreviation || "HME",
            ).toUpperCase();
            const leftName =
              left?.team?.shortDisplayName ||
              left?.team?.displayName ||
              leftAbbr;
            const rightName =
              right?.team?.shortDisplayName ||
              right?.team?.displayName ||
              rightAbbr;
            const isLeftCurrentAway = String(left?.team?.id) === awayTeamId;
            const leftColor = isLeftCurrentAway
              ? pair.awayColor
              : pair.homeColor;
            const rightColor = isLeftCurrentAway
              ? pair.homeColor
              : pair.awayColor;
            const leftLogo =
              left?.team?.logos?.[0]?.href ||
              `https://a.espncdn.com/i/teamlogos/${LOGO_PATH}/500/${leftAbbr.toLowerCase()}.png`;
            const rightLogo =
              right?.team?.logos?.[0]?.href ||
              `https://a.espncdn.com/i/teamlogos/${LOGO_PATH}/500/${rightAbbr.toLowerCase()}.png`;
            const completed = e?.statusType?.completed === true;
            const hasScore =
              completed && left?.score != null && right?.score != null;
            const lScore = Number(left?.score);
            const rScore = Number(right?.score);
            const leftWon = hasScore && lScore > rScore;
            const rightWon = hasScore && rScore > lScore;
            const live = e?.status === "in" || e?.status === "live";
            const d = new Date(e?.date || 0);
            const valid = !Number.isNaN(d.getTime());
            const dateStr = valid
              ? d.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              : "";
            const timeStr = valid
              ? d
                  .toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })
                  .replace(/\s?(AM|PM)/i, "")
              : "--:--";
            const ampm = valid ? (d.getHours() >= 12 ? "PM" : "AM") : "";
            return `
              <a class="sb-series-match" href="scoreboard.html?id=${esc(e?.id)}">
                <div class="sb-series-match-top">${esc(dateStr)} · ${esc(LOGO_PATH.toUpperCase())}</div>
                <div class="sb-series-match-body" style="background:linear-gradient(90deg,${withAlpha30(leftColor)},transparent 35%,transparent 65%,${withAlpha30(rightColor)})">
                  <div class="sb-series-match-side">
                    <img src="${esc(leftLogo)}" alt="" style="opacity:${!hasScore ? 1 : leftWon ? 1 : 0.55}" onerror="this.style.display='none'">
                    <span class="sb-series-match-name" style="opacity:${!hasScore ? 1 : leftWon ? 1 : 0.55};font-weight:${leftWon ? "700" : "500"}">${esc(leftName)}</span>
                  </div>
                  <div class="sb-series-match-score">
                    ${
                      hasScore
                        ? `<span style="color:${live ? "var(--accent-error, #e03131)" : leftWon ? "var(--text-primary)" : "var(--text-secondary)"};font-weight:${leftWon ? "800" : "500"}">${esc(lScore)}</span><span class="sb-series-dash">-</span><span style="color:${live ? "var(--accent-error, #e03131)" : rightWon ? "var(--text-primary)" : "var(--text-secondary)"};font-weight:${rightWon ? "800" : "500"}">${esc(rScore)}</span>`
                        : `<span class="sb-series-time">${esc(timeStr)}</span><span class="sb-series-ampm">${esc(ampm)}</span>`
                    }
                  </div>
                  <div class="sb-series-match-side sb-series-match-side-right">
                    <span class="sb-series-match-name" style="opacity:${!hasScore ? 1 : rightWon ? 1 : 0.55};font-weight:${rightWon ? "700" : "500"}">${esc(rightName)}</span>
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
  // PLAYER MODAL
  // ═══════════════════════════════════════════════════════════════════════════
  function openPlayerModal(player) {
    if (!player) return;
    const abbr = player.teamAbbrev || "";
    const color = getTeamColor(abbr) || FALLBACK_COLOR;
    const number = player.jersey ? `#${player.jersey}` : "";
    const position = String(player.position || "").trim();
    const headshot = player.headshot || headshotUrl(player.id);
    const map = statLookup(player.labels, player.stats);
    const statItems = Object.keys(map)
      .filter((k) => k && map[k] != null && map[k] !== "")
      .map((k) => ({ label: k, value: String(map[k]) }));

    const initials =
      String(player.name || "")
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
        <div class="sb-pm-name">${esc(player.name || "Unknown")}</div>
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
  // STREAMING — StreamFree via /assets/stream-service.js
  // ═══════════════════════════════════════════════════════════════════════════
  const STREAM_SPORT = "wnba";

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
      LiveTrackerViewer.startPollingAndRecord(SPORT, gameId);

    const authContainer = document.getElementById("auth-button-container");
    if (authContainer && typeof createAuthButton === "function")
      authContainer.appendChild(createAuthButton());

    if (typeof Auth !== "undefined" && Auth.onChange) {
      Auth.onChange(function () {
        renderHeader();
      });
    }
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();

  window.addEventListener("beforeunload", function () {
    if (pollTimer) clearTimeout(pollTimer);
    if (typeof LiveTrackerViewer !== "undefined") LiveTrackerViewer.stopAll();
  });
})();

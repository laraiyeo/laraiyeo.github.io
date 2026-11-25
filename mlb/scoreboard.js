// ─── MLB Scoreboard ───────────────────────────────────────────────────────────
// Split view: each panel has its own 5-tab bar (Main/Away/Home/Plays/Series)
// Same tab cannot be open on both sides simultaneously

(function () {
  "use strict";

  const MLB_API = "https://sportsheart-baseball.up.railway.app";
  const POLL_LIVE_MS = 5000;
  const POLL_IDLE_MS = 30000;

  let gamePk = null,
    gameData = null,
    liveData = null,
    pitchesData = null,
    pollTimer = null;
  // Track which tab each panel is on
  let leftTab = "Main",
    rightTab = "Away";

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
  // identical markup reloads every headshot/logo and shows up as a flicker, so
  // skip the DOM write when the generated markup is unchanged.
  const lastPanelHtml = new WeakMap();
  function setPanelHtml(el, html) {
    if (!el) return false;
    if (lastPanelHtml.get(el) === html) return false;
    lastPanelHtml.set(el, html);
    el.innerHTML = html;
    return true;
  }

  // ─── Team colors & abbr map (same as aio.js) ────────────────────────────────
  const teamColors = {
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
  const teamAbbrMap = {
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

  function getTeamColor(team) {
    if (!team) return "#1a1a2e";
    if (typeof team === "string") return teamColors[team] || "#1a1a2e";
    return teamColors[team.name] || teamColors[team.teamName] || "#1a1a2e";
  }
  function getTeamLogo(team) {
    if (!team) return "";
    const name =
      typeof team === "string" ? team : team.name || team.teamName || "";
    const abbr = teamAbbrMap[name];
    if (!abbr) return "";
    return (
      "https://a.espncdn.com/combiner/i?img=/i/teamlogos/mlb/500-dark/" +
      abbr +
      ".png"
    );
  }
  function getTeamAbbr(team) {
    if (!team) return "";
    if (team.abbreviation) return team.abbreviation.toUpperCase();
    const name =
      typeof team === "string" ? team : team.name || team.teamName || "";
    const abbr = teamAbbrMap[name];
    return abbr
      ? abbr.toUpperCase()
      : (name || "???").slice(0, 3).toUpperCase();
  }

  // ─── Init ───────────────────────────────────────────────────────────────────
  function init() {
    const params = new URLSearchParams(window.location.search);
    gamePk = params.get("gamePk") || params.get("id");
    if (!gamePk) {
      sbHeader.innerHTML =
        '<div class="sb-error">No game specified. <a href="aio">Back to games</a></div>';
      return;
    }
    fetchGameData();
    setupScrollListener();
    setupModalListeners();
    setupStreamListeners();
    setupSplitViewListeners();
    // Record view + subscribe to count (matches app's useGamePresence)
    if (typeof LiveTrackerViewer !== "undefined")
      LiveTrackerViewer.startPollingAndRecord("mlb", gamePk);
    // Auth button
    var authContainer = document.getElementById("auth-button-container");
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

  // ── Split View: collapse panels to single tab ───────────────────────────
  var splitViewActive = false;
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
      // Collapse to single panel: hide right panel, left panel shows all tabs
      var rightPanel = document.getElementById("sbRightPanel");
      if (rightPanel) rightPanel.style.display = "none";
      // Re-render left tabs with all options (no mutual exclusion)
      renderTabBars();
      renderPanel("left");
      var leftPanel = document.getElementById("sh-left-panel");
      if (leftPanel && !leftPanel.dataset.sbScrollBound) {
        leftPanel.dataset.sbScrollBound = "1";
        leftPanel.addEventListener("scroll", onSbScroll, { passive: true });
      }
    });
    window.addEventListener("sh-split-deactivated", function () {
      splitViewActive = false;
      var rightPanel = document.getElementById("sbRightPanel");
      if (rightPanel) rightPanel.style.display = "";
      renderTabBars();
      renderPanel("left");
      renderPanel("right");
    });
    // Check initial state
    if (document.getElementById("sh-split-wrapper")) {
      splitViewActive = true;
      var rp = document.getElementById("sbRightPanel");
      if (rp) rp.style.display = "none";
    }
    // Inside the 2nd screen iframe: collapse to a single panel too
    if (isInIframe()) {
      splitViewActive = true;
      var rp2 = document.getElementById("sbRightPanel");
      if (rp2) rp2.style.display = "none";
    }
  }

  function onSbScroll() {
    var rect = sbHeader.getBoundingClientRect();
    if (rect.bottom < 0) {
      if (sbStickyHeader.style.display !== "flex") {
        sbStickyHeader.style.display = "flex";
        renderStickyHeader();
      }
    } else {
      if (sbStickyHeader.style.display !== "none") {
        sbStickyHeader.style.display = "none";
      }
    }
  }

  function setupScrollListener() {
    window.addEventListener("scroll", onSbScroll, { passive: true });
    // In split view the left panel is the scroll container, not the window.
    var leftPanel = document.getElementById("sh-left-panel");
    if (leftPanel)
      leftPanel.addEventListener("scroll", onSbScroll, { passive: true });
  }

  function setupModalListeners() {
    $("#sbPlayerModalClose").addEventListener(
      "click",
      () => ($("#sbPlayerModal").style.display = "none"),
    );
    $("#sbPlayModalClose").addEventListener(
      "click",
      () => ($("#sbPlayModal").style.display = "none"),
    );
    $("#sbPlayerModal").addEventListener("click", (e) => {
      if (e.target === $("#sbPlayerModal"))
        $("#sbPlayerModal").style.display = "none";
    });
    $("#sbPlayModal").addEventListener("click", (e) => {
      if (e.target === $("#sbPlayModal"))
        $("#sbPlayModal").style.display = "none";
    });
  }

  // ─── Streaming ──────────────────────────────────────────────────────────────
  function setupStreamListeners() {
    // The Stream button lives inside the header, which is re-rendered on every
    // poll, so use event delegation on the header container.
    sbHeader.addEventListener("click", (e) => {
      if (e.target && e.target.id === "sbStreamOpen") openStreamModal();
    });
    $("#sbStreamClose").addEventListener("click", closeStreamModal);
    $("#sbStreamModal").addEventListener("click", (e) => {
      if (e.target === $("#sbStreamModal")) closeStreamModal();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STREAMING — StreamFree (streamfree.top) via /assets/stream-service.js
  // ═══════════════════════════════════════════════════════════════════════════
  const STREAM_SPORT = "mlb";

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
    if (keys.length === 0) {
      container.innerHTML =
        '<span class="sb-stream-no-streams">No live streams found for this game</span>';
      return;
    }
    container.innerHTML = keys
      .map((key) => {
        const entry = availableStreams[key] || {};
        const label = entry.label || key;
        const quality = entry.quality ? ` · ${entry.quality}` : "";
        return `<button class="sb-stream-btn${currentStreamType === key ? " active" : ""}" data-stream="${key}">${label}${quality}</button>`;
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
    // Cache-bust so switching streams always reloads a clean session.
    frame.src =
      url + (url.includes("?") ? "&" : "?") + "_nocache=" + Date.now();
    frame.onload = () => {
      if (loading) loading.hidden = true;
      frame.style.display = "block";
    };
  }

  async function openStreamModal() {
    const away = gameData?.teams?.away?.team || gameData?.teams?.away || {};
    const home = gameData?.teams?.home?.team || gameData?.teams?.home || {};
    if (!away?.name || !home?.name) return;

    streamModalVisible = true;
    // Pause background polling while streaming.
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    $("#sbStreamModal").style.display = "flex";
    $("#sbStreamButtons").innerHTML =
      '<span class="sb-stream-no-streams">Finding streams…</span>';
    $("#sbStreamFrame").style.display = "none";
    $("#sbStreamLoading").hidden = false;

    const { sources } = await findMatchStreams(home.name, away.name);
    availableStreams = sources || {};

    const streamKeys = Object.keys(availableStreams);
    if (streamKeys.length > 0) {
      currentStreamType = streamKeys[0];
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
    // Resume background polling.
    schedulePoll();
  }

  // ─── Data ───────────────────────────────────────────────────────────────────
  async function fetchGameData() {
    try {
      const url = `${MLB_API}/wbc/gameFeed/${gamePk}?_=${Date.now()}`;
      const res = await fetch(url, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      gameData = json.data.gameData;
      liveData = json.data.liveData;
      pitchesData = json.data.pitches || null;
      renderAll();
      schedulePoll();
    } catch (err) {
      console.error(err);
      sbHeader.innerHTML =
        '<div class="sb-error">Failed to load game data. <button onclick="location.reload()">Retry</button></div>';
    }
  }
  function schedulePoll() {
    clearTimeout(pollTimer);
    // Pause background fetching while the stream modal is open (matches app).
    if (streamModalVisible) return;
    pollTimer = setTimeout(
      function () {
        fetchGameDataQuiet();
      },
      isGameLive() ? POLL_LIVE_MS : POLL_IDLE_MS,
    );
  }
  async function fetchGameDataQuiet() {
    try {
      const url = `${MLB_API}/wbc/gameFeed/${gamePk}?_=${Date.now()}`;
      const res = await fetch(url, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      gameData = json.data.gameData;
      liveData = json.data.liveData;
      pitchesData = json.data.pitches || null;
      renderAllQuiet();
      schedulePoll();
    } catch (err) {
      console.error(err);
      schedulePoll();
    }
  }
  function isGameFinished() {
    const c =
      gameData?.status?.codedGameState || gameData?.status?.statusCode || "";
    return ["F", "O", "FT", "D", "C", "Q", "R", "FM", "DI"].includes(String(c));
  }
  function isGameScheduled() {
    const c =
      gameData?.status?.codedGameState || gameData?.status?.statusCode || "";
    return ["S", "P"].includes(String(c));
  }
  function isGameLive() {
    return !isGameFinished() && !isGameScheduled();
  }

  function renderAll() {
    renderHeader();
    renderTabBars();
    renderPanel("left");
    renderPanel("right");
  }

  // ── Non-flickering update: re-render header + panels, not tabs ──
  function renderAllQuiet() {
    renderHeader();
    renderPanel("left");
    renderPanel("right");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER — mirrors app's TeamColumn + StatusBadge + venue
  // ═══════════════════════════════════════════════════════════════════════════
  function renderHeader() {
    const away = gameData?.teams?.away?.team || gameData?.teams?.away || {};
    const home = gameData?.teams?.home?.team || gameData?.teams?.home || {};
    const awayScore = liveData?.linescore?.teams?.away?.runs;
    const homeScore = liveData?.linescore?.teams?.home?.runs;
    const awayColor = getTeamColor(away),
      homeColor = getTeamColor(home);
    const live = isGameLive(),
      finished = isGameFinished();
    const showScores =
      (live || finished) && awayScore != null && homeScore != null;
    const awayLogo = getTeamLogo(away),
      homeLogo = getTeamLogo(home);
    const awayAbbr = getTeamAbbr(away),
      homeAbbr = getTeamAbbr(home);
    const venueName = gameData?.venue?.name || "";
    const linescore = liveData?.linescore || {};
    const inning = linescore?.currentInning,
      isTop = linescore?.isTopInning !== false;

    const challenges = gameData?.absChallenges?.hasChallenges
      ? gameData?.absChallenges
      : {};
    const awayFailed = Math.min(Number(challenges?.away?.usedFailed) || 0, 2);
    const homeFailed = Math.min(Number(challenges?.home?.usedFailed) || 0, 2);

    let statusTop = "",
      statusBottom = "";
    if (live && inning) {
      statusTop = `${isTop ? "Top" : "Bot"} ${ordinal(inning)}`;
      const b = linescore?.balls,
        s = linescore?.strikes,
        o = linescore?.outs;
      if (b != null && s != null && o != null)
        statusBottom = `${b}-${s}, ${o} out${o === 1 ? "" : "s"}`;
    } else if (finished) {
      statusTop = `Final${inning && inning !== 9 ? `/${inning}` : ""}`;
      statusBottom =
        fmtGameTime(
          gameData?.datetime?.dateTime ||
            gameData?.gameData?.datetime?.dateTime,
        ) || "";
    } else {
      statusTop = "Scheduled";
      statusBottom =
        fmtGameTime(
          gameData?.datetime?.dateTime ||
            gameData?.gameData?.datetime?.dateTime,
        ) || "";
    }

    const teamCol = (
      team,
      score,
      isWinner,
      side,
      color,
      logo,
      abbr,
      failedCount,
      challenges,
    ) => {
      const scoreOnLeft = side === "home",
        scoreOnRight = side === "away";
      const logoEl = logo
        ? `<img src="${logo}" class="sb-team-logo" alt="${team.name || ""}" onerror="this.parentElement.innerHTML='<div class=\\'sb-team-logo-fallback\\' style=\\'background:${color}\\'>${abbr[0]}</div>'">`
        : `<div class="sb-team-logo-fallback" style="background:${color}">${abbr[0]}</div>`;
      const scoreEl = showScores
        ? `<span class="sb-team-score" style="color:${live ? "var(--text-primary)" : isWinner ? "var(--text-primary)" : "var(--text-secondary)"};font-weight:${live || isWinner ? "800" : "400"}">${score}</span>`
        : "";
      const logoScoreRow = `<div class="sb-logo-score-row">${scoreOnLeft ? scoreEl : ""}<div class="sb-team-logo-wrap">${logoEl}</div>${scoreOnRight ? scoreEl : ""}</div>`;
      const nameEl = `<div class="sb-team-name" style="opacity:${finished && !isWinner ? "0.55" : "1"}">${team.name || (side === "away" ? "Away" : "Home")}</div>`;
      const challengeDots = challenges?.hasChallenges
        ? `<div class="sb-challenge-row">${[0, 1]
            .map((i) => {
              const isFailed =
                side === "away" ? failedCount >= 2 - i : failedCount >= i + 1;
              return `<span class="sb-challenge-dot" style="border-color:${color};background:${isFailed ? "#ffffff3b" : "#fff"}"></span>`;
            })
            .join("")}</div>`
        : "";
      return `<div class="sb-team-col">${logoScoreRow}${nameEl}${challengeDots}</div>`;
    };

    setPanelHtml(
      sbHeader,
      `
      <div class="sb-header-inner">
        <div class="sb-header-gradient" style="background:linear-gradient(90deg,${awayColor}33 0%,transparent 40%,transparent 60%,${homeColor}33 100%)"></div>
        ${venueName ? `<div class="sb-venue">${venueName}<span id="sbLiveBadge" style="margin-left:8px;vertical-align:middle"></span></div>` : ""}
        <div class="sb-teams-row">
          ${teamCol(away, awayScore, showScores && awayScore > homeScore, "away", awayColor, awayLogo, awayAbbr, awayFailed, challenges)}
          <div class="sb-status-center">
            <div class="sb-status-top" style="color:${live ? "var(--accent-success)" : "var(--text-secondary)"}">${statusTop}</div>
            ${statusBottom ? `<div class="sb-status-bottom">${statusBottom}</div>` : ""}
            ${live && typeof Auth !== "undefined" && Auth.isLoggedIn ? `<button class="sb-stream-btn" id="sbStreamOpen" style="margin-top:10px">▶ Stream</button>` : ""}
          </div>
          ${teamCol(home, homeScore, showScores && homeScore > awayScore, "home", homeColor, homeLogo, homeAbbr, homeFailed, challenges)}
        </div>
      </div>`,
    );
  }

  function renderStickyHeader() {
    const away = gameData?.teams?.away?.team || gameData?.teams?.away || {};
    const home = gameData?.teams?.home?.team || gameData?.teams?.home || {};
    const awayScore = liveData?.linescore?.teams?.away?.runs;
    const homeScore = liveData?.linescore?.teams?.home?.runs;
    const awayColor = getTeamColor(away),
      homeColor = getTeamColor(home);
    const live = isGameLive(),
      finished = isGameFinished();
    const showScores =
      (live || finished) && awayScore != null && homeScore != null;
    const awayLogo = getTeamLogo(away),
      homeLogo = getTeamLogo(home);
    const awayAbbr = getTeamAbbr(away),
      homeAbbr = getTeamAbbr(home);
    const linescore = liveData?.linescore || {};
    const inning = linescore?.currentInning,
      isTop = linescore?.isTopInning !== false;
    const b = linescore?.balls,
      s = linescore?.strikes,
      o = linescore?.outs;
    var statusLine, statusSub;
    if (live && inning) {
      statusLine = `${isTop ? "Top" : "Bot"} ${ordinal(inning)}`;
      statusSub =
        b != null && s != null && o != null
          ? `${b}-${s}, ${o} out${o === 1 ? "" : "s"}`
          : "";
    } else if (finished) {
      statusLine = `Final${inning && inning !== 9 ? `/${inning}` : ""}`;
      statusSub =
        fmtGameTime(
          gameData?.datetime?.dateTime ||
            gameData?.gameData?.datetime?.dateTime,
        ) || "";
    } else {
      statusLine = "Scheduled";
      statusSub =
        fmtGameTime(
          gameData?.datetime?.dateTime ||
            gameData?.gameData?.datetime?.dateTime,
        ) || "";
    }

    sbStickyHeader.innerHTML = `
      <div class="sb-sticky-inner">
        <div class="sb-sticky-gradient" style="background:linear-gradient(90deg,${awayColor}33,transparent 30%,transparent 70%,${homeColor}33)"></div>
        <div class="sb-sticky-side">${awayLogo ? `<img src="${awayLogo}" class="sb-sticky-logo" onerror="this.style.display='none'">` : ""}<span class="sb-sticky-abbr">${awayAbbr}</span>${showScores ? `<span class="sb-sticky-score" style="font-weight:${awayScore > homeScore ? "800" : "400"}">${awayScore}</span>` : ""}</div>
        <div class="sb-sticky-status-block"><div class="sb-sticky-status-line">${statusLine}</div>${statusSub ? `<div class="sb-sticky-status-sub">${statusSub}</div>` : ""}</div>
        <div class="sb-sticky-side sb-sticky-right">${showScores ? `<span class="sb-sticky-score" style="font-weight:${homeScore > awayScore ? "800" : "400"}">${homeScore}</span>` : ""}<span class="sb-sticky-abbr">${homeAbbr}</span>${homeLogo ? `<img src="${homeLogo}" class="sb-sticky-logo" onerror="this.style.display='none'">` : ""}</div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB BARS — each panel gets its own 5-tab bar
  // Same tab cannot be open on both sides
  // ═══════════════════════════════════════════════════════════════════════════
  function renderTabBars() {
    const sched = isGameScheduled();
    const allTabs = sched
      ? ["Main", "Away", "Home", "Series"]
      : ["Main", "Away", "Home", "Plays", "Series"];
    if (splitViewActive) {
      // Single tab bar — all tabs enabled, no mutual exclusion
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
        renderTabBars(); // re-render both to update disabled states
        renderPanel(side);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PANEL RENDERING
  // ═══════════════════════════════════════════════════════════════════════════
  function renderPanel(side) {
    const tab = side === "left" ? leftTab : rightTab;
    const body = side === "left" ? sbLeftBody : sbRightBody;

    switch (tab) {
      case "Main":
        renderMainPanel(body);
        break;
      case "Away":
        renderTeamPanel(body, "away");
        break;
      case "Home":
        renderTeamPanel(body, "home");
        break;
      case "Plays":
        renderPlaysPanel(body, side);
        break;
      case "Series":
        renderSeriesPanel(body);
        break;
    }
  }

  // ─── Main Panel ─────────────────────────────────────────────────────────────
  function renderMainPanel(body) {
    const away = gameData?.teams?.away?.team || gameData?.teams?.away || {};
    const home = gameData?.teams?.home?.team || gameData?.teams?.home || {};
    const awayColor = getTeamColor(away),
      homeColor = getTeamColor(home);
    const awayAbbr = getTeamAbbr(away),
      homeAbbr = getTeamAbbr(home);
    const sched = isGameScheduled(),
      live = isGameLive();

    let html = renderLinescoreBubble(
      away,
      home,
      awayColor,
      homeColor,
      awayAbbr,
      homeAbbr,
    );
    if (sched) html += renderProbablePitchers(awayColor, homeColor);
    // At-bat bubble sits under the linescore and above team stats (live only)
    if (live) html += renderCurrentAtBat(away, home, awayColor, homeColor);
    html += renderLastPlayBubble(
      away,
      home,
      awayColor,
      homeColor,
      awayAbbr,
      homeAbbr,
    );
    html += renderTeamStats(
      away,
      home,
      awayColor,
      homeColor,
      awayAbbr,
      homeAbbr,
      sched,
    );
    if (live)
      html += renderWinProbability(
        away,
        home,
        awayColor,
        homeColor,
        awayAbbr,
        homeAbbr,
      );
    html += renderGameInfoBubble();
    html += renderSeriesSummary(awayColor, homeColor);
    setPanelHtml(body, html);
  }

  // ─── Team Panel (Away/Home) ─────────────────────────────────────────────────
  function renderTeamPanel(body, teamSide) {
    const teamData =
      teamSide === "away"
        ? gameData?.teams?.away?.team || gameData?.teams?.away || {}
        : gameData?.teams?.home?.team || gameData?.teams?.home || {};
    const bsTeams = liveData?.boxscore?.teams || {};
    const bsTeamData = teamSide === "away" ? bsTeams?.away : bsTeams?.home;
    const playersMap = gameData?.players || {};
    const teamColor = getTeamColor(teamData);
    const sched = isGameScheduled(),
      fin = isGameFinished(),
      live = isGameLive();
    if (!bsTeamData) {
      setPanelHtml(body, '<div class="sb-empty">No box score data</div>');
      return;
    }

    const bsPlayers = bsTeamData?.players || {};
    const battingOrder = bsTeamData?.battingOrder || [];
    const allBsPlayers = {
      ...(bsTeams?.away?.players || {}),
      ...(bsTeams?.home?.players || {}),
    };
    const sBatterIds = bsTeamData?.batters || [],
      sPitcherIds = bsTeamData?.pitchers || [],
      sBenchIds = bsTeamData?.bench || [];
    const hasScheduledLineup =
      sched && (sBatterIds.length > 0 || sPitcherIds.length > 0);

    const batterIds = battingOrder.length
      ? battingOrder
      : Object.keys(bsPlayers)
          .map((k) => Number(k.replace("ID", "")))
          .filter(
            (id) =>
              Object.keys(bsPlayers[`ID${id}`]?.stats?.batting || {}).length >
              0,
          );
    let pitcherIds = Object.keys(bsPlayers)
      .map((k) => Number(k.replace("ID", "")))
      .filter(
        (id) =>
          Object.keys(bsPlayers[`ID${id}`]?.stats?.pitching || {}).length > 0,
      );
    const teamPitchers = bsTeamData?.pitchers;
    if (Array.isArray(teamPitchers) && teamPitchers.length > 0) {
      const o = teamPitchers
        .map(Number)
        .filter((id) => pitcherIds.includes(id));
      if (o.length > 0) pitcherIds = o.reverse();
      else pitcherIds = pitcherIds.reverse();
    } else pitcherIds = pitcherIds.reverse();

    const activeSets = new Set([
      ...batterIds.map(Number),
      ...pitcherIds.map(Number),
    ]);
    const rawBenchIds = Object.keys(bsPlayers)
      .map((k) => Number(k.replace("ID", "")))
      .filter((id) => !activeSets.has(id));
    const benchGetAB = (id) =>
      bsPlayers[`ID${id}`]?.stats?.batting?.atBats || 0;
    const benchGetIP = (id) =>
      parseFloat(bsPlayers[`ID${id}`]?.stats?.pitching?.inningsPitched || 0);
    const benchHasBat = (id) => benchGetAB(id) > 0;
    const benchHasPit = (id) =>
      !benchHasBat(id) &&
      Object.keys(bsPlayers[`ID${id}`]?.stats?.pitching || {}).length > 0;
    const benchBatters = rawBenchIds
      .filter(benchHasBat)
      .sort((a, b) => benchGetAB(b) - benchGetAB(a));
    const benchPitchers = rawBenchIds
      .filter(benchHasPit)
      .sort((a, b) => benchGetIP(b) - benchGetIP(a));
    const benchOthers = rawBenchIds.filter(
      (id) => !benchHasBat(id) && !benchHasPit(id),
    );
    const benchIds =
      fin || !sched
        ? [...benchBatters, ...benchPitchers]
        : [...benchBatters, ...benchPitchers, ...benchOthers];

    let html = "";
    if (!sched || hasScheduledLineup) {
      html += `<div class="sb-bs-tabs" data-side="${teamSide}"><button class="sb-bs-tab active" data-section="batting">Batting</button><button class="sb-bs-tab" data-section="pitching">Pitching</button><button class="sb-bs-tab" data-section="bench">Bench</button></div>`;
    }
    html += `<div class="sb-bs-section" id="sbBsSection-${teamSide}"></div>`;
    var renderedTabs = setPanelHtml(body, html);
    var activeSection = "batting";
    if (!renderedTabs) {
      var activeTab = body.querySelector(".sb-bs-tab.active");
      if (activeTab) activeSection = activeTab.dataset.section;
    }

    renderPlayerCards(
      teamSide,
      activeSection,
      batterIds,
      pitcherIds,
      benchIds,
      bsPlayers,
      playersMap,
      allBsPlayers,
      teamColor,
      teamData,
      sched,
      fin,
      live,
      sBatterIds,
      sPitcherIds,
      sBenchIds,
      hasScheduledLineup,
    );

    if (!renderedTabs)
      body.querySelectorAll(".sb-bs-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
          body
            .querySelectorAll(".sb-bs-tab")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          renderPlayerCards(
            teamSide,
            btn.dataset.section,
            batterIds,
            pitcherIds,
            benchIds,
            bsPlayers,
            playersMap,
            allBsPlayers,
            teamColor,
            teamData,
            sched,
            fin,
            live,
            sBatterIds,
            sPitcherIds,
            sBenchIds,
            hasScheduledLineup,
          );
        });
      });
  }

  function renderPlayerCards(
    teamSide,
    section,
    batterIds,
    pitcherIds,
    benchIds,
    bsPlayers,
    playersMap,
    allBsPlayers,
    teamColor,
    teamData,
    sched,
    fin,
    live,
    sBatterIds,
    sPitcherIds,
    sBenchIds,
    hasScheduledLineup,
  ) {
    const container = document.getElementById(`sbBsSection-${teamSide}`);
    if (!container) return;
    let ids;
    if (sched) {
      if (hasScheduledLineup) {
        if (section === "batting") ids = sBatterIds;
        else if (section === "pitching") ids = sPitcherIds;
        else ids = sBenchIds;
      } else ids = sBenchIds.length > 0 ? sBenchIds : benchIds;
    } else
      ids =
        section === "batting"
          ? batterIds
          : section === "pitching"
            ? pitcherIds
            : benchIds;
    const currentId =
      section === "pitching" ? (ids.length ? ids[0] : null) : null;
    if (!ids.length) {
      setPanelHtml(
        container,
        `<div class="sb-empty">No ${section} data available.</div>`,
      );
      return;
    }

    const cardsHtml = ids
      .map((id) => {
        const bsPlayer = bsPlayers[`ID${id}`] || null;
        const playerInfo = resolvePlayer(playersMap, id);
        const pos = bsPlayer?.position?.abbreviation || "";
        const position = bsPlayer?.position?.name || "";
        const isPitcher = pos === "P" || pos === "SP" || pos === "RP";
        const batting = bsPlayer?.stats?.batting || {},
          pitching = bsPlayer?.stats?.pitching || {};
        const fullName = playerInfo?.fullName || `Player ${id}`;
        const number = bsPlayer?.jerseyNumber
          ? `#${bsPlayer.jerseyNumber}`
          : "";
        const isCurrent = live && currentId != null && id === currentId;
        let outLabel = "";
        // Compute OUT label matching app's PlayerCard logic
        if (bsPlayer?.gameStatus?.isSubstitute && (live || fin)) {
          var battersArr = teamData?.batters || [];
          var order = teamData?.battingOrder || [];
          if (battersArr.length > 0) {
            var lastOrderId = order.length ? order[order.length - 1] : null;
            var lastBoundIdx = battersArr.length - 1;
            if (lastOrderId != null) {
              var lidx = battersArr.indexOf(lastOrderId);
              if (lidx !== -1) lastBoundIdx = lidx;
            }
            var myIdx = battersArr.indexOf(id);
            if (myIdx > 0 && myIdx <= lastBoundIdx) {
              var prevId = battersArr[myIdx - 1];
              if (prevId) {
                var myOrderIdx = order.indexOf(id);
                var expectedPrev =
                  myOrderIdx > 0 ? order[myOrderIdx - 1] : null;
                if (myOrderIdx === -1 || expectedPrev !== prevId) {
                  var prevInfo = resolvePlayer(playersMap, prevId);
                  var prevName = prevInfo?.fullName || "";
                  if (prevName) {
                    var parts = prevName.split(" ");
                    var first = parts.shift();
                    var rest = parts.join(" ");
                    outLabel = "OUT " + (first ? first[0] + ". " : "") + rest;
                  } else {
                    outLabel = "OUT " + prevId;
                  }
                }
              }
            }
          }
        }
        const statMode = isPitcher ? "pitching" : "batting";
        const cols =
          statMode === "pitching"
            ? [
                { key: "inningsPitched", label: "IP" },
                { key: "hits", label: "H" },
                { key: "runs", label: "R" },
                { key: "baseOnBalls", label: "BB" },
                { key: "strikeOuts", label: "K" },
                { key: "numberOfPitches", label: "NP" },
              ]
            : [
                { key: "atBats", label: "AB" },
                { key: "hits", label: "H" },
                { key: "runs", label: "R" },
                { key: "rbi", label: "RBI" },
                { key: "homeRuns", label: "HR" },
                { key: "baseOnBalls", label: "BB" },
              ];
        const stats = statMode === "pitching" ? pitching : batting;
        return `<div class="sb-player-card" style="border-color:${teamColor}" data-player-id="${id}" data-side="${teamSide}">
        <div class="sb-pc-top"><img src="${headshotUrl(id)}" class="sb-pc-headshot" loading="lazy" onerror="this.style.display='none'"><div class="sb-pc-info"><div class="sb-pc-name-row"><span class="sb-pc-name">${fullName}</span>${isCurrent ? '<span class="sb-pc-current">CURRENT</span>' : ""}${outLabel && !isCurrent ? `<span class="sb-pc-out">${outLabel}</span>` : ""}</div><div class="sb-pc-meta">${[number, position].filter(Boolean).join(" • ")}</div></div></div>
        <div class="sb-pc-stats">${cols.map(({ key, label }) => `<div class="sb-pc-stat"><div class="sb-pc-stat-val">${stats[key] ?? "—"}</div><div class="sb-pc-stat-lbl">${label}</div></div>`).join("")}</div>
      </div>`;
      })
      .join("");

    if (!setPanelHtml(container, cardsHtml)) return;

    container.querySelectorAll(".sb-player-card").forEach((card) => {
      card.addEventListener("click", () =>
        openPlayerModal(parseInt(card.dataset.playerId), card.dataset.side),
      );
    });
  }

  // ─── Plays Panel ────────────────────────────────────────────────────────────
  function renderPlaysPanel(body, side) {
    const allPlays = liveData?.plays?.allPlays || [];
    const away = gameData?.teams?.away?.team || gameData?.teams?.away || {};
    const home = gameData?.teams?.home?.team || gameData?.teams?.home || {};
    const awayColor = getTeamColor(away),
      homeColor = getTeamColor(home);
    const awayAbbr = getTeamAbbr(away),
      homeAbbr = getTeamAbbr(home);
    const playersMap = gameData?.players || {};
    if (!allPlays.length) {
      setPanelHtml(body, '<div class="sb-empty">No plays available.</div>');
      return;
    }

    const playersInPlays = buildPlayerFilterList(allPlays, playersMap);
    const innings = [
      ...new Set(allPlays.map((p) => p?.about?.inning).filter(Boolean)),
    ].sort((a, b) => b - a);
    const activeInning = innings[0];
    const scoringMap = new Map();
    allPlays.forEach((p) => {
      if (p?.about?.isScoringPlay !== true) return;
      const inn = p?.about?.inning;
      if (inn == null) return;
      const ex = scoringMap.get(inn) || {
        awayScored: false,
        homeScored: false,
      };
      if (p?.about?.isTopInning !== false) ex.awayScored = true;
      else ex.homeScored = true;
      scoringMap.set(inn, ex);
    });

    let html = `<div class="sb-plays-player-filter"><span class="sb-plays-filter-label">Player Filter</span><select class="sb-plays-player-select" id="sbPlaysPlayerFilter-${side}"><option value="">None</option>${playersInPlays.map((p) => `<option value="${p.id}">${p.name}</option>`).join("")}</select></div>`;
    html += '<div class="sb-plays-filter">';
    innings.forEach((inn) => {
      const scoring = scoringMap.get(inn);
      const awayScored = !!scoring?.awayScored,
        homeScored = !!scoring?.homeScored;
      let style = "";
      if (awayScored && homeScored)
        style = `background:linear-gradient(90deg,${awayColor},${homeColor});color:#fff`;
      else if (awayScored) style = `background:${awayColor};color:#fff`;
      else if (homeScored) style = `background:${homeColor};color:#fff`;
      html += `<button class="sb-plays-chip${inn === activeInning ? " active" : ""}" data-inning="${inn}" style="${style}">Inn. ${inn}</button>`;
    });
    html += `</div><div class="sb-plays-list" id="sbPlaysList-${side}"></div>`;
    var renderedChips = setPanelHtml(body, html);

    var activeChip = renderedChips
      ? null
      : body.querySelector(".sb-plays-chip.active");
    var activeInn = activeChip ? parseInt(activeChip.dataset.inning) : null;

    renderPlaysList(
      side,
      allPlays,
      activeInn != null ? activeInn : activeInning,
      away,
      home,
      awayColor,
      homeColor,
      awayAbbr,
      homeAbbr,
      playersMap,
    );

    if (!renderedChips) return;

    body.querySelectorAll(".sb-plays-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        body
          .querySelectorAll(".sb-plays-chip")
          .forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        const pf =
          document.getElementById(`sbPlaysPlayerFilter-${side}`)?.value || "";
        renderPlaysList(
          side,
          allPlays,
          parseInt(chip.dataset.inning),
          away,
          home,
          awayColor,
          homeColor,
          awayAbbr,
          homeAbbr,
          playersMap,
          pf,
        );
      });
    });
    const pfSelect = document.getElementById(`sbPlaysPlayerFilter-${side}`);
    if (pfSelect)
      pfSelect.addEventListener("change", () => {
        const activeChip = body.querySelector(".sb-plays-chip.active");
        renderPlaysList(
          side,
          allPlays,
          activeChip ? parseInt(activeChip.dataset.inning) : activeInning,
          away,
          home,
          awayColor,
          homeColor,
          awayAbbr,
          homeAbbr,
          playersMap,
          pfSelect.value,
        );
      });
  }

  function buildPlayerFilterList(allPlays, playersMap) {
    const ids = new Set();
    allPlays.forEach((p) => {
      const bid = p?.matchup?.batter?.id,
        pid = p?.matchup?.pitcher?.id;
      if (bid) ids.add(bid);
      if (pid) ids.add(pid);
    });
    return [...ids]
      .map((id) => ({
        id,
        name: resolvePlayer(playersMap, id)?.fullName || `Player ${id}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function renderPlaysList(
    side,
    allPlays,
    inning,
    away,
    home,
    awayColor,
    homeColor,
    awayAbbr,
    homeAbbr,
    playersMap,
    playerFilter,
  ) {
    const listEl = document.getElementById(`sbPlaysList-${side}`);
    if (!listEl) return;
    let plays = [...allPlays].filter((p) => p?.about?.inning === inning);
    if (playerFilter) {
      const pfId = parseInt(playerFilter);
      plays = plays.filter(
        (p) =>
          p?.matchup?.batter?.id === pfId || p?.matchup?.pitcher?.id === pfId,
      );
    }
    plays = plays.reverse();
    if (!plays.length) {
      setPanelHtml(
        listEl,
        '<div class="sb-empty">No plays in this inning.</div>',
      );
      return;
    }

    const playsHtml = plays
      .map((play, idx) => {
        const isTop = play?.about?.isTopInning !== false;
        const teamColor = isTop ? awayColor : homeColor,
          teamAbbr = isTop ? awayAbbr : homeAbbr;
        const event = play?.result?.event || "",
          desc = play?.result?.description || "";
        const isScoring = play?.about?.isScoringPlay === true;
        const aScore = play?.result?.awayScore,
          hScore = play?.result?.homeScore;
        const balls = play?.count?.balls || 0,
          strikes = play?.count?.strikes || 0,
          outs = play?.count?.outs;
        const cardBg = isScoring ? teamColor : "var(--bg-surface)";
        const textColor = isScoring ? "#fff" : "var(--text-primary)",
          secColor = isScoring
            ? "rgba(255,255,255,0.8)"
            : "var(--text-secondary)";
        return `<div class="sb-play-card" style="background:${cardBg};border-left:4px solid ${teamColor};${isScoring ? "border-color:" + teamColor : ""}" data-inning="${inning}" data-play-idx="${idx}">
        <div class="sb-play-header"><div class="sb-play-meta"><span class="sb-play-inning" style="color:${textColor}">${isTop ? "▲" : "▼"} ${ordinal(inning)}</span>${teamAbbr ? `<span class="sb-play-team" style="color:${secColor}">${teamAbbr}</span>` : ""}</div><div class="sb-play-right">${isScoring ? `<span class="sb-play-scores" style="color:${textColor}">SCORES</span>` : ""}${outs != null ? `<span class="sb-play-outs" style="color:${secColor}">${outs} out${outs === 1 ? "" : "s"}</span>` : ""}</div></div>
        ${event ? `<div class="sb-play-event" style="color:${textColor}">${event}</div>` : ""}
        ${desc ? `<div class="sb-play-desc" style="color:${secColor}">${desc}</div>` : ""}
        <div class="sb-play-bottom">${aScore != null && hScore != null ? `<div class="sb-play-score-block"><div class="sb-play-score-row"><span style="color:${isScoring ? "rgba(255,255,255,0.7)" : awayColor}">${awayAbbr}</span> <span style="color:${textColor}">${aScore}</span></div><div class="sb-play-score-row"><span style="color:${isScoring ? "rgba(255,255,255,0.7)" : homeColor}">${homeAbbr}</span> <span style="color:${textColor}">${hScore}</span></div></div>` : ""}<div class="sb-play-bases"><div class="sb-play-base${play?.matchup?.postOnSecond ? " occupied" : ""}" style="${play?.matchup?.postOnSecond ? "background:" + teamColor : ""}"></div><div class="sb-play-bases-row"><div class="sb-play-base${play?.matchup?.postOnThird ? " occupied" : ""}" style="${play?.matchup?.postOnThird ? "background:" + teamColor : ""}"></div><div class="sb-play-base${play?.matchup?.postOnFirst ? " occupied" : ""}" style="${play?.matchup?.postOnFirst ? "background:" + teamColor : ""}"></div></div></div><div class="sb-play-count"><div class="sb-play-count-row"><span>B</span>${[0, 1, 2, 3].map((i) => `<span class="sb-count-dot${i < balls ? " filled" : ""}" style="border-color:#4CAF50;${i < balls ? "background:#4CAF50" : ""}"></span>`).join("")}</div><div class="sb-play-count-row"><span>S</span>${[0, 1, 2].map((i) => `<span class="sb-count-dot${i < strikes ? " filled" : ""}" style="border-color:#f44336;${i < strikes ? "background:#f44336" : ""}"></span>`).join("")}</div></div></div>
      </div>`;
      })
      .join("");

    if (!setPanelHtml(listEl, playsHtml)) return;

    listEl.querySelectorAll(".sb-play-card").forEach((card) => {
      card.addEventListener("click", () => {
        const inn = parseInt(card.dataset.inning),
          pidx = parseInt(card.dataset.playIdx);
        const filtered = [...allPlays]
          .filter((p) => p?.about?.inning === inn)
          .reverse();
        openPlayModal(filtered[pidx]);
      });
    });
  }

  // ─── Series Panel ───────────────────────────────────────────────────────────
  var seriesHomeOnly = false;
  var seriesGamesCache = [];
  var seriesCtx = null;

  function renderSeriesPanel(body) {
    const away = gameData?.teams?.away?.team || gameData?.teams?.away || {};
    const home = gameData?.teams?.home?.team || gameData?.teams?.home || {};
    const awayColor = getTeamColor(away),
      homeColor = getTeamColor(home);

    // The panel re-renders on every poll. When the matchup and markup are
    // already on screen, reuse the cached games instead of resetting the tab
    // to a loading spinner and refetching each time.
    var sameMatchup =
      seriesCtx &&
      seriesGamesCache.length > 0 &&
      Number(seriesCtx.away?.id) === Number(away?.id) &&
      Number(seriesCtx.home?.id) === Number(home?.id);
    if (sameMatchup && body.querySelector("#sbSeriesGames")) {
      seriesCtx = { away, home, awayColor, homeColor };
      renderSeriesSummaryBubble();
      renderSeriesGamesList();
      return;
    }

    seriesHomeOnly = false;
    seriesGamesCache = [];
    seriesCtx = { away, home, awayColor, homeColor };

    setPanelHtml(
      body,
      '<div id="sbSeriesSummary"></div>' +
        '<div class="sb-series-games" id="sbSeriesGames"><div class="loading"><div class="loading-spinner"></div></div></div>',
    );

    renderSeriesSummaryBubble();
    fetchSeriesGames(away, home, awayColor, homeColor);
  }

  // Compute wins across finished series games and render the summary bubble.
  // Respects the HOME filter — when active, only counts games at the home team's park.
  function renderSeriesSummaryBubble() {
    const el = document.getElementById("sbSeriesSummary");
    if (!el || !seriesCtx) return;
    const { away, home, awayColor, homeColor } = seriesCtx;
    const homeId = Number(home?.id),
      awayId = Number(away?.id);
    let homeWins = 0,
      awayWins = 0;
    seriesGamesCache.forEach((m) => {
      // When filtering to home games, only count games where our home team hosted
      if (seriesHomeOnly && Number(m?.teams?.home?.team?.id) !== homeId) return;
      const status = m?.status || {};
      const code = String(status?.codedGameState || status?.statusCode || "");
      if (!["D", "C", "O", "F", "Q", "R"].includes(code)) return;
      const hId = Number(m?.teams?.home?.team?.id),
        aId = Number(m?.teams?.away?.team?.id);
      const hs = Number(m?.teams?.home?.score),
        as = Number(m?.teams?.away?.score);
      if (!isFinite(hs) || !isFinite(as) || hs === as) return;
      const winner = hs > as ? hId : aId;
      if (winner === homeId) homeWins++;
      else if (winner === awayId) awayWins++;
    });
    const total = homeWins + awayWins;
    const homeFlex = total > 0 ? homeWins : 1;
    const awayFlex = total > 0 ? awayWins : 1;
    const awayLogo = getTeamLogo(away),
      homeLogo = getTeamLogo(home);
    const summaryHtml = `<div class="sb-series"><div class="sb-series-header"><span>SEASON SERIES</span><button class="sb-series-filter${seriesHomeOnly ? " active" : ""}" id="sbSeriesHomeFilter" style="border-color:${homeColor};${seriesHomeOnly ? "background:" + homeColor + "1A" : ""}">${homeLogo ? `<img src="${homeLogo}" class="sb-series-filter-logo">` : ""}<span>HOME</span></button></div><div class="sb-series-body"><div class="sb-series-side">${awayLogo ? `<img src="${awayLogo}" class="sb-series-logo">` : ""}<span class="sb-series-wins">${awayWins}</span></div><div class="sb-series-vs">VS</div><div class="sb-series-side sb-series-side-right"><span class="sb-series-wins">${homeWins}</span>${homeLogo ? `<img src="${homeLogo}" class="sb-series-logo">` : ""}</div></div><div class="sb-series-bar"><div style="flex:${awayFlex};background:${awayColor};height:6px;border-right:2.5px solid var(--bg-surface)"></div><div style="flex:${homeFlex};background:${homeColor};height:6px"></div></div></div>`;
    if (!setPanelHtml(el, summaryHtml)) return;
    const btn = document.getElementById("sbSeriesHomeFilter");
    if (btn)
      btn.addEventListener("click", function () {
        seriesHomeOnly = !seriesHomeOnly;
        renderSeriesSummaryBubble();
        renderSeriesGamesList();
      });
  }

  function renderSeriesGamesList() {
    const container = document.getElementById("sbSeriesGames");
    if (!container || !seriesCtx) return;
    const { away, home, awayColor, homeColor } = seriesCtx;
    const homeId = Number(home?.id);
    let games = seriesGamesCache;
    if (seriesHomeOnly)
      games = games.filter((m) => Number(m?.teams?.home?.team?.id) === homeId);
    if (!games.length) {
      setPanelHtml(
        container,
        '<div class="sb-empty">No series games found.</div>',
      );
      return;
    }
    setPanelHtml(
      container,
      games
        .map((match) => {
          const mHome = match?.teams?.home || {},
            mAway = match?.teams?.away || {};
          const mHomeTeam = mHome?.team || {},
            mAwayTeam = mAway?.team || {};
          const mHSraw = mHome?.score,
            mASraw = mAway?.score;
          const hasScores =
            mHSraw != null &&
            mASraw != null &&
            isFinite(Number(mHSraw)) &&
            isFinite(Number(mASraw));
          const mHS = Number(mHSraw),
            mAS = Number(mASraw);
          const mHW = hasScores && mHS > mAS,
            mAW = hasScores && mAS > mHS;
          const status = match?.status || {};
          const coded = String(
            status?.codedGameState || status?.statusCode || "",
          );
          const isLive = !["S", "P", "D", "C", "O", "F", "Q", "R"].includes(
            coded,
          );
          const isFinished = ["D", "C", "O", "F", "Q", "R"].includes(coded);
          const inning = match?.linescore?.currentInning,
            isTop = match?.linescore?.isTopInning !== false;
          const statusShort =
            isLive && inning
              ? `${isTop ? "T" : "B"}${inning}`
              : isFinished
                ? "FINAL"
                : coded === "S" || coded === "P"
                  ? ""
                  : String(status?.detailedState || "").toUpperCase();
          const extraInnings =
            hasScores && !isLive && inning !== 9 ? `/${inning}` : "";
          const dateStr = fmtGameDate(match?.gameDate);
          const gameTypeDesc =
            match?.gameType === "S"
              ? "Spring Training"
              : match?.gameType === "R"
                ? "Regular Season"
                : match?.gameType === "P"
                  ? "Postseason"
                  : "MLB";
          const topLine = dateStr
            ? `${dateStr} \u00B7 ${gameTypeDesc}`
            : gameTypeDesc;
          const venueLine =
            match?.venue?.name || match?.seriesDescription || "";
          const opacity = hasScores && isFinished;
          const mHL = getTeamLogo(mHomeTeam),
            mAL = getTeamLogo(mAwayTeam);
          const isCurrent = String(match?.gamePk) === String(gamePk);
          const aWins = mAway?.leagueRecord?.wins ?? "W",
            aLosses = mAway?.leagueRecord?.losses ?? "L";
          const hWins = mHome?.leagueRecord?.wins ?? "W",
            hLosses = mHome?.leagueRecord?.losses ?? "L";
          const leftColor =
            Number(mAwayTeam?.id) === Number(away?.id) ? awayColor : homeColor;
          const rightColor =
            Number(mHomeTeam?.id) === Number(home?.id) ? homeColor : awayColor;
          const scoreHtml = hasScores
            ? `<div class="sb-sgc-score-row"><span class="sb-sgc-score-num" style="color:${isLive ? "var(--accent-error)" : mAW ? "var(--text-primary)" : "var(--text-secondary)"};font-weight:${mAW ? "800" : "500"};opacity:${!opacity ? 1 : mAW ? 1 : 0.55}">${mAS}</span><span class="sb-sgc-score-dash">-</span><span class="sb-sgc-score-num" style="color:${isLive ? "var(--accent-error)" : mHW ? "var(--text-primary)" : "var(--text-secondary)"};font-weight:${mHW ? "800" : "500"};opacity:${!opacity ? 1 : mHW ? 1 : 0.55}">${mHS}</span></div>`
            : `<div class="sb-sgc-time">${fmtGameTimeOnly(match?.gameDate)}</div><div class="sb-sgc-ampm">${fmtGameAmPm(match?.gameDate)}</div>`;
          return `<div class="sb-series-game-card${isCurrent ? " current" : ""}" onclick="window.location.href='scoreboard?gamePk=${match.gamePk}'">
          <div class="sb-sgc-top">${topLine}</div>
          <div class="sb-sgc-body" style="background:var(--bg-surface-secondary)"><div class="sb-sgc-gradient" style="background:linear-gradient(90deg,${leftColor}59 0%,transparent 35%,transparent 65%,${rightColor}59 100%)"></div>
            <div class="sb-sgc-inner">
              <div class="sb-sgc-side">${mAL ? `<img src="${mAL}" class="sb-sgc-logo" style="opacity:${!opacity ? 1 : mAW ? 1 : 0.55}">` : ""}<div class="sb-sgc-team"><div class="sb-sgc-name" style="color:${mAW ? "var(--text-primary)" : "var(--text-secondary)"};font-weight:${mAW ? "700" : "500"};opacity:${!opacity ? 1 : mAW ? 1 : 0.55}">${mAwayTeam?.name || "Away"}</div><div class="sb-sgc-record" style="opacity:${!opacity ? 1 : mAW ? 1 : 0.55}">${aWins} - ${aLosses}</div></div></div>
              <div class="sb-sgc-score">${statusShort ? `<div class="sb-sgc-status" style="color:${isLive ? "var(--accent-error)" : "var(--text-secondary)"}">${statusShort}${extraInnings}</div>` : ""}${scoreHtml}</div>
              <div class="sb-sgc-side sb-sgc-side-right"><div class="sb-sgc-team sb-sgc-team-right"><div class="sb-sgc-name" style="color:${mHW ? "var(--text-primary)" : "var(--text-secondary)"};font-weight:${mHW ? "700" : "500"};opacity:${!opacity ? 1 : mHW ? 1 : 0.55}">${mHomeTeam?.name || "Home"}</div><div class="sb-sgc-record" style="opacity:${!opacity ? 1 : mHW ? 1 : 0.55}">${hWins} - ${hLosses}</div></div>${mHL ? `<img src="${mHL}" class="sb-sgc-logo" style="opacity:${!opacity ? 1 : mHW ? 1 : 0.55}">` : ""}</div>
            </div>
          </div>
          <div class="sb-sgc-bottom">${venueLine}</div>
        </div>`;
        })
        .join(""),
    );
  }

  async function fetchSeriesGames(away, home, awayColor, homeColor) {
    const container = document.getElementById("sbSeriesGames");
    if (!container) return;
    try {
      const homeId = home?.id,
        awayId = away?.id;
      const rawDate =
        gameData?.datetime?.originalDate || gameData?.datetime?.dateTime;
      const year =
        String(rawDate || "").slice(0, 4) || new Date().getFullYear();
      const fields =
        "dates,games,linescore,currentInning,isTopInning,gamePk,gameType,gameDate,status,statusCode,codedGameState,detailedState,teams,away,team,id,name,abbreviation,leagueRecord,wins,losses,score,home,team,id,name,abbreviation,leagueRecord,wins,losses,score,venue,name,seriesDescription";
      const url = `https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&startDate=${year}-01-01&endDate=${year}-12-31&teamId=${homeId}&opponentId=${awayId}&hydrate=linescore&fields=${fields}`;
      const res = await fetch(url);
      const data = await res.json();
      seriesGamesCache = (data?.dates || [])
        .flatMap((d) => d?.games || [])
        .sort(
          (a, b) => new Date(b?.gameDate || 0) - new Date(a?.gameDate || 0),
        );
      renderSeriesSummaryBubble();
      renderSeriesGamesList();
    } catch (err) {
      setPanelHtml(
        container,
        '<div class="sb-error">Failed to load series games.</div>',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUBBLES
  // ═══════════════════════════════════════════════════════════════════════════
  function renderLinescoreBubble(
    away,
    home,
    awayColor,
    homeColor,
    awayAbbr,
    homeAbbr,
  ) {
    const innings = liveData?.linescore?.innings || [];
    if (!innings.length) return "";
    const at = liveData?.linescore?.teams?.away || {},
      ht = liveData?.linescore?.teams?.home || {};
    return `<div class="sb-linescore"><div class="sb-ls-header"><div class="sb-ls-label-col"></div><div class="sb-ls-innings">${innings.map((inn) => `<div class="sb-ls-inning-num">${inn.num}</div>`).join("")}</div><div class="sb-ls-totals"><span>R</span><span>H</span><span>E</span></div></div><div class="sb-ls-row" style="border-bottom:2px solid ${awayColor}"><div class="sb-ls-label-col"><span class="sb-ls-abbr">${awayAbbr}</span></div><div class="sb-ls-innings">${innings.map((inn) => `<div class="sb-ls-run">${inn.away?.runs ?? "-"}</div>`).join("")}</div><div class="sb-ls-totals"><span>${at.runs ?? "-"}</span><span>${at.hits ?? "-"}</span><span>${at.errors ?? "-"}</span></div></div><div class="sb-ls-row" style="border-bottom:2px solid ${homeColor}"><div class="sb-ls-label-col"><span class="sb-ls-abbr">${homeAbbr}</span></div><div class="sb-ls-innings">${innings.map((inn) => `<div class="sb-ls-run">${inn.home?.runs ?? "-"}</div>`).join("")}</div><div class="sb-ls-totals"><span>${ht.runs ?? "-"}</span><span>${ht.hits ?? "-"}</span><span>${ht.errors ?? "-"}</span></div></div></div>`;
  }

  function renderProbablePitchers(awayColor, homeColor) {
    const prob = gameData?.probablePitchers || {};
    const aid = prob?.away?.id,
      hid = prob?.home?.id;
    if (!aid && !hid) return "";
    const pm = gameData?.players || {};
    const bsTeams = liveData?.boxscore?.teams || {};
    const allBs = {
      ...(bsTeams?.away?.players || {}),
      ...(bsTeams?.home?.players || {}),
    };
    const card = function (id, color, bsTeamData) {
      if (!id) return "";
      var info = resolvePlayer(pm, id);
      var bsPitcher = allBs["ID" + id] || null;
      // App uses seasonStats.pitching first, then stats.pitching
      var pitStats =
        bsPitcher?.seasonStats?.pitching || bsPitcher?.stats?.pitching || {};
      var era = pitStats.era != null ? pitStats.era : "—";
      var wins = pitStats.wins != null ? pitStats.wins : "—";
      var losses = pitStats.losses != null ? pitStats.losses : "—";
      var wlStr = wins !== "—" && losses !== "—" ? wins + "-" + losses : "—";
      var ip = pitStats.inningsPitched || "—";
      return (
        '<div class="sb-pitcher-card" style="border-color:' +
        color +
        '"><div class="sb-pitcher-label" style="color:' +
        color +
        '">Probable Pitcher</div><img src="' +
        headshotUrl(id) +
        '" class="sb-pitcher-headshot" style="border-color:' +
        color +
        '" onerror="this.style.display=\'none\'"><div class="sb-pitcher-name">' +
        (info?.fullName || "TBD") +
        '</div><div class="sb-pitcher-stats"><div class="sb-pitcher-stat"><span>' +
        wlStr +
        '</span><span>W-L</span></div><div class="sb-pitcher-stat"><span>' +
        era +
        '</span><span>ERA</span></div><div class="sb-pitcher-stat"><span>' +
        ip +
        "</span><span>IP</span></div></div></div>"
      );
    };
    return (
      '<div class="sb-prob-pitchers">' +
      card(aid, awayColor, bsTeams?.away) +
      card(hid, homeColor, bsTeams?.home) +
      "</div>"
    );
  }

  function renderTeamStats(
    away,
    home,
    awayColor,
    homeColor,
    awayAbbr,
    homeAbbr,
    sched,
  ) {
    const ba = liveData?.boxscore?.teams?.away || {},
      bh = liveData?.boxscore?.teams?.home || {};
    const ats = ba?.teamStats || {},
      hts = bh?.teamStats || {};
    const sections = sched
      ? [
          {
            key: "batting",
            label: "BATTING",
            stats: [
              { key: "avg", label: "AVG" },
              { key: "obp", label: "OBP" },
              { key: "slg", label: "SLG" },
              { key: "ops", label: "OPS" },
            ],
          },
          {
            key: "pitching",
            label: "PITCHING",
            stats: [
              { key: "era", label: "ERA", lowerBetter: true },
              { key: "whip", label: "WHIP", lowerBetter: true },
            ],
          },
        ]
      : [
          {
            key: "batting",
            label: "BATTING",
            stats: [
              { key: "hits", label: "Hits" },
              { key: "runs", label: "Runs" },
              { key: "homeRuns", label: "HR" },
              { key: "rbi", label: "RBI" },
              { key: "strikeOuts", label: "K", lowerBetter: true },
              { key: "baseOnBalls", label: "BB" },
            ],
          },
          {
            key: "pitching",
            label: "PITCHING",
            stats: [
              { key: "strikeOuts", label: "K" },
              { key: "baseOnBalls", label: "BB", lowerBetter: true },
              { key: "hits", label: "Hits", lowerBetter: true },
            ],
          },
          {
            key: "fielding",
            label: "FIELDING",
            stats: [
              { key: "errors", label: "Errors", lowerBetter: true },
              { key: "assists", label: "Assists" },
              { key: "putOuts", label: "PO" },
            ],
          },
        ];
    const active = sections
      .map((sec) => {
        const aw = ats[sec.key] || {},
          hm = hts[sec.key] || {};
        const rows = sec.stats.filter(
          (s) => aw[s.key] != null || hm[s.key] != null,
        );
        return { ...sec, rows, aw, hm };
      })
      .filter((sec) => sec.rows.length > 0);
    if (!active.length) return "";
    let h = '<div class="sb-team-stats">';
    active.forEach((sec, si) => {
      if (si > 0) h += '<div class="sb-ts-divider"></div>';
      h += `<div class="sb-ts-header"><span style="color:${awayColor}">${awayAbbr}</span><span class="sb-ts-label">${sec.label}</span><span style="color:${homeColor}">${homeAbbr}</span></div>`;
      sec.rows.forEach((s) => {
        const aN = parseFloat(sec.aw[s.key]) || 0,
          hN = parseFloat(sec.hm[s.key]) || 0,
          total = aN + hN;
        let af = total === 0 ? 0.5 : s.lowerBetter ? hN / total : aN / total;
        af = Math.max(0, Math.min(1, af));
        h += `<div class="sb-ts-row"><span class="sb-ts-val">${sec.aw[s.key] ?? "—"}</span><div class="sb-ts-bar-wrap"><div class="sb-ts-bar"><div style="flex:${af};background:${awayColor};height:8px;border-radius:4px 0 0 4px"></div>${af > 0 && af < 1 ? '<div style="width:3px;background:var(--bg-border)"></div>' : ""}<div style="flex:${1 - af};background:${homeColor};height:8px;border-radius:0 4px 4px 0"></div></div><div class="sb-ts-bar-label">${s.label}</div></div><span class="sb-ts-val">${sec.hm[s.key] ?? "—"}</span></div>`;
      });
    });
    h += "</div>";
    return h;
  }

  function renderLastPlayBubble(
    away,
    home,
    awayColor,
    homeColor,
    awayAbbr,
    homeAbbr,
  ) {
    const allPlays = liveData?.plays?.allPlays || [];
    let lp = null;
    for (let i = allPlays.length - 1; i >= 0; i--) {
      if (allPlays[i]?.result?.event) {
        lp = allPlays[i];
        break;
      }
    }
    if (!lp) return "";
    const isTop = lp?.about?.isTopInning !== false,
      tc = isTop ? awayColor : homeColor,
      ba = isTop ? awayAbbr : homeAbbr;
    const inning = lp?.about?.inning,
      event = lp?.result?.event || "",
      desc = lp?.result?.description || "";
    const isScoring = lp?.about?.isScoringPlay === true,
      aS = lp?.result?.awayScore,
      hS = lp?.result?.homeScore;
    const pm = gameData?.players || {};
    const bid = lp?.matchup?.batter?.id,
      pid = resolvePitcherIdFromPlay(
        lp,
        liveData?.linescore?.offense?.pitcher?.id,
      );
    const bi = resolvePlayer(pm, bid),
      pi = resolvePlayer(pm, pid);
    const btc = isTop ? awayColor : homeColor,
      ptc = isTop ? homeColor : awayColor;
    let matchup = "";
    if (bi || pi) {
      matchup =
        '<div class="sb-lp-matchup">' +
        (bi
          ? `<div class="sb-lp-mu-side">${bid != null ? `<img src="${headshotUrl(bid)}" class="sb-lp-mu-headshot" style="border-color:${btc}" onerror="this.style.visibility='hidden'">` : ""}<div class="sb-lp-mu-text"><div class="sb-lp-mu-name">${bi.fullName || "—"}</div><div class="sb-lp-mu-role">Batter</div></div></div>`
          : '<div class="sb-lp-mu-side"></div>') +
        (pi
          ? `<div class="sb-lp-mu-side sb-lp-mu-right"><div class="sb-lp-mu-text sb-lp-mu-text-right"><div class="sb-lp-mu-name">${pi.fullName || "—"}</div><div class="sb-lp-mu-role">Pitcher</div></div>${pid != null ? `<img src="${headshotUrl(pid)}" class="sb-lp-mu-headshot" style="border-color:${ptc}" onerror="this.style.visibility='hidden'">` : ""}</div>`
          : "") +
        "</div>";
    }
    return `<div class="sb-last-play" style="border-color:${tc}"><div class="sb-lp-header" style="background:${tc}18;border-bottom-color:var(--bg-border)"><div class="sb-lp-header-left"><span class="sb-lp-badge" style="background:${tc}">${ba}</span><span>${isTop ? "▲" : "▼"} ${ordinal(inning)}</span>${isScoring ? `<span class="sb-lp-scoring" style="border-color:${tc};color:${tc}">SCORING PLAY</span>` : ""}</div>${aS != null && hS != null ? `<span>${awayAbbr} ${aS} - ${hS} ${homeAbbr}</span>` : ""}</div><div class="sb-lp-body"><div class="sb-lp-event" style="color:${tc}">${event}</div>${desc ? `<div class="sb-lp-desc">${desc}</div>` : ""}${matchup}</div></div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CURRENT AT-BAT — mirrors app's CurrentAtBatBubble + StrikeZoneView
  // ═══════════════════════════════════════════════════════════════════════════
  var SB_CALL_COLORS = {
    B: "#4CAF50",
    "*B": "#492300",
    C: "#E53935",
    S: "#E53935",
    T: "#E53935",
    W: "#E53935",
    F: "#FF9800",
    X: "#2196F3",
    E: "#2196F3",
    D: "#2196F3",
    H: "#9C27B0",
  };
  var SB_CALL_LABELS = {
    B: "Ball",
    "*B": "Ball",
    C: "Called Strike",
    S: "Swinging Strike",
    T: "Foul Tip",
    F: "Foul",
    X: "In Play",
    E: "In Play",
    D: "In Play",
    H: "HBP",
  };

  function sbPitchColor(cc) {
    var c = String(cc || "").toUpperCase();
    if (["X", "E", "H", "D"].indexOf(c) >= 0) return "#2196F3";
    if (["B", "*B"].indexOf(c) >= 0) return "#4CAF50";
    return "#f44336";
  }

  // Pitcher id sometimes only lives on a playEvent, not on play.matchup
  function resolvePitcherIdFromPlay(play, fallbackPitcherId) {
    if (play?.matchup?.pitcher?.id != null) return play.matchup.pitcher.id;
    const events = play?.playEvents || [];
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i]?.matchup?.pitcher?.id != null)
        return events[i].matchup.pitcher.id;
    }
    return fallbackPitcherId ?? null;
  }

  function getPlayPitches(play) {
    return (play?.playEvents || []).filter(function (e) {
      return e?.pitchData?.coordinates?.pX != null;
    });
  }

  // Current at-bat play — the feed exposes it directly as plays.currentPlay
  function getCurrentAtBatPlay() {
    const cp = liveData?.plays?.currentPlay;
    if (cp) return cp;
    const allPlays = liveData?.plays?.allPlays || [];
    if (!allPlays.length) return null;
    for (let i = allPlays.length - 1; i >= 0; i--) {
      if (allPlays[i]?.about?.isCurrentInning) return allPlays[i];
    }
    return allPlays[allPlays.length - 1] || null;
  }

  // Strike-zone SVG (identical math to the app's StrikeZoneView projection)
  function renderStrikeZoneSVG(pitches) {
    const chartSize = 160;
    const containerW = chartSize,
      containerH = Math.round(chartSize * 1.16);
    const strikeW = Math.round(containerW * 0.52);
    const strikeH = Math.round(containerH * 0.5);
    const strikeLeft = Math.round((containerW - strikeW) / 2);
    const strikeTop = Math.round(containerH * 0.15);
    const dotSize = Math.max(14, Math.round(chartSize * 0.125));
    const dotR = dotSize / 2;

    let avgTop =
      pitches.reduce(function (s, p) {
        return s + ((p.pitchData && p.pitchData.strikeZoneTop) || 3.5);
      }, 0) / pitches.length;
    let avgBot =
      pitches.reduce(function (s, p) {
        return s + ((p.pitchData && p.pitchData.strikeZoneBottom) || 1.5);
      }, 0) / pitches.length;
    let zoneHeightFt = avgTop - avgBot;
    if (zoneHeightFt <= 0) zoneHeightFt = 2;
    const PLATE_WIDTH_FT = 20 / 12;

    function finalPoint(pitch) {
      const d = pitch.pitchData;
      if (!d || !d.coordinates) return null;
      const t = d.plateTime;
      if (t == null) return null;
      const c = d.coordinates;
      if (
        [c.x0, c.z0, c.vX0, c.vY0, c.vZ0, c.aX, c.aY, c.aZ].some(function (v) {
          return v == null;
        })
      )
        return null;
      return {
        x: c.x0 + c.vX0 * t + 0.5 * c.aX * t * t,
        y: c.vY0 * t + 0.5 * c.aY * t * t,
        z: c.z0 + c.vZ0 * t + 0.5 * c.aZ * t * t,
      };
    }

    function project(p) {
      if (!p) return null;
      const depthScale = 1 - (p.y / 60) * 0.5;
      const zRatio = (p.z - avgBot) / zoneHeightFt;
      const y = strikeTop + strikeH - zRatio * strikeH * 0.6 * depthScale - 25;
      const xRatio = p.x / (PLATE_WIDTH_FT / 2);
      const x =
        strikeLeft + strikeW / 2 + xRatio * (strikeW / 2) * 0.75 * depthScale;
      return {
        x: Math.max(2, Math.min(containerW - dotSize, x - dotR)),
        y: Math.max(2, Math.min(containerH - dotSize, y - dotR)),
      };
    }

    const dots = pitches
      .map(function (p, i) {
        const pos = project(finalPoint(p));
        if (!pos) return "";
        const cc = (p.details && p.details.call && p.details.call.code) || "";
        const color = sbPitchColor(cc);
        const cx = pos.x + dotR,
          cy = pos.y + dotR;
        return (
          '<g class="sb-sz-pitch"><circle cx="' +
          cx +
          '" cy="' +
          cy +
          '" r="' +
          dotR +
          '" fill="' +
          color +
          '" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/><text x="' +
          cx +
          '" y="' +
          (cy + 4.5) +
          '" text-anchor="middle" font-size="' +
          Math.max(8, Math.round(dotSize * 0.5)) +
          '" font-weight="800" fill="#fff" pointer-events="none">' +
          (i + 1) +
          "</text></g>"
        );
      })
      .join("");

    const grid =
      '<line x1="' +
      (strikeLeft + strikeW / 3) +
      '" y1="' +
      strikeTop +
      '" x2="' +
      (strikeLeft + strikeW / 3) +
      '" y2="' +
      (strikeTop + strikeH) +
      '" style="stroke:var(--text-tertiary)" stroke-width="1" opacity="0.45"/>' +
      '<line x1="' +
      (strikeLeft + (strikeW * 2) / 3) +
      '" y1="' +
      strikeTop +
      '" x2="' +
      (strikeLeft + (strikeW * 2) / 3) +
      '" y2="' +
      (strikeTop + strikeH) +
      '" style="stroke:var(--text-tertiary)" stroke-width="1" opacity="0.45"/>' +
      '<line x1="' +
      strikeLeft +
      '" y1="' +
      (strikeTop + strikeH / 3) +
      '" x2="' +
      (strikeLeft + strikeW) +
      '" y2="' +
      (strikeTop + strikeH / 3) +
      '" style="stroke:var(--text-tertiary)" stroke-width="1" opacity="0.45"/>' +
      '<line x1="' +
      strikeLeft +
      '" y1="' +
      (strikeTop + (strikeH * 2) / 3) +
      '" x2="' +
      (strikeLeft + strikeW) +
      '" y2="' +
      (strikeTop + (strikeH * 2) / 3) +
      '" style="stroke:var(--text-tertiary)" stroke-width="1" opacity="0.45"/>';

    return (
      '<svg width="' +
      containerW +
      '" height="' +
      containerH +
      '" viewBox="0 0 ' +
      containerW +
      " " +
      containerH +
      '" class="sb-sz-svg">' +
      '<rect x="' +
      strikeLeft +
      '" y="' +
      strikeTop +
      '" width="' +
      strikeW +
      '" height="' +
      strikeH +
      '" fill="rgba(128,128,128,0.06)" style="stroke:var(--text-tertiary)" stroke-width="2" rx="3"/>' +
      grid +
      dots +
      "</svg>"
    );
  }

  function renderCurrentAtBat(away, home, awayColor, homeColor) {
    const play = getCurrentAtBatPlay();
    if (!play) return "";

    const pm = gameData?.players || {};
    const isTop = play?.about?.isTopInning !== false;
    const teamColor = isTop ? awayColor : homeColor;
    const batterTeamColor = isTop ? awayColor : homeColor;
    const pitcherTeamColor = isTop ? homeColor : awayColor;
    const inning = play?.about?.inning;

    const bid = play?.matchup?.batter?.id;
    const pid = resolvePitcherIdFromPlay(
      play,
      liveData?.linescore?.offense?.pitcher?.id,
    );
    const bi = resolvePlayer(pm, bid),
      pi = resolvePlayer(pm, pid);

    const bsTeams = liveData?.boxscore?.teams || {};
    const allBs = {
      ...(bsTeams?.away?.players || {}),
      ...(bsTeams?.home?.players || {}),
    };
    const bBs = bid != null ? allBs[`ID${bid}`] || null : null;
    const pBs = pid != null ? allBs[`ID${pid}`] || null : null;
    const bBat = bBs?.stats?.batting || bBs?.seasonStats?.batting || {};
    const pPit = pBs?.stats?.pitching || pBs?.seasonStats?.pitching || {};

    const allPitches = getPlayPitches(play);

    const counts = play?.count || {};
    const balls = counts?.balls || 0,
      strikes = counts?.strikes || 0,
      outs = counts?.outs || 0;

    // Most recent event carrying a call code
    let lastEv = null;
    const evs = play?.playEvents || [];
    for (let i = evs.length - 1; i >= 0; i--) {
      if (evs[i]?.details?.call?.code != null) {
        lastEv = evs[i];
        break;
      }
    }
    const lastCode = lastEv?.details?.call?.code ?? null;
    const lastLabel = lastCode ? SB_CALL_LABELS[lastCode] || lastCode : null;
    const lastColor = lastCode
      ? SB_CALL_COLORS[lastCode] || "var(--text-secondary)"
      : null;
    const lastDesc = lastEv?.details?.description || "";
    const lastType = lastEv?.details?.type?.description || null;
    const lastSpeed =
      lastEv?.pitchData?.startSpeed != null
        ? Math.round(lastEv.pitchData.startSpeed)
        : null;

    // Bases
    const baseSrc = play?.matchup || {};

    // On deck / in hole from the batting team's offense block
    const offense = liveData?.linescore?.offense || {};
    const onDeckId = offense?.onDeck?.id ?? null;
    const inHoleId = offense?.inHole?.id ?? offense?.onHole?.id ?? null;
    const onDeckInfo = onDeckId != null ? resolvePlayer(pm, onDeckId) : null;
    const inHoleInfo = inHoleId != null ? resolvePlayer(pm, inHoleId) : null;

    const countItem = (label, value, color) =>
      `<div class="sb-cab-count-item"><span class="sb-cab-count-val" style="color:${color}">${value}</span><span class="sb-cab-count-label">${label}</span></div>`;
    const miniStat = (label, val) =>
      `<div class="sb-cab-ministat"><span class="sb-cab-ministat-val">${val ?? "—"}</span><span class="sb-cab-ministat-label">${label}</span></div>`;
    const baseDiamond = (occupied) =>
      occupied
        ? `<div class="sb-cab-base occupied" style="background:${teamColor};box-shadow:0 0 6px ${teamColor}"></div>`
        : '<div class="sb-cab-base"></div>';

    let html = `<div class="sb-atbat" style="border-color:${teamColor}">`;

    // Header — inning + B/S/O
    html += `<div class="sb-cab-header"><span class="sb-cab-title" style="color:${teamColor}">${isTop ? "Top" : "Bot"} ${inning != null ? ordinal(inning) : "—"}</span><div class="sb-cab-count">${countItem("B", balls, "#4CAF50")}${countItem("S", strikes, "#f44336")}${countItem("O", outs, "var(--text-secondary)")}</div></div>`;

    // Last pitch event
    if (lastLabel) {
      const meta = [lastType, lastSpeed != null ? `${lastSpeed} mph` : null]
        .filter(Boolean)
        .join(" · ");
      html += `<div class="sb-cab-lastev"><span class="sb-cab-call-badge" style="background:${lastColor}">${lastCode}</span><div class="sb-cab-lastev-main">${lastDesc ? `<div class="sb-cab-lastev-desc">${lastDesc}</div>` : ""}${meta ? `<div class="sb-cab-lastev-meta">${meta}</div>` : ""}</div></div>`;
    }

    // Matchup — batter | bases | pitcher
    const batterImg =
      bid != null
        ? `<img src="${headshotUrl(bid)}" class="sb-cab-headshot" style="border-color:${batterTeamColor}" onerror="this.style.visibility='hidden'">`
        : "";
    const pitcherImg =
      pid != null
        ? `<img src="${headshotUrl(pid)}" class="sb-cab-headshot" style="border-color:${pitcherTeamColor}" onerror="this.style.visibility='hidden'">`
        : "";
    html += `<div class="sb-cab-matchup">`;
    html += `<div class="sb-cab-player">${batterImg}<div class="sb-cab-name">${shortName(bi?.fullName) || "—"}</div><div class="sb-cab-role" style="color:${batterTeamColor}">Batter</div><div class="sb-cab-ministats">${miniStat("AB", bBat.atBats)}${miniStat("H", bBat.hits)}${miniStat("K", bBat.strikeOuts)}</div></div>`;
    html += `<div class="sb-cab-bases">${baseDiamond(!!baseSrc.postOnSecond)}<div class="sb-cab-bases-row">${baseDiamond(!!baseSrc.postOnThird)}${baseDiamond(!!baseSrc.postOnFirst)}</div></div>`;
    html += `<div class="sb-cab-player sb-cab-player-right">${pitcherImg}<div class="sb-cab-name">${shortName(pi?.fullName) || "—"}</div><div class="sb-cab-role" style="color:${pitcherTeamColor}">Pitcher</div><div class="sb-cab-ministats">${miniStat("IP", pPit.inningsPitched)}${miniStat("K", pPit.strikeOuts)}${miniStat("BB", pPit.baseOnBalls)}</div></div>`;
    html += `</div>`;

    // Pitch locations
    if (allPitches.length > 0) {
      const legend = [
        ["Ball", "#4CAF50"],
        ["Strike / Foul", "#f44336"],
        ["In Play", "#2196F3"],
      ]
        .map(
          ([l, c]) =>
            `<span class="sb-cab-legend-item"><span class="sb-cab-legend-dot" style="background:${c}"></span>${l}</span>`,
        )
        .join("");
      html += `<div class="sb-cab-zone"><div class="sb-cab-zone-label">Pitch Locations</div>${renderStrikeZoneSVG(allPitches, allPitches.length - 1)}<div class="sb-cab-legend">${legend}</div></div>`;
    }

    // On deck / in hole
    if (onDeckId != null || inHoleId != null) {
      html += `<div class="sb-cab-next">`;
      [
        { id: onDeckId, info: onDeckInfo, label: "On Deck" },
        { id: inHoleId, info: inHoleInfo, label: "In Hole" },
      ].forEach((n, i) => {
        const img =
          n.id != null
            ? `<img src="${headshotUrl(n.id)}" class="sb-cab-next-headshot" style="border-color:${batterTeamColor}" onerror="this.style.visibility='hidden'">`
            : "";
        html += `<div class="sb-cab-next-player${i === 0 ? " sb-cab-next-divider" : ""}">${img}<div class="sb-cab-next-text"><div class="sb-cab-next-name">${shortName(n.info?.fullName) || "—"}</div><div class="sb-cab-next-label">${n.label}</div></div></div>`;
      });
      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }

  function renderWinProbability(
    away,
    home,
    awayColor,
    homeColor,
    awayAbbr,
    homeAbbr,
  ) {
    const wp = pitchesData?.probability;
    if (!wp?.home || !wp?.away) return "";
    const ha = wp.home.split(",").map(Number),
      aa = wp.away.split(",").map(Number);
    if (!ha.length) return "";
    const n = Math.min(ha.length, 100),
      step = ha.length / n;
    const s = [];
    for (let i = 0; i < n; i++) {
      s.push({ h: ha[Math.floor(i * step)], a: aa[Math.floor(i * step)] });
    }
    const hp = s
      .map(
        (pt, i) => `${i === 0 ? "M" : "L"}${(i / (n - 1)) * 100},${100 - pt.h}`,
      )
      .join(" ");
    const ap = s
      .map(
        (pt, i) => `${i === 0 ? "M" : "L"}${(i / (n - 1)) * 100},${100 - pt.a}`,
      )
      .join(" ");
    return `<div class="sb-winprob"><div class="sb-winprob-title">Win Probability</div><div class="sb-winprob-legend"><span style="color:${awayColor}">■ ${awayAbbr}</span><span style="color:${homeColor}">■ ${homeAbbr}</span></div><div class="sb-winprob-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%">${s
      .map((pt, i) => {
        if (i === 0) return "";
        const p = s[i - 1],
          x1 = ((i - 1) / (n - 1)) * 100,
          x2 = (i / (n - 1)) * 100,
          hY1 = 100 - p.h,
          hY2 = 100 - pt.h,
          aY1 = 100 - p.a,
          aY2 = 100 - pt.a;
        if (aY1 < hY1)
          return `<path d="M${x1},100 L${x1},${hY1} L${x2},${hY2} L${x2},100 Z" fill="${homeColor}" fill-opacity="0.3"/><path d="M${x1},${hY1} L${x1},${aY1} L${x2},${aY2} L${x2},${hY2} Z" fill="${awayColor}" fill-opacity="0.3"/>`;
        return `<path d="M${x1},100 L${x1},${aY1} L${x2},${aY2} L${x2},100 Z" fill="${awayColor}" fill-opacity="0.3"/><path d="M${x1},${aY1} L${x1},${hY1} L${x2},${hY2} L${x2},${aY2} Z" fill="${homeColor}" fill-opacity="0.3"/>`;
      })
      .join(
        "",
      )}<path d="${hp}" fill="none" stroke="${homeColor}" stroke-width="0.5"/><path d="${ap}" fill="none" stroke="${awayColor}" stroke-width="0.5"/></svg></div></div>`;
  }

  function renderGameInfoBubble() {
    const venue = gameData?.venue || {},
      weather = gameData?.weather || {},
      gi = gameData?.gameInfo || {};
    const vn = venue?.name,
      fi = venue?.fieldInfo || {};
    const hv = !!(vn || Object.keys(fi).length),
      hw = !!(weather?.condition || weather?.temp || weather?.wind),
      hg = !!(
        gi?.firstPitch ||
        gi?.gameDurationMinutes != null ||
        gi?.attendance != null
      );
    if (!hv && !hw && !hg) return "";
    let h =
      '<div class="sb-gameinfo"><div class="sb-gi-header">Game Info</div>';
    if (hv) {
      h +=
        '<div class="sb-gi-section"><div class="sb-gi-section-title">VENUE</div>';
      if (vn) h += `<div class="sb-gi-venue-name">${vn}</div>`;
      if (fi.capacity != null || fi.turfType || fi.roofType) {
        h += '<div class="sb-gi-row">';
        if (fi.capacity != null)
          h += `<div class="sb-gi-cell"><span>${fi.capacity.toLocaleString()}</span><span>Capacity</span></div>`;
        if (fi.turfType)
          h += `<div class="sb-gi-cell"><span>${fi.turfType}</span><span>Surface</span></div>`;
        if (fi.roofType)
          h += `<div class="sb-gi-cell"><span>${fi.roofType}</span><span>Roof</span></div>`;
        h += "</div>";
      }
      if (
        fi.leftLine != null ||
        fi.left != null ||
        fi.center != null ||
        fi.right != null ||
        fi.rightLine != null
      ) {
        h += '<div class="sb-gi-row">';
        if (fi.leftLine != null)
          h += `<div class="sb-gi-cell"><span>${fi.leftLine}ft</span><span>LF Line</span></div>`;
        if (fi.left != null)
          h += `<div class="sb-gi-cell"><span>${fi.left}ft</span><span>LF</span></div>`;
        if (fi.center != null)
          h += `<div class="sb-gi-cell"><span>${fi.center}ft</span><span>CF</span></div>`;
        if (fi.right != null)
          h += `<div class="sb-gi-cell"><span>${fi.right}ft</span><span>RF</span></div>`;
        if (fi.rightLine != null)
          h += `<div class="sb-gi-cell"><span>${fi.rightLine}ft</span><span>RF Line</span></div>`;
        h += "</div>";
      }
      h += "</div>";
    }
    if (hw) {
      h +=
        '<div class="sb-gi-section"><div class="sb-gi-section-title">WEATHER</div><div class="sb-gi-row">';
      if (weather.condition)
        h += `<div class="sb-gi-cell"><span>${weather.condition}</span><span>Condition</span></div>`;
      if (weather.temp)
        h += `<div class="sb-gi-cell"><span>${weather.temp}°F</span><span>Temp</span></div>`;
      if (weather.wind)
        h += `<div class="sb-gi-cell"><span>${weather.wind}</span><span>Wind</span></div>`;
      h += "</div></div>";
    }
    if (hg) {
      h +=
        '<div class="sb-gi-section"><div class="sb-gi-section-title">GAME</div>';
      if (gi.firstPitch)
        h += `<div class="sb-gi-first-pitch">${utcToEastern(gi.firstPitch)}</div>`;
      h += '<div class="sb-gi-row">';
      if (gi.gameDurationMinutes != null)
        h += `<div class="sb-gi-cell"><span>${fmtDuration(gi.gameDurationMinutes)}</span><span>Duration</span></div>`;
      if (gi.attendance != null)
        h += `<div class="sb-gi-cell"><span>${gi.attendance.toLocaleString()}</span><span>Attendance</span></div>`;
      h += "</div></div>";
    }
    h += "</div>";
    return h;
  }

  function renderSeriesSummary(awayColor, homeColor) {
    const ss = gameData?.seriesSummary || {};
    if (ss?.homeWins == null && ss?.awayWins == null) return "";
    const hw = Number(ss.homeWins || 0),
      aw = Number(ss.awayWins || 0),
      total = hw + aw;
    const away = gameData?.teams?.away?.team || gameData?.teams?.away || {};
    const home = gameData?.teams?.home?.team || gameData?.teams?.home || {};
    const awayLogo = getTeamLogo(away),
      homeLogo = getTeamLogo(home);
    return `<div class="sb-series"><div class="sb-series-header"><span>SEASON SERIES</span></div><div class="sb-series-body"><div class="sb-series-side">${awayLogo ? `<img src="${awayLogo}" class="sb-series-logo">` : ""}<span class="sb-series-wins">${aw}</span></div><div class="sb-series-vs">VS</div><div class="sb-series-side sb-series-side-right"><span class="sb-series-wins">${hw}</span>${homeLogo ? `<img src="${homeLogo}" class="sb-series-logo">` : ""}</div></div><div class="sb-series-bar"><div style="flex:${total > 0 ? aw : 1};background:${awayColor};height:6px;border-right:2.5px solid var(--bg-surface)"></div><div style="flex:${total > 0 ? hw : 1};background:${homeColor};height:6px"></div></div></div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAYER MODAL
  // ═══════════════════════════════════════════════════════════════════════════
  function openPlayerModal(playerId, side) {
    const pm = gameData?.players || {},
      bsTeams = liveData?.boxscore?.teams || {};
    const bsTD = side === "away" ? bsTeams?.away : bsTeams?.home;
    const bsP = bsTD?.players?.[`ID${playerId}`] || null;
    const pI = resolvePlayer(pm, playerId);
    const td =
      side === "away"
        ? gameData?.teams?.away?.team || gameData?.teams?.away || {}
        : gameData?.teams?.home?.team || gameData?.teams?.home || {};
    const tc = getTeamColor(td),
      tn = td?.name || "";
    if (!pI && !bsP) return;
    const fn = pI?.fullName || `Player ${playerId}`;
    const jn = bsP?.jerseyNumber ? `#${bsP.jerseyNumber}` : "";
    const pa =
      bsP?.position?.abbreviation || pI?.primaryPosition?.abbreviation || "—";
    const pn = bsP?.position?.name || pI?.primaryPosition?.name || "";
    const bat = bsP?.stats?.batting || {},
      pit = bsP?.stats?.pitching || {};
    const hb = Object.keys(bat).length > 0,
      hp = Object.keys(pit).length > 0;
    const isP = pa === "P" || pa === "SP" || pa === "RP";
    const rh = pI?.height || "";
    const height = rh.replace(/\\/g, "") || "—";
    const bc = pI?.batSide?.code || null,
      pc = pI?.pitchHand?.code || null;
    let hv = "—",
      hl = "Bats";
    if (hb && hp) {
      hv = `${bc || "—"} / ${pc || "—"}`;
      hl = "Bat / Pitch";
    } else if (hp && pc) {
      hv = pc;
      hl = "Throws";
    } else if (bc) {
      hv = bc;
      hl = "Bats";
    }
    const sm = isP ? "pitching" : "batting";
    const cols =
      sm === "pitching"
        ? [
            { key: "inningsPitched", label: "IP" },
            { key: "hits", label: "H" },
            { key: "runs", label: "R" },
            { key: "baseOnBalls", label: "BB" },
            { key: "strikeOuts", label: "K" },
            { key: "homeRuns", label: "HR" },
            { key: "strikePercentage", label: "K%" },
            { key: "numberOfPitches", label: "NP" },
            { key: "battersFaced", label: "BF" },
          ]
        : [
            { key: "atBats", label: "AB" },
            { key: "hits", label: "H" },
            { key: "runs", label: "R" },
            { key: "rbi", label: "RBI" },
            { key: "homeRuns", label: "HR" },
            { key: "baseOnBalls", label: "BB" },
            { key: "strikeOuts", label: "K" },
            { key: "stolenBases", label: "SB" },
            { key: "leftOnBase", label: "LOB" },
          ];
    const stats = sm === "pitching" ? pit : bat;
    $("#sbPlayerModalBody").innerHTML = `
      <div class="sb-pm-header" style="border-bottom-color:${tc}">
        <div class="sb-pm-headshot-wrap"><img src="${headshotUrl(playerId)}" class="sb-pm-headshot" style="border-color:${tc}"><div class="sb-pm-pos-badge">${pa}</div></div>
        <div class="sb-pm-name">${fn}</div><div class="sb-pm-meta">${[jn, tn].filter(Boolean).join(" • ")}</div>
        <div class="sb-pm-tri-row"><div class="sb-pm-tri-cell"><span>${pa}</span><span>${pn}</span></div><div class="sb-pm-tri-cell sb-pm-tri-mid"><span>${height}</span><span>Height</span></div><div class="sb-pm-tri-cell"><span>${hv}</span><span>${hl}</span></div></div>
      </div>
      <div class="sb-pm-stats">${cols.map(({ key, label }) => `<div class="sb-pm-stat-row"><span class="sb-pm-stat-val">${stats[key] ?? "—"}</span><span class="sb-pm-stat-lbl">${label}</span></div>`).join("")}</div>`;
    $("#sbPlayerModal").style.display = "flex";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAY MODAL
  // ═══════════════════════════════════════════════════════════════════════════
  function openPlayModal(play) {
    if (!play) return;
    const away = gameData?.teams?.away?.team || gameData?.teams?.away || {};
    const home = gameData?.teams?.home?.team || gameData?.teams?.home || {};
    const awayColor = getTeamColor(away),
      homeColor = getTeamColor(home);
    const awayAbbr = getTeamAbbr(away),
      homeAbbr = getTeamAbbr(home);
    const pm = gameData?.players || {};
    const isTop = play?.about?.isTopInning !== false;
    const tc = isTop ? awayColor : homeColor,
      ta = isTop ? awayAbbr : homeAbbr;
    const inning = play?.about?.inning,
      event = play?.result?.event || "",
      desc = play?.result?.description || "";
    const isScoring = play?.about?.isScoringPlay === true;
    const aS = play?.result?.awayScore,
      hS = play?.result?.homeScore;
    const bid = play?.matchup?.batter?.id,
      pid = play?.matchup?.pitcher?.id;
    const bi = resolvePlayer(pm, bid),
      pi = resolvePlayer(pm, pid);
    const btc = isTop ? awayColor : homeColor,
      ptc = isTop ? homeColor : awayColor;
    const playEvents = play?.playEvents || [];
    const pitches = playEvents.filter(
      (e) => e?.pitchData?.coordinates?.pX != null,
    );

    const allBs = {
      ...(liveData?.boxscore?.teams?.away?.players || {}),
      ...(liveData?.boxscore?.teams?.home?.players || {}),
    };
    const bBs = allBs[`ID${bid}`] || null,
      pBs = allBs[`ID${pid}`] || null;
    const bBat = bBs?.stats?.batting || {},
      pPit = pBs?.stats?.pitching || {};

    // ── Pitch colors (matches app's getPitchColor) ──
    function getPitchColor(cc) {
      var c = String(cc || "").toUpperCase();
      if (["X", "E", "H", "D"].indexOf(c) >= 0) return "#2196F3";
      if (["B", "*B"].indexOf(c) >= 0) return "#4CAF50";
      return "#f44336";
    }

    // ── Build pitch section ──
    var pitchSectionHtml = "";
    if (pitches.length > 0) {
      // Strike zone dimensions (matches app's StrikeZoneView)
      var chartSize = 160;
      var containerW = chartSize,
        containerH = Math.round(chartSize * 1.16); // 186
      var strikeW = Math.round(containerW * 0.52); // 83
      var strikeH = Math.round(containerH * 0.5); // 93
      var strikeLeft = Math.round((containerW - strikeW) / 2); // 39
      var strikeTop = Math.round(containerH * 0.15); // 28
      var dotSize = Math.max(14, Math.round(chartSize * 0.125)); // 20
      var dotR = dotSize / 2; // 10

      // Average strike zone top/bottom
      var avgTop =
        pitches.reduce(function (s, p) {
          return s + (p.pitchData ? p.pitchData.strikeZoneTop || 3.5 : 3.5);
        }, 0) / pitches.length;
      var avgBot =
        pitches.reduce(function (s, p) {
          return s + (p.pitchData ? p.pitchData.strikeZoneBottom || 1.5 : 1.5);
        }, 0) / pitches.length;
      var zoneHeightFt = avgTop - avgBot;
      if (zoneHeightFt <= 0) zoneHeightFt = 2;
      var PLATE_WIDTH_FT = 20 / 12; // 1.67 ft

      // Physics-based final point (matches app's getFinalPoint)
      function getFinalPoint(pitch) {
        var d = pitch.pitchData;
        if (!d || !d.coordinates) return null;
        var pt = d.plateTime;
        if (pt == null) return null;
        var c = d.coordinates;
        var x0 = c.x0,
          z0 = c.z0,
          vX0 = c.vX0,
          vY0 = c.vY0,
          vZ0 = c.vZ0,
          aX = c.aX,
          aY = c.aY,
          aZ = c.aZ;
        if (
          [x0, z0, vX0, vY0, vZ0, aX, aY, aZ].some(function (v) {
            return v == null;
          })
        )
          return null;
        var t = pt;
        return {
          x: x0 + vX0 * t + 0.5 * aX * t * t,
          y: vY0 * t + 0.5 * aY * t * t,
          z: z0 + vZ0 * t + 0.5 * aZ * t * t,
        };
      }

      // Project 3D point to strike zone 2D (matches app's projectToStrikeZone)
      function projectToStrikeZone(p) {
        if (!p) return null;
        var depthScale = 1 - (p.y / 60) * 0.5;
        var zRatio = (p.z - avgBot) / zoneHeightFt;
        var VERTICAL_TUNE = 0.6,
          Y_OFFSET = -25;
        var y =
          strikeTop +
          strikeH -
          zRatio * strikeH * VERTICAL_TUNE * depthScale +
          Y_OFFSET;
        var xRatio = p.x / (PLATE_WIDTH_FT / 2);
        var x =
          strikeLeft + strikeW / 2 + xRatio * (strikeW / 2) * 0.75 * depthScale;
        // Clamp
        x = Math.max(2, Math.min(containerW - dotSize, x - dotR));
        y = Math.max(2, Math.min(containerH - dotSize, y - dotR));
        return { x: x, y: y };
      }

      // Compute all pitch positions
      var pitchPositions = pitches.map(function (pitch) {
        var fp = getFinalPoint(pitch);
        return projectToStrikeZone(fp);
      });

      // SVG pitch dots
      var pitchDotsHtml = pitches
        .map(function (p, i) {
          var pos = pitchPositions[i];
          if (!pos) return "";
          var cc = (p.details && p.details.call && p.details.call.code) || "";
          var color = getPitchColor(cc);
          var num = i + 1;
          var cx = pos.x + dotR,
            cy = pos.y + dotR;
          return (
            '<circle cx="' +
            cx +
            '" cy="' +
            cy +
            '" r="' +
            dotR +
            '" fill="' +
            color +
            '" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/><text x="' +
            cx +
            '" y="' +
            (cy + 4.5) +
            '" text-anchor="middle" font-size="' +
            Math.max(8, Math.round(dotSize * 0.5)) +
            '" font-weight="800" fill="#fff" pointer-events="none">' +
            num +
            "</text>"
          );
        })
        .join("");

      // ── Pitch filter chips (matches app's pitchFilterOptions) ──
      var counters = { ball: 0, strike: 0, inPlay: 0, pitch: 0 };
      var filterChipsHtml =
        '<div class="sb-pm-filter-scroll"><div class="sb-pm-filter-row">';
      filterChipsHtml +=
        '<button class="sb-pm-filter-chip active" data-pitch="all"><span class="sb-pm-filter-num" style="background:var(--bg-border);color:var(--text-primary)">A</span><span class="sb-pm-filter-label">All</span></button>';
      pitches.forEach(function (p, i) {
        var cc = (p.details && p.details.call && p.details.call.code) || "";
        var color = getPitchColor(cc);
        var outcome =
          ["X", "E", "H", "D"].indexOf(String(cc).toUpperCase()) >= 0
            ? "inPlay"
            : ["B", "*B"].indexOf(String(cc).toUpperCase()) >= 0
              ? "ball"
              : ["C", "S", "F", "T", "L", "W"].indexOf(
                    String(cc).toUpperCase(),
                  ) >= 0
                ? "strike"
                : "other";
        var label;
        if (outcome === "ball") {
          counters.ball++;
          label = "Ball " + counters.ball;
        } else if (outcome === "strike") {
          counters.strike++;
          label = "Strike " + counters.strike;
        } else if (outcome === "inPlay") {
          counters.inPlay++;
          label = "In Play";
        } else {
          counters.pitch++;
          label = "Pitch " + counters.pitch;
        }
        filterChipsHtml +=
          '<button class="sb-pm-filter-chip" data-pitch="' +
          i +
          '"><span class="sb-pm-filter-num" style="background:' +
          color +
          ';color:#fff">' +
          (i + 1) +
          '</span><span class="sb-pm-filter-label">' +
          label +
          "</span></button>";
      });
      filterChipsHtml += "</div></div>";

      // ── Hit data panel (matches app) ──
      var hitEv = null;
      for (var hi = 0; hi < playEvents.length; hi++) {
        if (
          playEvents[hi] &&
          playEvents[hi].hitData &&
          playEvents[hi].hitData.launchSpeed != null
        ) {
          hitEv = playEvents[hi];
          break;
        }
      }
      var hitDataHtml = "";
      if (hitEv) {
        var hd = hitEv.hitData;
        hitDataHtml =
          '<div class="sb-pm-hitdata"><div class="sb-pm-section-title">Hit Data</div><div class="sb-pm-hitdata-row"><span>💨</span><div><div class="sb-pm-hitdata-val">' +
          Math.round(hd.launchSpeed) +
          ' mph</div><div class="sb-pm-hitdata-lbl">Speed</div></div></div><div class="sb-pm-hitdata-row"><span>📐</span><div><div class="sb-pm-hitdata-val">' +
          Math.round(hd.launchAngle) +
          '°</div><div class="sb-pm-hitdata-lbl">Angle</div></div></div><div class="sb-pm-hitdata-row"><span>📏</span><div><div class="sb-pm-hitdata-val">' +
          Math.round(hd.totalDistance) +
          ' ft</div><div class="sb-pm-hitdata-lbl">Dist</div></div></div></div>';
      }

      // ── Legend ──
      var legendHtml =
        '<div class="sb-pm-legend"><div class="sb-pm-legend-item"><span class="sb-pm-legend-dot" style="background:#4CAF50"></span><span>Ball</span></div><div class="sb-pm-legend-item"><span class="sb-pm-legend-dot" style="background:#f44336"></span><span>Strike / Foul</span></div><div class="sb-pm-legend-item"><span class="sb-pm-legend-dot" style="background:#2196F3"></span><span>In Play</span></div></div>';

      // ── Pitch text events list ──
      var pitchTextList = []
        .concat(playEvents)
        .reverse()
        .map(function (ev) {
          var hasPitch = !!ev.pitchData;
          if (!hasPitch) return "";
          var label = buildPitchText(ev, bi, pi);
          if (!label) return "";
          var speed =
            ev.pitchData && ev.pitchData.startSpeed
              ? Math.round(ev.pitchData.startSpeed) + " mph"
              : null;
          var pType =
            ev.details && ev.details.type ? ev.details.type.description : null;
          var cc =
            ev.details && ev.details.call && ev.details.call.code
              ? ev.details.call.code.toUpperCase()
              : null;
          var bc = getPitchColor(cc);
          var sub =
            hasPitch && (speed || pType)
              ? '<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">' +
                [pType, speed].filter(Boolean).join(" · ") +
                "</div>"
              : "";
          return (
            '<div class="sb-pm-pitch-bubble" style="border-left-color:' +
            bc +
            '"><div>' +
            label +
            "</div>" +
            sub +
            "</div>"
          );
        })
        .join("");

      pitchSectionHtml =
        '<div class="sb-pm-pitches"><div class="sb-pm-section-title" style="text-align:center;margin-bottom:20px">Pitch Locations</div>' +
        filterChipsHtml +
        '<div class="sb-pm-zone-row"><div class="sb-pm-strike-zone-wrap"><svg width="' +
        containerW +
        '" height="' +
        containerH +
        '" viewBox="0 0 ' +
        containerW +
        " " +
        containerH +
        '" class="sb-pm-strike-zone-svg" style="border:1.5px solid var(--bg-border);border-radius:10px;background:var(--bg-primary)">' +
        '<rect x="' +
        strikeLeft +
        '" y="' +
        strikeTop +
        '" width="' +
        strikeW +
        '" height="' +
        strikeH +
        '" fill="rgba(128,128,128,0.06)" stroke="var(--text-tertiary)" stroke-width="2" rx="3"/>' +
        '<line x1="' +
        (strikeLeft + strikeW / 3) +
        '" y1="' +
        strikeTop +
        '" x2="' +
        (strikeLeft + strikeW / 3) +
        '" y2="' +
        (strikeTop + strikeH) +
        '" stroke="var(--text-tertiary)" stroke-width="1" opacity="0.45"/>' +
        '<line x1="' +
        (strikeLeft + (strikeW * 2) / 3) +
        '" y1="' +
        strikeTop +
        '" x2="' +
        (strikeLeft + (strikeW * 2) / 3) +
        '" y2="' +
        (strikeTop + strikeH) +
        '" stroke="var(--text-tertiary)" stroke-width="1" opacity="0.45"/>' +
        '<line x1="' +
        strikeLeft +
        '" y1="' +
        (strikeTop + strikeH / 3) +
        '" x2="' +
        (strikeLeft + strikeW) +
        '" y2="' +
        (strikeTop + strikeH / 3) +
        '" stroke="var(--text-tertiary)" stroke-width="1" opacity="0.45"/>' +
        '<line x1="' +
        strikeLeft +
        '" y1="' +
        (strikeTop + (strikeH * 2) / 3) +
        '" x2="' +
        (strikeLeft + strikeW) +
        '" y2="' +
        (strikeTop + (strikeH * 2) / 3) +
        '" stroke="var(--text-tertiary)" stroke-width="1" opacity="0.45"/>' +
        pitchDotsHtml +
        "</svg></div>" +
        hitDataHtml +
        "</div>" +
        legendHtml +
        '<div class="sb-pm-pitch-list">' +
        pitchTextList +
        "</div></div>";
    }

    const batterStatsHtml = bid
      ? `<div class="sb-pm-player-stats">${[
          { l: "AB", v: bBat.atBats },
          { l: "H", v: bBat.hits },
          { l: "RBI", v: bBat.rbi },
        ]
          .map(
            (s) =>
              `<div class="sb-pm-ps-cell"><span>${s.v ?? "—"}</span><span>${s.l}</span></div>`,
          )
          .join("")}</div>`
      : "";
    const pitcherStatsHtml = pid
      ? `<div class="sb-pm-player-stats">${[
          { l: "IP", v: pPit.inningsPitched },
          { l: "K", v: pPit.strikeOuts },
          { l: "BB", v: pPit.baseOnBalls },
        ]
          .map(
            (s) =>
              `<div class="sb-pm-ps-cell"><span>${s.v ?? "—"}</span><span>${s.l}</span></div>`,
          )
          .join("")}</div>`
      : "";

    $("#sbPlayModalBody").innerHTML = `
      <div class="sb-pm-header" style="border-bottom-color:${isScoring ? tc : "var(--bg-border)"}">
        <div class="sb-pm-title-row"><div><span style="font-size:12px;font-weight:800">${isTop ? "▲" : "▼"} ${ordinal(inning)}${ta ? ` · ${ta}` : ""}</span>${event ? `<div style="font-size:20px;font-weight:800;margin-top:4px">${event}</div>` : ""}${isScoring && aS != null && hS != null ? `<div style="font-size:13px;font-weight:700;color:${tc};margin-top:4px">${awayAbbr} ${aS} – ${hS} ${homeAbbr}</div>` : ""}</div></div>
        ${desc ? `<div style="font-size:13px;color:var(--text-secondary);line-height:1.4">${desc}</div>` : ""}
      </div>
      <div class="sb-pm-matchup">
        <div class="sb-pm-matchup-player">${bid ? `<img src="${headshotUrl(bid)}" class="sb-pm-matchup-headshot" style="border-color:${btc}">` : ""}<div style="font-size:13px;font-weight:700">${shortName(bi?.fullName) || "—"}</div><div style="font-size:11px;font-weight:600;color:${btc}">Batter</div>${batterStatsHtml}</div>
        <div class="sb-pm-bases"><div class="sb-pm-base${play?.matchup?.postOnSecond ? " occupied" : ""}" style="${play?.matchup?.postOnSecond ? "background:" + tc : ""}"></div><div class="sb-pm-bases-row"><div class="sb-pm-base${play?.matchup?.postOnThird ? " occupied" : ""}" style="${play?.matchup?.postOnThird ? "background:" + tc : ""}"></div><div class="sb-pm-base${play?.matchup?.postOnFirst ? " occupied" : ""}" style="${play?.matchup?.postOnFirst ? "background:" + tc : ""}"></div></div></div>
        <div class="sb-pm-matchup-player" style="align-items:flex-end">${pid ? `<img src="${headshotUrl(pid)}" class="sb-pm-matchup-headshot" style="border-color:${ptc}">` : ""}<div style="font-size:13px;font-weight:700">${shortName(pi?.fullName) || "—"}</div><div style="font-size:11px;font-weight:600;color:${ptc}">Pitcher</div>${pitcherStatsHtml}</div>
      </div>
      ${pitchSectionHtml}`;
    $("#sbPlayModal").style.display = "flex";

    // ── Filter chip click handlers ──
    var filterChips =
      $("#sbPlayModalBody").querySelectorAll(".sb-pm-filter-chip");
    var pitchDots = $("#sbPlayModalBody").querySelectorAll(
      ".sb-pm-strike-zone-svg circle",
    );
    var pitchLabels = $("#sbPlayModalBody").querySelectorAll(
      ".sb-pm-strike-zone-svg text",
    );
    filterChips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        filterChips.forEach(function (c) {
          c.classList.remove("active");
        });
        chip.classList.add("active");
        var val = chip.dataset.pitch;
        if (val === "all") {
          pitchDots.forEach(function (d) {
            d.style.display = "";
          });
          pitchLabels.forEach(function (t) {
            t.style.display = "";
          });
        } else {
          var idx = parseInt(val);
          pitchDots.forEach(function (d, i) {
            d.style.display = i === idx ? "" : "none";
          });
          pitchLabels.forEach(function (t, i) {
            t.style.display = i === idx ? "" : "none";
          });
        }
      });
    });
  }

  function buildPitchText(ev, bi, pi) {
    const d = ev.details || {};
    const desc = d.description || "";
    const bn = shortName(bi?.fullName) || "Batter",
      pn = shortName(pi?.fullName) || "Pitcher";
    const speed = ev.pitchData?.startSpeed || null;
    const pt = d.type?.description || "";
    const balls = ev.count?.balls || "",
      strikes = ev.count?.strikes || "";
    const cc = d.call?.code ? String(d.call.code).toUpperCase() : null;
    if (cc === "F")
      return `${bn} fouls off ${speed ? Math.round(speed) + " mph " : ""}${pt} from ${pn}. Strike ${strikes}`.trim();
    if (cc === "B")
      return `${pn} throws ${speed ? Math.round(speed) + " mph " : ""}${pt}. Ball ${balls}`.trim();
    if (cc === "*B") return `Wild pitch. Ball ${balls}`.trim();
    if (cc === "C")
      return `${bn} takes strike ${strikes} looking from ${pn}`.trim();
    if (cc === "S")
      return `${bn} swings at ${speed ? Math.round(speed) + " mph " : ""}${pt} from ${pn}. Strike ${strikes}`.trim();
    if (["X", "E", "H", "D"].includes(cc || "")) return desc || "In play";
    return desc || d.event || "";
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────
  function headshotUrl(id) {
    return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`;
  }
  function resolvePlayer(pm, id) {
    if (!pm || id == null) return null;
    return pm[`ID${id}`] || pm[String(id)] || pm[id] || null;
  }
  function ordinal(n) {
    if (n === 1) return "1st";
    if (n === 2) return "2nd";
    if (n === 3) return "3rd";
    return `${n}th`;
  }
  function shortName(fn) {
    if (!fn) return "";
    const p = fn.trim().split(" ");
    if (p.length === 1) return p[0];
    return `${p[0][0]}. ${p.slice(1).join(" ")}`;
  }
  function fmtGameTime(iso) {
    if (!iso) return null;
    let s = iso;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00Z";
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) s += "Z";
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return (
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " · " +
      d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    );
  }
  function utcToEastern(iso) {
    if (!iso) return null;
    let s = iso;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00Z";
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) s += "Z";
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return (
      d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }) +
      " @ " +
      d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    );
  }
  function fmtGameDate(iso) {
    if (!iso) return "";
    let s = iso;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00Z";
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) s += "Z";
    const d = new Date(s);
    if (isNaN(d.getTime())) return "";
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
  function parseIsoDate(iso) {
    if (!iso) return null;
    let s = iso;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00Z";
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) s += "Z";
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtGameTimeOnly(iso) {
    const d = parseIsoDate(iso);
    if (!d) return "--:--";
    const parts = d
      .toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      .replace(/\u202f|\u00a0/g, " ");
    return parts.replace(/\s?(AM|PM)$/i, "");
  }
  function fmtGameAmPm(iso) {
    const d = parseIsoDate(iso);
    if (!d) return "";
    const parts = d
      .toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      .replace(/\u202f|\u00a0/g, " ");
    const m = parts.match(/(AM|PM)$/i);
    return m ? m[1].toUpperCase() : "";
  }
  function fmtDuration(mins) {
    if (mins == null) return null;
    const h = Math.floor(mins / 60),
      m = mins % 60;
    return h > 0 ? `${h}hr ${m}m` : `${m}m`;
  }

  init();
})();

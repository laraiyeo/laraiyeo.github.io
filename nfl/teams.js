const ESPN_TEAMS_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams";

// Fetch a URL as text, falling back to the r.jina.ai proxy when the direct
// request is blocked (e.g. CORS). Returns the raw JSON text.
async function fetchJsonText(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.text();
  } catch (e) {
    const res = await fetch("https://r.jina.ai/" + url);
    const text = await res.text();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    return start !== -1 && end !== -1 ? text.slice(start, end + 1) : text;
  }
}

// Teams list is static — fetch it once and reuse it for the life of the page.
let teamsCache = null;
async function fetchTeamsJson() {
  if (teamsCache) return teamsCache;
  teamsCache = JSON.parse(await fetchJsonText(ESPN_TEAMS_URL));
  return teamsCache;
}

// Convert hex color to rgba with opacity
function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Darken a hex color for gradient transitions
function darkenColor(hex, amount) {
  amount = amount || 35;
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// Build team-color gradient CSS string
function getTeamGradientStr(
  leftColor,
  rightColor,
  customBgColor,
  opacity,
  dir,
) {
  const alpha = opacity / 100;
  const darkerLeft = darkenColor(leftColor);
  const darkerRight = darkenColor(rightColor);
  const leftRgba = hexToRgba(leftColor, alpha);
  const darkerLeftRgba = hexToRgba(darkerLeft, alpha);
  const darkerRightRgba = hexToRgba(darkerRight, alpha);
  const rightRgba = hexToRgba(rightColor, alpha);
  const direction = !dir ? "to right" : "to top";
  return `linear-gradient(${direction}, ${leftRgba}, ${darkerLeftRgba}, ${customBgColor}, ${darkerRightRgba}, ${rightRgba})`;
}

// Get gradient style + data attrs as inline string
function getGradientStyleAttrs(awayColor, homeColor, dir) {
  var styles =
    typeof window !== "undefined" && window.getCustomStyles
      ? window.getCustomStyles()
      : {
          backgroundColor: "#000000",
          backgroundOpacity: 100,
          textColor: "#ffffff",
        };
  var gradient = getTeamGradientStr(
    awayColor,
    homeColor,
    styles.backgroundColor,
    styles.backgroundOpacity,
    dir,
  );
  var dirAttr = dir ? ' data-dir="1"' : "";
  return (
    'style="background:' +
    gradient +
    ";color:" +
    styles.textColor +
    ';" data-away-color="' +
    awayColor +
    '" data-home-color="' +
    homeColor +
    '"' +
    dirAttr
  );
}

function getAdjustedDateForNFL() {
  const now = new Date();
  const estNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  if (estNow.getHours() < 2) {
    estNow.setDate(estNow.getDate() - 1);
  }
  const adjustedDate =
    estNow.getFullYear() +
    String(estNow.getMonth() + 1).padStart(2, "0") +
    String(estNow.getDate()).padStart(2, "0");
  return adjustedDate;
}

function adjustTeamShortName(shortName) {
  if (shortName === "Timberwolves") return "T. Wolves";
  if (shortName === "Trail Blazers") return "T. Blazers";
  return shortName;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return hash;
}

let lastScheduleHash = null;

async function buildGameCard(game, team) {
  const logoUrl =
    team.logos?.find((logo) =>
      logo.rel.includes(["14", "19", "20"].includes(team.id) ? "dark" : "default"),
    )?.href ||
    `https://a.espncdn.com/i/teamlogos/nfl/500/${team.abbreviation.toLowerCase()}.png`;

  function getOrdinalSuffix(num) {
    if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
    switch (num % 10) {
      case 1:
        return `${num}st`;
      case 2:
        return `${num}nd`;
      case 3:
        return `${num}rd`;
      default:
        return `${num}th`;
    }
  }

  const currentPeriod = game?.competitions[0]?.status?.period
    ? `${getOrdinalSuffix(game.competitions[0].status.period)} Quarter`
    : "Unknown Period";

  if (game && game.status.type.description === "Scheduled") {
    const startTime = new Date(game.date).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const headline =
      game.competitions[0].notes?.find((note) => note.type === "event")
        ?.headline || "";

    const homeTeam =
      game.competitions[0].competitors.find((c) => c.homeAway === "home")
        ?.team || {};
    const awayTeam =
      game.competitions[0].competitors.find((c) => c.homeAway === "away")
        ?.team || {};
    const slug = game.season?.slug || "regular-season";

    const homeTeamRecord =
      slug === "post-season"
        ? game.competitions[0].competitors.find((c) => c.homeAway === "home")
            ?.record || "0-0"
        : game.competitions[0].competitors
            .find((c) => c.homeAway === "home")
            ?.records?.find((r) => r.type === "total")?.summary || "0-0";

    const awayTeamRecord =
      slug === "post-season"
        ? game.competitions[0].competitors.find((c) => c.homeAway === "away")
            ?.record || "0-0"
        : game.competitions[0].competitors
            .find((c) => c.homeAway === "away")
            ?.records?.find((r) => r.type === "total")?.summary || "0-0";

    const awayTeamShortName = adjustTeamShortName(
      awayTeam.shortDisplayName || "Unknown",
    );
    const homeTeamShortName = adjustTeamShortName(
      homeTeam.shortDisplayName || "Unknown",
    );

    const noHeadline = headline === "";

    const awayColor = awayTeam?.color ? "#" + awayTeam.color : "#000000";
    const homeColor = homeTeam?.color ? "#" + homeTeam.color : "#000000";

    return `
      <div class="game-card scheduled-game-card" ${getGradientStyleAttrs(awayColor, homeColor)}>
        ${noHeadline ? "" : `<div class="game-headline">${headline}</div><br>`}
        <div class="game-content">
          <div class="team away-team">
            <img src="${`https://a.espncdn.com/i/teamlogos/nfl/500-dark/${awayTeam?.abbreviation.toLowerCase()}.png` || ""}" alt="${awayTeam.displayName || "Unknown"}" class="card-team-logo">
            <div class="card-team-name">${awayTeamShortName}</div>
            <div class="card-team-record">${awayTeamRecord}</div>
          </div>
          <div class="game-info">
            <div class="game-status">Scheduled</div>
            <div class="game-time">${startTime}</div>
          </div>
          <div class="team home-team">
            <img src="${`https://a.espncdn.com/i/teamlogos/nfl/500-dark/${homeTeam?.abbreviation.toLowerCase()}.png` || ""}" alt="${homeTeam.displayName || "Unknown"}" class="card-team-logo">
            <div class="card-team-name">${homeTeamShortName}</div>
            <div class="card-team-record">${homeTeamRecord}</div>
          </div>
        </div>
      </div>
    `;
  } else if (game && game.status.type.description === "Final") {
    const headline =
      game.competitions[0].notes?.find((note) => note.type === "event")
        ?.headline || "";

    const homeTeam = game.competitions[0].competitors.find(
      (c) => c.homeAway === "home",
    )?.team;
    const awayTeam = game.competitions[0].competitors.find(
      (c) => c.homeAway === "away",
    )?.team;
    const homeTeamScore =
      game.competitions[0].competitors.find((c) => c.homeAway === "home")
        ?.score || "0";
    const awayTeamScore =
      game.competitions[0].competitors.find((c) => c.homeAway === "away")
        ?.score || "0";
    const slug = game.season?.slug || "regular-season";

    const homeTeamRecord =
      slug === "post-season"
        ? game.competitions[0].competitors.find((c) => c.homeAway === "home")
            ?.record || "0-0"
        : game.competitions[0].competitors
            .find((c) => c.homeAway === "home")
            ?.records?.find((r) => r.type === "total")?.summary || "0-0";

    const awayTeamRecord =
      slug === "post-season"
        ? game.competitions[0].competitors.find((c) => c.homeAway === "away")
            ?.record || "0-0"
        : game.competitions[0].competitors
            .find((c) => c.homeAway === "away")
            ?.records?.find((r) => r.type === "total")?.summary || "0-0";

    const awayTeamShortName = adjustTeamShortName(
      awayTeam?.shortDisplayName || "Unknown",
    );
    const homeTeamShortName = adjustTeamShortName(
      homeTeam?.shortDisplayName || "Unknown",
    );

    const awayColorFinal = awayTeam?.color ? "#" + awayTeam.color : "#000000";
    const homeColorFinal = homeTeam?.color ? "#" + homeTeam.color : "#000000";

    const noHeadline = headline === "";

    return `
      <div class="game-card final-game-card" ${getGradientStyleAttrs(awayColorFinal, homeColorFinal)}>
        ${noHeadline ? "" : `<div class="game-headline">${headline}</div><br>`}
        <div class="game-content">
          <div class="team away-team">
            <div class="card-score-cell">
              <span class="card-score">${awayTeamScore}</span>
              <img src="${`https://a.espncdn.com/i/teamlogos/nfl/500-dark/${awayTeam?.abbreviation.toLowerCase()}.png` || ""}" alt="${awayTeam?.displayName || "Unknown"}" class="card-score-logo">
            </div>
            <div class="card-team-name">${awayTeamShortName}</div>
            <div class="card-team-record">${awayTeamRecord}</div>
          </div>
          <div class="game-info">
            <div class="line"></div>
            <div class="game-status">Final</div>
          </div>
          <div class="team home-team">
            <div class="card-score-cell">
              <span class="card-score">${homeTeamScore}</span>
              <img src="${`https://a.espncdn.com/i/teamlogos/nfl/500-dark/${homeTeam?.abbreviation.toLowerCase()}.png` || ""}" alt="${homeTeam?.displayName || "Unknown"}" class="card-score-logo">
            </div>
            <div class="card-team-name">${homeTeamShortName}</div>
            <div class="card-team-record">${homeTeamRecord}</div>
          </div>
        </div>
      </div>
    `;
  } else if (
    game &&
    (game.status.type.description === "In Progress" ||
      game.status.type.description === "Halftime" ||
      game.status.type.description === "End of Period")
  ) {
    const headline =
      game.competitions[0].notes?.find((note) => note.type === "event")
        ?.headline || "";

    const homeTeam = game.competitions[0].competitors.find(
      (c) => c.homeAway === "home",
    )?.team;
    const awayTeam = game.competitions[0].competitors.find(
      (c) => c.homeAway === "away",
    )?.team;
    const homeTeamScore =
      game.competitions[0].competitors.find((c) => c.homeAway === "home")
        ?.score || "0";
    const awayTeamScore =
      game.competitions[0].competitors.find((c) => c.homeAway === "away")
        ?.score || "0";
    const slug = game.season?.slug || "regular-season";

    const homeTeamRecord =
      slug === "post-season"
        ? game.competitions[0].competitors.find((c) => c.homeAway === "home")
            ?.record || "0-0"
        : game.competitions[0].competitors
            .find((c) => c.homeAway === "home")
            ?.records?.find((r) => r.type === "total")?.summary || "0-0";

    const awayTeamRecord =
      slug === "post-season"
        ? game.competitions[0].competitors.find((c) => c.homeAway === "away")
            ?.record || "0-0"
        : game.competitions[0].competitors
            .find((c) => c.homeAway === "away")
            ?.records?.find((r) => r.type === "total")?.summary || "0-0";

    const awayTeamShortName = adjustTeamShortName(
      awayTeam?.shortDisplayName || "Unknown",
    );
    const homeTeamShortName = adjustTeamShortName(
      homeTeam?.shortDisplayName || "Unknown",
    );

    const clockTime = game?.competitions[0]?.status?.displayClock;
    const isHalftime =
      game?.competitions[0]?.status?.type?.description === "Halftime";
    const isEndOfPeriod =
      game?.competitions[0]?.status?.type?.description === "End of Period";
    const periodDescription = isHalftime
      ? "Halftime"
      : isEndOfPeriod
        ? `End of ${currentPeriod}`
        : currentPeriod;
    const possession = game?.competitions[0]?.situation?.possession;
    const text = game?.competitions[0]?.situation?.possessionText || "";
    const distance = game?.competitions[0]?.situation?.distance || "N/A";
    const yardLine = game?.competitions[0]?.situation?.yardLine || "N/A";
    const kickoff =
      game?.competitions[0]?.situation?.shortDownDistanceText === "1st & 10" &&
      distance === 10 &&
      (yardLine === 65 || yardLine === 35)
        ? "Kickoff"
        : game?.competitions[0]?.situation?.shortDownDistanceText || "";

    const noHeadline = headline === "";

    const awayColorLive = awayTeam?.color ? "#" + awayTeam.color : "#000000";
    const homeColorLive = homeTeam?.color ? "#" + homeTeam.color : "#000000";

    return `
      <div class="game-card in-progress-game-card" ${getGradientStyleAttrs(awayColorLive, homeColorLive)}>
        ${noHeadline ? "" : `<div class="game-headline">${headline}</div><br>`}
        <div class="game-content">
          <div class="team away-team">
            <div class="card-score-cell">
              <span class="card-score">${awayTeamScore}</span>
              <img src="${`https://a.espncdn.com/i/teamlogos/nfl/500-dark/${awayTeam?.abbreviation.toLowerCase()}.png` || ""}" alt="${awayTeam?.displayName || "Unknown"}" class="card-score-logo">
            </div>
            <div class="card-team-name">${awayTeamShortName}</div>
            <div class="card-team-record">${awayTeamRecord}</div>
          </div>
          <div class="game-info">
            <div class="game-period" style="margin-top: ${isHalftime ? "-50px" : "-10px"}">${periodDescription}</div>
            <div class="line" style="margin-top: ${isHalftime ? "5px" : "35px"}"></div>
            ${isHalftime || isEndOfPeriod ? "" : `<div class="game-status">${clockTime}</div>`}
            <div class="game-status" style="margin-top: 0px; font-size: 0.9rem;">${kickoff}</div>
            <div class="game-period" style="color: white; margin-top: -15px;">${text ? (possession === homeTeam.id ? `${text} ▶` : `◀ ${text}`) : ""}</div>
          </div>
          <div class="team home-team">
            <div class="card-score-cell">
              <span class="card-score">${homeTeamScore}</span>
              <img src="${`https://a.espncdn.com/i/teamlogos/nfl/500-dark/${homeTeam?.abbreviation.toLowerCase()}.png` || ""}" alt="${homeTeam?.displayName || "Unknown"}" class="card-score-logo">
            </div>
            <div class="card-team-name">${homeTeamShortName}</div>
            <div class="card-team-record">${homeTeamRecord}</div>
          </div>
        </div>
      </div>
    `;
  } else {
    const awayColorNone = team?.color ? "#" + team.color : "#000000";
    const dir = true;
    return `
      <div class="game-card no-game-card" ${getGradientStyleAttrs("#000000", awayColorNone, dir)}>
        <img src="${logoUrl}" alt="${team?.displayName || "Unknown"} logo" class="card-team-logo">
        <div class="no-game-text">No game scheduled <br> for today</div>
      </div>
    `;
  }
}

async function fetchAndDisplayTeams() {
  try {
    const adjustedDate = getAdjustedDateForNFL();
    const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${adjustedDate}`;

    const data = await fetchTeamsJson();

    const teams = data.sports[0].leagues[0].teams.map(
      (teamData) => teamData.team,
    );

    const scoreboardText = await fetchJsonText(SCOREBOARD_API_URL);
    const newHash = hashString(scoreboardText);

    if (newHash === lastScheduleHash) {
      console.log("No changes detected in the schedule.");
      return;
    }
    lastScheduleHash = newHash;

    const scoreboardData = JSON.parse(scoreboardText);
    const games = scoreboardData.events || [];

    const container = document.getElementById("teamsContainer");
    if (!container) {
      console.error("Error: Element with ID 'teamsContainer' not found.");
      return;
    }

    container.innerHTML = ""; // Clear any existing content

    for (const team of teams) {
      if (team.abbreviation === "TOY") {
        ("");
      } else {
        const logoUrl =
          team.logos?.find((logo) =>
            logo.rel.includes(
              ["14", "19", "20"].includes(team.id) ? "dark" : "default",
            ),
          )?.href ||
          `https://a.espncdn.com/i/teamlogos/nfl/500/${team.abbreviation.toLowerCase()}.png`;

        const teamCard = document.createElement("div");
        teamCard.className = "team-card";
        teamCard.style.backgroundColor = `#${team.color}`;

        const teamGames = games.filter((game) =>
          game.competitions[0].competitors.some(
            (competitor) => competitor.team.id === team.id,
          ),
        );

        const gameCardHtml =
          teamGames.length > 0
            ? await buildGameCard(teamGames[0], team)
            : await buildGameCard(null, team);

        teamCard.innerHTML = `
        <div class="team-header">
          <img src="${logoUrl}" alt="${team.displayName}" class="team-logo">
          <h2 class="team-name">${team.displayName}</h2>
        </div>
        <div class="team-games">${gameCardHtml}</div>
      `;

        // Add OBS link copying functionality
        teamCard.addEventListener("click", async () => {
          const styleParams = new URLSearchParams({
            team: team.abbreviation,
          });
          const url = `https://sportsheart.ca/nfl/team.html?${styleParams.toString()}`;
          try {
            await navigator.clipboard.writeText(url);
            alert(`OBS link copied for ${team.displayName}: ${url}`);
          } catch (err) {
            console.error("Failed to copy OBS link:", err);
          }
        });

        container.appendChild(teamCard);
      }
    }
  } catch (error) {
    console.error("Error fetching NFL teams or games:", error);
  }
}

fetchAndDisplayTeams();
setInterval(fetchAndDisplayTeams, 5000);

// Game Card Customization functionality
const defaultStyles = {
  backgroundColor: "#1a1a1a",
  backgroundOpacity: 100,
  textColor: "#ffffff",
};

// Load saved styles or use defaults, with URL parameters taking priority
function loadSavedStyles() {
  // Check for URL parameters first (these override localStorage)
  const urlParams = new URLSearchParams(window.location.search);
  const bgColor = urlParams.get("bgColor");
  const bgOpacity = urlParams.get("bgOpacity");
  const textColor = urlParams.get("textColor");

  // If we have URL parameters, use them
  if (bgColor || bgOpacity || textColor) {
    return {
      backgroundColor:
        bgColor && isValidHex(bgColor)
          ? bgColor
          : defaultStyles.backgroundColor,
      backgroundOpacity:
        bgOpacity !== null
          ? Math.max(0, Math.min(100, parseInt(bgOpacity)))
          : defaultStyles.backgroundOpacity,
      textColor:
        textColor && isValidHex(textColor)
          ? textColor
          : defaultStyles.textColor,
    };
  }

  // Otherwise use localStorage or defaults
  const saved = localStorage.getItem("nfl-game-card-styles");
  return saved ? JSON.parse(saved) : defaultStyles;
}

// Check if we're in URL parameter mode (styles are locked)
function isUrlParameterMode() {
  const urlParams = new URLSearchParams(window.location.search);
  return (
    urlParams.has("bgColor") ||
    urlParams.has("bgOpacity") ||
    urlParams.has("textColor")
  );
}

// Save styles to localStorage (only if not in URL parameter mode)
function saveStyles(styles) {
  if (isUrlParameterMode()) {
    return; // Don't save to localStorage when URL parameters are present
  }
  localStorage.setItem("nfl-game-card-styles", JSON.stringify(styles));
}

// Apply styles to all game cards
function applyStylesToCards(styles) {
  const gameCards = document.querySelectorAll(".game-card");
  gameCards.forEach((card) => {
    const awayColor = card.getAttribute("data-away-color") || "#000000";
    const homeColor = card.getAttribute("data-home-color") || "#000000";
    const dir = card.getAttribute("data-dir") === "1";
    const gradient = getTeamGradientStr(
      awayColor,
      homeColor,
      styles.backgroundColor,
      styles.backgroundOpacity,
      dir,
    );
    card.style.setProperty("background", gradient, "important");
    card.style.setProperty("color", styles.textColor, "important");
  });
}

// Validate hex color
function isValidHex(hex) {
  return /^#[0-9A-F]{6}$/i.test(hex);
}

// Update preview colors
function updatePreviews(styles) {
  document.getElementById("bg-preview").style.backgroundColor =
    styles.backgroundColor;
  document.getElementById("text-preview").style.backgroundColor =
    styles.textColor;
}

// Set up customization controls
function initializeCustomization() {
  const currentStyles = loadSavedStyles();
  const urlMode = isUrlParameterMode();

  // Get control elements
  const bgColorPicker = document.getElementById("bg-color-picker");
  const bgColorHex = document.getElementById("bg-color-hex");
  const bgOpacitySlider = document.getElementById("bg-opacity-slider");
  const bgOpacityInput = document.getElementById("bg-opacity-input");
  const textColorPicker = document.getElementById("text-color-picker");
  const textColorHex = document.getElementById("text-color-hex");
  const resetButton = document.getElementById("reset-styles");
  const panel = document.querySelector(".customization-panel");

  // If in URL parameter mode, disable the panel
  if (urlMode && panel) {
    panel.style.opacity = "0.5";
    panel.style.pointerEvents = "none";
    panel.title = "Customization is locked when using URL parameters";
  }

  // Set initial values
  bgColorPicker.value = currentStyles.backgroundColor;
  bgColorHex.value = currentStyles.backgroundColor;
  bgOpacitySlider.value = currentStyles.backgroundOpacity;
  bgOpacityInput.value = currentStyles.backgroundOpacity;
  textColorPicker.value = currentStyles.textColor;
  textColorHex.value = currentStyles.textColor;

  updatePreviews(currentStyles);
  applyStylesToCards(currentStyles);

  // Background color picker change
  bgColorPicker.addEventListener("change", (e) => {
    if (urlMode) return;
    const color = e.target.value;
    bgColorHex.value = color;
    currentStyles.backgroundColor = color;
    updatePreviews(currentStyles);
    applyStylesToCards(currentStyles);
    saveStyles(currentStyles);
  });

  // Background color hex input change
  bgColorHex.addEventListener("input", (e) => {
    if (urlMode) return;
    const color = e.target.value;
    if (isValidHex(color)) {
      bgColorPicker.value = color;
      currentStyles.backgroundColor = color;
      updatePreviews(currentStyles);
      applyStylesToCards(currentStyles);
      saveStyles(currentStyles);
    }
  });

  // Background opacity slider change
  bgOpacitySlider.addEventListener("input", (e) => {
    if (urlMode) return;
    const opacity = parseInt(e.target.value);
    bgOpacityInput.value = opacity;
    currentStyles.backgroundOpacity = opacity;
    applyStylesToCards(currentStyles);
    saveStyles(currentStyles);
  });

  // Background opacity input change
  bgOpacityInput.addEventListener("input", (e) => {
    if (urlMode) return;
    const opacity = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
    bgOpacitySlider.value = opacity;
    e.target.value = opacity;
    currentStyles.backgroundOpacity = opacity;
    applyStylesToCards(currentStyles);
    saveStyles(currentStyles);
  });

  // Text color picker change
  textColorPicker.addEventListener("change", (e) => {
    if (urlMode) return;
    const color = e.target.value;
    textColorHex.value = color;
    currentStyles.textColor = color;
    updatePreviews(currentStyles);
    applyStylesToCards(currentStyles);
    saveStyles(currentStyles);
  });

  // Text color hex input change
  textColorHex.addEventListener("input", (e) => {
    if (urlMode) return;
    const color = e.target.value;
    if (isValidHex(color)) {
      textColorPicker.value = color;
      currentStyles.textColor = color;
      updatePreviews(currentStyles);
      applyStylesToCards(currentStyles);
      saveStyles(currentStyles);
    }
  });

  // Reset button
  resetButton.addEventListener("click", () => {
    if (urlMode) return;
    // Reset to defaults
    bgColorPicker.value = defaultStyles.backgroundColor;
    bgColorHex.value = defaultStyles.backgroundColor;
    bgOpacitySlider.value = defaultStyles.backgroundOpacity;
    bgOpacityInput.value = defaultStyles.backgroundOpacity;
    textColorPicker.value = defaultStyles.textColor;
    textColorHex.value = defaultStyles.textColor;

    // Update current styles - use explicit assignment for immediate reactivity
    currentStyles.backgroundColor = defaultStyles.backgroundColor;
    currentStyles.backgroundOpacity = defaultStyles.backgroundOpacity;
    currentStyles.textColor = defaultStyles.textColor;

    updatePreviews(currentStyles);
    applyStylesToCards(currentStyles);
    saveStyles(currentStyles);
  });

  // Re-apply styles periodically to catch any dynamically created cards
  setInterval(() => {
    const currentStyles = loadSavedStyles();
    applyStylesToCards(currentStyles);
  }, 5000);
}

// Initialize customization after DOM is loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeCustomization);
} else {
  initializeCustomization();
}

// Make functions available globally for the team.html page
window.getCustomStyles = loadSavedStyles;
window.applyCustomStyles = applyStylesToCards;

// Auth button in the navbar
(function () {
  var c = document.getElementById("auth-button-container");
  if (c && typeof createAuthButton === "function")
    c.appendChild(createAuthButton());
})();

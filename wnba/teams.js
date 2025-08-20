const TEAMS_API_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams";

function getAdjustedDateForNBA() {
  const now = new Date();
  const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  if (estNow.getHours() < 2) {
    estNow.setDate(estNow.getDate() - 1);
  }
  const adjustedDate = estNow.getFullYear() +
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
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

let lastScheduleHash = null;
// Convert hex color to rgba with opacity
function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

async function buildGameCard(game, team) {
  const logoUrl = team?.logos?.find(logo => logo.rel.includes('primary_logo_on_black_color'))?.href || `https://a.espncdn.com/i/teamlogos/wnba/500/${team.abbreviation}.png`;

  function getOrdinalSuffix(num) {
    if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
    switch (num % 10) {
      case 1: return `${num}st`;
      case 2: return `${num}nd`;
      case 3: return `${num}rd`;
      default: return `${num}th`;
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

    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

    const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home")?.team || {};
    const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away")?.team || {};
    const slug = game.season?.slug || "regular-season";

    const homeTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "home")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "away")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "away")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamShortName = adjustTeamShortName(awayTeam.shortDisplayName || "Unknown");
    const homeTeamShortName = adjustTeamShortName(homeTeam.shortDisplayName || "Unknown");

    return `
      <div class="game-card scheduled-game-card">
        <div class="game-headline">${headline}</div>
        <div class="game-content">
          <div class="team away-team">
            <img src="${awayTeam.logo || ""}" alt="${awayTeam.displayName || "Unknown"}" class="card-team-logo">
            <div class="card-team-name">${awayTeamShortName}</div>
            <div class="card-team-record">${awayTeamRecord}</div>
          </div>
          <div class="game-info">
            <div class="game-status">Scheduled</div>
            <div class="game-time">${startTime}</div>
          </div>
          <div class="team home-team">
            <img src="${homeTeam.logo || ""}" alt="${homeTeam.displayName || "Unknown"}" class="card-team-logo">
            <div class="card-team-name">${homeTeamShortName}</div>
            <div class="card-team-record">${homeTeamRecord}</div>
          </div>
        </div>
      </div>
    `;
  } else if (game && game.status.type.description === "Final") {
    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

    const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home")?.team;
    const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away")?.team;
    const homeTeamScore = game.competitions[0].competitors.find(c => c.homeAway === "home")?.score || "0";
    const awayTeamScore = game.competitions[0].competitors.find(c => c.homeAway === "away")?.score || "0";
    const slug = game.season?.slug || "regular-season";

    const homeTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "home")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "away")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "away")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamShortName = adjustTeamShortName(awayTeam?.shortDisplayName || "Unknown");
    const homeTeamShortName = adjustTeamShortName(homeTeam?.shortDisplayName || "Unknown");

    return `
      <div class="game-card final-game-card">
        <div class="game-headline">${headline}</div>
        <div class="game-content">
          <div class="team away-team">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${awayTeam?.logo || ""}" alt="${awayTeam?.displayName || "Unknown"}" class="card-team-logo">
              <span class="card-team-score">${awayTeamScore}</span>
            </div>
            <div class="card-team-name">${awayTeamShortName}</div>
            <div class="card-team-record">${awayTeamRecord}</div>
          </div>
          <div class="game-info">
            <div class="line"></div>
            <div class="game-status">Final</div>
          </div>
          <div class="team home-team">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="card-team-score">${homeTeamScore}</span>
              <img src="${homeTeam?.logo || ""}" alt="${homeTeam?.displayName || "Unknown"}" class="card-team-logo">
            </div>
            <div class="card-team-name">${homeTeamShortName}</div>
            <div class="card-team-record">${homeTeamRecord}</div>
          </div>
        </div>
      </div>
    `;
  } else if (game && (game.status.type.description === "In Progress" || game.status.type.description === "Halftime" || game.status.type.description === "End of Period")) {
    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

    const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home")?.team;
    const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away")?.team;
    const homeTeamScore = game.competitions[0].competitors.find(c => c.homeAway === "home")?.score || "0";
    const awayTeamScore = game.competitions[0].competitors.find(c => c.homeAway === "away")?.score || "0";
    const slug = game.season?.slug || "regular-season";

    const homeTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "home")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "away")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "away")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamShortName = adjustTeamShortName(awayTeam?.shortDisplayName || "Unknown");
    const homeTeamShortName = adjustTeamShortName(homeTeam?.shortDisplayName || "Unknown");

    const clockTime = game?.competitions[0]?.status?.displayClock;
    const isHalftime = game?.competitions[0]?.status?.type?.description === "Halftime";
    const isEndOfPeriod = game?.competitions[0]?.status?.type?.description === "End of Period";
    const periodDescription = isHalftime
      ? "Halftime"
      : isEndOfPeriod
      ? `End of ${currentPeriod}`
      : currentPeriod;

    return `
      <div class="game-card in-progress-game-card">
        <div class="game-headline">${headline}</div>
        <div class="game-content">
          <div class="team away-team">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${awayTeam?.logo || ""}" alt="${awayTeam?.displayName || "Unknown"}" class="card-team-logo">
              <span class="card-team-score">${awayTeamScore}</span>
            </div>
            <div class="card-team-name">${awayTeamShortName}</div>
            <div class="card-team-record">${awayTeamRecord}</div>
          </div>
          <div class="game-info">
            <div class="line"></div>
            ${isHalftime || isEndOfPeriod ? "" : `<div class="game-status">${clockTime}</div>`}
            <div class="game-period" style="margin-top:${isHalftime || isEndOfPeriod ? "0" : "-20px"};">${periodDescription}</div>
          </div>
          <div class="team home-team">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="card-team-score">${homeTeamScore}</span>
              <img src="${homeTeam?.logo || ""}" alt="${homeTeam?.displayName || "Unknown"}" class="card-team-logo">
            </div>
            <div class="card-team-name">${homeTeamShortName}</div>
            <div class="card-team-record">${homeTeamRecord}</div>
          </div>
        </div>
      </div>
    `;
  } else {
    return `
      <div class="game-card no-game-card">
        <img src="${logoUrl}" alt="${team?.displayName || "Unknown"} logo" class="card-team-logo">
        <div class="no-game-text">No game scheduled <br> for today</div>
      </div>
    `;
  }
}

async function fetchAndDisplayTeams() {
  try {
    const adjustedDate = getAdjustedDateForNBA();
    const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${adjustedDate}`;

    const response = await fetch(TEAMS_API_URL);
    const data = await response.json();

    const teams = data.sports[0].leagues[0].teams.map(teamData => teamData.team);

    const scoreboardResponse = await fetch(SCOREBOARD_API_URL);
    const scoreboardText = await scoreboardResponse.text();
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
        ""
      } else {
      const logoUrl = team.logos?.find(logo =>
        logo.rel.includes(
          ["26"].includes(team.id) ? 'secondary_logo_on_secondary_color' : 'primary_logo_on_primary_color'
        )
      )?.href || `https://a.espncdn.com/i/teamlogos/wnba/500/${team.abbreviation}.png`;

      const teamCard = document.createElement("div");
      teamCard.className = "team-card";
      teamCard.style.backgroundColor = `#${team.color}`;

      const teamGames = games.filter(game =>
        game.competitions[0].competitors.some(competitor => competitor.team.id === team.id)
      );

      const gameCardHtml = teamGames.length > 0
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
        const currentStyles = loadSavedStyles();
        const styleParams = new URLSearchParams({
          team: team.abbreviation,
          bgColor: currentStyles.backgroundColor,
          bgOpacity: currentStyles.backgroundOpacity,
          textColor: currentStyles.textColor
        });
        const url = `https://laraiyeo.github.io/wnba/team.html?${styleParams.toString()}`;
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
    console.error("Error fetching WNBA teams or games:", error);
  }
}

fetchAndDisplayTeams();
setInterval(fetchAndDisplayTeams, 2000);

// Game Card Customization functionality
const defaultStyles = {
  backgroundColor: '#1a1a1a',
  backgroundOpacity: 100,
  textColor: '#ffffff'
};

// Load saved styles or use defaults, with URL parameters taking priority
function loadSavedStyles() {
  // Check for URL parameters first (these override localStorage)
  const urlParams = new URLSearchParams(window.location.search);
  const bgColor = urlParams.get('bgColor');
  const bgOpacity = urlParams.get('bgOpacity');
  const textColor = urlParams.get('textColor');
  
  // If we have URL parameters, use them
  if (bgColor || bgOpacity || textColor) {
    return {
      backgroundColor: bgColor && isValidHex(bgColor) ? bgColor : defaultStyles.backgroundColor,
      backgroundOpacity: bgOpacity !== null ? Math.max(0, Math.min(100, parseInt(bgOpacity))) : defaultStyles.backgroundOpacity,
      textColor: textColor && isValidHex(textColor) ? textColor : defaultStyles.textColor
    };
  }
  
  // Otherwise use localStorage or defaults
  const saved = localStorage.getItem('wnba-game-card-styles');
  return saved ? JSON.parse(saved) : defaultStyles;
}

// Check if we're in URL parameter mode (styles are locked)
function isUrlParameterMode() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has('bgColor') || urlParams.has('bgOpacity') || urlParams.has('textColor');
}

// Save styles to localStorage (only if not in URL parameter mode)
function saveStyles(styles) {
  if (isUrlParameterMode()) {
    return; // Don't save to localStorage when URL parameters are present
  }
  localStorage.setItem('wnba-game-card-styles', JSON.stringify(styles));
}

// Apply styles to all game cards
function applyStylesToCards(styles) {
  const gameCards = document.querySelectorAll('.game-card');
  gameCards.forEach(card => {
    const opacity = styles.backgroundOpacity / 100;
    const bgColor = hexToRgba(styles.backgroundColor, opacity);
    card.style.setProperty('background-color', bgColor, 'important');
    card.style.setProperty('color', styles.textColor, 'important');
    
    // Apply text color to all text elements within the card
    const textElements = card.querySelectorAll('.card-team-name, .card-team-record, .game-status, .game-time, .game-headline, .game-info, .period-info, .team-score, .no-game-text');
    textElements.forEach(element => {
      element.style.setProperty('color', styles.textColor, 'important');
    });
  });
}

// Validate hex color
function isValidHex(hex) {
  return /^#[0-9A-F]{6}$/i.test(hex);
}

// Update preview colors
function updatePreviews(styles) {
  document.getElementById('bg-preview').style.backgroundColor = styles.backgroundColor;
  document.getElementById('text-preview').style.backgroundColor = styles.textColor;
}

// Set up customization controls
function initializeCustomization() {
  const currentStyles = loadSavedStyles();
  const urlMode = isUrlParameterMode();
  
  // Get control elements
  const bgColorPicker = document.getElementById('bg-color-picker');
  const bgColorHex = document.getElementById('bg-color-hex');
  const bgOpacitySlider = document.getElementById('bg-opacity-slider');
  const bgOpacityInput = document.getElementById('bg-opacity-input');
  const textColorPicker = document.getElementById('text-color-picker');
  const textColorHex = document.getElementById('text-color-hex');
  const resetButton = document.getElementById('reset-styles');
  const panel = document.querySelector('.customization-panel');

  // If in URL parameter mode, disable the panel
  if (urlMode && panel) {
    panel.style.opacity = '0.5';
    panel.style.pointerEvents = 'none';
    panel.title = 'Customization is locked when using URL parameters';
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
  bgColorPicker.addEventListener('change', (e) => {
    if (urlMode) return;
    const color = e.target.value;
    bgColorHex.value = color;
    currentStyles.backgroundColor = color;
    updatePreviews(currentStyles);
    applyStylesToCards(currentStyles);
    saveStyles(currentStyles);
  });

  // Background color hex input change
  bgColorHex.addEventListener('input', (e) => {
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
  bgOpacitySlider.addEventListener('input', (e) => {
    if (urlMode) return;
    const opacity = parseInt(e.target.value);
    bgOpacityInput.value = opacity;
    currentStyles.backgroundOpacity = opacity;
    applyStylesToCards(currentStyles);
    saveStyles(currentStyles);
  });

  // Background opacity input change
  bgOpacityInput.addEventListener('input', (e) => {
    if (urlMode) return;
    const opacity = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
    bgOpacitySlider.value = opacity;
    e.target.value = opacity;
    currentStyles.backgroundOpacity = opacity;
    applyStylesToCards(currentStyles);
    saveStyles(currentStyles);
  });

  // Text color picker change
  textColorPicker.addEventListener('change', (e) => {
    if (urlMode) return;
    const color = e.target.value;
    textColorHex.value = color;
    currentStyles.textColor = color;
    updatePreviews(currentStyles);
    applyStylesToCards(currentStyles);
    saveStyles(currentStyles);
  });

  // Text color hex input change
  textColorHex.addEventListener('input', (e) => {
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
  resetButton.addEventListener('click', () => {
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
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeCustomization);
} else {
  initializeCustomization();
}

// Make functions available globally for the team.html page
window.getCustomStyles = loadSavedStyles;
window.applyCustomStyles = applyStylesToCards;
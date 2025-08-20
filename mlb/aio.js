const teamAbbrMap = {
  "Arizona Diamondbacks": "ari_d", "Atlanta Braves": "atl_l", "Baltimore Orioles": "bal_l", "Boston Red Sox": "bos_d",
  "Chicago White Sox": "cws_d", "Chicago Cubs": "chc_d", "Cincinnati Reds": "cin_d", "Cleveland Guardians": "cle_l",
  "Colorado Rockies": "col_d", "Detroit Tigers": "det_d", "Houston Astros": "hou_d", "Kansas City Royals": "kc_d",
  "Los Angeles Angels": "laa_d", "Los Angeles Dodgers": "lad_l", "Miami Marlins": "mia_d", "Milwaukee Brewers": "mil_d",
  "Minnesota Twins": "min_d", "New York Yankees": "nyy_d", "New York Mets": "nym_d", "Athletics": "oak_l",
  "Philadelphia Phillies": "phi_l", "Pittsburgh Pirates": "pit_d", "San Diego Padres": "sd_d", "San Francisco Giants": "sf_d",
  "Seattle Mariners": "sea_d", "St. Louis Cardinals": "stl_d", "Tampa Bay Rays": "tb_d", "Texas Rangers": "tex_d",
  "Toronto Blue Jays": "tor_l", "Washington Nationals": "wsh_d"
};

const teamColors = {
  "Arizona Diamondbacks": "#A71930", "Atlanta Braves": "#13274F", "Baltimore Orioles": "#000000", "Boston Red Sox": "#0C2340",
  "Chicago White Sox": "#000000", "Chicago Cubs": "#0E3386", "Cincinnati Reds": "#C6011F", "Cleveland Guardians": "#0F223E",
  "Colorado Rockies": "#333366", "Detroit Tigers": "#0C2340", "Houston Astros": "#002D62", "Kansas City Royals": "#004687",
  "Los Angeles Angels": "#BA0021", "Los Angeles Dodgers": "#A5ACAF", "Miami Marlins": "#00A3E0", "Milwaukee Brewers": "#FFC52F",
  "Minnesota Twins": "#002B5C", "New York Yankees": "#003087", "New York Mets": "#002D72", "Athletics": "#EFB21E",
  "Philadelphia Phillies": "#E81828", "Pittsburgh Pirates": "#27251F", "San Diego Padres": "#2F241D", "San Francisco Giants": "#000000",
  "Seattle Mariners": "#005C5C", "St. Louis Cardinals": "#C41E3A", "Tampa Bay Rays": "#092C5C", "Texas Rangers": "#003278",
  "Toronto Blue Jays": "#1D2D5C", "Washington Nationals": "#AB0003"
};

// Convert hex color to rgba with opacity
function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

async function getLogoUrl(teamName) {
  const abbr = teamAbbrMap[teamName];
  if (!abbr) return "";
  const darkUrl = `https://raw.githubusercontent.com/MLBAMGames/mlb_teams_logo_svg/main/dark/${abbr}.svg`;
  const lightUrl = `https://raw.githubusercontent.com/MLBAMGames/mlb_teams_logo_svg/main/light/${abbr}.svg`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(darkUrl);
    img.onerror = () => resolve(lightUrl);
    img.src = darkUrl;
  });
}

async function getTeamNameById(id) {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/teams/${id}`);
    const data = await res.json();
    return data.teams[0].teamName;
  } catch (err) {
    console.error("Error fetching team name for ID:", id, err);
    return "";
  }
}

function getInningLabel(inningHalf) {
  return inningHalf === "Bottom" ? "Bot" : inningHalf === "Top" ? "Top" : inningHalf;
}

function getBaseHtml(matchup) {
  const filled = {
    first: matchup?.postOnFirst?.id,
    second: matchup?.postOnSecond?.id,
    third: matchup?.postOnThird?.id,
  };

  return `
    <div class="small-base-diamond">
      <div class="small-base small-base-second ${filled.second ? "occupied" : ""}"></div>
      <div class="small-base small-base-third ${filled.third ? "occupied" : ""}"></div>
      <div class="small-base small-base-first ${filled.first ? "occupied" : ""}"></div>
    </div>
  `;
}

async function buildFinalCardContent(awayFull, awayShort, awayScore, homeFull, homeShort, homeScore) {
  const awayLogo = await getLogoUrl(awayFull);
  const homeLogo = await getLogoUrl(homeFull);
  const awayIsWinner = awayScore > homeScore;
  const homeIsWinner = homeScore > awayScore;

  return `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div style="text-align: center;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <img src="${awayLogo}" alt="${awayShort}" style="width: 45px; height: 45px;">
          <span style="font-size: 2.2rem; ${awayIsWinner ? 'font-weight: bold;' : ''}">${awayScore}</span>
        </div>
        <div style="margin-top: 6px; ${awayIsWinner ? 'font-weight: bold;' : ''}">${awayShort}</div>
      </div>
      <div style="position: absolute; left: 50%; transform: translateX(-50%); font-size: 1.4rem; font-weight: bold;">Final</div>
      <div style="text-align: center;">
        <div style="display: flex; align-items: center; gap: 8px; flex-direction: row-reverse;">
          <img src="${homeLogo}" alt="${homeShort}" style="width: 45px; height: 45px;">
          <span style="font-size: 2.2rem; ${homeIsWinner ? 'font-weight: bold;' : ''}">${homeScore}</span>
        </div>
        <div style="margin-top: 6px; ${homeIsWinner ? 'font-weight: bold;' : ''}">${homeShort}</div>
      </div>
    </div>
  `;
}

async function buildCard(game) {
  const { teams, status, gameDate } = game;
  const awayFull = teams.away.team.name;
  const homeFull = teams.home.team.name;
  const awayShort = await getTeamNameById(teams.away.team.id);
  const homeShort = await getTeamNameById(teams.home.team.id);
  const statusText = status.detailedState;
  const card = document.createElement("div");
  card.className = "game-card";

  // Apply team card styles from teams.js
  const teamCardStyles = getTeamCardStyles();
  const cardOpacity = teamCardStyles.backgroundOpacity / 100;
  const cardBgColor = hexToRgba(teamCardStyles.backgroundColor, cardOpacity);
  card.style.backgroundColor = cardBgColor;
  card.style.color = teamCardStyles.textColor;

  if (["In Progress", "Manager challenge"].includes(statusText) || status.codedGameState === "M") {
      const inningLabel = getInningLabel(game.linescore?.inningHalf) || "Inning";
      const centerText = `${inningLabel} ${game.linescore?.currentInning || ""}`.trim();
      const awayScore = teams.away.score || 0;
      const homeScore = teams.home.score || 0;
      const awayLogo = await getLogoUrl(awayFull);
      const homeLogo = await getLogoUrl(homeFull);
      const leadingAway = awayScore > homeScore;
      const leadingHome = homeScore > awayScore;
      const outs = game.linescore?.outs || 0;
    
      const gamePk = game.gamePk;
      let matchup = {};
      try {
        const res = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
        const data = await res.json();
        matchup = data?.liveData?.plays?.currentPlay?.matchup || {};
      } catch (err) {
        console.error(`Error fetching live feed for game ${gamePk}`, err);
      }
    
      const baseHtml = getBaseHtml(matchup);
    
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${awayLogo}" alt="${awayShort}" style="width: 45px; height: 45px;">
              <span style="font-size: 2rem; ${leadingAway ? 'font-weight: bold;' : ''}">${awayScore}</span>
            </div>
            <div style="margin-top: 6px; font-weight: bold;">${awayShort}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.1rem; font-weight: bold;">${centerText}</div>
            <div style="font-size: 0.85rem; margin-top: 4px;">Outs: ${outs}</div>
            ${baseHtml}
          </div>
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px; flex-direction: row-reverse;">
              <img src="${homeLogo}" alt="${homeShort}" style="width: 45px; height: 45px;">
              <span style="font-size: 2rem; ${leadingHome ? 'font-weight: bold;' : ''}">${homeScore}</span>
            </div>
            <div style="margin-top: 6px; font-weight: bold;">${homeShort}</div>
          </div>
        </div>
      `;      
  } else if (["Scheduled", "Pre-Game", "Warmup"].includes(statusText)) {
    const startTime = new Date(gameDate).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York"
    });
    const awayRecord = `${teams.away.leagueRecord.wins}-${teams.away.leagueRecord.losses}`;
    const homeRecord = `${teams.home.leagueRecord.wins}-${teams.home.leagueRecord.losses}`;
    const awayLogo = await getLogoUrl(awayFull);
    const homeLogo = await getLogoUrl(homeFull);

    card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div style="text-align: center;">
        <div style="display: flex; align-items: center; gap: 8px; flex-direction: column-reverse;">
          <img src="${awayLogo}" alt="${awayShort}" style="width: 45px; height: 45px;">
          <span style="font-size: 0.95rem;">${awayRecord}</span>
        </div>
        <div style="margin-top: 6px; font-weight: bold;">${awayShort}</div>
      </div>
      <div style="position: absolute; left: 50%; transform: translateX(-50%); font-size: 1.4rem; font-weight: bold;">${startTime}</div>
      <div style="text-align: center;">
        <div style="display: flex; align-items: center; gap: 8px; flex-direction: column-reverse;">
          <img src="${homeLogo}" alt="${homeShort}" style="width: 45px; height: 45px;">
          <span style="font-size: 0.95rem;">${homeRecord}</span>
        </div>
        <div style="margin-top: 6px; font-weight: bold;">${homeShort}</div>
      </div>
    </div>
  `;
  } else if (statusText === "Postponed") {
    const awayRecord = `${teams.away.leagueRecord.wins}-${teams.away.leagueRecord.losses}`;
    const homeRecord = `${teams.home.leagueRecord.wins}-${teams.home.leagueRecord.losses}`;
    const awayLogo = await getLogoUrl(awayFull);
    const homeLogo = await getLogoUrl(homeFull);

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px; flex-direction: column-reverse;">
            <img src="${awayLogo}" alt="${awayShort}" style="width: 45px; height: 45px;">
           <span style="font-size: 0.95rem;">${awayRecord}</span>
          </div>
          <div style="margin-top: 6px; font-weight: bold;">${awayShort}</div>
        </div>
        <div style="position: absolute; left: 50%; transform: translateX(-50%); font-size: 1.3rem; font-weight: bold;">PPD</div>
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px; flex-direction: column-reverse;">
            <img src="${homeLogo}" alt="${homeShort}" style="width: 45px; height: 45px;">
            <span style="font-size: 0.95rem;">${homeRecord}</span>
          </div>
          <div style="margin-top: 6px; font-weight: bold;">${homeShort}</div>
        </div>
      </div>
    `;
  } else if (["Final", "Game Over"].includes(statusText)) {
    card.innerHTML = await buildFinalCardContent(
      awayFull, awayShort, teams.away.score,
      homeFull, homeShort, teams.home.score
    );
  }
  
  // Add click handler to navigate to respective page
  card.addEventListener('click', () => {
    window.location.href = `scoreboard.html?gamePk=${game.gamePk}`;
  });
  
  card.style.cursor = 'pointer';
  
  return card;
}

function getAdjustedDateForMLB() {
  const now = new Date();

  const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));

  if (estNow.getHours() < 2) {
    estNow.setDate(estNow.getDate() - 1);
  }

  const adjustedDate = estNow.getFullYear() + "-" +
                       String(estNow.getMonth() + 1).padStart(2, "0") + "-" +
                       String(estNow.getDate()).padStart(2, "0");

  return adjustedDate;
}

let lastScheduleHash = null;

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

async function displayGames(games, sectionId, containerId, noGamesId) {
  const section = document.getElementById(sectionId);
  const container = document.getElementById(containerId);
  const noGamesDiv = document.getElementById(noGamesId);

  if (games.length === 0) {
    container.style.display = "none";
    noGamesDiv.style.display = "flex";
    section.style.display = "block";
    return;
  }

  container.style.display = "flex";
  noGamesDiv.style.display = "none";
  section.style.display = "block";

  // Clear existing content
  container.innerHTML = '';
  
  for (const game of games) {
    const gameCard = await buildCard(game);
    container.appendChild(gameCard);
  }
}

async function fetchAndDisplayAllGames() {
  const today = getAdjustedDateForMLB();
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=linescore,team`;

  try {
    const response = await fetch(url);
    const responseText = await response.text();
    const newHash = hashString(responseText);

    if (newHash === lastScheduleHash) {
      console.log("No changes detected in the schedule.");
      return;
    }
    lastScheduleHash = newHash;

    const data = JSON.parse(responseText);
    const games = data.dates[0]?.games || [];

    // Remove duplicates
    const seenGameIds = new Set();
    const uniqueGames = games.filter(game => {
      if (seenGameIds.has(game.gamePk)) {
        return false;
      }
      seenGameIds.add(game.gamePk);
      return true;
    });

    // Separate games by status and sort by time
    const liveGames = uniqueGames.filter(game => 
      ["In Progress", "Manager challenge"].includes(game.status.detailedState) || game.status.codedGameState === "M"
    ).sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
    
    const scheduledGames = uniqueGames.filter(game => 
      ["Scheduled", "Pre-Game", "Warmup"].includes(game.status.detailedState)
    ).sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
    
    const finishedGames = uniqueGames.filter(game => 
      ["Final", "Game Over"].includes(game.status.detailedState)
    ).sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));

    await displayGames(liveGames, 'live-section', 'liveGamesContainer', 'no-live-games');
    await displayGames(scheduledGames, 'scheduled-section', 'scheduledGamesContainer', 'no-scheduled-games');
    await displayGames(finishedGames, 'finished-section', 'finishedGamesContainer', 'no-finished-games');
  } catch (error) {
    console.error("Error fetching games:", error);
  }
}

// Initialize page
document.addEventListener("DOMContentLoaded", function() {
  fetchAndDisplayAllGames();
  setInterval(fetchAndDisplayAllGames, 2000); // Refresh every 2 seconds
  initializePageStyling();
});

// Styling functionality
const defaultTeamCardStyles = {
  backgroundColor: '#ebebeb',
  backgroundOpacity: 100,
  textColor: '#ffffff'
};

const defaultPageStyles = {
  backgroundColor: '#ebebeb',
  backgroundOpacity: 100,
  textColor: '#000000'
};

// Get team card styles from teams.js localStorage or defaults
function getTeamCardStyles() {
  const saved = localStorage.getItem('mlb-game-card-styles');
  return saved ? JSON.parse(saved) : defaultTeamCardStyles;
}

// Load page-specific styles or use defaults
function loadPageStyles() {
  const saved = localStorage.getItem('mlb-aio-page-styles');
  return saved ? JSON.parse(saved) : defaultPageStyles;
}

// Save page styles to localStorage
function savePageStyles(styles) {
  localStorage.setItem('mlb-aio-page-styles', JSON.stringify(styles));
}

// Apply page styles to background and text
function applyPageStyles(styles) {
  const body = document.body;
  const scoreboard = document.getElementById('scoreboard');
  const opacity = styles.backgroundOpacity / 100;
  const bgColor = hexToRgba(styles.backgroundColor, opacity);
  
  // Apply background to both body and scoreboard div
  body.style.backgroundColor = bgColor;
  if (scoreboard) {
    scoreboard.style.backgroundColor = bgColor;
  }
  
  body.style.color = styles.textColor;
  
  // Apply to all headers and text elements
  const textElements = document.querySelectorAll('h2, h3, .section-header, .no-games, p, span, div');
  textElements.forEach(element => {
    // Don't override game card text colors
    if (!element.closest('.game-card') && !element.closest('#styling-panel')) {
      element.style.color = styles.textColor;
    }
  });
}

// Apply team card styles to all game cards
function applyTeamCardStyles() {
  const teamCardStyles = getTeamCardStyles();
  const gameCards = document.querySelectorAll('.game-card');
  gameCards.forEach(card => {
    const opacity = teamCardStyles.backgroundOpacity / 100;
    const bgColor = hexToRgba(teamCardStyles.backgroundColor, opacity);
    card.style.setProperty('background-color', bgColor, 'important');
    card.style.setProperty('color', teamCardStyles.textColor, 'important');
  });
}

// Validate hex color
function isValidHex(hex) {
  return /^#[0-9A-F]{6}$/i.test(hex);
}

// Update preview colors
function updatePagePreviews(styles) {
  document.getElementById('page-bg-preview').style.backgroundColor = styles.backgroundColor;
  document.getElementById('page-text-preview').style.backgroundColor = styles.textColor;
}

// Toggle styling panel
function toggleStylingPanel() {
  const panel = document.getElementById('styling-panel');
  const toggle = document.getElementById('styling-toggle');
  const isExpanded = panel.style.display !== 'none';
  
  if (isExpanded) {
    panel.style.display = 'none';
    toggle.textContent = '🎨 Page Styling ▼';
  } else {
    panel.style.display = 'block';
    toggle.textContent = '🎨 Page Styling ▲';
  }
}

// Initialize page styling controls
function initializePageStyling() {
  const currentPageStyles = loadPageStyles();
  
  // Apply initial styles
  applyPageStyles(currentPageStyles);
  
  // Also apply team card styles on load
  setTimeout(() => {
    applyTeamCardStyles();
  }, 500);
  
  // Get control elements
  const bgColorPicker = document.getElementById('page-bg-color-picker');
  const bgColorHex = document.getElementById('page-bg-color-hex');
  const bgOpacitySlider = document.getElementById('page-bg-opacity-slider');
  const bgOpacityInput = document.getElementById('page-bg-opacity-input');
  const textColorPicker = document.getElementById('page-text-color-picker');
  const textColorHex = document.getElementById('page-text-color-hex');
  const resetButton = document.getElementById('reset-page-styles');
  const toggleButton = document.getElementById('styling-toggle');

  // Set initial values
  bgColorPicker.value = currentPageStyles.backgroundColor;
  bgColorHex.value = currentPageStyles.backgroundColor;
  bgOpacitySlider.value = currentPageStyles.backgroundOpacity;
  bgOpacityInput.value = currentPageStyles.backgroundOpacity;
  textColorPicker.value = currentPageStyles.textColor;
  textColorHex.value = currentPageStyles.textColor;

  updatePagePreviews(currentPageStyles);

  // Event listeners
  toggleButton.addEventListener('click', toggleStylingPanel);

  // Background color picker change
  bgColorPicker.addEventListener('change', (e) => {
    const color = e.target.value;
    bgColorHex.value = color;
    currentPageStyles.backgroundColor = color;
    updatePagePreviews(currentPageStyles);
    applyPageStyles(currentPageStyles);
    savePageStyles(currentPageStyles);
  });

  // Background color hex input change
  bgColorHex.addEventListener('input', (e) => {
    const color = e.target.value;
    if (isValidHex(color)) {
      bgColorPicker.value = color;
      currentPageStyles.backgroundColor = color;
      updatePagePreviews(currentPageStyles);
      applyPageStyles(currentPageStyles);
      savePageStyles(currentPageStyles);
    }
  });

  // Background opacity slider change
  bgOpacitySlider.addEventListener('input', (e) => {
    const opacity = parseInt(e.target.value);
    bgOpacityInput.value = opacity;
    currentPageStyles.backgroundOpacity = opacity;
    applyPageStyles(currentPageStyles);
    savePageStyles(currentPageStyles);
  });

  // Background opacity input change
  bgOpacityInput.addEventListener('input', (e) => {
    const opacity = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
    bgOpacitySlider.value = opacity;
    e.target.value = opacity;
    currentPageStyles.backgroundOpacity = opacity;
    applyPageStyles(currentPageStyles);
    savePageStyles(currentPageStyles);
  });

  // Text color picker change
  textColorPicker.addEventListener('change', (e) => {
    const color = e.target.value;
    textColorHex.value = color;
    currentPageStyles.textColor = color;
    updatePagePreviews(currentPageStyles);
    applyPageStyles(currentPageStyles);
    savePageStyles(currentPageStyles);
  });

  // Text color hex input change
  textColorHex.addEventListener('input', (e) => {
    const color = e.target.value;
    if (isValidHex(color)) {
      textColorPicker.value = color;
      currentPageStyles.textColor = color;
      updatePagePreviews(currentPageStyles);
      applyPageStyles(currentPageStyles);
      savePageStyles(currentPageStyles);
    }
  });

  // Reset button
  resetButton.addEventListener('click', () => {
    // Reset to defaults
    bgColorPicker.value = defaultPageStyles.backgroundColor;
    bgColorHex.value = defaultPageStyles.backgroundColor;
    bgOpacitySlider.value = defaultPageStyles.backgroundOpacity;
    bgOpacityInput.value = defaultPageStyles.backgroundOpacity;
    textColorPicker.value = defaultPageStyles.textColor;
    textColorHex.value = defaultPageStyles.textColor;

    // Update current styles object
    currentPageStyles.backgroundColor = defaultPageStyles.backgroundColor;
    currentPageStyles.backgroundOpacity = defaultPageStyles.backgroundOpacity;
    currentPageStyles.textColor = defaultPageStyles.textColor;
    
    updatePagePreviews(currentPageStyles);
    applyPageStyles(currentPageStyles);
    savePageStyles(currentPageStyles);
  });

  // Re-apply team card styles periodically to catch new cards
  setInterval(() => {
    applyTeamCardStyles();
  }, 3000);
}

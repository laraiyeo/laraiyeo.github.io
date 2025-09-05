let currentTeam = null;
let currentTeamId = null;
let currentLeague = "eng.1"; // Default to Premier League
let currentPage = 1;
let allRecentMatches = [];
let matchesPerPage = 3;
let currentRosterPage = 1;
let allRosterPlayers = [];
let playersPerPage = 4;
let playersForComparison = []; // Array to store players selected for comparison
let currentStatsMode = 'overall'; // Track current stats view mode: 'overall' or 'gamelog'
let selectedPlayer = null; // Currently selected player for details
let selectedPlayerPosition = null; // Store the current player's position for year changes
let teamColor = "#000000"; // Default team color, will be set dynamically

// Player-specific team information for selected season
let playerTeamForYear = null; // Player's team data for selected year
let playerTeamColor = "#000000"; // Player's team color for selected year
let playerTeamAbbr = "UNK"; // Player's team abbreviation for selected year
let playerJerseyForYear = "N/A"; // Player's jersey number for selected year
let playerPositionForYear = null; // Player's position for selected year
let playerTeamsForSeason = []; // All teams player played for in selected season

// Global variable to store all league players for league-wide comparison
let allLeaguePlayers = [];

// Simple cache to avoid redundant API calls
const dataCache = new Map();
const CACHE_DURATION = 30000; // 30 seconds

// League configurations matching search.js
const LEAGUES = {
  "Premier League": { code: "eng.1", logo: "23" },
  "La Liga": { code: "esp.1", logo: "15" },
  "Bundesliga": { code: "ger.1", logo: "10" },
  "Serie A": { code: "ita.1", logo: "12" },
  "Ligue 1": { code: "fra.1", logo: "9" },
  "MLS": { code: "usa.1", logo: "20" },
  "Saudi PL": { code: "ksa.1", logo: "21" }
};

// Competition configurations for domestic cups and other tournaments
const LEAGUE_COMPETITIONS = {
  "eng.1": [
    { code: "eng.fa", name: "FA Cup", logo: "40" },
    { code: "eng.league_cup", name: "EFL Cup", logo: "41" }
  ],
  "esp.1": [
    { code: "esp.copa_del_rey", name: "Copa del Rey", logo: "80" },
    { code: "esp.super_cup", name: "Spanish Supercopa", logo: "431" }
  ],
  "ger.1": [
    { code: "ger.dfb_pokal", name: "DFB Pokal", logo: "2061" },
    { code: "ger.super_cup", name: "German Super Cup", logo: "2315" }
  ],
  "ita.1": [
    { code: "ita.coppa_italia", name: "Coppa Italia", logo: "2192" },
    { code: "ita.super_cup", name: "Italian Supercoppa", logo: "2316" }
  ],
  "fra.1": [
    { code: "fra.coupe_de_france", name: "Coupe de France", logo: "182" },
    { code: "fra.super_cup", name: "Trophee des Champions", logo: "2345" }
  ],
  "usa.1": [
    { code: "usa.open", name: "US Open Cup", logo: "69" }
  ],
  "ksa.1": [
    { code: "ksa.kings.cup", name: "Saudi King's Cup", logo: "2490" }
  ]
};

// Convert HTTP URLs to HTTPS to avoid mixed content issues
function convertToHttps(url) {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

// Initialize the page
document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  currentTeamId = urlParams.get('teamId');
  
  if (!currentTeamId) {
    window.location.href = 'search.html';
    return;
  }
  
  // Try to determine league from localStorage or detect from team
  currentLeague = localStorage.getItem("currentLeague") || "eng.1";
  
  // Clear cached player data to ensure fresh data for comparisons
  allLeaguePlayers = [];
  
  loadTeamData();
  setupEventHandlers();
  setupNavbar();
});

function setupEventHandlers() {
  const startDatePicker = document.getElementById('startDatePicker');
  const prevPageBtn = document.getElementById('prevPage');
  const nextPageBtn = document.getElementById('nextPage');

  // Set default start date to 30 days ago
  const today = new Date();
  const defaultStartDate = new Date(today);
  defaultStartDate.setDate(today.getDate() - 30);
  startDatePicker.value = defaultStartDate.toISOString().split('T')[0];

  // Date picker change handler
  startDatePicker.addEventListener('change', () => {

    // Clear previous data and reset pagination
    allRecentMatches = [];
    currentPage = 1;
    
    // Show loading state
    const contentDiv = document.getElementById('recentMatchesContent');
    if (contentDiv) {
      contentDiv.innerHTML = '<div class="loading">Loading matches...</div>';
    }
    
    // Load new data
    loadRecentMatches();
  });

  // Pagination handlers for matches
  prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      displayRecentMatches();
    }
  });

  nextPageBtn.addEventListener('click', () => {
    const totalPages = Math.ceil(allRecentMatches.length / matchesPerPage);
    if (currentPage < totalPages) {
      currentPage++;
      displayRecentMatches();
    }
  });

  // Player details popup close on outside click
  document.addEventListener('click', (event) => {
    const playerDetailsSection = document.getElementById('playerDetailsSection');
    const playerDetailsContainer = document.querySelector('.player-details-container');
    
    if (playerDetailsSection && 
        playerDetailsSection.style.display === 'block' && 
        !playerDetailsContainer.contains(event.target)) {
      playerDetailsSection.style.display = 'none';
    }
  });
}

async function loadTeamData() {
  try {
    // Show loading indicators for all sections
    const sections = [
      'currentGameContent', 'recentMatchesContent', 'upcomingMatchesContent',
      'teamStatsContent', 'currentStandingContent', 'squadInfoContent'
    ];
    
    sections.forEach(sectionId => {
      const element = document.getElementById(sectionId);
      if (element) {
        element.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;">Loading...</div>';
      }
    });

    // Clear any existing player comparison when loading new team
    clearComparison();
    
    // Load all league players for comparison (in background)
    fetchAllSoccerPlayers().catch(console.error);
    

    const startTime = performance.now();
    
    // First, try to find the team and determine the correct league
    await findTeamInLeagues();
    
    // Load team information first (needed for other functions)
    await loadTeamInfo();
    
    // Load all other sections in parallel after team info is loaded
    await Promise.all([
      loadCurrentGame(),
      loadRecentMatches(),
      loadUpcomingMatches(),
      loadTeamStats(),
      loadCurrentStanding(),
      loadSquadInfo(),
      loadTeamNews(),
      loadTeamTransfers()
    ]);
    
    const endTime = performance.now();

  } catch (error) {
    console.error("Error loading team data:", error);
    // Show error messages in sections that failed to load
    const sections = [
      'currentGameContent', 'recentMatchesContent', 'upcomingMatchesContent',
      'teamStatsContent', 'currentStandingContent', 'squadInfoContent'
    ];
    
    sections.forEach(sectionId => {
      const element = document.getElementById(sectionId);
      if (element && element.innerHTML.includes('Loading...')) {
        element.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Error loading data</div>';
      }
    });
  }
}

async function findTeamInLeagues() {
  // Check cache first
  const cacheKey = `team-league-${currentTeamId}`;
  if (dataCache.has(cacheKey)) {
    const cached = dataCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_DURATION) {

      currentLeague = cached.league;
      localStorage.setItem("currentLeague", currentLeague);
      return;
    } else {
      dataCache.delete(cacheKey); // Remove expired cache
    }
  }

  // Try to find the team in each league to determine the correct one
  // Use parallel requests for better performance

  const leagueChecks = Object.entries(LEAGUES).map(async ([leagueName, leagueData]) => {
    try {
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueData.code}/teams`);
      const data = await response.json();
      
      const team = data.sports[0].leagues[0].teams.find(teamData => teamData.team.id === currentTeamId);
      if (team) {
        return { leagueName, leagueData, found: true };
      }
      return { leagueName, leagueData, found: false };
    } catch (error) {

      return { leagueName, leagueData, found: false };
    }
  });

  // Wait for all league checks to complete
  const results = await Promise.all(leagueChecks);
  
  // Find the first league where the team was found
  const foundLeague = results.find(result => result.found);
  
  if (foundLeague) {
    currentLeague = foundLeague.leagueData.code;
    localStorage.setItem("currentLeague", currentLeague);

    
    // Cache the result
    dataCache.set(cacheKey, {
      league: currentLeague,
      timestamp: Date.now()
    });
  } else {

  }
}

async function loadTeamInfo() {
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/teams/${currentTeamId}`);
    const data = await response.json();
    currentTeam = data.team;
    



    
    const logoUrl = getTeamLogo(currentTeam);
    
    // Get team color dynamically from API (like teams.js)
    const isUsingAlternateColor = ["ffffff", "ffee00", "ffff00", "81f733", "000000", "f7f316", "eef209", "ece83a", "1c31ce", "ffd700"].includes(currentTeam.color);
    if (currentTeam) {
      if (isUsingAlternateColor && currentTeam.alternateColor) {
        teamColor = `#${currentTeam.alternateColor}`;
      } else if (currentTeam.color) {
        teamColor = `#${currentTeam.color}`;
      }
    }
    
    // Determine text color based on the actual color being used
    const actualColorHex = isUsingAlternateColor ? currentTeam.alternateColor : currentTeam.color;
    const nameColorChange = ["ffffff", "ffee00", "ffff00", "81f733", "ffef32", "f7f316", "eef209", "ece83a", "cccccc", "e3e4ed"].includes(actualColorHex) ? "black" : "white";

    const leagueName = Object.keys(LEAGUES).find(key => LEAGUES[key].code === currentLeague);
    
    // Set the background color of the team info section
    const teamInfoSection = document.querySelector('.team-info-section');
    if (teamInfoSection) {
      teamInfoSection.style.backgroundColor = teamColor;
      teamInfoSection.style.color = nameColorChange;
    }
    
    // Apply team colors to various elements
    applyTeamColors(teamColor);
    
    document.getElementById('teamInfo').innerHTML = `
      <div class="team-header">
        <img src="${logoUrl}" alt="${currentTeam.displayName}" class="team-logo-header" onerror="this.src='soccer-ball-png-24.png';">
        <div class="team-details-header">
          <div class="team-name-header" style="color: ${nameColorChange};">${currentTeam.displayName}</div>
          <div class="team-record-header" style="color: ${nameColorChange === 'black' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)'};">${currentTeam.nickname || ''}</div>
          <div class="team-division-header" style="color: ${nameColorChange === 'black' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)'};">${currentTeam.abbreviation || currentTeam.shortDisplayName} - ${leagueName}</div>
        </div>
      </div>
    `;
    
    // Update page title
    document.title = `${currentTeam.displayName} - ${leagueName}`;
  } catch (error) {
    console.error("Error loading team info:", error);
    document.getElementById('teamInfo').innerHTML = '<div class="no-data">Error loading team information</div>';
  }
}

function getTeamLogo(team) {
  if (["367", "2950", "111"].includes(team.id)) {
    return team.logos?.find(logo => logo.rel.includes("default"))?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`;
  }
  return team.logos?.find(logo => logo.rel.includes("dark"))?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`;
}

function applyTeamColors(teamColor) {
  // Apply team color to section headers and other elements
  const style = document.createElement('style');
  style.textContent = `
    .section-card h3 {
      border-bottom-color: ${teamColor} !important;
    }
    .game-status {
      color: ${teamColor} !important;
    }
    .stat-value {
      color: ${teamColor} !important;
    }
    .standing-position {
      color: ${teamColor} !important;
    }
    .pagination-btn {
      background-color: ${teamColor} !important;
    }
    .pagination-btn:hover:not(:disabled) {
      background-color: ${teamColor}CC !important;
    }
    .pagination-btn:disabled {
      background-color: #ccc !important;
    }
    .current-game-card {
      border-color: ${teamColor} !important;
    }
    .current-game-card:hover {
      box-shadow: 0 4px 8px ${teamColor}4D !important;
    }
    .squad-member-number {
      color: ${teamColor} !important;
    }
    .news-item {
      border-left-color: ${teamColor} !important;
    }

    .page-btn {
      background: ${teamColor} !important;
    }

    .page-btn:disabled {
      background: #6c757d !important;
    }

    .transfer-item {
      border-left: 4px solid ${teamColor} !important;
    }
  `;
  document.head.appendChild(style);
}

// Helper function to get competition name from league code
function getCompetitionName(leagueCode) {
  // Check if it's the main league
  const mainLeague = Object.values(LEAGUES).find(league => league.code === leagueCode);
  if (mainLeague) {
    return Object.keys(LEAGUES).find(key => LEAGUES[key].code === leagueCode);
  }
  
  // Check domestic competitions
  for (const [mainLeagueCode, competitions] of Object.entries(LEAGUE_COMPETITIONS)) {
    const competition = competitions.find(comp => comp.code === leagueCode);
    if (competition) {
      return competition.name;
    }
  }
  
  return "Unknown Competition";
}

// Helper function to determine if a match is from a domestic cup (not main league)
function isDomesticCup(leagueCode) {
  // Check if this is NOT the main league
  const isMainLeague = Object.values(LEAGUES).some(league => league.code === leagueCode);
  return !isMainLeague;
}

// Helper function to fetch matches from all competitions (main league + domestic cups)
async function fetchMatchesFromAllCompetitions(dateRange, leagueCode = null, teamId = null) {
  const allMatches = [];
  
  // Use provided league code or fall back to current league
  const targetLeague = leagueCode || currentLeague;
  
  // Use provided team ID or fall back to current team
  const targetTeamId = teamId || currentTeamId;
  
  // Get competitions for target league
  const competitions = LEAGUE_COMPETITIONS[targetLeague] || [];
  const allCompetitionsToCheck = [
    { code: targetLeague, name: "League" }, // Main league
    ...competitions // Domestic cups
  ];
  

  
  // Create all fetch promises in parallel
  const fetchPromises = allCompetitionsToCheck.map(async (competition) => {
    try {

      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${competition.code}/scoreboard?dates=${dateRange}`);
      
      if (response.ok) {
        const data = await response.json();
        const competitionMatches = data.events?.filter(event => {
          const comp = event.competitions?.[0];
          return comp?.competitors.some(competitor => competitor.team.id === targetTeamId);
        }) || [];
        
        // Add competition information to each match
        competitionMatches.forEach(match => {
          match.competitionCode = competition.code;
          match.competitionName = getCompetitionName(competition.code);
          match.isDomesticCup = isDomesticCup(competition.code);
          match.leaguesData = data.leagues[0];
        });
        

        return competitionMatches;
      } else {

        return [];
      }
    } catch (error) {

      return [];
    }
  });
  
  // Wait for all API calls to complete
  const allResults = await Promise.all(fetchPromises);
  
  // Combine all results
  allResults.forEach(matches => {
    allMatches.push(...matches);
  });
  

  return allMatches;
}

async function loadCurrentGame() {
  try {
    const today = new Date();
    const formatDate = (date) => {
      return date.getFullYear() +
        String(date.getMonth() + 1).padStart(2, "0") +
        String(date.getDate()).padStart(2, "0");
    };
    
    const todayFormatted = formatDate(today);
    
    // Fetch from all competitions for today
    const allTodayMatches = await fetchMatchesFromAllCompetitions(todayFormatted);
    
    const contentDiv = document.getElementById('currentGameContent');
    
    // Check if there's a game today for this team
    const todayGame = allTodayMatches.find(event => {
      const competition = event.competitions?.[0];
      return competition?.competitors.some(competitor => competitor.team.id === currentTeamId);
    });
    
    if (todayGame) {
      const gameCard = await createCurrentGameCard(todayGame);
      contentDiv.innerHTML = gameCard;
      
      // Add click handler for current game
      const gameCardElement = contentDiv.querySelector('.current-game-card');
      if (gameCardElement) {
        gameCardElement.style.cursor = 'pointer';
        gameCardElement.addEventListener('click', () => {
          const gameId = gameCardElement.getAttribute('data-game-id');
          if (gameId) {
            window.location.href = `scoreboard.html?gameId=${gameId}`;
          }
        });
      }
    } else {
      // No game today, look for the next upcoming game
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 14); // Look ahead 14 days
      
      const dateRange = `${formatDate(tomorrow)}-${formatDate(endDate)}`;
      
      // Fetch from all competitions for upcoming games
      const allUpcomingMatches = await fetchMatchesFromAllCompetitions(dateRange);
      
      // Find the next scheduled game for this team
      const nextGame = allUpcomingMatches
        .filter(event => event.status.type.state === "pre")
        .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
      
      if (nextGame) {
        const gameCard = await createCurrentGameCard(nextGame);
        contentDiv.innerHTML = gameCard;
        
        // Add click handler for next game
        const gameCardElement = contentDiv.querySelector('.current-game-card');
        if (gameCardElement) {
          gameCardElement.style.cursor = 'pointer';
          gameCardElement.addEventListener('click', () => {
            const gameId = gameCardElement.getAttribute('data-game-id');
            if (gameId) {
              window.location.href = `scoreboard.html?gameId=${gameId}`;
            }
          });
        }
      } else {
        contentDiv.innerHTML = '<div class="no-data">No upcoming games found</div>';
      }
    }
  } catch (error) {
    console.error("Error loading current game:", error);
    document.getElementById('currentGameContent').innerHTML = '<div class="no-data">Error loading current game</div>';
  }
}

async function createCurrentGameCard(game) {
  const competition = game.competitions[0];
  const homeTeam = competition.competitors.find(c => c.homeAway === "home");
  const awayTeam = competition.competitors.find(c => c.homeAway === "away");
  
  const isHomeTeam = homeTeam.team.id === currentTeamId;
  const opponent = isHomeTeam ? awayTeam : homeTeam;
  const teamScore = isHomeTeam ? homeTeam.score : awayTeam.score;
  const teamSHTScore = isHomeTeam ? homeTeam.shootoutScore : awayTeam.shootoutScore;
  const opponentScore = isHomeTeam ? awayTeam.score : homeTeam.score;
  const opponentSHTScore = isHomeTeam ? awayTeam.shootoutScore : homeTeam.shootoutScore;

  const gameDate = new Date(game.date);
  const formattedDate = gameDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
  const formattedTime = gameDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });

  const round = game.isDomesticCup
    ? (game.leaguesData?.season?.type?.name || "")
    : "";

  const status = game.status.type.state;
  let statusText = "";
  let scoreDisplay = "";

  // Format scores with shootout if available (UEFA style)
  const teamS = teamSHTScore ? `${teamScore || 0}<sup>(${teamSHTScore})</sup>` : `${teamScore || 0}`;
  const opponentS = opponentSHTScore ? `${opponentScore || 0}<sup>(${opponentSHTScore})</sup>` : `${opponentScore || 0}`;

  if (status === "pre") {
    statusText = `${formattedDate} at ${formattedTime}`;
    scoreDisplay = isHomeTeam ? "vs" : "at";
  } else if (status === "post") {
    statusText = "Final";
    scoreDisplay = `${teamS} - ${opponentS}`;
  } else {
    statusText = game.status.type.shortDetail;
    scoreDisplay = `${teamS} - ${opponentS}`;
  }

  const teamLogo = getTeamLogo(currentTeam);
  const opponentLogo = getTeamLogo(opponent.team);

  // Add competition header for domestic cups
  const competitionHeader = game.isDomesticCup ? `
    <div class="competition-header" style="
      color: ${teamColor || '#000'};
      font-size: 15px;
      font-weight: bold;
      text-align: center;
      margin-bottom: 5px;
      margin-top: -7.5px;
    ">
      ${game.competitionName || 'Cup Competition'}, ${round}
    </div>
  ` : '';

  return `
    <div class="current-game-card ${game.isDomesticCup ? 'cup-match' : ''}" data-game-id="${game.id}" style="${game.isDomesticCup ? 'border-radius: 0 0 8px 8px;' : ''}">
      ${competitionHeader}
      <div class="game-status">${statusText}</div>
      <div class="game-teams">
        <div class="game-team">
          <img src="${teamLogo}" alt="${currentTeam.displayName}" class="game-team-logo" onerror="this.src='soccer-ball-png-24.png';">
          <div class="game-team-name">${currentTeam.abbreviation || currentTeam.shortDisplayName}</div>
        </div>
        <div class="game-score">${scoreDisplay}</div>
        <div class="game-team">
          <img src="${opponentLogo}" alt="${opponent.team.displayName}" class="game-team-logo" onerror="this.src='soccer-ball-png-24.png';">
          <div class="game-team-name">${opponent.team.abbreviation || opponent.team.shortDisplayName}</div>
        </div>
      </div>
      <div class="game-info">${isHomeTeam ? 'Home' : 'Away'} Game</div>
    </div>
  `;
}

async function loadRecentMatches() {
  try {
    const startDatePicker = document.getElementById('startDatePicker');
    const today = new Date();
    const startDate = startDatePicker ? new Date(startDatePicker.value) : new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Format dates for Soccer API
    const formatDate = (date) => {
      return date.getFullYear() +
        String(date.getMonth() + 1).padStart(2, "0") +
        String(date.getDate()).padStart(2, "0");
    };
    
    const dateRange = `${formatDate(startDate)}-${formatDate(today)}`;
    
    // Check cache for recent matches
    const cacheKey = `recent-matches-${currentTeamId}-${dateRange}`;
    if (dataCache.has(cacheKey)) {
      const cached = dataCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_DURATION) {

        allRecentMatches = cached.matches;
        currentPage = 1;
        displayRecentMatches();
        return;
      } else {
        dataCache.delete(cacheKey); // Remove expired cache
      }
    }
    
    // Fetch from all competitions (main league + domestic cups)
    const allGames = await fetchMatchesFromAllCompetitions(dateRange);
    
    allRecentMatches = allGames
      .filter(game => game.status.type.state === "post")
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Cache the results
    dataCache.set(cacheKey, {
      matches: allRecentMatches,
      timestamp: Date.now()
    });
    
    // Reset to first page and immediately display
    currentPage = 1;
    

    
    displayRecentMatches();
  } catch (error) {
    console.error("Error loading recent matches:", error);
    document.getElementById('recentMatchesContent').innerHTML = '<div class="no-data">Error loading recent matches</div>';
  }
}

function displayRecentMatches() {
  const contentDiv = document.getElementById('recentMatchesContent');
  
  if (!allRecentMatches || allRecentMatches.length === 0) {
    contentDiv.innerHTML = '<div class="no-data">No recent matches found for the selected date range</div>';
    updatePaginationControls(0);
    return;
  }
  
  // Calculate pagination
  const totalPages = Math.ceil(allRecentMatches.length / matchesPerPage);
  
  // Ensure currentPage is within valid range
  if (currentPage > totalPages) {
    currentPage = totalPages;
  }
  if (currentPage < 1) {
    currentPage = 1;
  }
  

  
  const startIndex = (currentPage - 1) * matchesPerPage;
  const endIndex = startIndex + matchesPerPage;
  const paginatedMatches = allRecentMatches.slice(startIndex, endIndex);
  
  // Create match cards
  Promise.all(paginatedMatches.map(game => createMatchCard(game, true)))
    .then(matchCards => {
      contentDiv.innerHTML = `<div class="match-list">${matchCards.join('')}</div>`;
      
      // Add click handlers
      contentDiv.querySelectorAll('.match-item').forEach(item => {
        item.addEventListener('click', () => {
          const gameId = item.getAttribute('data-game-id');
          if (gameId) {
            window.location.href = `scoreboard.html?gameId=${gameId}`;
          }
        });
      });
      
      updatePaginationControls(totalPages);
    });
}

function updatePaginationControls(totalPages) {
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  const pageInfo = document.getElementById('pageInfo');
  
  if (prevBtn && nextBtn && pageInfo) {
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages || totalPages === 0;
    
    if (totalPages === 0) {
      pageInfo.textContent = '';
    } else {
      pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    }
  }
}

async function createMatchCard(game, isRecent = false) {
  const competition = game.competitions[0];
  const homeTeam = competition.competitors.find(c => c.homeAway === "home");
  const awayTeam = competition.competitors.find(c => c.homeAway === "away");
  
  const isHomeTeam = homeTeam.team.id === currentTeamId;
  const opponent = isHomeTeam ? awayTeam : homeTeam;
  const currentTeamData = isHomeTeam ? homeTeam : awayTeam;
  const teamScore = parseInt(isHomeTeam ? homeTeam.score : awayTeam.score) || 0;
  const teamSHTScore = parseInt(isHomeTeam ? homeTeam.shootoutScore : awayTeam.shootoutScore) || 0;
  const opponentScore = parseInt(isHomeTeam ? awayTeam.score : homeTeam.score) || 0;
  const opponentSHTScore = parseInt(isHomeTeam ? awayTeam.shootoutScore : homeTeam.shootoutScore) || 0;

  const gameDate = new Date(game.date);
  const formattedDate = gameDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });

    const round = game.isDomesticCup
    ? (game.leaguesData?.season?.type?.name || "")
    : "";

  // Try to get team logo from the loaded team data, fallback to ESPN CDN with team logos format
  const teamLogo = currentTeam && currentTeam.logos ? getTeamLogo(currentTeam) : 
    `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/${currentTeamId}.png&h=200&w=200`;
  
  // For opponent, use the same approach with team logos format
  const opponentLogo = opponent.team.logos ? getTeamLogo(opponent.team) : 
    `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/${opponent.team.id}.png&h=200&w=200`;

  let resultClass = "";
  let resultText = "";

  // Format scores with shootout if available (UEFA style)
  const teamS = teamSHTScore ? `${teamScore}<sup>(${teamSHTScore})</sup>` : `${teamScore}`;
  const opponentS = opponentSHTScore ? `${opponentScore}<sup>(${opponentSHTScore})</sup>` : `${opponentScore}`;

  if (game.status.type.state === "post") {
    // Determine winner considering shootout scores
    const teamFinalScore = teamSHTScore || teamScore;
    const opponentFinalScore = opponentSHTScore || opponentScore;
    
    if (teamFinalScore > opponentFinalScore) {
      resultClass = "win";
      resultText = `W ${teamS}-${opponentS}`;
    } else if (teamFinalScore < opponentFinalScore) {
      resultClass = "loss";
      resultText = `L ${teamS}-${opponentS}`;
    } else {
      resultClass = "draw";
      resultText = `D ${teamS}-${opponentS}`;
    }
  } else {
    resultClass = "scheduled";
    resultText = isHomeTeam ? "vs" : "at";
  }

  // Add competition header for domestic cups
  const competitionHeader = game.isDomesticCup ? `
    <div class="competition-header" style="
      color: ${teamColor || '#000'};
      font-size: 15px;
      font-weight: bold;
      text-align: center;
      margin-bottom: 5px;
      margin-top: -7.5px;
    ">
      ${game.competitionName || 'Cup Competition'}, ${round}
    </div>
  ` : '';

  return `
    <div class="match-item ${game.isDomesticCup ? 'cup-match' : ''}" data-game-id="${game.id}" style="${game.isDomesticCup ? 'border-radius: 0 0 8px 8px;' : ''}">
      ${competitionHeader}
      <div class="match-teams">
        <div class="match-team-info">
          <img src="${teamLogo}" alt="${currentTeamData.team.abbreviation}" class="match-team-logo" onerror="this.src='soccer-ball-png-24.png';">
          <div class="match-team-name">${currentTeamData.team.abbreviation || currentTeamData.team.shortDisplayName}</div>
        </div>
        <div class="match-result ${resultClass}">${resultText}</div>
        <div class="match-team-info">
          <div class="match-team-name">${opponent.team.abbreviation || opponent.team.shortDisplayName}</div>
          <img src="${opponentLogo}" alt="${opponent.team.abbreviation}" class="match-team-logo" onerror="this.src='soccer-ball-png-24.png';">
        </div>
      </div>
      <div class="match-date">${formattedDate}</div>
    </div>
  `;
}

async function loadUpcomingMatches() {
  try {
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + 30); // Look ahead 30 days
    
    const formatDate = (date) => {
      return date.getFullYear() +
        String(date.getMonth() + 1).padStart(2, "0") +
        String(date.getDate()).padStart(2, "0");
    };
    
    const dateRange = `${formatDate(today)}-${formatDate(endDate)}`;
    
    // Fetch from all competitions (main league + domestic cups)
    const allMatches = await fetchMatchesFromAllCompetitions(dateRange);
    
    const upcomingGames = allMatches
      .filter(event => event.status.type.state === "pre")
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 3); // Next 3 matches

    const contentDiv = document.getElementById('upcomingMatchesContent');
    
    if (!upcomingGames || upcomingGames.length === 0) {
      contentDiv.innerHTML = '<div class="no-data">No upcoming matches found</div>';
      return;
    }
    
    const matchCards = await Promise.all(upcomingGames.map(game => createMatchCard(game, false)));
    contentDiv.innerHTML = `<div class="match-list">${matchCards.join('')}</div>`;
    
    // Add click handlers
    contentDiv.querySelectorAll('.match-item').forEach(item => {
      item.addEventListener('click', () => {
        const gameId = item.getAttribute('data-game-id');
        if (gameId) {
          window.location.href = `scoreboard.html?gameId=${gameId}`;
        }
      });
    });
  } catch (error) {
    console.error("Error loading upcoming matches:", error);
    document.getElementById('upcomingMatchesContent').innerHTML = '<div class="no-data">Error loading upcoming matches</div>';
  }
}

async function loadTeamStats() {
  try {
    const contentDiv = document.getElementById('teamStatsContent');
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/teams/${currentTeamId}`);
    const data = await response.json();

    currentTeam = data.team.record;
    
    contentDiv.innerHTML = `
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-label">Games Played</div>
          <div class="stat-value">${currentTeam.items[0].stats?.find(s => s.name === 'gamesPlayed')?.value}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Points</div>
          <div class="stat-value">${currentTeam.items[0].stats?.find(s => s.name === 'points')?.value}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Away Games Played</div>
          <div class="stat-value">${currentTeam.items[0].stats?.find(s => s.name === 'awayGamesPlayed')?.value}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Away Games Record</div>
          <div class="stat-value">${currentTeam.items[0].stats?.find(s => s.name === 'awayWins')?.value}-${currentTeam.items[0].stats?.find(s => s.name === 'awayTies')?.value}-${currentTeam.items[0].stats?.find(s => s.name === 'awayLosses')?.value}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Home Games Played</div>
          <div class="stat-value">${currentTeam.items[0].stats?.find(s => s.name === 'homeGamesPlayed')?.value}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Home Games Record</div>
          <div class="stat-value">${currentTeam.items[0].stats?.find(s => s.name === 'homeWins')?.value}-${currentTeam.items[0].stats?.find(s => s.name === 'homeTies')?.value}-${currentTeam.items[0].stats?.find(s => s.name === 'homeLosses')?.value}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Goals Per Game</div>
          <div class="stat-value">${currentTeam.items[0].stats?.find(s => s.name === 'ppg')?.value}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Rank Change</div>
          <div class="stat-value">${currentTeam.items[0].stats?.find(s => s.name === 'rankChange')?.value}</div>
        </div>
    `;
  } catch (error) {
    console.error("Error loading team stats:", error);
    document.getElementById('teamStatsContent').innerHTML = '<div class="no-data">No data available</div>';
  }
}

async function loadCurrentStanding() {
  try {
    // Use the same API as standings.js for better compatibility
    const response = await fetch(`https://cdn.espn.com/core/soccer/table?xhr=1&league=${currentLeague}`);
    const data = await response.json();
    
    const contentDiv = document.getElementById('currentStandingContent');
    
    if (!data.content?.standings?.groups?.[0]?.standings?.entries) {
      contentDiv.innerHTML = '<div class="no-data">No standings data available</div>';
      return;
    }
    
    const standings = data.content.standings.groups[0].standings.entries;
    
    // Find our team in the standings
    const currentTeamEntry = standings.find(entry => entry.team.id === currentTeamId);
    
    if (!currentTeamEntry) {
      contentDiv.innerHTML = '<div class="no-data">Team not found in standings</div>';
      return;
    }
    
    // Add ordinal suffix
      const getOrdinalSuffix = (num) => {
        const j = num % 10;
        const k = num % 100;
        if (j === 1 && k !== 11) return num + "st";
        if (j === 2 && k !== 12) return num + "nd";
        if (j === 3 && k !== 13) return num + "rd";
        return num + "th";
      };

    const stats = currentTeamEntry.stats;
    const position = currentTeamEntry.team.rank || currentTeamEntry.position || '?';
    const gamesPlayed = stats.find(s => s.name === 'gamesPlayed')?.displayValue || '0';
    const wins = stats.find(s => s.name === 'wins')?.displayValue || '0';
    const draws = stats.find(s => s.name === 'ties')?.displayValue || '0';
    const losses = stats.find(s => s.name === 'losses')?.displayValue || '0';
    const points = stats.find(s => s.name === 'points')?.displayValue || '0';
    const goalDiff = stats.find(s => s.name === 'pointDifferential')?.displayValue || '0';
    
    const leagueName = Object.keys(LEAGUES).find(key => LEAGUES[key].code === currentLeague);
    
    contentDiv.innerHTML = `
      <div class="standing-info">
        <div class="standing-position">${getOrdinalSuffix(position)}</div>
        <div class="standing-details">
          <strong>${leagueName}</strong><br><br>
          Record: ${wins}-${draws}-${losses}<br><br>
          Points: ${points} (${gamesPlayed} GP)<br><br>
          Goal Diff: ${goalDiff}
        </div>
      </div>
    `;
  } catch (error) {
    console.error("Error loading standings:", error);
    document.getElementById('currentStandingContent').innerHTML = '<div class="no-data">Error loading standings</div>';
  }
}

async function loadSquadInfo() {
  try {
    await loadTeamInfo(); // Ensure team info is loaded first
    
    // Try to load roster data starting with current year, fallback to previous year
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    
    let data = null;
    let seasonUsed = currentYear;
    
    // First try current year

    let response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/teams/${currentTeamId}/roster?season=${currentYear}`);
    
    if (response.ok) {
      const responseData = await response.json();
      if (responseData.athletes && responseData.athletes.length > 0) {
        data = responseData;

      } else {

      }
    }
    
    // If current year failed or returned empty, try previous year
    if (!data || !data.athletes || data.athletes.length === 0) {

      response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/teams/${currentTeamId}/roster?season=${previousYear}`);
      
      if (response.ok) {
        const responseData = await response.json();
        if (responseData.athletes && responseData.athletes.length > 0) {
          data = responseData;
          seasonUsed = previousYear;

        }
      }
    }
    
    const contentDiv = document.getElementById('squadInfoContent');
    
    if (!data || !data.athletes || data.athletes.length === 0) {
      contentDiv.innerHTML = '<div class="no-data">No squad information available</div>';
      return;
    }

    // Store squad data for pagination
    allRosterPlayers = data.athletes.map(athlete => {
      const player = athlete.athlete || athlete;
      
      let firstName, lastName;

      // If firstName has a space, split it into the initial and the second part as the last name
      if (player.firstName && player.firstName.includes(' ')) {
        const nameParts = player.firstName.split(' ');
        firstName = nameParts[0]; // Initial of the first part
        lastName = nameParts.slice(1).join(' ');  // The rest is treated as the last name
      } else {
        firstName = player.firstName || "Unknown";
        // Only use lastName if it exists and is different from firstName
        lastName = (player.lastName && player.lastName !== player.firstName) ? player.lastName : "";
      }

      return {
        id: player.id,
        fullName: player.fullName || player.displayName || player.name || 'Unknown Player',
        firstName: firstName,
        lastName: lastName,
        position: player.position?.abbreviation || player.position?.name || 'N/A',
        jersey: player.jersey || player.number || 'N/A',
        teamAbbr: currentTeam?.abbreviation || currentTeam?.shortDisplayName || 'UNK',
        teamId: currentTeamId, // Add team ID for current team players
        league: currentLeague,
        season: seasonUsed, // Add the season that was successfully used
        // Store the complete player data including statistics for later use
        fullPlayerData: player,
        statistics: player.statistics || null
      };
    });

    // Sort players by jersey number
    allRosterPlayers.sort((a, b) => {
      const numA = parseInt(a.jersey) || 999;
      const numB = parseInt(b.jersey) || 999;
      return numA - numB;
    });



    currentRosterPage = 1;
    displayRosterPlayers();
  } catch (error) {
    console.error("Error loading squad info:", error);
    document.getElementById('squadInfoContent').innerHTML = '<div class="no-data">Squad information not available</div>';
  }
}

function displayRosterPlayers() {
  const contentDiv = document.getElementById('squadInfoContent');
  
  if (allRosterPlayers.length === 0) {

    contentDiv.innerHTML = '<div class="no-data">No players found</div>';
    return;
  }
  
  // Calculate pagination
  const totalPages = Math.ceil(allRosterPlayers.length / playersPerPage);
  const startIndex = (currentRosterPage - 1) * playersPerPage;
  const endIndex = startIndex + playersPerPage;
  const paginatedPlayers = allRosterPlayers.slice(startIndex, endIndex);
  
  const playerCards = paginatedPlayers.map(player => {
    const position = player.position || "N/A";
    const jerseyNumber = player.jersey || "N/A";
    const firstName = player.firstName || "Unknown";
    const lastName = player.lastName || "";
    
    return `
      <div class="player-card" data-player-id="${player.id}" onclick="showPlayerDetails('${player.id}', '${firstName}', '${lastName}', '${jerseyNumber}', '${position}')">
        <div class="player-name-column">
          <div class="player-first-name">${firstName}</div>
          <div class="player-last-name">${lastName}</div>
        </div>
        <div class="player-number">#${jerseyNumber}</div>
        <div class="player-position">${position}</div>
      </div>
    `;
  }).join('');
  
  // Create comparison status display like MLB
  const comparisonStatus = playersForComparison.length > 0 ? 
    `<div class="comparison-status">
      <strong>Selected for comparison:</strong> 
      ${playersForComparison.map(p => p.name).join(', ')}
      ${playersForComparison.length === 2 ? 
        ' <button onclick="showPlayerComparison(playersForComparison[0], playersForComparison[1])" class="compare-btn">Compare Now</button>' : 
        ' (Select another player to compare)'
      }
      <button onclick="clearComparison()" class="clear-btn">Clear</button>
    </div>` : '';

  // Create season information display
  const seasonUsed = allRosterPlayers.length > 0 ? allRosterPlayers[0].seasonUsed : null;
  const seasonInfo = seasonUsed ? 
    `<div class="season-info">
      <strong>Season:</strong> ${seasonUsed}
    </div>` : '';

  contentDiv.innerHTML = `
    ${comparisonStatus}
    ${seasonInfo}
    <div class="roster-list">
      ${playerCards}
    </div>
    <div class="roster-pagination">
      <button id="prevRosterPage" class="pagination-btn" ${currentRosterPage <= 1 ? 'disabled' : ''}>
        Prev
      </button>
      <span class="page-info">Page ${currentRosterPage} of ${totalPages}</span>
      <button id="nextRosterPage" class="pagination-btn" ${currentRosterPage >= totalPages ? 'disabled' : ''}>
        Next
      </button>
    </div>
  `;
  
  // Add pagination handlers
  const prevRosterBtn = document.getElementById('prevRosterPage');
  const nextRosterBtn = document.getElementById('nextRosterPage');
  
  if (prevRosterBtn) {
    prevRosterBtn.addEventListener('click', () => {
      if (currentRosterPage > 1) {
        currentRosterPage--;
        displayRosterPlayers();
      }
    });
  }
  
  if (nextRosterBtn) {
    nextRosterBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(allRosterPlayers.length / playersPerPage);
      if (currentRosterPage < totalPages) {
        currentRosterPage++;
        displayRosterPlayers();
      }
    });
  }
}

// Load Team News Section
async function loadTeamNews() {
  const newsSection = document.getElementById('teamNewsContent');
  if (!newsSection) return;
  
  try {
    // Show loading state
    newsSection.innerHTML = '<div class="loading">Loading news...</div>';
    
    // Ensure we have team data
    if (!currentTeamId || !currentLeague) {
      newsSection.innerHTML = '<div class="no-news">Team information not available</div>';
      return;
    }
    
    // Fetch news from ESPN API with team filter
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/news?team=${currentTeamId}&limit=20`);
    const newsData = await response.json();
    
    if (!newsData.articles || newsData.articles.length === 0) {
      newsSection.innerHTML = '<div class="no-news">No news available for this team</div>';
      return;
    }

    // Setup pagination - 3 articles per page
    const articlesPerPage = 3;
    const totalPages = Math.ceil(newsData.articles.length / articlesPerPage);
    
    let currentPage = 1;
    
    function renderNewsPage(page) {
      const startIndex = (page - 1) * articlesPerPage;
      const endIndex = Math.min(startIndex + articlesPerPage, newsData.articles.length);
      const pageArticles = newsData.articles.slice(startIndex, endIndex);
      
      const newsHTML = pageArticles.map(article => {
        // Format date
        const publishDate = new Date(article.published).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        // Get team logo
        const teamLogo = currentTeamId ? 
          `<img src="https://a.espncdn.com/i/teamlogos/soccer/500/${currentTeamId}.png" alt="${currentTeam?.name || 'Team'}" class="news-team-logo" onerror="this.style.display='none'">` : '';
        
        return `
          <div class="news-item">
            <div class="news-header">
              ${teamLogo}
              <div class="news-meta">
                <span class="news-date">${publishDate}</span>
              </div>
            </div>
            <h4 class="news-headline">${article.headline}</h4>
            <p class="news-description">${article.description || ''}</p>
            ${article.links && article.links.web ? `<a href="${article.links.web.href}" target="_blank" class="news-link">Read more</a>` : ''}
          </div>
        `;
      }).join('');
      
      return newsHTML;
    }
    
    function renderNewsPagination() {
      if (totalPages <= 1) return '';
      
      return `
        <div class="news-pagination">
          <button class="page-btn prev-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changeTeamNewsPage(${currentPage - 1})">‹</button>
          <span class="page-info">Page ${currentPage} of ${totalPages}</span>
          <button class="page-btn next-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changeTeamNewsPage(${currentPage + 1})">›</button>
        </div>
      `;
    }
    
    function updateNewsDisplay() {
      const newsHTML = renderNewsPage(currentPage);
      const paginationHTML = renderNewsPagination();
      
      newsSection.innerHTML = `
        <div class="news-container">
          <div class="news-list">
            ${newsHTML}
          </div>
          ${paginationHTML}
        </div>
      `;
    }
    
    // Make page change function globally accessible
    window.changeTeamNewsPage = function(page) {
      if (page < 1 || page > totalPages) return;
      currentPage = page;
      updateNewsDisplay();
    };
    
    // Initial render
    updateNewsDisplay();
    
  } catch (error) {
    console.error('Error loading team news:', error);
    newsSection.innerHTML = '<div class="error">Failed to load news</div>';
  }
}

// Load Team Transfers Section
async function loadTeamTransfers() {
  const transfersSection = document.getElementById('teamTransfersContent');
  if (!transfersSection) return;
  
  try {
    // Show loading state
    transfersSection.innerHTML = '<div class="loading">Loading transfers...</div>';
    
    // Ensure we have team data
    if (!currentTeamId || !currentLeague) {
      transfersSection.innerHTML = '<div class="no-transfers">Team information not available</div>';
      return;
    }
    
    // Get current year for the API call
    const currentYear = new Date().getFullYear();
    
    // Fetch transfers directly for this team using the simpler endpoint
    const response = await fetch(convertToHttps(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${currentLeague}/seasons/${currentYear}/teams/${currentTeamId}/transactions?limit=1000`));
    const transfersData = await response.json();
    
    if (!transfersData.items || transfersData.items.length === 0) {
      transfersSection.innerHTML = '<div class="no-transfers">No transfers available for this team</div>';
      return;
    }
    
    // Process transfers for this team
    const teamTransfers = [];
    
    for (const transferData of transfersData.items) {
      try {
        // Fetch additional data for from/to teams and athlete
        const dataPromises = [];
        
        if (transferData.from?.$ref) {
          dataPromises.push(
            fetch(convertToHttps(transferData.from.$ref))
              .then(response => response.ok ? response.json() : null)
              .then(data => ({ type: 'from', data }))
              .catch(() => ({ type: 'from', data: null }))
          );
        }
        
        if (transferData.to?.$ref) {
          dataPromises.push(
            fetch(convertToHttps(transferData.to.$ref))
              .then(response => response.ok ? response.json() : null)
              .then(data => ({ type: 'to', data }))
              .catch(() => ({ type: 'to', data: null }))
          );
        }
        
        if (transferData.athlete?.$ref) {
          dataPromises.push(
            fetch(convertToHttps(transferData.athlete.$ref))
              .then(response => response.ok ? response.json() : null)
              .then(data => ({ type: 'athlete', data }))
              .catch(() => ({ type: 'athlete', data: null }))
          );
        }
        
        // Wait for all data to load
        const results = await Promise.all(dataPromises);
        
        // Parse results
        let athlete = null;
        let fromTeam = null;
        let toTeam = null;
        
        for (const result of results) {
          if (result.type === 'from' && result.data) fromTeam = result.data;
          if (result.type === 'to' && result.data) toTeam = result.data;
          if (result.type === 'athlete' && result.data) athlete = result.data;
        }
        
        // Only add transfer if we have athlete data
        if (athlete) {
          teamTransfers.push({
            ...transferData,
            athlete: athlete,
            fromTeam: fromTeam,
            toTeam: toTeam,
            date: new Date(transferData.date)
          });
        }
        
      } catch (error) {
        console.error('Error processing transfer:', error);
        continue;
      }
    }
    
    // Sort by date (most recent first)
    teamTransfers.sort((a, b) => b.date - a.date);
    
    if (teamTransfers.length === 0) {
      transfersSection.innerHTML = '<div class="no-transfers">No transfers found for this team</div>';
      return;
    }

    // Setup pagination - 6 transfers per page
    const transfersPerPage = 6;
    const totalPages = Math.ceil(teamTransfers.length / transfersPerPage);
    
    let currentPage = 1;
    
    function renderTransfersPage(page) {
      const startIndex = (page - 1) * transfersPerPage;
      const endIndex = Math.min(startIndex + transfersPerPage, teamTransfers.length);
      const pageTransfers = teamTransfers.slice(startIndex, endIndex);
      
      const transfersHTML = pageTransfers.map(transfer => {
        // Determine transfer direction and colors
        const isFromCurrentTeam = transfer.fromTeam && transfer.fromTeam.id == currentTeamId;
        const isToCurrentTeam = transfer.toTeam && transfer.toTeam.id == currentTeamId;
        
        // Color coding based on transfer type and direction
        let typeColor = '#666'; // Default grey
        if (transfer.type === 'Loan') {
          typeColor = isFromCurrentTeam ? '#e74c3c' : '#27ae60'; // Red for outgoing loan, green for incoming
        } else if (transfer.type === 'Fee') {
          typeColor = isFromCurrentTeam ? '#27ae60' : '#e74c3c'; // Green for outgoing fee (income), red for incoming fee (expense)
        }
        
        // Format amount
        let amountText = '';
        if (transfer.amount && transfer.currency) {
          const currencySign = transfer.currency.sign || transfer.currency.abbreviation || '';
          amountText = `- ${currencySign}${transfer.amount.toLocaleString()}`;
        } else {
          amountText = '';
        }
        
        // Format date
        const transferDate = transfer.date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        
        // Team logos
        const fromLogo = transfer.fromTeam ? 
          `<img src="https://a.espncdn.com/i/teamlogos/soccer/500/${transfer.fromTeam.id}.png" alt="${transfer.fromTeam.name}" class="transfer-team-logo" onerror="this.src='soccer-ball-png-24.png'">` : 
          '<span class="no-logo">?</span>';
        
        const toLogo = transfer.toTeam ? 
          `<img src="https://a.espncdn.com/i/teamlogos/soccer/500/${transfer.toTeam.id}.png" alt="${transfer.toTeam.name}" class="transfer-team-logo" onerror="this.src='soccer-ball-png-24.png'">` : 
          '<span class="no-logo">?</span>';
        
        return `
          <div class="transfer-item">
            <div class="transfer-left">
              <div class="transfer-date">${transferDate}</div>
              <div class="player-name">${transfer.athlete.firstName || ''} ${transfer.athlete.lastName || ''}</div>
            </div>
            <div class="transfer-right">
              <div class="transfer-teams">
                ${fromLogo} → ${toLogo}
              </div>
              <div class="transfer-type-amount">
                <span class="transfer-type" style="color: ${typeColor}">${transfer.type || 'Transfer'}</span>
                <span class="transfer-amount" style="color: ${typeColor}">${amountText}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      return transfersHTML;
    }
    
    function renderTransfersPagination() {
      if (totalPages <= 1) return '';
      
      return `
        <div class="transfers-pagination">
          <button class="page-btn prev-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changeTeamTransfersPage(${currentPage - 1})">‹</button>
          <span class="page-info">Page ${currentPage} of ${totalPages}</span>
          <button class="page-btn next-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changeTeamTransfersPage(${currentPage + 1})">›</button>
        </div>
      `;
    }
    
    function updateTransfersDisplay() {
      const transfersHTML = renderTransfersPage(currentPage);
      const paginationHTML = renderTransfersPagination();
      
      transfersSection.innerHTML = `
        <div class="transfers-container">
          <div class="transfers-list">
            ${transfersHTML}
          </div>
          ${paginationHTML}
        </div>
      `;
    }
    
    // Make page change function globally accessible
    window.changeTeamTransfersPage = function(page) {
      if (page < 1 || page > totalPages) return;
      currentPage = page;
      updateTransfersDisplay();
    };
    
    // Initial render
    updateTransfersDisplay();
    
  } catch (error) {
    console.error('Error loading team transfers:', error);
    transfersSection.innerHTML = '<div class="error">Failed to load transfers</div>';
  }
}

async function showPlayerDetails(playerId, firstName, lastName, jerseyNumber, position) {
  try {
    await loadTeamInfo();

    
    // Store the position globally for year changes
    selectedPlayerPosition = position;
    
    // Create modal overlay (NBA-style)
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    `;

    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.cssText = `
      background: white;
      border-radius: 10px;
      padding: 20px;
      max-width: 600px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      position: relative;
    `;

    // Create close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '×';
    closeButton.style.cssText = `
      position: absolute;
      top: 10px;
      right: 15px;
      background: none;
      border: none;
      font-size: 36px;
      cursor: pointer;
      color: #333;
      z-index: 1001;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: background-color 0.2s ease;
    `;
    closeButton.addEventListener('mouseenter', () => {
      closeButton.style.backgroundColor = '#f0f0f0';
    });
    closeButton.addEventListener('mouseleave', () => {
      closeButton.style.backgroundColor = 'transparent';
    });
    closeButton.addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    // Create player header with proper styling for the player display
    const playerHeader = document.createElement('div');
    playerHeader.className = 'selected-player-header';
    playerHeader.style.cssText = `
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 20px;
      padding: 15px;
      background: linear-gradient(135deg, ${teamColor} 0%, #cccccc 100%);
      border-radius: 8px;
      color: white;
    `;
    playerHeader.innerHTML = `
      <div style="width: 60px; height: 60px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: bold;">
        ${jerseyNumber}
      </div>
      <div>
        <div style="font-size: 1.5rem; font-weight: bold; margin-bottom: 5px;">
          ${lastName ? `${firstName} ${lastName}` : firstName}
        </div>
        <div style="font-size: 1.1rem; opacity: 0.9;">
          #${jerseyNumber} | ${position} | <span class="team-abbreviation">${currentTeam?.abbreviation || currentTeam?.shortDisplayName || 'UNK'}</span>
        </div>
      </div>
    `;

    // Set selected player info - fetch full ESPN API data for defaultTeam/defaultLeague info
    selectedPlayer = {
      id: playerId,
      firstName: firstName,
      lastName: lastName,
      fullName: lastName ? `${firstName} ${lastName}` : firstName,
      jersey: jerseyNumber,
      position: position,
      headshot: null, // UEFA doesn't have headshots
      defaultTeam: null,
      defaultLeague: null
    };

    // Fetch full ESPN API data to get defaultTeam and defaultLeague information
    try {

      // Try current season first, then fall back to previous seasons if needed
      const currentSeason = new Date().getFullYear();
      let espnPlayerResponse = await fetch(convertToHttps(`http://sports.core.api.espn.com/v2/sports/soccer/leagues/${currentLeague}/seasons/${currentSeason}/athletes/${playerId}?lang=en&region=us`));
      
      // If current season fails, try previous season
      if (!espnPlayerResponse.ok) {

        espnPlayerResponse = await fetch(convertToHttps(`http://sports.core.api.espn.com/v2/sports/soccer/leagues/${currentLeague}/seasons/${currentSeason - 1}/athletes/${playerId}?lang=en&region=us`));
      }
      
      if (espnPlayerResponse.ok) {
        const espnPlayerData = await espnPlayerResponse.json();

        
        // Extract defaultTeam and defaultLeague from the API response
        if (espnPlayerData.defaultTeam && espnPlayerData.defaultTeam.$ref) {
          const teamRefMatch = espnPlayerData.defaultTeam.$ref.match(/teams\/(\d+)/);
          if (teamRefMatch) {
            selectedPlayer.defaultTeam = teamRefMatch[1];

          }
        }
        
        if (espnPlayerData.defaultLeague && espnPlayerData.defaultLeague.$ref) {
          const leagueRefMatch = espnPlayerData.defaultLeague.$ref.match(/leagues\/([^?]+)/);
          if (leagueRefMatch) {
            selectedPlayer.defaultLeague = leagueRefMatch[1];

          }
        }
        
        // Prioritize team over defaultTeam for display purposes
        if (espnPlayerData.team && espnPlayerData.team.$ref) {
          selectedPlayer.team = espnPlayerData.team;

        } else if (espnPlayerData.defaultTeam && espnPlayerData.defaultTeam.$ref) {
          selectedPlayer.team = espnPlayerData.defaultTeam;

        }
        
        // Store the full ESPN data for later use
        selectedPlayer.espnData = espnPlayerData;
      } else {

      }
    } catch (error) {

    }

    // Fetch and cache player transactions for transfer history
    selectedPlayer.transactions = null;
    try {
      console.log(`Fetching transaction history for player ${playerId}...`);
      const transactionResponse = await fetch(convertToHttps(`http://sports.core.api.espn.com/v2/sports/soccer/athletes/${playerId}/transactions?lang=en&region=us`));
      if (transactionResponse.ok) {
        const transactionData = await transactionResponse.json();
        console.log(`Transaction history for player ${playerId}:`, transactionData);
        selectedPlayer.transactions = transactionData;
        
        // Also store on window object for access in other functions
        window.selectedPlayer = selectedPlayer;

        // Parse each transaction and log the details
        if (transactionData && transactionData.items) {
          transactionData.items.forEach((transaction, index) => {
            const transactionDate = new Date(transaction.date);
            const year = transactionDate.getFullYear();
            const month = transactionDate.getMonth() + 1; // getMonth() returns 0-11, so add 1
            
            // Convert to season year: if month is 1-6 (Jan-Jun), it's part of the previous year's season
            // if month is 7-12 (Jul-Dec), it's part of the current year's season
            let seasonYear;
            if (month >= 1 && month <= 6) {
              seasonYear = year - 1; // January 2022 = 2021 season
            } else {
              seasonYear = year; // August 2021 = 2021 season
            }
            
            // Extract FROM team info
            if (transaction.from && transaction.from.$ref) {
              const fromTeamMatch = transaction.from.$ref.match(/teams\/(\d+)/);
              const fromLeagueMatch = transaction.from.$ref.match(/leagues\/([^\/]+)\/seasons/);
              if (fromTeamMatch && fromLeagueMatch) {
                console.log(`From team: id: ${fromTeamMatch[1]} league: ${fromLeagueMatch[1]}`);
              }
            }
            
            // Extract TO team info
            if (transaction.to && transaction.to.$ref) {
              const toTeamMatch = transaction.to.$ref.match(/teams\/(\d+)/);
              const toLeagueMatch = transaction.to.$ref.match(/leagues\/([^\/]+)\/seasons/);
              if (toTeamMatch && toLeagueMatch) {
                console.log(`To team: id: ${toTeamMatch[1]} league: ${toLeagueMatch[1]}`);
              }
            }
            
            console.log(`Year converted: ${seasonYear}`);
          });
        }

      } else {

      }
    } catch (error) {

    }

    // Create stats container
    const statsContainer = document.createElement('div');
    statsContainer.innerHTML = '<div style="text-align: center; padding: 20px;">Loading player statistics...</div>';

    // Create year selector section (will be added to stats header)
    const currentYear = new Date().getFullYear();
    const startYear = 2020;
    
    const yearSelectorHtml = `
      <select id="playerYearSelector" style="padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; background: white; margin-left: auto;">
        ${Array.from({length: currentYear - startYear + 1}, (_, i) => currentYear - i).map(year => 
          `<option value="${year}" ${year === currentYear ? 'selected' : ''}>${year}</option>`
        ).join('')}
      </select>
    `;

    // Create slider section for Overall vs Game Log
    const sliderSection = document.createElement('div');
    sliderSection.style.cssText = `
      margin: 20px 0;
      padding: 15px;
      background-color: #f8f9fa;
      border-radius: 8px;
      border: 1px solid #ddd;
    `;

    const sliderContainer = document.createElement('div');
    sliderContainer.style.cssText = `
      display: flex;
      position: relative;
      width: 200px;
      height: 50px;
      background: #e9ecef;
      border-radius: 25px;
      margin: 0 auto;
      overflow: hidden;
    `;

    // Background behind active tab
    const sliderBackground = document.createElement('div');
    sliderBackground.id = 'sliderBackground';
    sliderBackground.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 51.75%;
      height: 100%;
      background-color: ${teamColor};
      border-radius: 25px;
      transition: transform 0.3s ease;
      z-index: 0;
    `;

    const overallOption = document.createElement('button');
    overallOption.id = 'overallOption';
    overallOption.innerHTML = 'Overall';
    overallOption.style.cssText = `
      background: none;
      border: none;
      padding: 8px 16px;
      border-radius: 20px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      color: white;
      position: relative;
      z-index: 2;
      width: 96px;
      transition: color 0.3s ease;
    `;

    const gameLogOption = document.createElement('button');
    gameLogOption.id = 'gameLogOption';
    gameLogOption.innerHTML = 'Game Log';
    gameLogOption.style.cssText = `
      background: none;
      border: none;
      padding: 8px 16px;
      border-radius: 20px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      color: #777;
      position: relative;
      z-index: 2;
      width: 96px;
      transition: color 0.3s ease;
    `;

    sliderContainer.appendChild(sliderBackground);
    sliderContainer.appendChild(overallOption);
    sliderContainer.appendChild(gameLogOption);
    sliderSection.appendChild(sliderContainer);

    // Add click handlers for slider
    overallOption.addEventListener('click', () => {

      sliderBackground.style.transform = 'translateX(0)';
      overallOption.style.color = 'white';
      gameLogOption.style.color = '#777';
      currentStatsMode = 'overall';
      showOverallStats();
    });

    gameLogOption.addEventListener('click', () => {

      sliderBackground.style.transform = 'translateX(96px)';
      overallOption.style.color = '#777';
      gameLogOption.style.color = 'white';
      currentStatsMode = 'gamelog';
      showGameLogInterface();
    });

    // Create player search section
    const searchSection = document.createElement('div');
    searchSection.style.cssText = `
      margin-top: 20px;
      padding: 15px;
      background-color: #f8f9fa;
      border-radius: 8px;
      border: 1px solid #ddd;
    `;

    const searchLabel = document.createElement('div');
    searchLabel.innerHTML = 'Compare with another player:';
    searchLabel.style.cssText = `
      font-weight: bold;
      color: #333;
      margin-bottom: 10px;
      font-size: 14px;
    `;

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Type player name...';
    searchInput.style.cssText = `
      width: 100%;
      padding: 10px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 14px;
      outline: none;
      box-sizing: border-box;
    `;

    const searchResults = document.createElement('div');
    searchResults.style.cssText = `
      margin-top: 5px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: white;
      max-height: 120px;
      overflow-y: auto;
      display: none;
    `;

    searchSection.appendChild(searchLabel);
    searchSection.appendChild(searchInput);
    searchSection.appendChild(searchResults);

    // Add search functionality with position filtering
    let searchTimeout;
    searchInput.addEventListener('input', async (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim().toLowerCase();
      
      if (query.length < 2) {
        searchResults.style.display = 'none';
        return;
      }

      searchTimeout = setTimeout(async () => {
        // Get all soccer players for league-wide search
        const allPlayers = await fetchAllSoccerPlayers();
        const selectedPlayerType = getPlayerType(position);
        
        const filteredPlayers = allPlayers
          .filter(player => {
            const fullName = `${player.firstName || ''} ${player.lastName || ''}`.toLowerCase();
            const displayName = (player.displayName || '').toLowerCase();
            const teamName = (player.team || '').toLowerCase();
            const playerType = getPlayerType(player.position);
            
            // Check if query matches player name first (prioritize name over team)
            const nameMatch = fullName.includes(query) || displayName.includes(query);
            const teamMatch = teamName.includes(query);
            
            // Position matching: same type (goalkeeper vs field)
            const positionMatch = playerType === selectedPlayerType;
            
            // League matching: must be same league
            const leagueMatch = player.league === currentLeague;
            
            // Exclude self
            const excludeSelf = player.id !== playerId;
            
            return (nameMatch || teamMatch) && excludeSelf && positionMatch && leagueMatch;
          })
          .sort((a, b) => {
            // Sort by name match first, then team match
            const aNameMatch = (`${a.firstName || ''} ${a.lastName || ''}`.toLowerCase() + (a.displayName || '').toLowerCase()).includes(query);
            const bNameMatch = (`${b.firstName || ''} ${b.lastName || ''}`.toLowerCase() + (b.displayName || '').toLowerCase()).includes(query);
            
            if (aNameMatch && !bNameMatch) return -1;
            if (!aNameMatch && bNameMatch) return 1;
            return 0;
          })
          .slice(0, 3); // Max 3 results



        if (filteredPlayers.length > 0) {
          searchResults.innerHTML = filteredPlayers.map(player => `
            <div class="search-result-item" data-player-index="${filteredPlayers.indexOf(player)}" style="
              padding: 10px;
              cursor: pointer;
              border-bottom: 1px solid #eee;
              display: flex;
              align-items: center;
              gap: 10px;
              transition: background-color 0.2s ease;
            " onmouseover="this.style.backgroundColor='#f0f0f0'" onmouseout="this.style.backgroundColor='white'">
              <div>
                <div style="font-weight: bold; color: #333;">${player.displayName}</div>
                <div style="font-size: 12px; color: #777;">${player.team} | #${player.jersey} | ${player.position}</div>
              </div>
            </div>
          `).join('');
          
          searchResults.style.display = 'block';

          // Add click handlers to search results
          searchResults.querySelectorAll('.search-result-item').forEach((item, index) => {
            item.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              
              const player = filteredPlayers[index];
              

              
              if (player) {
                const playerForComparison = {
                  id: player.id,
                  firstName: player.firstName,
                  lastName: player.lastName,
                  name: player.displayName,
                  position: player.position,
                  jersey: player.jersey || 'N/A',
                  teamAbbr: player.teamAbbr || currentTeam?.abbreviation || currentTeam?.shortDisplayName,
                  league: player.league
                };
                

                
                // Close current modal
                document.body.removeChild(modal);
                
                // Create current player object for comparison
                const currentPlayerData = allRosterPlayers.find(p => p.id === playerId);
                const currentPlayerForComparison = {
                  id: playerId,
                  firstName: firstName,
                  lastName: lastName,
                  name: lastName ? `${firstName} ${lastName}` : firstName,
                  position: position,
                  jersey: jerseyNumber || currentPlayerData?.jersey || 'N/A',
                  teamAbbr: currentTeam?.abbreviation || currentTeam?.shortDisplayName || 'UNK',
                  league: currentLeague
                };
                

                
                playersForComparison = [currentPlayerForComparison, playerForComparison];

                showPlayerComparison(currentPlayerForComparison, playerForComparison);
              } else {
                console.error('Player not found in filtered results');
              }
            });
          });
        } else {
          const positionText = selectedPlayerType === 'goalkeeper' ? 'goalkeepers' : 'field players';
          searchResults.innerHTML = `<div style="padding: 10px; color: #777; text-align: center;">No ${positionText} found</div>`;
          searchResults.style.display = 'block';
        }
      }, 300);
    });

    // Hide search when clicking outside
    document.addEventListener('click', (e) => {
      if (!searchSection.contains(e.target)) {
        searchResults.style.display = 'none';
      }
    });

    // Assemble modal
    modalContent.appendChild(closeButton);
    modalContent.appendChild(playerHeader);
    modalContent.appendChild(statsContainer);
    modalContent.appendChild(sliderSection);
    modalContent.appendChild(searchSection);
    modal.appendChild(modalContent);

    // Add to document
    document.body.appendChild(modal);
    
    // Close modal when clicking outside of it
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
    

    
    // Load player stats for current year
    await loadPlayerStatsForYear(playerId, position, statsContainer, currentYear);
    
  } catch (error) {
    console.error("Error loading player details:", error);
    alert(`Error loading player details: ${error.message}`);
  }
}

async function loadPlayerStats(playerId, position, contentDiv) {
  const currentYear = new Date().getFullYear();
  await loadPlayerStatsForYear(playerId, position, contentDiv, currentYear);
}

// Function to combine statistics from multiple teams/leagues
function combinePlayerStatistics(allStatsData) {
  if (allStatsData.length === 0) return null;
  if (allStatsData.length === 1) return allStatsData[0].stats;
  
  console.log('Combining statistics from multiple teams:', allStatsData.map(s => `${s.teamId} (${s.league}) (includeStats: ${s.includeStats !== false})`));
  
  // Check if all teams are from the same league
  const statsToInclude = allStatsData.filter(data => data.includeStats !== false);
  const uniqueLeagues = [...new Set(statsToInclude.map(data => data.league))];
  const isSameLeague = uniqueLeagues.length === 1;
  
  console.log('Same league transfer:', isSameLeague, 'Leagues:', uniqueLeagues);
  
  if (statsToInclude.length === 1) {
    // Only one team has stats to include
    return statsToInclude[0].stats;
  }
  
  // Use the first stats structure as the base (should be FROM team)
  const baseStats = JSON.parse(JSON.stringify(allStatsData[0].stats));
  
  // Combine categories from all stats that should be included
  if (baseStats.splits && baseStats.splits.categories) {
    for (let i = 1; i < statsToInclude.length; i++) {
      const additionalStatsData = statsToInclude[i];
      const additionalStats = additionalStatsData.stats;
      
      if (additionalStats.splits && additionalStats.splits.categories) {
        // Combine each category
        baseStats.splits.categories.forEach(baseCategory => {
          const matchingCategory = additionalStats.splits.categories.find(cat => cat.name === baseCategory.name);
          
          if (matchingCategory && baseCategory.stats && matchingCategory.stats) {
            baseCategory.stats.forEach(baseStat => {
              const matchingStat = matchingCategory.stats.find(stat => stat.name === baseStat.name);
              
              if (matchingStat) {
                const baseValue = baseStat.value || '0';
                const additionalValue = matchingStat.value || '0';
                
                if (isSameLeague) {
                  // Same league transfer - just add the values normally without "FROM / TO" format
                  const baseNumeric = parseFloat(baseValue) || 0;
                  baseStat.value = baseNumeric;
                  baseStat.displayValue = baseNumeric;
                } else {
                  // Inter-league transfer - show as "FROM / TO" format
                  baseStat.displayValue = `${baseValue} / ${additionalValue}`;
                  
                  // Keep mathematical sum for internal calculations if needed
                  const baseNumeric = parseFloat(baseValue) || 0;
                  const additionalNumeric = parseFloat(additionalValue) || 0;
                  baseStat.value = (baseNumeric + additionalNumeric).toString();
                }
              }
            });
          }
        });
      }
    }
  }
  
  console.log('Combined stats with transfer format:', baseStats);
  return baseStats;
}

// Function to determine teams and leagues for a player in a given season based on transactions
function getPlayerTeamsForSeason(transactions, season) {
  console.log(`getPlayerTeamsForSeason called with season: ${season}, transactions:`, transactions);
  const teams = [];
  
  if (!transactions || !transactions.items || transactions.items.length === 0) {
    console.log('No transaction data available');
    return teams; // No transaction data available
  }
  
  // Season runs from August of current year to July of next year
  // For season 2021: August 2021 to July 2022
  const seasonStart = new Date(`${season}-08-01`);
  const seasonEnd = new Date(`${season + 1}-07-31`);
  

  
  // Find all transactions that occurred during this season
  const seasonTransactions = transactions.items.filter(transaction => {
    const transactionDate = new Date(transaction.date);
    return transactionDate >= seasonStart && transactionDate <= seasonEnd;
  });
  
  console.log(`Season ${season} range: ${seasonStart.toISOString()} to ${seasonEnd.toISOString()}`);
  console.log(`Found ${seasonTransactions.length} transactions for season ${season}:`, seasonTransactions);
  
  if (seasonTransactions.length === 0) {
    console.log('No transfers during this season');
    return teams; // No transfers during this season
  }
  
  // For each transaction, extract team and league info
  seasonTransactions.forEach((transaction, index) => {
    // Extract FROM team info
    if (transaction.from && transaction.from.$ref) {
      const fromTeamMatch = transaction.from.$ref.match(/teams\/(\d+)/);
      const fromLeagueMatch = transaction.from.$ref.match(/leagues\/([^\/]+)\/seasons/);
      if (fromTeamMatch && fromLeagueMatch) {
        console.log(`From team: ID: ${fromTeamMatch[1]} League: ${fromLeagueMatch[1]}`);
        teams.push({
          teamId: fromTeamMatch[1],
          league: fromLeagueMatch[1],
          period: 'from',
          transactionDate: transaction.date,
          order: index * 2
        });
      }
    }
    
    // Extract TO team info
    if (transaction.to && transaction.to.$ref) {
      const toTeamMatch = transaction.to.$ref.match(/teams\/(\d+)/);
      const toLeagueMatch = transaction.to.$ref.match(/leagues\/([^\/]+)\/seasons/);
      if (toTeamMatch && toLeagueMatch) {
        console.log(`To team: ID: ${toTeamMatch[1]} League: ${toLeagueMatch[1]}`);
        teams.push({
          teamId: toTeamMatch[1],
          league: toLeagueMatch[1],
          period: 'to',
          transactionDate: transaction.date,
          order: index * 2 + 1
        });
      }
    }
    
    console.log(`Adjusted season year: ${season}`);
  });
  
  // Sort by transaction order to maintain from->to sequence
  teams.sort((a, b) => a.order - b.order);
  

  return teams;
}

async function loadPlayerStatsForYear(playerId, position, contentDiv, year) {
  try {

    
    // Get the player's team and league for the specific year
    let teamIdForYear = currentTeamId; // Default to current team
    let leagueForYear = currentLeague; // Default to current league
    
    // If not current year, try to get team/league for the specific year
    if (year !== new Date().getFullYear()) {
      try {

        const playerSeasonResponse = await fetch(convertToHttps(`http://sports.core.api.espn.com/v2/sports/soccer/leagues/${currentLeague}/seasons/${year}/athletes/${playerId}?lang=en&region=us`));
        
        if (playerSeasonResponse.ok) {
          const playerSeasonData = await playerSeasonResponse.json();

          
          // Check for defaultTeam and defaultLeague in season-specific data
          if (playerSeasonData.defaultTeam && playerSeasonData.defaultTeam.$ref) {
            const teamRefMatch = playerSeasonData.defaultTeam.$ref.match(/teams\/(\d+)/);
            if (teamRefMatch) {
              teamIdForYear = teamRefMatch[1];

            }
          }
          
          if (playerSeasonData.defaultLeague && playerSeasonData.defaultLeague.$ref) {
            const leagueRefMatch = playerSeasonData.defaultLeague.$ref.match(/leagues\/([^?]+)/);
            if (leagueRefMatch) {
              leagueForYear = leagueRefMatch[1];

            }
          }
          
          // Fallback to team $ref if defaultTeam not available
          if (!playerSeasonData.defaultTeam && playerSeasonData.team && playerSeasonData.team.$ref) {
            const teamRefMatch = playerSeasonData.team.$ref.match(/teams\/(\d+)/);
            if (teamRefMatch) {
              teamIdForYear = teamRefMatch[1];

            }
          }
        }
      } catch (error) {

      }
    }
    
    // Always try ESPN API first for consistency across initial loads and year changes
    // Cached data will be used as fallback if ESPN API fails
    
    // Try to fetch year-specific stats from ESPN API using the correct team/league
    let selectedPlayer = null;
    


    
    // Check if player has transfer history and get teams for this season
    let allStatsData = [];
    let playerBasicInfo = null;
    let teamsForSeason = [];
    
    // Use transaction data to determine teams for the season (access global selectedPlayer variable)
    // Note: using global selectedPlayer variable which has the transaction data from showPlayerDetails
    if (window.selectedPlayer && window.selectedPlayer.transactions) {
      console.log('About to call getPlayerTeamsForSeason with year:', year);
      console.log('global selectedPlayer.transactions:', window.selectedPlayer.transactions);
      teamsForSeason = getPlayerTeamsForSeason(window.selectedPlayer.transactions, year);
      console.log('teamsForSeason result:', teamsForSeason);
    } else {
      console.log('No transaction data available for getPlayerTeamsForSeason');
      console.log('Trying to access global selectedPlayer through window object');
      console.log('window.selectedPlayer:', window.selectedPlayer);
      console.log('Trying to check if selectedPlayer is declared globally...');
    }
    
    // Store teams for season data on the player object for use in processPlayerStats
    if (selectedPlayer) {
      selectedPlayer.teamsForSeason = teamsForSeason;
    }
    
    // If no transaction data or no transfers in this season, use current/default team approach
    if (teamsForSeason.length === 0) {
      try {
        const espnResponse = await fetch(convertToHttps(`http://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueForYear}/seasons/${year}/athletes/${playerId}?lang=en&region=us`));
        if (espnResponse.ok) {
          const espnData = await espnResponse.json();

          playerBasicInfo = espnData;
          
          // Add current team/league
          if (espnData.team && espnData.team.$ref) {
            const teamMatch = espnData.team.$ref.match(/teams\/(\d+)/);
            const leagueMatch = espnData.team.$ref.match(/leagues\/([^\/]+)\/seasons/);
            if (teamMatch && leagueMatch) {
              teamsForSeason.push({ teamId: teamMatch[1], league: leagueMatch[1], period: 'current' });

            }
          }
          
          // Add default team if different
          if (espnData.defaultTeam && espnData.defaultTeam.$ref) {
            const defaultTeamMatch = espnData.defaultTeam.$ref.match(/teams\/(\d+)/);
            if (defaultTeamMatch) {
              const defaultTeamId = defaultTeamMatch[1];
              let defaultLeague = leagueForYear;
              
              if (espnData.defaultLeague && espnData.defaultLeague.$ref) {
                const defaultLeagueMatch = espnData.defaultLeague.$ref.match(/leagues\/([^?]+)/);
                if (defaultLeagueMatch) {
                  defaultLeague = defaultLeagueMatch[1];
                }
              }
              
              // Only add if different
              const isDifferentTeam = !teamsForSeason.some(t => t.teamId === defaultTeamId && t.league === defaultLeague);
              if (isDifferentTeam) {
                teamsForSeason.push({ teamId: defaultTeamId, league: defaultLeague, period: 'default' });

              }
            }
          }
        }
      } catch (e) {

      }
    }
    
    // If still no teams, use fallback
    if (teamsForSeason.length === 0) {
      teamsForSeason.push({ teamId: teamIdForYear, league: leagueForYear, period: 'fallback' });
    }
        
        // Check if this is a transfer year before fetching stats
        let isTransferYear = false;
        let transferInfo = null;
        
        console.log('Checking for transfer in year:', year);
        const globalPlayerForTransfer = window.selectedPlayer || selectedPlayer;
        console.log('global selectedPlayer available:', !!globalPlayerForTransfer);
        console.log('global selectedPlayer.transactions available:', !!globalPlayerForTransfer?.transactions);
        
        if (globalPlayerForTransfer && globalPlayerForTransfer.transactions) {
          console.log('Searching through transactions for year:', year);
          console.log('All transactions:', globalPlayerForTransfer.transactions.items.map(t => ({ date: t.date, from: t.from.$ref, to: t.to.$ref })));
          
          const transferInThisYear = globalPlayerForTransfer.transactions.items.find(transaction => {
            const transactionDate = new Date(transaction.date);
            const transactionYear = transactionDate.getFullYear();
            const month = transactionDate.getMonth() + 1;
            
            let seasonYear;
            if (month >= 8) {
              // August to December belongs to current year's season
              // e.g., August 2024 = Season 2024
              seasonYear = transactionYear;
            } else {
              // January to July belongs to previous year's season
              // e.g., February 2024 = Season 2023 (since season 2023 runs Aug 2023 - July 2024)
              seasonYear = transactionYear - 1;
            }
            
            console.log(`[FIRST CHECK] Transaction date: ${transaction.date}, year: ${transactionYear}, month: ${month}, calculated season year: ${seasonYear}, target year: ${year}, match: ${seasonYear === year}`);
            return seasonYear === year;
          });
          
          if (transferInThisYear) {
            isTransferYear = true;
            console.log('Transfer found for year:', year, transferInThisYear);
            
            // Extract team info from transfer
            const fromTeamMatch = transferInThisYear.from.$ref.match(/teams\/(\d+)/);
            const fromLeagueMatch = transferInThisYear.from.$ref.match(/leagues\/([^\/]+)\/seasons/);
            const toTeamMatch = transferInThisYear.to.$ref.match(/teams\/(\d+)/);
            const toLeagueMatch = transferInThisYear.to.$ref.match(/leagues\/([^\/]+)\/seasons/);
            
            if (fromTeamMatch && toTeamMatch && fromLeagueMatch && toLeagueMatch) {
              transferInfo = {
                fromTeamId: fromTeamMatch[1],
                fromLeague: fromLeagueMatch[1],
                toTeamId: toTeamMatch[1],
                toLeague: toLeagueMatch[1]
              };
              console.log(`Transfer year detected: From ${transferInfo.fromTeamId} (${transferInfo.fromLeague}) to ${transferInfo.toTeamId} (${transferInfo.toLeague})`);
            }
          }
        }
        
        // Fetch statistics from all teams for this season
        for (const teamInfo of teamsForSeason) {
          try {
            const statsUrl = `http://sports.core.api.espn.com/v2/sports/soccer/leagues/${teamInfo.league}/seasons/${year}/types/1/athletes/${playerId}/statistics?lang=en&region=us`;
            const statsResponse = await fetch(convertToHttps(statsUrl));
            
            if (statsResponse.ok) {
              const statsData = await statsResponse.json();
              
              if (statsData.splits && statsData.splits.categories) {
                // Check if this is the TO team in a transfer year
                let shouldIncludeStats = true;
                let isToTeam = false;
                
                if (isTransferYear && transferInfo && teamInfo.teamId === transferInfo.toTeamId) {
                  isToTeam = true;
                  // Check appearances for TO team
                  const appearancesCategory = statsData.splits.categories.find(cat => cat.name === 'general');
                  if (appearancesCategory) {
                    const appearancesStat = appearancesCategory.stats.find(stat => stat.name === 'appearances');
                    if (appearancesStat && appearancesStat.value === 0) {
                      console.log(`TO team ${teamInfo.teamId} has 0 appearances, excluding stats but including competitions`);
                      shouldIncludeStats = false;
                    }
                  }
                }
                
                allStatsData.push({
                  teamId: teamInfo.teamId,
                  league: teamInfo.league,
                  period: teamInfo.period,
                  stats: statsData,
                  includeStats: shouldIncludeStats,
                  isToTeam: isToTeam
                });
              }
            } else {
              console.log(`Failed to fetch stats for team ${teamInfo.teamId}: ${statsResponse.status}`);
            }
          } catch (e) {
            console.log(`Error fetching stats for team ${teamInfo.teamId}:`, e);
          }
        }
        
        // Combine all statistics if we have multiple sources
        if (allStatsData.length > 0) {
          console.log('DEBUG: allStatsData length:', allStatsData.length);
          console.log('DEBUG: allStatsData contents:', allStatsData.map(d => ({ teamId: d.teamId, league: d.league, includeStats: d.includeStats })));
          const combinedStats = combinePlayerStatistics(allStatsData);
          selectedPlayer = {
            id: playerId, // Ensure player ID is always preserved
            ...playerBasicInfo,
            ...(window.selectedPlayer ? { 
              firstName: window.selectedPlayer.firstName,
              lastName: window.selectedPlayer.lastName,
              fullName: window.selectedPlayer.fullName,
              jersey: window.selectedPlayer.jersey,
              position: window.selectedPlayer.position
            } : {}),
            statistics: combinedStats,
            allStatsData: allStatsData, // Store for competition handling
            transferInfo: transferInfo, // Store transfer info if applicable
            teamsForSeason: teamsForSeason, // Store teams for season data
            transactions: window.selectedPlayer?.transactions // Store transaction data
          };
          
          // Store teams for season for display purposes
          playerTeamsForSeason = teamsForSeason;
        } else {
          selectedPlayer = {
            id: playerId, // Ensure player ID is always preserved
            ...playerBasicInfo,
            ...(window.selectedPlayer ? { 
              firstName: window.selectedPlayer.firstName,
              lastName: window.selectedPlayer.lastName,
              fullName: window.selectedPlayer.fullName,
              jersey: window.selectedPlayer.jersey,
              position: window.selectedPlayer.position
            } : {}),
            teamsForSeason: teamsForSeason,
            transactions: window.selectedPlayer?.transactions
          };
          playerTeamsForSeason = teamsForSeason;
        }
    
    // If no stats found, fall back to roster data (current year only)
    if (!selectedPlayer || !selectedPlayer.statistics) {
      if (year === new Date().getFullYear()) {

        
        // First try cached player data if available
        if (allRosterPlayers) {
          const cachedPlayer = allRosterPlayers.find(player => player.id === playerId);
          if (cachedPlayer && cachedPlayer.fullPlayerData) {

            selectedPlayer = cachedPlayer.fullPlayerData;
          }
        }
        
        // If no cached data, try the team roster endpoint with stats using current team
        if (!selectedPlayer) {
          try {
            const rosterResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/teams/${currentTeamId}/roster?season=2025`);
            if (rosterResponse.ok) {
              const rosterData = await rosterResponse.json();
              
              const apiPlayer = rosterData.athletes?.find(athlete => {
                const athleteData = athlete.athlete || athlete;
                return athleteData.id === playerId;
              });
              
              if (apiPlayer) {
                const athleteData = apiPlayer.athlete || apiPlayer;
                if (athleteData.statistics) {
                  selectedPlayer = athleteData;

                }
              }
            }
          } catch (e) {

          }
        }
        
        // If still no stats, try the basic roster endpoint
        if (!selectedPlayer) {

          const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/teams/${currentTeamId}/roster?season=2025`);
          const data = await response.json();
          
          const apiPlayer = data.athletes?.find(athlete => {
            const athleteData = athlete.athlete || athlete;
            return athleteData.id === playerId;
          });
          
          if (apiPlayer) {
            selectedPlayer = apiPlayer.athlete || apiPlayer;
          }
        }
      } else {
        // For historical years, show message if no data available but preserve year selector
        const currentYear = new Date().getFullYear();
        const startYear = 2020;
        
        const yearSelectorHtml = `
          <select id="playerYearSelector" style="padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; background: white; margin-left: auto;">
            ${Array.from({length: currentYear - startYear + 1}, (_, i) => currentYear - i).map(yearOption => 
              `<option value="${yearOption}" ${yearOption === year ? 'selected' : ''}>${yearOption}</option>`
            ).join('')}
          </select>
        `;
        
        contentDiv.innerHTML = `
          <div class="d-flex justify-content-between align-items-center mb-3" style="border-bottom: 1px solid #ddd; padding-bottom: 10px;">
            <h4 style="margin: 0; color: #333; font-size: 1.4rem;">Player Statistics</h4>
            ${yearSelectorHtml}
          </div>
          <div style="text-align: center; padding: 40px 20px; color: #777;">
            <div style="font-size: 1.2rem; margin-bottom: 10px;">📊</div>
            <div style="font-size: 1.1rem; margin-bottom: 10px;">No statistics available</div>
            <div style="font-size: 0.9rem;">Statistics for the ${year} season are not available for this player.</div>
          </div>
        `;
        
        // Add event listener for year selector
        const yearSelector = contentDiv.querySelector('#playerYearSelector');
        if (yearSelector) {
          yearSelector.addEventListener('change', async (e) => {
            const selectedYear = parseInt(e.target.value);

            await loadPlayerStatsForYear(playerId, position, contentDiv, selectedYear);
          });
        }
        
        return;
      }
    }
    
    if (!selectedPlayer) {
      // Show message if player not found but preserve year selector
      const currentYear = new Date().getFullYear();
      const startYear = 2020;
      
      const yearSelectorHtml = `
        <select id="playerYearSelector" style="padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; background: white; margin-left: auto;">
          ${Array.from({length: currentYear - startYear + 1}, (_, i) => currentYear - i).map(yearOption => 
            `<option value="${yearOption}" ${yearOption === year ? 'selected' : ''}>${yearOption}</option>`
          ).join('')}
        </select>
      `;
      
      contentDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3" style="border-bottom: 1px solid #ddd; padding-bottom: 10px;">
          <h4 style="margin: 0; color: #333; font-size: 1.4rem;">Player Statistics</h4>
          ${yearSelectorHtml}
        </div>
        <div style="text-align: center; padding: 20px; color: #777;">
          <p>Player not found</p>
        </div>
      `;
      
      // Add event listener for year selector
      const yearSelector = contentDiv.querySelector('#playerYearSelector');
      if (yearSelector) {
        yearSelector.addEventListener('change', async (e) => {
          const selectedYear = parseInt(e.target.value);

          await loadPlayerStatsForYear(playerId, position, contentDiv, selectedYear);
        });
      }
      
      return;
    }
    

    
    // Process player stats with the year and league
    await processPlayerStats(selectedPlayer, position, contentDiv, year, leagueForYear);
    
  } catch (error) {
    console.error("Error loading player stats:", error);
    
    // Show error message but preserve year selector
    const currentYear = new Date().getFullYear();
    const startYear = 2020;
    
    const yearSelectorHtml = `
      <select id="playerYearSelector" style="padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; background: white; margin-left: auto;">
        ${Array.from({length: currentYear - startYear + 1}, (_, i) => currentYear - i).map(yearOption => 
          `<option value="${yearOption}" ${yearOption === year ? 'selected' : ''}>${yearOption}</option>`
        ).join('')}
      </select>
    `;
    
    contentDiv.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3" style="border-bottom: 1px solid #ddd; padding-bottom: 10px;">
        <h4 style="margin: 0; color: #333; font-size: 1.4rem;">Player Statistics</h4>
        ${yearSelectorHtml}
      </div>
      <div style="text-align: center; padding: 20px; color: #777;">
        <p>Error loading player statistics</p>
      </div>
    `;
    
    // Add event listener for year selector
    const yearSelector = contentDiv.querySelector('#playerYearSelector');
    if (yearSelector) {
      yearSelector.addEventListener('change', async (e) => {
        const selectedYear = parseInt(e.target.value);

        await loadPlayerStatsForYear(playerId, position, contentDiv, selectedYear);
      });
    }
  }
}

// Function to fetch competition statistics for a player
async function fetchCompetitionStats(playerId, competitions, year) {


  const competitionStats = [];
  
  for (const competition of competitions) {
    try {
      // Use direct statistics endpoint instead of looking for statistics category in athlete page
      const url = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${competition.code}/seasons/${year}/types/0/athletes/${playerId}/statistics?lang=en&region=us`;

      
      const response = await fetch(url);

      
      if (response.ok) {
        const statsData = await response.json();

        
        // Extract basic stats from the competition data using the same pattern as main stats
        if (statsData?.splits?.categories) {
          const stats = statsData.splits.categories;

          
          const generalStats = stats.find(c => c.name === 'general')?.stats || [];
          const offensiveStats = stats.find(c => c.name === 'offensive')?.stats || [];
          const defensiveStats = stats.find(c => c.name === 'defensive')?.stats || [];
          const goalkeepingStats = stats.find(c => c.name === 'goalKeeping')?.stats || [];
          
          const appearances = generalStats.find(s => s.name === 'appearances')?.displayValue || generalStats.find(s => s.name === 'appearances')?.value || "0";
          const minutesPlayed = generalStats.find(s => s.name === 'minutes')?.displayValue || generalStats.find(s => s.name === 'minutes')?.value || "0";
          const goals = offensiveStats.find(s => s.name === 'totalGoals')?.displayValue || offensiveStats.find(s => s.name === 'totalGoals')?.value || "0";
          const assists = offensiveStats.find(s => s.name === 'goalAssists')?.displayValue || offensiveStats.find(s => s.name === 'goalAssists')?.value || "0";
          
          // Goalkeeper-specific stats
          const cleanSheets = goalkeepingStats.find(s => s.name === 'cleanSheet')?.displayValue || goalkeepingStats.find(s => s.name === 'cleanSheet')?.value || 
                             defensiveStats.find(s => s.name === 'cleanSheet')?.displayValue || defensiveStats.find(s => s.name === 'cleanSheet')?.value || "0";
          const goalsAgainst = goalkeepingStats.find(s => s.name === 'goalsConceded')?.displayValue || goalkeepingStats.find(s => s.name === 'goalsConceded')?.value || 
                              defensiveStats.find(s => s.name === 'goalsConceded')?.displayValue || defensiveStats.find(s => s.name === 'goalsConceded')?.value || "0";
          
          console.log(`[COMPETITION DEBUG] ${competition.name} extracted stats:`, {
            appearances, minutesPlayed, goals, assists, cleanSheets, goalsAgainst
          });
          
          // Only add competition if player has at least one appearance
          if (parseInt(appearances) > 0) {

            competitionStats.push({
              competition: competition,
              appearances: appearances,
              minutesPlayed: minutesPlayed,
              goals: goals,
              assists: assists,
              cleanSheets: cleanSheets,
              goalsAgainst: goalsAgainst
            });
          } else {

          }
        } else {

        }
      } else {

      }
    } catch (error) {
      console.error(`[COMPETITION DEBUG] Error fetching stats for ${competition.name}:`, error);
    }
  }
  

  return competitionStats;
}

// Function to build combined team information from multiple teams
async function buildCombinedTeamInfo(teamsForSeason, leagueForCompetitions) {
  if (!teamsForSeason || teamsForSeason.length === 0) {
    return { abbreviations: [], colors: [], teamData: [] };
  }
  
  const teamAbbreviations = [];
  const teamColors = [];
  const teamData = [];
  
  for (const teamInfo of teamsForSeason) {
    try {

      const teamResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${teamInfo.league}/teams/${teamInfo.teamId}`);
      if (teamResponse.ok) {
        const teamResponseData = await teamResponse.json();
        const team = teamResponseData.team;
        
        const abbreviation = team.abbreviation || team.shortDisplayName || team.displayName.substring(0, 3).toUpperCase();
        teamAbbreviations.push(abbreviation);
        
        // Get team color
        const isUsingAlternateColor = ["ffffff", "ffee00", "ffff00", "81f733", "000000", "f7f316", "eef209", "ece83a", "1c31ce", "ffd700"].includes(team.color);
        let teamColor = "#000000";
        if (isUsingAlternateColor && team.alternateColor) {
          teamColor = `#${team.alternateColor}`;
        } else if (team.color) {
          teamColor = `#${team.color}`;
        }
        teamColors.push(teamColor);
        teamData.push(team);
        

      }
    } catch (error) {

      teamAbbreviations.push('UNK');
      teamColors.push('#000000');
      teamData.push(null);
    }
  }
  
  return {
    abbreviations: teamAbbreviations,
    colors: teamColors,
    teamData: teamData,
    combinedAbbr: teamAbbreviations.join(' + ')
  };
}

async function processPlayerStats(selectedPlayer, position, contentDiv, year, playerLeagueForYear = null) {


  
  const displayYear = year || new Date().getFullYear();
  
  // Determine which league to use for competition stats
  // Priority: 1) playerLeagueForYear (from API), 2) currentLeague (fallback)
  const leagueForCompetitions = playerLeagueForYear || currentLeague;

  
  // Fetch player's team information for the selected year using transaction-based approach
  playerTeamForYear = null;
  playerTeamColor = teamColor; // Default to current team color
  playerTeamAbbr = 'UNK';
  playerJerseyForYear = selectedPlayer.jersey || selectedPlayer.number || 'N/A';
  playerPositionForYear = selectedPlayer.position?.abbreviation || selectedPlayer.position?.name || position;
  
  try {
    // Use combined team information if player had transfers during the season
    if (selectedPlayer.teamsForSeason && selectedPlayer.teamsForSeason.length > 0) {
      console.log(`Processing transfer year ${displayYear} with teams:`, selectedPlayer.teamsForSeason);
      
      // Check if this is a transfer year by looking for transactions in this specific year
      const transferInThisYear = selectedPlayer.transactions && selectedPlayer.transactions.items.find(transaction => {
        const transactionDate = new Date(transaction.date);
        const year = transactionDate.getFullYear();
        const month = transactionDate.getMonth() + 1;
        
        let seasonYear;
        if (month >= 8) {
          // August to December belongs to current year's season
          seasonYear = year;
        } else {
          // January to July belongs to previous year's season
          seasonYear = year - 1;
        }
        
        console.log(`[SECOND CHECK] Transaction date: ${transaction.date}, year: ${year}, month: ${month}, calculated season year: ${seasonYear}, target year: ${displayYear}, match: ${seasonYear === displayYear}`);
        return seasonYear === displayYear;
      });
      
      if (transferInThisYear) {
        console.log(`Transfer found in ${displayYear}:`, transferInThisYear);
        
        // Extract team IDs from the transfer
        const fromTeamMatch = transferInThisYear.from.$ref.match(/teams\/(\d+)/);
        const fromLeagueMatch = transferInThisYear.from.$ref.match(/leagues\/([^\/]+)\/seasons/);
        const toTeamMatch = transferInThisYear.to.$ref.match(/teams\/(\d+)/);
        const toLeagueMatch = transferInThisYear.to.$ref.match(/leagues\/([^\/]+)\/seasons/);
        
        if (fromTeamMatch && toTeamMatch && fromLeagueMatch && toLeagueMatch) {
          const fromTeamId = fromTeamMatch[1];
          const fromLeague = fromLeagueMatch[1];
          const toTeamId = toTeamMatch[1];
          const toLeague = toLeagueMatch[1];
          
          console.log(`Transfer: From team ${fromTeamId} (${fromLeague}) to team ${toTeamId} (${toLeague})`);
          
          // Fetch both team abbreviations for combined display
          const [fromTeamData, toTeamData] = await Promise.all([
            fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${fromLeague}/teams/${fromTeamId}`).then(r => r.json()),
            fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${toLeague}/teams/${toTeamId}`).then(r => r.json())
          ]);
          
          const fromAbbr = fromTeamData.team.abbreviation || fromTeamData.team.shortDisplayName || fromTeamData.team.displayName.substring(0, 3).toUpperCase();
          const toAbbr = toTeamData.team.abbreviation || toTeamData.team.shortDisplayName || toTeamData.team.displayName.substring(0, 3).toUpperCase();
          
          // Set combined abbreviation and use FROM team as primary
          playerTeamAbbr = `${fromAbbr} / ${toAbbr}`;
          playerTeamForYear = fromTeamData.team;
          
          // For transfer years, try to get the jersey number from the TO team
          try {
            console.log(`Fetching TO team roster for team ${toTeamId}, league ${toLeague}, season ${displayYear + 1}`);
            const toTeamRosterResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${toLeague}/teams/${toTeamId}/roster?season=${displayYear + 1}`);
            console.log(`TO team roster response status: ${toTeamRosterResponse.status}`);
            
            if (toTeamRosterResponse.ok) {
              const toTeamRosterData = await toTeamRosterResponse.json();
              console.log(`TO team roster data:`, toTeamRosterData);
              
              const playerInToTeam = toTeamRosterData.athletes?.find(athlete => {
                const athleteData = athlete.athlete || athlete;
                console.log(`Checking athlete ${athleteData.id} against ${selectedPlayer.id}`);
                return athleteData.id === selectedPlayer.id;
              });
              
              if (playerInToTeam) {
                const athleteData = playerInToTeam.athlete || playerInToTeam;
                if (athleteData.jersey || athleteData.number) {
                  const newJersey = athleteData.jersey || athleteData.number;
                  console.log(`Found TO team jersey number: ${newJersey}, updating from ${playerJerseyForYear}`);
                  playerJerseyForYear = newJersey;
                } else {
                  console.log('Player found in TO team but no jersey number available');
                }
              } else {
                console.log(`Player ${selectedPlayer.id} not found in TO team roster`);
              }
            } else {
              console.log(`Failed to fetch TO team roster: ${toTeamRosterResponse.status}`);
            }
          } catch (e) {
            console.log('Error fetching TO team jersey:', e);
          }
          
          // Use FROM team color
          const isUsingAlternateColor = ["ffffff", "ffee00", "ffff00", "81f733", "000000", "f7f316", "eef209", "ece83a", "1c31ce", "ffd700"].includes(fromTeamData.team.color);
          if (isUsingAlternateColor && fromTeamData.team.alternateColor) {
            playerTeamColor = `#${fromTeamData.team.alternateColor}`;
          } else if (fromTeamData.team.color) {
            playerTeamColor = `#${fromTeamData.team.color}`;
          }
          
          console.log(`Combined team display: ${playerTeamAbbr}, using ${fromAbbr} as primary team`);
          
          // Store transfer info for later use in stats combination
          selectedPlayer.transferInfo = {
            fromTeamId: fromTeamId,
            fromLeague: fromLeague,
            toTeamId: toTeamId,
            toLeague: toLeague,
            fromAbbr: fromAbbr,
            toAbbr: toAbbr
          };
          
          // Also store on global selectedPlayer for copy function access
          if (window.selectedPlayer) {
            window.selectedPlayer.transferInfo = selectedPlayer.transferInfo;
          }
        }
      } else {
        // No transfer in this year, use normal combined team logic
        const combinedTeamInfo = await buildCombinedTeamInfo(selectedPlayer.teamsForSeason, leagueForCompetitions);
        
        if (combinedTeamInfo.combinedAbbr) {
          playerTeamAbbr = combinedTeamInfo.combinedAbbr;
        }
        
        // Use the color from the first team (primary team)
        if (combinedTeamInfo.colors && combinedTeamInfo.colors.length > 0) {
          playerTeamColor = combinedTeamInfo.colors[0];
        }
        
        // Use the first team's data for general team info
        if (combinedTeamInfo.teamData && combinedTeamInfo.teamData.length > 0) {
          playerTeamForYear = combinedTeamInfo.teamData[0];
        }
      }
    }
    
    // Fallback to original logic if no transaction data
    else if (selectedPlayer?.team?.$ref) {
      const teamRefMatch = selectedPlayer.team.$ref.match(/teams\/(\d+)/);
      if (teamRefMatch) {
        const playerTeamId = teamRefMatch[1];

        
        // Fetch team information
        const teamResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueForCompetitions}/teams/${playerTeamId}`);
        if (teamResponse.ok) {
          const teamData = await teamResponse.json();
          playerTeamForYear = teamData.team;

          
          // Get team color and abbreviation
          const isUsingAlternateColor = ["ffffff", "ffee00", "ffff00", "81f733", "000000", "f7f316", "eef209", "ece83a", "1c31ce", "ffd700"].includes(playerTeamForYear.color);
          if (isUsingAlternateColor && playerTeamForYear.alternateColor) {
            playerTeamColor = `#${playerTeamForYear.alternateColor}`;
          } else if (playerTeamForYear.color) {
            playerTeamColor = `#${playerTeamForYear.color}`;
          }
          
          playerTeamAbbr = playerTeamForYear.abbreviation || playerTeamForYear.shortDisplayName || playerTeamForYear.displayName;

        }
      }
    }
  } catch (error) {

  }
  
  // Always try to get player-specific jersey and position from roster if we have team info
  if (playerTeamForYear && selectedPlayer?.id) {
    try {
      const rosterResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueForCompetitions}/teams/${playerTeamForYear.id}/roster?season=${displayYear}`);
      if (rosterResponse.ok) {
        const rosterData = await rosterResponse.json();
        const playerInRoster = rosterData.athletes?.find(athlete => {
          const athleteData = athlete.athlete || athlete;
          return athleteData.id === selectedPlayer.id;
        });
        
        if (playerInRoster) {
          const athleteData = playerInRoster.athlete || playerInRoster;
          playerJerseyForYear = athleteData.jersey || athleteData.number || playerJerseyForYear;
          playerPositionForYear = athleteData.position?.abbreviation || athleteData.position?.name || playerPositionForYear;

        }
      }
    } catch (rosterError) {

    }
  }

  
  // Determine text color based on the team color for copy button
  const actualColorHex = playerTeamColor.replace('#', '');
  const nameColorChange = ["ffffff", "ffee00", "ffff00", "81f733", "ffef32", "f7f316", "eef209", "ece83a", "cccccc", "e3e4ed"].includes(actualColorHex) ? "black" : "white";
  
  // Update the player header with the correct team information
  const modal = document.querySelector('.modal-overlay');
  if (modal) {
    const playerHeader = modal.querySelector('.selected-player-header');
    if (playerHeader) {
      playerHeader.style.background = `linear-gradient(135deg, ${playerTeamColor} 0%, #cccccc 100%)`;
      playerHeader.style.color = nameColorChange;
      
      // Update the team abbreviation in the header
      const teamAbbreviation = playerHeader.querySelector('.team-abbreviation');
      if (teamAbbreviation) {
        teamAbbreviation.textContent = playerTeamAbbr;
      }
      
      // Update jersey number in the circle
      const jerseyCircle = playerHeader.querySelector('div[style*="border-radius: 50%"]');
      if (jerseyCircle) {
        jerseyCircle.textContent = playerJerseyForYear;
      }
      
      // Update the subtitle with jersey, position, and team
      const subtitleDiv = playerHeader.querySelector('div[style*="font-size: 1.1rem"]');
      if (subtitleDiv) {
        subtitleDiv.innerHTML = `#${playerJerseyForYear} | ${playerPositionForYear} | <span class="team-abbreviation">${playerTeamAbbr}</span>`;
      }
      
      // If elements don't exist, recreate the entire header
      if (!teamAbbreviation || !jerseyCircle || !subtitleDiv) {
        const firstName = selectedPlayer.firstName || 'Unknown';
        const lastName = selectedPlayer.lastName || '';
        
        playerHeader.innerHTML = `
          <div style="width: 60px; height: 60px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: bold;">
            ${playerJerseyForYear}
          </div>
          <div>
            <div style="font-size: 1.5rem; font-weight: bold; margin-bottom: 5px;">
              ${lastName ? `${firstName} ${lastName}` : firstName}
            </div>
            <div style="font-size: 1.1rem; opacity: 0.9;">
              #${playerJerseyForYear} | ${playerPositionForYear} | <span class="team-abbreviation">${playerTeamAbbr}</span>
            </div>
          </div>
        `;
      }
      

    }
  }
  
  // Create year selector HTML for the header
  const currentYear = new Date().getFullYear();
  const startYear = 2020;
  
  const yearSelectorHtml = `
    <select id="playerYearSelector" style="padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; background: white; margin-left: auto;">
      ${Array.from({length: currentYear - startYear + 1}, (_, i) => currentYear - i).map(year => 
        `<option value="${year}" ${year === displayYear ? 'selected' : ''}>${year}</option>`
      ).join('')}
    </select>
  `;
  
  // Fetch competition statistics based on player's league for that year
  let competitionStatsHtml = '';
  
  try {
    let allCompetitionStats = [];
    
    // For transfer years, fetch competitions from both leagues
    if (selectedPlayer?.transferInfo) {
      console.log('Transfer year detected, fetching competitions from both leagues');
      const { fromLeague, toLeague } = selectedPlayer.transferInfo;
      
      // Fetch from FROM league competitions
      if (LEAGUE_COMPETITIONS[fromLeague]) {
        console.log(`Fetching competitions for FROM league: ${fromLeague}`);
        const fromCompetitions = LEAGUE_COMPETITIONS[fromLeague];
        const fromCompetitionStats = await fetchCompetitionStats(selectedPlayer.id, fromCompetitions, displayYear);
        console.log(`FROM league competition stats:`, fromCompetitionStats);
        
        // Add league identifier to each stat
        fromCompetitionStats.forEach(stat => {
          stat.sourceLeague = fromLeague;
          stat.sourceLeagueName = Object.keys(LEAGUES).find(key => LEAGUES[key].code === fromLeague) || fromLeague;
        });
        
        allCompetitionStats.push(...fromCompetitionStats);
      }
      
      // Fetch from TO league competitions (avoid duplicates)
      if (LEAGUE_COMPETITIONS[toLeague] && toLeague !== fromLeague) {
        console.log(`Fetching competitions for TO league: ${toLeague}`);
        const toCompetitions = LEAGUE_COMPETITIONS[toLeague];
        const toCompetitionStats = await fetchCompetitionStats(selectedPlayer.id, toCompetitions, displayYear);
        console.log(`TO league competition stats:`, toCompetitionStats);
        
        // Add league identifier to each stat
        toCompetitionStats.forEach(stat => {
          stat.sourceLeague = toLeague;
          stat.sourceLeagueName = Object.keys(LEAGUES).find(key => LEAGUES[key].code === toLeague) || toLeague;
        });
        
        allCompetitionStats.push(...toCompetitionStats);
      }
    } else {
      // Non-transfer year, use single league approach
      if (selectedPlayer?.id && leagueForCompetitions && LEAGUE_COMPETITIONS[leagueForCompetitions]) {
        console.log(`Fetching competitions for single league: ${leagueForCompetitions}`);
        const competitions = LEAGUE_COMPETITIONS[leagueForCompetitions];
        const competitionStats = await fetchCompetitionStats(selectedPlayer.id, competitions, displayYear);
        console.log(`Single league competition stats:`, competitionStats);
        
        // Add league identifier to each stat
        competitionStats.forEach(stat => {
          stat.sourceLeague = leagueForCompetitions;
          stat.sourceLeagueName = Object.keys(LEAGUES).find(key => LEAGUES[key].code === leagueForCompetitions) || leagueForCompetitions;
        });
        
        allCompetitionStats = competitionStats;
      }
    }
    
    if (allCompetitionStats.length > 0) {
      console.log('Rendering competition stats:', allCompetitionStats);
      
      // Determine if the player is a goalkeeper
      const isGoalkeeper = getPlayerType(playerPositionForYear) === 'goalkeeper';
      
      // Group stats by source league for better organization
      const statsByLeague = allCompetitionStats.reduce((acc, stat) => {
        const league = stat.sourceLeague || 'unknown';
        if (!acc[league]) acc[league] = [];
        acc[league].push(stat);
        return acc;
      }, {});
      
      competitionStatsHtml = Object.entries(statsByLeague).map(([league, stats]) => {
        const leagueName = stats[0]?.sourceLeagueName || league;
        
        return `
          <div style="margin-top: 20px; margin-bottom: 15px;">
            <h4 style="color: #333; margin: 0 0 15px 0; font-size: 1.1rem; font-weight: bold; border-bottom: 1px solid ${nameColorChange === 'black' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)'}; padding-bottom: 8px;">
              ${leagueName} Domestic Cup Competitions
            </h4>
            ${stats.map(stat => `
              <div style="background: #f8f9fa; border: 1px solid ${nameColorChange === 'black' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)'}; border-radius: 8px; padding: 15px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; flex: 1;">
                  <img src="https://a.espncdn.com/i/leaguelogos/soccer/500/${stat.competition.logo}.png" 
                       alt="${stat.competition.name}" 
                       style="width: 40px; height: 40px; margin-right: 15px; border-radius: 4px;"
                       onerror="this.style.display='none'">
                  <div>
                    <div style="font-size: 1rem; font-weight: 600; color: #333; margin-bottom: 2px;">
                      ${stat.competition.name}
                    </div>
                  </div>
                </div>
                <div style="display: flex; gap: 20px; align-items: center;">
                  <div style="text-align: center;">
                    <div style="font-size: 1.3rem; font-weight: bold; color: #333;">${stat.appearances}</div>
                    <div style="font-size: 0.8rem; color: #777;">APP</div>
                  </div>
                  <div style="text-align: center;">
                    <div style="font-size: 1.3rem; font-weight: bold; color: #333;">${stat.minutesPlayed}</div>
                    <div style="font-size: 0.8rem; color: #777;">MIN</div>
                  </div>
                  ${isGoalkeeper ? `
                    <div style="text-align: center;">
                      <div style="font-size: 1.3rem; font-weight: bold; color: #333;">${stat.cleanSheets}</div>
                      <div style="font-size: 0.8rem; color: #777;">CLS</div>
                    </div>
                    <div style="text-align: center;">
                      <div style="font-size: 1.3rem; font-weight: bold; color: #333;">${stat.goalsAgainst}</div>
                      <div style="font-size: 0.8rem; color: #777;">GA</div>
                    </div>
                  ` : `
                    <div style="text-align: center;">
                      <div style="font-size: 1.3rem; font-weight: bold; color: #333;">${stat.goals}</div>
                      <div style="font-size: 0.8rem; color: #777;">GLS</div>
                    </div>
                    <div style="text-align: center;">
                      <div style="font-size: 1.3rem; font-weight: bold; color: #333;">${stat.assists}</div>
                      <div style="font-size: 0.8rem; color: #777;">AST</div>
                    </div>
                  `}
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }).join('');
    } else {
      console.log('No competition stats found');
    }
  } catch (error) {
    console.error('[DEBUG] Error fetching competition statistics:', error);
    // If there's an error, just continue without competition stats
  }
  
  // Define stats to show based on position, mapped to actual API field names from c1.txt
  let statsToShow = [];
  
  if (position === 'G' || position === 'Goalkeeper') {
    // Goalkeeper stats - using actual API field names from c1.txt
    statsToShow = [
      { key: 'appearances', label: 'Appearances', category: 'general' },
      { key: 'saves', label: 'Saves', category: 'goalKeeping' },
      { key: 'cleanSheet', label: 'Clean Sheets', category: 'goalKeeping' },
      { key: 'goalsConceded', label: 'Goals Against', category: 'goalKeeping' },
      { key: 'ownGoals', label: 'Own Goals', category: 'general' },
      { key: 'totalClearance', label: 'Clearances', category: 'defending' },
      { key: 'yellowCards', label: 'Yellow Cards', category: 'general' },
      { key: 'redCards', label: 'Red Cards', category: 'general' }
    ];
  } else if (position === 'D' || position === 'Defender') {
    // Field player stats - using actual API field names from c1.txt
    statsToShow = [
      { key: 'appearances', label: 'Appearances', category: 'general' },
      { key: 'totalGoals', label: 'Total Goals', category: 'offensive' },
      { key: 'goalAssists', label: 'Assists', category: 'offensive' },
      { key: 'totalClearance', label: 'Clearances', category: 'defensive' },
      { key: 'totalTackles', label: 'Tackles', category: 'defensive' },
      { key: 'foulsCommitted', label: 'Fouls', category: 'general' },
      { key: 'yellowCards', label: 'Yellow Cards', category: 'general' },
      { key: 'subIns', label: 'Subbed In', category: 'general' }
    ];
  } else {
    statsToShow = [
      { key: 'appearances', label: 'Appearances', category: 'general' },
      { key: 'totalGoals', label: 'Total Goals', category: 'offensive' },
      { key: 'goalAssists', label: 'Assists', category: 'offensive' },
      { key: 'totalShots', label: 'Shots', category: 'offensive' },
      { key: 'shotsOnTarget', label: 'Shots on Target', category: 'offensive' },
      { key: 'foulsCommitted', label: 'Fouls', category: 'general' },
      { key: 'offsides', label: 'Offsides', category: 'offensive' },
      { key: 'subIns', label: 'Subbed In', category: 'general' }
    ];
  }
  
  // Create stats display using your exact extraction pattern
  const statsHtml = statsToShow.map(statConfig => {
    // Use displayValue first, then fall back to value for compatibility
    const statObj = selectedPlayer?.statistics?.splits?.categories?.find(c => c.name === statConfig.category)?.stats?.find(s => s.name === statConfig.key);
    const value = statObj?.displayValue || statObj?.value || "0";
    
    // Debug logging to trace where stats are coming from
    if (statConfig.key === 'appearances') {
      console.log('DEBUG: Appearances stat object:', statObj);
      console.log('DEBUG: Full categories:', selectedPlayer?.statistics?.splits?.categories);
      console.log('DEBUG: selectedPlayer.statistics source:', selectedPlayer?.statistics);
    }
    console.log(`Stat ${statConfig.key}: displayValue = ${statObj?.displayValue}, value = ${statObj?.value}, using = ${value}`);



    return `
      <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
        <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">
          ${value}
        </div>
        <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">
          ${statConfig.label}
        </div>
      </div>
    `;
  }).join('');
  
  contentDiv.innerHTML = `
    <div id="playerStatsCard" style="position: relative;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid ${nameColorChange === 'black' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.3)'}; padding-bottom: 10px;">
        <h3 style="color: #333; margin: 0; font-size: 1.3rem; font-weight: bold;">
          ${position === 'G' || position === 'Goalkeeper' ? 'Goalkeeper' : 'Field Player'} Statistics
        </h3>
        <div style="display: flex; align-items: center; gap: 15px;">
          <button onclick="copyPlayerStatsAsImage('playerStatsCard')" style="
            background: ${teamColor || '#007bff'}; 
            color: ${nameColorChange}; 
            border: none; 
            padding: 8px 16px; 
            border-radius: 6px; 
            cursor: pointer; 
            font-size: 14px; 
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: background-color 0.2s;
          " onmouseover="this.style.backgroundColor='${teamColor ? teamColor + 'CC' : '#0056b3'}'" onmouseout="this.style.backgroundColor='${teamColor || '#007bff'}'" title="Copy statistics as image">
            📋 Copy ${window.innerWidth < 525 ? '' : ' as Image'}
          </button>
          <div id="yearSelectorContainer">
            ${yearSelectorHtml}
          </div>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px;">
        ${statsHtml}
      </div>
      
      ${competitionStatsHtml}
      
      <p style="text-align: center; color: #777; margin-top: 10px; font-style: italic; font-size: 0.9rem;">
        Statistics from ${displayYear} season
      </p>
    </div>
  `;
  
  // Re-attach event listener for year selector after DOM update
  setTimeout(() => {
    const yearSelector = document.getElementById('playerYearSelector');
    if (yearSelector) {
      // Remove any existing listeners to prevent duplicates
      yearSelector.replaceWith(yearSelector.cloneNode(true));
      const newYearSelector = document.getElementById('playerYearSelector');
      
      newYearSelector.addEventListener('change', async () => {
        const selectedYear = parseInt(newYearSelector.value);
        console.log(`Year selector changed to: ${selectedYear}`);
        
        // Get player ID from global selectedPlayer or window.selectedPlayer
        const playerId = window.selectedPlayer?.id || selectedPlayer?.id;
        console.log(`Using player ID: ${playerId}`);
        
        if (!playerId) {
          console.error('No player ID available for year change');
          return;
        }
        
        // Show loading message
        contentDiv.innerHTML = '<div style="text-align: center; padding: 20px;">Loading statistics for ' + selectedYear + '...</div>';
        
        // Use the player ID and position
        await loadPlayerStatsForYear(playerId, position, contentDiv, selectedYear);
      });
    }
  }, 100);
}

function updateLeagueButtonDisplay() {
  const isSmallScreen = window.innerWidth < 525;
  document.querySelectorAll(".league-button").forEach(button => {
    const text = button.querySelector(".league-text");
    const logo = button.querySelector(".league-logo");
    
    if (isSmallScreen) {
      text.style.display = "none";
      logo.style.display = "block";
    } else {
      text.style.display = "block";
      logo.style.display = "none";
    }
  });
}

function setupNavbar() {
  const navToggle = document.querySelector(".nav-toggle");
  const dropdownMenu = document.querySelector(".dropdown-menu");
  const navLinks = document.querySelectorAll(".nav-link, .dropdown-link");

  if (!navToggle || !dropdownMenu) {
    console.error("Navbar toggle or dropdown menu not found.");
    return;
  }

  // Highlight the active link
  const currentPath = window.location.pathname.split("/").pop();
  navLinks.forEach(link => {
    if (link.getAttribute("href") === currentPath) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });

  navToggle.addEventListener("click", () => {
    dropdownMenu.classList.toggle("active");
    const isActive = dropdownMenu.classList.contains("active");
    dropdownMenu.setAttribute("aria-hidden", !isActive);
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (event) => {
    if (!navToggle.contains(event.target) && !dropdownMenu.contains(event.target)) {
      dropdownMenu.classList.remove("active");
      dropdownMenu.setAttribute("aria-hidden", "true");
    }
  });
}

// Function to check if a player can be added to comparison
function canAddPlayerToComparison(newPlayer) {
  if (playersForComparison.length === 0) {
    return true; // First player can always be added
  }

  const firstPlayer = playersForComparison[0];
  
  // Check league restriction - must be same league
  if (firstPlayer.league !== newPlayer.league) {
    return false;
  }

  // Check position restriction
  const firstPlayerType = getPlayerType(firstPlayer.position);
  const newPlayerType = getPlayerType(newPlayer.position);
  
  return firstPlayerType === newPlayerType;
}

// Function to determine player type (goalkeeper vs field)
function getPlayerType(position) {
  const goalkeepers = ['Goalkeeper', 'GK', 'G'];
  return goalkeepers.includes(position) ? 'goalkeeper' : 'field';
}

// Function to show comparison error message
function showComparisonError(playerData) {
  if (playersForComparison.length === 0) return;
  
  const firstPlayer = playersForComparison[0];
  let errorMessage = '';
  
  if (firstPlayer.league !== playerData.league) {
    errorMessage = 'Players must be from the same league for comparison.';
  } else {
    const firstPlayerType = getPlayerType(firstPlayer.position);
    const newPlayerType = getPlayerType(playerData.position);
    
    if (firstPlayerType !== newPlayerType) {
      errorMessage = `Cannot compare ${firstPlayerType}s with ${newPlayerType} players.`;
    }
  }
  
  // Show error message
  alert(errorMessage);
}

// Function to clear comparison selection
function clearComparison() {
  playersForComparison = [];
  
  // Refresh the display to update button text
  if (typeof displayRosterPlayers === 'function') {
    displayRosterPlayers();
  }
}

// Fetch all soccer players for league-wide comparison
async function fetchAllSoccerPlayers() {
  // Return cached data if already fetched
  if (allLeaguePlayers.length > 0) {
    return allLeaguePlayers;
  }

  try {
    await loadTeamInfo(); // Ensure team info is loaded first

    
    // Ensure current team roster is loaded first
    if (allRosterPlayers.length === 0) {

      try {
        const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/teams/${currentTeamId}/roster?season=2025`);
        const data = await response.json();
        
        if (data.athletes && data.athletes.length > 0) {
          allRosterPlayers = data.athletes.map(athlete => {
            const player = athlete.athlete || athlete;
            
            let firstName, lastName;

            // If firstName has a space, split it into the initial and the second part as the last name
            if (player.firstName && player.firstName.includes(' ')) {
              const nameParts = player.firstName.split(' ');
              firstName = nameParts[0]; // Initial of the first part
              lastName = nameParts.slice(1).join(' ');  // The rest is treated as the last name
            } else {
              firstName = player.firstName || "Unknown";
              // Only use lastName if it exists and is different from firstName
              lastName = (player.lastName && player.lastName !== player.firstName) ? player.lastName : "";
            }

            return {
              id: player.id,
              fullName: player.fullName || player.displayName || player.name || 'Unknown Player',
              firstName: firstName,
              lastName: lastName,
              position: player.position?.abbreviation || player.position?.name || 'N/A',
              jersey: player.jersey || player.number || 'N/A',
              teamAbbr: currentTeam?.abbreviation || currentTeam?.shortDisplayName || 'UNK',
              teamId: currentTeamId,
              league: currentLeague,
              fullPlayerData: player,
            };
          });

        }
      } catch (error) {
        console.error('Error loading current team roster:', error);
      }
    }
    
    // Start with already loaded roster data from current team
    // Ensure current team players have consistent data structure
    const currentTeamPlayers = allRosterPlayers.map(player => {
      let firstName, lastName;

      // If firstName has a space, split it into the initial and the second part as the last name
      if (player.firstName.includes(' ')) {
        const nameParts = player.firstName.split(' ');
        firstName = nameParts[0]; // Initial of the first part
        lastName = nameParts.slice(1).join(' ');  // The rest is treated as the last name
      } else {
        firstName = player.firstName || "Unknown";
        // Only use lastName if it exists and is different from firstName
        lastName = (player.lastName && player.lastName !== player.firstName) ? player.lastName : "";
      }

      return {
        id: player.id,
        firstName: firstName,
        lastName: lastName,
        displayName: lastName ? `${firstName} ${lastName}`.trim() : firstName,
        position: player.position,
        team: currentTeam?.displayName || 'Unknown Team',
        teamAbbr: currentTeam?.abbreviation || currentTeam?.shortDisplayName || 'UNK',
        teamId: player.teamId || currentTeamId,
        league: currentLeague, // Ensure consistent league value
        jersey: player.jersey
      };
    });
    
    const allPlayers = [...currentTeamPlayers];


    
    // Fetch only the current league
    try {
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/teams`);
      const data = await response.json();
      
      // Fetch rosters for other teams (skip current team since we already have it)
      const otherTeams = data.sports[0].leagues[0].teams.filter(team => team.team.id !== currentTeamId);

      
      const teamPromises = otherTeams.map(async (team) => {
        try {
          const teamId = team.team.id;
          const rosterResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/teams/${teamId}/roster?season=2025`);
          const rosterData = await rosterResponse.json();
          
          if (rosterData.athletes) {
            return rosterData.athletes.map(athlete => {
              let firstName, lastName;

              // If firstName has a space, split it into the initial and the second part as the last name
              if (athlete.firstName && athlete.firstName.includes(' ')) {
                const nameParts = athlete.firstName.split(' ');
                firstName = nameParts[0]; // Initial of the first part
                lastName = nameParts.slice(1).join(' ');  // The rest is treated as the last name
              } else {
                firstName = athlete.firstName || "Unknown";
                // Only use lastName if it exists and is different from firstName
                lastName = (athlete.lastName && athlete.lastName !== athlete.firstName) ? athlete.lastName : "";
              }

              const position = athlete.position?.abbreviation || athlete.position?.name || "Unknown";
              
              return {
                id: athlete.id,
                firstName: firstName,
                lastName: lastName,
                displayName: lastName ? `${firstName} ${lastName}`.trim() : firstName,
                position: position,
                team: team.team.displayName,
                teamAbbr: team.team.abbreviation || team.team.displayName.substring(0, 3).toUpperCase(),
                teamId: team.team.id, // Add team ID for targeted API calls
                league: currentLeague,
                jersey: athlete.jersey || 'N/A'
              };
            });
          }
          return [];
        } catch (teamError) {
          console.error(`Error fetching team ${team.team.displayName}:`, teamError);
          return [];
        }
      });
      
      const teamRosters = await Promise.all(teamPromises);
      allPlayers.push(...teamRosters.flat()); // Add other teams' players
    } catch (leagueError) {
      console.error(`Error fetching league ${currentLeague}:`, leagueError);
    }
    
    allLeaguePlayers = allPlayers;

    return allPlayers;
  } catch (error) {
    console.error('Error fetching soccer players:', error);
    return [];
  }
}

// Game log functionality
async function showGameLogInterface() {

  
  // Find the stats container - it's the 2nd element added to modalContent
  const modal = document.querySelector('.modal-overlay');
  if (!modal) {
    console.error('Modal not found');
    return;
  }

  const modalContent = modal.querySelector('.modal-content');
  if (!modalContent) {
    console.error('Modal content not found');
    return;
  }

  // Get all direct children of modalContent
  const children = Array.from(modalContent.children);

  
  // The statsContainer should be the 4th child (index 3) after adding year selector
  // Order: closeButton(0), playerHeader(1), yearSelectorSection(2), statsContainer(3), sliderSection(4), searchSection(5)
  let statsContainer = children[3];
  
  if (!statsContainer) {
    console.error('Stats container not found in modal structure');

    return;
  }
  
  if (!selectedPlayer) {
    console.error('No selected player');
    return;
  }


  
  // Get today's date using sports-adjusted date logic for consistency
  function getAdjustedDateForSports() {
    const now = new Date();
    const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    
    if (estNow.getHours() < 5) { // Use 5 AM for soccer (European games can end late due to time zones)
      estNow.setDate(estNow.getDate() - 1);
    }
    
    const adjustedDate = estNow.getFullYear() + "-" +
                         String(estNow.getMonth() + 1).padStart(2, "0") + "-" +
                         String(estNow.getDate()).padStart(2, "0");
    
    return adjustedDate;
  }
  
  const todayString = getAdjustedDateForSports();
  
  statsContainer.innerHTML = `
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; border: 1px solid #ddd; display: inline-flex; align-items: center; gap: 12px;">
        <div style="font-weight: bold; color: #333;">Select a game date:</div>
        <input type="date" id="gameLogDatePicker" value="${todayString}" style="padding: 12px 16px; border: 2px solid ${teamColor}; border-radius: 8px; font-size: 16px; outline: none; cursor: pointer; background: white; color: #333; width: 200px; font-weight: 500;">
      </div>
    </div>
    <div id="gameLogResults"></div>
  `;

  // Add date picker event listener
  const datePicker = document.getElementById('gameLogDatePicker');
  if (datePicker) {
    datePicker.addEventListener('change', async (e) => {
      const selectedDate = e.target.value;

      if (selectedDate) {
        await loadGameLogForDate(selectedDate);
      }
    });

    
    // Automatically load today's game log when interface first opens

    await loadGameLogForDate(todayString);
  } else {
    console.error('Date picker not found');
  }
}

async function showOverallStats() {
  // Find the stats container using the same approach as showGameLogInterface
  const modal = document.querySelector('.modal-overlay');
  if (!modal) {
    console.error('Modal not found');
    return;
  }

  const modalContent = modal.querySelector('.modal-content');
  if (!modalContent) {
    console.error('Modal content not found');
    return;
  }

  // Get all direct children of modalContent
  const children = Array.from(modalContent.children);
  
  // The statsContainer should be the 4th child (index 3) after adding year selector
  let statsContainer = children[3];
  
  if (!statsContainer || !selectedPlayer) {
    console.error('Stats container not found or no selected player');
    return;
  }

  // Get the selected year from the year selector
  const yearSelector = document.getElementById('playerYearSelector');
  const selectedYear = yearSelector ? parseInt(yearSelector.value) : new Date().getFullYear();

  // Show loading message
  statsContainer.innerHTML = '<div style="text-align: center; padding: 20px;">Loading overall statistics...</div>';
  
  // Load the player stats for the selected year
  await loadPlayerStatsForYear(selectedPlayer.id, selectedPlayerPosition, statsContainer, selectedYear);
}

async function loadGameLogForDate(date) {
  const resultsContainer = document.getElementById('gameLogResults');
  if (!resultsContainer || !selectedPlayer) return;

  try {
    // Add loading spinner
    resultsContainer.innerHTML = `
      <div style="text-align: center; padding: 40px 20px;">
        <div style="font-size: 2rem; margin-bottom: 15px;">⚽</div>
        <div style="color: #777; font-size: 1.1rem; margin-bottom: 15px;">Loading game data...</div>
        <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid ${teamColor}; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
      </div>
    `;

    // Add spinner style if not exists
    if (!document.getElementById('spinner-style')) {
      const style = document.createElement('style');
      style.id = 'spinner-style';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    // Get season year based on the selected date, not current date
    function getSeasonYearForDate(dateStr) {
      const selectedDate = new Date(dateStr);
      const selectedMonth = selectedDate.getMonth() + 1; // 0-based, so add 1
      const selectedYear = selectedDate.getFullYear();
      
      // Season runs from August 1 to June 30
      // Return the starting year of the season for ESPN API
      // If the date is from August-December, it's the start of the season (use current year)
      // If the date is from January-June, it's the end of the season (use previous year)
      // If the date is in July, it's off-season (use previous year)
      if (selectedMonth >= 8) {
        return selectedYear; // Start of season (e.g., Aug 2023 = 2023-24 season = 2023)
      } else {
        return selectedYear - 1; // End of season (e.g., Mar 2024 = 2023-24 season = 2023)
      }
    }
    
    const seasonYear = getSeasonYearForDate(date);
    
    // Get the player's team and league for the specific season year
    let teamIdForSeason = currentTeamId; // Default to current team
    let leagueForSeason = currentLeague; // Default to current league
    let isTransferSeason = false;
    let transferInfo = null;
    
    // Check if this date falls in a transfer season and get transfer info
    if (window.selectedPlayer && window.selectedPlayer.transactions) {
      console.log('Game log: Checking for transfers in season:', seasonYear);
      
      const transferInThisSeason = window.selectedPlayer.transactions.items.find(transaction => {
        const transactionDate = new Date(transaction.date);
        const transactionYear = transactionDate.getFullYear();
        const month = transactionDate.getMonth() + 1;
        
        let seasonYear_transaction;
        if (month >= 8) {
          // August to December belongs to current year's season
          // e.g., August 2024 = Season 2024
          seasonYear_transaction = transactionYear;
        } else {
          // January to July belongs to previous year's season
          // e.g., February 2024 = Season 2023 (since season 2023 runs Aug 2023 - July 2024)
          seasonYear_transaction = transactionYear - 1;
        }
        
        return seasonYear_transaction === seasonYear;
      });
      
      if (transferInThisSeason) {
        isTransferSeason = true;
        const transferDate = new Date(transferInThisSeason.date);
        const selectedDate = new Date(date);
        
        // Extract team info from transfer
        const fromTeamMatch = transferInThisSeason.from.$ref.match(/teams\/(\d+)/);
        const fromLeagueMatch = transferInThisSeason.from.$ref.match(/leagues\/([^\/]+)\/seasons/);
        const toTeamMatch = transferInThisSeason.to.$ref.match(/teams\/(\d+)/);
        const toLeagueMatch = transferInThisSeason.to.$ref.match(/leagues\/([^\/]+)\/seasons/);
        
        if (fromTeamMatch && toTeamMatch && fromLeagueMatch && toLeagueMatch) {
          transferInfo = {
            fromTeamId: fromTeamMatch[1],
            fromLeague: fromLeagueMatch[1],
            toTeamId: toTeamMatch[1],
            toLeague: toLeagueMatch[1],
            transferDate: transferDate
          };
          
          // Determine which team to use based on the selected date
          if (selectedDate < transferDate) {
            // Before transfer - use FROM team
            teamIdForSeason = transferInfo.fromTeamId;
            leagueForSeason = transferInfo.fromLeague;
            console.log(`Game log: Date ${date} is before transfer, using FROM team ${teamIdForSeason} (${leagueForSeason})`);
          } else {
            // After transfer - use TO team
            teamIdForSeason = transferInfo.toTeamId;
            leagueForSeason = transferInfo.toLeague;
            console.log(`Game log: Date ${date} is after transfer, using TO team ${teamIdForSeason} (${leagueForSeason})`);
          }
        }
      }
    }
    
    // If not a transfer season, use the original logic to get team/league for season
    
    // If not a transfer season, use the original logic to get team/league for season
    if (!isTransferSeason) {
      // Fetch ESPN API data for the specific season to get accurate defaultTeam and defaultLeague
      try {
        console.log('Game log: Fetching season data for non-transfer season');
        const playerSeasonResponse = await fetch(convertToHttps(`http://sports.core.api.espn.com/v2/sports/soccer/leagues/${currentLeague}/seasons/${seasonYear}/athletes/${selectedPlayer.id}?lang=en&region=us`));
      
      if (playerSeasonResponse.ok) {
        const playerSeasonData = await playerSeasonResponse.json();

        
        // Check for defaultTeam and defaultLeague in season-specific data first
        if (playerSeasonData.defaultTeam && playerSeasonData.defaultTeam.$ref) {
          const teamRefMatch = playerSeasonData.defaultTeam.$ref.match(/teams\/(\d+)/);
          if (teamRefMatch) {
            teamIdForSeason = teamRefMatch[1];

          }
        }
        
        if (playerSeasonData.defaultLeague && playerSeasonData.defaultLeague.$ref) {
          const leagueRefMatch = playerSeasonData.defaultLeague.$ref.match(/leagues\/([^?]+)/);
          if (leagueRefMatch) {
            leagueForSeason = leagueRefMatch[1];

          }
        }
        
        // Fallback to team $ref if defaultTeam not available
        if (!playerSeasonData.defaultTeam && playerSeasonData.team && playerSeasonData.team.$ref) {
          const teamRefMatch = playerSeasonData.team.$ref.match(/teams\/(\d+)/);
          if (teamRefMatch) {
            teamIdForSeason = teamRefMatch[1];

          }
        }
      } else {

        
        // Use stored defaultTeam and defaultLeague if available from initial fetch
        if (selectedPlayer.defaultTeam && selectedPlayer.defaultLeague) {
          teamIdForSeason = selectedPlayer.defaultTeam;
          leagueForSeason = selectedPlayer.defaultLeague;

        }
      }
    } catch (error) {

      
      // Use stored defaultTeam and defaultLeague if available from initial fetch
      if (selectedPlayer.defaultTeam && selectedPlayer.defaultLeague) {
        teamIdForSeason = selectedPlayer.defaultTeam;
        leagueForSeason = selectedPlayer.defaultLeague;
        console.log('Game log: Using stored defaults (error fallback)');
      } else {
        console.log('Game log: No stored defaults available');
      }
    }
    } // End of isTransferSeason check

    // Format date for API (YYYYMMDD)
    const formattedDate = date.replace(/-/g, '');
    
    // Find games for the selected date using all competitions (main league + domestic cups)
    const allGames = await fetchMatchesFromAllCompetitions(formattedDate, leagueForSeason, teamIdForSeason);
    

    
    // Find game where our team participated using season-specific team ID
    const teamGame = allGames.find(event => {
      const competition = event.competitions?.[0];
      return competition?.competitors?.some(competitor => 
        competitor.team.id === teamIdForSeason
      );
    });

    if (!teamGame) {
      // Parse the date correctly to avoid timezone issues
      const [year, month, day] = date.split('-');
      const gameDate = new Date(year, month - 1, day); // month is 0-indexed
      
      // Get team name for display (try to fetch if using different team)
      let teamDisplayName = currentTeam?.shortDisplayName || 'Team';
      if (teamIdForSeason !== currentTeamId) {
        try {
          const teamInfoResponse = await fetch(convertToHttps(`http://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueForSeason}/teams/${teamIdForSeason}?lang=en&region=us`));
          if (teamInfoResponse.ok) {
            const teamInfo = await teamInfoResponse.json();
            teamDisplayName = teamInfo.shortDisplayName || teamInfo.displayName || teamDisplayName;
          }
        } catch (error) {

        }
      }
      
      resultsContainer.innerHTML = `
        <div style="border: 1px solid #ddd; border-radius: 12px; padding: 40px; background: #f8f9fa; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 15px;">📅</div>
          <div style="color: #777; font-size: 1.1rem; margin-bottom: 15px; font-weight: 500;">
            No game found for this date
          </div>
          <div style="color: #999; font-size: 0.95rem; line-height: 1.4;">
            ${teamDisplayName} did not play on ${gameDate.toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })} in ${leagueForSeason.toUpperCase()}
          </div>
        </div>
      `;
      return;
    }

    // Check if game exists and show stats for both in-progress and completed games
    if (teamGame.status.type.state === 'pre') {
      resultsContainer.innerHTML = `
        <div style="border: 1px solid #ddd; border-radius: 12px; padding: 40px; background: #fff3cd; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 15px;">⏰</div>
          <div style="color: #856404; font-size: 1.1rem; margin-bottom: 15px; font-weight: 500;">
            Game not yet started
          </div>
          <div style="color: #856404; font-size: 0.95rem; line-height: 1.4;">
            This game is scheduled but has not started yet. Game log data will be available after kickoff.
          </div>
        </div>
      `;
      return;
    }

    // Display player game stats
    await displayPlayerGameStats(teamGame, date, teamIdForSeason, leagueForSeason);

  } catch (error) {
    console.error('Error loading game log:', error);
    resultsContainer.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; background: #f8d7da; border-radius: 8px; border: 1px solid #f5c6cb;">
        <div style="font-size: 1.2rem; color: #721c24; margin-bottom: 10px;">❌</div>
        <div style="color: #721c24; font-size: 1rem;">Error loading game data</div>
        <div style="color: #721c24; font-size: 0.9rem; margin-top: 5px;">Please try again or select a different date</div>
      </div>
    `;
  }
}

async function displayPlayerGameStats(game, date, teamIdForSeason, leagueForSeason = currentLeague) {
  const resultsContainer = document.getElementById('gameLogResults');
  if (!resultsContainer || !selectedPlayer) return;

  try {
    // Get detailed game data with lineups using the same API as scoreboard.js
    const gameResponse = await fetch(`https://cdn.espn.com/core/soccer/lineups?xhr=1&gameId=${game.id}`);
    const gameData = await gameResponse.json();



    // Get rosters from gamepackageJSON
    const rosters = gameData.gamepackageJSON?.rosters || [];


    if (rosters.length === 0) {
      resultsContainer.innerHTML = `
        <div style="border: 1px solid #ddd; border-radius: 12px; padding: 40px; background: #f8f9fa; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 15px;">📊</div>
          <div style="color: #777; font-size: 1.1rem; margin-bottom: 15px; font-weight: 500;">
            No lineup data for this game
          </div>
          <div style="color: #999; font-size: 0.95rem; line-height: 1.4;">
            Lineup data may not be available for this game
          </div>
        </div>
      `;
      return;
    }

    // Find player in rosters
    let playerData = null;
    let playerTeam = null;

    for (const roster of rosters) {
      const foundPlayer = roster.roster?.find(player => 
        player.athlete?.id === selectedPlayer.id.toString() ||
        player.athlete?.id === selectedPlayer.id ||
        player.athlete?.displayName === selectedPlayer.fullName ||
        (player.athlete?.firstName && player.athlete?.lastName && 
         `${player.athlete.firstName} ${player.athlete.lastName}` === selectedPlayer.fullName)
      );

      if (foundPlayer) {
        playerData = foundPlayer;
        playerTeam = roster;

        break;
      }
    }

    if (!playerData) {
      const competition = game.competitions[0];
      const gameDate = new Date(game.date);
      const opponent = competition.competitors.find(c => c.team.id !== teamIdForSeason);
      const isHomeTeam = competition.competitors.find(c => c.team.id === teamIdForSeason).homeAway === 'home';
      
      resultsContainer.innerHTML = `
        <div style="border: 1px solid #ddd; border-radius: 12px; padding: 40px; background: #f8f9fa; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 15px;">⚽</div>
          <div style="color: #777; font-size: 1.1rem; margin-bottom: 15px; font-weight: 500;">
            Player not found in match squad
          </div>
          <div style="color: #999; font-size: 0.95rem; line-height: 1.4;">
            ${selectedPlayer.fullName} was not in the squad for this game<br>
            <strong>${gameDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong><br>
            ${isHomeTeam ? 'vs' : 'at'} ${opponent.team.displayName}
          </div>
        </div>
      `;
      return;
    }

    // Extract game information
    const competition = game.competitions[0];
    const gameDate = new Date(game.date);
    const teamCompetitor = competition.competitors.find(c => c.team.id === teamIdForSeason);
    const opponentCompetitor = competition.competitors.find(c => c.team.id !== teamIdForSeason);
    
    const teamScore = teamCompetitor.score || "0";
    const opponentScore = opponentCompetitor.score || "0";
    const teamSHTScore = teamCompetitor.shootoutScore;
    const opponentSHTScore = opponentCompetitor.shootoutScore;

    const teamS = teamSHTScore ? `${teamScore} <sup style="font-size: 0.6em; margin-left: 2px;">(${teamSHTScore})</sup>` : teamScore;
    const opponentS = opponentSHTScore ? `${opponentScore} <sup style="font-size: 0.6em; margin-left: 2px;">(${opponentSHTScore})</sup>` : opponentScore;
    const isHomeTeam = teamCompetitor.homeAway === 'home';
    
    // Get season-specific team information and colors
    let seasonTeamColor = teamColor; // Default to current team color
    let seasonTeamName = currentTeam?.displayName || 'Team';
    let seasonTeamAbbr = currentTeam?.abbreviation || currentTeam?.shortDisplayName || 'UNK';
    
    // If using a different team for this season OR different league, fetch its information
    if (teamIdForSeason !== currentTeamId || leagueForSeason !== currentLeague) {
      try {

        const seasonTeamResponse = await fetch(convertToHttps(`http://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueForSeason}/teams/${teamIdForSeason}?lang=en&region=us`));
        
        if (seasonTeamResponse.ok) {
          const seasonTeamData = await seasonTeamResponse.json();

          
          // Apply the same team color logic as in loadTeamInfo()
          const isUsingAlternateColor = ["ffffff", "ffee00", "ffff00", "81f733", "000000", "f7f316", "eef209", "ece83a", "1c31ce", "ffd700"].includes(seasonTeamData.color);
          if (isUsingAlternateColor && seasonTeamData.alternateColor) {
            seasonTeamColor = `#${seasonTeamData.alternateColor}`;
          } else if (seasonTeamData.color) {
            seasonTeamColor = `#${seasonTeamData.color}`;
          }
          
          seasonTeamName = seasonTeamData.displayName || seasonTeamName;
          seasonTeamAbbr = seasonTeamData.abbreviation || seasonTeamData.shortDisplayName || seasonTeamAbbr;
          

        }
      } catch (error) {

      }
    }
    
    // Team logos
    const teamLogo = ["2950", "92"].includes(teamIdForSeason) ? `https://a.espncdn.com/i/teamlogos/soccer/500/${teamIdForSeason}.png` : `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamIdForSeason}.png`;
    const opponentLogo = ["2950", "92"].includes(opponentCompetitor.team.id) ? `https://a.espncdn.com/i/teamlogos/soccer/500/${opponentCompetitor.team.id}.png` : `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${opponentCompetitor.team.id}.png`;

    // Game result and status
    let gameResult = '';
    let gameStatus = '';
    if (game.status.type.state === 'post') {
      const teamScoreInt = parseInt(teamScore);
      const opponentScoreInt = parseInt(opponentScore);
      const teamSHTScoreInt = parseInt(teamSHTScore) || 0;
      const opponentSHTScoreInt = parseInt(opponentSHTScore) || 0;

      if (teamScoreInt > opponentScoreInt || (teamScoreInt === opponentScoreInt && teamSHTScoreInt > opponentSHTScoreInt)) {
        gameResult = 'W';
      } else if (teamScoreInt < opponentScoreInt || (teamScoreInt === opponentScoreInt && teamSHTScoreInt < opponentSHTScoreInt)) {
        gameResult = 'L';
      } else {
        gameResult = 'D';
      }
      gameStatus = 'Final';
    } else if (game.status.type.state === 'in') {
      gameStatus = 'Live';
      gameResult = ''; // No result for in-progress games
    } else {
      gameStatus = 'Scheduled';
      gameResult = '';
    }

    // Extract player stats if available
    const stats = playerData.stats || [];
    const playerStats = stats.reduce((acc, stat) => {
      acc[stat.abbreviation] = stat.displayValue;
      return acc;
    }, {});

    // Create position-specific stats display
    let statsDisplay = '';
    const position = playerData.position?.abbreviation || selectedPlayer.position;
    const seasonJersey = playerData.athlete?.jersey || playerData.jersey || selectedPlayer.jersey;
    
    if (position === 'G') {
      // Goalkeeper stats
      statsDisplay = `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 1rem; font-weight: bold; margin-bottom: 10px; color: #FFA500;">⚽ Goalkeeper Stats</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 15px;">
            <div style="text-align: center;">
              <div style="font-size: 1.65rem; font-weight: bold; color: #fff;">${playerStats['SV'] || '0'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 2px;">SV</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.65rem; font-weight: bold; color: #fff;">${playerStats['GA'] || '0'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 2px;">GA</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.65rem; font-weight: bold; color: #fff;">${playerStats['SHF'] || '0'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 2px;">SHF</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.65rem; font-weight: bold; color: #fff;">${playerStats['OG'] || '0'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 2px;">OG</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.65rem; font-weight: bold; color: #fff;">${playerStats['YC'] || '0'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 2px;">YC</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.65rem; font-weight: bold; color: #fff;">${playerStats['RC'] || '0'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 2px;">RC</div>
            </div>
          </div>
        </div>
      `;
    } else {
      // Outfield player stats
      statsDisplay = `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 1rem; font-weight: bold; margin-bottom: 10px; color: #FFA500;">⚽ Match Performance</div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
            <div style="text-align: center;">
              <div style="font-size: 1.65rem; font-weight: bold; color: #fff;">${playerStats['G'] || '0'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 2px;">G</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.65rem; font-weight: bold; color: #fff;">${playerStats['A'] || '0'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 2px;">A</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.65rem; font-weight: bold; color: #fff;">${playerStats['SH'] || '0'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 2px;">SH</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.65rem; font-weight: bold; color: #fff;">${playerStats['ST'] || '0'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 2px;">SOG</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.65rem; font-weight: bold; color: #fff;">${playerStats['YC'] || '0'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 2px;">YC</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.65rem; font-weight: bold; color: #fff;">${playerStats['RC'] || '0'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 2px;">RC</div>
            </div>
          </div>
        </div>
      `;
    }

    // Create the game stats display with NBA-style dark card
    let content = `
      <div id="gameLogCard_${game.id}" style="background: #1a1a1a; color: white; border-radius: 12px; padding: 25px; margin-bottom: 20px; position: relative;">
        <!-- Clipboard Icon -->
        <div onclick="copyGameLogAsImage('gameLogCard_${game.id}')" style="position: absolute; top: 15px; right: 15px; cursor: pointer; padding: 5px; border-radius: 4px; background: rgba(255,255,255,0.1); transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.2)'" onmouseout="this.style.backgroundColor='rgba(255,255,255,0.1)'" title="Copy as image">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </div>
        <!-- Player Header -->
        <div style="display: flex; align-items: center; margin-bottom: 20px; gap: 15px;">
          <div style="width: 60px; height: 60px; background: linear-gradient(135deg, ${seasonTeamColor} 0%, #cccccc 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: bold; color: white;">
            ${seasonJersey}
          </div>
          <div>
            <div style="font-size: 1.3rem; font-weight: bold; margin-bottom: 2px;">${selectedPlayer.fullName}</div>
            <div style="color: #ccc; font-size: 0.9rem;">#${seasonJersey} | ${position} | ${seasonTeamAbbr}</div>
          </div>
        </div>

        <!-- Game Header -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 25px; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 8px; cursor: pointer; transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.15)'" onmouseout="this.style.backgroundColor='rgba(255,255,255,0.1)'" onclick="window.open('scoreboard.html?gameId=${game.id}', '_blank')">
          <div style="display: flex; align-items: center; gap: 15px;">
            <img src="${teamLogo}" alt="${seasonTeamName}" style="height: 30px;" onerror="this.src='soccer-ball-png-24.png';">
            <span style="font-size: 1.1rem; font-weight: bold; color: ${gameResult === 'W' ? '#fff' : '#ccc'};">${teamS}</span>
            <span style="color: #ccc;">-</span>
            <span style="font-size: 1.1rem; font-weight: bold; color: ${gameResult === 'L' ? '#fff' : '#ccc'};">${opponentS}</span>
            <img src="${opponentLogo}" alt="${opponentCompetitor.team.displayName}" style="height: 30px;" onerror="this.src='soccer-ball-png-24.png';">
            ${gameResult ? `<span style="font-weight: bold; color: ${gameResult === 'W' ? '#4CAF50' : gameResult === 'L' ? '#f44336' : '#FFA500'}; font-size: 1.1rem;">${gameResult}</span>` : ''}
          </div>
          <div style="text-align: right; color: #ccc; font-size: 0.85rem;">
            <div style="color: ${gameStatus === 'Live' ? '#4CAF50' : gameStatus === 'Final' ? '#fff' : '#FFA500'}; font-weight: bold; margin-bottom: 2px;">${gameStatus}</div>
            ${gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            <div class="game-details-text" style="font-size: 0.7rem; margin-top: 2px; opacity: 0.7;">Click to view game details</div>
          </div>
        </div>

        <!-- Soccer Stats -->
        ${statsDisplay}

        <!-- Playing Status -->
        <div style="margin-top: 15px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; text-align: center;">
          <div style="color: #ccc; font-size: 0.9rem;">
            Playing Status: <span style="color: #fff; font-weight: bold;">${playerData.starter ? 'Starter' : 'Substitute'}</span>
            ${playerData.formationPlace && playerData.formationPlace !== "0" ? ` | Position: ${playerData.position.abbreviation}` : ''}
          </div>
        </div>
      </div>
    `;

    resultsContainer.innerHTML = content;

  } catch (error) {
    console.error('Error displaying player game stats:', error);
    resultsContainer.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; background: #f8d7da; border-radius: 8px; border: 1px solid #f5c6cb;">
        <div style="font-size: 1.2rem; color: #721c24; margin-bottom: 10px;">❌</div>
        <div style="color: #721c24; font-size: 1rem;">Error loading player stats</div>
        <div style="color: #721c24; font-size: 0.9rem; margin-top: 5px;">Unable to retrieve game statistics</div>
      </div>
    `;
  }
}

// Show player comparison modal (MLB-style)
async function showPlayerComparison(player1, player2) {
  try {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    `;

    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.cssText = `
      background: white;
      border-radius: 10px;
      padding: 20px;
      max-width: 900px;
      width: 95%;
      max-height: 85vh;
      overflow-y: auto;
      position: relative;
    `;

    // Create close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '×';
    closeButton.style.cssText = `
      position: absolute;
      top: 10px;
      right: 15px;
      background: none;
      border: none;
      font-size: 36px;
      cursor: pointer;
      color: #333;
      z-index: 1001;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: background-color 0.2s ease;
    `;
    closeButton.addEventListener('mouseenter', () => {
      closeButton.style.backgroundColor = '#f0f0f0';
    });
    closeButton.addEventListener('mouseleave', () => {
      closeButton.style.backgroundColor = 'transparent';
    });
    closeButton.addEventListener('click', () => {
      document.body.removeChild(modal);
      playersForComparison = []; // Clear comparison when closing
      displayRosterPlayers(); // Refresh display
    });

    // Create modal header and content
    const comparisonHeader = document.createElement('div');
    comparisonHeader.style.cssText = `
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #333;
    `;
    comparisonHeader.innerHTML = `
      <h2 style="margin: 0; color: #333; font-size: 1.8rem;">Player Comparison</h2>
    `;

    // Create players header
    const playersHeader = document.createElement('div');
    playersHeader.style.cssText = `
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 20px;
      margin-bottom: 20px;
      align-items: center;
    `;

    // Player 1 header (no headshot)
    const player1Header = document.createElement('div');
    player1Header.id = 'player1-header';
    player1Header.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 15px;
      padding: 15px;
      background-color: #f8f9fa;
      border-radius: 8px;
      position: relative;
    `;
    
    player1Header.innerHTML = `
      <button class="player-clear-btn" data-player="1" style="
        position: absolute;
        top: 5px;
        right: 5px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background-color: #dc3545;
        color: white;
        border: none;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1002;
      ">×</button>
      <div style="text-align: center;">
        <div class="player-name-display" style="font-size: 1.2rem; font-weight: bold; color: #333;">
          ${player1.firstName} ${player1.lastName}
        </div>
        <div style="font-size: 0.9rem; color: #777; margin-top: 5px;">
          #${player1.jersey || 'N/A'} | ${player1.position} | ${player1.teamAbbr || 'Unknown'}
        </div>
      </div>
    `;

    // VS divider
    const vsDivider = document.createElement('div');
    vsDivider.style.cssText = `
      text-align: center;
      font-size: 1.5rem;
      font-weight: bold;
      color: #333;
    `;
    vsDivider.innerHTML = 'VS';

    // Player 2 header (no headshot)
    const player2Header = document.createElement('div');
    player2Header.id = 'player2-header';
    player2Header.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 15px;
      padding: 15px;
      background-color: #f8f9fa;
      border-radius: 8px;
      position: relative;
    `;
    player2Header.innerHTML = `
      <button class="player-clear-btn" data-player="2" style="
        position: absolute;
        top: 5px;
        left: 5px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background-color: #dc3545;
        color: white;
        border: none;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1002;
      ">×</button>
      <div style="text-align: center;">
        <div class="player-name-display" style="font-size: 1.2rem; font-weight: bold; color: #333;">
          ${player2.firstName} ${player2.lastName}
        </div>
        <div style="font-size: 0.9rem; color: #777; margin-top: 5px;">
          #${player2.jersey || 'N/A'} | ${player2.position} | ${player2.teamAbbr || 'Unknown'}
        </div>
      </div>
    `;

    playersHeader.appendChild(player1Header);
    playersHeader.appendChild(vsDivider);
    playersHeader.appendChild(player2Header);

    // Create stats comparison container
    const statsComparisonContainer = document.createElement('div');
    statsComparisonContainer.id = 'stats-comparison-container';

    modalContent.appendChild(closeButton);
    modalContent.appendChild(comparisonHeader);
    modalContent.appendChild(playersHeader);
    modalContent.appendChild(statsComparisonContainer);
    modal.appendChild(modalContent);

    // Add modal to document
    document.body.appendChild(modal);

    // Add event listeners for individual player clear buttons
    const clearButtons = modalContent.querySelectorAll('.player-clear-btn');
    clearButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const playerNumber = btn.getAttribute('data-player');
        showPlayerSelectionInterface(playerNumber, modal, modalContent, player1, player2);
      });
    });

    // Load and display comparison stats

    
    // Load player statistics for both players
    const [player1Stats, player2Stats] = await Promise.all([
      loadPlayerStatsForComparison(player1.id),
      loadPlayerStatsForComparison(player2.id)
    ]);




    // Create the stats comparison display
    const statsHTML = createStatsComparisonDisplay(player1, player2, player1Stats, player2Stats);
    statsComparisonContainer.innerHTML = statsHTML;
    let firstName, lastName;
    // Add responsive name display
    const updateNameDisplay = () => {
      const nameElements = modalContent.querySelectorAll('.player-name-display');
      nameElements.forEach((element, index) => {
        const player = index === 0 ? player1 : player2;
        if (window.innerWidth <= 525) {
          // For mobile view, just show firstName if lastName is empty
          if (!player.lastName) {
            element.textContent = player.firstName;
          } else if (player.firstName.includes(' ')) {
            const nameParts = player.firstName.split(' ');
            firstName = nameParts[0].charAt(0) + '. '; // Initial of the first part
            lastName = nameParts.slice(1).join(' ');  // The rest is treated as the last name
            element.textContent = firstName + lastName;
          } else {
            // Combine first letter of first name and last name
            element.textContent = player.firstName.charAt(0) + '. ' + player.lastName;
          }
        } else {
          // For desktop view, show full name or just firstName if no lastName
          if (!player.lastName) {
            element.textContent = player.firstName;
          } else {
            element.textContent = `${player.firstName} ${player.lastName}`;
          }
        }
      });
    };

    updateNameDisplay();
    window.addEventListener('resize', updateNameDisplay);

  } catch (error) {
    console.error('Error showing player comparison:', error);
    alert('Error loading player comparison. Please try again.');
  }
}

// Display soccer player comparison
async function displaySoccerPlayerComparison(player1, player2, container) {
  try {
    // Load player statistics for both players
    const [player1Stats, player2Stats] = await Promise.all([
      loadPlayerStatsForComparison(player1.id),
      loadPlayerStatsForComparison(player2.id)
    ]);

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
        <div style="text-align: center;">
          <h3 style="color: #333; margin-bottom: 15px;">${player1.name}</h3>
          <p style="color: #333;"><strong>Position:</strong> ${player1.position}</p>
          <p style="color: #333;"><strong>Team:</strong> ${player1.teamAbbr || 'Unknown'}</p>
        </div>
        <div style="text-align: center;">
          <h3 style="color: #333; margin-bottom: 15px;">${player2.name}</h3>
          <p style="color: #333;"><strong>Position:</strong> ${player2.position}</p>
          <p style="color: #333;"><strong>Team:</strong> ${player2.teamAbbr || 'Unknown'}</p>
        </div>
      </div>
      <div id="stats-comparison-container">
        ${createStatsComparisonDisplay(player1, player2, player1Stats, player2Stats)}
      </div>
    `;
  } catch (error) {
    console.error('Error displaying soccer player comparison:', error);
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error loading comparison data</div>';
  }
}

// Load player statistics for comparison
async function loadPlayerStatsForComparison(playerId) {
  try {

    
    // Try to get player info first to check for multiple teams
    let playerInfo = null;
    let allStatsData = [];
    
    try {
      const playerResponse = await fetch(convertToHttps(`http://sports.core.api.espn.com/v2/sports/soccer/leagues/${currentLeague}/seasons/2025/athletes/${playerId}?lang=en&region=us`));
      if (playerResponse.ok) {
        playerInfo = await playerResponse.json();

        
        // Check for multiple teams like in loadPlayerStatsForYear
        const teamsToCheck = [];
        
        // Add current team
        if (playerInfo.team && playerInfo.team.$ref) {
          const teamMatch = playerInfo.team.$ref.match(/teams\/(\d+)/);
          const leagueMatch = playerInfo.team.$ref.match(/leagues\/([^\/]+)\/seasons/);
          if (teamMatch && leagueMatch) {
            teamsToCheck.push({ teamId: teamMatch[1], league: leagueMatch[1] });

          }
        }
        
        // Add default team if different
        if (playerInfo.defaultTeam && playerInfo.defaultTeam.$ref) {
          const defaultTeamMatch = playerInfo.defaultTeam.$ref.match(/teams\/(\d+)/);
          if (defaultTeamMatch) {
            const defaultTeamId = defaultTeamMatch[1];
            let defaultLeague = currentLeague;
            
            if (playerInfo.defaultLeague && playerInfo.defaultLeague.$ref) {
              const defaultLeagueMatch = playerInfo.defaultLeague.$ref.match(/leagues\/([^?]+)/);
              if (defaultLeagueMatch) {
                defaultLeague = defaultLeagueMatch[1];
              }
            }
            
            // Only add if different
            const isDifferentTeam = !teamsToCheck.some(t => t.teamId === defaultTeamId && t.league === defaultLeague);
            if (isDifferentTeam) {
              teamsToCheck.push({ teamId: defaultTeamId, league: defaultLeague });

            }
          }
        }
        
        // If no teams found, use current league
        if (teamsToCheck.length === 0) {
          teamsToCheck.push({ teamId: 'unknown', league: currentLeague });
        }
        
        // Fetch stats from all teams
        for (const teamInfo of teamsToCheck) {
          try {
            const statsUrl = `http://sports.core.api.espn.com/v2/sports/soccer/leagues/${teamInfo.league}/seasons/2025/types/1/athletes/${playerId}/statistics?lang=en&region=us`;
            const statsResponse = await fetch(convertToHttps(statsUrl));
            
            if (statsResponse.ok) {
              const statsData = await statsResponse.json();
              if (statsData.splits && statsData.splits.categories) {
                allStatsData.push({
                  teamId: teamInfo.teamId,
                  league: teamInfo.league,
                  stats: statsData
                });

              }
            }
          } catch (e) {

          }
        }
        
        // Combine all statistics if we have multiple sources
        if (allStatsData.length > 0) {
          const combinedStats = combinePlayerStatistics(allStatsData);
          return combinedStats;
        }
      }
    } catch (e) {

    }
    
    // Fallback to cached data if ESPN API fails
    const currentTeamPlayer = allRosterPlayers.find(player => player.id === playerId);
    if (currentTeamPlayer && currentTeamPlayer.statistics) {

      return currentTeamPlayer.statistics;
    }
    
    // If all else fails, try roster endpoint as last resort

    try {
      const allPlayers = await fetchAllSoccerPlayers();
      const targetPlayer = allPlayers.find(player => player.id === playerId);
      if (targetPlayer) {
        const teamRosterResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/teams/${targetPlayer.teamId || 'unknown'}/roster?season=2025`);
        if (teamRosterResponse.ok) {
          const teamRosterData = await teamRosterResponse.json();
          const playerWithStats = teamRosterData.athletes?.find(athlete => {
            const athleteData = athlete.athlete || athlete;
            return athleteData.id === playerId;
          });
          
          if (playerWithStats) {
            const athleteData = playerWithStats.athlete || playerWithStats;
            return athleteData.statistics || null;
          }
        }
      }
    } catch (e) {

    }
    

    return null;
  } catch (error) {
    console.error(`Error loading stats for player ${playerId}:`, error);
    return null;
  }
}

// Create stats comparison display like MLB/NBA
function createStatsComparisonDisplay(player1, player2, player1Stats, player2Stats) {
  const isGoalkeeper = getPlayerType(player1.position) === 'goalkeeper';
  
  let statsToCompare = [];
  
  if (isGoalkeeper) {
    // Goalkeeper stats
    statsToCompare = [
      { key: 'appearances', label: 'Appearances', category: 'general' },
      { key: 'saves', label: 'Saves', category: 'goalKeeping' },
      { key: 'shotsFaced', label: 'Shots Faced', category: 'goalKeeping' },
      { key: 'goalsConceded', label: 'Goals Against', category: 'goalKeeping' },
      { key: 'ownGoals', label: 'Own Goals', category: 'general' },
      { key: 'foulsCommitted', label: 'Fouls', category: 'general' },
      { key: 'yellowCards', label: 'Yellow Cards', category: 'general' },
      { key: 'redCards', label: 'Red Cards', category: 'general' }
    ];
  } else {
    // Field player stats
    statsToCompare = [
      { key: 'appearances', label: 'Appearances', category: 'general' },
      { key: 'totalGoals', label: 'Total Goals', category: 'offensive' },
      { key: 'goalAssists', label: 'Assists', category: 'offensive' },
      { key: 'totalShots', label: 'Shots', category: 'offensive' },
      { key: 'shotsOnTarget', label: 'Shots on Target', category: 'offensive' },
      { key: 'foulsCommitted', label: 'Fouls', category: 'general' },
      { key: 'offsides', label: 'Offsides', category: 'offensive' },
      { key: 'subIns', label: 'Subbed In', category: 'general' }
    ];
  }

  const getStatValue = (stats, statConfig) => {
    if (!stats || !stats.splits || !stats.splits.categories) return "0";
    
    const category = stats.splits.categories.find(c => c.name === statConfig.category);
    if (!category) return "N/A";
    
    const stat = category.stats.find(s => s.name === statConfig.key);
    return stat ? stat.displayValue : "0";
  };

  // Build the comparison display using MLB pattern
  let comparisonHTML = `
    <div style="display: flex; flex-direction: column; gap: 15px;">
  `;

  statsToCompare.forEach((statDef) => {
    const stat1Value = getStatValue(player1Stats, statDef);
    const stat2Value = getStatValue(player2Stats, statDef);

    // Convert to numbers for comparison (handle "0" values)
    const num1 = stat1Value === "0" ? 0 : parseFloat(stat1Value) || 0;
    const num2 = stat2Value === "0" ? 0 : parseFloat(stat2Value) || 0;

    // Determine which stats are "lower is better"
    const lowerIsBetter = ['foulsCommitted', 'yellowCards', 'redCards', 'goalsConceded'].includes(statDef.key);
    
    // Determine which is better
    let player1Better = false;
    let player2Better = false;
    
    if (num1 !== num2) {
      if (lowerIsBetter) {
        player1Better = num1 < num2 && num1 > 0;
        player2Better = num2 < num1 && num2 > 0;
      } else {
        player1Better = num1 > num2;
        player2Better = num2 > num1;
      }
    }
    
    comparisonHTML += `
      <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: center; padding: 15px; background-color: #f8f9fa; border-radius: 8px;">
        <!-- Player 1 Stat -->
        <div style="text-align: center; padding: 10px; background-color: ${player1Better ? '#e8f5e8' : 'white'}; border-radius: 6px; ${player1Better ? 'border: 2px solid #28a745;' : 'border: 1px solid #ddd;'}">
          <div style="font-size: 1.3rem; font-weight: bold; color: ${player1Better ? '#28a745' : '#333'}; margin-bottom: 5px;">
            ${stat1Value}
          </div>
        </div>
        
        <!-- Stat Label -->
        <div style="text-align: center; font-weight: bold; color: #333; min-width: 80px; padding: 0 10px;">
          ${statDef.label}
        </div>
        
        <!-- Player 2 Stat -->
        <div style="text-align: center; padding: 10px; background-color: ${player2Better ? '#e8f5e8' : 'white'}; border-radius: 6px; ${player2Better ? 'border: 2px solid #28a745;' : 'border: 1px solid #ddd;'}">
          <div style="font-size: 1.3rem; font-weight: bold; color: ${player2Better ? '#28a745' : '#333'}; margin-bottom: 5px;">
            ${stat2Value}
          </div>
        </div>
      </div>
    `;
  });
  
  comparisonHTML += '</div>';

  return comparisonHTML;
}

// Show player selection interface (search for replacement)
async function showPlayerSelectionInterface(playerNumber, modal, modalContent, currentPlayer1, currentPlayer2) {
  try {

    
    // Get all soccer players
    const allPlayers = await fetchAllSoccerPlayers();
    
    // Find the specific player header to replace by ID
    const headerToReplace = modalContent.querySelector(`#player${playerNumber}-header`);
    
    if (!headerToReplace) {
      console.error(`Could not find header for player ${playerNumber}`);
      return;
    }



    // Clear the stats comparison container when a player is removed
    const statsComparisonContainer = modalContent.querySelector('#stats-comparison-container');
    if (statsComparisonContainer) {
      statsComparisonContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;">Select players to compare their statistics</div>';
    }

    // Create replacement interface
    const replacementInterface = document.createElement('div');
    replacementInterface.id = `player${playerNumber}-replacement`;
    replacementInterface.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 15px;
      background-color: #e9ecef;
      border-radius: 8px;
      border: 2px dashed #6c757d;
      position: relative;
      min-height: 90px;
    `;

    const addButton = document.createElement('button');
    addButton.innerHTML = '+';
    addButton.style.cssText = `
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background-color: #6c757d;
      color: white;
      border: none;
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.2s ease;
    `;

    const addText = document.createElement('div');
    addText.innerHTML = 'Add Player';
    addText.style.cssText = `
      font-size: 12px;
      color: #6c757d;
      font-weight: 500;
    `;

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search any soccer player...';
    searchInput.style.cssText = `
      width: 100%;
      padding: 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 14px;
      outline: none;
      box-sizing: border-box;
      display: none;
    `;

    const searchResults = document.createElement('div');
    searchResults.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      max-height: 150px;
      overflow-y: auto;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: white;
      display: none;
      z-index: 1003;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    `;

    replacementInterface.appendChild(addButton);
    replacementInterface.appendChild(addText);
    replacementInterface.appendChild(searchInput);
    replacementInterface.appendChild(searchResults);

    // Replace the header
    headerToReplace.parentNode.replaceChild(replacementInterface, headerToReplace);


    // Hide the × button of the remaining player
    const otherPlayerNumber = playerNumber === "1" ? "2" : "1";
    const otherPlayerHeader = modalContent.querySelector(`#player${otherPlayerNumber}-header`);
    if (otherPlayerHeader) {
      const otherClearBtn = otherPlayerHeader.querySelector('.player-clear-btn');
      if (otherClearBtn) {
        otherClearBtn.style.display = 'none';
      }
    }

    // Clear the comparison stats as well
    const statsContainer = modalContent.querySelector('#comparison-stats-container');
    if (statsContainer) {
      statsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;">Select a player to start comparison</div>';
    }

    // Add button hover effects
    addButton.addEventListener('mouseenter', () => {
      addButton.style.backgroundColor = '#5a6268';
    });
    addButton.addEventListener('mouseleave', () => {
      addButton.style.backgroundColor = '#6c757d';
    });

    // Add button click to show search
    addButton.addEventListener('click', () => {
      addButton.style.display = 'none';
      addText.style.display = 'none';
      searchInput.style.display = 'block';
      searchInput.focus();
    });

    // Search functionality
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim().toLowerCase();
      
      if (query.length < 2) {
        searchResults.style.display = 'none';
        return;
      }

      searchTimeout = setTimeout(async () => {
        // Get all soccer players first
        const allPlayersData = await fetchAllSoccerPlayers();
        
        // Determine what type of player we're looking for based on the remaining player
        const remainingPlayer = playerNumber === "1" ? currentPlayer2 : currentPlayer1;
        const needsGoalkeeper = getPlayerType(remainingPlayer.position) === 'goalkeeper';
        



        
        const filteredPlayers = allPlayersData
          .filter(player => {
            const fullName = `${player.firstName || ''} ${player.lastName || ''}`.toLowerCase();
            const displayName = (player.displayName || '').toLowerCase();
            const teamName = (player.team || '').toLowerCase();
            const playerIsGoalkeeper = getPlayerType(player.position) === 'goalkeeper';
            
            // Check if query matches player name first (prioritize name over team)
            const nameMatch = fullName.includes(query) || displayName.includes(query);
            const teamMatch = teamName.includes(query);
            
            // Position matching: goalkeeper vs field
            const positionMatch = needsGoalkeeper ? playerIsGoalkeeper : !playerIsGoalkeeper;
            
            // League matching: must be same league
            const leagueMatch = player.league === remainingPlayer.league;
            
            // Exclude the remaining player
            const excludeRemaining = player.id !== remainingPlayer.id;
            
            const finalMatch = (nameMatch || teamMatch) && excludeRemaining && positionMatch && leagueMatch;
            
            return finalMatch;
          })
          .sort((a, b) => {
            // Sort by name match first, then team match
            const aNameMatch = (`${a.firstName || ''} ${a.lastName || ''}`.toLowerCase() + (a.displayName || '').toLowerCase()).includes(query);
            const bNameMatch = (`${b.firstName || ''} ${b.lastName || ''}`.toLowerCase() + (b.displayName || '').toLowerCase()).includes(query);
            
            if (aNameMatch && !bNameMatch) return -1;
            if (!aNameMatch && bNameMatch) return 1;
            return 0;
          })
          .slice(0, 5); // Max 5 results

        if (filteredPlayers.length > 0) {
          searchResults.innerHTML = filteredPlayers.map(player => `
            <div class="replacement-search-result" data-player-index="${filteredPlayers.indexOf(player)}" style="
              padding: 10px;
              cursor: pointer;
              border-bottom: 1px solid #eee;
              display: flex;
              align-items: center;
              gap: 10px;
              transition: background-color 0.2s ease;
            " onmouseover="this.style.backgroundColor='#f0f0f0'" onmouseout="this.style.backgroundColor='white'">
              <div>
                <div style="font-weight: bold; color: #333;">${player.displayName}</div>
                <div style="font-size: 12px; color: #777;">${player.team} | #${player.jersey} | ${player.position}</div>
              </div>
            </div>
          `).join('');
          
          searchResults.style.display = 'block';

          // Add click handlers to search results
          searchResults.querySelectorAll('.replacement-search-result').forEach((item, index) => {
            item.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              
              const player = filteredPlayers[index];

              
              if (player) {
                const newPlayer = {
                  id: player.id,
                  firstName: player.firstName,
                  lastName: player.lastName,
                  name: player.displayName,
                  position: player.position,
                  teamAbbr: player.teamAbbr || currentTeam?.abbreviation || currentTeam?.shortDisplayName || 'Unknown',
                  league: player.league,
                  jersey: player.jersey
                };
                

                
                // Close current modal and start new comparison
                document.body.removeChild(modal);
                
                // Create new comparison with the new player
                if (playerNumber === "1") {
                  playersForComparison = [newPlayer, currentPlayer2];
                  showPlayerComparison(newPlayer, currentPlayer2);
                } else {
                  playersForComparison = [currentPlayer1, newPlayer];
                  showPlayerComparison(currentPlayer1, newPlayer);
                }
              }
            });
          });
        } else {
          const positionText = needsGoalkeeper ? 'goalkeepers' : 'field players';
          const leagueName = getLeagueName(remainingPlayer.league);
          searchResults.innerHTML = `<div style="padding: 10px; color: #777; text-align: center;">No ${positionText} found in ${leagueName}</div>`;
          searchResults.style.display = 'block';
        }
      }, 300);
    });

    // Hide search when clicking outside
    document.addEventListener('click', (e) => {
      if (!replacementInterface.contains(e.target)) {
        searchResults.style.display = 'none';
      }
    });



  } catch (error) {
    console.error('Error in player selection interface:', error);
  }
}

// Function to get league name from league code
function getLeagueName(leagueCode) {
  const leagueNames = {
    'eng.1': 'Premier League',
    'esp.1': 'La Liga',
    'ger.1': 'Bundesliga',
    'ita.1': 'Serie A',
    'fra.1': 'Ligue 1',
    'usa.1': 'MLS',
    'ksa.1': 'Saudi PL'
  };
  return leagueNames[leagueCode] || leagueCode;
}

// Function to copy game log card as image
async function copyPlayerStatsAsImage(cardId) {
  try {
    const cardElement = document.getElementById(cardId);
    if (!cardElement) {
      console.error('Player stats card not found');
      return;
    }

    // Import html2canvas dynamically
    if (!window.html2canvas) {
      // Load html2canvas library
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      script.onload = () => {
        capturePlayerStatsAsImage(cardElement);
      };
      document.head.appendChild(script);
    } else {
      capturePlayerStatsAsImage(cardElement);
    }
  } catch (error) {
    console.error('Error copying player stats as image:', error);
    showFeedback('Error copying image', 'error');
  }
}

async function capturePlayerStatsAsImage(element) {
  try {
    showFeedback('Capturing player statistics...', 'loading');
    
    // Get the modal to access player information
    const modal = document.querySelector('.modal-overlay');
    if (!modal) {
      showFeedback('Player information not found', 'error');
      return;
    }

    // Get player information from the modal header
    const modalContent = modal.querySelector('.modal-content');
    const children = Array.from(modalContent.children);
    const playerHeader = children[1]; // Player header is the 2nd child
    
    if (!playerHeader || !selectedPlayer) {
      showFeedback('Player information not available', 'error');
      return;
    }

    // Extract player information
    const playerName = selectedPlayer.fullName || selectedPlayer.firstName + ' ' + selectedPlayer.lastName;
    const jerseyNumber = playerJerseyForYear || selectedPlayer.jersey || selectedPlayer.number || 'N/A';
    const position = playerPositionForYear || selectedPlayerPosition || selectedPlayer.position || 'N/A';
    const teamName = playerTeamForYear?.displayName || currentTeam?.displayName || 'Unknown Team';
    const teamAbbr = playerTeamAbbr || currentTeam?.abbreviation || currentTeam?.shortDisplayName || 'UNK';

    const actualColorHex = (playerTeamColor || '#1a1a1a').replace('#', '');
    const nameColorChange = ["ffffff", "ffee00", "ffff00", "81f733", "ffef32", "f7f316", "eef209", "ece83a", "cccccc", "e3e4ed"].includes(actualColorHex) ? "black" : "white";
    
    // Get the selected year
    const yearSelector = document.getElementById('playerYearSelector');
    const selectedYear = yearSelector ? yearSelector.value : new Date().getFullYear();

    // Get team logo
    const teamLogo = getTeamLogo(playerTeamForYear || currentTeam);

    // Create a styled container specifically for the image capture
    const captureContainer = document.createElement('div');
    captureContainer.style.cssText = `
      background: linear-gradient(135deg, ${playerTeamColor || '#1a1a1a'} 0%, ${playerTeamColor ? playerTeamColor + '88' : '#333'} 100%);
      color: ${nameColorChange};
      padding: 30px;
      border-radius: 16px;
      width: 600px;
      max-width: 600px;
      min-width: 600px;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      position: fixed;
      top: -9999px;
      left: -9999px;
      z-index: -1;
      overflow: hidden;
    `;

    // Create player header section
    let playerHeaderHtml;
    
    // Check if this is a transfer year and we have transfer info
    // Try to get transfer info from multiple sources
    const playerWithTransferInfo = selectedPlayer || window.selectedPlayer;
    const transferInfo = playerWithTransferInfo?.transferInfo;
    
    console.log('Copy card - checking transfer info:', transferInfo);
    console.log('Copy card - selectedPlayer:', selectedPlayer);
    console.log('Copy card - window.selectedPlayer:', window.selectedPlayer);
    console.log('Copy card - playerTeamAbbr:', playerTeamAbbr);
    
    if (transferInfo || (playerTeamAbbr && playerTeamAbbr.includes('+'))) {
      // Transfer year - show both teams
      let fromTeamId, fromLeague, toTeamId, toLeague, fromAbbr, toAbbr;
      
      if (transferInfo) {
        // Use transfer info if available
        ({ fromTeamId, fromLeague, toTeamId, toLeague, fromAbbr, toAbbr } = transferInfo);
      } else {
        // Extract from abbreviation if transfer info is not available
        const parts = playerTeamAbbr.split(' + ');
        fromAbbr = parts[0] || 'UNK';
        toAbbr = parts[1] || 'UNK';
        
        // Try to get team IDs from current context if available
        fromTeamId = null;
        fromLeague = null;
        toTeamId = currentTeamId; // Assume current team is the TO team
        toLeague = currentLeague;
      }
      
      // Get team names and logos for both teams
      let fromTeamName = fromAbbr || 'Unknown Team';
      let fromTeamLogo = 'soccer-ball-png-24.png';
      let toTeamName = toAbbr || 'Unknown Team';
      let toTeamLogo = 'soccer-ball-png-24.png';
      
      try {
        const fetchPromises = [];
        
        // Fetch FROM team data if we have the info
        if (fromTeamId && fromLeague) {
          fetchPromises.push(
            fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${fromLeague}/teams/${fromTeamId}`)
              .then(r => r.json())
              .then(data => ({ type: 'from', data }))
          );
        }
        
        // Fetch TO team data if we have the info
        if (toTeamId && toLeague) {
          fetchPromises.push(
            fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${toLeague}/teams/${toTeamId}`)
              .then(r => r.json())
              .then(data => ({ type: 'to', data }))
          );
        }
        
        if (fetchPromises.length > 0) {
          const results = await Promise.all(fetchPromises);
          
          results.forEach(result => {
            if (result.type === 'from') {
              fromTeamName = result.data.team.displayName || result.data.team.name || fromAbbr;
              fromTeamLogo = getTeamLogo(result.data.team);
            } else if (result.type === 'to') {
              toTeamName = result.data.team.displayName || result.data.team.name || toAbbr;
              toTeamLogo = getTeamLogo(result.data.team);
            }
          });
        } else {
          // Fallback: use current team as TO team
          toTeamName = teamName;
          toTeamLogo = teamLogo;
        }
      } catch (error) {
        console.log('Error fetching team details for transfer card:', error);
        // Use fallbacks
        toTeamName = teamName;
        toTeamLogo = teamLogo;
      }
      
      playerHeaderHtml = `
        <div style="display: flex; align-items: center; margin-bottom: 25px; background: rgba(255,255,255,0.1); padding: 20px; border-radius: 12px;">
          <div style="background: ${nameColorChange}; border-radius: 50%; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; margin-right: 20px; font-size: 24px; font-weight: bold; color: ${playerTeamColor || '#1a1a1a'};">
            ${jerseyNumber}
          </div>
          <div style="flex: 1;">
            <h2 style="margin: 0 0 8px 0; font-size: 26px; font-weight: bold;">${playerName}</h2>
            <div style="font-size: 16px; opacity: 0.9; margin-bottom: 4px;">${position} | ${fromAbbr} / ${toAbbr}</div>
            <div style="font-size: 14px; opacity: 0.8;">${fromTeamName} / ${toTeamName}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${fromTeamLogo}" alt="${fromTeamName}" style="width: 50px; height: 50px; border-radius: 6px;" onerror="this.style.display='none';">
            <img src="${toTeamLogo}" alt="${toTeamName}" style="width: 50px; height: 50px; border-radius: 6px;" onerror="this.style.display='none';">
          </div>
        </div>
      `;
    } else {
      // Regular single team display
      playerHeaderHtml = `
        <div style="display: flex; align-items: center; margin-bottom: 25px; background: rgba(255,255,255,0.1); padding: 20px; border-radius: 12px;">
          <div style="background: ${nameColorChange}; border-radius: 50%; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; margin-right: 20px; font-size: 24px; font-weight: bold; color: ${playerTeamColor || '#1a1a1a'};">
            ${jerseyNumber}
          </div>
          <div style="flex: 1;">
            <h2 style="margin: 0 0 8px 0; font-size: 26px; font-weight: bold;">${playerName}</h2>
            <div style="font-size: 16px; opacity: 0.9; margin-bottom: 4px;">${position} | ${teamAbbr}</div>
            <div style="font-size: 14px; opacity: 0.8;">${teamName}</div>
          </div>
          <img src="${teamLogo}" alt="${teamName}" style="width: 60px; height: 60px; border-radius: 8px;" onerror="this.style.display='none';">
        </div>
      `;
    }

    // Get the current stats content and clean it up for the image
    const statsContent = element.cloneNode(true);
    
    // Remove the copy button from the cloned content
    const copyButton = statsContent.querySelector('[onclick*="copyPlayerStatsAsImage"]');
    if (copyButton) {
      copyButton.remove();
    }

    // Remove the year selector container from the cloned content
    const yearSelectorContainer = statsContent.querySelector('#yearSelectorContainer');
    if (yearSelectorContainer) {
      yearSelectorContainer.remove();
    }

    // Also remove any select elements (year selector) directly
    const yearSelectors = statsContent.querySelectorAll('select');
    yearSelectors.forEach(selector => selector.remove());

    // Clean up the header layout after removing elements
    const headerDiv = statsContent.querySelector('[style*="justify-content: space-between"]');
    if (headerDiv) {
      // Remove the flex layout and just center the title
      headerDiv.style.display = 'block';
      headerDiv.style.textAlign = 'center';
      // Find any remaining flex containers and clean them up
      const flexContainers = headerDiv.querySelectorAll('[style*="flex"]');
      flexContainers.forEach(container => {
        if (container.children.length === 0) {
          container.remove();
        }
      });
    }

    // Update the stats styling for better image appearance
    const statsGrid = statsContent.querySelector('[style*="grid-template-columns"]');
    if (statsGrid) {
      statsGrid.style.gridTemplateColumns = 'repeat(4, 1fr)';
      statsGrid.style.gap = '15px';
    }

    // Style individual stat cards for better image appearance
    const statCards = statsContent.querySelectorAll('[style*="background: #f8f9fa"]');
    statCards.forEach(card => {
      card.style.background = 'rgba(255,255,255,0.15)';
      card.style.border = `1px solid ${nameColorChange === 'black' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)'}`;
      card.style.color = `${nameColorChange}`;
    });

    // Style competition sections
    const competitionSections = statsContent.querySelectorAll('[style*="background: #f8f9fa"][style*="border: 1px solid #ddd"]');
    competitionSections.forEach(section => {
      section.style.background = 'rgba(255,255,255,0.1)';
      section.style.border = `1px solid ${nameColorChange === 'black' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)'}`;
      section.style.color = `${nameColorChange}`;
    });

    // Style headers and text for dark background
    const headers = statsContent.querySelectorAll('h3, h4');
    headers.forEach(header => {
      header.style.color = `${nameColorChange}`;
      header.style.borderBottomColor = nameColorChange === 'black' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.3)';
    });

    const text = statsContent.querySelectorAll('div, p');
    text.forEach(textEl => {
      if (textEl.style.color === '#333' || textEl.style.color === '#777') {
        textEl.style.color = `${nameColorChange}`;
      }
      if (textEl.style.color === 'rgb(51, 51, 51)' || textEl.style.color === 'rgb(119, 119, 119)') {
        textEl.style.color = `${nameColorChange}`;
      }
    });

    // Combine everything
    captureContainer.innerHTML = playerHeaderHtml + statsContent.innerHTML;

    // Add watermark
    const watermark = document.createElement('div');
    watermark.style.cssText = `
      position: absolute;
      bottom: 15px;
      right: 20px;
      font-size: 12px;
      opacity: 0.6;
      color: ${nameColorChange};
    `;
    watermark.textContent = `${selectedYear} Season Stats`;
    captureContainer.appendChild(watermark);

    // Add to document temporarily for capture
    document.body.appendChild(captureContainer);

    // Replace all external images with base64 versions or remove them
    const images = captureContainer.querySelectorAll('img');
    for (const img of images) {
      try {
        if (img.src.includes('espncdn.com') || img.src.includes('http')) {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const tempImg = new Image();
          tempImg.crossOrigin = 'anonymous';
          
          await new Promise((resolve, reject) => {
            tempImg.onload = () => {
              try {
                canvas.width = tempImg.width;
                canvas.height = tempImg.height;
                ctx.drawImage(tempImg, 0, 0);
                const dataURL = canvas.toDataURL('image/png');
                img.src = dataURL;
              } catch (e) {
                img.style.display = 'none';
              }
              resolve();
            };
            tempImg.onerror = () => {
              img.style.display = 'none';
              resolve();
            };
            tempImg.src = img.src;
          });
        }
      } catch (e) {
        img.style.display = 'none';
      }
    }
    
    // Wait a bit for images to process
    await new Promise(resolve => setTimeout(resolve, 500));

    // Capture the element with html2canvas
    const canvas = await html2canvas(captureContainer, {
      backgroundColor: '#000000',
      scale: 3,
      useCORS: true,
      allowTaint: false,
      logging: false,
      width: 600,
      height: captureContainer.scrollHeight,
      scrollX: 0,
      scrollY: 0,
      windowWidth: 600,
      windowHeight: captureContainer.scrollHeight
    });
    
    // Remove the temporary container
    document.body.removeChild(captureContainer);
    
    // Convert to blob and copy/download
    canvas.toBlob(async (blob) => {
      if (!blob) {
        showFeedback('Failed to create image', 'error');
        return;
      }

      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                      ('ontouchstart' in window) || 
                      (navigator.maxTouchPoints > 0);

      try {
        if (isMobile) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${playerName.replace(/\s+/g, '-')}-stats-${selectedYear}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          showFeedback('Player stats downloaded!', 'success');
        } else {
          if (navigator.clipboard && window.ClipboardItem) {
            const clipboardItem = new ClipboardItem({
              'image/png': blob
            });
            await navigator.clipboard.write([clipboardItem]);
            showFeedback('Player stats copied to clipboard!', 'success');
          } else {
            // Fallback for older browsers
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${playerName.replace(/\s+/g, '-')}-stats-${selectedYear}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            showFeedback('Player stats downloaded!', 'success');
          }
        }
      } catch (error) {
        console.error('Error handling image:', error);
        showFeedback('Error copying/downloading image', 'error');
      }
    }, 'image/png', 0.95);
    
  } catch (error) {
    console.error('Error capturing player stats:', error);
    showFeedback('Error capturing image', 'error');
  }
}

async function copyGameLogAsImage(cardId) {
  try {
    const cardElement = document.getElementById(cardId);
    if (!cardElement) {
      console.error('Game log card not found');
      return;
    }

    // Import html2canvas dynamically
    if (!window.html2canvas) {
      // Load html2canvas library
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      script.onload = () => {
        captureAndCopyImage(cardElement);
      };
      document.head.appendChild(script);
    } else {
      captureAndCopyImage(cardElement);
    }
  } catch (error) {
    console.error('Error copying game log as image:', error);
    showFeedback('Error copying image', 'error');
  }
}

async function captureAndCopyImage(element) {
  try {
    showFeedback('Capturing image...', 'loading');
    
    // Replace all external images with base64 versions or remove them
    const images = element.querySelectorAll('img');

    for (const img of images) {
      try {
        // For Soccer team logos, replace with a placeholder or try to convert
        if (img.src.includes('espncdn.com') || img.src.includes('http')) {
          // Create a canvas to draw the image and convert to base64
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Create a new image for loading
          const tempImg = new Image();
          tempImg.crossOrigin = 'anonymous';
          
          await new Promise((resolve, reject) => {
            tempImg.onload = () => {
              try {
                canvas.width = tempImg.width;
                canvas.height = tempImg.height;
                ctx.drawImage(tempImg, 0, 0);
                
                // Try to convert to base64
                try {
                  const dataURL = canvas.toDataURL('image/png');
                  img.src = dataURL;
                } catch (e) {
                  // If conversion fails, use a placeholder
                  img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjNjY2Ii8+CjwvdGV4dD4KPC9zdmc+';
                }
                resolve();
              } catch (e) {
                // Fallback to placeholder
                img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjNjY2Ii8+CjwvdGV4dD4KPC9zdmc+';
                resolve();
              }
            };
            
            tempImg.onerror = () => {
              // Use placeholder on error
              img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjNjY2Ii8+CjwvdGV4dD4KPC9zdmc+';
              resolve();
            };
            
            // Start loading
            tempImg.src = img.src;
          });
        }
      } catch (e) {

        // Use placeholder on any error
        img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjNjY2Ii8+CjwvdGV4dD4KPC9zdmc+';
      }
    }
    
    // Wait a bit for images to process
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const isSmallScreen = window.innerWidth < 525; // Adjust based on your design breakpoints

    // Capture the element with html2canvas using exact element dimensions
    const canvas = await html2canvas(element, {
      backgroundColor: '#1a1a1a', // Set the actual background color
      scale: 3, // Use scale 3 to avoid logo scaling issues
      useCORS: true,
      allowTaint: false, // Allow tainted canvas for better compatibility
      logging: false,
      width: isSmallScreen ? element.clientWidth : element.clientWidth - 25,
      height: isSmallScreen ? element.clientHeight : element.clientHeight + 30,
      scrollX: 0,
      scrollY: 0,
      ignoreElements: (element) => {
        try {
          // Ignore the clipboard icon itself
          if (element && element.getAttribute && element.getAttribute('onclick') && 
              element.getAttribute('onclick').includes('copyGameLogAsImage')) {
            return true;
          }
          // Ignore "Click to view game details" text by CSS class
          if (element && element.classList && element.classList.contains('game-details-text')) {
            return true;
          }
          return false;
        } catch (e) {
          // If there's any error accessing element properties, don't ignore it
          return false;
        }
      }
    });
    
    // Convert to blob
    canvas.toBlob(async (blob) => {
      if (!blob) {
        showFeedback('Failed to create image', 'error');
        return;
      }

      // Check if device is mobile
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                      ('ontouchstart' in window) || 
                      (navigator.maxTouchPoints > 0);

      try {
        if (isMobile) {
          // On mobile, download the image
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `game-log-${new Date().getTime()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          showFeedback('Game log downloaded!', 'success');
        } else {
          // On desktop, try to copy to clipboard using modern API
          if (navigator.clipboard && window.ClipboardItem) {
            const clipboardItem = new ClipboardItem({
              'image/png': blob
            });
            await navigator.clipboard.write([clipboardItem]);
            showFeedback('Game log copied to clipboard!', 'success');
          } else {
            // Fallback to download if clipboard fails
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `game-log-${new Date().getTime()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            showFeedback('Game log downloaded!', 'success');
          }
        }
      } catch (clipboardError) {
        // Fallback to download if clipboard fails
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `game-log-${new Date().getTime()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showFeedback('Game log downloaded!', 'success');
      }
    }, 'image/png', 0.95);
    
  } catch (error) {
    console.error('Error capturing image:', error);
    showFeedback('Failed to capture image: ' + error.message, 'error');
  }
}

function showFeedback(message, type) {
  // Remove existing feedback
  const existingFeedback = document.getElementById('copyFeedback');
  if (existingFeedback) {
    existingFeedback.remove();
  }

  // Create feedback element
  const feedback = document.createElement('div');
  feedback.id = 'copyFeedback';
  feedback.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    transition: opacity 0.3s ease;
  `;

  // Set colors based on type
  switch (type) {
    case 'success':
      feedback.style.backgroundColor = '#4CAF50';
      break;
    case 'error':
      feedback.style.backgroundColor = '#f44336';
      break;
    case 'loading':
      feedback.style.backgroundColor = '#2196F3';
      break;
    default:
      feedback.style.backgroundColor = '#333';
  }

  feedback.textContent = message;
  document.body.appendChild(feedback);

  // Auto remove after 3 seconds (except for loading)
  if (type !== 'loading') {
    setTimeout(() => {
      if (feedback && feedback.parentNode) {
        feedback.style.opacity = '0';
        setTimeout(() => {
          if (feedback && feedback.parentNode) {
            feedback.remove();
          }
        }, 300);
      }
    }, 3000);
  }
}

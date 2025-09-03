let currentTeam = null;
let currentTeamId = null;
let currentUefaLeague = "uefa.champions"; // Default to Champions League
let currentPage = 1;
let allRecentMatches = [];
let matchesPerPage = 3;
let currentRosterPage = 1;
let allRosterPlayers = [];
let playersPerPage = 4;
let playersForComparison = []; // Array to store players selected for comparison
let currentStatsMode = 'overall'; // Track current stats view mode: 'overall' or 'gamelog'
let selectedPlayer = null; // Currently selected player for details
let teamColor = "#000000"; // Default team color, will be set dynamically

// Global variable to store all league players for league-wide comparison
let allLeaguePlayers = [];

// League configurations matching search.js
const LEAGUES = {
  "Champions League": { code: "uefa.champions", logo: "2" },
  "Europa League": { code: "uefa.europa", logo: "2310" },
  "Europa Conference League": { code: "uefa.europa.conf", logo: "20296" },
  "Super Cup": { code: "uefa.super_cup", logo: "1272" },
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
  const leagueParam = urlParams.get('league');
  
  if (!currentTeamId) {
    window.location.href = 'search.html';
    return;
  }
  
  // Priority order: URL parameter > localStorage > default
  if (leagueParam && Object.values(LEAGUES).some(league => league.code === leagueParam)) {
    currentUefaLeague = leagueParam;
    localStorage.setItem("currentUefaLeague", currentUefaLeague);
  } else {
    currentUefaLeague = localStorage.getItem("currentUefaLeague") || "uefa.champions";
  }
  
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
    console.log('Date changed to:', startDatePicker.value);
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
    // Clear any existing player comparison when loading new team
    clearComparison();
    
    // Load all league players for comparison
    fetchAllSoccerPlayers().catch(console.error);
    
    // Update UI elements based on current league
    updateUIForLeague();
    
    // First, try to find the team and determine the correct league
    await findTeamInLeagues();
    
    // Load team information first (needed for other functions)
    await loadTeamInfo();
    
    // Load all other sections after team info is loaded
    await Promise.all([
      loadCurrentGame(),
      loadRecentMatches(),
      loadUpcomingMatches(),
      loadTeamStats(),
      loadCurrentStanding(),
      loadSquadInfo()
    ]);
  } catch (error) {
    console.error("Error loading team data:", error);
  }
}

// Function to update UI elements based on current league
function updateUIForLeague() {
  const recentMatchesSection = document.getElementById('recentMatches');
  if (!recentMatchesSection) return;
  
  const sectionHeader = recentMatchesSection.querySelector('.section-header h3');
  const datePickerContainer = recentMatchesSection.querySelector('.date-picker-container');
  
  if (currentUefaLeague === "uefa.super_cup") {
    // Update title to "Final" for Super Cup
    if (sectionHeader) {
      sectionHeader.textContent = "Final";
    }
    // Hide date picker for Super Cup
    if (datePickerContainer) {
      datePickerContainer.style.display = "none";
    }
  } else {
    // Use "Last Matches" for other leagues
    if (sectionHeader) {
      sectionHeader.textContent = "Last Matches";
    }
    // Show date picker for other leagues
    if (datePickerContainer) {
      datePickerContainer.style.display = "flex";
    }
  }
}

async function findTeamInLeagues() {
  // First, try to find the team in the current league context
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/teams`);
    const data = await response.json();
    
    const team = data.sports[0].leagues[0].teams.find(teamData => teamData.team.id === currentTeamId);
    if (team) {
      console.log(`Found team in current league context: ${Object.keys(LEAGUES).find(key => LEAGUES[key].code === currentUefaLeague)}`);
      return;
    }
  } catch (error) {
    console.log(`Error checking current league context:`, error);
  }

  // If not found in current league context, try to find the team in other leagues
  for (const [leagueName, leagueData] of Object.entries(LEAGUES)) {
    // Skip the current league since we already checked it
    if (leagueData.code === currentUefaLeague) continue;
    
    try {
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueData.code}/teams`);
      const data = await response.json();
      
      const team = data.sports[0].leagues[0].teams.find(teamData => teamData.team.id === currentTeamId);
      if (team) {
        console.log(`Team not found in current context, found in ${leagueName} instead`);
        currentUefaLeague = leagueData.code;
        localStorage.setItem("currentUefaLeague", currentUefaLeague);
        updateUIForLeague(); // Update UI when league changes
        break;
      }
    } catch (error) {
      console.log(`Error checking league ${leagueName}:`, error);
    }
  }
}

async function loadTeamInfo() {
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/teams/${currentTeamId}`);
    const data = await response.json();
    currentTeam = data.team;
    
    console.log('Current team data:', currentTeam);
    console.log('Team abbreviation:', currentTeam?.abbreviation);
    console.log('Team shortDisplayName:', currentTeam?.shortDisplayName);
    
    const logoUrl = getTeamLogo(currentTeam);
    
    // Get team color dynamically from API (like teams.js)
    const isUsingAlternateColor = ["ffffff", "ffee00", "ffff00", "81f733", "000000"].includes(currentTeam.color);
    if (currentTeam) {
      if (isUsingAlternateColor && currentTeam.alternateColor) {
        teamColor = `#${currentTeam.alternateColor}`;
      } else if (currentTeam.color) {
        teamColor = `#${currentTeam.color}`;
      }
    }
    
    // Determine text color based on the actual color being used
    const actualColorHex = isUsingAlternateColor ? currentTeam.alternateColor : currentTeam.color;
    const nameColorChange = ["ffffff", "ffee00", "ffff00", "81f733", "ffef32"].includes(actualColorHex) ? "black" : "white";
    
    const leagueName = Object.keys(LEAGUES).find(key => LEAGUES[key].code === currentUefaLeague);
    
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
        <img src="${logoUrl}" alt="${currentTeam.displayName}" class="team-logo-header" onerror="this.src='../soccer-ball-png-24.png';">
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
    .stat-value {
      color: ${teamColor} !important;
    }
  `;
  document.head.appendChild(style);
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
    
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${todayFormatted}`);
    const data = await response.json();
    
    const contentDiv = document.getElementById('currentGameContent');
    
    // Check if there's a game today for this team
    const todayGame = data.events?.find(event => {
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
      endDate.setDate(endDate.getDate() + 14); // Look ahead 14 days instead of 30
      
      const dateRange = `${formatDate(tomorrow)}-${formatDate(endDate)}`;
      const upcomingResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${dateRange}`);
      const upcomingData = await upcomingResponse.json();
      
      // Find the next scheduled game for this team
      const nextGame = upcomingData.events
        ?.filter(event => {
          const competition = event.competitions?.[0];
          return competition?.competitors.some(competitor => competitor.team.id === currentTeamId);
        })
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

  const status = game.status.type.state;
  let statusText = "";
  let scoreDisplay = "";

  const teamS = teamSHTScore ? `${teamScore || 0}<sup>(${teamSHTScore || 0})</sup>` : `${teamScore || 0}`;
  const opponentS = opponentSHTScore ? `${opponentScore || 0}<sup>(${opponentSHTScore || 0})</sup>` : `${opponentScore || 0}`;

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

  return `
    <div class="current-game-card" data-game-id="${game.id}">
      <div class="game-status">${statusText}</div>
      <div class="game-teams">
        <div class="game-team">
          <img src="${teamLogo}" alt="${currentTeam.displayName}" class="game-team-logo" onerror="this.src='../soccer-ball-png-24.png';">
          <div class="game-team-name">${currentTeam.abbreviation || currentTeam.shortDisplayName}</div>
        </div>
        <div class="game-score">${scoreDisplay}</div>
        <div class="game-team">
          <img src="${opponentLogo}" alt="${opponent.team.displayName}" class="game-team-logo" onerror="this.src='../soccer-ball-png-24.png';">
          <div class="game-team-name">${opponent.team.abbreviation || opponent.team.shortDisplayName}</div>
        </div>
      </div>
      <div class="game-info">${isHomeTeam ? 'Home' : 'Away'} Game</div>
    </div>
  `;
}

async function loadRecentMatches() {
  try {
    // Special handling for UEFA Super Cup
    if (currentUefaLeague === "uefa.super_cup") {
      // For Super Cup, show the final on August 13, 2025
      const superCupDate = "20250813";
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${superCupDate}`);
      const data = await response.json();
      
      // Filter games for this team
      const allGames = data.events?.filter(event => {
        const competition = event.competitions?.[0];
        return competition?.competitors.some(competitor => competitor.team.id === currentTeamId);
      }) || [];
      
      allRecentMatches = allGames.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      // Reset to first page and immediately display
      currentPage = 1;
      
      console.log(`Super Cup Final: Found ${allRecentMatches.length} games`);
      
      displayRecentMatches();
      return;
    }
    
    // Regular handling for other leagues
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
    
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${dateRange}`);
    const data = await response.json();
    
    // Filter games for this team and completed games
    const allGames = data.events?.filter(event => {
      const competition = event.competitions?.[0];
      return competition?.competitors.some(competitor => competitor.team.id === currentTeamId);
    }) || [];
    
    allRecentMatches = allGames
      .filter(game => game.status.type.state === "post")
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Reset to first page and immediately display
    currentPage = 1;
    
    console.log(`Date range: ${dateRange}, Found ${allRecentMatches.length} completed games`);
    
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
  
  console.log(`Displaying page ${currentPage} of ${totalPages}, total matches: ${allRecentMatches.length}`);
  
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

  // Try to get team logo from the loaded team data, fallback to ESPN CDN with team logos format
  const teamLogo = currentTeam && currentTeam.logos ? getTeamLogo(currentTeam) : 
    `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/${currentTeamId}.png&h=200&w=200`;
  
  // For opponent, use the same approach with team logos format
  const opponentLogo = opponent.team.logos ? getTeamLogo(opponent.team) : 
    `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/${opponent.team.id}.png&h=200&w=200`;

  let resultClass = "";
  let resultText = "";

  const teamS = teamSHTScore ? `${teamScore || 0}<sup>(${teamSHTScore || 0})</sup>` : `${teamScore || 0}`;
  const opponentS = opponentSHTScore ? `${opponentScore || 0}<sup>(${opponentSHTScore || 0})</sup>` : `${opponentScore || 0}`;

  if (game.status.type.state === "post") {
    if (teamScore > opponentScore || teamSHTScore > opponentSHTScore) {
      resultClass = "win";
      resultText = `W ${teamS} - ${opponentS}`;
    } else if (teamScore < opponentScore || teamSHTScore < opponentSHTScore) {
      resultClass = "loss";
      resultText = `L ${teamS} - ${opponentS}`;
    } else {
      resultClass = "draw";
      resultText = `D ${teamS} - ${opponentS}`;
    }
  } else {
    resultClass = "scheduled";
    resultText = isHomeTeam ? "vs" : "at";
  }

  return `
    <div class="match-item" data-game-id="${game.id}">
      <div class="match-teams">
        <div class="match-team-info">
          <img src="${teamLogo}" alt="${currentTeamData.team.abbreviation}" class="match-team-logo" onerror="this.src='../soccer-ball-png-24.png';">
          <div class="match-team-name">${currentTeamData.team.abbreviation || currentTeamData.team.shortDisplayName}</div>
        </div>
        <div class="match-result ${resultClass}">${resultText}</div>
        <div class="match-team-info">
          <div class="match-team-name">${opponent.team.abbreviation || opponent.team.shortDisplayName}</div>
          <img src="${opponentLogo}" alt="${opponent.team.abbreviation}" class="match-team-logo" onerror="this.src='../soccer-ball-png-24.png';">
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
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${dateRange}`);
    const data = await response.json();
    
    const upcomingGames = data.events
      ?.filter(event => {
        const competition = event.competitions?.[0];
        return competition?.competitors.some(competitor => competitor.team.id === currentTeamId);
      })
      .filter(event => event.status.type.state === "pre")
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 5); // Next 5 matches
    
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
    document.getElementById('upcomingMatchesContent').innerHTML = '<div Fclass="no-data">Error loading upcoming matches</div>';
  }
}

async function loadTeamStats() {
  try {
    const contentDiv = document.getElementById('teamStatsContent');
    contentDiv.innerHTML = '<div style="text-align: center; padding: 20px;">Loading team statistics...</div>';
    
    // Get current year and previous year for fallback
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    
    let statsData = null;
    let year = currentYear;
    
    // Try current year first, then fallback to previous year
    try {
      const currentYearResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${currentUefaLeague}/seasons/${currentYear}/types/1/teams/${currentTeamId}/statistics`);
      if (currentYearResponse.ok) {
        statsData = await currentYearResponse.json();
      } else {
        throw new Error('Current year data not available');
      }
    } catch (error) {
      console.log(`No data for ${currentYear}, trying ${previousYear}...`);
      try {
        const previousYearResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${currentUefaLeague}/seasons/${previousYear}/types/1/teams/${currentTeamId}/statistics`);
        if (previousYearResponse.ok) {
          statsData = await previousYearResponse.json();
          year = previousYear;
        } else {
          throw new Error('Previous year data not available');
        }
      } catch (fallbackError) {
        throw new Error('No statistics data available for current or previous year');
      }
    }

    if (!statsData || !statsData.splits || !statsData.splits.categories) {
      throw new Error('Invalid statistics data structure');
    }

    // Extract stats from different categories
    const categories = statsData.splits.categories;
    const generalStats = categories.find(cat => cat.name === 'general')?.stats || [];
    const offensiveStats = categories.find(cat => cat.name === 'offensive')?.stats || [];
    const defensiveStats = categories.find(cat => cat.name === 'defensive')?.stats || [];
    const goalKeepingStats = categories.find(cat => cat.name === 'goalKeeping')?.stats || [];

    // Helper function to get stat value
    const getStat = (statsArray, statName) => {
      const stat = statsArray.find(s => s.name === statName);
      return stat ? stat.displayValue : 'N/A';
    };

    // Display only 8 most important stats like main soccer team-page
    contentDiv.innerHTML = `
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-label">Games Played</div>
          <div class="stat-value">${getStat(generalStats, 'appearances')}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Wins</div>
          <div class="stat-value">${getStat(generalStats, 'wins')}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Draws</div>
          <div class="stat-value">${getStat(generalStats, 'draws')}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Losses</div>
          <div class="stat-value">${getStat(generalStats, 'losses')}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Goals</div>
          <div class="stat-value">${getStat(offensiveStats, 'totalGoals')}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Goals Against</div>
          <div class="stat-value">${getStat(goalKeepingStats, 'goalsConceded')}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Goal Difference</div>
          <div class="stat-value">${getStat(generalStats, 'goalDifference')}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Clean Sheets</div>
          <div class="stat-value">${getStat(goalKeepingStats, 'cleanSheet')}</div>
        </div>
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
    const response = await fetch(`https://cdn.espn.com/core/soccer/table?xhr=1&league=${currentUefaLeague}`);
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
    
    const leagueName = Object.keys(LEAGUES).find(key => LEAGUES[key].code === currentUefaLeague);
    
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
    // Try to load roster data if available
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/teams/${currentTeamId}/roster`);
    const data = await response.json();
    
    const contentDiv = document.getElementById('squadInfoContent');
    
    if (!data.athletes || data.athletes.length === 0) {
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
        league: currentUefaLeague,
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

    console.log('Loaded current team roster players:', allRosterPlayers.map(p => `${p.firstName} ${p.lastName} (#${p.jersey}, ${p.position})`));

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
    console.log('No players to display');
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
  
  contentDiv.innerHTML = `
    ${comparisonStatus}
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

async function showPlayerDetails(playerId, firstName, lastName, jerseyNumber, position) {
  try {
    await loadTeamInfo();
    console.log('showPlayerDetails called with:', { playerId, firstName, lastName, jerseyNumber, position });
    
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
          #${jerseyNumber} | ${position} | ${currentTeam?.abbreviation || currentTeam?.shortDisplayName || 'UNK'}
        </div>
      </div>
    `;

    // Set selected player info
    selectedPlayer = {
      id: playerId,
      firstName: firstName,
      lastName: lastName,
      fullName: lastName ? `${firstName} ${lastName}` : firstName,
      jersey: jerseyNumber,
      position: position,
      headshot: null // UEFA doesn't have headshots
    };

    // Fetch ESPN athlete data to get team and league info for season-aware functionality
    try {
      const athleteResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${currentUefaLeague}/athletes/${playerId}?lang=en&region=us`);
      if (athleteResponse.ok) {
        const athleteData = await athleteResponse.json();
        console.log('ESPN Athlete API Response:', athleteData);
        
        // For UEFA, use team.$ref instead of defaultTeam.$ref
        if (athleteData.team && athleteData.team.$ref) {
          const teamRefMatch = athleteData.team.$ref.match(/teams\/(\d+)/);
          if (teamRefMatch) {
            selectedPlayer.defaultTeam = teamRefMatch[1];
            console.log(`Player's current team: ${selectedPlayer.defaultTeam}`);
          }
          
          // Extract league from team.$ref URL for UEFA
          const leagueRefMatch = athleteData.team.$ref.match(/leagues\/([^\/]+)/);
          if (leagueRefMatch) {
            selectedPlayer.defaultLeague = leagueRefMatch[1];
            console.log(`Player's league from team ref: ${selectedPlayer.defaultLeague}`);
          }
        }
      }
    } catch (error) {
      console.log('Could not fetch ESPN athlete data for team/league info:', error);
    }

    // Create stats container
    const statsContainer = document.createElement('div');
    statsContainer.innerHTML = '<div style="text-align: center; padding: 20px;">Loading player statistics...</div>';

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
      console.log('Overall option clicked');
      sliderBackground.style.transform = 'translateX(0)';
      overallOption.style.color = 'white';
      gameLogOption.style.color = '#777';
      currentStatsMode = 'overall';
      showOverallStats();
    });

    gameLogOption.addEventListener('click', () => {
      console.log('Game log option clicked');
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
            const leagueMatch = player.league === currentUefaLeague;
            
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

        console.log('Filtered players for comparison:', filteredPlayers.length, 'Selected player type:', selectedPlayerType);

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
              
              console.log('Clicked player:', player);
              
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
                
                console.log('Player for comparison:', playerForComparison);
                
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
                  league: currentUefaLeague
                };
                
                console.log('Current player for comparison:', currentPlayerForComparison);
                
                playersForComparison = [currentPlayerForComparison, playerForComparison];
                console.log('Starting comparison with:', currentPlayerForComparison, playerForComparison);
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
    
    console.log('Modal popup should now be visible');
    
    // Load player stats
    await loadPlayerStats(playerId, position, statsContainer);
    
  } catch (error) {
    console.error("Error loading player details:", error);
    alert(`Error loading player details: ${error.message}`);
  }
}

async function loadPlayerStats(playerId, position, contentDiv) {
  try {
    console.log('loadPlayerStats called for player:', playerId);
    
    // Always try ESPN API first for consistency, then use cached data as fallback
    let selectedPlayer = null;
    
    // Try ESPN statistics API first
    console.log('Trying ESPN statistics API...');
    try {
      const espnResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/athletes/${playerId}/statistics`);
      if (espnResponse.ok) {
        const espnData = await espnResponse.json();
        if (espnData.athlete && espnData.athlete.statistics) {
          selectedPlayer = espnData.athlete;
          console.log('Successfully fetched from ESPN statistics API');
        }
      } else {
        console.log(`ESPN statistics API failed, status: ${espnResponse.status}`);
      }
    } catch (e) {
      console.log('ESPN statistics API call failed:', e.message);
    }
    
    // If ESPN API failed, fall back to cached data if available
    if (!selectedPlayer) {
      const cachedPlayer = allRosterPlayers.find(player => player.id === playerId);
      if (cachedPlayer && cachedPlayer.fullPlayerData) {
        console.log('Using cached player data as fallback');
        selectedPlayer = cachedPlayer.fullPlayerData;
      }
    }
    
    // If still no player data, try roster endpoints
    if (!selectedPlayer) {
    
    // Try the team roster endpoint with stats first
    console.log('Trying team roster with stats...');
    try {
      const rosterResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/teams/${currentTeamId}/roster`);
      if (rosterResponse.ok) {
        const rosterData = await rosterResponse.json();
        console.log('Roster with stats response:', rosterData);
        
        const apiPlayer = rosterData.athletes?.find(athlete => {
          const athleteData = athlete.athlete || athlete;
          return athleteData.id === playerId;
        });
        
        if (apiPlayer) {
          const athleteData = apiPlayer.athlete || apiPlayer;
          if (athleteData.statistics) {
            selectedPlayer = athleteData;
            console.log('Found roster stats!');
          }
        }
      }
    } catch (e) {
      console.log('Roster with stats endpoint failed:', e.message);
    }
    
    // If still no stats, try the basic roster endpoint
    if (!selectedPlayer) {
      console.log('Falling back to basic roster endpoint...');
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/teams/${currentTeamId}/roster`);
      const data = await response.json();
      
      const apiPlayer = data.athletes?.find(athlete => {
        const athleteData = athlete.athlete || athlete;
        return athleteData.id === playerId;
      });
      
      if (!apiPlayer) {
        contentDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;"><p>Player not found</p></div>';
        return;
      }
      
      selectedPlayer = apiPlayer.athlete || apiPlayer;
    }
    }
    
    console.log('Full athlete data:', selectedPlayer);
    
    // Always process player stats - no error handling for detailed stats
    processPlayerStats(selectedPlayer, position, contentDiv);
    
  } catch (error) {
    console.error("Error loading player stats:", error);
    contentDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;"><p>Error loading player statistics</p></div>';
  }
}

function processPlayerStats(selectedPlayer, position, contentDiv) {
  console.log('processPlayerStats called with selectedPlayer:', selectedPlayer);
  
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
    // Use your exact pattern for extracting values directly
    const value = selectedPlayer?.statistics?.splits?.categories?.find(c => c.name === statConfig.category)?.stats?.find(s => s.name === statConfig.key)?.value || "0";
    console.log(`Extracting ${statConfig.key} from ${statConfig.category}: ${value}`);
    
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
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #ddd; padding-bottom: 10px;">
        <h3 style="color: #333; margin: 0; font-size: 1.3rem; font-weight: bold;">
          ${position === 'G' || position === 'Goalkeeper' ? 'Goalkeeper' : 'Field Player'} Statistics
        </h3>
        <button onclick="copyPlayerStatsAsImage('playerStatsCard')" style="
          background: ${teamColor || '#007bff'}; 
          color: white; 
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
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px;">
        ${statsHtml}
      </div>
      <p style="text-align: center; color: #777; margin-top: 10px; font-style: italic; font-size: 0.9rem;">
        Statistics from current season
      </p>
    </div>
  `;
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
    console.log('Fetching soccer players from current league...');
    
    // Ensure current team roster is loaded first
    if (allRosterPlayers.length === 0) {
      console.log('Current team roster not loaded, loading it now...');
      try {
        const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/teams/${currentTeamId}/roster`);
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
              league: currentUefaLeague,
              fullPlayerData: player,
            };
          });
          console.log(`Loaded ${allRosterPlayers.length} current team players`);
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
        league: currentUefaLeague, // Ensure consistent league value
        jersey: player.jersey
      };
    });
    
    const allPlayers = [...currentTeamPlayers];
    console.log(`Using ${currentTeamPlayers.length} cached players from current team`);
    console.log('Current team players:', currentTeamPlayers.map(p => p.displayName));
    
    // Fetch only the current league
    try {
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/teams`);
      const data = await response.json();
      
      // Fetch rosters for other teams (skip current team since we already have it)
      const otherTeams = data.sports[0].leagues[0].teams.filter(team => team.team.id !== currentTeamId);
      console.log(`Fetching rosters for ${otherTeams.length} other teams (skipping current team)`);
      
      const teamPromises = otherTeams.map(async (team) => {
        try {
          const teamId = team.team.id;
          const rosterResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/teams/${teamId}/roster`);
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
                league: currentUefaLeague,
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
      console.error(`Error fetching league ${currentUefaLeague}:`, leagueError);
    }
    
    allLeaguePlayers = allPlayers;
    console.log(`Total cached: ${allPlayers.length} soccer players (${allRosterPlayers.length} from current team, ${allPlayers.length - allRosterPlayers.length} from other teams)`);
    return allPlayers;
  } catch (error) {
    console.error('Error fetching soccer players:', error);
    return [];
  }
}

// Game log functionality
async function showGameLogInterface() {
  console.log('showGameLogInterface called');
  
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
  console.log('Modal content children:', children.length);
  
  // The statsContainer should be the 2nd child (index 1)
  // Order: closeButton(0), playerHeader(1), statsContainer(2), sliderSection(3), searchSection(4)
  let statsContainer = children[2];
  
  if (!statsContainer) {
    console.error('Stats container not found in modal structure');
    console.log('Available children:', children.map(child => child.tagName + (child.className ? '.' + child.className : '')));
    return;
  }
  
  if (!selectedPlayer) {
    console.error('No selected player');
    return;
  }

  console.log('Stats container found, updating interface');
  
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
      console.log('Date selected:', selectedDate);
      if (selectedDate) {
        await loadGameLogForDate(selectedDate);
      }
    });
    console.log('Date picker event listener added');
    
    // Automatically load today's game log when interface first opens
    console.log('Auto-loading game log for today:', todayString);
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
  
  // The statsContainer should be the 3rd child (index 2)
  let statsContainer = children[2];
  
  if (!statsContainer || !selectedPlayer) {
    console.error('Stats container not found or no selected player');
    return;
  }

  // Show loading message
  statsContainer.innerHTML = '<div style="text-align: center; padding: 20px;">Loading overall statistics...</div>';
  
  // Load the original player stats (Field Player Statistics)
  await loadPlayerStats(selectedPlayer.id, selectedPlayer.position, statsContainer);
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
    console.log(`Selected date: ${date}, calculated season year: ${seasonYear}`);
    
    // Get the player's team and league for the specific season year
    let teamIdForSeason = currentTeamId; // Default to current team
    let leagueForSeason = currentUefaLeague; // Default to current league
    
    // Fetch ESPN API data for the specific season to get accurate defaultTeam and defaultLeague
    try {
      console.log(`Fetching ESPN API data for player ${selectedPlayer.id} in season ${seasonYear}...`);
      const playerSeasonResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${currentUefaLeague}/seasons/${seasonYear}/athletes/${selectedPlayer.id}?lang=en&region=us`);
      
      if (playerSeasonResponse.ok) {
        const playerSeasonData = await playerSeasonResponse.json();
        console.log('ESPN Player Season API Response:', playerSeasonData);
        
        // For UEFA, check team.$ref instead of defaultTeam.$ref
        if (playerSeasonData.team && playerSeasonData.team.$ref) {
          const teamRefMatch = playerSeasonData.team.$ref.match(/teams\/(\d+)/);
          if (teamRefMatch) {
            teamIdForSeason = teamRefMatch[1];
            console.log(`Player's team from season ${seasonYear} data: ${teamIdForSeason}`);
          }
          
          // Extract league from team.$ref URL for UEFA
          const leagueRefMatch = playerSeasonData.team.$ref.match(/leagues\/([^\/]+)/);
          if (leagueRefMatch) {
            leagueForSeason = leagueRefMatch[1];
            console.log(`Player's league from season ${seasonYear} team ref: ${leagueForSeason}`);
          }
        }
        
      } else {
        console.log(`Could not fetch player's team for season ${seasonYear}, using stored data or fallback`);
        
        // Use stored defaultTeam and defaultLeague if available from initial fetch
        if (selectedPlayer.defaultTeam && selectedPlayer.defaultLeague) {
          teamIdForSeason = selectedPlayer.defaultTeam;
          leagueForSeason = selectedPlayer.defaultLeague;
          console.log(`Using stored team ${teamIdForSeason} and league ${leagueForSeason} for game log`);
        }
      }
    } catch (error) {
      console.log(`Error fetching player's season team:`, error);
      
      // Use stored defaultTeam and defaultLeague if available from initial fetch
      if (selectedPlayer.defaultTeam && selectedPlayer.defaultLeague) {
        teamIdForSeason = selectedPlayer.defaultTeam;
        leagueForSeason = selectedPlayer.defaultLeague;
        console.log(`Using stored default team ${teamIdForSeason} and league ${leagueForSeason} as fallback`);
      } else {
        console.log(`Using current team ${currentTeamId} and league ${currentUefaLeague} as final fallback`);
      }
    }

    // Format date for API (YYYYMMDD)
    const formattedDate = date.replace(/-/g, '');
    
    // Find games for the selected date using the determined league
    const scheduleResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueForSeason}/scoreboard?dates=${formattedDate}`);
    
    if (!scheduleResponse.ok) {
      throw new Error(`Schedule API returned ${scheduleResponse.status} for league ${leagueForSeason}`);
    }
    
    const scheduleData = await scheduleResponse.json();
    const games = scheduleData.events || [];
    
    console.log('Available games for date:', games.length);
    
    // Find game where our team participated using season-specific team ID
    const teamGame = games.find(event => {
      const competition = event.competitions?.[0];
      return competition?.competitors?.some(competitor => 
        competitor.team.id === teamIdForSeason
      );
    });

    if (!teamGame) {
      // Parse the date correctly to avoid timezone issues
      const [year, month, day] = date.split('-');
      const gameDate = new Date(year, month - 1, day); // month is 0-indexed
      
      resultsContainer.innerHTML = `
        <div style="border: 1px solid #ddd; border-radius: 12px; padding: 40px; background: #f8f9fa; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 15px;">📅</div>
          <div style="color: #777; font-size: 1.1rem; margin-bottom: 15px; font-weight: 500;">
            No game found for this date
          </div>
          <div style="color: #999; font-size: 0.95rem; line-height: 1.4;">
            ${currentTeam?.shortDisplayName || 'Team'} did not play on ${gameDate.toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
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

async function displayPlayerGameStats(game, date, teamIdForSeason, leagueForSeason = currentUefaLeague) {
  const resultsContainer = document.getElementById('gameLogResults');
  if (!resultsContainer || !selectedPlayer) return;

  try {
    // Get detailed game data with lineups using the same API as scoreboard.js
    const gameResponse = await fetch(`https://cdn.espn.com/core/soccer/lineups?xhr=1&gameId=${game.id}`);
    const gameData = await gameResponse.json();

    console.log('Game data structure:', gameData);

    // Get rosters from gamepackageJSON
    const rosters = gameData.gamepackageJSON?.rosters || [];
    console.log("Rosters data:", rosters);

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
        console.log('Player found in roster:', foundPlayer);
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

    const teamS = teamSHTScore ? `${teamScore} <sup>(${teamSHTScore})</sup>` : teamScore;
    const opponentS = opponentSHTScore ? `${opponentScore} <sup>(${opponentSHTScore})</sup>` : opponentScore;
    const isHomeTeam = teamCompetitor.homeAway === 'home';
    
    // Get season-specific team information and colors
    let seasonTeamColor = teamColor; // Default to current team color
    let seasonTeamName = currentTeam?.displayName || 'Team';
    let seasonTeamAbbr = currentTeam?.abbreviation || currentTeam?.shortDisplayName || 'UNK';
    
    // If using a different team for this season OR different league, fetch its information
    if (teamIdForSeason !== currentTeamId || leagueForSeason !== currentUefaLeague) {
      try {
        console.log(`Fetching team info for season-specific team ${teamIdForSeason} in league ${leagueForSeason}...`);
        const seasonTeamResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueForSeason}/teams/${teamIdForSeason}?lang=en&region=us`);
        
        if (seasonTeamResponse.ok) {
          const seasonTeamData = await seasonTeamResponse.json();
          console.log('Season team data:', seasonTeamData);
          
          // Apply the same team color logic as in loadTeamInfo()
          const isUsingAlternateColor = ["ffffff", "ffee00", "ffff00", "81f733", "000000"].includes(seasonTeamData.color);
          if (isUsingAlternateColor && seasonTeamData.alternateColor) {
            seasonTeamColor = `#${seasonTeamData.alternateColor}`;
          } else if (seasonTeamData.color) {
            seasonTeamColor = `#${seasonTeamData.color}`;
          }
          
          seasonTeamName = seasonTeamData.displayName || seasonTeamName;
          seasonTeamAbbr = seasonTeamData.abbreviation || seasonTeamData.shortDisplayName || seasonTeamAbbr;
          
          console.log(`Season team color: ${seasonTeamColor}, name: ${seasonTeamName}`);
        }
      } catch (error) {
        console.log('Could not fetch season team info, using current team colors:', error);
      }
    }
    
    // Team logos
    const teamLogo = `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamIdForSeason}.png`;
    const opponentLogo = `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${opponentCompetitor.team.id}.png`;

    // Game result and status
    let gameResult = '';
    let gameStatus = '';
    if (game.status.type.state === 'post') {
      const teamScoreInt = parseInt(teamScore);
      const opponentScoreInt = parseInt(opponentScore);
      const teamSHTScoreInt = parseInt(teamSHTScore);
      const opponentSHTScoreInt = parseInt(opponentSHTScore);

      if (teamScoreInt > opponentScoreInt || teamSHTScoreInt > opponentSHTScoreInt) {
        gameResult = 'W';
      } else if (teamScoreInt < opponentScoreInt || teamSHTScoreInt < opponentSHTScoreInt) {
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
            ${selectedPlayer.jersey}
          </div>
          <div>
            <div style="font-size: 1.3rem; font-weight: bold; margin-bottom: 2px;">${selectedPlayer.fullName}</div>
            <div style="color: #ccc; font-size: 0.9rem;">#${selectedPlayer.jersey} | ${position} | ${seasonTeamAbbr}</div>
          </div>
        </div>

        <!-- Game Header -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 25px; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 8px; cursor: pointer; transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.15)'" onmouseout="this.style.backgroundColor='rgba(255,255,255,0.1)'" onclick="window.open('scoreboard.html?gameId=${game.id}', '_blank')">
          <div style="display: flex; align-items: center; gap: 15px;">
            <img src="${teamLogo}" alt="${seasonTeamName}" style="height: 30px;" onerror="this.src='../soccer-ball-png-24.png';">
            <span style="font-size: 1.1rem; font-weight: bold; color: ${gameResult === 'W' ? '#fff' : '#ccc'};">${teamS}</span>
            <span style="color: #ccc;">-</span>
            <span style="font-size: 1.1rem; font-weight: bold; color: ${gameResult === 'L' ? '#fff' : '#ccc'};">${opponentS}</span>
            <img src="${opponentLogo}" alt="${opponentCompetitor.team.displayName}" style="height: 30px;" onerror="this.src='../soccer-ball-png-24.png';">
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
    console.log('Loading stats for comparison...');
    
    // Load player statistics for both players
    const [player1Stats, player2Stats] = await Promise.all([
      loadPlayerStatsForComparison(player1.id),
      loadPlayerStatsForComparison(player2.id)
    ]);

    console.log('Player 1 stats:', player1Stats);
    console.log('Player 2 stats:', player2Stats);

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
    // Always try ESPN statistics API first for consistency
    console.log(`Trying ESPN statistics API for player ${playerId}...`);
    try {
      const espnResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/athletes/${playerId}/statistics`);
      if (espnResponse.ok) {
        const espnData = await espnResponse.json();
        if (espnData.athlete && espnData.athlete.statistics) {
          console.log(`Successfully fetched stats for player ${playerId} from ESPN API`);
          return espnData.athlete.statistics;
        }
      } else {
        console.log(`ESPN statistics API failed for player ${playerId}, status: ${espnResponse.status}`);
      }
    } catch (e) {
      console.log(`ESPN statistics API call failed for player ${playerId}:`, e.message);
    }
    
    // If ESPN API failed, check if this player is in the current team's cached roster
    const currentTeamPlayer = allRosterPlayers.find(player => player.id === playerId);
    if (currentTeamPlayer) {
      console.log(`Using cached roster data for current team player ${playerId}`);
      // Return the cached statistics as fallback
      if (currentTeamPlayer.statistics) {
        console.log(`Found cached stats for current team player ${playerId}`);
        return currentTeamPlayer.statistics;
      } else {
        console.log(`No stats available for current team player ${playerId}`);
        return null;
      }
    }
    
    // Only search other teams if the player is not from the current team
    // Use the cached league players data instead of making new API calls
    console.log(`Player ${playerId} not in current team, checking cached league data...`);
    
    // Get all cached players (this will use already fetched data or fetch once if needed)
    const allPlayers = await fetchAllSoccerPlayers();
    
    // Find the player in the cached data
    const targetPlayer = allPlayers.find(player => player.id === playerId);
    if (targetPlayer) {
      console.log(`Found player ${playerId} in cached league data`);
      
      // Now we need to fetch the specific team's roster to get statistics
      // But only make ONE API call for the specific team, not all teams
      try {
        const teamRosterResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/teams/${targetPlayer.teamId || 'unknown'}/roster`);
        if (teamRosterResponse.ok) {
          const teamRosterData = await teamRosterResponse.json();
          const playerWithStats = teamRosterData.athletes?.find(athlete => {
            const athleteData = athlete.athlete || athlete;
            return athleteData.id === playerId;
          });
          
          if (playerWithStats) {
            const athleteData = playerWithStats.athlete || playerWithStats;
            console.log(`Found stats for player ${playerId} from their team`);
            return athleteData.statistics || null;
          }
        }
      } catch (teamError) {
        console.error(`Error fetching stats for player ${playerId}:`, teamError);
      }
    }
    
    console.log(`Player ${playerId} not found or no stats available`);
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
    console.log(`Clearing player ${playerNumber}`);
    
    // Get all soccer players
    const allPlayers = await fetchAllSoccerPlayers();
    
    // Find the specific player header to replace by ID
    const headerToReplace = modalContent.querySelector(`#player${playerNumber}-header`);
    
    if (!headerToReplace) {
      console.error(`Could not find header for player ${playerNumber}`);
      return;
    }

    console.log(`Found header for player ${playerNumber}, replacing...`);

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
    console.log(`Replaced header for player ${playerNumber}`);

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
        
        console.log('Search interface - looking for:', needsGoalkeeper ? 'goalkeepers' : 'field players');
        console.log('Remaining player:', remainingPlayer);
        console.log('Total allPlayers available:', allPlayersData.length);
        
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
              console.log('Selected replacement player:', player);
              
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
                
                console.log('Replacement player for comparison:', newPlayer);
                
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

    console.log(`Player ${playerNumber} replacement interface completed`);

  } catch (error) {
    console.error('Error in player selection interface:', error);
  }
}

// Function to get league name from league code
function getLeagueName(leagueCode) {
  const leagueNames = {
    'uefa.champions': 'Champions League',
    'uefa.europa': 'Europa League',
    'uefa.europa.conf': 'Europa Conference League',
    'uefa.super_cup': 'Super Cup'
  };
  return leagueNames[leagueCode] || leagueCode;
}

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
    const jerseyNumber = selectedPlayer.jersey || selectedPlayer.number || 'N/A';
    const position = selectedPlayer.position || 'N/A';
    const teamName = currentTeam?.displayName || 'Unknown Team';
    const teamAbbr = currentTeam?.abbreviation || currentTeam?.shortDisplayName || 'UNK';
    
    // Get the current league name
    const leagueName = Object.keys(LEAGUES).find(key => LEAGUES[key].code === currentUefaLeague) || 'UEFA';

    // Get team logo
    const teamLogo = getTeamLogo(currentTeam);

    // Create a styled container specifically for the image capture
    const captureContainer = document.createElement('div');
    captureContainer.style.cssText = `
      background: linear-gradient(135deg, ${teamColor || '#1a1a1a'} 0%, ${teamColor ? teamColor + '88' : '#333'} 100%);
      color: white;
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
    const playerHeaderHtml = `
      <div style="display: flex; align-items: center; margin-bottom: 25px; background: rgba(255,255,255,0.1); padding: 20px; border-radius: 12px;">
        <div style="background: white; border-radius: 50%; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; margin-right: 20px; font-size: 24px; font-weight: bold; color: ${teamColor || '#1a1a1a'};">
          ${jerseyNumber}
        </div>
        <div style="flex: 1;">
          <h2 style="margin: 0 0 8px 0; font-size: 26px; font-weight: bold;">${playerName}</h2>
          <div style="font-size: 16px; opacity: 0.9; margin-bottom: 4px;">${position} | ${teamAbbr}</div>
          <div style="font-size: 14px; opacity: 0.8;">${teamName} - ${leagueName}</div>
        </div>
        <img src="${teamLogo}" alt="${teamName}" style="width: 60px; height: 60px; border-radius: 8px;" onerror="this.style.display='none';">
      </div>
    `;

    // Get the current stats content and clean it up for the image
    const statsContent = element.cloneNode(true);
    
    // Remove the copy button from the cloned content
    const copyButton = statsContent.querySelector('[onclick*="copyPlayerStatsAsImage"]');
    if (copyButton) {
      copyButton.remove();
    }

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
      card.style.border = '1px solid rgba(255,255,255,0.2)';
      card.style.color = 'white';
    });

    // Style headers and text for dark background
    const headers = statsContent.querySelectorAll('h3, h4');
    headers.forEach(header => {
      header.style.color = 'white';
      header.style.borderBottomColor = 'rgba(255,255,255,0.3)';
    });

    const text = statsContent.querySelectorAll('div, p');
    text.forEach(textEl => {
      if (textEl.style.color === '#333' || textEl.style.color === '#777') {
        textEl.style.color = 'white';
      }
      if (textEl.style.color === 'rgb(51, 51, 51)' || textEl.style.color === 'rgb(102, 102, 102)') {
        textEl.style.color = 'white';
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
      color: white;
    `;
    watermark.textContent = `${leagueName} Season Stats`;
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
          link.download = `${playerName.replace(/\s+/g, '-')}-stats-${leagueName}.png`;
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
            link.download = `${playerName.replace(/\s+/g, '-')}-stats-${leagueName}.png`;
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

// Function to copy game log card as image
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
        // For UEFA team logos, replace with a placeholder or try to convert
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
              img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjNjY2Ci8+CjwvdGV4dD4KPC9zdmc+';
              resolve();
            };
            
            // Start loading
            tempImg.src = img.src;
          });
        }
      } catch (e) {
        console.log('Error processing image:', e);
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

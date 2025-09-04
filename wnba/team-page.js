let currentTeam = null;
let currentTeamId = null;
let currentPage = 1;
let allRecentMatches = [];
let matchesPerPage = 4;
let currentRosterPage = 1;
let allRosterPlayers = [];
let playersPerPage = 4;
let selectedPlayer = null;
let playersForComparison = []; // Array to store players selected for comparison
let currentStatsMode = 'overall'; // Track current stats view mode: 'overall' or 'gamelog'

// Convert HTTP URLs to HTTPS to avoid mixed content issues
function convertToHttps(url) {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

// Helper function to fetch athlete statistics with fallback from types/2 to types/1
async function fetchAthleteStats(sport, league, seasonYear, athleteId) {
  const baseUrl = `https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}/seasons/${seasonYear}`;
  
  // Try types/2 first
  try {
    const types2Url = `${baseUrl}/types/2/athletes/${athleteId}/statistics?lang=en&region=us`;
    const response = await fetch(types2Url);
    
    if (response.ok) {
      const data = await response.json();
      
      // Check if the response contains the error message about no stats found
      if (data.error && data.error.code === 404 && data.error.message === "No stats found.") {
        console.log(`No stats found for types/2, trying types/1 for athlete ${athleteId}`);
      } else if (data.splits && data.splits.categories) {
        console.log(`Successfully fetched types/2 stats for athlete ${athleteId}`);
        return { data, url: types2Url };
      }
    } else if (response.status === 404) {
      console.log(`404 error for types/2, trying types/1 for athlete ${athleteId}`);
    } else {
      console.log(`Error ${response.status} for types/2, trying types/1 for athlete ${athleteId}`);
    }
  } catch (error) {
    console.log(`Exception with types/2, trying types/1 for athlete ${athleteId}:`, error.message);
  }
  
  // Fallback to types/1
  try {
    const types1Url = `${baseUrl}/types/1/athletes/${athleteId}/statistics?lang=en&region=us`;
    const response = await fetch(types1Url);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`Successfully fetched types/1 stats for athlete ${athleteId}`);
      return { data, url: types1Url };
    } else {
      console.error(`Both types/2 and types/1 failed for athlete ${athleteId}`);
      throw new Error(`Failed to fetch statistics: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Exception with types/1 for athlete ${athleteId}:`, error.message);
    throw error;
  }
}

// Get the appropriate season year, falling back to previous year if current year has no data
async function getValidSeasonYear(sport, league, playerId = null, teamId = null) {
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;
  
  // Test current year first
  let testUrl;
  if (playerId) {
    try {
      const result = await fetchAthleteStats(sport, league, currentYear, playerId);
      if (result && result.data && ((result.data.splits && result.data.splits.categories && result.data.splits.categories.length > 0) || 
          (result.data.statistics && result.data.statistics.length > 0))) {
        return currentYear;
      }
    } catch (error) {
      console.log(`Current year ${currentYear} stats not available, trying previous year`);
    }
  } else if (teamId) {
    testUrl = `https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}/seasons/${currentYear}/types/2/teams/${teamId}/statistics?lang=en&region=us`;
    try {
      const response = await fetch(testUrl);
      const data = await response.json();
      
      // Check if current year has valid stats data
      if (response.ok && data && ((data.splits && data.splits.categories && data.splits.categories.length > 0) || 
          (data.statistics && data.statistics.length > 0))) {
        return currentYear;
      }
    } catch (error) {
      console.log(`Current year ${currentYear} stats not available, trying previous year`);
    }
  } else {
    return currentYear; // Default to current year if no specific entity to test
  }
  
  // Fall back to previous year
  return previousYear;
}

// Initialize the page
document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  currentTeamId = urlParams.get('teamId');
  
  if (!currentTeamId) {
    window.location.href = 'search.html';
    return;
  }
  
  loadTeamData();
  setupEventHandlers();
});

function setupEventHandlers() {
  const startDatePicker = document.getElementById('startDatePicker');
  const prevPageBtn = document.getElementById('prevPage');
  const nextPageBtn = document.getElementById('nextPage');

  // Set default start date to 10 days ago
  const today = new Date();
  const defaultStartDate = new Date(today);
  defaultStartDate.setDate(today.getDate() - 10);
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
      contentDiv.innerHTML = '<div style="text-align: center; padding: 20px;">Loading matches...</div>';
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
}

async function loadTeamData() {
  try {
    // Load team information
    await loadTeamInfo();
    
    // Load all sections
    await Promise.all([
      loadCurrentGame(),
      loadRecentMatches(),
      loadUpcomingMatches(),
      loadTeamStats(),
      loadCurrentStanding(),
      loadPlayersInfo()
    ]);
  } catch (error) {
    console.error("Error loading team data:", error);
  }
}

async function loadTeamInfo() {
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/${currentTeamId}`);
    const data = await response.json();
    currentTeam = data.team;
    
    const logoUrl = convertToHttps(currentTeam.logos?.find(logo =>
        logo.rel.includes(
          ["26"].includes(currentTeam.id) ? 'secondary_logo_on_secondary_color' : 'primary_logo_on_primary_color'
        )
    )?.href) || `https://a.espncdn.com/i/teamlogos/wnba/500/${currentTeam.abbreviation}.png`;

    const teamColor = `#${currentTeam.color}` || "#000000";

    // Set the background color of the team info section
    const teamInfoSection = document.querySelector('.team-info-section');
    if (teamInfoSection) {
      teamInfoSection.style.backgroundColor = teamColor;
      teamInfoSection.style.color = "#ffffff";
    }
    
    // Apply team color to various elements
    applyTeamColors(teamColor);
    
    // Get team record from standings
    try {
      const standingsResponse = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard');
      const standingsData = await standingsResponse.json();
      // This is simplified - we could get more detailed record info from standings API
    } catch (error) {
      console.log("Could not load team record");
    }
    
    document.getElementById('teamInfo').innerHTML = `
      <div class="team-header">
        <img src="${logoUrl}" alt="${currentTeam.displayName}" class="team-logo-header" onerror="this.src='icon.png';">
        <div class="team-details-header">
          <div class="team-name-header">${currentTeam.displayName}</div>
          <div class="team-record-header">${currentTeam.standingSummary}</div>
          <div class="team-division-header">${currentTeam.abbreviation} -  WNBA</div>
        </div>
      </div>
    `;
    
    // Update page title
    document.title = `${currentTeam.displayName} - WNBA`;
  } catch (error) {
    console.error("Error loading team info:", error);
    document.getElementById('teamInfo').innerHTML = '<div class="no-data">Error loading team information</div>';
  }
}

function applyTeamColors(teamColor) {
  // Apply team color to section headers and other blue elements
  const style = document.createElement('style');
  style.textContent = `
    .section-card h3 {
      border-bottom-color: ${teamColor} !important;
    }
    .game-status {
      color: ${teamColor} !important;
    }
    .team-stat-value {
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
  `;
  document.head.appendChild(style);
}

async function loadCurrentGame() {
  try {
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
    
    const today = getAdjustedDateForNBA();
    
    // Fetch WNBA games
    const todayResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${today}`);
    const todayData = await todayResponse.json();
    
    const contentDiv = document.getElementById('currentGameContent');
    
    // Check if there's a game today for this team
    const todayGame = todayData.events?.find(event => {
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
          const gameDate = gameCardElement.getAttribute('data-game-date');
          if (gameId && gameDate) {
            window.location.href = `scoreboard.html?gameId=${gameId}&date=${gameDate}`;
          }
        });
      }
    } else {
        contentDiv.innerHTML = '<div class="no-data">No game being played today</div>';
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
  const opponentScore = isHomeTeam ? awayTeam.score : homeTeam.score;

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

  const status = game.status.type.description;
  let statusText = "";
  let scoreDisplay = "";

  if (status === "Scheduled") {
    statusText = `${formattedDate} at ${formattedTime}`;
    scoreDisplay = isHomeTeam ? "vs" : "at";
  } else if (status === "Final") {
    statusText = "Final";
    scoreDisplay = `${teamScore || 0} - ${opponentScore || 0}`;
  } else {
    statusText = status;
    scoreDisplay = `${teamScore || 0} - ${opponentScore || 0}`;
  }

  const teamLogo = `https://a.espncdn.com/i/teamlogos/wnba/500/${currentTeam.abbreviation}.png`;
  const opponentLogo = `https://a.espncdn.com/i/teamlogos/wnba/500/${opponent.team.abbreviation}.png`;

  // Format game date for URL parameter
  const gameUrlDate = gameDate.getFullYear() +
                     String(gameDate.getMonth() + 1).padStart(2, "0") +
                     String(gameDate.getDate()).padStart(2, "0");

  return `
    <div class="current-game-card" data-game-id="${game.id}" data-game-date="${gameUrlDate}">
      <div class="game-status">${statusText}</div>
      <div class="game-teams">
        <div class="game-team">
          <img src="${teamLogo}" alt="${currentTeam.displayName}" class="game-team-logo" onerror="this.src='icon.png';">
          <div class="game-team-name">${currentTeam.abbreviation}</div>
        </div>
        <div class="game-score">${scoreDisplay}</div>
        <div class="game-team">
          <img src="${opponentLogo}" alt="${opponent.team.displayName}" class="game-team-logo" onerror="this.src='icon.png';">
          <div class="game-team-name">${opponent.team.abbreviation}</div>
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
    const startDate = startDatePicker ? new Date(startDatePicker.value) : new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000);
    
    // Format dates for WNBA API
    const formatDate = (date) => {
      return date.getFullYear() +
        String(date.getMonth() + 1).padStart(2, "0") +
        String(date.getDate()).padStart(2, "0");
    };
    
    const dateRange = `${formatDate(startDate)}-${formatDate(today)}`;
    
    // Fetch WNBA games
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${dateRange}`);
    const data = await response.json();
    
    // Filter games for this team and completed games
    const allGames = data.events?.filter(event => {
      const competition = event.competitions?.[0];
      return competition?.competitors.some(competitor => competitor.team.id === currentTeamId);
    }) || [];
    
    allRecentMatches = allGames
      .filter(game => game.status.type.description === "Final")
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
          const gameDate = item.getAttribute('data-game-date');
          if (gameId && gameDate) {
            window.location.href = `scoreboard.html?gameId=${gameId}&date=${gameDate}`;
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
  const teamScore = parseInt(isHomeTeam ? homeTeam.score : awayTeam.score) || 0;
  const opponentScore = parseInt(isHomeTeam ? awayTeam.score : homeTeam.score) || 0;

  const gameDate = new Date(game.date);
  const formattedDate = gameDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });

  const teamLogo = `https://a.espncdn.com/i/teamlogos/wnba/500/${currentTeam.abbreviation}.png`;
  const opponentLogo = `https://a.espncdn.com/i/teamlogos/wnba/500/${opponent.team.abbreviation}.png`;

  let resultClass = "";
  let resultText = "";

  if (game.status.type.description === "Final") {
    if (teamScore > opponentScore) {
      resultClass = "win";
      resultText = `W ${teamScore}-${opponentScore}`;
    } else {
      resultClass = "loss";
      resultText = `L ${teamScore}-${opponentScore}`;
    }
  } else {
    resultClass = "scheduled";
    resultText = isHomeTeam ? "vs" : "at";
  }

  // Format game date for URL parameter
  const gameUrlDate = gameDate.getFullYear() +
                     String(gameDate.getMonth() + 1).padStart(2, "0") +
                     String(gameDate.getDate()).padStart(2, "0");

  return `
    <div class="match-item" data-game-id="${game.id}" data-game-date="${gameUrlDate}">
      <div class="match-teams">
        <div class="match-team-info">
          <img src="${teamLogo}" alt="${currentTeam.abbreviation}" class="match-team-logo" onerror="this.src='icon.png';">
          <div class="match-team-name">${currentTeam.abbreviation}</div>
        </div>
        <div class="match-result ${resultClass}">
        ${resultText}
        <div class="match-date" style="margin-top: 10px;">${formattedDate}</div>
        </div>
        <div class="match-team-info">
          <div class="match-team-name">${opponent.team.abbreviation}</div>
          <img src="${opponentLogo}" alt="${opponent.team.abbreviation}" class="match-team-logo" onerror="this.src='icon.png';">
        </div>
      </div>
    </div>
  `;
}

// Global variable to store all WNBA players for league-wide comparison
let allNBAPlayers = [];

async function fetchAllNBAPlayers() {
  if (allNBAPlayers.length > 0) {
    return allNBAPlayers; // Return cached data
  }

  try {
    // Fetch all WNBA teams
    const teamsResponse = await fetch('https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/teams?lang=en&region=us');
    const teamsData = await teamsResponse.json();
    
    const allPlayers = [];
    
    // Fetch roster for each team
    const teamPromises = teamsData.items.map(async (teamRef) => {
      try {
        const teamResponse = await fetch(convertToHttps(`${teamRef.$ref}?lang=en&region=us`));
        const teamData = await teamResponse.json();
        
        if (teamData.athletes && teamData.athletes.$ref) {
          const rosterResponse = await fetch(convertToHttps(`${teamData.athletes.$ref}?lang=en&region=us`));
          const rosterData = await rosterResponse.json();
          
          if (rosterData.items) {
            const playerPromises = rosterData.items.map(async (playerRef) => {
              try {
                const playerResponse = await fetch(convertToHttps(`${playerRef.$ref}?lang=en&region=us`));
                const playerData = await playerResponse.json();
                
                return {
                  id: playerData.id,
                  firstName: playerData.firstName || '',
                  lastName: playerData.lastName || playerData.displayName || 'Unknown',
                  displayName: playerData.displayName || `${playerData.firstName || ''} ${playerData.lastName || ''}`.trim(),
                  jersey: playerData.jersey || 'N/A',
                  position: playerData.position?.abbreviation || 'N/A',
                  headshot: convertToHttps(playerData.headshot?.href) || 'icon.png',
                  team: teamData.displayName || 'Unknown Team',
                  teamId: teamData.id
                };
              } catch (error) {
                console.error('Error fetching player:', error);
                return null;
              }
            });
            
            const players = await Promise.all(playerPromises);
            return players.filter(player => player !== null);
          }
        }
        return [];
      } catch (error) {
        console.error('Error fetching team roster:', error);
        return [];
      }
    });

    const teamRosters = await Promise.all(teamPromises);
    teamRosters.forEach(roster => {
      allPlayers.push(...roster);
    });

    allNBAPlayers = allPlayers;
    console.log(`Loaded ${allNBAPlayers.length} WNBA players for comparison`);
    return allNBAPlayers;
  } catch (error) {
    console.error('Error fetching all WNBA players:', error);
    return [];
  }
}

async function showPlayerSelectionInterface(playerNumber, modal, modalContent, currentPlayer1, currentPlayer2) {
  try {
    console.log(`Clearing player ${playerNumber}`);
    
    // Get all WNBA players
    const allPlayers = await fetchAllNBAPlayers();
    
    // Find the specific player header to replace by ID
    const headerToReplace = modalContent.querySelector(`#player${playerNumber}-header`);
    
    if (!headerToReplace) {
      console.log(`Header not found for player ${playerNumber}`);
      return;
    }

    console.log(`Found header for player ${playerNumber}, replacing...`);

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
    searchInput.placeholder = 'Search any WNBA player...';
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
      const otherClearButton = otherPlayerHeader.querySelector('.player-clear-btn');
      if (otherClearButton) {
        otherClearButton.style.display = 'none';
        console.log(`Hidden clear button for player ${otherPlayerNumber}`);
      }
    }

    // Clear the comparison stats as well - target the stats container by ID
    const statsContainer = modalContent.querySelector('#comparison-stats-container');
    if (statsContainer) {
      statsContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #6c757d; font-style: italic;">Select two players to compare their statistics</div>';
      console.log('Cleared stats container');
    } else {
      console.log('Stats container not found');
    }

    // Add button hover effects
    addButton.addEventListener('mouseenter', () => {
      addButton.style.backgroundColor = '#495057';
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

      searchTimeout = setTimeout(() => {
        const filteredPlayers = allPlayers
          .filter(player => {
            const fullName = `${player.firstName || ''} ${player.lastName || ''}`.toLowerCase();
            const teamName = player.team.toLowerCase();
            return (fullName.includes(query) || teamName.includes(query)) && 
                   player.id !== currentPlayer1.id && 
                   player.id !== currentPlayer2.id;
          })
          .slice(0, 5); // Max 5 results

        if (filteredPlayers.length > 0) {
          searchResults.innerHTML = filteredPlayers.map(player => `
            <div class="league-search-result" data-player-id="${player.id}" style="
              padding: 10px;
              cursor: pointer;
              border-bottom: 1px solid #eee;
              display: flex;
              align-items: center;
              gap: 10px;
              transition: background-color 0.2s ease;
            " onmouseover="this.style.backgroundColor='#f0f0f0'" onmouseout="this.style.backgroundColor='white'">
              <img src="${convertToHttps(player.headshot)}" alt="${player.displayName}" 
                   style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;" 
                   onerror="this.src='icon.png';">
              <div>
                <div style="font-weight: bold; color: #333;">${player.displayName}</div>
                <div style="font-size: 12px; color: #777;">${player.team} | #${player.jersey} | ${player.position}</div>
              </div>
            </div>
          `).join('');
          
          searchResults.style.display = 'block';

          // Add click handlers
          searchResults.querySelectorAll('.league-search-result').forEach(item => {
            item.addEventListener('click', () => {
              const playerId = item.getAttribute('data-player-id');
              const selectedPlayer = allPlayers.find(p => p.id === playerId);
              
              if (selectedPlayer) {
                // Close current modal
                document.body.removeChild(modal);
                
                // Create new comparison with selected player
                const newPlayer1 = playerNumber === "1" ? selectedPlayer : currentPlayer1;
                const newPlayer2 = playerNumber === "2" ? selectedPlayer : currentPlayer2;
                
                // Reset the playersForComparison array with the new players
                playersForComparison = [newPlayer1, newPlayer2];
                
                showPlayerComparison(newPlayer1, newPlayer2);
              }
            });
          });
        } else {
          searchResults.innerHTML = '<div style="padding: 10px; color: #777; text-align: center;">No players found</div>';
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
    
    // Fetch WNBA games
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${dateRange}`);
    const data = await response.json();
    
    const upcomingGames = data.events
      .filter(event => {
        const competition = event.competitions?.[0];
        return competition?.competitors.some(competitor => competitor.team.id === currentTeamId);
      })
      .filter(event => event.status.type.description === "Scheduled")
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 5) || [];
    
    const contentDiv = document.getElementById('upcomingMatchesContent');
    
    if (upcomingGames.length === 0) {
      contentDiv.innerHTML = '<div class="no-data">No upcoming matches found</div>';
      return;
    }
    
    const matchCards = await Promise.all(upcomingGames.map(game => createMatchCard(game, false)));
    contentDiv.innerHTML = `<div class="match-list">${matchCards.join('')}</div>`;
    
    // Add click handlers
    contentDiv.querySelectorAll('.match-item').forEach(item => {
      item.addEventListener('click', () => {
        const gameId = item.getAttribute('data-game-id');
        const gameDate = item.getAttribute('data-game-date');
        if (gameId && gameDate) {
          window.location.href = `scoreboard.html?gameId=${gameId}&date=${gameDate}`;
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
    // WNBA doesn't have a direct team stats API like MLB, so we'll show basic info
    const contentDiv = document.getElementById('teamStatsContent');
    
    // Get valid season year and try to get team info from the main team API
    const seasonYear = await getValidSeasonYear('basketball', 'wnba', null, currentTeamId);
    const response = await fetch(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/seasons/${seasonYear}/types/2/teams/${currentTeamId}/statistics?lang=en&region=us`);
    const data = await response.json();
    
    if (data.team) {
      const stats = [
        { label: "Avg Points For", value: data?.splits?.categories?.find(c => c.name === "offensive")?.stats?.find(s => s.name === "avgPoints")?.displayValue || "N/A" },
        { label: "Field Goal %", value: data?.splits?.categories?.find(c => c.name === "offensive")?.stats?.find(s => s.name === "fieldGoalPct")?.displayValue || "N/A" },
        { label: "Rebounds", value: data?.splits?.categories?.find(c => c.name === "general")?.stats?.find(s => s.name === "avgRebounds")?.displayValue || "N/A" },
        { label: "Assists", value: data?.splits?.categories?.find(c => c.name === "offensive")?.stats?.find(s => s.name === "avgAssists")?.displayValue || "N/A" },
        { label: "Steals", value: data?.splits?.categories?.find(c => c.name === "defensive")?.stats?.find(s => s.name === "avgSteals")?.displayValue || "N/A" },
        { label: "Blocks", value: data?.splits?.categories?.find(c => c.name === "defensive")?.stats?.find(s => s.name === "avgBlocks")?.displayValue || "N/A" },
        { label: "Turnovers", value: data?.splits?.categories?.find(c => c.name === "offensive")?.stats?.find(s => s.name === "avgTurnovers")?.displayValue || "N/A" },
        { label: "Fouls", value: data?.splits?.categories?.find(c => c.name === "general")?.stats?.find(s => s.name === "avgFouls")?.displayValue || "N/A" },
        { label: "Free Throw %", value: data?.splits?.categories?.find(c => c.name === "offensive")?.stats?.find(s => s.name === "freeThrowPct")?.displayValue || "N/A" },
        { label: "3 Point %", value: data?.splits?.categories?.find(c => c.name === "offensive")?.stats?.find(s => s.name === "threePointPct")?.displayValue || "N/A" }
      ];
      
      contentDiv.innerHTML = `
        <div class="team-stats-grid">
          ${stats.map(stat => `
            <div class="team-stat-item">
              <div class="team-stat-value">${stat.value}</div>
              <div class="team-stat-label">${stat.label}</div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      contentDiv.innerHTML = '<div class="no-data">Team statistics not available</div>';
    }
  } catch (error) {
    console.error("Error loading team stats:", error);
    document.getElementById('teamStatsContent').innerHTML = '<div class="no-data">Error loading team statistics</div>';
  }
}

async function loadCurrentStanding() {
  try {
    const STANDINGS_URL = `https://cdn.espn.com/core/wnba/standings?xhr=1`;
    const contentDiv = document.getElementById('currentStandingContent');
    
    const res = await fetch(STANDINGS_URL);
    const text = await res.text();
    const data = JSON.parse(text);

    // Get all standings entries from data.content.standings.standings.entries (following standings.js pattern)
    const allEntries =
      data.content &&
      data.content.standings &&
      data.content.standings.standings &&
      Array.isArray(data.content.standings.standings.entries)
        ? data.content.standings.standings.entries
        : [];

    // Find current team in all entries
    const teamStanding = allEntries.find(entry => entry.team.id === currentTeamId);
    
    if (!teamStanding) {
      contentDiv.innerHTML = '<div class="no-data">Team not found in standings</div>';
      return;
    }

    // Get conference order from tier2Nav.subNavMenu.navigation.items (following standings.js pattern)
    let eastOrder = [];
    let westOrder = [];
    const tier2Nav = data.content.tier2Nav;
    if (
      tier2Nav &&
      tier2Nav.subNavMenu &&
      tier2Nav.subNavMenu.navigation &&
      Array.isArray(tier2Nav.subNavMenu.navigation.items)
    ) {
      let east = false, west = false;
      for (const item of tier2Nav.subNavMenu.navigation.items) {
        if (item.links && item.links[0]) {
          const link = item.links[0];
          if (link.text === "Eastern Conference") {
            east = true;
            west = false;
            continue;
          }
          if (link.text === "Western Conference") {
            west = true;
            east = false;
            continue;
          }
          if (link.rel && link.rel.includes("team") && link.attributes && link.attributes.teamAbbrev) {
            if (east) eastOrder.push(link.attributes.teamAbbrev);
            if (west) westOrder.push(link.attributes.teamAbbrev);
          }
        }
      }
    }

    // Fallback to default order if not found (from standings.js)
    if (eastOrder.length === 0) eastOrder = ["ATL", "CHI", "CONN", "IND", "NY", "WSH"];
    if (westOrder.length === 0) westOrder = ["DAL", "GS", "LV", "LA", "MIN", "PHX", "SEA"];

    // Determine which conference the team is in
    const teamAbbr = teamStanding.team.abbreviation;
    let conferenceName = "";
    if (eastOrder.includes(teamAbbr)) {
      conferenceName = "Eastern Conference";
    } else if (westOrder.includes(teamAbbr)) {
      conferenceName = "Western Conference";
    } else {
      conferenceName = "Conference";
    }

    // Extract stats using the same pattern as standings.js
    const wins = teamStanding.stats.find(stat => stat.name === "wins")?.displayValue || "0";
    const losses = teamStanding.stats.find(stat => stat.name === "losses")?.displayValue || "0";
    const winPercent = teamStanding.stats.find(stat => stat.name === "winPercent")?.displayValue || "0.000";
    const gamesBehind = teamStanding.stats.find(stat => stat.name === "gamesBehind")?.displayValue || "-";
    const teamSeed = teamStanding.team.seed || "N/A";
    
    // Add ordinal suffix helper function (from standings.js)
    const getOrdinalSuffix = (num) => {
      const j = num % 10;
      const k = num % 100;
      if (j === 1 && k !== 11) return num + "st";
      if (j === 2 && k !== 12) return num + "nd";
      if (j === 3 && k !== 13) return num + "rd";
      return num + "th";
    };
    
    contentDiv.innerHTML = `
      <div class="standing-info">
        <div class="standing-position">${getOrdinalSuffix(teamSeed)}</div>
        <div class="standing-details">
          <strong>${conferenceName}</strong><br><br>
          Record: ${wins}-${losses}<br><br>
          Win %: ${winPercent}<br><br>
          GB: ${gamesBehind}<br>
        </div>
      </div>
    `;
  } catch (error) {
    console.error("Error loading standings:", error);
    document.getElementById('currentStandingContent').innerHTML = '<div class="no-data">Error loading standings</div>';
  }
}

async function loadPlayersInfo() {
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/${currentTeamId}/roster`);
    const data = await response.json();
    
    const contentDiv = document.getElementById('playersInfoContent');
    
    if (data.athletes && data.athletes.length > 0) {
      // Players are directly in the athletes array
      allRosterPlayers = data.athletes;
      
      // Sort players by jersey number
      allRosterPlayers.sort((a, b) => {
        const numA = parseInt(a.jersey) || 999;
        const numB = parseInt(b.jersey) || 999;
        return numA - numB;
      });
      
      currentRosterPage = 1;
      displayRosterPlayers();
    } else {
      console.log('No athletes found in response');
      contentDiv.innerHTML = '<div class="no-data">Player roster not available</div>';
    }
  } catch (error) {
    console.error("Error loading players:", error);
    document.getElementById('playersInfoContent').innerHTML = '<div class="no-data">Error loading player information</div>';
  }
}

function displayRosterPlayers() {
  
  const contentDiv = document.getElementById('playersInfoContent');
  
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
    const position = player.position?.abbreviation || "N/A";
    const jerseyNumber = player.jersey || "N/A";
    const firstName = player.firstName || "";
    const lastName = player.lastName || player.displayName || "Unknown";
    const headshotUrl = convertToHttps(player.headshot?.href) || "icon.png";
    
    return `
      <div class="player-card" 
           data-player-id="${player.id}" 
           data-first-name="${firstName}" 
           data-last-name="${lastName}" 
           data-jersey-number="${jerseyNumber}" 
           data-position="${position}" 
           data-headshot-url="${headshotUrl}">
        <img src="${headshotUrl}" alt="${firstName} ${lastName}" class="player-headshot" onerror="this.src='icon.png';">
        <div class="player-name-column">
          <div class="player-first-name">${firstName}</div>
          <div class="player-last-name">${lastName}</div>
        </div>
        <div class="player-number">#${jerseyNumber}</div>
        <div class="player-position">${position}</div>
      </div>
    `;
  }).join('');
  
  contentDiv.innerHTML = `
    <div class="roster-list">
      ${playerCards}
    </div>
    <div class="roster-pagination">
      <button id="prevRosterPage" class="pagination-btn" ${currentRosterPage <= 1 ? 'disabled' : ''}>
        Previous
      </button>
      <span class="page-info">Page ${currentRosterPage} of ${totalPages}</span>
      <button id="nextRosterPage" class="pagination-btn" ${currentRosterPage >= totalPages ? 'disabled' : ''}>
        Next
      </button>
    </div>
  `;
  
  // Add event listeners for player cards
  contentDiv.querySelectorAll('.player-card').forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      const playerId = card.getAttribute('data-player-id');
      const firstName = card.getAttribute('data-first-name');
      const lastName = card.getAttribute('data-last-name');
      const jerseyNumber = card.getAttribute('data-jersey-number');
      const position = card.getAttribute('data-position');
      const headshotUrl = card.getAttribute('data-headshot-url');
      
      showPlayerDetails(playerId, firstName, lastName, jerseyNumber, position, headshotUrl);
    });
  });
  
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
      if (currentRosterPage < totalPages) {
        currentRosterPage++;
        displayRosterPlayers();
      }
    });
  }
}

async function showPlayerDetails(playerId, firstName, lastName, jerseyNumber, position, headshotUrl) {
  try {
    // Set selected player info
    selectedPlayer = {
      id: playerId,
      firstName: firstName,
      lastName: lastName,
      jersey: jerseyNumber,
      position: position,
      headshot: headshotUrl
    };

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

    // Create player header
    const playerHeader = document.createElement('div');
    playerHeader.className = 'selected-player-header';
    playerHeader.style.cssText = `
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 20px;
      padding: 15px;
      background-color: #f8f9fa;
      border-radius: 8px;
    `;
    playerHeader.innerHTML = `
      <img src="${headshotUrl}" alt="${firstName} ${lastName}" 
           style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover;" 
           onerror="this.src='icon.png';">
      <div>
        <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 5px;">
          ${firstName} ${lastName}
        </div>
        <div style="font-size: 1.1rem; color: #777;">
          #${jerseyNumber} | ${position}
        </div>
      </div>
    `;

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
    const teamColor = currentTeam && currentTeam.color ? `#${currentTeam.color}` : '#17408B';
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

    // Add search functionality
    let searchTimeout;
    searchInput.addEventListener('input', async (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim().toLowerCase();
      
      if (query.length < 2) {
        searchResults.style.display = 'none';
        return;
      }

      searchTimeout = setTimeout(async () => {
        // Get all WNBA players for league-wide search
        const allPlayers = await fetchAllNBAPlayers();
        const filteredPlayers = allPlayers
          .filter(player => {
            const fullName = `${player.firstName || ''} ${player.lastName || ''}`.toLowerCase();
            const teamName = player.team.toLowerCase();
            return (fullName.includes(query) || teamName.includes(query)) && player.id !== selectedPlayer.id;
          })
          .slice(0, 3); // Max 3 results

        if (filteredPlayers.length > 0) {
          searchResults.innerHTML = filteredPlayers.map(player => `
            <div class="search-result-item" data-player-id="${player.id}" style="
              padding: 10px;
              cursor: pointer;
              border-bottom: 1px solid #eee;
              display: flex;
              align-items: center;
              gap: 10px;
              transition: background-color 0.2s ease;
            " onmouseover="this.style.backgroundColor='#f0f0f0'" onmouseout="this.style.backgroundColor='white'">
              <img src="${convertToHttps(player.headshot)}" alt="${player.displayName}" 
                   style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;" 
                   onerror="this.src='icon.png';">
              <div>
                <div style="font-weight: bold; color: #333;">${player.displayName}</div>
                <div style="font-size: 12px; color: #777;">${player.team} | #${player.jersey} | ${player.position}</div>
              </div>
            </div>
          `).join('');
          
          searchResults.style.display = 'block';

          // Add click handlers to search results
          searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
              const playerId = item.getAttribute('data-player-id');
              const player = allPlayers.find(p => p.id === playerId);
              if (player) {
                const playerForComparison = {
                  id: player.id,
                  firstName: player.firstName || '',
                  lastName: player.lastName || player.displayName || 'Unknown',
                  jersey: player.jersey || 'N/A',
                  position: player.position || 'N/A',
                  headshot: convertToHttps(player.headshot) || 'icon.png'
                };
                
                // Close current modal
                document.body.removeChild(modal);
                
                // Start comparison
                playersForComparison = [selectedPlayer, playerForComparison];
                showPlayerComparison(selectedPlayer, playerForComparison);
              }
            });
          });
        } else {
          searchResults.innerHTML = '<div style="padding: 10px; color: #777; text-align: center;">No players found</div>';
          searchResults.style.display = 'block';
        }
      }, 300);
    });

    // Hide search results when clicking outside
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

    // Add modal to document
    document.body.appendChild(modal);

    // Get valid season year and fetch player stats
    const seasonYear = await getValidSeasonYear('basketball', 'wnba', playerId);
    const result = await fetchAthleteStats('basketball', 'wnba', seasonYear, playerId);

    console.log('Player stats data:', result.data);

    if (result.data.splits && result.data.splits.categories) {
      displayPlayerStatsInModal(result.data.splits.categories, statsContainer);
    } else {
      statsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;">Player statistics not available</div>';
    }

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });

  } catch (error) {
    console.error('Error loading player details:', error);
    
    // If there's an error and modal exists, show error in modal
    const existingModal = document.querySelector('.modal-overlay');
    if (existingModal) {
      const statsContainer = existingModal.querySelector('div:last-child');
      if (statsContainer) {
        statsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error loading player statistics</div>';
      }
    }
  }
}

// Game log functionality
async function showGameLogInterface() {
  console.log('showGameLogInterface called');
  
  // Find the stats container - it's the 3rd element added to modalContent
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
  
  // The statsContainer should be the 3rd child (index 2)
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
  const currentYear = new Date().getFullYear();
  
  // Get today's date using sports-adjusted date logic for consistency
  function getAdjustedDateForSports() {
    const now = new Date();
    const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    
    if (estNow.getHours() < 2) { // Use 2 AM EST cutoff for consistency
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
        <input type="date" id="gameLogDatePicker" value="${todayString}" style="padding: 12px 16px; border: 2px solid ${currentTeam && currentTeam.color ? `#${currentTeam.color}` : '#17408B'}; border-radius: 8px; font-size: 16px; outline: none; cursor: pointer; background: white; color: #333; width: 200px; font-weight: 500;">
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
    
    // Auto-load today's game log if date is set to today
    if (datePicker.value === todayString) {
      setTimeout(() => {
        loadGameLogForDate(todayString);
      }, 100);
    }
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

  // Reload the overall stats
  const seasonYear = await getValidSeasonYear('basketball', 'wnba', selectedPlayer.id);
  const result = await fetchAthleteStats('basketball', 'wnba', seasonYear, selectedPlayer.id);

  console.log('Player stats data:', result.data);

  if (result.data.splits && result.data.splits.categories) {
    displayPlayerStatsInModal(result.data.splits.categories, statsContainer);
  } else {
    statsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;">Player statistics not available</div>';
  }
}

async function loadGameLogForDate(date) {
  const resultsContainer = document.getElementById('gameLogResults');
  if (!resultsContainer || !selectedPlayer) return;

  try {
    resultsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;"><div style="display: inline-block; width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #C8102E; border-radius: 50%; animation: spin 1s linear infinite;"></div><br>Loading game data...</div>';

    // Add the spinner animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    if (!document.getElementById('spinner-style')) {
      style.id = 'spinner-style';
      document.head.appendChild(style);
    }

    // Get season year based on the selected date, not current date
    function getSeasonYearForDate(dateStr) {
      const selectedDate = new Date(dateStr);
      const selectedMonth = selectedDate.getMonth() + 1; // 0-based, so add 1
      const selectedYear = selectedDate.getFullYear();
      
      // WNBA season runs from May to October
      // If the date is from November-April, it belongs to the off-season
      // If the date is from May-October, it belongs to the season of that year
      if (selectedMonth >= 11 || selectedMonth <= 4) {
        // Off-season: if Nov-Dec, use next year; if Jan-Apr, use current year
        return selectedMonth >= 11 ? selectedYear + 1 : selectedYear;
      } else {
        return selectedYear; // May-October, use current year
      }
    }
    
    const seasonYear = getSeasonYearForDate(date);
    console.log(`Selected date: ${date}, calculated season year: ${seasonYear}`);
    
    // Get the player's team for the specific season year
    let teamIdForSeason = currentTeamId; // Default to current team
    try {
      console.log(`Fetching player's team for season ${seasonYear}...`);
      const playerSeasonResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/seasons/${seasonYear}/athletes/${selectedPlayer.id}?lang=en&region=us`);
      
      if (playerSeasonResponse.ok) {
        const playerSeasonData = await playerSeasonResponse.json();
        if (playerSeasonData.team && playerSeasonData.team.$ref) {
          // Extract team ID from the $ref URL
          const teamRefMatch = playerSeasonData.team.$ref.match(/teams\/(\d+)/);
          if (teamRefMatch) {
            teamIdForSeason = teamRefMatch[1];
            console.log(`Player was on team ${teamIdForSeason} during ${seasonYear} season`);
          }
        }
      } else {
        console.log(`Could not fetch player's team for season ${seasonYear}, using current team`);
      }
    } catch (error) {
      console.log(`Error fetching player's season team:`, error);
      console.log(`Using current team ${currentTeamId} as fallback`);
    }

    // Format date for ESPN API (YYYYMMDD)
    const formattedDate = date.replace(/-/g, '');
    
    // Find games for the selected date using ESPN API
    const scheduleResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/${teamIdForSeason}/schedule?season=${seasonYear}`);
    
    if (!scheduleResponse.ok) {
      throw new Error(`HTTP error! status: ${scheduleResponse.status}`);
    }
    
    const scheduleData = await scheduleResponse.json();

    // Find the game for the selected date
    const targetDate = new Date(date + 'T00:00:00'); // Add time to prevent timezone issues
    const games = scheduleData.events || [];
    
    console.log('Target date:', targetDate.toDateString());
    console.log('Available games:', games.map(g => new Date(g.date).toDateString()));
    
    const game = games.find(event => {
      const gameDate = new Date(event.date);
      console.log('Comparing:', gameDate.toDateString(), 'vs', targetDate.toDateString());
      return gameDate.toDateString() === targetDate.toDateString();
    });

    if (!game) {
      resultsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; background: #f8f9fa; border-radius: 8px; border: 1px solid #ddd;">
          <div style="font-size: 1.2rem; color: #777; margin-bottom: 10px;">📅</div>
          <div style="color: #777; font-size: 1rem;">No games found for this date</div>
          <div style="color: #999; font-size: 0.9rem; margin-top: 5px;">Try selecting a different date during the season</div>
        </div>
      `;
      return;
    }

    // Check if game is scheduled but not yet played
    if (['STATUS_SCHEDULED', 'STATUS_POSTPONED', 'STATUS_SUSPENDED'].includes(game.competitions[0].status.type.name)) {
      const gameDate = new Date(game.date);
      const competition = game.competitions[0];
      const opponent = competition.competitors.find(c => c.team.id !== currentTeamId);
      const isHomeGame = competition.competitors.find(c => c.team.id === currentTeamId).homeAway === 'home';
      
      resultsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; background: #fff3cd; border-radius: 8px; border: 1px solid #ffeaa7;">
          <div style="font-size: 1.2rem; color: #856404; margin-bottom: 10px;">⏰</div>
          <div style="color: #856404; font-size: 1rem; margin-bottom: 5px;">Game ${game.competitions[0].status.type.description}</div>
          <div style="color: #856404; font-size: 0.9rem;">
            ${isHomeGame ? 'vs' : 'at'} ${opponent.team.displayName}<br>
            ${gameDate.toLocaleString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true 
            })}
          </div>
        </div>
      `;
      return;
    }

    // For completed games, we need to get box score data
    await displayPlayerGameStats(game, date, teamIdForSeason);

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

async function displayPlayerGameStats(game, date, teamIdForSeason) {
  const resultsContainer = document.getElementById('gameLogResults');
  if (!resultsContainer || !selectedPlayer) return;

  try {
    // Get detailed game data with box score using the same API as scoreboard.js
    const gameResponse = await fetch(`https://cdn.espn.com/core/wnba/boxscore?xhr=1&gameId=${game.id}`);
    const gameData = await gameResponse.json();

    if (!gameData.gamepackageJSON || !gameData.gamepackageJSON.boxscore || !gameData.gamepackageJSON.boxscore.players) {
      resultsContainer.innerHTML = `
        <div style="border: 1px solid #ddd; border-radius: 12px; padding: 40px; background: #f8f9fa; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 15px;">📊</div>
          <div style="color: #777; font-size: 1.1rem; margin-bottom: 15px; font-weight: 500;">
            No box score data for this game
          </div>
          <div style="color: #999; font-size: 0.95rem; line-height: 1.4;">
            Box score data may not be available for this game
          </div>
        </div>
      `;
      return;
    }

    // Find the player in the box score using the same structure as scoreboard.js
    const competition = game.competitions[0];
    const isHomeTeam = competition.competitors.find(c => c.team.id === currentTeamId).homeAway === 'home';
    
    // Get the correct team from boxscore players array
    const teamBoxscore = gameData.gamepackageJSON.boxscore.players.find(team => {
      return team.team.id === currentTeamId;
    });
    
    if (!teamBoxscore || !teamBoxscore.statistics || !teamBoxscore.statistics[0] || !teamBoxscore.statistics[0].athletes) {
      const gameDate = new Date(game.date);
      const opponent = competition.competitors.find(c => c.team.id !== currentTeamId);
      
      resultsContainer.innerHTML = `
        <div style="border: 1px solid #ddd; border-radius: 12px; padding: 40px; background: #f8f9fa; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 15px;">🏀</div>
          <div style="color: #777; font-size: 1.1rem; margin-bottom: 15px; font-weight: 500;">
            No box score data for this game
          </div>
          <div style="color: #999; font-size: 0.95rem; line-height: 1.4;">
            ${selectedPlayer.firstName} ${selectedPlayer.lastName} did not appear in this game<br>
            <strong>${gameDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong><br>
            ${isHomeTeam ? 'vs' : 'at'} ${opponent.team.displayName}
          </div>
        </div>
      `;
      return;
    }

    // Find the specific player in the athletes array
    const playerData = teamBoxscore.statistics[0].athletes.find(athlete => 
      athlete.athlete.id === selectedPlayer.id.toString()
    );

    if (!playerData) {
      const gameDate = new Date(game.date);
      const opponent = competition.competitors.find(c => c.team.id !== currentTeamId);
      
      resultsContainer.innerHTML = `
        <div style="border: 1px solid #ddd; border-radius: 12px; padding: 40px; background: #f8f9fa; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 15px;">🏀</div>
          <div style="color: #777; font-size: 1.1rem; margin-bottom: 15px; font-weight: 500;">
            No box score data for this game
          </div>
          <div style="color: #999; font-size: 0.95rem; line-height: 1.4;">
            ${selectedPlayer.firstName} ${selectedPlayer.lastName} did not appear in this game<br>
            <strong>${gameDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong><br>
            ${isHomeTeam ? 'vs' : 'at'} ${opponent.team.displayName}
          </div>
        </div>
      `;
      return;
    }

    // Get team logos - use proper WNBA logo URLs
    const teamLogo = `https://a.espncdn.com/i/teamlogos/wnba/500/${currentTeam.abbreviation}.png`;
    const opponentTeam = competition.competitors.find(c => c.team.id !== currentTeamId);
    const opponentLogo = `https://a.espncdn.com/i/teamlogos/wnba/500/${opponentTeam.team.abbreviation}.png`;

    console.log('Team logos:', teamLogo, opponentLogo);
    console.log('Opponent data:', opponentTeam.team);

    // Game info
    const gameDate = new Date(game.date);
    const teamCompetitor = competition.competitors.find(c => c.team.id === currentTeamId);
    const opponentCompetitor = competition.competitors.find(c => c.team.id !== currentTeamId);

    const teamScore = isHomeTeam ? gameData.__gamepackage__.homeTeam.score : gameData.__gamepackage__.awayTeam.score;
    const opponentScore = isHomeTeam ? gameData.__gamepackage__.awayTeam.score : gameData.__gamepackage__.homeTeam.score;

    console.log('Team competitor full object:', teamCompetitor);
    console.log('Opponent competitor full object:', opponentCompetitor);
    console.log('Team competitor score property:', teamCompetitor.score);
    console.log('Opponent competitor score property:', opponentCompetitor.score);

    console.log('Final scores:', { teamScore, opponentScore });
    
    let gameResult = '';
    if (game.competitions[0].status.type.completed) {
      gameResult = parseInt(teamScore) > parseInt(opponentScore) ? 'W' : 'L';
    }

    // Extract player stats using the correct structure from playerData
    const stats = playerData.stats;
    
    // Create the game stats display
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
          <div style="width: 60px; height: 60px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: #333;">
            <img src="${selectedPlayer.headshot}" alt="${selectedPlayer.firstName} ${selectedPlayer.lastName}" 
              style="width: 60px; height: 60px; object-fit: cover; display: block;" 
              onerror="this.src='icon.png';" 
              crossorigin="anonymous">
          </div>
          <div>
            <div style="font-size: 1.3rem; font-weight: bold; margin-bottom: 2px;">${selectedPlayer.firstName} ${selectedPlayer.lastName}</div>
            <div style="color: #ccc; font-size: 0.9rem;">#${selectedPlayer.jersey} | ${selectedPlayer.position}</div>
          </div>
        </div>

        <!-- Game Header -->
        <div id="gameHeader_${game.id}" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 25px; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 8px; cursor: pointer; transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.15)'" onmouseout="this.style.backgroundColor='rgba(255,255,255,0.1)'" onclick="window.open('scoreboard.html?gameId=${game.id}&date=${date.replace(/-/g, '')}', '_blank')">
          <div style="display: flex; align-items: center; gap: 15px;">
            <img src="${teamLogo}" alt="${currentTeam.displayName}" style="height: 30px;" onerror="this.src='icon.png';">
            <span style="font-size: 1.1rem; font-weight: bold; color: ${parseInt(teamScore) > parseInt(opponentScore)  ? '#fff' : '#ccc'};">${teamScore}</span>
            <span style="color: #ccc;">-</span>
            <span style="font-size: 1.1rem; font-weight: bold; color: ${parseInt(opponentScore) > parseInt(teamScore) ? '#fff' : '#ccc'};">${opponentScore}</span>
            <img src="${opponentLogo}" alt="${opponentTeam.team.displayName}" style="height: 30px;" onerror="this.src='icon.png';">
            ${gameResult ? `<span style="font-weight: bold; color: ${gameResult === 'W' ? '#4CAF50' : '#f44336'}; font-size: 1.1rem;">${gameResult}</span>` : ''}
          </div>
          <div style="text-align: right; color: #ccc; font-size: 0.85rem;">
            ${gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            <div class="game-details-text" style="font-size: 0.7rem; margin-top: 2px; opacity: 0.7;">Click to view game details</div>
          </div>
        </div>

        <!-- Basketball Stats -->
        <div style="margin-bottom: 20px;">
          <div style="font-size: 1.1rem; font-weight: bold; margin-bottom: 15px; color: #FFA500;">🏀 Game Stats</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 15px;">
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${stats[13] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">PTS</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${stats[6] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">REB</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${stats[7] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">AST</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${stats[1] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">FGM</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${stats[2] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">3PM</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${stats[0] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">MIN</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${stats[11] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">PF</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${stats[12] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">+/-</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${stats[10] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">TO</div>
            </div>
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

function addPlayerToComparison(player) {
  // Check if player is already in comparison
  const existingIndex = playersForComparison.findIndex(p => p.id === player.id);
  
  if (existingIndex !== -1) {
    // Player already selected, show message
    alert(`${player.firstName} is already selected for comparison.`);
    return;
  }
  
  // Add player to comparison
  playersForComparison.push(player);
  
  // Limit to 2 players for comparison
  if (playersForComparison.length > 2) {
    playersForComparison.shift(); // Remove first player if more than 2
  }
  
  // Show confirmation message
  if (playersForComparison.length === 1) {
    alert(`${player.firstName} added to comparison. Select another player to compare.`);
  } else if (playersForComparison.length === 2) {
    const player1 = playersForComparison[0];
    const player2 = playersForComparison[1];
    
    if (confirm(`Compare ${player1.firstName} vs ${player2.firstName}?`)) {
      showPlayerComparison(playersForComparison[0], playersForComparison[1]);
    }
  }
}

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
    });

    // Create comparison header
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

    // Player 1 header
    const player1Header = document.createElement('div');
    player1Header.id = 'player1-header';
    player1Header.style.cssText = `
      display: flex;
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
      <img src="${convertToHttps(player1.headshot)}" alt="${player1.firstName} ${player1.lastName}" 
           style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;" 
           onerror="this.src='icon.png';">
      <div>
        <div class="player-name-display" style="font-size: 1.2rem; font-weight: bold; color: #333;">
          ${player1.firstName} ${player1.lastName}
        </div>
        <div style="font-size: 1rem; color: #777;">
          #${player1.jersey} | ${player1.position}
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

    // Player 2 header
    const player2Header = document.createElement('div');
    player2Header.id = 'player2-header';
    player2Header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 15px;
      padding: 15px;
      background-color: #f8f9fa;
      border-radius: 8px;
      flex-direction: row-reverse;
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
      <img src="${convertToHttps(player2.headshot)}" alt="${player2.firstName} ${player2.lastName}" 
           style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;" 
           onerror="this.src='icon.png';">
      <div style="text-align: right;">
        <div class="player-name-display" style="font-size: 1.2rem; font-weight: bold; color: #333;">
          ${player2.firstName} ${player2.lastName}
        </div>
        <div style="font-size: 1rem; color: #777;">
          #${player2.jersey} | ${player2.position}
        </div>
      </div>
    `;

    playersHeader.appendChild(player1Header);
    playersHeader.appendChild(vsDivider);
    playersHeader.appendChild(player2Header);

    // Create stats comparison container
    const statsComparisonContainer = document.createElement('div');
    statsComparisonContainer.id = 'comparison-stats-container';
    statsComparisonContainer.innerHTML = '<div style="text-align: center; padding: 20px;">Loading comparison statistics...</div>';

    // Assemble modal
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

    // Add responsive name display
    const updateNameDisplay = () => {
      const nameElements = modalContent.querySelectorAll('.player-name-display');
      nameElements.forEach((element, index) => {
        const player = index === 0 ? player1 : player2;
        if (window.innerWidth <= 525) {
          element.textContent = player.firstName;
        } else {
          element.textContent = `${player.firstName} ${player.lastName}`;
        }
      });
    };

    // Initial call and window resize listener
    updateNameDisplay();
    window.addEventListener('resize', updateNameDisplay);

    // Get valid season years and fetch both players' stats
    const [seasonYear1, seasonYear2] = await Promise.all([
      getValidSeasonYear('basketball', 'wnba', player1.id),
      getValidSeasonYear('basketball', 'wnba', player2.id)
    ]);

    const [player1Result, player2Result] = await Promise.all([
      fetchAthleteStats('basketball', 'wnba', seasonYear1, player1.id),
      fetchAthleteStats('basketball', 'wnba', seasonYear2, player2.id)
    ]);

    displayPlayerComparison(player1Result.data.splits?.categories, player2Result.data.splits?.categories, statsComparisonContainer);

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
        playersForComparison = []; // Clear comparison when closing
      }
    });

  } catch (error) {
    console.error('Error loading player comparison:', error);
    alert('Error loading player comparison. Please try again.');
  }
}

function displayPlayerStats(categories) {
  const statsDiv = document.getElementById('selectedPlayerStats');
  
  // Group stats by category
  const statsByCategory = {};
  
  categories.forEach(category => {
    if (category.stats && category.stats.length > 0) {
      statsByCategory[category.displayName] = category.stats
        .filter(stat => stat.displayValue && stat.displayValue !== "0" && stat.displayValue !== "0.0")
        .slice(0, 8); // Limit to 8 stats per category for better display
    }
  });

  const categoryKeys = Object.keys(statsByCategory);
  if (categoryKeys.length === 0) {
    statsDiv.innerHTML = '<div class="no-data">No statistics available for this player</div>';
    return;
  }

  // Create stats display
  let statsHTML = '<div class="player-stats-container">';
  
  categoryKeys.forEach(categoryName => {
    const stats = statsByCategory[categoryName];
    if (stats.length > 0) {
      statsHTML += `
        <div class="stats-category">
          <h4 class="stats-category-title">${categoryName}</h4>
          <div class="stats-grid">
            ${stats.map(stat => `
              <div class="stat-item">
                <div class="stat-value">${stat.displayValue}</div>
                <div class="stat-label">${stat.shortDisplayName || stat.displayName}</div>
                ${stat.rankDisplayValue ? `<div class="stat-rank">${stat.rankDisplayValue}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  });
  
  statsHTML += '</div>';
  statsDiv.innerHTML = statsHTML;
}

function displayPlayerStatsInModal(categories, container) {
  // Define the specific stats we want to show (same as team statistics)
  const desiredStats = [
    { key: "avgPoints", label: "Avg Points", category: "offensive" },
    { key: "fieldGoalPct", label: "Field Goal %", category: "offensive" },
    { key: "avgRebounds", label: "Rebounds", category: "general" },
    { key: "avgAssists", label: "Assists", category: "offensive" },
    { key: "avgSteals", label: "Steals", category: "defensive" },
    { key: "avgBlocks", label: "Blocks", category: "defensive" },
    { key: "avgTurnovers", label: "Turnovers", category: "offensive" },
    { key: "avgFouls", label: "Fouls", category: "general" },
    { key: "freeThrowPct", label: "Free Throw %", category: "offensive" },
    { key: "threePointPct", label: "3 Point %", category: "offensive" }
  ];

  // Extract the specific stats we want
  const playerStats = [];
  
  desiredStats.forEach(desired => {
    const category = categories.find(c => c.name === desired.category);
    if (category && category.stats) {
      const stat = category.stats.find(s => s.name === desired.key);
      if (stat && stat.displayValue && stat.displayValue !== "0" && stat.displayValue !== "0.0") {
        playerStats.push({
          label: desired.label,
          value: stat.displayValue,
          rank: stat.rankDisplayValue || null
        });
      } else {
        // Include the stat even if not available, show as N/A
        playerStats.push({
          label: desired.label,
          value: "N/A",
          rank: null
        });
      }
    } else {
      // Include the stat even if category not found, show as N/A
      playerStats.push({
        label: desired.label,
        value: "N/A",
        rank: null
      });
    }
  });

  if (playerStats.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;">No statistics available for this player</div>';
    return;
  }

  // Create stats display with same styling as team stats but inline for modal
  const teamColor = currentTeam && currentTeam.color ? `#${currentTeam.color}` : '#C8102E';
  const statsHTML = `
    <div id="playerStatsCard" style="position: relative;">
      <div style="display: flex; justify-content: flex-end; align-items: center; margin-bottom: 20px;">
        <button class="copy-stats-btn" onclick="copyPlayerStatsAsImage()" style="
          background: ${teamColor};
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 6px;
        ">
          📋 Copy ${window.innerWidth < 525 ? '' : 'as Image'}
        </button>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
        ${playerStats.map(stat => `
          <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
            <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">
              ${stat.value}
            </div>
            <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">
              ${stat.label}
            </div>
            ${stat.rank ? `
              <div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">
                ${stat.rank}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  container.innerHTML = statsHTML;
}

function displayPlayerComparison(player1Categories, player2Categories, container) {
  // Define the specific stats we want to show (same as individual player stats)
  const desiredStats = [
    { key: "avgPoints", label: "Avg Points", category: "offensive" },
    { key: "fieldGoalPct", label: "Field Goal %", category: "offensive" },
    { key: "avgRebounds", label: "Rebounds", category: "general" },
    { key: "avgAssists", label: "Assists", category: "offensive" },
    { key: "avgSteals", label: "Steals", category: "defensive" },
    { key: "avgBlocks", label: "Blocks", category: "defensive" },
    { key: "avgTurnovers", label: "Turnovers", category: "offensive" },
    { key: "avgFouls", label: "Fouls", category: "general" },
    { key: "freeThrowPct", label: "Free Throw %", category: "offensive" },
    { key: "threePointPct", label: "3 Point %", category: "offensive" }
  ];

  // Extract stats for both players
  const getPlayerStats = (categories) => {
    const playerStats = [];
    desiredStats.forEach(desired => {
      const category = categories?.find(c => c.name === desired.category);
      if (category && category.stats) {
        const stat = category.stats.find(s => s.name === desired.key);
        if (stat && stat.displayValue && stat.displayValue !== "0" && stat.displayValue !== "0.0") {
          playerStats.push({
            label: desired.label,
            value: stat.displayValue,
            rank: stat.rankDisplayValue || null,
            numericValue: parseFloat(stat.value) || 0
          });
        } else {
          playerStats.push({
            label: desired.label,
            value: "N/A",
            rank: null,
            numericValue: 0
          });
        }
      } else {
        playerStats.push({
          label: desired.label,
          value: "N/A",
          rank: null,
          numericValue: 0
        });
      }
    });
    return playerStats;
  };

  const player1Stats = getPlayerStats(player1Categories);
  const player2Stats = getPlayerStats(player2Categories);

  if (player1Stats.length === 0 && player2Stats.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;">No statistics available for comparison</div>';
    return;
  }

  // Create comparison table
  let comparisonHTML = '<div style="display: flex; flex-direction: column; gap: 15px;">';
  
  desiredStats.forEach((desired, index) => {
    const stat1 = player1Stats[index];
    const stat2 = player2Stats[index];
    
    // Determine which stat is better (higher is better for most stats, lower is better for turnovers and fouls)
    const lowerIsBetter = desired.key === "avgTurnovers" || desired.key === "avgFouls";
    let player1Better = false;
    let player2Better = false;
    
    if (stat1.value !== "N/A" && stat2.value !== "N/A") {
      if (lowerIsBetter) {
        player1Better = stat1.numericValue < stat2.numericValue && stat1.numericValue > 0;
        player2Better = stat2.numericValue < stat1.numericValue && stat2.numericValue > 0;
      } else {
        player1Better = stat1.numericValue > stat2.numericValue;
        player2Better = stat2.numericValue > stat1.numericValue;
      }
    }
    
    comparisonHTML += `
      <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: center; padding: 15px; background-color: #f8f9fa; border-radius: 8px;">
        <!-- Player 1 Stat -->
        <div style="text-align: center; padding: 10px; background-color: ${player1Better ? '#e8f5e8' : 'white'}; border-radius: 6px; ${player1Better ? 'border: 2px solid #28a745;' : 'border: 1px solid #ddd;'}">
          <div style="font-size: 1.3rem; font-weight: bold; color: ${player1Better ? '#28a745' : '#333'}; margin-bottom: 5px;">
            ${stat1.value}
          </div>
          ${stat1.rank ? `
            <div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">
              ${stat1.rank}
            </div>
          ` : ''}
        </div>
        
        <!-- Stat Label -->
        <div style="text-align: center; font-weight: bold; color: #333; min-width: 120px; padding: 0 10px;">
          ${stat1.label}
        </div>
        
        <!-- Player 2 Stat -->
        <div style="text-align: center; padding: 10px; background-color: ${player2Better ? '#e8f5e8' : 'white'}; border-radius: 6px; ${player2Better ? 'border: 2px solid #28a745;' : 'border: 1px solid #ddd;'}">
          <div style="font-size: 1.3rem; font-weight: bold; color: ${player2Better ? '#28a745' : '#333'}; margin-bottom: 5px;">
            ${stat2.value}
          </div>
          ${stat2.rank ? `
            <div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">
              ${stat2.rank}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  });
  
  comparisonHTML += '</div>';
  container.innerHTML = comparisonHTML;
}

// Function to copy player stats as image
window.copyPlayerStatsAsImage = async function() {
  try {
    const modalOverlay = document.querySelector('.modal-overlay');
    let cardElement = null;
    if (modalOverlay) cardElement = modalOverlay.querySelector('#playerStatsCard');
    if (!cardElement) cardElement = document.getElementById('playerStatsCard');
    if (!cardElement) { console.error('Player stats card not found'); showFeedback && showFeedback('Player stats not found','error'); return; }
    if (!window.html2canvas) { const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'; script.onload = () => capturePlayerStatsAsImage(cardElement); document.head.appendChild(script); } else { capturePlayerStatsAsImage(cardElement); }
  } catch (err) { console.error('Error copying player stats as image:', err); showFeedback && showFeedback('Error copying image','error'); }
};

window.capturePlayerStatsAsImage = async function(element) {
  try {
    showFeedback && showFeedback('Capturing player statistics...', 'loading');
    const teamCol = (currentTeam && currentTeam.color) ? `#${currentTeam.color}` : '#C8102E';
    const captureContainer = document.createElement('div');
    captureContainer.style.cssText = `background: ${teamCol}; color: white; padding: 30px; border-radius: 16px; width: 600px; max-width: 600px; min-width: 600px; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; position: fixed; left: -9999px; top: -9999px; z-index: -1; overflow: hidden;`;
    
    // Get player information for header
    const playerName = selectedPlayer ? `${selectedPlayer.firstName} ${selectedPlayer.lastName}` : 'Unknown Player';
    const jerseyNumber = selectedPlayer ? selectedPlayer.jersey : 'N/A';
    const position = selectedPlayer ? selectedPlayer.position : 'N/A';
    const teamName = currentTeam ? currentTeam.displayName : 'Unknown Team';
    const teamAbbr = currentTeam ? currentTeam.abbreviation : 'UNK';
    const headshotUrl = selectedPlayer ? selectedPlayer.headshot : 'icon.png';
    const teamLogo = currentTeam ? `https://a.espncdn.com/i/teamlogos/wnba/500/${currentTeam.abbreviation}.png` : '';
    const currentYear = new Date().getFullYear();
    
    // Create player header section
    const playerHeaderHtml = `
      <div style="display: flex; align-items: center; margin-bottom: 25px; background: rgba(255,255,255,0.1); padding: 20px; border-radius: 12px;">
        <div style="width: 110px; height: 80px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: transparent; position: relative; margin-right: 20px;">
          <img src="${headshotUrl}" alt="${playerName}" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%; height: auto; min-height: 100%; object-fit: cover;" onerror="this.src='icon.png';">
        </div>
        <div style="flex: 1; min-width: 0;">
          <h2 style="margin: 0 0 8px 0; font-size: 26px; font-weight: bold;">${playerName}</h2>
          <div style="font-size: 16px; opacity: 0.9; margin-bottom: 4px;">#${jerseyNumber} | ${position} | ${teamAbbr}</div>
          <div style="font-size: 14px; opacity: 0.8;">${teamName}</div>
        </div>
        <div style="width: 80px; height: 80px; flex-shrink: 0; position: relative; margin-left: 20px;">
          <img src="${teamLogo}" alt="${teamName}" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%; height: auto; min-height: 100%; object-fit: cover;" onerror="this.style.display='none';">
        </div>
      </div>
    `;
    
    // Create stats title section
    const statsTitle = `
      <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
        <img src="${teamLogo}" alt="${teamName}" style="width: 32px; height: 32px; margin-right: 10px;" onerror="this.style.display='none';">
        <h3 style="margin: 0; font-size: 20px; font-weight: bold; color: white;">${currentYear} Season Stats</h3>
      </div>
    `;
    
    const statsContent = element.cloneNode(true);
    const copyBtn = statsContent.querySelector('[onclick*="copyPlayerStatsAsImage"]'); if (copyBtn) copyBtn.remove();
    
    // Style stat cards to be translucent
    const statCards = statsContent.querySelectorAll('[style*="background"]');
    statCards.forEach(card => {
      if (card.style.background && !card.style.background.includes('rgba')) {
        card.style.background = 'rgba(255,255,255,0.1)';
        card.style.border = '1px solid rgba(255,255,255,0.2)';
        card.style.color = 'white';
      }
    });
    
    // Set stat labels to white
    const statLabels = statsContent.querySelectorAll('[style*="color: #777"], [style*="color:#777"]'); 
    statLabels.forEach(l=>l.style.color='white');
    
    // Set stat ranks to white  
    const statRanks = statsContent.querySelectorAll('[style*="color: #28a745"]');
    statRanks.forEach(r=>r.style.color='white');
    
    // Make sure stat values are white
    const statValues = statsContent.querySelectorAll('[style*="font-weight: bold"]');
    statValues.forEach(v => v.style.color = 'white');
    
    captureContainer.innerHTML = playerHeaderHtml + statsTitle + statsContent.outerHTML;
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
    
    const canvas = await html2canvas(captureContainer,{backgroundColor:'#000000',scale:3,useCORS:true,allowTaint:false,logging:false}); document.body.removeChild(captureContainer);
    canvas.toBlob(async (blob)=>{ 
      if(!blob){ 
        showFeedback && showFeedback('Failed to create image','error'); 
        return;
      } 
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                      ('ontouchstart' in window) ||
                      (navigator.maxTouchPoints > 0);
      
      try{ 
        if (isMobile) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${playerName.replace(/\s+/g, '-')}-stats-${currentYear}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          showFeedback && showFeedback('Player stats downloaded!', 'success');
        } else {
          if(navigator.clipboard && window.ClipboardItem){ 
            await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]); 
            showFeedback && showFeedback('Player stats copied to clipboard!','success'); 
          } else { 
            const url=URL.createObjectURL(blob); 
            const a=document.createElement('a'); 
            a.href=url; 
            a.download=`${playerName.replace(/\s+/g, '-')}-stats-${currentYear}.png`; 
            document.body.appendChild(a); 
            a.click(); 
            a.remove(); 
            URL.revokeObjectURL(url); 
            showFeedback && showFeedback('Player stats downloaded!','success'); 
          }
        }
      }catch(err){
        console.error('Error copying image',err); 
        showFeedback && showFeedback('Error handling image','error'); 
      } 
    }, 'image/png', 0.95);
  } catch(err) { console.error('Error capturing player stats:', err); showFeedback && showFeedback('Error capturing image','error'); }
};

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
        // Check if this is a player headshot that needs special processing
        const isPlayerHeadshot = selectedPlayer && img.src === selectedPlayer.headshot;
        const isOtherImage = img.src.includes('espncdn.com') || img.src.includes('https');
        
        if (isPlayerHeadshot || isOtherImage) {
          // For player headshots, temporarily modify styling to preserve aspect ratio
          if (isPlayerHeadshot) {
            // Store original styles
            const originalStyles = {
              width: img.style.width,
              height: img.style.height,
              borderRadius: img.style.borderRadius,
              objectFit: img.style.objectFit,
              marginLeft: img.style.marginLeft
            };
            
            // Apply temporary styles for better aspect ratio in captured image
            img.style.width = 'auto';
            img.style.height = '60px'; // Keep height but let width adjust naturally
            img.style.borderRadius = '8px'; // Less circular, more natural
            img.style.objectFit = 'contain'; // Show full image without cropping
            img.style.maxWidth = '80px'; // Limit max width to prevent oversizing
            img.style.marginLeft = '-10px'; // Adjust the value as needed
            
            // Store original styles on the element for restoration later
            img.dataset.originalStyles = JSON.stringify(originalStyles);
          }
          
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
      height: isSmallScreen ? element.clientHeight : element.clientHeight + 15,
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
    
    // Restore original styles for headshot images
    const imagesAfterCapture = element.querySelectorAll('img');
    for (const img of imagesAfterCapture) {
      if (img.dataset.originalStyles) {
        const originalStyles = JSON.parse(img.dataset.originalStyles);
        img.style.width = originalStyles.width;
        img.style.height = originalStyles.height;
        img.style.borderRadius = originalStyles.borderRadius;
        img.style.objectFit = originalStyles.objectFit;
        img.style.marginLeft = originalStyles.marginLeft;
        // Clean up the dataset
        delete img.dataset.originalStyles;
      }
    }
    
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
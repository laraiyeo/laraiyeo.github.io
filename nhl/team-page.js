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
let teamColor = "#000000"; // Default team color

// Convert HTTP URLs to HTTPS to avoid mixed content issues
function convertToHttps(url) {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

// Get the appropriate season year, falling back to previous year if current year has no data
async function getValidSeasonYear(sport, league, playerId = null, teamId = null) {
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;
  
  // Test current year first
  let testUrl;
  if (playerId) {
    testUrl = `https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}/seasons/${currentYear}/types/2/athletes/${playerId}/statistics?lang=en&region=us`;
  } else if (teamId) {
    testUrl = `https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}/seasons/${currentYear}/types/2/teams/${teamId}/statistics?lang=en&region=us`;
  } else {
    return currentYear; // Default to current year if no specific entity to test
  }
  
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
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/${currentTeamId}`);
    const data = await response.json();
    currentTeam = data.team;
    
    const logoUrl = convertToHttps(currentTeam.logos?.find(logo =>
        logo.rel.includes(
          ["26"].includes(currentTeam.id) ? 'secondary_logo_on_secondary_color' : 'primary_logo_on_primary_color'
        )
    )?.href) || `https://a.espncdn.com/i/teamlogos/nhl/500/${currentTeam.abbreviation}.png`;

    if (currentTeam.color) {
      teamColor = `#${currentTeam.color}`;
    }

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
      const standingsResponse = await fetch('https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard');
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
          <div class="team-division-header">${currentTeam.abbreviation} -  NHL</div>
        </div>
      </div>
    `;
    
    // Update page title
    document.title = `${currentTeam.displayName} - NHL`;
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

// Helper function to convert ESPN game data to NHL game ID
async function convertToNHLGameId(espnGame) {
  try {
    const gameDate = new Date(espnGame.date);
    const nhlDateFormat = gameDate.getFullYear() + "-" +
                         String(gameDate.getMonth() + 1).padStart(2, "0") + "-" +
                         String(gameDate.getDate()).padStart(2, "0");
    
    // Check if the date is likely in off-season (July through September)
    const month = gameDate.getMonth() + 1; // 0-based month
    const isOffSeason = month >= 7 && month <= 9;
    
    if (isOffSeason) {
      console.log(`Date ${nhlDateFormat} is in NHL off-season, skipping NHL API lookup`);
      return null;
    }
    
    // Helper function to convert ESPN team abbreviations to NHL abbreviations
    const convertEspnToNhlAbbrev = (espnAbbrev) => {
      const mapping = {
        'NJ': 'NJD',   // New Jersey Devils
        'TB': 'TBL',   // Tampa Bay Lightning  
        'LA': 'LAK',   // Los Angeles Kings
        'SJ': 'SJS',   // San Jose Sharks
        'VGS': 'VGK',  // Vegas Golden Knights (ESPN might use VGS)
        'VGK': 'VGK',  // Vegas Golden Knights (keep if already correct)
        'WSH': 'WSH',  // Washington Capitals (same)
        'CAR': 'CAR',  // Carolina Hurricanes (same)
        'MTL': 'MTL',  // Montreal Canadiens (same)
        'TOR': 'TOR',  // Toronto Maple Leafs (same)
        'BOS': 'BOS',  // Boston Bruins (same)
        'NYR': 'NYR',  // New York Rangers (same)
        'NYI': 'NYI',  // New York Islanders (same)
        'PHI': 'PHI',  // Philadelphia Flyers (same)
        'PIT': 'PIT',  // Pittsburgh Penguins (same)
        'CBJ': 'CBJ',  // Columbus Blue Jackets (same)
        'DET': 'DET',  // Detroit Red Wings (same)
        'BUF': 'BUF',  // Buffalo Sabres (same)
        'FLA': 'FLA',  // Florida Panthers (same)
        'OTT': 'OTT',  // Ottawa Senators (same)
        'WPG': 'WPG',  // Winnipeg Jets (same)
        'NSH': 'NSH',  // Nashville Predators (same)
        'STL': 'STL',  // St. Louis Blues (same)
        'CHI': 'CHI',  // Chicago Blackhawks (same)
        'COL': 'COL',  // Colorado Avalanche (same)
        'MIN': 'MIN',  // Minnesota Wild (same)
        'DAL': 'DAL',  // Dallas Stars (same)
        'ARI': 'ARI',  // Arizona Coyotes (same)
        'UTA': 'UTA',  // Utah Hockey Club (same)
        'VAN': 'VAN',  // Vancouver Canucks (same)
        'SEA': 'SEA',  // Seattle Kraken (same)
        'CGY': 'CGY',  // Calgary Flames (same)
        'EDM': 'EDM',  // Edmonton Oilers (same)
        'ANA': 'ANA'   // Anaheim Ducks (same)
      };
      return mapping[espnAbbrev] || espnAbbrev;
    };
    
    // Get the team abbreviations from ESPN data
    const competition = espnGame.competitions[0];
    const homeTeam = competition.competitors.find(c => c.homeAway === "home");
    const awayTeam = competition.competitors.find(c => c.homeAway === "away");
    
    const homeAbbrev = convertEspnToNhlAbbrev(homeTeam.team.abbreviation);
    const awayAbbrev = convertEspnToNhlAbbrev(awayTeam.team.abbreviation);
    
    console.log(`Converting ESPN teams: ${homeTeam.team.abbreviation} vs ${awayTeam.team.abbreviation} to NHL: ${homeAbbrev} vs ${awayAbbrev}`);
    
    // Fetch NHL schedule for that date
    const nhlResponse = await fetch(`https://corsproxy.io/?url=https://api-web.nhle.com/v1/schedule/${nhlDateFormat}`);
    
    if (!nhlResponse.ok) {
      console.log(`NHL API request failed for ${nhlDateFormat}, using ESPN data only`);
      return null;
    }
    
    const nhlData = await nhlResponse.json();
    console.log(`NHL schedule data for ${nhlDateFormat}:`, nhlData);
    
    // Find the matching game by team abbreviations
    const matchingGame = nhlData.gameWeek?.[0]?.games?.find(game => {
      console.log(`Checking NHL game: ${game.homeTeam.abbrev} vs ${game.awayTeam.abbrev} against ESPN ${homeAbbrev} vs ${awayAbbrev}`);
      return (game.homeTeam.abbrev === homeAbbrev && game.awayTeam.abbrev === awayAbbrev) ||
             (game.homeTeam.abbrev === awayAbbrev && game.awayTeam.abbrev === homeAbbrev);
    });
    
    if (matchingGame) {
      return {
        nhlGameId: matchingGame.id,
        nhlDateFormat: nhlDateFormat.replace(/-/g, '') // Convert back to YYYYMMDD for URL
      };
    }
    
    // Only show warning for dates that should have NHL games (regular season/playoffs)
    if (!isOffSeason) {
      console.warn(`Could not find NHL game ID for ESPN game ${espnGame.id} on ${nhlDateFormat}`);
    }
    return null;
  } catch (error) {
    console.error('Error converting ESPN game to NHL game ID:', error);
    return null;
  }
}

async function loadCurrentGame() {
  try {
    function getAdjustedDateForNHL() {
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
    
    const today = getAdjustedDateForNHL();
    
    // Fetch NHL games
    const todayResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${today}`);
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
        gameCardElement.addEventListener('click', async () => {
          try {
            const nhlGameData = await convertToNHLGameId(todayGame);
            if (nhlGameData) {
              window.location.href = `scoreboard.html?gameId=${nhlGameData.nhlGameId}&date=${nhlGameData.nhlDateFormat}`;
            } else {
              console.error('Could not convert ESPN game to NHL game ID');
              alert('Unable to load game details. Please try again.');
            }
          } catch (error) {
            console.error('Error loading game:', error);
            alert('Error loading game details. Please try again.');
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

  const teamLogo = `https://a.espncdn.com/i/teamlogos/nhl/500/${currentTeam.abbreviation}.png`;
  const opponentLogo = `https://a.espncdn.com/i/teamlogos/nhl/500/${opponent.team.abbreviation}.png`;

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
    
    // Format dates for NHL API
    const formatDate = (date) => {
      return date.getFullYear() +
        String(date.getMonth() + 1).padStart(2, "0") +
        String(date.getDate()).padStart(2, "0");
    };
    
    const dateRange = `${formatDate(startDate)}-${formatDate(today)}`;
    
    // Fetch NHL games
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${dateRange}`);
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
      contentDiv.querySelectorAll('.match-item').forEach((item, index) => {
        item.addEventListener('click', async () => {
          try {
            const espnGame = paginatedMatches[index]; // Get the corresponding ESPN game data
            const nhlGameData = await convertToNHLGameId(espnGame);
            if (nhlGameData) {
              window.location.href = `scoreboard.html?gameId=${nhlGameData.nhlGameId}&date=${nhlGameData.nhlDateFormat}`;
            } else {
              console.error('Could not convert ESPN game to NHL game ID');
              alert('Unable to load game details. Please try again.');
            }
          } catch (error) {
            console.error('Error loading game:', error);
            alert('Error loading game details. Please try again.');
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

  const teamLogo = `https://a.espncdn.com/i/teamlogos/nhl/500/${currentTeam.abbreviation}.png`;
  const opponentLogo = `https://a.espncdn.com/i/teamlogos/nhl/500/${opponent.team.abbreviation}.png`;

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
        <div class="match-result ${resultClass}">${resultText}</div>
        <div class="match-team-info">
          <div class="match-team-name">${opponent.team.abbreviation}</div>
          <img src="${opponentLogo}" alt="${opponent.team.abbreviation}" class="match-team-logo" onerror="this.src='icon.png';">
        </div>
      </div>
      <div class="match-date">${formattedDate}</div>
    </div>
  `;
}

// Global variable to store all NHL players for league-wide comparison
let allNHLPlayers = [];

async function fetchAllNHLPlayers() {
  if (allNHLPlayers.length > 0) {
    return allNHLPlayers; // Return cached data
  }

  try {
    // Fetch all NHL teams
    const teamsResponse = await fetch('https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl/teams?lang=en&region=us');
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

    allNHLPlayers = allPlayers;
    console.log(`Loaded ${allNHLPlayers.length} NHL players for comparison`);
    return allNHLPlayers;
  } catch (error) {
    console.error('Error fetching all NHL players:', error);
    return [];
  }
}

async function showPlayerSelectionInterface(playerNumber, modal, modalContent, currentPlayer1, currentPlayer2) {
  try {
    console.log(`Clearing player ${playerNumber}`);
    
    // Get all NHL players
    const allPlayers = await fetchAllNHLPlayers();
    
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
    const isGoalieComparison = currentPlayer1.position === "G" || currentPlayer1.position.includes("Goalie") ||
                              currentPlayer2.position === "G" || currentPlayer2.position.includes("Goalie");
    const positionText = isGoalieComparison ? 'goalies' : 'skaters';
    searchInput.placeholder = `Search ${positionText}...`;
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
        // Determine if we're dealing with goalies or skaters based on existing players
        const currentPlayerIsGoalie = currentPlayer1.position === "G" || currentPlayer1.position.includes("Goalie") ||
                                     currentPlayer2.position === "G" || currentPlayer2.position.includes("Goalie");
        
        const filteredPlayers = allPlayers
          .filter(player => {
            const fullName = `${player.firstName || ''} ${player.lastName || ''}`.toLowerCase();
            const teamName = player.team.toLowerCase();
            const playerIsGoalie = player.position === "G" || player.position.includes("Goalie");
            
            // Position filtering - maintain consistency with existing comparison
            const positionMatch = currentPlayerIsGoalie ? playerIsGoalie : !playerIsGoalie;
            
            return (fullName.includes(query) || teamName.includes(query)) && 
                   player.id !== currentPlayer1.id && 
                   player.id !== currentPlayer2.id &&
                   positionMatch;
          })
          .slice(0, 5); // Max 5 results
        
        console.log('Selection interface - Current comparison is goalie:', currentPlayerIsGoalie, 'Found players:', filteredPlayers.length);

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
                <div style="font-size: 12px; color: #666;">${player.team} | #${player.jersey} | ${player.position}</div>
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
          const selectionPositionText = isGoalieComparison ? 'goalies' : 'skaters';
          searchResults.innerHTML = `<div style="padding: 10px; color: #666; text-align: center;">No ${selectionPositionText} found matching "${query}"</div>`;
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
    
    // Fetch NHL games
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${dateRange}`);
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
    contentDiv.querySelectorAll('.match-item').forEach((item, index) => {
      item.addEventListener('click', async () => {
        try {
          const espnGame = upcomingGames[index]; // Get the corresponding ESPN game data
          const nhlGameData = await convertToNHLGameId(espnGame);
          if (nhlGameData) {
            window.location.href = `scoreboard.html?gameId=${nhlGameData.nhlGameId}&date=${nhlGameData.nhlDateFormat}`;
          } else {
            console.error('Could not convert ESPN game to NHL game ID');
            alert('Unable to load game details. Please try again.');
          }
        } catch (error) {
          console.error('Error loading game:', error);
          alert('Error loading game details. Please try again.');
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
    // NHL doesn't have a direct team stats API like MLB, so we'll show basic info
    const contentDiv = document.getElementById('teamStatsContent');
    
    // Get valid season year and try to get team info from the main team API
    const seasonYear = await getValidSeasonYear('hockey', 'nhl', null, currentTeamId);
    const response = await fetch(`https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl/seasons/${seasonYear}/types/2/teams/${currentTeamId}/statistics?lang=en&region=us`);
    const data = await response.json();
    
    if (data.team) {
      const stats = [
        { label: "Goals Per Game", value: data?.splits?.categories?.find(c => c.name === "offensive")?.stats?.find(s => s.name === "avgGoals")?.displayValue || "N/A" },
        { label: "Assists Per Game", value: data?.splits?.categories?.find(c => c.name === "offensive")?.stats?.find(s => s.name === "assists")?.perGameValue || "N/A" },
        { label: "Goals Against Average", value: data?.splits?.categories?.find(c => c.name === "defensive")?.stats?.find(s => s.name === "avgGoalsAgainst")?.displayValue || "N/A" },
        { label: "Shots Against Average", value: data?.splits?.categories?.find(c => c.name === "defensive")?.stats?.find(s => s.name === "avgShotsAgainst")?.displayValue || "N/A" },
        { label: "Shooting %", value: data?.splits?.categories?.find(c => c.name === "offensive")?.stats?.find(s => s.name === "shootingPct")?.displayValue || "N/A" },
        { label: "Saves %", value: (data?.splits?.categories?.find(c => c.name === "defensive")?.stats?.find(s => s.name === "savePct")?.displayValue * 100) || "N/A" },
        { label: "Shots Per Game", value: data?.splits?.categories?.find(c => c.name === "offensive")?.stats?.find(s => s.name === "avgShots")?.displayValue || "N/A" },
        { label: "Points Per Game", value: data?.splits?.categories?.find(c => c.name === "offensive")?.stats?.find(s => s.name === "pointsPerGame")?.displayValue || "N/A" },
        { label: "Total Penalties", value: data?.splits?.categories?.find(c => c.name === "penalties")?.stats?.find(s => s.name === "penalties")?.displayValue || "N/A" },
        { label: "Total Shutouts", value: data?.splits?.categories?.find(c => c.name === "defensive")?.stats?.find(s => s.name === "shutouts")?.displayValue || "N/A" }
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
    const STANDINGS_URL = "https://corsproxy.io/?url=https://api-web.nhle.com/v1/standings/now";
    const contentDiv = document.getElementById('currentStandingContent');
    
    const res = await fetch(STANDINGS_URL);
    const text = await res.text();
    const data = JSON.parse(text);
    
    // Get all standings entries (same pattern as standings.js)
    const standings = data.standings;
    
    if (!standings || standings.length === 0) {
      contentDiv.innerHTML = '<div class="no-data">Standings data not available</div>';
      return;
    }
    
    // Find current team in standings by matching team ID
    const teamStanding = standings.find(team => team.teamAbbrev.default === currentTeam.abbreviation);
    
    if (!teamStanding) {
      contentDiv.innerHTML = '<div class="no-data">Team not found in standings</div>';
      return;
    }
    
    // Extract team data (following standings.js structure)
    const wins = teamStanding.wins || 0;
    const losses = teamStanding.losses || 0;
    const otLosses = teamStanding.otLosses || 0;
    const points = teamStanding.points || 0;
    const winPercentage = teamStanding.pointPctg ? (teamStanding.pointPctg * 100).toFixed(1) + "%" : "0.0%";
    const conferenceName = teamStanding.conferenceName || "Conference";
    
    // Calculate conference and division positions
    const conferenceSequence = teamStanding.conferenceSequence || "-";
    const divisionSequence = teamStanding.divisionSequence || "-";
    
    // Add ordinal suffix helper function (same as standings.js pattern)
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
        <div class="standing-position">${getOrdinalSuffix(conferenceSequence)}</div>
        <div class="standing-details">
          <strong>${conferenceName} Conference</strong><br><br>
          Record: ${wins}-${losses}-${otLosses}<br><br>
          Points: ${points}<br><br>
          Win %: ${winPercentage}<br>
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
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/${currentTeamId}/roster`);
    const data = await response.json();
    
    const contentDiv = document.getElementById('playersInfoContent');
    
    console.log('Roster data structure:', data);
    
    // Extract players from the nested structure
    allRosterPlayers = [];
    
    if (data.athletes && Array.isArray(data.athletes)) {
      data.athletes.forEach(positionGroup => {
        if (positionGroup.items && Array.isArray(positionGroup.items)) {
          console.log(`Found ${positionGroup.items.length} players in position group:`, positionGroup.position || 'Unknown');
          positionGroup.items.forEach(player => {
            // Add position info from the group if not already on player
            if (!player.position && positionGroup.position) {
              player.position = { abbreviation: positionGroup.position };
            }
            allRosterPlayers.push(player);
          });
        }
      });
    }
    
    if (allRosterPlayers.length > 0) {
      console.log(`Total players loaded: ${allRosterPlayers.length}`);
      
      // Sort players by jersey number
      allRosterPlayers.sort((a, b) => {
        const numA = parseInt(a.jersey) || 999;
        const numB = parseInt(b.jersey) || 999;
        return numA - numB;
      });
      
      currentRosterPage = 1;
      displayRosterPlayers();
    } else {
      console.log('No athletes found in response structure');
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
        <div style="font-size: 1.1rem; color: #666;">
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
      color: #666;
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
      gameLogOption.style.color = '#666';
      currentStatsMode = 'overall';
      showOverallStats();
    });

    gameLogOption.addEventListener('click', () => {
      console.log('Game log option clicked');
      sliderBackground.style.transform = 'translateX(96px)';
      overallOption.style.color = '#666';
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
    const labelPositionText = selectedPlayer.position === "G" || selectedPlayer.position.includes("Goalie") ? 'goalies' : 'skaters';
    searchLabel.innerHTML = `Compare with another ${labelPositionText.slice(0, -1)}:`;
    searchLabel.style.cssText = `
      font-weight: bold;
      color: #333;
      margin-bottom: 10px;
      font-size: 14px;
    `;

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    const inputPositionText = selectedPlayer.position === "G" || selectedPlayer.position.includes("Goalie") ? 'goalies' : 'skaters';
    searchInput.placeholder = `Search ${inputPositionText}...`;
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
        // Get all NHL players for league-wide search
        const allPlayers = await fetchAllNHLPlayers();
        const selectedPlayerIsGoalie = selectedPlayer.position === "G" || selectedPlayer.position.includes("Goalie");
        
        const filteredPlayers = allPlayers
          .filter(player => {
            const fullName = `${player.firstName || ''} ${player.lastName || ''}`.toLowerCase();
            const teamName = player.team.toLowerCase();
            const playerIsGoalie = player.position === "G" || player.position.includes("Goalie");
            
            // Position filtering - goalies can only compare with goalies, skaters with skaters
            const positionMatch = selectedPlayerIsGoalie ? playerIsGoalie : !playerIsGoalie;
            
            return (fullName.includes(query) || teamName.includes(query)) && 
                   player.id !== selectedPlayer.id && 
                   positionMatch;
          })
          .slice(0, 3); // Max 3 results
        
        console.log('Player search - Selected player is goalie:', selectedPlayerIsGoalie, 'Found players:', filteredPlayers.length);

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
                <div style="font-size: 12px; color: #666;">${player.team} | #${player.jersey} | ${player.position}</div>
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
          const playerTypeText = selectedPlayerIsGoalie ? 'goalies' : 'skaters';
          searchResults.innerHTML = `<div style="padding: 10px; color: #666; text-align: center;">No ${playerTypeText} found matching "${query}"</div>`;
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
    const seasonYear = await getValidSeasonYear('hockey', 'nhl', playerId);
    const response = await fetch(`https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl/seasons/${seasonYear}/types/2/athletes/${playerId}/statistics?lang=en&region=us`);
    const data = await response.json();

    console.log('Player stats data:', data);

    if (data.splits && data.splits.categories) {
      displayPlayerStatsInModal(data.splits.categories, statsContainer, selectedPlayer.position);
    } else {
      statsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Player statistics not available</div>';
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
    
    if (estNow.getHours() < 6) { // Use 6 AM for hockey (games often end late)
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
  const seasonYear = await getValidSeasonYear('hockey', 'nhl', selectedPlayer.id);
  const response = await fetch(`https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl/seasons/${seasonYear}/types/2/athletes/${selectedPlayer.id}/statistics?lang=en&region=us`);
  const data = await response.json();

  console.log('Player stats data:', data);

  if (data.splits && data.splits.categories) {
    displayPlayerStatsInModal(data.splits.categories, statsContainer);
  } else {
    statsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Player statistics not available</div>';
  }
}

async function loadGameLogForDate(date) {
  const resultsContainer = document.getElementById('gameLogResults');
  if (!resultsContainer || !selectedPlayer) return;

  try {
    resultsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;"><div style="display: inline-block; width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #C8102E; border-radius: 50%; animation: spin 1s linear infinite;"></div><br>Loading game data...</div>';

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
      
      // NHL season runs from October to June
      // If the date is from July-September, it belongs to the off-season of that year
      // If the date is from October-December, it belongs to the season ending in the following year
      // If the date is from January-June, it belongs to the season ending in that year
      if (selectedMonth >= 7 && selectedMonth <= 9) {
        return selectedYear; // Off-season, use current year as season identifier
      } else if (selectedMonth >= 10) {
        return selectedYear + 1; // New season starting, use next year
      } else {
        return selectedYear; // Regular season/playoffs, use current year
      }
    }
    
    const seasonYear = getSeasonYearForDate(date);
    console.log(`Selected date: ${date}, calculated season year: ${seasonYear}`);
    
    // Get the player's team for the specific season year
    let teamIdForSeason = currentTeamId; // Default to current team
    try {
      console.log(`Fetching player's team for season ${seasonYear}...`);
      const playerSeasonResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl/seasons/${seasonYear}/athletes/${selectedPlayer.id}?lang=en&region=us`);
      
      if (playerSeasonResponse.ok) {
        const playerSeasonData = await playerSeasonResponse.json();
        if (playerSeasonData.teams && playerSeasonData.teams[0] && playerSeasonData.teams[0].$ref) {
          // Extract team ID from the $ref URL
          const teamRefMatch = playerSeasonData.teams[0].$ref.match(/teams\/(\d+)/);
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

    // Use the same approach as loadRecentMatches - fetch games using ESPN scoreboard API for the specific date
    const gameDate = new Date(date + 'T00:00:00'); // Add time to prevent timezone issues
    const formatDate = (date) => {
      return date.getFullYear() +
        String(date.getMonth() + 1).padStart(2, "0") +
        String(date.getDate()).padStart(2, "0");
    };
    
    const formattedDate = formatDate(gameDate);
    console.log(`Loading NHL games for ${formattedDate}`);

    // Use ESPN scoreboard API for the specific date (same as loadRecentMatches)
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${formattedDate}`);
    const data = await response.json();

    // Find games for this team on this date using the season-specific team ID
    const games = data.events?.filter(event => {
      const competition = event.competitions?.[0];
      return competition?.competitors.some(competitor => competitor.team.id === teamIdForSeason);
    }) || [];

    console.log(`Found ${games.length} games for team ${teamIdForSeason} on ${formattedDate}`);

    if (games.length === 0) {
      resultsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; background: #f8f9fa; border-radius: 8px; border: 1px solid #ddd;">
          <div style="font-size: 1.2rem; color: #666; margin-bottom: 10px;">📅</div>
          <div style="color: #666; font-size: 1rem;">No games found for this date</div>
          <div style="color: #999; font-size: 0.9rem; margin-top: 5px;">Try selecting a different date during the season</div>
        </div>
      `;
      return;
    }

    // Get the first game (usually only one game per day per team)
    const game = games[0];

    // Check if game is scheduled but not yet played
    if (['STATUS_SCHEDULED', 'STATUS_POSTPONED', 'STATUS_SUSPENDED'].includes(game.competitions[0].status.type.name)) {
      const competition = game.competitions[0];
      const opponent = competition.competitors.find(c => c.team.id.toString() !== teamIdForSeason.toString());
      const isHomeGame = competition.competitors.find(c => c.team.id.toString() === teamIdForSeason.toString()).homeAway === 'home';
      
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
    // Try to convert ESPN game to NHL game ID, but don't fail if we can't
    let nhlGameData = null;
    let boxscoreData = null;
    let playByPlayData = null;
    
    try {
      nhlGameData = await convertToNHLGameId(game);
      if (nhlGameData) {
        console.log(`Attempting to fetch NHL API data for game ${nhlGameData.nhlGameId}`);
        // Use NHL API with CORS proxy - only fetch boxscore since it has all player stats
        const BASE_URL = "https://corsproxy.io/?url=https://api-web.nhle.com/v1";
        
        // Try to fetch boxscore endpoint with timeout
        const fetchWithTimeout = (url, timeout = 10000) => {
          return Promise.race([
            fetch(url),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
          ]);
        };

        try {
          const boxscoreRes = await fetchWithTimeout(`${BASE_URL}/gamecenter/${nhlGameData.nhlGameId}/boxscore`);

          if (boxscoreRes.ok) {
            boxscoreData = await boxscoreRes.json();
            console.log('Successfully fetched NHL boxscore data');
            console.log('Boxscore data structure:', boxscoreData);
          } else {
            console.warn(`NHL boxscore API request failed: ${boxscoreRes.status}`);
          }
        } catch (fetchError) {
          console.warn('NHL API fetch failed:', fetchError.message);
        }
      } else {
        console.log('Could not convert ESPN game to NHL game ID');
      }
    } catch (error) {
      console.warn('Error in NHL API data fetching process:', error);
    }

    // Get basic game info from ESPN data (always available)
    const competition = game.competitions[0];
    const isHomeTeam = competition.competitors.find(c => c.team.id.toString() === teamIdForSeason.toString()).homeAway === 'home';
    const opponentTeam = competition.competitors.find(c => c.team.id.toString() !== teamIdForSeason.toString());
    const teamCompetitor = competition.competitors.find(c => c.team.id.toString() === teamIdForSeason.toString());
    const opponentCompetitor = competition.competitors.find(c => c.team.id.toString() !== teamIdForSeason.toString());
    
    // Check if we found the team competitors
    if (!teamCompetitor || !opponentCompetitor) {
      console.error('Could not find team competitors:', { teamIdForSeason, competitors: competition.competitors });
      resultsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; background: #f8d7da; border-radius: 8px; border: 1px solid #f5c6cb;">
          <div style="font-size: 1.2rem; color: #721c24; margin-bottom: 10px;">⚠️</div>
          <div style="color: #721c24; font-size: 1.1rem; margin-bottom: 15px; font-weight: 500;">
            Team data not found for this game
          </div>
          <div style="color: #721c24; font-size: 0.9rem; line-height: 1.4;">
            Unable to load game information
          </div>
        </div>
      `;
      return;
    }
    
    // Access the score value properly
    const teamScore = teamCompetitor.score?.value || teamCompetitor.score || "0";
    const opponentScore = opponentCompetitor.score?.value || opponentCompetitor.score || "0";

    // Get team logos - use the season-specific team abbreviation
    const playerTeamForSeason = competition.competitors.find(c => c.team.id.toString() === teamIdForSeason.toString());
    const teamLogo = `https://a.espncdn.com/i/teamlogos/nhl/500/${playerTeamForSeason.team.abbreviation}.png`;
    const opponentLogo = `https://a.espncdn.com/i/teamlogos/nhl/500/${opponentTeam.team.abbreviation}.png`;

    const gameDate = new Date(game.date);
    let gameResult = '';
    if (game.competitions[0].status.type.completed) {
      gameResult = parseInt(teamScore) > parseInt(opponentScore) ? 'W' : 'L';
    }

    // Try to find player stats from NHL boxscore API if available
    let playerStats = null;
    let isGoalie = false;
    let playerParticipated = true; // Assume player participated since they were on the team roster
    
    if (boxscoreData && boxscoreData.playerByGameStats) {
      console.log('Processing NHL boxscore data for player stats');
      
      // Determine which team's stats to look in
      const teamStats = isHomeTeam ? boxscoreData.playerByGameStats.homeTeam : boxscoreData.playerByGameStats.awayTeam;
      console.log('Team stats structure:', teamStats);
      
      // Find player stats by matching name in the appropriate team stats
      const allSkaters = [...(teamStats.forwards || []), ...(teamStats.defense || [])];
      
      // Try to match by name - the boxscore has player names in "default" format
      playerStats = allSkaters.find(player => {
        const playerName = player.name?.default || '';
        const searchName = `${selectedPlayer.firstName} ${selectedPlayer.lastName}`;
        const lastNameMatch = playerName.includes(selectedPlayer.lastName);
        console.log(`Checking skater: ${playerName} vs ${searchName}, last name match: ${lastNameMatch}`);
        return lastNameMatch;
      });
      
      // If not found in skaters, check goalies
      if (!playerStats && teamStats.goalies) {
        playerStats = teamStats.goalies.find(player => {
          const playerName = player.name?.default || '';
          const searchName = `${selectedPlayer.firstName} ${selectedPlayer.lastName}`;
          const lastNameMatch = playerName.includes(selectedPlayer.lastName);
          console.log(`Checking goalie: ${playerName} vs ${searchName}, last name match: ${lastNameMatch}`);
          return lastNameMatch;
        });
        isGoalie = !!playerStats;
      }
      
      if (playerStats) {
        console.log('Found NHL player stats:', playerStats);
      } else {
        console.log('Player not found in NHL boxscore data');
        console.log('Available forwards:', allSkaters.map(p => p.name?.default));
        console.log('Available goalies:', (teamStats.goalies || []).map(p => p.name?.default));
      }
    } else {
      console.log('NHL boxscore data not available, will show basic game participation');
    }

    // Create stats display
    let statsDisplay = '';
    
    if (playerStats) {
      // We have detailed NHL API stats
      if (isGoalie) {
        // Goalie stats
        statsDisplay = `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 15px;">
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${playerStats.shotsAgainst || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">SA</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${playerStats.goalsAgainst || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">GA</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${playerStats.saves || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">SV</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${playerStats.shotsAgainst ? (playerStats.saves / playerStats.shotsAgainst * 100).toFixed(1) : '0.0'}%</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">SV%</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${playerStats.toi || '0:00'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">TOI</div>
            </div>
          </div>
        `;
      } else {
        // Skater stats
        statsDisplay = `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 15px;">
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${playerStats.goals || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">G</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${playerStats.assists || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">A</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${playerStats.points || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">P</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${playerStats.plusMinus !== undefined ? (playerStats.plusMinus > 0 ? '+' + playerStats.plusMinus : playerStats.plusMinus) : '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">+/-</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${playerStats.pim || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">PIM</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${playerStats.sog || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">SOG</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${playerStats.toi || '0:00'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">TOI</div>
            </div>
            
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${playerStats.hits || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">HITS</div>
            </div>
            
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${playerStats.blockedShots || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">BLKS</div>
            </div>
          </div>
        `;
      }
    } else {
      // No detailed stats available, show enhanced game participation info
      const gameType = game.season?.type === 3 ? 'Playoff Game' : 'Regular Season Game';
      const playerPosition = selectedPlayer.position === 'G' ? 'Goaltender' : 'Skater';
      
      // Try to get some basic info from ESPN game data
      let gameInfo = '';
      if (game.competitions[0].notes && game.competitions[0].notes.length > 0) {
        gameInfo = game.competitions[0].notes[0].headline || '';
      }
      
      statsDisplay = `
        <div style="text-align: center; padding: 30px; background: rgba(255,255,255,0.1); border-radius: 8px;">
          <div style="font-size: 1.1rem; color: #ccc; margin-bottom: 15px;">🏒</div>
          <div style="color: #fff; font-size: 1.1rem; margin-bottom: 8px; font-weight: 500;">
            ${selectedPlayer.firstName} ${selectedPlayer.lastName} appeared in this ${gameType}
          </div>
          <div style="color: #ccc; font-size: 0.9rem; margin-bottom: 10px;">
            ${playerPosition} • #${selectedPlayer.jersey}
          </div>
          <div style="color: #999; font-size: 0.85rem; line-height: 1.4;">
            Detailed statistics unavailable<br>
            <span style="font-size: 0.8rem; opacity: 0.7;">
              This may be due to API limitations or older game data
            </span>
          </div>
          ${gameInfo ? `<div style="color: #FFA500; font-size: 0.8rem; margin-top: 10px; padding: 8px; background: rgba(255,165,0,0.1); border-radius: 4px;">${gameInfo}</div>` : ''}
        </div>
      `;
    }

    // Determine the game link - use NHL game ID if available, otherwise indicate limitation
    const hasGameDetails = nhlGameData && boxscoreData;
    const gameLinkClick = hasGameDetails 
      ? `onclick="window.open('scoreboard.html?gameId=${nhlGameData.nhlGameId}&date=${date.replace(/-/g, '')}', '_blank')"`
      : `onclick="alert('Game details not available for this game. This may be due to API limitations or the game being from an older season.')" style="cursor: not-allowed; opacity: 0.7;"`;
    
    const gameDetailsText = hasGameDetails 
      ? 'Click to view game details' 
      : 'Game details unavailable';
    
    // Create the game stats display
    let content = `
      <div id="gameLogCard_${game.id}" style="background: #1a1a1a; color: white; border-radius: 12px; padding: 25px; margin-bottom: 20px; position: relative;">
        <!-- Clipboard Icon -->
        <div style="position: absolute; top: 12px; right: 12px; cursor: pointer; background: rgba(255,255,255,0.1); border-radius: 6px; padding: 6px; transition: background-color 0.2s ease;" onclick="copyGameLogAsImage('gameLogCard_${game.id}')" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.2)'" onmouseout="this.style.backgroundColor='rgba(255,255,255,0.1)'" title="Copy game log as image">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
            <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/>
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
        <div id="gameHeader_${game.id}" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 25px; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 8px; cursor: pointer; transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.15)'" onmouseout="this.style.backgroundColor='rgba(255,255,255,0.1)'" ${gameLinkClick}>
          <div style="display: flex; align-items: center; gap: 15px;">
            <img src="${teamLogo}" alt="${playerTeamForSeason.team.displayName}" style="height: 30px;" onerror="this.src='icon.png';">
            <span style="font-size: 1.1rem; font-weight: bold; color: ${parseInt(teamScore) > parseInt(opponentScore)  ? '#fff' : '#ccc'};">${teamScore}</span>
            <span style="color: #ccc;">-</span>
            <span style="font-size: 1.1rem; font-weight: bold; color: ${parseInt(opponentScore) > parseInt(teamScore) ? '#fff' : '#ccc'};">${opponentScore}</span>
            <img src="${opponentLogo}" alt="${opponentTeam.team.displayName}" style="height: 30px;" onerror="this.src='icon.png';">
            ${gameResult ? `<span style="font-weight: bold; color: ${gameResult === 'W' ? '#4CAF50' : '#f44336'}; font-size: 1.1rem;">${gameResult}</span>` : ''}
          </div>
          <div style="text-align: right; color: #ccc; font-size: 0.85rem;">
            ${gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            <div class="game-details-text" style="font-size: 0.7rem; margin-top: 2px; opacity: 0.7;">${gameDetailsText}</div>
          </div>
        </div>

        <!-- Hockey Stats -->
        <div style="margin-bottom: 20px;">
          <div style="font-size: 1.1rem; font-weight: bold; margin-bottom: 15px; color: #FFA500;">🏒 Game Stats</div>
          ${statsDisplay}
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
        <div style="font-size: 1rem; color: #666;">
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
        <div style="font-size: 1rem; color: #666;">
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
      getValidSeasonYear('hockey', 'nhl', player1.id),
      getValidSeasonYear('hockey', 'nhl', player2.id)
    ]);

    const [player1Response, player2Response] = await Promise.all([
      fetch(`https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl/seasons/${seasonYear1}/types/2/athletes/${player1.id}/statistics?lang=en&region=us`),
      fetch(`https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl/seasons/${seasonYear2}/types/2/athletes/${player2.id}/statistics?lang=en&region=us`)
    ]);

    const [player1Data, player2Data] = await Promise.all([
      player1Response.json(),
      player2Response.json()
    ]);

    displayPlayerComparison(player1Data.splits?.categories, player2Data.splits?.categories, statsComparisonContainer, playersForComparison[0].position, playersForComparison[1].position);

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

function displayPlayerStatsInModal(categories, container, playerPosition = null) {
  // Check if player is a goalie
  const isGoalie = playerPosition === "G" || (selectedPlayer && (selectedPlayer.position === "G" || selectedPlayer.position.includes("Goalie")));
  
  // Define position-specific stats
  const goalieStats = [
    { key: "goalsAgainst", label: "Goals Against", category: "defensive" },
    { key: "shotsAgainst", label: "Shots Against", category: "defensive" },
    { key: "shutouts", label: "Shutouts", category: "defensive" },
    { key: "saves", label: "Total Saves", category: "defensive" },
    { key: "savePct", label: "Saves Pct", category: "defensive" },
    { key: "production", label: "Production", category: "general" },
    { key: "games", label: "Games Played", category: "general" }
  ];
  
  const skaterStats = [
    { key: "goals", label: "Goals", category: "offensive" },
    { key: "assists", label: "Assists", category: "offensive" },
    { key: "points", label: "Points", category: "offensive" },
    { key: "hits", label: "Hits", category: "defensive" },
    { key: "shootingPct", label: "Shooting %", category: "offensive" },
    { key: "penaltyMinutes", label: "Penalty Minutes", category: "penalties" },
    { key: "plusMinus", label: "+/-", category: "general" },
    { key: "games", label: "Games Played", category: "general" }
  ];

  const desiredStats = isGoalie ? goalieStats : skaterStats;

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
        // Include the stat even if not available, show as 0
        playerStats.push({
          label: desired.label,
          value: "0",
          rank: null
        });
      }
    } else {
      // Include the stat even if category not found, show as 0
      playerStats.push({
        label: desired.label,
        value: "0",
        rank: null
      });
    }
  });

  if (playerStats.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">No statistics available for this player</div>';
    return;
  }

  // Create stats display with same styling as team stats but inline for modal
  const statsHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
      ${playerStats.map(stat => `
        <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">
            ${stat.value}
          </div>
          <div style="font-size: 0.9rem; color: #666; margin-bottom: 5px;">
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
  `;
  
  container.innerHTML = statsHTML;
}

function displayPlayerComparison(player1Categories, player2Categories, container, player1Position = null, player2Position = null) {
  // Check if both players are goalies
  const player1IsGoalie = player1Position === "G" || (playersForComparison[0] && (playersForComparison[0].position === "G" || playersForComparison[0].position.includes("Goalie")));
  const player2IsGoalie = player2Position === "G" || (playersForComparison[1] && (playersForComparison[1].position === "G" || playersForComparison[1].position.includes("Goalie")));
  
  // For fair comparison, both players should be the same type (both goalies or both skaters)
  const isGoalieComparison = player1IsGoalie && player2IsGoalie;
  
  // Define position-specific stats
  const goalieStats = [
    { key: "goalsAgainst", label: "Goals Against", category: "defensive" },
    { key: "shotsAgainst", label: "Shots Against", category: "defensive" },
    { key: "shutouts", label: "Shutouts", category: "defensive" },
    { key: "saves", label: "Total Saves", category: "defensive" },
    { key: "savePct", label: "Saves Pct", category: "defensive" },
    { key: "production", label: "Production", category: "general" },
    { key: "games", label: "Games Played", category: "general" }
  ];
  
  const skaterStats = [
    { key: "goals", label: "Goals", category: "offensive" },
    { key: "assists", label: "Assists", category: "offensive" },
    { key: "points", label: "Points", category: "offensive" },
    { key: "hits", label: "Hits", category: "defensive" },
    { key: "shootingPct", label: "Shooting %", category: "offensive" },
    { key: "penaltyMinutes", label: "Penalty Minutes", category: "penalties" },
    { key: "plusMinus", label: "+/-", category: "general" },
    { key: "games", label: "Games Played", category: "general" }
  ];

  const desiredStats = isGoalieComparison ? goalieStats : skaterStats;
  
  // Validation check for position mismatch
  if ((player1IsGoalie && !player2IsGoalie) || (!player1IsGoalie && player2IsGoalie)) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #dc3545; border: 2px solid #dc3545; border-radius: 8px; background-color: #fff5f5;">
        <h4 style="margin: 0 0 15px 0; color: #dc3545;">Position Mismatch</h4>
        <p style="margin: 0; font-size: 14px;">
          Goalies can only be compared with other goalies, and skaters can only be compared with other skaters.
          <br>Please select players of the same position type for a fair comparison.
        </p>
      </div>
    `;
    return;
  }

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
            value: "0",
            rank: null,
            numericValue: 0
          });
        }
      } else {
        playerStats.push({
          label: desired.label,
          value: "0",
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
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">No statistics available for comparison</div>';
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
      width: isSmallScreen ? element.clientWidth : element.clientWidth - 30,
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
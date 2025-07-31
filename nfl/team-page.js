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

// NFL Position Groupings for Comparisons
function getPositionGroup(position) {
  const positionGroups = {
    'QB': 'QB',
    'RB': 'RB', 'FB': 'RB',
    'WR': 'WR/TE', 'TE': 'WR/TE',
    'OT': 'OL', 'G': 'OL', 'C': 'OL', 'OL': 'OL',
    'DE': 'DL/LB', 'DT': 'DL/LB', 'LB': 'DL/LB', 'OLB': 'DL/LB', 'MLB': 'DL/LB', 'ILB': 'DL/LB',
    'CB': 'DB', 'S': 'DB', 'FS': 'DB', 'SS': 'DB', 'DB': 'DB',
    'K': 'K/P', 'P': 'K/P', 'PK': 'K/P',
    'LS': 'LS' // Long snappers get their own group (no stats)
  };
  
  return positionGroups[position] || 'OTHER';
}

// Check if position should have full stats (exclude LS)
function shouldShowFullStats(position) {
  const otPositions = ['OT', 'G', 'C', 'OL'];
  return position !== 'LS' && !otPositions.includes(position);
}

// Get relevant stats for each position group (8 stats each)
function getPositionStats(positionGroup, categories) {
  const statMappings = {
    'QB': [
      { key: 'gamesPlayed', label: 'Games Played', category: 'general' },
      { key: 'passingYards', label: 'Pass Yards', category: 'passing' },
      { key: 'passingTouchdowns', label: 'Pass TDs', category: 'passing' },
      { key: 'interceptions', label: 'Interceptions', category: 'passing' },
      { key: 'completionPct', label: 'Completion %', category: 'passing' },
      { key: 'QBRating', label: 'QB Rating', category: 'passing' },
      { key: 'rushingYards', label: 'Rush Yards', category: 'rushing' },
      { key: 'rushingTouchdowns', label: 'Rush TDs', category: 'rushing' }
    ],
    'RB': [
      { key: 'gamesPlayed', label: 'Games Played', category: 'general' },
      { key: 'rushingAttempts', label: 'Rush Attempts', category: 'rushing' },
      { key: 'rushingYards', label: 'Rush Yards', category: 'rushing' },
      { key: 'rushingTouchdowns', label: 'Rush TDs', category: 'rushing' },
      { key: 'yardsPerRushAttempt', label: 'Yards/Carry', category: 'rushing' },
      { key: 'receptions', label: 'Receptions', category: 'receiving' },
      { key: 'receivingYards', label: 'Rec Yards', category: 'receiving' },
      { key: 'receivingTouchdowns', label: 'Rec TDs', category: 'receiving' }
    ],
    'WR/TE': [
      { key: 'gamesPlayed', label: 'Games Played', category: 'general' },
      { key: 'receptions', label: 'Receptions', category: 'receiving' },
      { key: 'receivingYards', label: 'Rec Yards', category: 'receiving' },
      { key: 'receivingTouchdowns', label: 'Rec TDs', category: 'receiving' },
      { key: 'yardsPerGame', label: 'Yards/Game', category: 'receiving' },
      { key: 'receivingTargets', label: 'Targets', category: 'receiving' },
      { key: 'longReception', label: 'Long Rec', category: 'receiving' },
      { key: 'receivingFirstDowns', label: 'Rec 1st Downs', category: 'receiving' }
    ],
    'DL/LB': [
      { key: 'gamesPlayed', label: 'Games Played', category: 'general' },
      { key: 'totalTackles', label: 'Total Tackles', category: 'defensive' },
      { key: 'soloTackles', label: 'Solo Tackles', category: 'defensive' },
      { key: 'sacks', label: 'Sacks', category: 'defensive' },
      { key: 'tacklesForLoss', label: 'TFL', category: 'defensive' },
      { key: 'QBHits', label: 'QB Hits', category: 'defensive' },
      { key: 'passesDefended', label: 'Pass Defended', category: 'defensive' },
      { key: 'fumblesForced', label: 'Forced Fumbles', category: 'general' }
    ],
    'DB': [
      { key: 'gamesPlayed', label: 'Games Played', category: 'general' },
      { key: 'totalTackles', label: 'Total Tackles', category: 'defensive' },
      { key: 'interceptions', label: 'Interceptions', category: 'defensiveInterceptions' },
      { key: 'passesDefended', label: 'Pass Defended', category: 'defensive' },
      { key: 'interceptionYards', label: 'INT Yards', category: 'defensiveInterceptions' },
      { key: 'sackYards', label: 'Sack YDS', category: 'defensive' },
      { key: 'fumblesRecovered', label: 'Fumbles Rec', category: 'general' },
      { key: 'stuffs', label: 'Stuffs', category: 'defensive' }
    ],
    'K/P': [
      { key: 'gamesPlayed', label: 'Games Played', category: 'general' },
      { key: 'fieldGoals', label: 'FG Made', category: 'scoring' },
      { key: 'kickExtraPoints', label: 'XP Made', category: 'scoring' },
      { key: 'grossAvgPuntYards', label: 'Punt Avg', category: 'punting' },
      { key: 'touchbacks', label: 'Touchbacks', category: 'punting' },
      { key: 'netTotalYards', label: 'Total Yards', category: 'passing' }
    ]
  };

  const positionStatConfig = statMappings[positionGroup] || statMappings['DL/LB']; // Default to defensive stats
  const playerStats = [];

  positionStatConfig.forEach(config => {
    const category = categories.find(c => c.name === config.category);
    if (category && category.stats) {
      const stat = category.stats.find(s => s.name === config.key);
      if (stat) {
        playerStats.push({
          label: config.label,
          value: stat.displayValue || '0',
          rank: stat.rankDisplayValue || null
        });
      } else {
        // If stat not found, show as 0
        playerStats.push({
          label: config.label,
          value: '0',
          rank: null
        });
      }
    } else {
      // If category not found, show as 0
      playerStats.push({
        label: config.label,
        value: '0',
        rank: null
      });
    }
  });

  return playerStats;
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
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${currentTeamId}`);
    const data = await response.json();
    currentTeam = data.team;
    
    const logoUrl = convertToHttps(currentTeam.logos?.find(logo =>
        logo.rel.includes(
          ["19", "20"].includes(currentTeam.id) ? 'dark' : 'default'
        )
    )?.href) || `https://a.espncdn.com/i/teamlogos/nfl/500/${currentTeam.abbreviation}.png`;


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
      const standingsResponse = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
      const standingsData = await standingsResponse.json();
      // This is simplified - we could get more detailed record info from standings API
    } catch (error) {
      console.log("Could not load team record");
    }
    
    document.getElementById('teamInfo').innerHTML = `
      <div class="team-header">
        <img src="${logoUrl}" alt="${currentTeam.displayName}" class="team-logo-header" onerror="this.src='football.png';">
        <div class="team-details-header">
          <div class="team-name-header">${currentTeam.displayName}</div>
          <div class="team-record-header">${currentTeam.nickname} (${currentTeam.franchise.venue.fullName})</div>
          <div class="team-division-header">${currentTeam.abbreviation} - NFL</div>
        </div>
      </div>
    `;
    
    // Update page title
    document.title = `${currentTeam.displayName} - NFL`;
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
  `;
  document.head.appendChild(style);
}

async function loadCurrentGame() {
  try {
    function getAdjustedDateForNFL() {
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
    
    const today = getAdjustedDateForNFL();
    
    // Fetch NFL games
    const todayResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${today}`);
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
    scoreDisplay = "vs";
  } else if (status === "Final") {
    statusText = "Final";
    scoreDisplay = `${teamScore || 0} - ${opponentScore || 0}`;
  } else {
    statusText = status;
    scoreDisplay = `${teamScore || 0} - ${opponentScore || 0}`;
  }

  const teamLogo = `https://a.espncdn.com/i/teamlogos/nfl/500/${isHomeTeam ? homeTeam.team.abbreviation : awayTeam.team.abbreviation}.png`;
  const opponentLogo = `https://a.espncdn.com/i/teamlogos/nfl/500/${opponent.team.abbreviation}.png`;

  // Format game date for URL parameter
  const gameUrlDate = gameDate.getFullYear() +
                     String(gameDate.getMonth() + 1).padStart(2, "0") +
                     String(gameDate.getDate()).padStart(2, "0");

  return `
    <div class="current-game-card" data-game-id="${game.id}" data-game-date="${gameUrlDate}">
      <div class="game-status">${statusText}</div>
      <div class="game-teams">
        <div class="game-team">
          <img src="${teamLogo}" alt="${isHomeTeam ? homeTeam.team.displayName : awayTeam.team.displayName}" class="game-team-logo" onerror="this.src='football.png';">
          <div class="game-team-name">${isHomeTeam ? homeTeam.team.abbreviation : awayTeam.team.abbreviation}</div>
        </div>
        <div class="game-score">${scoreDisplay}</div>
        <div class="game-team">
          <img src="${opponentLogo}" alt="${opponent.team.displayName}" class="game-team-logo" onerror="this.src='football.png';">
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
    
    // Format dates for NFL API
    const formatDate = (date) => {
      return date.getFullYear() +
        String(date.getMonth() + 1).padStart(2, "0") +
        String(date.getDate()).padStart(2, "0");
    };
    
    const dateRange = `${formatDate(startDate)}-${formatDate(today)}`;
    
    // Fetch NFL games
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dateRange}`);
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

  const teamLogo = `https://a.espncdn.com/i/teamlogos/nfl/500/${isHomeTeam ? homeTeam.team.abbreviation : awayTeam.team.abbreviation}.png`;
  const opponentLogo = `https://a.espncdn.com/i/teamlogos/nfl/500/${opponent.team.abbreviation}.png`;

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
    resultText = "vs";
  }

  // Format game date for URL parameter
  const gameUrlDate = gameDate.getFullYear() +
                     String(gameDate.getMonth() + 1).padStart(2, "0") +
                     String(gameDate.getDate()).padStart(2, "0");

  return `
    <div class="match-item" data-game-id="${game.id}" data-game-date="${gameUrlDate}">
      <div class="match-teams">
        <div class="match-team-info">
          <img src="${teamLogo}" alt="${isHomeTeam ? homeTeam.team.abbreviation : awayTeam.team.abbreviation}" class="match-team-logo" onerror="this.src='football.png';">
          <div class="match-team-name">${isHomeTeam ? homeTeam.team.abbreviation : awayTeam.team.abbreviation}</div>
        </div>
        <div class="match-result ${resultClass}">${resultText}</div>
        <div class="match-team-info">
          <div class="match-team-name">${opponent.team.abbreviation}</div>
          <img src="${opponentLogo}" alt="${opponent.team.abbreviation}" class="match-team-logo" onerror="this.src='football.png';">
        </div>
      </div>
      <div class="match-date">${formattedDate}</div>
    </div>
  `;
}

// Global variable to store all NFL players for league-wide comparison
let allNFLPlayers = [];

async function fetchAllNFLPlayers() {
  if (allNFLPlayers.length > 0) {
    return allNFLPlayers; // Return cached data
  }

  try {
    // Fetch all NFL teams
    const teamsResponse = await fetch('https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams?lang=en&region=us');
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
                  headshot: convertToHttps(playerData.headshot?.href) || 'football.png',
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

    allNFLPlayers = allPlayers;
    console.log(`Loaded ${allNFLPlayers.length} NFL players for comparison`);
    return allNFLPlayers;
  } catch (error) {
    console.error('Error fetching all NFL players:', error);
    return [];
  }
}

async function showPlayerSelectionInterface(playerNumber, modal, modalContent, currentPlayer1, currentPlayer2) {
  try {
    console.log(`Clearing player ${playerNumber}`);
    
    // Get all NFL players
    const allPlayers = await fetchAllNFLPlayers();
    
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
    searchInput.placeholder = 'Search any NFL player...';
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
        // Get the position group of the remaining player to filter by
        const remainingPlayer = playerNumber === "1" ? currentPlayer2 : currentPlayer1;
        const remainingPlayerPositionGroup = getPositionGroup(remainingPlayer.position);
        
        const filteredPlayers = allPlayers
          .filter(player => {
            const fullName = `${player.firstName || ''} ${player.lastName || ''}`.toLowerCase();
            const teamName = player.team.toLowerCase();
            const playerPositionGroup = getPositionGroup(player.position);
            
            // Only show players from the same position group as the remaining player
            return (fullName.includes(query) || teamName.includes(query)) && 
                   player.id !== currentPlayer1.id && 
                   player.id !== currentPlayer2.id &&
                   playerPositionGroup === remainingPlayerPositionGroup;
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
                   onerror="this.src='football.png';">
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
          searchResults.innerHTML = '<div style="padding: 10px; color: #666; text-align: center;">No players found</div>';
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
    
    // Fetch NFL games
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dateRange}`);
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
    const contentDiv = document.getElementById('teamStatsContent');
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${currentTeamId}`);
    const data = await response.json();

    currentTeam = data.team.record;
    
    contentDiv.innerHTML = `
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-label">Games Played</div>
          <div class="stat-value">${currentTeam.items[0].stats?.find(s => s.name === 'gamesPlayed')?.value}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Division Record</div>
          <div class="stat-value">${currentTeam.items[0].stats?.find(s => s.name === 'divisionWins')?.value}-${currentTeam.items[0].stats?.find(s => s.name === 'divisionLosses')?.value}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Away Games Played</div>
          <div class="stat-value">${currentTeam.items[1].stats?.find(s => s.name === 'wins')?.value + currentTeam.items[1].stats?.find(s => s.name === 'losses')?.value + currentTeam.items[1].stats?.find(s => s.name === 'ties')?.value}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Away Games Record</div>
          <div class="stat-value">${currentTeam.items[1].summary}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Home Games Played</div>
          <div class="stat-value">${currentTeam.items[2].stats?.find(s => s.name === 'wins')?.value + currentTeam.items[2].stats?.find(s => s.name === 'losses')?.value + currentTeam.items[2].stats?.find(s => s.name === 'ties')?.value}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Home Games Record</div>
          <div class="stat-value">${currentTeam.items[2].summary}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Average Points For</div>
          <div class="stat-value">${currentTeam.items[0].stats?.find(s => s.name === 'avgPointsFor')?.value}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Average Points Against</div>
          <div class="stat-value">${currentTeam.items[0].stats?.find(s => s.name === 'avgPointsAgainst')?.value}</div>
        </div>
    `;
  } catch (error) {
    console.error("Error loading team stats:", error);
    document.getElementById('teamStatsContent').innerHTML = '<div class="no-data">No data available</div>';
  }
}

async function loadCurrentStanding() {
  try {
    const STANDINGS_URL = `https://cdn.espn.com/core/nfl/standings?xhr=1`;
    const contentDiv = document.getElementById('currentStandingContent');
    
    const res = await fetch(STANDINGS_URL);
    const text = await res.text();
    const data = JSON.parse(text);

    // Navigate through the NFL standings structure
    const standings = data.content?.standings;
    if (!standings) {
      contentDiv.innerHTML = '<div class="no-data">Standings data not found</div>';
      return;
    }

    let teamStanding = null;
    let divisionName = "";
    let divisionPosition = 0;

    // Search through AFC and NFC groups
    const groups = standings.groups || [];
    
    for (const conference of groups) {
      // Each conference (AFC/NFC) has division groups
      const divisions = conference.groups || [];
      
      for (const division of divisions) {
        // Each division has standings entries
        const entries = division.standings?.entries || [];
        
        // Find the team in this division
        const foundTeam = entries.find(entry => entry.team.id === currentTeamId);
        
        if (foundTeam) {
          teamStanding = foundTeam;
          divisionName = `${conference.name}<br><br>${division.name}`;
          // Find position in division (1-based)
          divisionPosition = entries.findIndex(entry => entry.team.id === currentTeamId) + 1;
          break;
        }
      }
      
      if (teamStanding) break;
    }
    
    if (!teamStanding) {
      contentDiv.innerHTML = '<div class="no-data">Team not found in standings</div>';
      return;
    }

    // Extract stats
    const wins = teamStanding.stats.find(stat => stat.name === "wins")?.displayValue || "0";
    const losses = teamStanding.stats.find(stat => stat.name === "losses")?.displayValue || "0";
    const ties = teamStanding.stats.find(stat => stat.name === "ties")?.displayValue || "0";
    const winPercent = teamStanding.stats.find(stat => stat.name === "winPercent")?.displayValue || "0.000";
    const pointsFor = teamStanding.stats.find(stat => stat.name === "pointsFor")?.displayValue || "0";
    const pointsAgainst = teamStanding.stats.find(stat => stat.name === "pointsAgainst")?.displayValue || "0";
    const differential = teamStanding.stats.find(stat => stat.name === "differential")?.displayValue || "0";

    // Add ordinal suffix helper function
    const getOrdinalSuffix = (num) => {
      const j = num % 10;
      const k = num % 100;
      if (j === 1 && k !== 11) return num + "st";
      if (j === 2 && k !== 12) return num + "nd";
      if (j === 3 && k !== 13) return num + "rd";
      return num + "th";
    };

    // Format record (include ties if any)
    const record = parseInt(ties) > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
    
    contentDiv.innerHTML = `
      <div class="standing-info">
        <div class="standing-position">${getOrdinalSuffix(divisionPosition)}</div>
        <div class="standing-details">
          <strong>${divisionName}</strong><br><br>
          Record: ${record}<br><br>
          Win %: ${winPercent}<br><br>
          PF: ${pointsFor} | PA: ${pointsAgainst}<br><br>
          Diff: ${differential}
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
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${currentTeamId}/roster`);
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
    const headshotUrl = convertToHttps(player.headshot?.href) || "football.png";
    
    return `
      <div class="player-card" data-player-id="${player.id}" onclick="showPlayerDetails('${player.id}', '${firstName}', '${lastName}', '${jerseyNumber}', '${position}', '${headshotUrl}')">
        <img src="${headshotUrl}" alt="${firstName} ${lastName}" class="player-headshot" onerror="this.src='football.png';">
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
           onerror="this.src='football.png';">
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
        // Get all NFL players for league-wide search
        const allPlayers = await fetchAllNFLPlayers();
        
        // Get the position group of the current player to filter by
        const currentPlayerPositionGroup = getPositionGroup(position);
        
        const filteredPlayers = allPlayers
          .filter(player => {
            const fullName = `${player.firstName || ''} ${player.lastName || ''}`.toLowerCase();
            const teamName = player.team.toLowerCase();
            const playerPositionGroup = getPositionGroup(player.position);
            
            // Only show players from the same position group and exclude current player
            return (fullName.includes(query) || teamName.includes(query)) && 
                   player.id !== selectedPlayer.id &&
                   playerPositionGroup === currentPlayerPositionGroup;
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
                   onerror="this.src='football.png';">
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
                  headshot: convertToHttps(player.headshot) || 'football.png'
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
          searchResults.innerHTML = '<div style="padding: 10px; color: #666; text-align: center;">No players found</div>';
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
    modalContent.appendChild(searchSection);
    modal.appendChild(modalContent);

    // Add modal to document
    document.body.appendChild(modal);

    // Check if position should show full stats (exclude LS)
    if (!shouldShowFullStats(position)) {
      statsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Statistics not available for this position</div>';
    } else {
      // Get valid season year and fetch player stats
      const seasonYear = await getValidSeasonYear('football', 'nfl', playerId);
      const response = await fetch(`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${seasonYear}/types/2/athletes/${playerId}/statistics?lang=en&region=us`);
      const data = await response.json();

      console.log('Player stats data:', data);

      if (data.splits && data.splits.categories) {
        displayPlayerStatsInModal(data.splits.categories, statsContainer, position);
      } else {
        statsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Player statistics not available</div>';
      }
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
    // Check if both players are from the same position group
    const position1Group = getPositionGroup(player1.position);
    const position2Group = getPositionGroup(player2.position);
    
    if (position1Group !== position2Group) {
      alert(`Cannot compare players from different position groups:\n${player1.firstName} ${player1.lastName} (${position1Group}) vs ${player2.firstName} ${player2.lastName} (${position2Group})\n\nPlease select players from the same position group.`);
      return;
    }
    
    // Check if positions should have stats (exclude LS)
    if (!shouldShowFullStats(player1.position) || !shouldShowFullStats(player2.position)) {
      alert('Cannot compare players from positions that do not have detailed statistics.');
      return;
    }

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
           onerror="this.src='football.png';">
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
           onerror="this.src='football.png';">
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
      getValidSeasonYear('football', 'nfl', player1.id),
      getValidSeasonYear('football', 'nfl', player2.id)
    ]);

    const [player1Response, player2Response] = await Promise.all([
      fetch(`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${seasonYear1}/types/2/athletes/${player1.id}/statistics?lang=en&region=us`),
      fetch(`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${seasonYear2}/types/2/athletes/${player2.id}/statistics?lang=en&region=us`)
    ]);

    const [player1Data, player2Data] = await Promise.all([
      player1Response.json(),
      player2Response.json()
    ]);

    displayPlayerComparison(player1Data.splits?.categories, player2Data.splits?.categories, statsComparisonContainer, player1.position);

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

function displayPlayerStatsInModal(categories, container, position) {
  // Get position-specific stats
  const positionGroup = getPositionGroup(position);
  const playerStats = getPositionStats(positionGroup, categories);

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

function displayPlayerComparison(player1Categories, player2Categories, container, position) {
  // Get position-specific stats for both players
  const positionGroup = getPositionGroup(position);
  const player1Stats = getPositionStats(positionGroup, player1Categories);
  const player2Stats = getPositionStats(positionGroup, player2Categories);

  if (player1Stats.length === 0 && player2Stats.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">No statistics available for comparison</div>';
    return;
  }

  // Create comparison table
  let comparisonHTML = '<div style="display: flex; flex-direction: column; gap: 15px;">';
  
  // Use the length of whichever array has stats
  const maxStats = Math.max(player1Stats.length, player2Stats.length);
  
  for (let i = 0; i < maxStats; i++) {
    const stat1 = player1Stats[i] || { label: 'N/A', value: 'N/A', rank: null };
    const stat2 = player2Stats[i] || { label: 'N/A', value: 'N/A', rank: null };
    
    // Determine which stat is better (varies by stat type)
    let player1Better = false;
    let player2Better = false;
    
    if (stat1.value !== "N/A" && stat2.value !== "N/A") {
      const val1 = parseFloat(stat1.value) || 0;
      const val2 = parseFloat(stat2.value) || 0;
      
      // Stats where lower is better
      const lowerIsBetter = stat1.label.includes('Interceptions') || 
                           stat1.label.includes('Sacks Allowed') || 
                           stat1.label.includes('Hurries Allowed') || 
                           stat1.label.includes('QB Hits Allowed') ||
                           stat1.label.includes('Penalties') ||
                           stat1.label.includes('Penalty Yards');
      
      if (lowerIsBetter) {
        player1Better = val1 < val2 && val1 > 0;
        player2Better = val2 < val1 && val2 > 0;
      } else {
        player1Better = val1 > val2;
        player2Better = val2 > val1;
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
  }
  
  comparisonHTML += '</div>';
  container.innerHTML = comparisonHTML;
}
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

// NBA team colors mapping
const teamColors = {
  "Atlanta Hawks": "#E03A3E",
  "Boston Celtics": "#007A33",
  "Brooklyn Nets": "#000000",
  "Charlotte Hornets": "#1D1160",
  "Chicago Bulls": "#CE1141",
  "Cleveland Cavaliers": "#860038",
  "Dallas Mavericks": "#00538C",
  "Denver Nuggets": "#0E2240",
  "Detroit Pistons": "#C8102E",
  "Golden State Warriors": "#1D428A",
  "Houston Rockets": "#CE1141",
  "Indiana Pacers": "#002D62",
  "Los Angeles Clippers": "#C8102E",
  "Los Angeles Lakers": "#552583",
  "Memphis Grizzlies": "#5D76A9",
  "Miami Heat": "#98002E",
  "Milwaukee Bucks": "#00471B",
  "Minnesota Timberwolves": "#0C2340",
  "New Orleans Pelicans": "#0C2340",
  "New York Knicks": "#F58426",
  "Oklahoma City Thunder": "#007AC1",
  "Orlando Magic": "#0077C0",
  "Philadelphia 76ers": "#006BB6",
  "Phoenix Suns": "#1D1160",
  "Portland Trail Blazers": "#E03A3E",
  "Sacramento Kings": "#5A2D81",
  "San Antonio Spurs": "#C4CED4",
  "Toronto Raptors": "#CE1141",
  "Utah Jazz": "#002B5C",
  "Washington Wizards": "#002B5C"
};

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
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${currentTeamId}`);
    const data = await response.json();
    currentTeam = data.team;
    
    const logoUrl = convertToHttps(currentTeam.logos?.find(logo =>
        logo.rel.includes(
          ["26"].includes(currentTeam.id) ? 'secondary_logo_on_secondary_color' : 'primary_logo_on_primary_color'
        )
    )?.href) || `https://a.espncdn.com/i/teamlogos/nba/500-dark/scoreboard/${currentTeam.abbreviation}.png`;
    
    const teamColor = teamColors[currentTeam.displayName] || "#000000";
    
    // Set the background color of the team info section
    const teamInfoSection = document.querySelector('.team-info-section');
    if (teamInfoSection) {
      teamInfoSection.style.backgroundColor = teamColor;
      teamInfoSection.style.color = "#ffffff";
    }
    
    // Apply team color to various elements
    applyTeamColors(teamColor);
    
    // Get team record from standings
    let recordText = "NBA Team";
    try {
      const standingsResponse = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
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
          <div class="team-division-header">${currentTeam.group?.name || 'NBA'}</div>
          <div class="team-record-header">${recordText}</div>
        </div>
      </div>
    `;
    
    // Update page title
    document.title = `${currentTeam.displayName} - NBA`;
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
    
    // Fetch from both NBA and Summer League APIs
    const [todayResponse, summerResponse] = await Promise.all([
      fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today}`),
      fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba-summer-las-vegas/scoreboard?dates=${today}`)
    ]);
    
    const [todayData, summerData] = await Promise.all([
      todayResponse.json(),
      summerResponse.json()
    ]);
    
    // Combine events from both sources
    const allEvents = [
      ...(todayData.events || []),
      ...(summerData.events || [])
    ];
    
    const contentDiv = document.getElementById('currentGameContent');
    
    // Check if there's a game today for this team
    const todayGame = allEvents.find(event => {
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
      // No game today, look for the next upcoming game
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30); // Look ahead 30 days
      
      const tomorrowFormatted = tomorrow.getFullYear() +
                               String(tomorrow.getMonth() + 1).padStart(2, "0") +
                               String(tomorrow.getDate()).padStart(2, "0");
      const endDateFormatted = endDate.getFullYear() +
                              String(endDate.getMonth() + 1).padStart(2, "0") +
                              String(endDate.getDate()).padStart(2, "0");
      
      // Fetch from both NBA and Summer League APIs
      const [upcomingResponse, summerUpcomingResponse] = await Promise.all([
        fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${tomorrowFormatted}-${endDateFormatted}`),
        fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba-summer-las-vegas/scoreboard?dates=${tomorrowFormatted}-${endDateFormatted}`)
      ]);
      
      const [upcomingData, summerUpcomingData] = await Promise.all([
        upcomingResponse.json(),
        summerUpcomingResponse.json()
      ]);
      
      // Combine events from both sources
      const allUpcomingEvents = [
        ...(upcomingData.events || []),
        ...(summerUpcomingData.events || [])
      ];
      
      // Find the next scheduled game for this team
      const nextGame = allUpcomingEvents
        ?.filter(event => {
          const competition = event.competitions?.[0];
          return competition?.competitors.some(competitor => competitor.team.id === currentTeamId);
        })
        .filter(event => event.status.type.description === "Scheduled")
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
            const gameDate = gameCardElement.getAttribute('data-game-date');
            if (gameId && gameDate) {
              window.location.href = `scoreboard.html?gameId=${gameId}&date=${gameDate}`;
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

  const teamLogo = `https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${currentTeam.abbreviation}.png`;
  const opponentLogo = `https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${opponent.team.abbreviation}.png`;

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
    
    // Format dates for NBA API
    const formatDate = (date) => {
      return date.getFullYear() +
        String(date.getMonth() + 1).padStart(2, "0") +
        String(date.getDate()).padStart(2, "0");
    };
    
    const dateRange = `${formatDate(startDate)}-${formatDate(today)}`;
    
    // Fetch from both NBA and Summer League APIs
    const [response, summerResponse] = await Promise.all([
      fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateRange}`),
      fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba-summer-las-vegas/scoreboard?dates=${dateRange}`)
    ]);
    
    const [data, summerData] = await Promise.all([
      response.json(),
      summerResponse.json()
    ]);
    
    // Combine events from both sources
    const allEvents = [
      ...(data.events || []),
      ...(summerData.events || [])
    ];
    
    // Filter games for this team and completed games
    const allGames = allEvents.filter(event => {
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

  const teamLogo = `https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${currentTeam.abbreviation}.png`;
  const opponentLogo = `https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${opponent.team.abbreviation}.png`;

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
          <img src="${teamLogo}" alt="${currentTeam.abbreviation}" class="match-team-logo" onerror="this.src='icon.png';">
          <div class="match-team-name">${currentTeam.abbreviation}</div>
        </div>
        <div class="match-result ${resultClass}">${resultText}</div>
        <div class="match-team-info">
          <div class="match-team-name">${opponent.team.abbreviation}</div>
          <img src="${opponentLogo}" alt="${opponent.team.abbreviation}" class="match-team-logo" onerror="this.src='icon.png';">
        </div>
      </div>
      <div class="match-date">${formattedDate}${isHomeTeam ? ' (H)' : ' (A)'}</div>
    </div>
  `;
}

// Global variable to store all NBA players for league-wide comparison
let allNBAPlayers = [];

async function fetchAllNBAPlayers() {
  if (allNBAPlayers.length > 0) {
    return allNBAPlayers; // Return cached data
  }

  try {
    // Fetch all NBA teams
    const teamsResponse = await fetch('https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/teams?lang=en&region=us');
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
    console.log(`Loaded ${allNBAPlayers.length} NBA players for comparison`);
    return allNBAPlayers;
  } catch (error) {
    console.error('Error fetching all NBA players:', error);
    return [];
  }
}

async function showPlayerSelectionInterface(playerNumber, modal, modalContent, currentPlayer1, currentPlayer2) {
  try {
    console.log(`Clearing player ${playerNumber}`);
    
    // Get all NBA players
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
    searchInput.placeholder = 'Search any NBA player...';
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
    
    // Fetch from both NBA and Summer League APIs
    const [response, summerResponse] = await Promise.all([
      fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateRange}`),
      fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba-summer-las-vegas/scoreboard?dates=${dateRange}`)
    ]);
    
    const [data, summerData] = await Promise.all([
      response.json(),
      summerResponse.json()
    ]);
    
    // Combine events from both sources
    const allEvents = [
      ...(data.events || []),
      ...(summerData.events || [])
    ];
    
    const upcomingGames = allEvents
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
    // NBA doesn't have a direct team stats API like MLB, so we'll show basic info
    const contentDiv = document.getElementById('teamStatsContent');
    
    // Try to get team info from the main team API
    const response = await fetch(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2025/types/2/teams/${currentTeamId}/statistics?lang=en&region=us`);
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
    // Function to determine if we're in the Summer League period (same as standings.js)
    function isSummerLeague() {
      const now = new Date();
      const year = now.getFullYear();
      const summerStart = new Date(year, 6, 10); // July 10 (month is 0-indexed)
      const summerEnd = new Date(year, 6, 21);   // July 21
      
      return now >= summerStart && now <= summerEnd;
    }

    // Function to get the appropriate league identifier
    function getLeagueIdentifier() {
      return isSummerLeague() ? "nba-summer-las-vegas" : "nba";
    }

    const STANDINGS_URL = `https://cdn.espn.com/core/${getLeagueIdentifier()}/standings?xhr=1`;
    const contentDiv = document.getElementById('currentStandingContent');
    
    if (isSummerLeague()) {
      // Handle Summer League standings
      const SUMMER_LEAGUE_STANDINGS_URL = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba-summer-las-vegas/seasons/2025/types/2/groups/1/standings/0?lang=en&region=us";
      
      const res = await fetch(SUMMER_LEAGUE_STANDINGS_URL);
      const data = await res.json();
      
      const standingsData = data.standings || [];
      
      // Find current team in standings
      let teamStanding = null;
      for (const teamStandingData of standingsData) {
        const teamRef = convertToHttps(teamStandingData.team.$ref);
        const teamRes = await fetch(teamRef);
        const teamData = await teamRes.json();
        
        if (teamData.id === currentTeamId) {
          const record = teamStandingData.records[0];
          const stats = record.stats.reduce((acc, stat) => {
            acc[stat.name] = stat;
            return acc;
          }, {});
          
          teamStanding = {
            team: teamData,
            record: record,
            stats: stats,
            seed: stats.playoffSeed?.value || 0
          };
          break;
        }
      }
      
      if (teamStanding) {
        const wins = teamStanding.stats.wins?.displayValue || "0";
        const losses = teamStanding.stats.losses?.displayValue || "0";
        const winPercentage = teamStanding.stats.winPercent?.displayValue || "0.000";
        
        contentDiv.innerHTML = `
          <div class="standing-info">
            <div class="standing-position">#${teamStanding.seed}</div>
            <div class="standing-details">
              <strong>Summer League</strong><br>
              Record: ${wins}-${losses}<br>
              Win %: ${winPercentage}
            </div>
          </div>
        `;
      } else {
        contentDiv.innerHTML = '<div class="no-data">Summer League standing information not available</div>';
      }
    } else {
      // Handle regular NBA standings
      const res = await fetch(STANDINGS_URL);
      const text = await res.text();
      const data = JSON.parse(text);
      const groups = data.content.standings.groups;

      const easternConference = groups.find(group => group.name === "Eastern Conference");
      const westernConference = groups.find(group => group.name === "Western Conference");
      
      let teamStanding = null;
      let conferenceName = "";
      
      // Search in Eastern Conference
      if (easternConference) {
        const foundEntry = easternConference.standings.entries.find(entry => entry.team.id === currentTeamId);
        if (foundEntry) {
          teamStanding = foundEntry;
          conferenceName = "Eastern Conference";
        }
      }
      
      // Search in Western Conference if not found in Eastern
      if (!teamStanding && westernConference) {
        const foundEntry = westernConference.standings.entries.find(entry => entry.team.id === currentTeamId);
        if (foundEntry) {
          teamStanding = foundEntry;
          conferenceName = "Western Conference";
        }
      }
      
      if (teamStanding) {
        const wins = teamStanding.stats.find(stat => stat.name === "wins")?.displayValue || "0";
        const losses = teamStanding.stats.find(stat => stat.name === "losses")?.displayValue || "0";
        const winPercent = teamStanding.stats.find(stat => stat.name === "winPercent")?.displayValue || "0.000";
        const gamesBehind = teamStanding.stats.find(stat => stat.name === "gamesBehind")?.displayValue || "-";
        const teamSeed = teamStanding.team.seed || "N/A";
        
        contentDiv.innerHTML = `
          <div class="standing-info">
            <div class="standing-position">#${teamSeed}</div>
            <div class="standing-details">
              <strong>${conferenceName}</strong><br><br>
              Record: ${wins}-${losses}<br><br>
              Win %: ${winPercent}<br><br>
              GB: ${gamesBehind}
            </div>
          </div>
        `;
      } else {
        contentDiv.innerHTML = '<div class="no-data">Standing information not available</div>';
      }
    }
  } catch (error) {
    console.error("Error loading standings:", error);
    document.getElementById('currentStandingContent').innerHTML = '<div class="no-data">Error loading standings</div>';
  }
}

async function loadPlayersInfo() {
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${currentTeamId}/roster`);
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
      <div class="player-card" data-player-id="${player.id}" onclick="showPlayerDetails('${player.id}', '${firstName}', '${lastName}', '${jerseyNumber}', '${position}', '${headshotUrl}')">
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
        // Get all NBA players for league-wide search
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

    // Fetch player stats
    const response = await fetch(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2025/types/2/athletes/${playerId}/statistics?lang=en&region=us`);
    const data = await response.json();

    console.log('Player stats data:', data);

    if (data.splits && data.splits.categories) {
      displayPlayerStatsInModal(data.splits.categories, statsContainer);
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
      border-bottom: 2px solid #007bff;
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
      color: #007bff;
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

    // Fetch both players' stats
    const [player1Response, player2Response] = await Promise.all([
      fetch(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2025/types/2/athletes/${player1.id}/statistics?lang=en&region=us`),
      fetch(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2025/types/2/athletes/${player2.id}/statistics?lang=en&region=us`)
    ]);

    const [player1Data, player2Data] = await Promise.all([
      player1Response.json(),
      player2Response.json()
    ]);

    displayPlayerComparison(player1Data.splits?.categories, player2Data.splits?.categories, statsComparisonContainer);

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
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">No statistics available for this player</div>';
    return;
  }

  // Create stats display with same styling as team stats but inline for modal
  const statsHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
      ${playerStats.map(stat => `
        <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: bold; color: #007bff; margin-bottom: 8px;">
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
          <div style="font-size: 1.3rem; font-weight: bold; color: ${player1Better ? '#28a745' : '#007bff'}; margin-bottom: 5px;">
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
          <div style="font-size: 1.3rem; font-weight: bold; color: ${player2Better ? '#28a745' : '#007bff'}; margin-bottom: 5px;">
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
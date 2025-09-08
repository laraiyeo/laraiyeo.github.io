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
let currentStatsMode = 'overall'; // 'overall' or 'gamelog'

// Player-specific team information for selected season
let playerTeamForYear = null; // Player's team data for selected year
let playerTeamColor = "#000000"; // Player's team color for selected year
let playerTeamAbbr = "UNK"; // Player's team abbreviation for selected year
let playerJerseyForYear = "N/A"; // Player's jersey number for selected year
let playerPositionForYear = null; // Player's position for selected year

// Global variable to store all MLB players for league-wide comparison
let allMLBPlayers = [];

// Get the appropriate season year, falling back to previous year if current year has no data
async function getValidSeasonYear(playerId = null, teamId = null) {
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;
  
  // Test current year first
  let testUrl;
  if (playerId) {
    testUrl = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=hitting&season=${currentYear}`;
  } else if (teamId) {
    testUrl = `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?season=${currentYear}&group=hitting&stats=season&gameType=R`;
  } else {
    return currentYear; // Default to current year if no specific entity to test
  }
  
  try {
    const response = await fetch(testUrl);
    const data = await response.json();
    
    // Check if current year has valid stats data
    if (response.ok && data && ((data.stats && data.stats.length > 0) || 
        (data.people && data.people.length > 0))) {
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
  const prevRosterBtn = document.getElementById('prevRosterPage');
  const nextRosterBtn = document.getElementById('nextRosterPage');

  // Set default start date to 10 days ago
  const today = new Date();
  const defaultStartDate = new Date(today);
  defaultStartDate.setDate(today.getDate() - 10);
  startDatePicker.value = defaultStartDate.toISOString().split('T')[0];

  // Date picker change handler
  startDatePicker.addEventListener('change', () => {
    currentPage = 1;
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

  // Pagination handlers for roster
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

async function loadTeamData() {
  try {
    // Load team information
    await loadTeamInfo();
    
    // Initialize MLB players for comparison (async, don't wait)
    fetchAllMLBPlayers().catch(console.error);
    
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
    const response = await fetch(`https://statsapi.mlb.com/api/v1/teams/${currentTeamId}`);
    const data = await response.json();
    currentTeam = data.teams[0];
    
    const logoUrl = await getLogoUrl(currentTeam.name);
    const teamColor = teamColors[currentTeam.name] || "#000000";
    
    // Set the background color of the team info section
    const teamInfoSection = document.querySelector('.team-info-section');
    if (teamInfoSection) {
      teamInfoSection.style.backgroundColor = teamColor;
      teamInfoSection.style.color = "#ffffff";
    }
    
    // Apply team color to various blue elements
    applyTeamColors(teamColor);
    
    document.getElementById('teamInfo').innerHTML = `
      <div class="team-header">
        <img src="${logoUrl}" alt="${currentTeam.name}" class="team-logo-header" onerror="this.src='icon.png';">
        <div class="team-details-header">
          <div class="team-name-header">${currentTeam.name}</div>
          <div class="team-division-header">${currentTeam.division.name}</div>
          <div class="team-record-header">${currentTeam.league.name}</div>
        </div>
      </div>
    `;
    
    // Update page title
    document.title = `${currentTeam.name} - MLB`;
  } catch (error) {
    console.error("Error loading team info:", error);
    document.getElementById('teamInfo').innerHTML = '<div class="no-data">Error loading team information</div>';
  }
}

async function loadCurrentGame() {
  try {
    // Use the same date adjustment logic as teams.js
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
    
    const today = getAdjustedDateForMLB();
    const todayResponse = await fetch(`https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&teamId=${currentTeamId}&startDate=${today}&endDate=${today}`);
    const todayData = await todayResponse.json();
    
    const contentDiv = document.getElementById('currentGameContent');
    
    // Check if there's a game today
    if (todayData.dates && todayData.dates.length > 0 && todayData.dates[0].games.length > 0) {
      const game = todayData.dates[0].games[0];
      const gameCard = await createCurrentGameCard(game);
      contentDiv.innerHTML = gameCard;
      
      // Add click handler for current game
      const gameCardElement = contentDiv.querySelector('.current-game-card');
      if (gameCardElement) {
        gameCardElement.style.cursor = 'pointer';
        gameCardElement.addEventListener('click', () => {
          const gamePk = gameCardElement.getAttribute('data-game-pk');
          if (gamePk) {
            window.location.href = `scoreboard.html?gamePk=${gamePk}`;
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

async function loadRecentMatches() {
  try {
    const startDatePicker = document.getElementById('startDatePicker');
    const today = new Date();
    const startDate = startDatePicker ? new Date(startDatePicker.value) : new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000); // Default to 10 days ago
    
    // Date range is from the selected start date to today
    const endDate = today;
    
    const response = await fetch(`https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&teamId=${currentTeamId}&startDate=${startDate.toISOString().split('T')[0]}&endDate=${endDate.toISOString().split('T')[0]}`);
    const data = await response.json();
    
    const allGames = [];
    data.dates?.forEach(dateObj => {
      allGames.push(...dateObj.games);
    });
    
    // Filter completed games and sort by date (newest first)
    allRecentMatches = allGames
      .filter(game => ["Final", "Game Over", "Completed Early"].includes(game.status.detailedState))
      .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));
    
    // Reset to first page
    currentPage = 1;
    
    displayRecentMatches();
  } catch (error) {
    console.error("Error loading recent matches:", error);
    document.getElementById('recentMatchesContent').innerHTML = '<div class="no-data">Error loading recent matches</div>';
  }
}

function displayRecentMatches() {
  const contentDiv = document.getElementById('recentMatchesContent');
  
  if (allRecentMatches.length === 0) {
    contentDiv.innerHTML = '<div class="no-data">No recent matches found for the selected date range</div>';
    updatePaginationControls(0);
    return;
  }
  
  // Calculate pagination
  const totalPages = Math.ceil(allRecentMatches.length / matchesPerPage);
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
          const gamePk = item.getAttribute('data-game-pk');
          if (gamePk) {
            window.location.href = `scoreboard.html?gamePk=${gamePk}`;
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

async function loadUpcomingMatches() {
  try {
    // Use the same date adjustment logic as teams.js
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
    
    // Start from the day after the MLB-adjusted "today"
    const todayAdjusted = new Date(getAdjustedDateForMLB());
    const startDate = new Date(todayAdjusted);
    startDate.setDate(startDate.getDate() + 1); // Start from tomorrow
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 30); // Look ahead 30 days
    
    const response = await fetch(`https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&teamId=${currentTeamId}&startDate=${startDate.toISOString().split('T')[0]}&endDate=${endDate.toISOString().split('T')[0]}`);
    const data = await response.json();
    
    const allGames = [];
    data.dates?.forEach(dateObj => {
      allGames.push(...dateObj.games);
    });
    
    // Filter upcoming games and get next 5
    const upcomingGames = allGames
      .filter(game => ["Scheduled", "Pre-Game", "Warmup"].includes(game.status.detailedState))
      .sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate))
      .slice(0, 5);
    
    const contentDiv = document.getElementById('upcomingMatchesContent');
    
    if (upcomingGames.length > 0) {
      const matchCards = await Promise.all(upcomingGames.map(game => createMatchCard(game, false)));
      contentDiv.innerHTML = `<div class="match-list">${matchCards.join('')}</div>`;
      
      // Add click handlers
      contentDiv.querySelectorAll('.match-item').forEach(item => {
        item.addEventListener('click', () => {
          const gamePk = item.getAttribute('data-game-pk');
          if (gamePk) {
            window.location.href = `scoreboard.html?gamePk=${gamePk}`;
          }
        });
      });
    } else {
      contentDiv.innerHTML = '<div class="no-data">No upcoming matches found</div>';
    }
  } catch (error) {
    console.error("Error loading upcoming matches:", error);
    document.getElementById('upcomingMatchesContent').innerHTML = '<div class="no-data">Error loading upcoming matches</div>';
  }
}

async function loadTeamStats() {
  try {
    const contentDiv = document.getElementById('teamStatsContent');
    const currentYear = new Date().getFullYear();
    
    // Fetch both hitting and pitching stats
    const [hittingResponse, pitchingResponse] = await Promise.all([
      fetch(`https://statsapi.mlb.com/api/v1/teams/${currentTeamId}/stats?season=${currentYear}&group=hitting&stats=season&gameType=R`),
      fetch(`https://statsapi.mlb.com/api/v1/teams/${currentTeamId}/stats?season=${currentYear}&group=pitching&stats=season&gameType=R`)
    ]);
    
    const hittingData = await hittingResponse.json();
    const pitchingData = await pitchingResponse.json();
    
    // Extract stats
    const hittingStats = hittingData.stats?.[0]?.splits?.[0]?.stat;
    const pitchingStats = pitchingData.stats?.[0]?.splits?.[0]?.stat;
    
    if (hittingStats && pitchingStats) {
      // Calculate derived stats
      const runs = hittingStats.runs;
      const hits = hittingStats.hits;
      const gamesPlayed = hittingStats.gamesPlayed;
      const avg = hittingStats.avg;
      const obp = hittingStats.obp;
      const era = pitchingStats.era;
      const strikeoutsPer9 = pitchingStats.strikeoutsPer9Inn;
      const whip = pitchingStats.whip;
      const wins = pitchingStats.wins;
      const losses = pitchingStats.losses;
      
      const runsPerGame = gamesPlayed > 0 ? (runs / gamesPlayed).toFixed(3) : "0.000";
      const hitsPerGame = gamesPlayed > 0 ? (hits / gamesPlayed).toFixed(1) : "0.0";
      const totalGames = wins + losses;
      const winPercentage = totalGames > 0 ? (wins / totalGames).toFixed(3) : "0.000";
      
      contentDiv.innerHTML = `
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value">${runsPerGame}</div>
            <div class="stat-label">Runs/Game</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${hitsPerGame}</div>
            <div class="stat-label">Hits/Game</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${avg}</div>
            <div class="stat-label">AVG</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${obp}</div>
            <div class="stat-label">OBP</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${era}</div>
            <div class="stat-label">ERA</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${strikeoutsPer9}</div>
            <div class="stat-label">K/9</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${whip}</div>
            <div class="stat-label">WHIP</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${winPercentage}</div>
            <div class="stat-label">Win %</div>
          </div>
        </div>
      `;
    } else {
      throw new Error("Unable to parse statistics data");
    }
  } catch (error) {
    console.error("Error loading team stats:", error);
    document.getElementById('teamStatsContent').innerHTML = '<div class="no-data">Error loading team statistics</div>';
  }
}

async function loadCurrentStanding() {
  try {
    const contentDiv = document.getElementById('currentStandingContent');
    
    // Fetch standings data from ESPN
    const response = await fetch("https://cdn.espn.com/core/mlb/standings?xhr=1");
    const data = await response.json();
    const groups = data.content.standings.groups;

    // Find the team in the standings
    let teamStanding = null;
    let divisionName = "";
    
    for (const league of groups) {
      for (const division of league.groups) {
        const teamEntry = division.standings.entries.find(entry => 
          entry.team.displayName === currentTeam.name
        );
        if (teamEntry) {
          teamStanding = teamEntry;
          divisionName = division.name;
          break;
        }
      }
      if (teamStanding) break;
    }

    if (teamStanding) {
      const position = teamStanding.team.seed;
      const wins = teamStanding.stats.find(stat => stat.name === "wins")?.displayValue || "0";
      const losses = teamStanding.stats.find(stat => stat.name === "losses")?.displayValue || "0";
      const winPercent = teamStanding.stats.find(stat => stat.name === "winPercent")?.displayValue || "0.000";
      const gamesBehind = teamStanding.stats.find(stat => stat.name === "gamesBehind")?.displayValue || "-";
      
      // Add ordinal suffix
      const getOrdinalSuffix = (num) => {
        const j = num % 10;
        const k = num % 100;
        if (j === 1 && k !== 11) return num + "st";
        if (j === 2 && k !== 12) return num + "nd";
        if (j === 3 && k !== 13) return num + "rd";
        return num + "th";
      };

      const positionWithSuffix = getOrdinalSuffix(position);
      
      // Use only first 2 words of division name
      const shortDivisionName = divisionName.split(' ').slice(0, 2).join(' ');

      contentDiv.innerHTML = `
        <div class="standing-info">
          <div class="standing-position">${positionWithSuffix}</div>
          <div class="standing-details">
            <div style="font-weight: bold; margin-bottom: 8px;">Position in ${shortDivisionName}</div><br>
            <div style="margin-bottom: 4px;">Record: ${wins}-${losses} (${winPercent})</div><br>
            <div>Games Behind: ${gamesBehind === "0" ? "Leading" : gamesBehind}</div>
          </div>
        </div>
      `;
    } else {
      contentDiv.innerHTML = `
        <div class="standing-info">
          <div class="standing-position">--</div>
          <div class="standing-details">
            <div>Position in ${currentTeam?.division?.name || 'Division'}</div>
            <div style="margin-top: 10px; color: #777;">
              Unable to load standings data
            </div>
          </div>
        </div>
      `;
    }
  } catch (error) {
    console.error("Error loading standings:", error);
    document.getElementById('currentStandingContent').innerHTML = `
      <div class="standing-info">
        <div class="standing-position">--</div>
        <div class="standing-details">
          <div>Position in ${currentTeam?.division?.name || 'Division'}</div>
          <div style="margin-top: 10px; color: #777;">
            Error loading standings data
          </div>
        </div>
      </div>
    `;
  }
}

async function loadPlayersInfo() {
  try {
    const response = await fetch(`https://statsapi.mlb.com/api/v1/teams/${currentTeamId}/roster`);
    const data = await response.json();
    
    // Filter active players and sort alphabetically by last name
    allRosterPlayers = data.roster
      .filter(player => player.status.code === "A")
      .sort((a, b) => {
        const lastNameA = a.person.fullName.split(' ').pop();
        const lastNameB = b.person.fullName.split(' ').pop();
        return lastNameA.localeCompare(lastNameB);
      });
    
    // Reset to first page
    currentRosterPage = 1;
    
    displayRosterPlayers();
  } catch (error) {
    console.error("Error loading player info:", error);
    document.getElementById('playersInfoContent').innerHTML = '<div class="no-data">Error loading player information</div>';
  }
}

function displayRosterPlayers() {
  const contentDiv = document.getElementById('playersInfoContent');
  
  if (allRosterPlayers.length === 0) {
    contentDiv.innerHTML = '<div class="no-data">No roster information found</div>';
    updateRosterPaginationControls(0);
    return;
  }
  
  // Calculate pagination
  const totalPages = Math.ceil(allRosterPlayers.length / playersPerPage);
  const startIndex = (currentRosterPage - 1) * playersPerPage;
  const endIndex = startIndex + playersPerPage;
  const paginatedPlayers = allRosterPlayers.slice(startIndex, endIndex);
  
  // Create player cards
  const playerCards = paginatedPlayers.map(player => createPlayerCard(player)).join('');
  
  // Create comparison status display
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
    <div class="roster-pagination" style="flex-direction: row;">
      <button id="prevRosterPage" class="pagination-btn">Prev</button>
      <span id="rosterPageInfo" class="page-info"></span>
      <button id="nextRosterPage" class="pagination-btn">Next</button>
    </div>
  `;
  
  updateRosterPaginationControls(totalPages);
  setupRosterPaginationHandlers();
}

function createPlayerCard(player) {
  const fullName = player.person.fullName;
  const nameParts = fullName.split(' ');
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ');
  const jerseyNumber = player.jerseyNumber || '--';
  const position = player.position.abbreviation;
  const headshotUrl = player.person.id ? 
    `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.person.id}/headshot/67/current` : 
    'icon.png';
  
  return `
    <div class="player-card" data-player-id="${player.person.id}" onclick="showPlayerDetails(${player.person.id})">
      <img src="${headshotUrl}" alt="${firstName} ${lastName}" class="player-headshot" onerror="this.src='icon.png';">
      <div class="player-name-column">
        <div class="player-first-name">${firstName}</div>
        <div class="player-last-name">${lastName}</div>
      </div>
      <div class="player-number">#${jerseyNumber}</div>
      <div class="player-position">${position}</div>
    </div>
  `;
}

function updateRosterPaginationControls(totalPages) {
  const prevBtn = document.getElementById('prevRosterPage');
  const nextBtn = document.getElementById('nextRosterPage');
  const pageInfo = document.getElementById('rosterPageInfo');
  
  if (prevBtn && nextBtn && pageInfo) {
    prevBtn.disabled = currentRosterPage <= 1;
    nextBtn.disabled = currentRosterPage >= totalPages || totalPages === 0;
    
    if (totalPages === 0) {
      pageInfo.textContent = '';
    } else {
      pageInfo.textContent = `Page ${currentRosterPage} of ${totalPages}`;
    }
  }
}

function setupRosterPaginationHandlers() {
  const prevBtn = document.getElementById('prevRosterPage');
  const nextBtn = document.getElementById('nextRosterPage');
  
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentRosterPage > 1) {
        currentRosterPage--;
        displayRosterPlayers();
      }
    });
  }
  
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(allRosterPlayers.length / playersPerPage);
      if (currentRosterPage < totalPages) {
        currentRosterPage++;
        displayRosterPlayers();
      }
    });
  }
}

async function showPlayerDetails(playerId) {
  try {
    // Reset stats mode to overall when opening a new player modal
    currentStatsMode = 'overall';
    
    // Find the player in the roster
    selectedPlayer = allRosterPlayers.find(player => player.person.id === playerId);
    
    if (!selectedPlayer) return;
    
    const firstName = selectedPlayer.person.firstName || '';
    const lastName = selectedPlayer.person.lastName || '';
    const fullName = selectedPlayer.person.fullName || `${firstName} ${lastName}`;
    const jerseyNumber = selectedPlayer.jerseyNumber || '--';
    const position = selectedPlayer.position.abbreviation; // Use abbreviation instead of name
    const headshotUrl = selectedPlayer.person.id ? 
      `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${selectedPlayer.person.id}/headshot/67/current` : 
      'icon.png';

    console.log('Player debug:', { fullName, firstName, lastName, jerseyNumber, position, playerId: selectedPlayer.person.id });

    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'playerDetailsSection'; // Add the ID here
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
      <img src="${headshotUrl}" alt="${fullName}" 
           style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover;" 
           onerror="this.src='icon.png';">
      <div>
        <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 5px;">
          ${fullName}
        </div>
        <div style="font-size: 1.1rem; color: #777;">
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
        // Get all MLB players for league-wide search
        const allPlayers = await fetchAllMLBPlayers();
        const selectedPlayerIsPitcher = selectedPlayer.position.code === "1";
        
        const filteredPlayers = allPlayers
          .filter(player => {
            const fullName = `${player.firstName || ''} ${player.lastName || ''}`.toLowerCase();
            const displayName = (player.displayName || '').toLowerCase();
            const teamName = (player.team || '').toLowerCase();
            const playerIsPitcher = player.positionCode === "1";
            
            // Check if query matches player name first (prioritize name over team)
            const nameMatch = fullName.includes(query) || displayName.includes(query);
            const teamMatch = teamName.includes(query);
            
            // For position matching, handle TWP players and regular players
            let positionMatch = false;
            if (selectedPlayerIsPitcher) {
              // If selected player is pitcher, show other pitchers (including TWP pitchers)
              positionMatch = playerIsPitcher;
            } else {
              // If selected player is hitter, show other hitters (including TWP hitters)
              positionMatch = !playerIsPitcher;
            }
            
            // Exclude self (use originalId for TWP players if available)
            const playerId = player.originalId || player.id;
            const excludeSelf = playerId !== selectedPlayer.person.id;
            
            // Prioritize name matches over team matches
            return (nameMatch || teamMatch) && excludeSelf && positionMatch;
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

        console.log('Filtered players for comparison:', filteredPlayers.length, 'Selected player is pitcher:', selectedPlayerIsPitcher);

        if (filteredPlayers.length > 0) {
          searchResults.innerHTML = filteredPlayers.map(player => `
            <div class="search-result-item" data-player-id="${player.id}" data-original-id="${player.originalId || player.id}" style="
              padding: 10px;
              cursor: pointer;
              border-bottom: 1px solid #eee;
              display: flex;
              align-items: center;
              gap: 10px;
              transition: background-color 0.2s ease;
            " onmouseover="this.style.backgroundColor='#f0f0f0'" onmouseout="this.style.backgroundColor='white'">
              <img src="${player.headshot}" alt="${player.displayName}" 
                   style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;" 
                   onerror="this.src='icon.png';">
              <div>
                <div style="font-weight: bold; color: #333;">${player.displayName}${player.isTwoWayPlayer ? ` (${player.twoWayRole})` : ''}</div>
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
              
              const playerId = item.getAttribute('data-player-id');
              const originalId = item.getAttribute('data-original-id');
              
              // Get the player from the filtered results using the index
              const player = filteredPlayers[index];
              
              console.log('Clicked player:', player);
              console.log('Player ID from data:', playerId);
              console.log('Original ID from data:', originalId);
              
              if (player) {
                // Parse the display name properly to get firstName and lastName
                const displayName = player.displayName || `${player.firstName || ''} ${player.lastName || ''}`.trim();
                const nameParts = displayName.split(' ');
                const parsedFirstName = player.firstName || (nameParts.length > 1 ? nameParts[0] : '');
                const parsedLastName = player.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0]);
                
                const playerForComparison = {
                  id: originalId || player.id, // Use original ID for stats API
                  firstName: parsedFirstName,
                  lastName: parsedLastName,
                  fullName: displayName,
                  jersey: player.jersey || 'N/A',
                  position: player.position || 'N/A',
                  headshot: player.headshot || 'icon.png',
                  isTwoWayPlayer: player.isTwoWayPlayer || false,
                  twoWayRole: player.twoWayRole || null
                };
                
                console.log('Player for comparison:', playerForComparison);
                console.log('Parsed names - First:', parsedFirstName, 'Last:', parsedLastName);
                
                // Close current modal
                document.body.removeChild(modal);
                
                // Start comparison
                // Parse the current player's name properly
                const currentPlayerDisplayName = fullName;
                const currentPlayerNameParts = currentPlayerDisplayName.split(' ');
                const currentPlayerFirstName = firstName || (currentPlayerNameParts.length > 1 ? currentPlayerNameParts[0] : '');
                const currentPlayerLastName = lastName || (currentPlayerNameParts.length > 1 ? currentPlayerNameParts.slice(1).join(' ') : currentPlayerNameParts[0]);
                
                // Normalize position format to match the search results
                let normalizedPosition = position;
                if (selectedPlayer.position.code === "1") {
                  normalizedPosition = "P"; // Ensure pitchers are consistently "P"
                }
                
                const currentPlayerForComparison = {
                  id: selectedPlayer.person.id,
                  firstName: currentPlayerFirstName,
                  lastName: currentPlayerLastName,
                  fullName: fullName,
                  jersey: jerseyNumber,
                  position: normalizedPosition,
                  headshot: headshotUrl,
                  isTwoWayPlayer: false, // Roster players don't have TWP info, default to false
                  twoWayRole: null // Roster players don't have TWP info, default to null
                };
                
                console.log('Current player for comparison:', currentPlayerForComparison);
                console.log('Current player parsed names - First:', currentPlayerFirstName, 'Last:', currentPlayerLastName);
                
                playersForComparison = [currentPlayerForComparison, playerForComparison];
                console.log('Starting comparison with:', currentPlayerForComparison, playerForComparison);
                showPlayerComparison(currentPlayerForComparison, playerForComparison);
              } else {
                console.error('Player not found in filtered results');
              }
            });
          });
        } else {
          const positionText = selectedPlayerIsPitcher ? 'pitchers' : 'hitters';
          searchResults.innerHTML = `<div style="padding: 10px; color: #777; text-align: center;">No ${positionText} found</div>`;
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
  background-color: ${teamColors[currentTeam?.name] || '#dc3545'}; /* red fallback */
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

    // Assemble modal
    modalContent.appendChild(closeButton);
    modalContent.appendChild(playerHeader);
    modalContent.appendChild(statsContainer);
    modalContent.appendChild(sliderSection);
    modalContent.appendChild(searchSection);
    modal.appendChild(modalContent);

    // Add modal to document
    document.body.appendChild(modal);

    // Load initial stats
    const currentYear = new Date().getFullYear();
    await loadPlayerStatsForModal(playerId, currentYear, statsContainer, '');

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });

  } catch (error) {
    console.error('Error loading player details:', error);
  }
}

// Game log functionality
async function showGameLogInterface() {
  console.log('showGameLogInterface called');
  
  // Find the stats container - it's the 3rd element added to modalContent
  const modal = document.querySelector('#playerDetailsSection');
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
  
  // Get today's date using MLB's adjusted date logic (same as box score)
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
  
  const todayString = getAdjustedDateForMLB();
  
  statsContainer.innerHTML = `
<div style="text-align: center; margin-bottom: 30px;">
  <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; border: 1px solid #ddd; display: inline-flex; align-items: center; gap: 12px;">
    <div style="font-weight: bold; color: #333;">Select a game date:</div>
    <input type="date" id="gameLogDatePicker" value="${todayString}" style="padding: 12px 16px; border: 2px solid ${teamColors[currentTeam?.name] || '#007bff'}; border-radius: 8px; font-size: 16px; outline: none; cursor: pointer; background: white; color: #333; width: 200px; font-weight: 500;">
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
  const modal = document.querySelector('#playerDetailsSection');
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
  const currentYear = new Date().getFullYear();
  await loadPlayerStatsForModal(selectedPlayer.person.id, currentYear, statsContainer, '');
}

async function loadGameLogForDate(date) {
  const resultsContainer = document.getElementById('gameLogResults');
  if (!resultsContainer || !selectedPlayer) return;

  try {
    resultsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;"><div style="display: inline-block; width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #333; border-radius: 50%; animation: spin 1s linear infinite;"></div><br>Loading game data...</div>';

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
      
      // MLB season runs from MAR/APR to OCT/NOV
      // If the date is from NOV 1 to FEB 28/29, it belongs to the off-season
      if (selectedMonth >= 11 || selectedMonth <= 2) {
        return selectedYear; // Off-season, use current year as season identifier
      } 
      // If the date is from MAR 1 to OCT 31, it belongs to the season of that year
      else {
        return selectedYear; // Season year
      }
    }
    
    const seasonYear = getSeasonYearForDate(date);
    console.log(`Selected date: ${date}, calculated season year: ${seasonYear}`);
    
    // Get the player's team for the specific season year
    let teamIdForSeason = currentTeamId; // Default to current team
    try {
      console.log(`Fetching player's team for season ${seasonYear}...`);
      const playerSeasonResponse = await fetch(`https://statsapi.mlb.com/api/v1/people/${selectedPlayer.person.id}/stats?stats=season&group=hitting&season=${seasonYear}`);
      
      if (playerSeasonResponse.ok) {
        const playerSeasonData = await playerSeasonResponse.json();
        // MLB API structure: stats[0].splits[0].team.id
        if (playerSeasonData.stats && playerSeasonData.stats.length > 0 && 
            playerSeasonData.stats[0].splits && playerSeasonData.stats[0].splits.length > 0 &&
            playerSeasonData.stats[0].splits[0].team) {
          teamIdForSeason = playerSeasonData.stats[0].splits[0].team.id.toString();
          console.log(`Player was on team ${teamIdForSeason} during ${seasonYear} season`);
        }
      } else {
        console.log(`Could not fetch player's team for season ${seasonYear}, using current team`);
      }
    } catch (error) {
      console.log(`Error fetching player's season team:`, error);
      console.log(`Using current team ${currentTeamId} as fallback`);
    }

    // Find games for the selected date using the season-specific team ID
    const scheduleResponse = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&teamId=${teamIdForSeason}&hydrate=linescore,team`);
    
    if (!scheduleResponse.ok) {
      throw new Error(`HTTP error! status: ${scheduleResponse.status}`);
    }
    
    const scheduleData = await scheduleResponse.json();

    if (!scheduleData.dates || scheduleData.dates.length === 0) {
      resultsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; background: #f8f9fa; border-radius: 8px; border: 1px solid #ddd;">
          <div style="font-size: 1.2rem; color: #777; margin-bottom: 10px;">📅</div>
          <div style="color: #777; font-size: 1rem;">No games found for this date</div>
          <div style="color: #999; font-size: 0.9rem; margin-top: 5px;">Try selecting a different date during the season</div>
        </div>
      `;
      return;
    }

    const games = scheduleData.dates[0].games;
    if (games.length === 0) {
      resultsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; background: #f8f9fa; border-radius: 8px; border: 1px solid #ddd;">
          <div style="font-size: 1.2rem; color: #777; margin-bottom: 10px;">📅</div>
          <div style="color: #777; font-size: 1rem;">No games found for this date</div>
          <div style="color: #999; font-size: 0.9rem; margin-top: 5px;">Try selecting a different date during the season</div>
        </div>
      `;
      return;
    }

    // Get the game for this team
    const game = games[0]; // Should only be one game per team per day
    const gamePk = game.gamePk;

    // Check if game is scheduled but not yet played
    if (['Scheduled', 'Pre-Game', 'Warmup', 'Postponed', 'Suspended'].includes(game.status.detailedState)) {
      const gameDate = new Date(game.gameDate);
      const opponent = game.teams.home.team.id === parseInt(teamIdForSeason) ? game.teams.away.team : game.teams.home.team;
      const isHomeGame = game.teams.home.team.id === parseInt(teamIdForSeason);
      
      resultsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; background: #fff3cd; border-radius: 8px; border: 1px solid #ffeaa7;">
          <div style="font-size: 1.2rem; color: #856404; margin-bottom: 10px;">⏰</div>
          <div style="color: #856404; font-size: 1rem; margin-bottom: 5px;">Game ${game.status.detailedState}</div>
          <div style="color: #856404; font-size: 0.9rem;">
            ${isHomeGame ? 'vs' : 'at'} ${opponent.name}<br>
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

    // Fetch the boxscore for this game
    const boxscoreResponse = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
    
    if (!boxscoreResponse.ok) {
      throw new Error(`HTTP error! status: ${boxscoreResponse.status}`);
    }
    
    const boxscoreData = await boxscoreResponse.json();

    if (!boxscoreData.liveData || !boxscoreData.liveData.boxscore) {
      resultsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; background: #f8d7da; border-radius: 8px; border: 1px solid #f5c6cb;">
          <div style="font-size: 1.2rem; color: #721c24; margin-bottom: 10px;">⚠️</div>
          <div style="color: #721c24; font-size: 1rem;">No boxscore data available</div>
          <div style="color: #721c24; font-size: 0.9rem; margin-top: 5px;">This game may not have detailed statistics available</div>
        </div>
      `;
      return;
    }

    await displayPlayerGameStats(boxscoreData, game, teamIdForSeason);

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

async function displayPlayerGameStats(boxscoreData, game, teamIdForSeason) {
  const resultsContainer = document.getElementById('gameLogResults');
  if (!resultsContainer || !selectedPlayer) return;

  const boxscore = boxscoreData.liveData.boxscore;
  const isHomeTeam = boxscoreData.gameData.teams.home.id === parseInt(teamIdForSeason);
  const teamBoxscore = isHomeTeam ? boxscore.teams.home : boxscore.teams.away;
  const opponentBoxscore = isHomeTeam ? boxscore.teams.away : boxscore.teams.home;
  
  // Find the player in the boxscore
  const playerId = selectedPlayer.person.id;
  const playerKey = `ID${playerId}`;
  const playerData = teamBoxscore.players[playerKey];

  if (!playerData) {
    const gameDate = new Date(game.gameDate);
    const opponent = isHomeTeam ? boxscoreData.gameData.teams.away : boxscoreData.gameData.teams.home;
    
    resultsContainer.innerHTML = `
      <div style="border: 1px solid #ddd; border-radius: 12px; padding: 40px; background: #f8f9fa; text-align: center;">
        <div style="font-size: 2rem; margin-bottom: 15px;">�</div>
        <div style="color: #777; font-size: 1.1rem; margin-bottom: 15px; font-weight: 500;">
          No box score data for this game
        </div>
        <div style="color: #999; font-size: 0.95rem; line-height: 1.4;">
          ${selectedPlayer.person.fullName} did not appear in this game<br>
          <strong>${gameDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong><br>
          ${isHomeTeam ? 'vs' : 'at'} ${opponent.teamName || opponent.name}
        </div>
      </div>
    `;
    return;
  }

  // Get opponent info and team logos using season-specific team data
  const opponent = isHomeTeam ? boxscoreData.gameData.teams.away : boxscoreData.gameData.teams.home;
  const opponentLogo = await getLogoUrl(opponent.name);
  
  // Get team logo for the season-specific team
  const playerTeamForSeason = isHomeTeam ? boxscoreData.gameData.teams.home : boxscoreData.gameData.teams.away;
  const teamLogo = await getLogoUrl(playerTeamForSeason.name);

  console.log(`Player team for this game: ${playerTeamForSeason.name} (ID: ${playerTeamForSeason.id})`);
  console.log(`Opponent team: ${opponent.name} (ID: ${opponent.id})`);

  // Game info
  const gameDate = new Date(game.gameDate);
  const gameStatus = game.status.detailedState;
  const teamScore = isHomeTeam ? game.teams.home.score : game.teams.away.score;
  const opponentScore = isHomeTeam ? game.teams.away.score : game.teams.home.score;
  
  let gameResult = '';
  if (['Final', 'Game Over', 'Completed Early'].includes(gameStatus)) {
    gameResult = teamScore > opponentScore ? 'W' : 'L';
  }

  // Check if player has batting or pitching stats
  const hasBattingStats = playerData.stats.batting && Object.keys(playerData.stats.batting).length > 0;
  const hasPitchingStats = playerData.stats.pitching && Object.keys(playerData.stats.pitching).length > 0;

  if (!hasBattingStats && !hasPitchingStats) {
    resultsContainer.innerHTML = `
      <div style="border: 1px solid #ddd; border-radius: 12px; padding: 40px; background: #f8f9fa; text-align: center;">
        <div style="font-size: 2rem; margin-bottom: 15px;">📊</div>
        <div style="color: #777; font-size: 1.1rem; margin-bottom: 15px; font-weight: 500;">
          No box score data for this game
        </div>
        <div style="color: #999; font-size: 0.95rem; line-height: 1.4;">
          ${selectedPlayer.person.fullName} was on the roster but did not record any statistics<br>
          <strong>${gameDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong><br>
          ${isHomeTeam ? 'vs' : 'at'} ${opponent.teamName || opponent.name}
        </div>
      </div>
    `;
    return;
  }

  // Create the game stats display similar to the second image
  let content = `
    <div id="gameLogCard_${game.gamePk}" style="background: #1a1a1a; color: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; position: relative; max-width: 100%; box-sizing: border-box;">
      <!-- Clipboard Icon -->
      <div style="position: absolute; top: 12px; right: 12px; cursor: pointer; background: rgba(255,255,255,0.1); border-radius: 6px; padding: 6px; transition: background-color 0.2s ease;" onclick="copyGameLogAsImage('gameLogCard_${game.gamePk}')" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.2)'" onmouseout="this.style.backgroundColor='rgba(255,255,255,0.1)'" title="Copy game log as image">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
          <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/>
        </svg>
      </div>
      
      <!-- Player Header -->
      <div style="display: flex; align-items: center; margin-bottom: 18px; gap: 12px;">
        <div style="width: 60px; height: 60px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: #333; position: relative;">
          <img src="${selectedPlayer.person.id ? 
            `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${selectedPlayer.person.id}/headshot/67/current` : 
            'icon.png'}" 
            alt="${selectedPlayer.person.fullName}" 
            style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%; height: auto; min-height: 100%; object-fit: cover;" 
            onerror="this.src='icon.png';" 
            crossorigin="anonymous">
        </div>
        <div style="flex: 1;">
          <div style="font-size: 1.3rem; font-weight: bold; margin-bottom: 2px;">${selectedPlayer.person.fullName}</div>
          <div style="color: #ccc; font-size: 0.9rem;">#${selectedPlayer.jerseyNumber || '--'} | ${selectedPlayer.position.abbreviation}</div>
        </div>
      </div>

      <!-- Game Header -->
      <div id="gameHeader_${game.gamePk}" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding: 12px; background: rgba(255,255,255,0.1); border-radius: 8px; cursor: pointer; transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.15)'" onmouseout="this.style.backgroundColor='rgba(255,255,255,0.1)'" onclick="window.open('scoreboard.html?gamePk=${game.gamePk}', '_blank')">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <img src="${teamLogo}" alt="${currentTeam.name}" style="max-width: 100%; max-height: 100%; object-fit: contain;" onerror="this.src='icon.png';" crossorigin="anonymous">
          </div>
          <span style="font-size: 1rem; font-weight: bold; color: ${parseInt(teamScore) > parseInt(opponentScore)  ? '#fff' : '#ccc'};">${teamScore}</span>
          <span style="color: #ccc; font-size: 0.9rem;">vs</span>
          <span style="font-size: 1rem; font-weight: bold; color: ${parseInt(opponentScore) > parseInt(teamScore) ? '#fff' : '#ccc'};">${opponentScore}</span>
          <div style="width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <img src="${opponentLogo}" alt="${opponent.name}" style="max-width: 100%; max-height: 100%; object-fit: contain;" onerror="this.src='icon.png';" crossorigin="anonymous">
          </div>
          ${gameResult ? `<span style="font-weight: bold; color: ${gameResult === 'W' ? '#4CAF50' : '#f44336'}; font-size: 1rem;">${gameResult}</span>` : ''}
        </div>
        <div style="text-align: right; color: #ccc; font-size: 0.8rem;">
          ${gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          <div class="game-details-text" style="font-size: 0.7rem; margin-top: 2px; opacity: 0.7;">Click to view game details</div>
        </div>
      </div>
  `;

  // Show batting stats if available
  if (hasBattingStats) {
    const battingStats = playerData.stats.batting;
    content += `
      <!-- Batting Stats -->
      <div style="margin-bottom: 15px;">
        <div style="font-size: 1.2rem; font-weight: bold; margin-bottom: 12px; color: #4CAF50;">⚾ Batting</div>
        
        <!-- Responsive layout with CSS media queries -->
        <style>
          .batting-stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 12px;
          }
          
          @media (min-width: 768px) {
            .batting-stats-desktop-row1 {
              grid-template-columns: repeat(5, 1fr) !important;
              gap: 15px !important;
              margin-bottom: 20px !important;
              max-width: 100% !important;
            }
            .batting-stats-desktop-row2 {
              grid-template-columns: repeat(4, 1fr) !important;
              gap: 15px !important;
              max-width: 80% !important;
              margin: 0 auto !important;
            }
            .batting-mobile-only {
              display: none !important;
            }
          }
          
          @media (max-width: 767px) {
            .batting-desktop-only {
              display: none !important;
            }
          }
        </style>
        
        <!-- Desktop: 5 stats in first row -->
        <div class="batting-stats-grid batting-stats-desktop-row1 batting-desktop-only">
          <div style="text-align: center;">
            <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${battingStats.hits || 0}/${battingStats.atBats || 0}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">H/AB</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${battingStats.runs || 0}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">R</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${battingStats.rbi || 0}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">RBI</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${battingStats.homeRuns || 0}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">HR</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${battingStats.baseOnBalls || 0}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">BB</div>
          </div>
        </div>
        
        <!-- Desktop: 4 stats in second row -->
        <div class="batting-stats-grid batting-stats-desktop-row2 batting-desktop-only">
          <div style="text-align: center;">
            <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${battingStats.strikeOuts || 0}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">SO</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${battingStats.totalBases || '0'}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">TB</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${battingStats.stolenBases || '0'}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">SB</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${battingStats.leftOnBase || '0'}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">LOB</div>
          </div>
        </div>
        
        <!-- Mobile: 3 stats per row -->
        <div class="batting-mobile-only">
          <div class="batting-stats-grid">
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${battingStats.hits || 0}/${battingStats.atBats || 0}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">H/AB</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${battingStats.runs || 0}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">R</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${battingStats.rbi || 0}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">RBI</div>
            </div>
          </div>
          <div class="batting-stats-grid">
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${battingStats.homeRuns || 0}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">HR</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${battingStats.baseOnBalls || 0}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">BB</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${battingStats.strikeOuts || 0}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">SO</div>
            </div>
          </div>
          <div class="batting-stats-grid" style="margin-bottom: 0;">
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${battingStats.totalBases || '0'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">TB</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${battingStats.stolenBases || '0'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">SB</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${battingStats.leftOnBase || '0'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">LOB</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Show pitching stats if available
  if (hasPitchingStats) {
    const pitchingStats = playerData.stats.pitching;
    content += `
      <!-- Pitching Stats -->
      <div>
        <div style="font-size: 1.2rem; font-weight: bold; margin-bottom: 12px; color: #FF9800;">🥎 Pitching</div>
        
        <!-- Responsive layout with CSS media queries -->
        <style>
          .pitching-stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 12px;
          }
          
          @media (min-width: 768px) {
            .pitching-stats-desktop-row1 {
              grid-template-columns: repeat(5, 1fr) !important;
              gap: 15px !important;
              margin-bottom: 20px !important;
              max-width: 100% !important;
            }
            .pitching-stats-desktop-row2 {
              grid-template-columns: repeat(4, 1fr) !important;
              gap: 15px !important;
              max-width: 80% !important;
              margin: 0 auto !important;
            }
            .pitching-mobile-only {
              display: none !important;
            }
          }
          
          @media (max-width: 767px) {
            .pitching-desktop-only {
              display: none !important;
            }
          }
        </style>
        
        <!-- Desktop: 5 stats in first row -->
        <div class="pitching-stats-grid pitching-stats-desktop-row1 pitching-desktop-only">
          <div style="text-align: center;">
            <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${pitchingStats.inningsPitched || '0.0'}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">IP</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${pitchingStats.hits || 0}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">H</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${pitchingStats.runs || 0}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">R</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${pitchingStats.earnedRuns || 0}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">ER</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${pitchingStats.baseOnBalls || 0}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">BB</div>
          </div>
        </div>
        
        <!-- Desktop: 4 stats in second row -->
        <div class="pitching-stats-grid pitching-stats-desktop-row2 pitching-desktop-only" style="margin-bottom: 0;">
          <div style="text-align: center;">
            <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${pitchingStats.strikeOuts || 0}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">K</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${pitchingStats.pitchesThrown || '0'}-${pitchingStats.strikes || '0'}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">P-ST</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${pitchingStats.strikePercentage || '0.00'}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">K%</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${pitchingStats.outs || '0'}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">O</div>
          </div>
        </div>
        
        <!-- Mobile: 3 stats per row -->
        <div class="pitching-mobile-only">
          <div class="pitching-stats-grid">
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${pitchingStats.inningsPitched || '0.0'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">IP</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${pitchingStats.hits || 0}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">H</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${pitchingStats.runs || 0}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">R</div>
            </div>
          </div>
          <div class="pitching-stats-grid">
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${pitchingStats.earnedRuns || 0}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">ER</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${pitchingStats.baseOnBalls || 0}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">BB</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${pitchingStats.strikeOuts || 0}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">K</div>
            </div>
          </div>
          <div class="pitching-stats-grid" style="margin-bottom: 0;">
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${pitchingStats.pitchesThrown || '0'}-${pitchingStats.strikes || '0'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">P-ST</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${pitchingStats.strikePercentage || '0.00'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">K%</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: bold; color: #fff;">${pitchingStats.outs || '0'}</div>
              <div style="font-size: 0.9rem; color: #ccc; margin-top: 4px;">O</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  content += '</div>';

  resultsContainer.innerHTML = content;
}

// Function to copy player stats as image
// Function to copy player stats as image
window.copyPlayerStatsAsImage = async function() {
  try {
    const cardElement = document.getElementById('playerStatsCard');
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

// Function to capture player stats as image (for download)
window.capturePlayerStatsAsImage = async function(element) {
  try {
    showFeedback('Capturing player statistics...', 'loading');

    // Get the modal to access player information
    const modal = document.querySelector('.modal-overlay');
    if (!modal) {
      showFeedback('Player information not found', 'error');
      return;
    }

    // Extract player information from selectedPlayer (more reliable than modal structure)
    const playerName = selectedPlayer.person.fullName || selectedPlayer.person.firstName + ' ' + selectedPlayer.person.lastName;
    const jerseyNumber = playerJerseyForYear || selectedPlayer.jerseyNumber || selectedPlayer.number || 'N/A';
    const position = playerPositionForYear || selectedPlayer.position.abbreviation || selectedPlayer.position.name || 'N/A';
    const teamName = playerTeamForYear?.name || currentTeam?.name || 'Unknown Team';
    const teamAbbr = playerTeamAbbr || currentTeam?.abbreviation || currentTeam?.shortDisplayName || 'UNK';

    // Get player headshot URL
    const playerHeadshotUrl = selectedPlayer.person.id ?
      `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${selectedPlayer.person.id}/headshot/67/current` :
      'icon.png';

    // Get the selected year from the year selector or use current year
    const yearSelector = document.getElementById('modalYearSelector');
    const selectedYear = yearSelector ? yearSelector.value : new Date().getFullYear();

    // Get team logo
    const teamLogo = await getTeamLogo(playerTeamForYear || currentTeam);

    // Create a styled container specifically for the image capture
    const captureContainer = document.createElement('div');
    captureContainer.style.cssText = `
      background: linear-gradient(135deg, ${playerTeamColor || '#1a1a1a'} 0%, ${playerTeamColor ? playerTeamColor + '88' : '#333'} 100%);
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
        <div style="width: 80px; height: 80px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: #333; position: relative; margin-right: 20px;">
          <img src="${playerHeadshotUrl}" alt="${playerName}" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%; height: auto; min-height: 100%; object-fit: cover; onerror="this.src='icon.png';">
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

    // Remove "Year:" labels from the cloned content
    const yearLabels = statsContent.querySelectorAll('label');
    yearLabels.forEach(label => {
      if (label.textContent.includes('Year:')) {
        label.remove();
      }
    });

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
      statsGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
      statsGrid.style.gap = '15px';
    }

    // Style individual stat cards for better image appearance
    const statCards = statsContent.querySelectorAll('[style*="background: #f8f9fa"]');
    statCards.forEach(card => {
      card.style.background = 'rgba(255,255,255,0.15)';
      card.style.border = '1px solid rgba(255,255,255,0.2)';
      card.style.color = 'white';
    });

    // Style stat labels (AVG, HR, RBI, etc.) to be white
    const statLabels = statsContent.querySelectorAll('[style*="color: #777"]');
    statLabels.forEach(label => {
      label.style.color = 'white';
    });

    // Style competition sections
    const competitionSections = statsContent.querySelectorAll('[style*="background: #f8f9fa"][style*="border: 1px solid #ddd"]');
    competitionSections.forEach(section => {
      section.style.background = 'rgba(255,255,255,0.1)';
      section.style.border = '1px solid rgba(255,255,255,0.2)';
      section.style.color = 'white';
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
      if (textEl.style.color === 'rgb(51, 51, 51)' || textEl.style.color === 'rgb(119, 119, 119)') {
        textEl.style.color = 'white';
      }
    });

    // Style stat rankings to be white
    const rankings = statsContent.querySelectorAll('[style*="color: #28a745"]');
    rankings.forEach(ranking => {
      ranking.style.color = 'white';
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
    watermark.textContent = `${selectedYear} Season Stats`;
    captureContainer.appendChild(watermark);

    // Add to document temporarily for capture
    document.body.appendChild(captureContainer);

    // Replace all external images with base64 versions or remove them
    const images = captureContainer.querySelectorAll('img');
    for (const img of images) {
      try {
        if (img.src.includes('espncdn.com') || img.src.includes('mlbstatic.com') || img.src.includes('http')) {
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
      scale: 3, // Use scale 3 to avoid logo scaling issues like game log
      useCORS: true,
      allowTaint: false,
      logging: false,
      width: 600,
      height: captureContainer.scrollHeight + 32, // Add height adjustment to prevent clipping
      scrollX: 0,
      scrollY: 0,
      windowWidth: 600,
      windowHeight: captureContainer.scrollHeight + 32
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
};

// Helper function to get team color
function getTeamColor() {
  return teamColors[currentTeam?.name] || teamColors[currentTeam?.abbreviation] || '#0066cc';
}

// Helper function to get team logo
async function getTeamLogo(team = null) {
  const teamToUse = team || currentTeam;
  if (teamToUse) {
    return await getLogoUrl(teamToUse.name);
  }
  return 'icon.png';
}

// Helper function to build API URL with date range support
function buildStatsApiUrl(playerId, group, year, selectedMonth) {
  const baseUrl = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats`;
  if (selectedMonth) {
    const daysInMonth = new Date(year, parseInt(selectedMonth), 0).getDate();
    const startDate = `${year}-${selectedMonth}-01`;
    const endDate = `${year}-${selectedMonth}-${daysInMonth.toString().padStart(2, '0')}`;
    return `${baseUrl}?stats=byDateRange&group=${group}&season=${year}&startDate=${startDate}&endDate=${endDate}`;
  } else {
    return `${baseUrl}?stats=season&group=${group}&season=${year}`;
  }
}

// Helper function to build league-wide stats URL with date range support
function buildLeagueStatsUrl(group, year, selectedMonth) {
  const baseUrl = `https://statsapi.mlb.com/api/v1/stats`;
  if (selectedMonth) {
    const daysInMonth = new Date(year, parseInt(selectedMonth), 0).getDate();
    const startDate = `${year}-${selectedMonth}-01`;
    const endDate = `${year}-${selectedMonth}-${daysInMonth.toString().padStart(2, '0')}`;
    return `${baseUrl}?stats=byDateRange&group=${group}&season=${year}&gameType=R&sportId=1&limit=2000&playerPool=all&startDate=${startDate}&endDate=${endDate}`;
  } else {
    return `${baseUrl}?stats=season&group=${group}&season=${year}&gameType=R&sportId=1&limit=2000&playerPool=all`;
  }
}

// Helper function to get month name
function getMonthName(monthNumber) {
  const months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[parseInt(monthNumber)] || '';
}

async function loadPlayerStatsForModal(playerId, year, container, selectedMonth = '') {
  try {
    // Determine player type based on position
    const playerPosition = selectedPlayer.position?.abbreviation || selectedPlayer.position?.name || '';
    const isPitcher = playerPosition.includes('P') || playerPosition === 'SP' || playerPosition === 'RP' || playerPosition === 'LHP' || playerPosition === 'RHP';
    
    // Check if player is a Two-Way Player by testing both hitting and pitching stats
    let isTwoWayPlayer = false;
    let twpHittingData = null;
    let twpPitchingData = null;
    let hasHittingStats = false;
    let hasPitchingStats = false;
    
    try {
      const [hittingTest, pitchingTest] = await Promise.all([
        fetch(buildStatsApiUrl(playerId, 'hitting', year, selectedMonth)),
        fetch(buildStatsApiUrl(playerId, 'pitching', year, selectedMonth))
      ]);
      
      if (hittingTest.ok && pitchingTest.ok) {
        [twpHittingData, twpPitchingData] = await Promise.all([
          hittingTest.json(),
          pitchingTest.json()
        ]);
        
        hasHittingStats = twpHittingData.stats && twpHittingData.stats.length > 0 && twpHittingData.stats[0].splits && twpHittingData.stats[0].splits.length > 0;
        hasPitchingStats = twpPitchingData.stats && twpPitchingData.stats.length > 0 && twpPitchingData.stats[0].splits && twpPitchingData.stats[0].splits.length > 0;
        
        // Consider a player TWP if they are positioned as TWP and have at least one type of stats
        const isPositionedAsTWP = playerPosition === 'TWP' || playerPosition.includes('TWP');
        isTwoWayPlayer = isPositionedAsTWP && (hasHittingStats || hasPitchingStats);
        
        console.log(`[MLB TWP DETECTION] Player ${selectedPlayer.person.fullName} - Position: ${playerPosition}, Hitting: ${hasHittingStats}, Pitching: ${hasPitchingStats}, TWP: ${isTwoWayPlayer}`);
      }
    } catch (error) {
      console.log(`[MLB TWP DETECTION] Error checking TWP status:`, error);
    }
    
    // Fetch player's team information for the selected year
    playerTeamForYear = null;
    playerTeamColor = getTeamColor(); // Default to current team color
    playerTeamAbbr = currentTeam?.abbreviation || currentTeam?.shortDisplayName || 'UNK';
    playerJerseyForYear = selectedPlayer.jerseyNumber || 'N/A';
    playerPositionForYear = selectedPlayer.position?.abbreviation || selectedPlayer.position?.name || 'N/A';
    
    try {
      console.log(`[MLB TEAM INFO] Fetching player's team for season ${year}...`);
      
      // Try to get team information from the player's season stats
      let playerSeasonResponse;
      if (isTwoWayPlayer && twpHittingData) {
        // For TWP players, use the already fetched hitting data
        playerSeasonResponse = { ok: true, json: () => Promise.resolve(twpHittingData) };
      } else if (isTwoWayPlayer) {
        // Fallback: fetch hitting data for team information
        playerSeasonResponse = await fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=hitting&season=${year}`);
      } else if (isPitcher) {
        // For pitchers, we need to fetch hitting stats to get team info (since pitchers don't always have hitting stats)
        playerSeasonResponse = await fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=hitting&season=${year}`);
      } else {
        // For regular hitters, fetch hitting stats to get team info
        playerSeasonResponse = await fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=hitting&season=${year}`);
      }
      
      if (playerSeasonResponse && playerSeasonResponse.ok) {
        const playerSeasonData = playerSeasonResponse.json ? await playerSeasonResponse.json() : playerSeasonResponse;
        
        // MLB API structure: stats[0].splits[0].team
        if (playerSeasonData.stats && playerSeasonData.stats.length > 0 && 
            playerSeasonData.stats[0].splits && playerSeasonData.stats[0].splits.length > 0 &&
            playerSeasonData.stats[0].splits[0].team) {
          
          const seasonTeam = playerSeasonData.stats[0].splits[0].team;
          playerTeamForYear = seasonTeam;
          console.log(`[MLB TEAM INFO] Player's team data for ${year}:`, seasonTeam);
          console.log(`[MLB TEAM INFO] Team name: "${seasonTeam.name}", abbreviation: "${seasonTeam.abbreviation}"`);
          
          // Get team color and abbreviation
          playerTeamColor = teamColors[seasonTeam.name] || teamColors[seasonTeam.abbreviation] || '#000000';
          playerTeamAbbr = seasonTeam.abbreviation || seasonTeam.shortDisplayName || seasonTeam.name;
          console.log(`[MLB TEAM INFO] Using team color: ${playerTeamColor}, abbreviation: ${playerTeamAbbr}`);
          
          // Try to get player-specific jersey and position for this team
          try {
            const rosterResponse = await fetch(`https://statsapi.mlb.com/api/v1/teams/${seasonTeam.id}/roster?season=${year}`);
            if (rosterResponse.ok) {
              const rosterData = await rosterResponse.json();
              const playerInRoster = rosterData.roster?.find(rosterPlayer => rosterPlayer.person.id === playerId);
              
              if (playerInRoster) {
                playerJerseyForYear = playerInRoster.jerseyNumber || playerJerseyForYear;
                playerPositionForYear = playerInRoster.position?.abbreviation || playerInRoster.position?.name || playerPositionForYear;
                
                console.log(`[MLB TEAM INFO] Found player in roster - Jersey: ${playerJerseyForYear}, Position: ${playerPositionForYear}`);
              }
            }
          } catch (rosterError) {
            console.log(`[MLB TEAM INFO] Could not fetch roster data:`, rosterError);
          }
        }
      } else {
        console.log(`[MLB TEAM INFO] Could not fetch player's team for season ${year}, using current team`);
      }
    } catch (error) {
      console.log(`[MLB TEAM INFO] Error fetching team information:`, error);
      // Fall back to current team info
    }
    
    // For TWP players, show both hitting and pitching stats
    if (isTwoWayPlayer) {
      // Use stored data from TWP detection, fetch league-wide stats for both season and monthly data
      const [allHittersResponse, allPitchersResponse] = await Promise.all([
        fetch(buildLeagueStatsUrl('hitting', year, selectedMonth)),
        fetch(buildLeagueStatsUrl('pitching', year, selectedMonth))
      ]);
      
      const [allHittersData, allPitchersData] = await Promise.all([
        allHittersResponse.json(),
        allPitchersResponse.json()
      ]);
      
      // Use the data we already fetched for TWP detection
      const hittingData = twpHittingData;
      const pitchingData = twpPitchingData;
      
      const teamColor = playerTeamColor;
      const headerText = selectedMonth ? `${year} ${getMonthName(selectedMonth)} Two-Way Player Statistics` : `${year} Two-Way Player Statistics`;
      
      const currentYear = new Date().getFullYear();
      const startYear = 2022;
      
      let content = `
        <div id="playerStatsCard" style="position: relative;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3 style="margin: 0; color: #333;" id="statsHeaderTitle">${headerText}</h3>
            <div style="display: flex; align-items: center; gap: 10px;">
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
              <select id="modalYearSelector" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
                ${Array.from({length: currentYear - startYear + 1}, (_, i) => currentYear - i).map(yearOption => 
                  `<option value="${yearOption}" ${yearOption === year ? 'selected' : ''}>${yearOption}</option>`
                ).join('')}
              </select>
              <select id="modalMonthSelector" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; margin-left: 5px;">
                <option value="" ${!selectedMonth ? 'selected' : ''}>--</option>
                <option value="01" ${selectedMonth === '01' ? 'selected' : ''}>JAN</option>
                <option value="02" ${selectedMonth === '02' ? 'selected' : ''}>FEB</option>
                <option value="03" ${selectedMonth === '03' ? 'selected' : ''}>MAR</option>
                <option value="04" ${selectedMonth === '04' ? 'selected' : ''}>APR</option>
                <option value="05" ${selectedMonth === '05' ? 'selected' : ''}>MAY</option>
                <option value="06" ${selectedMonth === '06' ? 'selected' : ''}>JUN</option>
                <option value="07" ${selectedMonth === '07' ? 'selected' : ''}>JUL</option>
                <option value="08" ${selectedMonth === '08' ? 'selected' : ''}>AUG</option>
                <option value="09" ${selectedMonth === '09' ? 'selected' : ''}>SEP</option>
                <option value="10" ${selectedMonth === '10' ? 'selected' : ''}>OCT</option>
                <option value="11" ${selectedMonth === '11' ? 'selected' : ''}>NOV</option>
                <option value="12" ${selectedMonth === '12' ? 'selected' : ''}>DEC</option>
              </select>
            </div>
          </div>
      `;
      
      // Show hitting stats if available
      if (hittingData.stats && hittingData.stats.length > 0 && hittingData.stats[0].splits && hittingData.stats[0].splits.length > 0) {
        const hittingSplit = hittingData.stats[0].splits[0];
        const hittingStats = hittingSplit.stat;
        const hittingRankings = calculatePlayerStatRankings(allHittersData, hittingStats);
        
        content += `
          <div style="margin-bottom: 30px;">
            <h4 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 5px;">Hitting Statistics</h4>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 15px;">
              <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 6px; padding: 12px; text-align: center;">
                <div style="font-size: 1.3rem; font-weight: bold; color: #333; margin-bottom: 5px;">${hittingStats.avg || '.000'}</div>
                <div style="font-size: 0.8rem; color: #777; margin-bottom: 3px;">AVG</div>
                ${hittingRankings.avg ? `<div style="font-size: 0.7rem; color: #28a745; font-weight: 500;">#${hittingRankings.avg} in MLB</div>` : ''}
              </div>
              <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 6px; padding: 12px; text-align: center;">
                <div style="font-size: 1.3rem; font-weight: bold; color: #333; margin-bottom: 5px;">${hittingStats.slg || '.000'}</div>
                <div style="font-size: 0.8rem; color: #777; margin-bottom: 3px;">SLG</div>
                ${hittingRankings.slg ? `<div style="font-size: 0.7rem; color: #28a745; font-weight: 500;">#${hittingRankings.slg} in MLB</div>` : ''}
              </div>
              <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 6px; padding: 12px; text-align: center;">
                <div style="font-size: 1.3rem; font-weight: bold; color: #333; margin-bottom: 5px;">${hittingStats.ops || '.000'}</div>
                <div style="font-size: 0.8rem; color: #777; margin-bottom: 3px;">OPS</div>
                ${hittingRankings.ops ? `<div style="font-size: 0.7rem; color: #28a745; font-weight: 500;">#${hittingRankings.ops} in MLB</div>` : ''}
              </div>
              <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 6px; padding: 12px; text-align: center;">
                <div style="font-size: 1.3rem; font-weight: bold; color: #333; margin-bottom: 5px;">${hittingStats.homeRuns || '0'}</div>
                <div style="font-size: 0.8rem; color: #777; margin-bottom: 3px;">HR</div>
                ${hittingRankings.homeRuns ? `<div style="font-size: 0.7rem; color: #28a745; font-weight: 500;">#${hittingRankings.homeRuns} in MLB</div>` : ''}
              </div>
              <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 6px; padding: 12px; text-align: center;">
                <div style="font-size: 1.3rem; font-weight: bold; color: #333; margin-bottom: 5px;">${hittingStats.rbi || '0'}</div>
                <div style="font-size: 0.8rem; color: #777; margin-bottom: 3px;">RBI</div>
                ${hittingRankings.rbi ? `<div style="font-size: 0.7rem; color: #28a745; font-weight: 500;">#${hittingRankings.rbi} in MLB</div>` : ''}
              </div>
              <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 6px; padding: 12px; text-align: center;">
                <div style="font-size: 1.3rem; font-weight: bold; color: #333; margin-bottom: 5px;">${hittingStats.hits || '0'}</div>
                <div style="font-size: 0.8rem; color: #777; margin-bottom: 3px;">H</div>
                ${hittingRankings.hits ? `<div style="font-size: 0.7rem; color: #28a745; font-weight: 500;">#${hittingRankings.hits} in MLB</div>` : ''}
              </div>
            </div>
          </div>
        `;
      }
      
      // Show pitching stats if available
      if (pitchingData.stats && pitchingData.stats.length > 0 && pitchingData.stats[0].splits && pitchingData.stats[0].splits.length > 0) {
        const pitchingSplit = pitchingData.stats[0].splits[0];
        const pitchingStats = pitchingSplit.stat;
        const pitchingRankings = calculatePitcherStatRankings(allPitchersData, pitchingStats);
        
        content += `
          <div>
            <h4 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 5px;">Pitching Statistics</h4>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 15px;">
              <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 6px; padding: 12px; text-align: center;">
                <div style="font-size: 1.3rem; font-weight: bold; color: #333; margin-bottom: 5px;">${pitchingStats.era || '0.00'}</div>
                <div style="font-size: 0.8rem; color: #777; margin-bottom: 3px;">ERA</div>
                ${pitchingRankings.era ? `<div style="font-size: 0.7rem; color: #28a745; font-weight: 500;">#${pitchingRankings.era} in MLB</div>` : ''}
              </div>
              <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 6px; padding: 12px; text-align: center;">
                <div style="font-size: 1.3rem; font-weight: bold; color: #333; margin-bottom: 5px;">${pitchingStats.whip || '0.00'}</div>
                <div style="font-size: 0.8rem; color: #777; margin-bottom: 3px;">WHIP</div>
                ${pitchingRankings.whip ? `<div style="font-size: 0.7rem; color: #28a745; font-weight: 500;">#${pitchingRankings.whip} in MLB</div>` : ''}
              </div>
              <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 6px; padding: 12px; text-align: center;">
                <div style="font-size: 1.3rem; font-weight: bold; color: #333; margin-bottom: 5px;">${pitchingStats.inningsPitched || '0.0'}</div>
                <div style="font-size: 0.8rem; color: #777; margin-bottom: 3px;">IP</div>
                ${pitchingRankings.inningsPitched ? `<div style="font-size: 0.7rem; color: #28a745; font-weight: 500;">#${pitchingRankings.inningsPitched} in MLB</div>` : ''}
              </div>
              <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 6px; padding: 12px; text-align: center;">
                <div style="font-size: 1.3rem; font-weight: bold; color: #333; margin-bottom: 5px;">${pitchingStats.wins || '0'}</div>
                <div style="font-size: 0.8rem; color: #777; margin-bottom: 3px;">W</div>
                ${pitchingRankings.wins ? `<div style="font-size: 0.7rem; color: #28a745; font-weight: 500;">#${pitchingRankings.wins} in MLB</div>` : ''}
              </div>
              <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 6px; padding: 12px; text-align: center;">
                <div style="font-size: 1.3rem; font-weight: bold; color: #333; margin-bottom: 5px;">${pitchingStats.losses || '0'}</div>
                <div style="font-size: 0.8rem; color: #777; margin-bottom: 3px;">L</div>
                ${pitchingRankings.losses ? `<div style="font-size: 0.7rem; color: #28a745; font-weight: 500;">#${pitchingRankings.losses} in MLB</div>` : ''}
              </div>
              <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 6px; padding: 12px; text-align: center;">
                <div style="font-size: 1.3rem; font-weight: bold; color: #333; margin-bottom: 5px;">${pitchingStats.strikeOuts || '0'}</div>
                <div style="font-size: 0.8rem; color: #777; margin-bottom: 3px;">K</div>
                ${pitchingRankings.strikeOuts ? `<div style="font-size: 0.7rem; color: #28a745; font-weight: 500;">#${pitchingRankings.strikeOuts} in MLB</div>` : ''}
              </div>
            </div>
          </div>
        `;
      }
      
      if (!hittingData.stats?.length && !pitchingData.stats?.length) {
        content += '<div style="text-align: center; color: #777; font-style: italic; padding: 30px 20px;">No statistics available for this period.</div>';
      }
      
      container.innerHTML = content;
      
      // Add year and month selector event listeners for TWP
      setTimeout(() => {
        const yearSelector = document.getElementById('modalYearSelector');
        const monthSelector = document.getElementById('modalMonthSelector');
        
        if (yearSelector) {
          yearSelector.addEventListener('change', async () => {
            const selectedYear = parseInt(yearSelector.value);
            const selectedMonth = monthSelector ? monthSelector.value : '';
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Loading player statistics...</div>';
            await loadPlayerStatsForModal(playerId, selectedYear, container, selectedMonth);
          });
        }
        
        if (monthSelector) {
          monthSelector.addEventListener('change', async () => {
            const selectedMonth = monthSelector.value;
            const selectedYear = yearSelector ? parseInt(yearSelector.value) : year;
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Loading player statistics...</div>';
            await loadPlayerStatsForModal(playerId, selectedYear, container, selectedMonth);
          });
        }
      }, 100);
      
      return;
    }
    
    if (!isPitcher) {
      // Load hitting stats for non-pitchers
      const [playerResponse, allPlayersResponse] = await Promise.all([
        fetch(buildStatsApiUrl(playerId, 'hitting', year, selectedMonth)),
        fetch(buildLeagueStatsUrl('hitting', year, selectedMonth))
      ]);
      
      const playerData = await playerResponse.json();
      const allPlayersData = await allPlayersResponse.json();
      
      if (playerData.stats && playerData.stats.length > 0 && playerData.stats[0].splits && playerData.stats[0].splits.length > 0) {
        const splitForYear = playerData.stats[0].splits[0];
        const playerStats = splitForYear.stat;
        
        // Get team name and logo for the chosen year
        let teamNameForYear = splitForYear.team && splitForYear.team.name ? splitForYear.team.name : (currentTeam && currentTeam.name ? currentTeam.name : "");
        
        // Update global team variables if we have team data from stats
        if (splitForYear.team) {
          playerTeamForYear = splitForYear.team;
          playerTeamColor = teamColors[splitForYear.team.name] || teamColors[splitForYear.team.abbreviation] || playerTeamColor;
          playerTeamAbbr = splitForYear.team.abbreviation || splitForYear.team.shortDisplayName || splitForYear.team.name;
        }
        
        let teamLogoUrl = "";
        if (teamNameForYear) {
          teamLogoUrl = await getStandardLogoUrl(teamNameForYear);
        }
        
        // Calculate player rankings for both season and monthly data
        const rankings = calculatePlayerStatRankings(allPlayersData, playerStats);
        
        const currentYear = new Date().getFullYear();
        const startYear = 2022;

        const teamColor = playerTeamColor;
        
        // Show stats in modal format
        container.innerHTML = `
          <div id="playerStatsCard" style="position: relative;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <img src="${teamLogoUrl}" alt="${teamNameForYear}" 
                     style="height:40px;max-width:60px;" 
                     onerror="this.src='icon.png';">
                <h3 style="margin: 0; color: #333;" id="statsHeaderTitle">${selectedMonth ? `${year} ${getMonthName(selectedMonth)} Hitting Statistics` : `${year} Hitting Statistics`}</h3>
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
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
                <select id="modalYearSelector" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
                  ${Array.from({length: currentYear - startYear + 1}, (_, i) => currentYear - i).map(yearOption => 
                    `<option value="${yearOption}" ${yearOption === year ? 'selected' : ''}>${yearOption}</option>`
                  ).join('')}
                </select>
                <select id="modalMonthSelector" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; margin-left: 5px;">
                  <option value="" ${!selectedMonth ? 'selected' : ''}>--</option>
                  <option value="01" ${selectedMonth === '01' ? 'selected' : ''}>JAN</option>
                  <option value="02" ${selectedMonth === '02' ? 'selected' : ''}>FEB</option>
                  <option value="03" ${selectedMonth === '03' ? 'selected' : ''}>MAR</option>
                  <option value="04" ${selectedMonth === '04' ? 'selected' : ''}>APR</option>
                  <option value="05" ${selectedMonth === '05' ? 'selected' : ''}>MAY</option>
                  <option value="06" ${selectedMonth === '06' ? 'selected' : ''}>JUN</option>
                  <option value="07" ${selectedMonth === '07' ? 'selected' : ''}>JUL</option>
                  <option value="08" ${selectedMonth === '08' ? 'selected' : ''}>AUG</option>
                  <option value="09" ${selectedMonth === '09' ? 'selected' : ''}>SEP</option>
                  <option value="10" ${selectedMonth === '10' ? 'selected' : ''}>OCT</option>
                  <option value="11" ${selectedMonth === '11' ? 'selected' : ''}>NOV</option>
                  <option value="12" ${selectedMonth === '12' ? 'selected' : ''}>DEC</option>
                </select>
              </div>
            </div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">${playerStats.avg || '.000'}</div>
              <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">AVG</div>
              ${rankings.avg ? `<div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">#${rankings.avg} in MLB</div>` : ''}
            </div>
            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">${playerStats.homeRuns || 0}</div>
              <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">HR</div>
              ${rankings.homeRuns ? `<div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">#${rankings.homeRuns} in MLB</div>` : ''}
            </div>
            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">${playerStats.rbi || 0}</div>
              <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">RBI</div>
              ${rankings.rbi ? `<div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">#${rankings.rbi} in MLB</div>` : ''}
            </div>
            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">${playerStats.obp || '.000'}</div>
              <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">OBP</div>
              ${rankings.obp ? `<div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">#${rankings.obp} in MLB</div>` : ''}
            </div>
            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">${playerStats.slg || '.000'}</div>
              <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">SLG</div>
              ${rankings.slg ? `<div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">#${rankings.slg} in MLB</div>` : ''}
            </div>
            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">${playerStats.ops || '.000'}</div>
              <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">OPS</div>
              ${rankings.ops ? `<div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">#${rankings.ops} in MLB</div>` : ''}
            </div>
            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">${playerStats.hits || 0}</div>
              <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">H</div>
              ${rankings.hits ? `<div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">#${rankings.hits} in MLB</div>` : ''}
            </div>
            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">${playerStats.runs || 0}</div>
              <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">R</div>
              ${rankings.runs ? `<div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">#${rankings.runs} in MLB</div>` : ''}
            </div>
            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">${playerStats.stolenBases || 0}</div>
              <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">SB</div>
              ${rankings.stolenBases ? `<div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">#${rankings.stolenBases} in MLB</div>` : ''}
            </div>
          </div>
        `;
        
        // Add year and month selector event listeners for hitting stats
        setTimeout(() => {
          const yearSelector = document.getElementById('modalYearSelector');
          const monthSelector = document.getElementById('modalMonthSelector');
          
          if (yearSelector) {
            yearSelector.addEventListener('change', async () => {
              const selectedYear = parseInt(yearSelector.value);
              const selectedMonth = monthSelector ? monthSelector.value : '';
              if (currentStatsMode === 'overall') {
                container.innerHTML = '<div style="text-align: center; padding: 20px;">Loading player statistics...</div>';
                await loadPlayerStatsForModal(playerId, selectedYear, container, selectedMonth);
              } else if (currentStatsMode === 'gamelog') {
                // Update game log interface with new year
                showGameLogInterface();
              }
            });
          }
          
          if (monthSelector) {
            monthSelector.addEventListener('change', async () => {
              const selectedMonth = monthSelector.value;
              const selectedYear = yearSelector ? parseInt(yearSelector.value) : year;
              if (currentStatsMode === 'overall') {
                container.innerHTML = '<div style="text-align: center; padding: 20px;">Loading player statistics...</div>';
                await loadPlayerStatsForModal(playerId, selectedYear, container, selectedMonth);
              }
            });
          }
        }, 100);
      } else {
        const currentYear = new Date().getFullYear();
        const startYear = 2022;
        
        container.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <h3 style="margin: 0; color: #333;" id="statsHeaderTitle">${selectedMonth ? `${year} ${getMonthName(selectedMonth)} Hitting Statistics` : `${year} Hitting Statistics`}</h3>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <select id="modalYearSelector" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
                ${Array.from({length: currentYear - startYear + 1}, (_, i) => currentYear - i).map(yearOption => 
                  `<option value="${yearOption}" ${yearOption === year ? 'selected' : ''}>${yearOption}</option>`
                ).join('')}
              </select>
              <select id="modalMonthSelector" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; margin-left: 5px;">
                <option value="" ${!selectedMonth ? 'selected' : ''}>--</option>
                <option value="01" ${selectedMonth === '01' ? 'selected' : ''}>JAN</option>
                <option value="02" ${selectedMonth === '02' ? 'selected' : ''}>FEB</option>
                <option value="03" ${selectedMonth === '03' ? 'selected' : ''}>MAR</option>
                <option value="04" ${selectedMonth === '04' ? 'selected' : ''}>APR</option>
                <option value="05" ${selectedMonth === '05' ? 'selected' : ''}>MAY</option>
                <option value="06" ${selectedMonth === '06' ? 'selected' : ''}>JUN</option>
                <option value="07" ${selectedMonth === '07' ? 'selected' : ''}>JUL</option>
                <option value="08" ${selectedMonth === '08' ? 'selected' : ''}>AUG</option>
                <option value="09" ${selectedMonth === '09' ? 'selected' : ''}>SEP</option>
                <option value="10" ${selectedMonth === '10' ? 'selected' : ''}>OCT</option>
                <option value="11" ${selectedMonth === '11' ? 'selected' : ''}>NOV</option>
                <option value="12" ${selectedMonth === '12' ? 'selected' : ''}>DEC</option>
              </select>
            </div>
          </div>
          <div style="text-align: center; padding: 20px; color: #777;">
            No hitting statistics available for the ${selectedMonth ? `${getMonthName(selectedMonth)} ${year}` : `${year} season`}.
          </div>
        `;
        
        // Add year and month selector event listeners for no hitting stats
        setTimeout(() => {
          const yearSelector = document.getElementById('modalYearSelector');
          const monthSelector = document.getElementById('modalMonthSelector');
          
          if (yearSelector) {
            yearSelector.addEventListener('change', async () => {
              const selectedYear = parseInt(yearSelector.value);
              const selectedMonth = monthSelector ? monthSelector.value : '';
              if (currentStatsMode === 'overall') {
                container.innerHTML = '<div style="text-align: center; padding: 20px;">Loading player statistics...</div>';
                await loadPlayerStatsForModal(playerId, selectedYear, container, selectedMonth);
              } else if (currentStatsMode === 'gamelog') {
                // Update game log interface with new year
                showGameLogInterface();
              }
            });
          }
          
          if (monthSelector) {
            monthSelector.addEventListener('change', async () => {
              const selectedMonth = monthSelector.value;
              const selectedYear = yearSelector ? parseInt(yearSelector.value) : year;
              if (currentStatsMode === 'overall') {
                container.innerHTML = '<div style="text-align: center; padding: 20px;">Loading player statistics...</div>';
                await loadPlayerStatsForModal(playerId, selectedYear, container, selectedMonth);
              }
            });
          }
        }, 100);
      }
    } else {
      // For pitchers, load pitching stats
      const [playerResponse, allPlayersResponse] = await Promise.all([
        fetch(buildStatsApiUrl(playerId, 'pitching', year, selectedMonth)),
        fetch(buildLeagueStatsUrl('pitching', year, selectedMonth))
      ]);
      
      const playerData = await playerResponse.json();
      const allPlayersData = await allPlayersResponse.json();
      
      if (playerData.stats && playerData.stats.length > 0 && playerData.stats[0].splits && playerData.stats[0].splits.length > 0) {
        const splitForYear = playerData.stats[0].splits[0];
        const playerStats = splitForYear.stat;
        
        // Get team name and logo for the chosen year
        let teamNameForYear = splitForYear.team && splitForYear.team.name ? splitForYear.team.name : (currentTeam && currentTeam.name ? currentTeam.name : "");
        
        // Update global team variables if we have team data from stats
        if (splitForYear.team) {
          playerTeamForYear = splitForYear.team;
          playerTeamColor = teamColors[splitForYear.team.name] || teamColors[splitForYear.team.abbreviation] || playerTeamColor;
          playerTeamAbbr = splitForYear.team.abbreviation || splitForYear.team.shortDisplayName || splitForYear.team.name;
        }
        
        let teamLogoUrl = "";
        if (teamNameForYear) {
          teamLogoUrl = await getStandardLogoUrl(teamNameForYear);
        }
        
        // Calculate player rankings for pitching stats for both season and monthly data
        const rankings = calculatePitcherStatRankings(allPlayersData, playerStats);
        
        const currentYear = new Date().getFullYear();
        const startYear = 2022;

        const teamColor = playerTeamColor;

        // Show stats in modal format
        container.innerHTML = `
          <div id="playerStatsCard" style="position: relative;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <img src="${teamLogoUrl}" alt="${teamNameForYear}" 
                     style="height:40px;max-width:60px;" 
                     onerror="this.src='icon.png';">
                <h3 style="margin: 0; color: #333;" id="statsHeaderTitle">${selectedMonth ? `${year} ${getMonthName(selectedMonth)} Pitching Statistics` : `${year} Pitching Statistics`}</h3>
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
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
                <select id="modalYearSelector" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
                  ${Array.from({length: currentYear - startYear + 1}, (_, i) => currentYear - i).map(yearOption => 
                    `<option value="${yearOption}" ${yearOption === year ? 'selected' : ''}>${yearOption}</option>`
                  ).join('')}
                </select>
                <select id="modalMonthSelector" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; margin-left: 5px;">
                  <option value="" ${!selectedMonth ? 'selected' : ''}>--</option>
                  <option value="01" ${selectedMonth === '01' ? 'selected' : ''}>JAN</option>
                  <option value="02" ${selectedMonth === '02' ? 'selected' : ''}>FEB</option>
                  <option value="03" ${selectedMonth === '03' ? 'selected' : ''}>MAR</option>
                  <option value="04" ${selectedMonth === '04' ? 'selected' : ''}>APR</option>
                  <option value="05" ${selectedMonth === '05' ? 'selected' : ''}>MAY</option>
                  <option value="06" ${selectedMonth === '06' ? 'selected' : ''}>JUN</option>
                  <option value="07" ${selectedMonth === '07' ? 'selected' : ''}>JUL</option>
                  <option value="08" ${selectedMonth === '08' ? 'selected' : ''}>AUG</option>
                  <option value="09" ${selectedMonth === '09' ? 'selected' : ''}>SEP</option>
                  <option value="10" ${selectedMonth === '10' ? 'selected' : ''}>OCT</option>
                  <option value="11" ${selectedMonth === '11' ? 'selected' : ''}>NOV</option>
                  <option value="12" ${selectedMonth === '12' ? 'selected' : ''}>DEC</option>
                </select>
              </div>
            </div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">${playerStats.era || '0.00'}</div>
              <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">ERA</div>
              ${rankings.era ? `<div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">#${rankings.era} in MLB</div>` : ''}
            </div>
            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">${playerStats.whip || '0.00'}</div>
              <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">WHIP</div>
              ${rankings.whip ? `<div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">#${rankings.whip} in MLB</div>` : ''}
            </div>
            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">${playerStats.wins || 0}</div>
              <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">W</div>
              ${rankings.wins ? `<div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">#${rankings.wins} in MLB</div>` : ''}
            </div>
            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">${playerStats.losses || 0}</div>
              <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">L</div>
              ${rankings.losses ? `<div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">#${rankings.losses} in MLB</div>` : ''}
            </div>
            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">${playerStats.saves || 0}</div>
              <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">SV</div>
              ${rankings.saves ? `<div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">#${rankings.saves} in MLB</div>` : ''}
            </div>
            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">${playerStats.strikeOuts || 0}</div>
              <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">K</div>
              ${rankings.strikeOuts ? `<div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">#${rankings.strikeOuts} in MLB</div>` : ''}
            </div>
            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">${playerStats.inningsPitched || '0.0'}</div>
              <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">IP</div>
              ${rankings.inningsPitched ? `<div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">#${rankings.inningsPitched} in MLB</div>` : ''}
            </div>
            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #333; margin-bottom: 8px;">${playerStats.baseOnBalls || 0}</div>
              <div style="font-size: 0.9rem; color: #777; margin-bottom: 5px;">BB</div>
              ${rankings.baseOnBalls ? `<div style="font-size: 0.8rem; color: #28a745; font-weight: 500;">#${rankings.baseOnBalls} in MLB</div>` : ''}
            </div>
          </div>
        `;
        
        // Add year and month selector event listeners for pitching stats
        setTimeout(() => {
          const yearSelector = document.getElementById('modalYearSelector');
          const monthSelector = document.getElementById('modalMonthSelector');
          
          if (yearSelector) {
            yearSelector.addEventListener('change', async () => {
              const selectedYear = parseInt(yearSelector.value);
              const selectedMonth = monthSelector ? monthSelector.value : '';
              if (currentStatsMode === 'overall') {
                container.innerHTML = '<div style="text-align: center; padding: 20px;">Loading player statistics...</div>';
                await loadPlayerStatsForModal(playerId, selectedYear, container, selectedMonth);
              } else if (currentStatsMode === 'gamelog') {
                // Update game log interface with new year
                showGameLogInterface();
              }
            });
          }
          
          if (monthSelector) {
            monthSelector.addEventListener('change', async () => {
              const selectedMonth = monthSelector.value;
              const selectedYear = yearSelector ? parseInt(yearSelector.value) : year;
              if (currentStatsMode === 'overall') {
                container.innerHTML = '<div style="text-align: center; padding: 20px;">Loading player statistics...</div>';
                await loadPlayerStatsForModal(playerId, selectedYear, container, selectedMonth);
              }
            });
          }
        }, 100);
      } else {
        const currentYear = new Date().getFullYear();
        const startYear = 2022;
        
        container.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <h3 style="margin: 0; color: #333;" id="statsHeaderTitle">${selectedMonth ? `${year} ${getMonthName(selectedMonth)} Pitching Statistics` : `${year} Pitching Statistics`}</h3>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              
              <select id="modalYearSelector" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
                ${Array.from({length: currentYear - startYear + 1}, (_, i) => currentYear - i).map(yearOption => 
                  `<option value="${yearOption}" ${yearOption === year ? 'selected' : ''}>${yearOption}</option>`
                ).join('')}
              </select>
              <select id="modalMonthSelector" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; margin-left: 5px;">
                <option value="" ${!selectedMonth ? 'selected' : ''}>--</option>
                <option value="01" ${selectedMonth === '01' ? 'selected' : ''}>JAN</option>
                <option value="02" ${selectedMonth === '02' ? 'selected' : ''}>FEB</option>
                <option value="03" ${selectedMonth === '03' ? 'selected' : ''}>MAR</option>
                <option value="04" ${selectedMonth === '04' ? 'selected' : ''}>APR</option>
                <option value="05" ${selectedMonth === '05' ? 'selected' : ''}>MAY</option>
                <option value="06" ${selectedMonth === '06' ? 'selected' : ''}>JUN</option>
                <option value="07" ${selectedMonth === '07' ? 'selected' : ''}>JUL</option>
                <option value="08" ${selectedMonth === '08' ? 'selected' : ''}>AUG</option>
                <option value="09" ${selectedMonth === '09' ? 'selected' : ''}>SEP</option>
                <option value="10" ${selectedMonth === '10' ? 'selected' : ''}>OCT</option>
                <option value="11" ${selectedMonth === '11' ? 'selected' : ''}>NOV</option>
                <option value="12" ${selectedMonth === '12' ? 'selected' : ''}>DEC</option>
              </select>
            </div>
          </div>
          <div style="text-align: center; padding: 20px; color: #777;">
            No pitching statistics available for the ${selectedMonth ? `${getMonthName(selectedMonth)} ${year}` : `${year} season`}.
          </div>
        `;
        
        // Add year and month selector event listeners for no pitching stats
        setTimeout(() => {
          const yearSelector = document.getElementById('modalYearSelector');
          const monthSelector = document.getElementById('modalMonthSelector');
          
          if (yearSelector) {
            yearSelector.addEventListener('change', async () => {
              const selectedYear = parseInt(yearSelector.value);
              const selectedMonth = monthSelector ? monthSelector.value : '';
              if (currentStatsMode === 'overall') {
                container.innerHTML = '<div style="text-align: center; padding: 20px;">Loading player statistics...</div>';
                await loadPlayerStatsForModal(playerId, selectedYear, container, selectedMonth);
              } else if (currentStatsMode === 'gamelog') {
                // Update game log interface with new year
                showGameLogInterface();
              }
            });
          }
          
          if (monthSelector) {
            monthSelector.addEventListener('change', async () => {
              const selectedMonth = monthSelector.value;
              const selectedYear = yearSelector ? parseInt(yearSelector.value) : year;
              if (currentStatsMode === 'overall') {
                container.innerHTML = '<div style="text-align: center; padding: 20px;">Loading player statistics...</div>';
                await loadPlayerStatsForModal(playerId, selectedYear, container, selectedMonth);
              }
            });
          }
        }, 100);
      }
    }
  } catch (error) {
    console.error('Error loading player stats for modal:', error);
    container.innerHTML = `
      <div style="text-align: center; padding: 20px; color: #dc3545;">
        Error loading player statistics
      </div>
    `;
  }
}

async function loadPlayerStats(playerId, year = new Date().getFullYear()) {
  try {
    // Check if player is a pitcher
    const isPitcher = selectedPlayer.position.code === "1";
    
    if (!isPitcher) {
      // Load hitting stats for non-pitchers and fetch all players for rankings
      const [playerResponse, allPlayersResponse] = await Promise.all([
        fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=hitting&season=${year}`),
        fetch(`https://statsapi.mlb.com/api/v1/stats?stats=season&group=hitting&season=${year}&gameType=R&sportId=1&limit=2000&playerPool=all`)
      ]);
      
      const playerData = await playerResponse.json();
      const allPlayersData = await allPlayersResponse.json();
      
      const statsContainer = document.querySelector('.player-stats-content');
      
      if (playerData.stats && playerData.stats.length > 0 && playerData.stats[0].splits && playerData.stats[0].splits.length > 0) {
        const splitForYear = playerData.stats[0].splits[0];
        const playerStats = splitForYear.stat;
        // Get team name and logo for the chosen year
        let teamNameForYear = splitForYear.team && splitForYear.team.name ? splitForYear.team.name : (currentTeam && currentTeam.name ? currentTeam.name : "");
        let teamLogoUrl = "";
        if (teamNameForYear) {
          teamLogoUrl = await getStandardLogoUrl(teamNameForYear);
        }
        // Calculate player rankings
        const rankings = calculatePlayerStatRankings(allPlayersData, playerStats);
        // Show logo above stats
        statsContainer.innerHTML = `
          <div class="player-hitting-stats">
            <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${teamLogoUrl}" alt="${teamNameForYear}" 
              class="player-team-logo" 
              style="height:40px;max-width:60px;" 
              onerror="this.src='icon.png';">
            <h3>${year} Hitting Statistics</h3>
            </div>
            <div class="stats-grid-player">
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.gamesPlayed || 0}</div>
                <div class="stat-label-player">G</div>
                ${rankings.gamesPlayed ? `<div class="stat-rank">#${rankings.gamesPlayed} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.plateAppearances || 0}</div>
                <div class="stat-label-player">PA</div>
                ${rankings.plateAppearances ? `<div class="stat-rank">#${rankings.plateAppearances} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.atBats || 0}</div>
                <div class="stat-label-player">AB</div>
                ${rankings.atBats ? `<div class="stat-rank">#${rankings.atBats} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.hitByPitch || 0}</div>
                <div class="stat-label-player">HBP</div>
                ${rankings.hitByPitch ? `<div class="stat-rank">#${rankings.hitByPitch} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.avg || '.000'}</div>
                <div class="stat-label-player">AVG</div>
                ${rankings.avg ? `<div class="stat-rank">#${rankings.avg} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.obp || '.000'}</div>
                <div class="stat-label-player">OBP</div>
                ${rankings.obp ? `<div class="stat-rank">#${rankings.obp} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.slg || '.000'}</div>
                <div class="stat-label-player">SLG</div>
                ${rankings.slg ? `<div class="stat-rank">#${rankings.slg} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.ops || '.000'}</div>
                <div class="stat-label-player">OPS</div>
                ${rankings.ops ? `<div class="stat-rank">#${rankings.ops} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.hits || 0}</div>
                <div class="stat-label-player">H</div>
                ${rankings.hits ? `<div class="stat-rank">#${rankings.hits} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.homeRuns || 0}</div>
                <div class="stat-label-player">HR</div>
                ${rankings.homeRuns ? `<div class="stat-rank">#${rankings.homeRuns} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.doubles || 0}</div>
                <div class="stat-label-player">2B</div>
                ${rankings.doubles ? `<div class="stat-rank">#${rankings.doubles} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.triples || 0}</div>
                <div class="stat-label-player">3B</div>
                ${rankings.triples ? `<div class="stat-rank">#${rankings.triples} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.runs || 0}</div>
                <div class="stat-label-player">R</div>
                ${rankings.runs ? `<div class="stat-rank">#${rankings.runs} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.rbi || 0}</div>
                <div class="stat-label-player">RBI</div>
                ${rankings.rbi ? `<div class="stat-rank">#${rankings.rbi} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.strikeOuts || 0}</div>
                <div class="stat-label-player">SO</div>
                ${rankings.strikeOuts ? `<div class="stat-rank">#${rankings.strikeOuts} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.baseOnBalls || 0}</div>
                <div class="stat-label-player">BB</div>
                ${rankings.baseOnBalls ? `<div class="stat-rank">#${rankings.baseOnBalls} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.stolenBases || 0}</div>
                <div class="stat-label-player">SB</div>
                ${rankings.stolenBases ? `<div class="stat-rank">#${rankings.stolenBases} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.caughtStealing || 0}</div>
                <div class="stat-label-player">CS</div>
                ${rankings.caughtStealing ? `<div class="stat-rank">#${rankings.caughtStealing} in MLB</div>` : ''}
              </div>
            </div>
          </div>
        `;
      } else {
        statsContainer.innerHTML = `
          <div class="no-stats">
            <p>No hitting statistics available for the ${year} season.</p>
          </div>
        `;
      }
    } else {
      // For pitchers, load pitching stats
      const [playerResponse, allPlayersResponse] = await Promise.all([
        fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=pitching&season=${year}`),
        fetch(`https://statsapi.mlb.com/api/v1/stats?stats=season&group=pitching&season=${year}&gameType=R&sportId=1&limit=2000&playerPool=all`)
      ]);
      
      const playerData = await playerResponse.json();
      const allPlayersData = await allPlayersResponse.json();
      
      const statsContainer = document.querySelector('.player-stats-content');
      
      if (playerData.stats && playerData.stats.length > 0 && playerData.stats[0].splits && playerData.stats[0].splits.length > 0) {
        const splitForYear = playerData.stats[0].splits[0];
        const playerStats = splitForYear.stat;
        // Get team name and logo for the chosen year
        let teamNameForYear = splitForYear.team && splitForYear.team.name ? splitForYear.team.name : (currentTeam && currentTeam.name ? currentTeam.name : "");
        let teamLogoUrl = "";
        if (teamNameForYear) {
          teamLogoUrl = await getStandardLogoUrl(teamNameForYear);
        }
        
        // Calculate player rankings for pitching stats
        const rankings = calculatePitcherStatRankings(allPlayersData, playerStats);
        
        statsContainer.innerHTML = `
          <div class="player-pitching-stats">
            <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${teamLogoUrl}" alt="${teamNameForYear}" 
              class="player-team-logo" 
              style="height:40px;max-width:60px;" 
              onerror="this.src='icon.png';">
            <h3>${year} Pitching Statistics</h3>
            </div>
            <div class="stats-grid-player">
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.gamesPlayed || 0}</div>
                <div class="stat-label-player">G</div>
                ${rankings.gamesPlayed ? `<div class="stat-rank">#${rankings.gamesPlayed} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.gamesStarted || 0}</div>
                <div class="stat-label-player">GS</div>
                ${rankings.gamesStarted ? `<div class="stat-rank">#${rankings.gamesStarted} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.inningsPitched || '0.0'}</div>
                <div class="stat-label-player">IP</div>
                ${rankings.inningsPitched ? `<div class="stat-rank">#${rankings.inningsPitched} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.wins || 0}</div>
                <div class="stat-label-player">W</div>
                ${rankings.wins ? `<div class="stat-rank">#${rankings.wins} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.losses || 0}</div>
                <div class="stat-label-player">L</div>
                ${rankings.losses ? `<div class="stat-rank">#${rankings.losses} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.saves || 0}</div>
                <div class="stat-label-player">SV</div>
                ${rankings.saves ? `<div class="stat-rank">#${rankings.saves} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.era || '0.00'}</div>
                <div class="stat-label-player">ERA</div>
                ${rankings.era ? `<div class="stat-rank">#${rankings.era} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.whip || '0.00'}</div>
                <div class="stat-label-player">WHIP</div>
                ${rankings.whip ? `<div class="stat-rank">#${rankings.whip} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.strikeOuts || 0}</div>
                <div class="stat-label-player">SO</div>
                ${rankings.strikeOuts ? `<div class="stat-rank">#${rankings.strikeOuts} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.baseOnBalls || 0}</div>
                <div class="stat-label-player">BB</div>
                ${rankings.baseOnBalls ? `<div class="stat-rank">#${rankings.baseOnBalls} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.hits || 0}</div>
                <div class="stat-label-player">H</div>
                ${rankings.hits ? `<div class="stat-rank">#${rankings.hits} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.homeRuns || 0}</div>
                <div class="stat-label-player">HR</div>
                ${rankings.homeRuns ? `<div class="stat-rank">#${rankings.homeRuns} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.earnedRuns || 0}</div>
                <div class="stat-label-player">ER</div>
                ${rankings.earnedRuns ? `<div class="stat-rank">#${rankings.earnedRuns} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.strikeoutsPer9Inn || '0.00'}</div>
                <div class="stat-label-player">K/9</div>
                ${rankings.strikeoutsPer9Inn ? `<div class="stat-rank">#${rankings.strikeoutsPer9Inn} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.walksPer9Inn || '0.00'}</div>
                <div class="stat-label-player">BB/9</div>
                ${rankings.walksPer9Inn ? `<div class="stat-rank">#${rankings.walksPer9Inn} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.hitsPer9Inn || '0.00'}</div>
                <div class="stat-label-player">H/9</div>
                ${rankings.hitsPer9Inn ? `<div class="stat-rank">#${rankings.hitsPer9Inn} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.strikeoutWalkRatio || '0.00'}</div>
                <div class="stat-label-player">K/BB</div>
                ${rankings.strikeoutWalkRatio ? `<div class="stat-rank">#${rankings.strikeoutWalkRatio} in MLB</div>` : ''}
              </div>
              <div class="stat-item-player">
                <div class="stat-value-player">${playerStats.winPercentage || '.000'}</div>
                <div class="stat-label-player">Win%</div>
                ${rankings.winPercentage ? `<div class="stat-rank">#${rankings.winPercentage} in MLB</div>` : ''}
              </div>
            </div>
          </div>
        `;
      } else {
        statsContainer.innerHTML = `
          <div class="no-stats">
            <p>No pitching statistics available for the ${year} season.</p>
          </div>
        `;
      }
    }
  } catch (error) {
    console.error("Error loading player stats:", error);
    const statsContainer = document.querySelector('.player-stats-content');
    if (statsContainer) {
      statsContainer.innerHTML = `
        <div class="no-stats">
          <p>Error loading player statistics.</p>
        </div>
      `;
    }
  }
}

function calculatePlayerStatRankings(allPlayersData, playerStats) {
  const rankings = {};
  
  // Extract all players' stats for comparison
  const allPlayers = allPlayersData.stats?.[0]?.splits || [];
  
  if (allPlayers.length === 0) {
    console.log("No player data available for rankings");
    return rankings;
  }
  
  console.log(`Calculating rankings from ${allPlayers.length} players`);
  
  // Helper function to calculate ranking for a stat
  const calculateRanking = (statName, isLowerBetter = false) => {
    const playerValue = parseFloat(playerStats[statName]) || 0;
    
    // For counting stats, don't show ranking if value is 0
    const countingStats = ['hitByPitch', 'triples', 'stolenBases', 'caughtStealing'];
    if (countingStats.includes(statName) && playerValue === 0) {
      return null;
    }
    
    // Get all valid values for comparison (filter out players with very limited playing time)
    const allValues = allPlayers
      .filter(player => {
        const gamesPlayed = parseFloat(player.stat.gamesPlayed) || 0;
        return gamesPlayed >= 10; // Only include players with at least 10 games
      })
      .map(player => parseFloat(player.stat[statName]) || 0)
      .sort((a, b) => isLowerBetter ? a - b : b - a);
    
    if (allValues.length === 0) {
      console.log(`No data available for ${statName}`);
      return null;
    }
    
    // Find player's position in the sorted array
    const position = allValues.findIndex(value => 
      isLowerBetter ? value >= playerValue : value <= playerValue
    ) + 1;
    
    // Return position if valid
    return position <= allValues.length ? position : null;
  };
  
  // Calculate rankings for each stat
  rankings.gamesPlayed = calculateRanking('gamesPlayed');
  rankings.plateAppearances = calculateRanking('plateAppearances');
  rankings.atBats = calculateRanking('atBats');
  rankings.hitByPitch = calculateRanking('hitByPitch');
  rankings.avg = calculateRanking('avg');
  rankings.obp = calculateRanking('obp');
  rankings.slg = calculateRanking('slg');
  rankings.ops = calculateRanking('ops');
  rankings.hits = calculateRanking('hits');
  rankings.homeRuns = calculateRanking('homeRuns');
  rankings.doubles = calculateRanking('doubles');
  rankings.triples = calculateRanking('triples');
  rankings.runs = calculateRanking('runs');
  rankings.rbi = calculateRanking('rbi');
  rankings.strikeOuts = calculateRanking('strikeOuts', true); // Lower is better for strikeouts
  rankings.baseOnBalls = calculateRanking('baseOnBalls');
  rankings.stolenBases = calculateRanking('stolenBases');
  rankings.caughtStealing = calculateRanking('caughtStealing', true); // Lower is better for caught stealing
  
  console.log('Calculated rankings:', rankings);
  return rankings;
}

function calculatePitcherStatRankings(allPlayersData, playerStats) {
  const rankings = {};
  
  // Extract all players' stats for comparison
  const allPlayers = allPlayersData.stats?.[0]?.splits || [];
  
  if (allPlayers.length === 0) {
    console.log("No pitcher data available for rankings");
    return rankings;
  }
  
  console.log(`Calculating pitcher rankings from ${allPlayers.length} players`);
  
  // Helper function to calculate ranking for a pitching stat
  const calculateRanking = (statName, isLowerBetter = false) => {
    const playerValue = parseFloat(playerStats[statName]) || 0;
    
    // For counting stats, don't show ranking if value is 0
    const countingStats = ['saves', 'holds', 'completeGames', 'shutouts'];
    if (countingStats.includes(statName) && playerValue === 0) {
      return null;
    }
    
    // Get all valid values for comparison (filter out players with very limited playing time)
    const allValues = allPlayers
      .filter(player => {
        const gamesPlayed = parseFloat(player.stat.gamesPlayed) || 0;
        return gamesPlayed >= 5; // Only include pitchers with at least 5 games
      })
      .map(player => parseFloat(player.stat[statName]) || 0)
      .sort((a, b) => isLowerBetter ? a - b : b - a);
    
    if (allValues.length === 0) {
      console.log(`No data available for ${statName}`);
      return null;
    }
    
    // Find player's position in the sorted array
    const position = allValues.findIndex(value => 
      isLowerBetter ? value >= playerValue : value <= playerValue
    ) + 1;
    
    // Return position if valid
    return position <= allValues.length ? position : null;
  };
  
  // Calculate rankings for each pitching stat
  rankings.gamesPlayed = calculateRanking('gamesPlayed');
  rankings.gamesStarted = calculateRanking('gamesStarted');
  rankings.inningsPitched = calculateRanking('inningsPitched');
  rankings.wins = calculateRanking('wins');
  rankings.losses = calculateRanking('losses', true); // Lower losses is better
  rankings.saves = calculateRanking('saves');
  rankings.era = calculateRanking('era', true); // Lower ERA is better
  rankings.whip = calculateRanking('whip', true); // Lower WHIP is better
  rankings.strikeOuts = calculateRanking('strikeOuts');
  rankings.baseOnBalls = calculateRanking('baseOnBalls', true); // Lower walks is better
  rankings.hits = calculateRanking('hits', true); // Lower hits allowed is better
  rankings.homeRuns = calculateRanking('homeRuns', true); // Lower home runs allowed is better
  rankings.earnedRuns = calculateRanking('earnedRuns', true); // Lower earned runs is better
  rankings.strikeoutsPer9Inn = calculateRanking('strikeoutsPer9Inn');
  rankings.walksPer9Inn = calculateRanking('walksPer9Inn', true); // Lower BB/9 is better
  rankings.hitsPer9Inn = calculateRanking('hitsPer9Inn', true); // Lower H/9 is better
  rankings.strikeoutWalkRatio = calculateRanking('strikeoutWalkRatio');
  rankings.winPercentage = calculateRanking('winPercentage');
  
  console.log('Calculated pitcher rankings:', rankings);
  return rankings;
}

function closePlayerDetails() {
  const playerDetailsSection = document.getElementById('playerDetailsSection');
  if (playerDetailsSection) {
    playerDetailsSection.style.display = 'none';
  }
  selectedPlayer = null;
}

function applyTeamColors(teamColor) {
  // Create or update the dynamic style element
  let styleElement = document.getElementById('team-color-styles');
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = 'team-color-styles';
    document.head.appendChild(styleElement);
  }
  
  // Apply team color to all blue elements
  styleElement.textContent = `
    .section-card h3 {
      border-bottom: 2px solid ${teamColor} !important;
    }   
    .section-header h3 {
      border-bottom: 2px solid ${teamColor} !important;
    }   
    #startDatePicker:focus {
      border-color: ${teamColor} !important;
    }    
    .pagination-btn {
      background-color: ${teamColor} !important;
    }   
    .pagination-btn:hover:not(:disabled) {
      background-color: ${teamColor} !important;
      opacity: 0.9;
    }
    .pagination-btn:disabled {
      background-color: #ccc !important;
    }
    .current-game-card {
      border: 2px solid ${teamColor} !important;
    }    
    .current-game-card:hover {
      box-shadow: 0 4px 8px ${teamColor}4d !important;
    }
    .game-status {
      color: ${teamColor} !important;
    }
    .scheduled {
      color: ${teamColor} !important;
    }
    .stat-value {
      color: ${teamColor} !important;
    }
    .standing-position {
      color: ${teamColor} !important;
    }
    .player-details-section {
      border-top: 3px solid ${teamColor} !important;
    }
    .match-item:hover {
      box-shadow: 0 2px 4px ${teamColor}1a !important;
    }
  `;
}

async function createCurrentGameCard(game) {
  const homeTeam = game.teams.home;
  const awayTeam = game.teams.away;
  
  const isHomeTeam = homeTeam.team.id === parseInt(currentTeamId);
  const opponent = isHomeTeam ? awayTeam : homeTeam;
  const teamScore = isHomeTeam ? homeTeam.score : awayTeam.score;
  const opponentScore = isHomeTeam ? awayTeam.score : homeTeam.score;

  const status = game.status.detailedState;
  const gameDate = new Date(game.gameDate);
  
  // Use the same adjusted date logic as teams.js
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
  
  const todayAdjusted = getAdjustedDateForMLB();
  const gameDateString = gameDate.getFullYear() + "-" +
                        String(gameDate.getMonth() + 1).padStart(2, "0") + "-" +
                        String(gameDate.getDate()).padStart(2, "0");
  const isToday = gameDateString === todayAdjusted;
  
  const formattedTime = gameDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
  
  const formattedDate = gameDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  });

  let statusText = "";
  let scoreDisplay = "";

  if (["Scheduled", "Pre-Game", "Warmup"].includes(status)) {
    if (isToday) {
      statusText = `Today at ${formattedTime}`;
    } else {
      statusText = `${formattedDate} at ${formattedTime}`;
    }
    scoreDisplay = isHomeTeam ? "vs" : "at";
  } else if (["Final", "Game Over", "Completed Early"].includes(status)) {
    statusText = "Final";
    scoreDisplay = `${teamScore || 0} - ${opponentScore || 0}`;
  } else {
    statusText = status;
    scoreDisplay = `${teamScore || 0} - ${opponentScore || 0}`;
  }

  const teamLogo = await getStandardLogoUrl(currentTeam.name);
  const opponentLogo = await getStandardLogoUrl(opponent.team.name);

  return `
    <div class="current-game-card" data-game-pk="${game.gamePk}">
      <div class="game-status">${statusText}${isHomeTeam ? ' (Home)' : ' (Away)'}</div>
      <div class="game-teams">
        <div class="game-team">
          <img src="${teamLogo}" alt="${currentTeam.name}" class="game-team-logo" onerror="this.src='icon.png';">
          <div class="game-team-name">${getTeamAbbreviation(currentTeam.name)}</div>
        </div>
        <div class="game-score">${scoreDisplay}</div>
        <div class="game-team">
          <img src="${opponentLogo}" alt="${opponent.team.name}" class="game-team-logo" onerror="this.src='icon.png';">
          <div class="game-team-name">${getTeamAbbreviation(opponent.team.name)}</div>
        </div>
      </div>
      <div class="game-info">${isToday ? "Today's game" : "Next game"} - Click for details</div>
    </div>
  `;
}

async function createMatchCard(game, isCompleted) {
  const homeTeam = game.teams.home;
  const awayTeam = game.teams.away;
  
  const isHomeTeam = homeTeam.team.id === parseInt(currentTeamId);
  const opponent = isHomeTeam ? awayTeam : homeTeam;
  const teamScore = isHomeTeam ? homeTeam.score : awayTeam.score;
  const opponentScore = isHomeTeam ? awayTeam.score : homeTeam.score;

  const gameDate = new Date(game.gameDate);
  const formattedDate = gameDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });

  let resultClass = "";
  let resultText = "";

  if (isCompleted) {
    if (teamScore > opponentScore) {
      resultClass = "win";
      resultText = "W";
    } else {
      resultClass = "loss";
      resultText = "L";
    }
  } else {
    resultClass = "scheduled";
    resultText = isHomeTeam ? "vs" : "at";
  }

  const teamLogo = await getStandardLogoUrl(currentTeam.name);
  const opponentLogo = await getStandardLogoUrl(opponent.team.name);

  return `
    <div class="match-item" data-game-pk="${game.gamePk}">
      <div class="match-teams">
        <div class="match-team-info">
          <img src="${teamLogo}" alt="${currentTeam.name}" class="match-team-logo" onerror="this.src='icon.png';">
          <span class="match-team-name">${getTeamAbbreviation(currentTeam.name)}</span>
        </div>
        <span class="match-result ${resultClass}">
          ${isCompleted ? `${resultText} ${teamScore}-${opponentScore}` : resultText}
          <div class="match-date" style="margin-top: 10px;">${formattedDate}</div>
        </span>
        <div class="match-team-info">
          <span class="match-team-name">${getTeamAbbreviation(opponent.team.name)}</span>
          <img src="${opponentLogo}" alt="${opponent.team.name}" class="match-team-logo" onerror="this.src='icon.png';">
        </div>
      </div>
    </div>
  `;
}

// Utility functions (updated to match teams.js)
const teamColors = {
  "Arizona Diamondbacks": "#A71930", "Atlanta Braves": "#13274F", "Baltimore Orioles": "#000000", "Boston Red Sox": "#0C2340",
  "Chicago White Sox": "#000000", "Chicago Cubs": "#0E3386", "Cincinnati Reds": "#C6011F", "Cleveland Guardians": "#0F223E",
  "Colorado Rockies": "#333366", "Detroit Tigers": "#0C2340", "Houston Astros": "#002D62", "Kansas City Royals": "#004687",
  "Los Angeles Angels": "#BA0021", "Los Angeles Dodgers": "#A5ACAF", "Miami Marlins": "#00A3E0", "Milwaukee Brewers": "#FFC52F",
  "Minnesota Twins": "#002B5C", "New York Yankees": "#003087", "New York Mets": "#002D72", "Athletics": "#EFB21E", "Oakland Athletics": "#EFB21E",
  "Philadelphia Phillies": "#E81828", "Pittsburgh Pirates": "#27251F", "San Diego Padres": "#2F241D", "San Francisco Giants": "#000000",
  "Seattle Mariners": "#005C5C", "St. Louis Cardinals": "#C41E3A", "Tampa Bay Rays": "#092C5C", "Texas Rangers": "#003278",
  "Toronto Blue Jays": "#1D2D5C", "Washington Nationals": "#AB0003"
};

// For top section - varied logos (mix of _d and _l)
async function getLogoUrl(teamName) {
  const teamAbbrMap = {
    "Arizona Diamondbacks": "ari_d", "Atlanta Braves": "atl_l", "Baltimore Orioles": "bal_l", "Boston Red Sox": "bos_d",
    "Chicago White Sox": "cws_d", "Chicago Cubs": "chc_d", "Cincinnati Reds": "cin_d", "Cleveland Guardians": "cle_l",
    "Colorado Rockies": "col_d", "Detroit Tigers": "det_d", "Houston Astros": "hou_d", "Kansas City Royals": "kc_d",
    "Los Angeles Angels": "laa_d", "Los Angeles Dodgers": "lad_l", "Miami Marlins": "mia_d", "Milwaukee Brewers": "mil_d",
    "Minnesota Twins": "min_d", "New York Yankees": "nyy_d", "New York Mets": "nym_d", "Athletics": "oak_l", "Oakland Athletics": "oak_l",
    "Philadelphia Phillies": "phi_l", "Pittsburgh Pirates": "pit_d", "San Diego Padres": "sd_d", "San Francisco Giants": "sf_d",
    "Seattle Mariners": "sea_d", "St. Louis Cardinals": "stl_d", "Tampa Bay Rays": "tb_d", "Texas Rangers": "tex_d",
    "Toronto Blue Jays": "tor_l", "Washington Nationals": "wsh_d"
  };
  
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

// For all other sections - standard _l logos only
async function getStandardLogoUrl(teamName) {
  const teamAbbrMap = {
    "Arizona Diamondbacks": "ari_l", "Atlanta Braves": "atl_l", "Baltimore Orioles": "bal_l", "Boston Red Sox": "bos_l",
    "Chicago White Sox": "cws_l", "Chicago Cubs": "chc_l", "Cincinnati Reds": "cin_l", "Cleveland Guardians": "cle_l",
    "Colorado Rockies": "col_l", "Detroit Tigers": "det_l", "Houston Astros": "hou_l", "Kansas City Royals": "kc_l",
    "Los Angeles Angels": "laa_l", "Los Angeles Dodgers": "lad_l", "Miami Marlins": "mia_l", "Milwaukee Brewers": "mil_l",
    "Minnesota Twins": "min_l", "New York Yankees": "nyy_l", "New York Mets": "nym_l", "Athletics": "oak_l", "Oakland Athletics": "oak_l",
    "Philadelphia Phillies": "phi_l", "Pittsburgh Pirates": "pit_l", "San Diego Padres": "sd_l", "San Francisco Giants": "sf_l",
    "Seattle Mariners": "sea_l", "St. Louis Cardinals": "stl_l", "Tampa Bay Rays": "tb_l", "Texas Rangers": "tex_l",
    "Toronto Blue Jays": "tor_l", "Washington Nationals": "wsh_l"
  };
  
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


function getTeamAbbreviation(teamName) {
  const teamAbbrMap = {
    "Arizona Diamondbacks": "ARI", "Atlanta Braves": "ATL", "Baltimore Orioles": "BAL", "Boston Red Sox": "BOS",
    "Chicago White Sox": "CWS", "Chicago Cubs": "CHC", "Cincinnati Reds": "CIN", "Cleveland Guardians": "CLE",
    "Colorado Rockies": "COL", "Detroit Tigers": "DET", "Houston Astros": "HOU", "Kansas City Royals": "KC",
    "Los Angeles Angels": "LAA", "Los Angeles Dodgers": "LAD", "Miami Marlins": "MIA", "Milwaukee Brewers": "MIL",
    "Minnesota Twins": "MIN", "New York Yankees": "NYY", "New York Mets": "NYM", "Athletics": "ATH",
    "Philadelphia Phillies": "PHI", "Pittsburgh Pirates": "PIT", "San Diego Padres": "SD", "San Francisco Giants": "SF",
    "Seattle Mariners": "SEA", "St. Louis Cardinals": "STL", "Tampa Bay Rays": "TB", "Texas Rangers": "TEX",
    "Toronto Blue Jays": "TOR", "Washington Nationals": "WSH"
  };
  
  return teamAbbrMap[teamName] || teamName.substring(0, 3).toUpperCase();
}

function onYearChange() {
  const yearSelector = document.getElementById('yearSelector');
  const selectedYear = parseInt(yearSelector.value);
  
  if (selectedPlayer) {
    loadPlayerStats(selectedPlayer.person.id, selectedYear);
  }
}

// Fetch all MLB players for league-wide comparison
async function fetchAllMLBPlayers() {
  if (allMLBPlayers.length > 0) {
    return allMLBPlayers;
  }

  try {
    console.log('Fetching all MLB players...');
    
    // Get all teams first
    const teamsResponse = await fetch('https://statsapi.mlb.com/api/v1/teams?sportId=1');
    const teamsData = await teamsResponse.json();
    
    // Fetch rosters for all teams
    const rosterPromises = teamsData.teams.map(async (team) => {
      try {
        const rosterResponse = await fetch(`https://statsapi.mlb.com/api/v1/teams/${team.id}/roster`);
        const rosterData = await rosterResponse.json();
        return rosterData.roster?.map(player => {
          const firstName = player.person.firstName || '';
          const lastName = player.person.lastName || '';
          const fullName = player.person.fullName || `${firstName} ${lastName}`;
          const isPitcher = player.position.code === "1";
          const isTwoWayPlayer = player.position.abbreviation === "TWP";
          
          // For TWP players, we'll create entries for both pitcher and hitter roles
          if (isTwoWayPlayer) {
            return [
              // TWP as pitcher
              {
                id: player.person.id,
                firstName: firstName,
                lastName: lastName,
                displayName: fullName,
                team: team.name,
                jersey: player.jerseyNumber || '--',
                position: "P",
                positionCode: "1", // Treat as pitcher
                headshot: player.person.id ? 
                  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.person.id}/headshot/67/current` : 
                  'icon.png',
                teamName: team.name,
                teamId: team.id,
                originalPlayer: player,
                isTwoWayPlayer: true,
                twoWayRole: "Pitcher"
              },
              // TWP as hitter
              {
                id: player.person.id + '_hitter', // Different ID for hitter role
                originalId: player.person.id, // Keep original ID for stats
                firstName: firstName,
                lastName: lastName,
                displayName: fullName,
                team: team.name,
                jersey: player.jerseyNumber || '--',
                position: "DH", // Treat as designated hitter
                positionCode: "10", // DH position code
                headshot: player.person.id ? 
                  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.person.id}/headshot/67/current` : 
                  'icon.png',
                teamName: team.name,
                teamId: team.id,
                originalPlayer: player,
                isTwoWayPlayer: true,
                twoWayRole: "Hitter"
              }
            ];
          } else {
            return {
              id: player.person.id,
              firstName: firstName,
              lastName: lastName,
              displayName: fullName,
              team: team.name,
              jersey: player.jerseyNumber || '--',
              position: isPitcher ? "P" : player.position.abbreviation,
              positionCode: player.position.code,
              headshot: player.person.id ? 
                `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.person.id}/headshot/67/current` : 
                'icon.png',
              teamName: team.name,
              teamId: team.id,
              originalPlayer: player
            };
          }
        }).flat() || []; // Use flat() to handle TWP arrays
      } catch (error) {
        console.error(`Error fetching roster for team ${team.name}:`, error);
        return [];
      }
    });
    
    const allRosters = await Promise.all(rosterPromises);
    allMLBPlayers = allRosters.flat();
    
    console.log(`Loaded ${allMLBPlayers.length} MLB players for comparison`);
    return allMLBPlayers;
  } catch (error) {
    console.error('Error fetching all MLB players:', error);
    return [];
  }
}

// Show player comparison modal
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

    // Create players header with year selectors
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
      flex-direction: column;
      align-items: center;
      gap: 15px;
      padding: 15px;
      background-color: #f8f9fa;
      border-radius: 8px;
      position: relative;
    `;
    
    const currentYear = new Date().getFullYear();
    const startYear = 2022; // Start from 2022 instead of going back 10 years
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
      <div style="display: flex; align-items: center; gap: 15px;">
        <img src="${player1.headshot}" alt="${player1.firstName} ${player1.lastName}" 
             style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;" 
             onerror="this.src='icon.png';">
        <div style="text-align: center;">
          <div class="player-name-display" style="font-size: 1.2rem; font-weight: bold; color: #333;">
            ${player1.firstName} ${player1.lastName}
          </div>
          <div style="font-size: 1rem; color: #777;">
            #${player1.jersey} | ${player1.position}
          </div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        
        <select id="player1YearSelector" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
          ${Array.from({length: currentYear - startYear + 1}, (_, i) => currentYear - i).map(year => 
            `<option value="${year}" ${year === currentYear ? 'selected' : ''}>${year}</option>`
          ).join('')}
        </select>
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
      <div style="display: flex; align-items: center; gap: 15px; flex-direction: row-reverse;">
        <img src="${player2.headshot}" alt="${player2.firstName} ${player2.lastName}" 
             style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;" 
             onerror="this.src='icon.png';">
        <div style="text-align: center;">
          <div class="player-name-display" style="font-size: 1.2rem; font-weight: bold; color: #333;">
            ${player2.firstName} ${player2.lastName}
          </div>
          <div style="font-size: 1rem; color: #777;">
            #${player2.jersey} | ${player2.position}
          </div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        
        <select id="player2YearSelector" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
          ${Array.from({length: currentYear - startYear + 1}, (_, i) => currentYear - i).map(year => 
            `<option value="${year}" ${year === currentYear ? 'selected' : ''}>${year}</option>`
          ).join('')}
        </select>
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

    // Add year selector event listeners
    const player1YearSelector = document.getElementById('player1YearSelector');
    const player2YearSelector = document.getElementById('player2YearSelector');
    
    const updateComparison = async () => {
      const year1 = parseInt(player1YearSelector.value);
      const year2 = parseInt(player2YearSelector.value);
      statsComparisonContainer.innerHTML = '<div style="text-align: center; padding: 20px;">Loading comparison statistics...</div>';
      await displayPlayerComparison(player1, player2, year1, year2, statsComparisonContainer);
    };

    player1YearSelector.addEventListener('change', updateComparison);
    player2YearSelector.addEventListener('change', updateComparison);

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

    // Load initial comparison
    await displayPlayerComparison(player1, player2, currentYear, currentYear, statsComparisonContainer);

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

async function displayPlayerComparison(player1, player2, year1, year2, container) {
  try {
    // Determine if players are pitchers
    // Check multiple possible pitcher position formats
    const isPitcher1 = player1.position === 'P' || 
                       player1.position === 'Pitcher' ||
                       player1.position === 'SP' ||
                       player1.position === 'RP' ||
                       player1.position === 'CP' ||
                       (player1.isTwoWayPlayer && (player1.twoWayRole === 'pitcher' || player1.twoWayRole === 'Pitcher'));
    const isPitcher2 = player2.position === 'P' || 
                       player2.position === 'Pitcher' ||
                       player2.position === 'SP' ||
                       player2.position === 'RP' ||
                       player2.position === 'CP' ||
                       (player2.isTwoWayPlayer && (player2.twoWayRole === 'pitcher' || player2.twoWayRole === 'Pitcher'));
    
    console.log('Position comparison debug:', {
      player1: { 
        name: `${player1.firstName} ${player1.lastName}`,
        position: player1.position, 
        isTwoWayPlayer: player1.isTwoWayPlayer, 
        twoWayRole: player1.twoWayRole, 
        isPitcher: isPitcher1 
      },
      player2: { 
        name: `${player2.firstName} ${player2.lastName}`,
        position: player2.position, 
        isTwoWayPlayer: player2.isTwoWayPlayer, 
        twoWayRole: player2.twoWayRole, 
        isPitcher: isPitcher2 
      },
      comparison: `${isPitcher1} !== ${isPitcher2} = ${isPitcher1 !== isPitcher2}`
    });
    
    // Ensure both players are of the same type
    if (isPitcher1 !== isPitcher2) {
      console.log('Blocking comparison: mixed pitcher/hitter types');
      container.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Can only compare pitchers with pitchers and hitters with hitters.</div>';
      return;
    }
    
    console.log('Allowing comparison: both players are', isPitcher1 ? 'pitchers' : 'hitters');

    if (!isPitcher1) {
      // Hitting comparison
      const [player1Response, player2Response, allPlayersResponse] = await Promise.all([
        fetch(`https://statsapi.mlb.com/api/v1/people/${player1.id}/stats?stats=season&group=hitting&season=${year1}`),
        fetch(`https://statsapi.mlb.com/api/v1/people/${player2.id}/stats?stats=season&group=hitting&season=${year2}`),
        fetch(`https://statsapi.mlb.com/api/v1/stats?stats=season&group=hitting&season=${Math.max(year1, year2)}&gameType=R&sportId=1&limit=2000&playerPool=all`)
      ]);

      const [player1Data, player2Data, allPlayersData] = await Promise.all([
        player1Response.json(),
        player2Response.json(),
        allPlayersResponse.json()
      ]);

      const player1Stats = player1Data.stats?.[0]?.splits?.[0]?.stat;
      const player2Stats = player2Data.stats?.[0]?.splits?.[0]?.stat;

      if (!player1Stats && !player2Stats) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;">No statistics available for comparison</div>';
        return;
      }

      // Define hitting stats to compare
      const hittingStats = [
        { key: "avg", label: "Avg", higherIsBetter: true },
        { key: "homeRuns", label: "HR", higherIsBetter: true },
        { key: "rbi", label: "RBI", higherIsBetter: true },
        { key: "obp", label: "OBP", higherIsBetter: true },
        { key: "slg", label: "SLG", higherIsBetter: true },
        { key: "ops", label: "OPS", higherIsBetter: true },
        { key: "hits", label: "Hits", higherIsBetter: true },
        { key: "runs", label: "Runs", higherIsBetter: true },
        { key: "stolenBases", label: "SB", higherIsBetter: true },
        { key: "strikeOuts", label: "SO", higherIsBetter: false }
      ];

      // Create comparison HTML
      let comparisonHTML = '<div style="display: flex; flex-direction: column; gap: 15px;">';
      
      hittingStats.forEach((statDef) => {
        const stat1Value = player1Stats?.[statDef.key] || (statDef.key.includes('avg') || statDef.key.includes('obp') || statDef.key.includes('slg') || statDef.key.includes('ops') ? '.000' : '0');
        const stat2Value = player2Stats?.[statDef.key] || (statDef.key.includes('avg') || statDef.key.includes('obp') || statDef.key.includes('slg') || statDef.key.includes('ops') ? '.000' : '0');
        
        // Convert to numbers for comparison
        const num1 = parseFloat(stat1Value) || 0;
        const num2 = parseFloat(stat2Value) || 0;
        
        // Determine which is better
        let player1Better = false;
        let player2Better = false;
        
        if (num1 !== 0 && num2 !== 0) {
          if (statDef.higherIsBetter) {
            player1Better = num1 > num2;
            player2Better = num2 > num1;
          } else {
            player1Better = num1 < num2;
            player2Better = num2 < num1;
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
      container.innerHTML = comparisonHTML;

    } else {
      // Pitching comparison
      const [player1Response, player2Response, allPlayersResponse] = await Promise.all([
        fetch(`https://statsapi.mlb.com/api/v1/people/${player1.id}/stats?stats=season&group=pitching&season=${year1}`),
        fetch(`https://statsapi.mlb.com/api/v1/people/${player2.id}/stats?stats=season&group=pitching&season=${year2}`),
        fetch(`https://statsapi.mlb.com/api/v1/stats?stats=season&group=pitching&season=${Math.max(year1, year2)}&gameType=R&sportId=1&limit=2000&playerPool=all`)
      ]);

      const [player1Data, player2Data, allPlayersData] = await Promise.all([
        player1Response.json(),
        player2Response.json(),
        allPlayersResponse.json()
      ]);

      const player1Stats = player1Data.stats?.[0]?.splits?.[0]?.stat;
      const player2Stats = player2Data.stats?.[0]?.splits?.[0]?.stat;

      if (!player1Stats && !player2Stats) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;">No statistics available for comparison</div>';
        return;
      }

      // Define pitching stats to compare
      const pitchingStats = [
        { key: "era", label: "ERA", higherIsBetter: false },
        { key: "whip", label: "WHIP", higherIsBetter: false },
        { key: "wins", label: "Wins", higherIsBetter: true },
        { key: "strikeOuts", label: "SO", higherIsBetter: true },
        { key: "saves", label: "Saves", higherIsBetter: true },
        { key: "inningsPitched", label: "IP", higherIsBetter: true },
        { key: "baseOnBalls", label: "BB", higherIsBetter: false },
        { key: "losses", label: "L", higherIsBetter: false },
        { key: "hits", label: "H", higherIsBetter: false },
        { key: "homeRuns", label: "HR", higherIsBetter: false }
      ];

      // Create comparison HTML
      let comparisonHTML = '<div style="display: flex; flex-direction: column; gap: 15px;">';
      
      pitchingStats.forEach((statDef) => {
        const stat1Value = player1Stats?.[statDef.key] || (statDef.key.includes('era') || statDef.key.includes('whip') ? '0.00' : '0');
        const stat2Value = player2Stats?.[statDef.key] || (statDef.key.includes('era') || statDef.key.includes('whip') ? '0.00' : '0');
        
        // Convert to numbers for comparison
        const num1 = parseFloat(stat1Value) || 0;
        const num2 = parseFloat(stat2Value) || 0;
        
        // Determine which is better
        let player1Better = false;
        let player2Better = false;
        
        if (num1 !== 0 && num2 !== 0) {
          if (statDef.higherIsBetter) {
            player1Better = num1 > num2;
            player2Better = num2 > num1;
          } else {
            player1Better = num1 < num2;
            player2Better = num2 < num1;
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
      container.innerHTML = comparisonHTML;
    }
  } catch (error) {
    console.error('Error in displayPlayerComparison:', error);
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error loading comparison statistics</div>';
  }
}

async function showPlayerSelectionInterface(playerNumber, modal, modalContent, currentPlayer1, currentPlayer2) {
  try {
    console.log(`Clearing player ${playerNumber}`);
    
    // Get all MLB players
    const allPlayers = await fetchAllMLBPlayers();
    
    // Find the specific player header to replace by ID
    const headerToReplace = modalContent.querySelector(`#player${playerNumber}-header`);
    
    if (!headerToReplace) {
      console.error(`Could not find header for player ${playerNumber}`);
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
    searchInput.placeholder = 'Search any MLB player...';
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
        // Determine what type of player we're looking for based on the remaining player
        const remainingPlayer = playerNumber === "1" ? currentPlayer2 : currentPlayer1;
        const needsPitcher = remainingPlayer.position === 'P' || 
                           (remainingPlayer.isTwoWayPlayer && (remainingPlayer.twoWayRole === 'pitcher' || remainingPlayer.twoWayRole === 'Pitcher'));
        
        console.log('Search interface - looking for:', needsPitcher ? 'pitchers' : 'hitters');
        
        const filteredPlayers = allPlayers
          .filter(player => {
            const fullName = `${player.firstName || ''} ${player.lastName || ''}`.toLowerCase();
            const displayName = (player.displayName || '').toLowerCase();
            const teamName = (player.team || '').toLowerCase();
            const playerIsPitcher = player.positionCode === "1";
            
            // Check if query matches player name first (prioritize name over team)
            const nameMatch = fullName.includes(query) || displayName.includes(query);
            const teamMatch = teamName.includes(query);
            
            // For position matching, handle TWP players and regular players
            let positionMatch = false;
            if (needsPitcher) {
              // If we need a pitcher, show pitchers (including TWP pitchers)
              positionMatch = playerIsPitcher;
            } else {
              // If we need a hitter, show hitters (including TWP hitters)
              positionMatch = !playerIsPitcher;
            }
            
            // Exclude the remaining player
            const excludeRemaining = (player.originalId || player.id) !== remainingPlayer.id;
            
            // Prioritize name matches over team matches
            return (nameMatch || teamMatch) && excludeRemaining && positionMatch;
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
              <img src="${player.headshot}" alt="${player.displayName}" 
                   style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;" 
                   onerror="this.src='icon.png';">
              <div>
                <div style="font-weight: bold; color: #333;">${player.displayName}${player.isTwoWayPlayer ? ` (${player.twoWayRole})` : ''}</div>
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
                // Parse the display name properly to get firstName and lastName
                const displayName = player.displayName || `${player.firstName || ''} ${player.lastName || ''}`.trim();
                const nameParts = displayName.split(' ');
                const parsedFirstName = player.firstName || (nameParts.length > 1 ? nameParts[0] : '');
                const parsedLastName = player.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0]);
                
                const newPlayer = {
                  id: player.originalId || player.id,
                  firstName: parsedFirstName,
                  lastName: parsedLastName,
                  fullName: displayName,
                  jersey: player.jersey || 'N/A',
                  position: player.position || 'N/A',
                  headshot: player.headshot || 'icon.png',
                  isTwoWayPlayer: player.isTwoWayPlayer || false,
                  twoWayRole: player.twoWayRole || null
                };
                
                console.log('Replacement player for comparison:', newPlayer);
                console.log('Parsed replacement names - First:', parsedFirstName, 'Last:', parsedLastName);
                
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
          const positionText = needsPitcher ? 'pitchers' : 'hitters';
          searchResults.innerHTML = `<div style="padding: 10px; color: #777; text-align: center;">No ${positionText} found</div>`;
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

// Update comparison stats when year changes
async function updatePlayerComparisonStats(playerNumber) {
  const yearSelector = document.getElementById(`player${playerNumber}Year`);
  const statsContainer = document.getElementById(`player${playerNumber}Stats`);
  const player = playerNumber === 1 ? window.comparisonPlayer1 : window.comparisonPlayer2;
  
  const selectedYear = parseInt(yearSelector.value);
  
  statsContainer.innerHTML = '<div class="loading">Loading stats...</div>';
  
  try {
    await loadPlayerStatsForComparison(player.id, selectedYear, statsContainer);
  } catch (error) {
    console.error('Error loading comparison stats:', error);
    statsContainer.innerHTML = '<div class="error">Error loading stats</div>';
  }
}

// Load player stats for comparison
async function loadPlayerStatsForComparison(playerId, year, container) {
  try {
    // First determine if player is a pitcher
    const playerInfoResponse = await fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}`);
    const playerInfoData = await playerInfoResponse.json();
    const playerInfo = playerInfoData.people[0];
    
    let isPitcher = false;
    if (playerInfo.primaryPosition) {
      isPitcher = playerInfo.primaryPosition.abbreviation === 'P';
    }
    
    if (!isPitcher) {
      // Load hitting stats for comparison
      const [playerResponse, allPlayersResponse] = await Promise.all([
        fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=hitting&season=${year}`),
        fetch(`https://statsapi.mlb.com/api/v1/stats?stats=season&group=hitting&season=${year}&gameType=R&sportId=1&limit=2000&playerPool=all`)
      ]);
      
      const playerData = await playerResponse.json();
      const allPlayersData = await allPlayersResponse.json();
      
      if (playerData.stats && playerData.stats.length > 0 && playerData.stats[0].splits && playerData.stats[0].splits.length > 0) {
        const splitForYear = playerData.stats[0].splits[0];
        const playerStats = splitForYear.stat;
        
        // Get team info for the year
        let teamNameForYear = splitForYear.team && splitForYear.team.name ? splitForYear.team.name : "";
        let teamLogoUrl = "";
        if (teamNameForYear) {
          teamLogoUrl = await getStandardLogoUrl(teamNameForYear);
        }
        
        // Calculate rankings
        const rankings = calculatePlayerStatRankings(allPlayersData, playerStats);
        
        container.innerHTML = `
          <div class="comparison-player-header">
            <img src="${teamLogoUrl}" alt="${teamNameForYear}" 
              class="comparison-team-logo" 
              style="height:30px;max-width:40px;" 
              onerror="this.src='icon.png';">
            <span class="comparison-year-label">${year} Hitting Stats</span>
          </div>
          <div class="comparison-stats-grid">
            <div class="comparison-stat-item">
              <div class="comparison-stat-value">${playerStats.avg || '.000'}</div>
              <div class="comparison-stat-label">AVG</div>
              ${rankings.avg ? `<div class="comparison-stat-rank">#${rankings.avg}</div>` : ''}
            </div>
            <div class="comparison-stat-item">
              <div class="comparison-stat-value">${playerStats.homeRuns || 0}</div>
              <div class="comparison-stat-label">HR</div>
              ${rankings.homeRuns ? `<div class="comparison-stat-rank">#${rankings.homeRuns}</div>` : ''}
            </div>
            <div class="comparison-stat-item">
              <div class="comparison-stat-value">${playerStats.rbi || 0}</div>
              <div class="comparison-stat-label">RBI</div>
              ${rankings.rbi ? `<div class="comparison-stat-rank">#${rankings.rbi}</div>` : ''}
            </div>
            <div class="comparison-stat-item">
              <div class="comparison-stat-value">${playerStats.ops || '.000'}</div>
              <div class="comparison-stat-label">OPS</div>
              ${rankings.ops ? `<div class="comparison-stat-rank">#${rankings.ops}</div>` : ''}
            </div>
            <div class="comparison-stat-item">
              <div class="comparison-stat-value">${playerStats.hits || 0}</div>
              <div class="comparison-stat-label">Hits</div>
              ${rankings.hits ? `<div class="comparison-stat-rank">#${rankings.hits}</div>` : ''}
            </div>
            <div class="comparison-stat-item">
              <div class="comparison-stat-value">${playerStats.runs || 0}</div>
              <div class="comparison-stat-label">Runs</div>
              ${rankings.runs ? `<div class="comparison-stat-rank">#${rankings.runs}</div>` : ''}
            </div>
            <div class="comparison-stat-item">
              <div class="comparison-stat-value">${playerStats.stolenBases || 0}</div>
              <div class="comparison-stat-label">SB</div>
              ${rankings.stolenBases ? `<div class="comparison-stat-rank">#${rankings.stolenBases}</div>` : ''}
            </div>
            <div class="comparison-stat-item">
              <div class="comparison-stat-value">${playerStats.obp || '.000'}</div>
              <div class="comparison-stat-label">OBP</div>
              ${rankings.obp ? `<div class="comparison-stat-rank">#${rankings.obp}</div>` : ''}
            </div>
          </div>
        `;
      } else {
        container.innerHTML = `<div class="no-stats">No hitting stats available for ${year}</div>`;
      }
    } else {
      // Load pitching stats for comparison
      const [playerResponse, allPlayersResponse] = await Promise.all([
        fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=pitching&season=${year}`),
        fetch(`https://statsapi.mlb.com/api/v1/stats?stats=season&group=pitching&season=${year}&gameType=R&sportId=1&limit=2000&playerPool=all`)
      ]);
      
      const playerData = await playerResponse.json();
      const allPlayersData = await allPlayersResponse.json();
      
      if (playerData.stats && playerData.stats.length > 0 && playerData.stats[0].splits && playerData.stats[0].splits.length > 0) {
        const splitForYear = playerData.stats[0].splits[0];
        const playerStats = splitForYear.stat;
        
        // Get team info for the year
        let teamNameForYear = splitForYear.team && splitForYear.team.name ? splitForYear.team.name : "";
        let teamLogoUrl = "";
        if (teamNameForYear) {
          teamLogoUrl = await getStandardLogoUrl(teamNameForYear);
        }
        
        // Calculate rankings
        const rankings = calculatePitcherStatRankings(allPlayersData, playerStats);
        
        container.innerHTML = `
          <div class="comparison-player-header">
            <img src="${teamLogoUrl}" alt="${teamNameForYear}" 
              class="comparison-team-logo" 
              style="height:30px;max-width:40px;" 
              onerror="this.src='icon.png';">
            <span class="comparison-year-label">${year} Pitching Stats</span>
          </div>
          <div class="comparison-stats-grid">
            <div class="comparison-stat-item">
              <div class="comparison-stat-value">${playerStats.era || '0.00'}</div>
              <div class="comparison-stat-label">ERA</div>
              ${rankings.era ? `<div class="comparison-stat-rank">#${rankings.era}</div>` : ''}
            </div>
            <div class="comparison-stat-item">
              <div class="comparison-stat-value">${playerStats.wins || 0}</div>
              <div class="comparison-stat-label">Wins</div>
              ${rankings.wins ? `<div class="comparison-stat-rank">#${rankings.wins}</div>` : ''}
            </div>
            <div class="comparison-stat-item">
              <div class="comparison-stat-value">${playerStats.strikeOuts || 0}</div>
              <div class="comparison-stat-label">SO</div>
              ${rankings.strikeOuts ? `<div class="comparison-stat-rank">#${rankings.strikeOuts}</div>` : ''}
            </div>
            <div class="comparison-stat-item">
              <div class="comparison-stat-value">${playerStats.whip || '0.00'}</div>
              <div class="comparison-stat-label">WHIP</div>
              ${rankings.whip ? `<div class="comparison-stat-rank">#${rankings.whip}</div>` : ''}
            </div>
            <div class="comparison-stat-item">
              <div class="comparison-stat-value">${playerStats.inningsPitched || '0.0'}</div>
              <div class="comparison-stat-label">IP</div>
              ${rankings.inningsPitched ? `<div class="comparison-stat-rank">#${rankings.inningsPitched}</div>` : ''}
            </div>
            <div class="comparison-stat-item">
              <div class="comparison-stat-value">${playerStats.saves || 0}</div>
              <div class="comparison-stat-label">Saves</div>
              ${rankings.saves ? `<div class="comparison-stat-rank">#${rankings.saves}</div>` : ''}
            </div>
            <div class="comparison-stat-item">
              <div class="comparison-stat-value">${playerStats.baseOnBalls || 0}</div>
              <div class="comparison-stat-label">BB</div>
              ${rankings.baseOnBalls ? `<div class="comparison-stat-rank">#${rankings.baseOnBalls}</div>` : ''}
            </div>
            <div class="comparison-stat-item">
              <div class="comparison-stat-value">${playerStats.hits || 0}</div>
              <div class="comparison-stat-label">Hits</div>
              ${rankings.hits ? `<div class="comparison-stat-rank">#${rankings.hits}</div>` : ''}
            </div>
          </div>
        `;
      } else {
        container.innerHTML = `<div class="no-stats">No pitching stats available for ${year}</div>`;
      }
    }
  } catch (error) {
    console.error('Error loading player stats for comparison:', error);
    container.innerHTML = '<div class="error">Error loading stats</div>';
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
    showCopyFeedback('Error copying image', 'error');
  }
}

async function captureAndCopyImage(element) {
  try {
    
    showFeedback('Capturing image...', 'loading');
    
    // Replace all external images with base64 versions or remove them
    const images = element.querySelectorAll('img');

    for (const img of images) {
      try {
        // For MLB headshots and logos, replace with a placeholder or try to convert
        if (img.src.includes('mlbstatic.com') || img.src.includes('http')) {
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
    
    // Check if selected player is a Two-Way Player (TWP) for height adjustment
    const isTwoWayPlayer = selectedPlayer && selectedPlayer.position && selectedPlayer.position.abbreviation === "TWP";
    const heightAdjustment = isTwoWayPlayer ? 80 : 30;

    // Capture the element with html2canvas using exact element dimensions
    const canvas = await html2canvas(element, {
      backgroundColor: '#1a1a1a', // Set the actual background color
      scale: 3, // Use scale 3 to avoid logo scaling issues
      useCORS: true,
      allowTaint: false, // Allow tainted canvas for better compatibility
      logging: false,
      width: isSmallScreen ? element.clientWidth : element.clientWidth - 30,
      height: isSmallScreen ? element.clientHeight : element.clientHeight + heightAdjustment,
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
            showFeedback('Could not copy game log to clipboard. Try again', 'error');
          }
        }
      } catch (clipboardError) {
        showFeedback('Could not copy game log to clipboard. Try again', 'error');
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

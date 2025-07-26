let currentTeam = null;
let currentTeamId = null;
let currentPage = 1;
let allRecentMatches = [];
let matchesPerPage = 4;
let currentRosterPage = 1;
let allRosterPlayers = [];
let playersPerPage = 4;
let selectedPlayer = null;

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
      // No game today, look for the next upcoming game
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30); // Look ahead 30 days
      
      const upcomingResponse = await fetch(`https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&teamId=${currentTeamId}&startDate=${tomorrow.toISOString().split('T')[0]}&endDate=${endDate.toISOString().split('T')[0]}`);
      const upcomingData = await upcomingResponse.json();
      
      const allUpcomingGames = [];
      upcomingData.dates?.forEach(dateObj => {
        allUpcomingGames.push(...dateObj.games);
      });
      
      // Find the next scheduled game
      const nextGame = allUpcomingGames
        .filter(game => ["Scheduled", "Pre-Game", "Warmup"].includes(game.status.detailedState))
        .sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate))[0];
      
      if (nextGame) {
        const gameCard = await createCurrentGameCard(nextGame);
        contentDiv.innerHTML = gameCard;
        
        // Add click handler for next game
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
        contentDiv.innerHTML = '<div class="no-data">No upcoming games found</div>';
      }
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
            <div style="font-weight: bold; margin-bottom: 8px;">Position in ${shortDivisionName}</div>
            <div style="margin-bottom: 4px;">Record: ${wins}-${losses} (${winPercent})</div>
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
            <div style="margin-top: 10px; color: #666;">
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
          <div style="margin-top: 10px; color: #666;">
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
  
  contentDiv.innerHTML = `
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
  
  return `
    <div class="player-card" data-player-id="${player.person.id}" onclick="showPlayerDetails(${player.person.id})">
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
  // Find the player in the roster
  selectedPlayer = allRosterPlayers.find(player => player.person.id === playerId);
  
  if (!selectedPlayer) return;
  
  // Get or create the player details section
  let playerDetailsSection = document.getElementById('playerDetailsSection');
  if (!playerDetailsSection) {
    playerDetailsSection = document.createElement('div');
    playerDetailsSection.id = 'playerDetailsSection';
    playerDetailsSection.className = 'player-details-section';
    document.body.appendChild(playerDetailsSection);
  }
  
  // Create the player details content
  const jerseyNumber = selectedPlayer.jerseyNumber || '--';
  const position = selectedPlayer.position.name;
  const currentYear = new Date().getFullYear();
  
  // Show initial loading state
  playerDetailsSection.innerHTML = `
    <div class="player-details-container">
      <div class="player-details-header">
        <button class="close-player-details" onclick="closePlayerDetails()">×</button>
        <div class="player-details-info">
          <h2 class="player-details-name">${selectedPlayer.person.fullName} • ${position} • #${jerseyNumber}</h2>
        </div>
        <div class="player-year-selector">
          <label for="yearSelector">Year:</label>
          <select id="yearSelector" onchange="onYearChange()">
            <option value="${currentYear}">${currentYear}</option>
            <option value="${currentYear - 1}">${currentYear - 1}</option>
            <option value="${currentYear - 2}">${currentYear - 2}</option>
            <option value="${currentYear - 3}">${currentYear - 3}</option>
          </select>
        </div>
      </div>
      <div class="player-stats-content">
        <div class="loading-stats">Loading player statistics...</div>
      </div>
    </div>
  `;
  
  // Show the section
  playerDetailsSection.style.display = 'block';
  
  // Scroll to the player details section
  playerDetailsSection.scrollIntoView({ behavior: 'smooth' });
  
  // Load player statistics
  await loadPlayerStats(playerId, currentYear);
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
    scoreDisplay = "vs";
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
    resultText = "vs";
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
        </span>
        <div class="match-team-info">
          <img src="${opponentLogo}" alt="${opponent.team.name}" class="match-team-logo" onerror="this.src='icon.png';">
          <span class="match-team-name">${getTeamAbbreviation(opponent.team.name)}</span>
        </div>
      </div>
      <div class="match-date">${formattedDate}</div>
    </div>
  `;
}

// Utility functions (updated to match teams.js)
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

// For top section - varied logos (mix of _d and _l)
async function getLogoUrl(teamName) {
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
    "Minnesota Twins": "min_l", "New York Yankees": "nyy_l", "New York Mets": "nym_l", "Athletics": "oak_l",
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

function closePlayerDetails() {
  const playerDetailsSection = document.getElementById('playerDetailsSection');
  if (playerDetailsSection) {
    playerDetailsSection.style.display = 'none';
  }
}

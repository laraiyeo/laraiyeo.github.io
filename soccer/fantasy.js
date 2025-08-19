// Fantasy Soccer JavaScript
const LEAGUES = {
  "Premier League": { code: "eng.1", logo: "23" },
  "La Liga": { code: "esp.1", logo: "15" },
  "Bundesliga": { code: "ger.1", logo: "10" },
  "Serie A": { code: "ita.1", logo: "12" },
  "Ligue 1": { code: "fra.1", logo: "9" },
  "MLS": { code: "usa.1", logo: "19" },
  "Saudi PL": { code: "ksa.1", logo: "2488" }
};

let currentLeague = localStorage.getItem("currentLeague") || "eng.1"; // Default to Premier League if not set
let currentTeamPage = 1; // Track which page we're on (1: games, 2: player stats, 3: player selector)
let selectedPlayer = null; // Currently selected player for page 2
let selectedPosition = null; // Position for player selection (page 3)
let allLeaguePlayers = []; // Store all players from current league
let fantasyTeam = {}; // User's fantasy team - will be loaded per league
let leaguePlayersCache = {}; // Cache for league players to avoid re-fetching
let leagueLoadingPromises = {}; // Track ongoing loading promises to prevent duplicates
let totalFP = 0; // Global variable to track total fantasy points

// Formation constraints
const FORMATION_CONSTRAINTS = {
  FWD: { min: 2, max: 6 }, // 2 minimum, 6 maximum forwards
  MID: { min: 2, max: 6 }, // 2 minimum, 6 maximum midfielders  
  DEF: { min: 2, max: 6 }, // 2 minimum, 6 maximum defenders
  GK: { min: 1, max: 2 }   // 1 minimum, 2 maximum goalkeepers
};

const MAX_TOTAL_PLAYERS = 11;

// Convert HTTP URLs to HTTPS to avoid mixed content issues
function convertToHttps(url) {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

// Fantasy Points calculation based on scoring system
function calculateFantasyPoints(stats, position) {
  if (!stats || typeof stats !== 'object') return 0;
  
  let points = 0;
  
  // Playing time points
  const minutesPlayed = parseFloat(stats.minutes || (stats.MIN && stats.MIN.value) || stats.MIN || 0);
  if (minutesPlayed > 0) {
    if (minutesPlayed >= 60) {
      points += 2; // Playing more than 60 minutes
    } else {
      points += 1; // Playing 1-60 minutes exact
    }
  }
  
  // Goal scoring points (position dependent)
  const goals = parseFloat(stats.goals || (stats.G && stats.G.value) || stats.G || 0);
  if (goals > 0) {
    switch (position) {
      case 'GK':
        points += goals * 10; // Goalkeeper goal
        break;
      case 'DEF':
        points += goals * 6; // Defender goal
        break;
      case 'MID':
        points += goals * 5; // Midfielder goal
        break;
      case 'FWD':
        points += goals * 4; // Forward goal
        break;
    }
  }
  
  // Assists
  const assists = parseFloat(stats.assists || (stats.A && stats.A.value) || stats.A || 0);
  points += assists * 3;
  
  // Clean sheets (defenders, goalkeepers, midfielders)
  const cleanSheets = parseFloat(stats.cleanSheet || (stats.CS && stats.CS.value) || stats.CS || 0);
  if (cleanSheets > 0) {
    if (position === 'DEF' || position === 'GK') {
      points += cleanSheets * 4;
    } else if (position === 'MID') {
      points += cleanSheets * 1;
    }
  }
  
  // Goalkeeper specific stats
  if (position === 'GK') {
    const saves = parseFloat(stats.saves || (stats.SV && stats.SV.value) || stats.SV || 0);
    points += Math.floor(saves / 3) * 1; // Every 3 shots saved = 1 point
    
    const penaltiesSaved = parseFloat(stats.penaltyKicksSaved || (stats.PKS && stats.PKS.value) || stats.PKS || 0);
    points += penaltiesSaved * 5;
  }
  
  // Defensive contributions
  const tackles = parseFloat(stats.effectiveTackles || stats.totalTackles || (stats.TKLW && stats.TKLW.value) || stats.TKLW || (stats.TOT && stats.TOT.value) || stats.TOT || 0);
  const interceptions = parseFloat(stats.interceptions || (stats.INT && stats.INT.value) || stats.INT || 0);
  const clearances = parseFloat(stats.totalClearance || stats.effectiveClearance || (stats.CLEAR && stats.CLEAR.value) || stats.CLEAR || 0);
  const shotsBlocked = parseFloat(stats.blockedShots || (stats.SHBLK && stats.SHBLK.value) || stats.SHBLK || 0);
  
  const defensiveContributions = tackles + interceptions + clearances + shotsBlocked;
  
  if (position === 'DEF' || position === 'MID') {
    points += Math.floor(defensiveContributions / 10) * 2; // Every 10 contributions = 2 points
  } else if (position === 'FWD') {
    points += Math.floor(defensiveContributions / 12) * 2; // Every 12 contributions = 2 points
  }
  
  // Negative points
  const penaltiesMissed = parseFloat(stats.penaltiesMissed || stats.penaltyMisses || 0);
  points -= penaltiesMissed * 2;
  
  const goalsConceded = parseFloat(stats.goalsConceded || (stats.GA && stats.GA.value) || stats.GA || 0);
  points -= Math.floor(goalsConceded / 2) * 1; // Every 2 goals conceded = -1 point
  
  const yellowCards = parseFloat(stats.yellowCards || (stats.YC && stats.YC.value) || stats.YC || 0);
  points -= yellowCards * 1;
  
  const redCards = parseFloat(stats.redCards || (stats.RC && stats.RC.value) || stats.RC || 0);
  points -= redCards * 3;
  
  const ownGoals = parseFloat(stats.ownGoals || (stats.OG && stats.OG.value) || stats.OG || 0);
  points -= ownGoals * 2;
  
  const finalPoints = Math.round(points * 10) / 10; // Round to 1 decimal place
  
  // Safety check for NaN
  if (isNaN(finalPoints)) {
    return 0;
  }
  
  return finalPoints;
}

// Helper function to normalize position strings
function normalizePosition(position) {
  if (!position) return 'FWD'; // Default fallback
  
  const pos = position.toString().toUpperCase();
  
  // Goalkeeper variants
  if (pos === 'G' || pos === 'GK' || pos === 'GOALKEEPER') {
    return 'GK';
  }
  // Defender variants  
  if (pos === 'D' || pos === 'DEF' || pos === 'DEFENDER' || pos === 'DEFENCE') {
    return 'DEF';
  }
  // Midfielder variants
  if (pos === 'M' || pos === 'MID' || pos === 'MIDFIELDER' || pos === 'MIDFIELD') {
    return 'MID';
  }
  // Forward variants
  if (pos === 'F' || pos === 'FWD' || pos === 'FORWARD' || pos === 'STRIKER' || pos === 'ATTACK') {
    return 'FWD';
  }
  
  // If none match, try to guess from common abbreviations
  if (pos.includes('GOAL')) return 'GK';
  if (pos.includes('DEF') || pos.includes('BACK')) return 'DEF';
  if (pos.includes('MID')) return 'MID';
  if (pos.includes('FOR') || pos.includes('ATT') || pos.includes('STR')) return 'FWD';
  
  // Default to forward if uncertain
  return 'FWD';
}

// Helper function to get league IDs mapping
function getLeagueIds() {
  return {
    "eng.1": "eng.1",
    "esp.1": "esp.1", 
    "ger.1": "ger.1",
    "ita.1": "ita.1",
    "fra.1": "fra.1",
    "usa.1": "usa.1",
    "ksa.1": "ksa.1"
  };
}

// Helper function to get cached league teams
async function getCachedLeagueTeams(league) {
  try {
    const teamsResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/teams`);
    const teamsData = await teamsResponse.json();
    
    if (!teamsData.sports || !teamsData.sports[0] || !teamsData.sports[0].leagues || !teamsData.sports[0].leagues[0]) {
      throw new Error('Invalid teams data structure');
    }
    
    const teams = teamsData.sports[0].leagues[0].teams.map(teamWrapper => teamWrapper.team);
    return teams;
  } catch (error) {
    console.error('Error fetching league teams:', error);
    return [];
  }
}

function setupMobileScrolling(container) {
  // Remove any existing mobile styles first
  const existingStyle = document.getElementById("mobile-scroll-style");
  if (existingStyle) {
    existingStyle.remove();
  }

  // Add horizontal scroll styling for mobile devices
  if (window.innerWidth < 768) {
    // Hide scrollbar for webkit browsers and add mobile-specific styles
    const style = document.createElement("style");
    style.textContent = `
      .league-buttons::-webkit-scrollbar {
        display: none;
      }
      @media (max-width: 767px) {
        .league-buttons {
          overflow-x: auto !important;
          overflow-y: hidden !important;
          justify-content: flex-start !important;
          scroll-behavior: smooth;
          padding: 0 10px;
          -webkit-overflow-scrolling: touch;
          min-height: 50px;
        }
        .league-button {
          flex-shrink: 0 !important;
          white-space: nowrap;
        }
      }
    `;
    style.id = "mobile-scroll-style";
    document.head.appendChild(style);
    
    // Apply container styles directly
    container.style.scrollbarWidth = "none"; // Firefox
    container.style.msOverflowStyle = "none"; // IE/Edge
  }
}

function setupLeagueButtons() {
  const leagueContainer = document.getElementById("leagueButtons");
  if (!leagueContainer) {
    console.error("Error: Element with ID 'leagueButtons' not found.");
    return;
  }

  leagueContainer.innerHTML = ""; // Clear any existing content
  
  // Add horizontal scroll styling for mobile
  setupMobileScrolling(leagueContainer);

  for (const [leagueName, leagueData] of Object.entries(LEAGUES)) {
    const button = document.createElement("button");
    button.className = `league-button ${currentLeague === leagueData.code ? "active" : ""}`;
    button.innerHTML = `
      <span class="league-text">${leagueName}</span>
      <img class="league-logo" src="https://a.espncdn.com/i/leaguelogos/soccer/500-dark/${leagueData.logo}.png" alt="${leagueName}" style="display: none;">
    `;
    button.addEventListener("click", async () => {
      // Prevent multiple clicks
      if (button.disabled) return;
      button.disabled = true;
      
      try {
        // Save current fantasy team before switching leagues
        saveFantasyTeam();
        
        // Update current league immediately
        currentLeague = leagueData.code;
        localStorage.setItem("currentLeague", currentLeague);

        // Clear players data for the new league to prevent showing wrong players
        allLeaguePlayers = []; // Clear global players array
        
        // Update active state
        document.querySelectorAll(".league-button").forEach(btn => btn.classList.remove("active"));
        button.classList.add("active");

        // Clear current display immediately to prevent showing wrong players
        clearAllPlayerSlots();
        
        // Clear team section content to prevent stale data
        clearTeamSectionContent();
        
        // Load fantasy team for new league (this will clear the pitch and load saved team)
        loadFantasyTeamForLeague();

        // Start loading players immediately in parallel with team section
        
        // Load team section immediately (it will show cached games or load them)
        const teamSectionPromise = loadTeamSection();
        
        // Load news for new league
        const newsPromise = loadNews();
        const standingsPromise = loadStandings();
        loadPointsCalculation();
        
        // Load players in parallel if not cached
        const playersPromise = leaguePlayersCache[currentLeague] 
          ? Promise.resolve(leaguePlayersCache[currentLeague])
          : fetchAllLeaguePlayers();
        
        // Wait for all to complete
        await Promise.all([teamSectionPromise, newsPromise, playersPromise]);
        
      } catch (error) {
        console.error('Error switching leagues:', error);
        // Still try to load team section even if player fetch fails
        loadTeamSection();
      } finally {
        // Re-enable button
        button.disabled = false;
      }
    });

    leagueContainer.appendChild(button);
  }

  updateLeagueButtonDisplay(); // Adjust button display based on screen size
}

function updateLeagueButtonDisplay() {
  const isSmallScreen = window.innerWidth < 525;
  const leagueContainer = document.getElementById("leagueButtons");
  
  // Update mobile scrolling styles
  if (leagueContainer) {
    setupMobileScrolling(leagueContainer);
  }
  
  document.querySelectorAll(".league-button").forEach(button => {
    const text = button.querySelector(".league-text");
    const logo = button.querySelector(".league-logo");
    if (isSmallScreen) {
      text.style.display = "none";
      logo.style.display = "inline";
    } else {
      text.style.display = "inline";
      logo.style.display = "none";
    }
  });
}

// Initialize the page - removed old listener, using the one at bottom of file

// Formation management functions
function createPlayerSlot(position, slotIndex, playerId = null, playerData = null) {
  const slot = document.createElement('div');
  slot.className = `player-slot ${position.toLowerCase()}${slotIndex}`;
  slot.dataset.position = position;
  slot.dataset.slotIndex = slotIndex;
  
  if (playerId && playerData) {
    // Slot has a player
    slot.innerHTML = `
      <div class="player-info">
        <div class="player-jersey">${playerData.jersey || '?'}</div>
        <div class="player-name-short">${(playerData.name || 'Unknown').split(' ').pop()}</div>
        <div class="remove-player" onclick="removePlayer('${position.toLowerCase()}${slotIndex}', event)">×</div>
      </div>
    `;
    slot.dataset.playerId = playerId;
    
    // Add click handler for player stats
    slot.addEventListener('click', (e) => {
      // Don't trigger if clicking remove button
      if (e.target.classList.contains('remove-player')) return;
      
      const playerId = slot.dataset.playerId;
      if (playerId) {
        showPlayerStats(playerId);
      }
    });
  } else {
    // Empty slot
    slot.innerHTML = `
      <div class="player-placeholder">+</div>
      <div class="position-label">${position}</div>
    `;
    
    // Add click handler for player selector
    slot.addEventListener('click', () => {
      showPlayerSelector(position);
    });
  }
  
  return slot;
}

function removePlayer(slotKey, event) {
  if (event) {
    event.stopPropagation(); // Prevent triggering slot click
  }
  
  if (confirm('Remove this player from your team?')) {
    // Get the position from the slot key (e.g., "fwd1" -> "FWD")
    const position = slotKey.replace(/\d+$/, '').toUpperCase();
    
    // Get the player's cached FP before removing
    const playerData = fantasyTeam[slotKey];
    if (playerData && playerData.cachedFP !== undefined) {
      // Subtract from global total
      subtractFromTotalFP(playerData.cachedFP);
      console.log(`Removed ${playerData.name}: -${playerData.cachedFP} FP`);
    }
    
    // Remove from fantasy team
    delete fantasyTeam[slotKey];
    
    // Consolidate remaining players in this position
    consolidatePositionSlots(position);
    
    // Save changes
    saveFantasyTeam();
    
    // Update formation display
    updateFormation();
    
    // Reload news and standings to reflect removed player
    loadNews();
    loadStandings();
    loadPointsCalculation();
    
    // Refresh team section if needed
    if (currentTeamPage === 1) {
      loadTeamGames();
    }
  }
}

// Function to consolidate players in a position after removal
function consolidatePositionSlots(position) {
  const positionLower = position.toLowerCase();
  
  // Get all players for this position
  const playersInPosition = [];
  Object.keys(fantasyTeam).forEach(key => {
    if (key.startsWith(positionLower) && fantasyTeam[key]) {
      // Extract slot number from key like "fwd1", "mid2", etc.
      const slotNumber = parseInt(key.replace(positionLower, ''));
      if (!isNaN(slotNumber)) {
        playersInPosition.push({
          slotNumber: slotNumber,
          playerData: fantasyTeam[key]
        });
      }
    }
  });
  
  // Sort by slot number
  playersInPosition.sort((a, b) => a.slotNumber - b.slotNumber);
  
  // Clear all slots for this position
  Object.keys(fantasyTeam).forEach(key => {
    if (key.startsWith(positionLower) && /\d+$/.test(key)) {
      delete fantasyTeam[key];
    }
  });
  
  // Reassign players to consecutive slots starting from 1
  playersInPosition.forEach((player, index) => {
    const newSlotKey = `${positionLower}${index + 1}`;
    fantasyTeam[newSlotKey] = player.playerData;
  });
}

function updateFormation() {
  // Count current players by position
  const positionCounts = {
    FWD: 0,
    MID: 0,
    DEF: 0,
    GK: 0
  };
  
  // Count total slots (including + buttons) by position
  const positionSlotCounts = {
    FWD: 0,
    MID: 0,
    DEF: 0,
    GK: 0
  };
  
  let totalPlayers = 0;
  
  // Count players in fantasy team
  Object.values(fantasyTeam).forEach(player => {
    if (player && player.position) {
      positionCounts[player.position]++;
      totalPlayers++;
    }
  });
  
  // Count total slots for each position (including + buttons)
  Object.keys(FORMATION_CONSTRAINTS).forEach(position => {
    const constraints = FORMATION_CONSTRAINTS[position];
    const playerCount = positionCounts[position];
    let slotsNeeded = Math.max(constraints.min, playerCount);
    
    // Check if we can add an extra slot without violating constraints
    if (totalPlayers < MAX_TOTAL_PLAYERS && slotsNeeded < constraints.max) {
      const remainingSlotsAfterAdd = MAX_TOTAL_PLAYERS - (totalPlayers + 1);
      let otherMinimumNeeded = 0;
      Object.keys(FORMATION_CONSTRAINTS).forEach(otherPosition => {
        if (otherPosition !== position) {
          const otherConstraints = FORMATION_CONSTRAINTS[otherPosition];
          const otherPlayerCount = positionCounts[otherPosition];
          const otherMinStillNeeded = Math.max(0, otherConstraints.min - otherPlayerCount);
          otherMinimumNeeded += otherMinStillNeeded;
        }
      });
      
      if (remainingSlotsAfterAdd >= otherMinimumNeeded) {
        slotsNeeded++;
      }
    }
    
    // Ensure we don't exceed position limits
    slotsNeeded = Math.min(slotsNeeded, constraints.max);
    positionSlotCounts[position] = slotsNeeded;
  });
  
  // Update dynamic pitch height and position line spacing using slot counts
  updatePitchHeightAndPositions(positionSlotCounts, totalPlayers);
  
  // Update each position line
  Object.keys(positionCounts).forEach(position => {
    updatePositionLine(position, positionCounts[position], totalPlayers);
  });
  
  // Update total fantasy points display
  updateTotalFantasyPointsDisplay();
}

// Function to dynamically adjust pitch height and position lines based on sections with 3+ players
function updatePitchHeightAndPositions(positionCounts, totalPlayers) {
  const pitch = document.querySelector('.football-pitch');
  if (!pitch) {
    console.log('Pitch element not found');
    return;
  }
  
  // Count how many sections (positions) have 4 or more slots (need second row)
  let sectionsWithFourPlus = 0;
  const relevantPositions = ['FWD', 'MID', 'DEF']; // GK doesn't count for pitch height
  
  relevantPositions.forEach(position => {
    if (positionCounts[position] >= 4) {
      sectionsWithFourPlus++;
    }
  });
  
  console.log(`Updating pitch height: ${totalPlayers} total players, ${sectionsWithFourPlus} sections with 4+ slots`);
  console.log('Position counts:', positionCounts);
  
  // Update pitch height classes
  pitch.classList.remove('has-players', 'many-players', 'max-players');
  
  if (totalPlayers === 0) {
    console.log('Pitch height: default (empty)');
  } else if (sectionsWithFourPlus === 3) {
    pitch.classList.add('has-players', 'many-players', 'max-players');
    console.log('Pitch height: max-players (3 sections with 4+ slots)');
  } else if (sectionsWithFourPlus >= 2) {
    pitch.classList.add('has-players', 'many-players');
    console.log('Pitch height: many-players (2 sections with 4+)');
  } else if (sectionsWithFourPlus >= 1) {
    pitch.classList.add('has-players');
    console.log('Pitch height: has-players (1 section with 4+)');
  } else {
    console.log('Pitch height: default (requirements not met)');
  }
  
  // Update position line classes based on which specific sections have 3+ players
  updatePositionLineClasses(positionCounts);
  
  console.log('Current pitch classes:', pitch.className);
  const computedStyle = window.getComputedStyle(pitch);
  console.log('Computed height:', computedStyle.height);
}

// Function to update position line classes for spacing
function updatePositionLineClasses(positionCounts) {
  const positions = {
    'FWD': document.querySelector('.forward-line'),
    'MID': document.querySelector('.midfielder-line'), 
    'DEF': document.querySelector('.defender-line'),
    'GK': document.querySelector('.goalkeeper-line')
  };
  
  // Remove all dynamic classes first
  Object.values(positions).forEach(line => {
    if (line) {
      line.classList.remove('has-second-row', 'move-up-50', 'move-up-60', 'move-up-80', 'move-up-120', 'move-up-185');
    }
  });

  // Simple logic: if section has 4+ slots, add movement classes
  if (positionCounts.FWD >= 4 && positions.FWD && positionCounts.MID >= 4 && positionCounts.DEF >= 4) {
    positions.FWD.classList.add('move-up-185');
    positions.MID.classList.add('move-up-120');
  } else if (positionCounts.FWD >= 4 && positions.FWD && (positionCounts.MID >= 4 || positionCounts.DEF >= 4)) {
    positions.FWD.classList.add('move-up-120')
    positions.MID.classList.add('move-up-60');
  } else if (positionCounts.FWD >= 4 && positions.FWD && (positionCounts.MID < 4 || positionCounts.DEF < 4)) {
    positions.FWD.classList.add('move-up-60');
  }
  if (positionCounts.MID >= 4 && positions.MID && positionCounts.FWD >= 4) {
    positions.MID.classList.add('move-up-50');
    positions.FWD.classList.add('move-up-80');
  } else if (positionCounts.MID >= 4 && positions.MID && positionCounts.DEF < 4) {
    positions.MID.classList.add('has-second-row');
    positions.FWD.classList.add('move-up-80');
  } else if (positionCounts.MID >= 4 && positions.MID && positionCounts.DEF >= 4) {
    positions.MID.classList.add('move-up-120');
    positions.FWD.classList.add('move-up-120');
  }
  if (positionCounts.DEF >= 4 && positions.DEF) {
    positions.DEF.classList.add('move-up-60');
    positions.MID.classList.add('move-up-60');
    positions.FWD.classList.add('move-up-80');
  }
  if (positionCounts.GK >= 3 && positions.GK) { // GK uses 3+ since it has smaller max
    positions.GK.classList.add('has-second-row');
  }
  
  console.log('Position line classes updated:', {
    FWD: positions.FWD?.className,
    MID: positions.MID?.className,
    DEF: positions.DEF?.className,
    GK: positions.GK?.className
  });
}

function updatePositionLine(position, playerCount, totalPlayers) {
  // Map position to correct CSS class
  const positionClassMap = {
    'FWD': 'forward-line',
    'MID': 'midfielder-line', 
    'DEF': 'defender-line',
    'GK': 'goalkeeper-line'
  };
  
  const lineClass = positionClassMap[position];
  if (!lineClass) {
    console.error(`Unknown position: ${position}`);
    return;
  }
  
  const line = document.querySelector(`.${lineClass}`);
  if (!line) {
    console.error(`Could not find position line for ${position}`);
    return;
  }
  
  // Clear existing slots
  line.innerHTML = '';
  
  // Calculate how many slots this position should have
  const constraints = FORMATION_CONSTRAINTS[position];
  let slotsNeeded = Math.max(constraints.min, playerCount); // Start with minimum or current players, whichever is higher
  
  // Check if we can add an extra slot without violating constraints
  const canAddExtraSlot = () => {
    if (totalPlayers >= MAX_TOTAL_PLAYERS) return false;
    if (slotsNeeded >= constraints.max) return false;
    
    // Calculate remaining slots after adding one to this position
    const remainingSlotsAfterAdd = MAX_TOTAL_PLAYERS - (totalPlayers + 1);
    
    // Count how many minimum slots are still needed for other positions
    let otherMinimumNeeded = 0;
    Object.keys(FORMATION_CONSTRAINTS).forEach(otherPosition => {
      if (otherPosition !== position) {
        const otherConstraints = FORMATION_CONSTRAINTS[otherPosition];
        const otherPlayerCount = getPlayerCountForPosition(otherPosition);
        const otherMinStillNeeded = Math.max(0, otherConstraints.min - otherPlayerCount);
        otherMinimumNeeded += otherMinStillNeeded;
      }
    });
    
    return remainingSlotsAfterAdd >= otherMinimumNeeded;
  };
  
  // Only add an extra slot if we can safely do so and haven't reached position max
  if (canAddExtraSlot()) {
    slotsNeeded++;
  }
  
  // Ensure we don't exceed position limits
  slotsNeeded = Math.min(slotsNeeded, constraints.max);
  
  // Create slots
  for (let i = 1; i <= slotsNeeded; i++) {
    const slotKey = `${position.toLowerCase()}${i}`;
    const playerData = fantasyTeam[slotKey];
    const playerId = playerData ? playerData.id : null;
    
    const slot = createPlayerSlot(position, i, playerId, playerData);
    line.appendChild(slot);
  }
}

// Helper function to get player count for a specific position
function getPlayerCountForPosition(position) {
  let count = 0;
  Object.values(fantasyTeam).forEach(player => {
    if (player && player.position === position) {
      count++;
    }
  });
  return count;
}

// Load team section content based on current page
// Clear team section content when switching leagues
function clearTeamSectionContent() {
  const teamCard = document.querySelector('.team-card1');
  if (teamCard) {
    teamCard.innerHTML = `
      <div class="team-page-header">
        <h3>This Week's Games</h3>
        <div class="page-indicator">Page 1 of 3</div>
      </div>
      <div id="teamGamesContent">
        <div class="loading">Loading games...</div>
      </div>
    `;
  }
  currentTeamPage = 1; // Reset to page 1
}

async function loadTeamSection() {
  const teamCard = document.querySelector('.team-card1');
  if (!teamCard) return;
  
  switch (currentTeamPage) {
    case 1:
      await loadTeamGames();
      break;
    case 2:
      await loadPlayerStatsPage();
      break;
    case 3:
      await loadPlayerSelectorPage();
      break;
    default:
      await loadTeamGames();
  }
}

// Load News Section
async function loadNews() {
  const newsSection = document.querySelector('.news-section');
  if (!newsSection) return;
  
  try {
    // Show loading state
    newsSection.innerHTML = '<div class="loading">Loading news...</div>';
    
    // Get current league configuration
    const leagueKey = Object.keys(LEAGUES).find(key => LEAGUES[key].code === currentLeague);
    if (!leagueKey) {
      newsSection.innerHTML = '<div class="no-news">League not found</div>';
      return;
    }
    
    // Get fantasy team players for filtering - use current fantasyTeam object
    const playerNames = Object.values(fantasyTeam).map(player => player?.name).filter(Boolean);
    
    if (playerNames.length === 0) {
      newsSection.innerHTML = '<div class="no-news">Add players to your fantasy team to see relevant news</div>';
      return;
    }
    
    // Fetch news from ESPN API
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/news?limit=50`);
    const newsData = await response.json();
    
    if (!newsData.articles || newsData.articles.length === 0) {
      newsSection.innerHTML = '<div class="no-news">No news available</div>';
      return;
    }
    
    // Filter articles that mention fantasy team players
    const relevantArticles = newsData.articles.filter(article => {
      if (!article.categories) return false;
      
      // Check if any athlete in the article's categories matches our fantasy players
      const athleteCategories = article.categories.filter(cat => cat.type === 'athlete');
      
      // Also check headline and description for player names
      const articleText = `${article.headline || ''} ${article.description || ''}`.toLowerCase();
      
      return athleteCategories.some(athlete => 
        playerNames.some(playerName => 
          athlete.description && athlete.description.toLowerCase().includes(playerName.toLowerCase())
        )
      ) || playerNames.some(playerName => 
        articleText.includes(playerName.toLowerCase())
      );
    });
    
    if (relevantArticles.length === 0) {
      newsSection.innerHTML = '<div class="no-news">No news found for your fantasy team players</div>';
      return;
    }
    
    // Setup pagination - 3 articles per page for better demonstration, max 3 pages
    const articlesPerPage = 3;
    const maxPages = 3;
    const totalArticles = Math.min(relevantArticles.length, articlesPerPage * maxPages);
    const totalPages = Math.ceil(totalArticles / articlesPerPage);
    
    let currentPage = 1;
    
    function renderNewsPage(page) {
      const startIndex = (page - 1) * articlesPerPage;
      const endIndex = Math.min(startIndex + articlesPerPage, totalArticles);
      const pageArticles = relevantArticles.slice(startIndex, endIndex);
      
      const newsHTML = pageArticles.map(article => {
        // Get player names mentioned in this article
        const mentionedPlayers = [];
        if (article.categories) {
          const athleteCategories = article.categories.filter(cat => cat.type === 'athlete');
          athleteCategories.forEach(athlete => {
            playerNames.forEach(playerName => {
              if (athlete.description && athlete.description.toLowerCase().includes(playerName.toLowerCase())) {
                mentionedPlayers.push(athlete.description);
              }
            });
          });
        }
        
        // Also check for player names in headline/description
        playerNames.forEach(playerName => {
          const articleText = `${article.headline || ''} ${article.description || ''}`.toLowerCase();
          if (articleText.includes(playerName.toLowerCase()) && !mentionedPlayers.includes(playerName)) {
            mentionedPlayers.push(playerName);
          }
        });
        
        // Get team info for logo - try to match with mentioned player's team
        let teamLogo = '';
        if (article.categories && mentionedPlayers.length > 0) {
          // Try to find team logo for mentioned players
          const teamCategories = article.categories.filter(cat => cat.type === 'team');
          
          // Try to match team to our fantasy players
          for (const mentionedPlayer of mentionedPlayers) {
            const fantasyPlayer = Object.values(fantasyTeam).find(player => 
              player && player.name && player.name.toLowerCase().includes(mentionedPlayer.toLowerCase())
            );
            
            if (fantasyPlayer && fantasyPlayer.teamId) {
              // Use the fantasy player's team logo
              teamLogo = `<img src="https://a.espncdn.com/i/teamlogos/soccer/500/${fantasyPlayer.teamId}.png" alt="${fantasyPlayer.team}" class="news-team-logo" onerror="this.style.display='none'">`;
              break;
            }
          }
          
          // Fallback to first team in categories if no match found
          if (!teamLogo && teamCategories.length > 0) {
            const teamCategory = teamCategories[0];
            teamLogo = `<img src="https://a.espncdn.com/i/teamlogos/soccer/500/${teamCategory.teamId}.png" alt="${teamCategory.description}" class="news-team-logo" onerror="this.style.display='none'">`;
          }
        }
        
        // Format date
        const publishDate = new Date(article.published).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        return `
          <div class="news-item">
            <div class="news-header">
              ${teamLogo}
              <div class="news-meta">
                <span class="news-date">${publishDate}</span>
                ${mentionedPlayers.length > 0 ? `<span class="news-players">${mentionedPlayers.join(', ')}</span>` : ''}
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
    
    function renderPagination() {
      // Show pagination if we have more than 1 page
      if (totalPages <= 1) return '';
      
      return `
        <div class="news-pagination">
          <button class="page-btn prev-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changeNewsPage(${currentPage - 1})">‹</button>
          <span class="page-info">Page ${currentPage} of ${totalPages}</span>
          <button class="page-btn next-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changeNewsPage(${currentPage + 1})">›</button>
        </div>
      `;
    }
    
    function updateNewsDisplay() {
      const newsHTML = renderNewsPage(currentPage);
      const paginationHTML = renderPagination();
      
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
    window.changeNewsPage = function(page) {
      if (page < 1 || page > totalPages) return;
      currentPage = page;
      updateNewsDisplay();
    };
    
    // Initial render
    updateNewsDisplay();
    
  } catch (error) {
    console.error('Error loading news:', error);
    newsSection.innerHTML = '<div class="error">Failed to load news</div>';
  }
}

// Load Standings Section
async function loadStandings() {
  const standingsSection = document.querySelector('.standings-section');
  if (!standingsSection) return;
  
  try {
    // Show work in progress message
    standingsSection.innerHTML = `
      <div class="work-in-progress">
        <div class="wip-content">
          <h4>🚧 Work In Progress</h4>
          <p>Fantasy League standings coming soon! This feature is currently under development.</p>
        </div>
      </div>
    `;
    
  } catch (error) {
    console.error('Error loading standings:', error);
    standingsSection.innerHTML = '<div class="error">Failed to load standings</div>';
  }
}

// Load Fantasy Points Calculation Section
function loadPointsCalculation() {
  const pointsSection = document.querySelector('.points-calculation-section');
  if (!pointsSection) return;
  
  pointsSection.innerHTML = `
    <div class="points-explanation">
      <div class="points-category">
        <h4>⚽ Goals</h4>
        <ul class="points-list">
          <li><span>Goalkeeper Goal</span> <span class="points-value">+10</span></li>
          <li><span>Defender Goal</span> <span class="points-value">+6</span></li>
          <li><span>Midfielder Goal</span> <span class="points-value">+5</span></li>
          <li><span>Forward Goal</span> <span class="points-value">+4</span></li>
        </ul>
      </div>
      
      <div class="points-category">
        <h4>🎯 Assists & Playing Time</h4>
        <ul class="points-list">
          <li><span>Assist</span> <span class="points-value">+3</span></li>
          <li><span>Playing 60+ minutes</span> <span class="points-value">+2</span></li>
          <li><span>Playing 1-59 minutes</span> <span class="points-value">+1</span></li>
        </ul>
      </div>
      
      <div class="points-category">
        <h4>🛡️ Defensive</h4>
        <ul class="points-list">
          <li><span>Clean Sheet (GK/DEF)</span> <span class="points-value">+4</span></li>
          <li><span>Clean Sheet (MID)</span> <span class="points-value">+1</span></li>
          <li><span>3 Saves (GK)</span> <span class="points-value">+1</span></li>
          <li><span>Penalty Save (GK)</span> <span class="points-value">+5</span></li>
          <li><span>10 Defensive Actions (DEF/MID)</span> <span class="points-value">+2</span></li>
          <li><span>12 Defensive Actions (FWD)</span> <span class="points-value">+2</span></li>
        </ul>
      </div>
      
      <div class="points-category">
        <h4>⚠️ Negative Points</h4>
        <ul class="points-list">
          <li><span>Yellow Card</span> <span class="points-value negative">-1</span></li>
          <li><span>Red Card</span> <span class="points-value negative">-3</span></li>
          <li><span>Own Goal</span> <span class="points-value negative">-2</span></li>
          <li><span>Penalty Miss</span> <span class="points-value negative">-2</span></li>
          <li><span>2 Goals Conceded</span> <span class="points-value negative">-1</span></li>
        </ul>
      </div>
    </div>
    
    <div style="margin-top: 20px; padding: 15px; background: #2a2a2a; border-radius: 8px; border-left: 4px solid #ffc107;">
      <p style="margin: 0; color: #ccc; font-size: 0.9rem; line-height: 1.4;">
        <strong style="color: #ffc107;">📊 Note:</strong> 
        Defensive actions include tackles, interceptions, clearances, and blocked shots. 
        Points are calculated based on actual match performance and rounded to 1 decimal place.
      </p>
    </div>
  `;
}

// PAGE 1: Team Games (default)
async function loadTeamGames() {
  currentTeamPage = 1;
  const teamCard = document.querySelector('.team-card1');
  
  teamCard.innerHTML = `
    <div class="team-page-header">
      <h3>This Week's Games</h3>
      <div class="page-indicator">Page 1 of 3</div>
    </div>
    <div id="teamGamesContent">
      <div class="loading">Loading games...</div>
    </div>
  `;
  
  try {
    // Get current fantasy team for the league
    const currentFantasyTeam = getFantasyTeamForCurrentLeague();
    
    // Check if user has any players on their team
    const hasPlayers = Object.keys(currentFantasyTeam).length > 0;
    
    if (!hasPlayers) {
      document.getElementById('teamGamesContent').innerHTML = `
        <div class="no-games">
          <p>No players on your team yet!</p>
          <p>Click the + buttons on the pitch to add players and see their games here.</p>
        </div>
      `;
      return;
    }
    
    // Get unique team IDs from fantasy team
    const teamIds = [...new Set(Object.values(currentFantasyTeam).map(player => player.teamId).filter(id => id))];
    
    if (teamIds.length === 0) {
      document.getElementById('teamGamesContent').innerHTML = `
        <div class="no-games">No team information available for your players.</div>
      `;
      return;
    }
    
    // Get current week's date range (using the same logic as other soccer pages)
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysToLastTuesday = (dayOfWeek + 5) % 7; // Days since the last Tuesday
    const lastTuesday = new Date(today);
    lastTuesday.setDate(today.getDate() - daysToLastTuesday);

    const nextMonday = new Date(lastTuesday);
    nextMonday.setDate(lastTuesday.getDate() + 6);

    const formatDate = (date) => {
      return date.getFullYear() +
             String(date.getMonth() + 1).padStart(2, "0") +
             String(date.getDate()).padStart(2, "0");
    };
    
    const dateRange = `${formatDate(lastTuesday)}-${formatDate(nextMonday)}`;
    
    // Fetch games from scoreboard API (like other soccer pages)
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/scoreboard?dates=${dateRange}`);
    const data = await response.json();
    const allGames = data.events || [];
    
    // Filter games for teams with players on fantasy team
    const relevantGames = allGames.filter(game => {
      const homeTeamId = String(game.competitions[0].competitors.find(c => c.homeAway === "home").team.id);
      const awayTeamId = String(game.competitions[0].competitors.find(c => c.homeAway === "away").team.id);
      const teamIdsStr = teamIds.map(id => String(id));
      return teamIdsStr.includes(homeTeamId) || teamIdsStr.includes(awayTeamId);
    });
    
    displayTeamGames(relevantGames);
    
  } catch (error) {
    console.error('Error loading team games:', error);
    document.getElementById('teamGamesContent').innerHTML = '<div class="error">Error loading games</div>';
  }
}

function displayTeamGames(games) {
  const container = document.getElementById('teamGamesContent');
  if (!container) return;
  
  if (games.length === 0) {
    container.innerHTML = '<div class="no-games">No games this week</div>';
    return;
  }
  
  // Group games by status (using same logic as other soccer pages)
  const liveGames = games.filter(game => 
    game.status.type.state === "in" || game.status.type.state === "halftime"
  );
  const finishedGames = games.filter(game => game.status.type.state === "post");
  const upcomingGames = games.filter(game => game.status.type.state === "pre");
  
  // Sort games by date and time within each group
  const sortGamesByDateTime = (gamesList) => {
    return gamesList.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA - dateB; // Sort ascending (earliest first)
    });
  };
  
  // Sort each group by date and time
  const sortedLiveGames = sortGamesByDateTime([...liveGames]);
  const sortedFinishedGames = sortGamesByDateTime([...finishedGames]);
  const sortedUpcomingGames = sortGamesByDateTime([...upcomingGames]);
  
  let gamesHtml = '';
  
  if (sortedLiveGames.length > 0) {
    gamesHtml += `
      <div class="games-section">
        <h4 style="color: white;">Live Games</h4>
        <div class="games-grid">
          ${sortedLiveGames.map(game => createGameCard(game, 'live')).join('')}
        </div>
      </div>`;
  }
  
  if (sortedUpcomingGames.length > 0) {
    gamesHtml += `
      <div class="games-section">
        <h4 style="color: white;">Upcoming Games</h4>
        <div class="games-grid">
          ${sortedUpcomingGames.map(game => createGameCard(game, 'upcoming')).join('')}
        </div>
      </div>`;
  }
  
  if (sortedFinishedGames.length > 0) {
    gamesHtml += `
      <div class="games-section">
        <h4 style="color: white;">Recent Games</h4>
        <div class="games-grid">
          ${sortedFinishedGames.map(game => createGameCard(game, 'finished')).join('')}
        </div>
      </div>`;
  }
  
  if (gamesHtml === '') {
    gamesHtml = '<div class="no-games">No games this week</div>';
  }
  
  container.innerHTML = gamesHtml;
}

function createGameCard(game, status) {
  const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home");
  const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away");
  
  // Get team logos using dark versions for all teams
  const getTeamLogo = (team) => {
    // Use dark logos for all teams for better consistency
    return `https://a.espncdn.com/i/teamlogos/soccer/500/${team.team.id}.png`;
  };
  
  const formatShortDisplayName = (name) => {
    if (name === "Bournemouth") return "B'Mouth";
    if (name === "Real Sociedad") return "Sociedad";
    if (name === "Southampton") return "S'Ampton";
    if (name === "Real Madrid") return "R. Madrid";
    if (name === "Nottm Forest") return "N. Forest";
    if (name === "Man United") return "Man Utd";
    if (name === "Las Palmas") return "L. Palmas";
    return name;
  };
  
  const gameDate = new Date(game.date);
  const hour = gameDate.toLocaleString("en-US", {
    hour: "numeric",
    hour12: true,
  });
  const ampm = hour.includes("AM") ? "AM" : "PM";
  const hourOnly = hour.replace(/ AM| PM/, "");
  const minutes = gameDate.getMinutes();
  const time = minutes === 0
    ? `${hourOnly} ${ampm}`
    : `${hourOnly}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  
  let scoreDisplay = '';
  let statusText = '';
  let statusClass = '';
  
  if (status === 'live') {
    scoreDisplay = `${homeTeam.score || 0} - ${awayTeam.score || 0}`;
    statusText = 'Live';
    statusClass = 'live-game';
  } else if (status === 'finished') {
    scoreDisplay = `${homeTeam.score || 0} - ${awayTeam.score || 0}`;
    statusText = 'Final';
    statusClass = 'finished-game';
  } else {
    scoreDisplay = time;
    statusText = 'Scheduled';
    statusClass = 'upcoming-game';
  }
  
  return `
    <div class="game-card ${statusClass}" data-game-id="${game.id}" onclick="navigateToScoreboard('${game.id}')" style="cursor: pointer;">
      <div class="game-teams">
        <div class="team-info">
          <img src="${getTeamLogo(homeTeam)}" 
               alt="${homeTeam.team.shortDisplayName}" class="team-logo-small">
          <span class="team-name">${formatShortDisplayName(homeTeam.team.shortDisplayName)}</span>
        </div>
        <div class="game-score-center">
          <div class="game-status">${statusText}</div>
          <div class="game-score">${scoreDisplay}</div>
        </div>
        <div class="team-info away-team">
          <img src="${getTeamLogo(awayTeam)}" 
               alt="${awayTeam.team.shortDisplayName}" class="team-logo-small">
          <span class="team-name away">${formatShortDisplayName(awayTeam.team.shortDisplayName)}</span>
        </div>
      </div>
    </div>
  `;
}

// Function to navigate to the appropriate scoreboard page
function navigateToScoreboard(gameId) {
  // Navigate to the scoreboard page with the specific game ID
  window.location.href = `scoreboard.html?gameId=${gameId}`;
}

// PAGE 2: Player Stats
async function showPlayerStats(playerId) {
  selectedPlayer = playerId;
  currentTeamPage = 2;
  
  // Find the player in fantasy team to get details
  let playerData = null;
  const currentFantasyTeam = getFantasyTeamForCurrentLeague();
  for (const player of Object.values(currentFantasyTeam)) {
    if (player && String(player.id) === String(playerId)) {
      playerData = player;
      break;
    }
  }
  
  if (!playerData) {
    const teamCard = document.querySelector('.team-card1');
    teamCard.innerHTML = `
      <div class="team-page-header">
        <button class="back-btn" onclick="loadTeamGames()">← Back</button>
        <h3>Player Stats</h3>
        <div class="page-indicator">Page 2 of 3</div>
      </div>
      <div class="error">Player not found in fantasy team</div>
    `;
    return;
  }
  
  const teamCard = document.querySelector('.team-card1');
  teamCard.innerHTML = `
    <div class="team-page-header">
      <button class="back-btn" onclick="loadTeamGames()">← Back</button>
      <h3>${playerData.name} - Stats</h3>
      <div class="page-indicator">Page 2 of 3</div>
    </div>
    <div class="stats-layout">
      <div class="stats-section">
        <h4>Season Stats</h4>
        <div class="loading">Loading stats...</div>
      </div>
      <div class="gamelog-section">
        <h4>Recent Games</h4>
        <div class="loading">Loading game log...</div>
      </div>
    </div>
  `;
  
  // Load actual player stats using team-page.js approach
  const container = document.querySelector('.stats-layout');
  await loadPlayerStats(playerId, playerData.position, container);
}

// PAGE 2: Player Stats Page
async function loadPlayerStatsPage() {
  currentTeamPage = 2;
  const teamCard = document.querySelector('.team-card1');
  
  teamCard.innerHTML = `
    <div class="team-page-header">
      <h3>Player Statistics</h3>
      <div class="page-indicator">Page 2 of 3</div>
    </div>
    <div class="player-stats-container">
      <div class="loading">Loading player stats...</div>
    </div>
  `;
  
  // Wait for DOM to update
  await new Promise(resolve => setTimeout(resolve, 50));
  
  const container = document.querySelector('.player-stats-container');
  if (!container) {
    return;
  }
  
  // Get fantasy team for current league
  const fantasyTeam = getFantasyTeamForCurrentLeague();
  
  if (!fantasyTeam || Object.keys(fantasyTeam).length === 0) {
    container.innerHTML = '<div class="no-players">No players selected yet. Go to the Player Selection page to add players.</div>';
    return;
  }
  
  let statsHtml = '';
  
  // Load stats for all players in fantasy team
  for (const [position, playerData] of Object.entries(fantasyTeam)) {
    if (playerData && playerData.id && playerData.name) {
      
      statsHtml += `
        <div class="player-stats-card">
          <div class="player-stats-header">
            <h3>${playerData.name}</h3>
            <span class="player-position">${playerData.position || position}</span>
            <span class="player-team">${playerData.team || 'Unknown Team'}</span>
          </div>
          <div class="stats-loading" id="stats-${playerData.id}">
            Loading stats...
          </div>
        </div>
      `;
    }
  }
  
  if (statsHtml) {
    container.innerHTML = statsHtml;
    
    // Now load individual player stats
    for (const [position, playerData] of Object.entries(fantasyTeam)) {
      if (playerData && playerData.id && playerData.name) {
        await loadIndividualPlayerStats(playerData.id, playerData.position || position, playerData.name);
      }
    }
  } else {
    container.innerHTML = '<div class="no-players">No players found in fantasy team.</div>';
  }
}

async function loadIndividualPlayerStats(playerId, position, playerName) {
  const statsContainer = document.getElementById(`stats-${playerId}`);
  if (!statsContainer) return;
  
  try {
    const leagueIds = getLeagueIds();
    const leagueId = leagueIds[currentLeague];
    
    if (!leagueId) {
      throw new Error(`League ID not found for ${currentLeague}`);
    }
    
    let statsData = null;
    const currentYear = new Date().getFullYear();
    
    // Try to get stats from current year only
    const endpoint = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/athletes/${playerId}/statistics?season=${currentYear}`;
    
    try {
      const response = await fetch(endpoint);
      
      if (response.ok) {
        const data = await response.json();
        
        // Check if we got meaningful data
        if (data && (data.splits || data.statistics || data.stat || data.athlete)) {
          statsData = data;
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch stats for ${playerName}:`, err);
    }
    
    // Extract and display stats
    let playerStats;
    if (statsData) {
      playerStats = extractPlayerStats(statsData, position);
    } else {
      console.warn(`No stats data found for ${playerName} - using default values`);
      playerStats = {
        'Goals': '0',
        'Assists': '0', 
        'Appearances': '0',
        'Fantasy Points': '0'
      };
    }
    
    // Generate stats HTML
    const statsRows = Object.entries(playerStats)
      .map(([stat, value]) => `
        <div class="stat-row">
          <span class="stat-label">${stat}:</span>
          <span class="stat-value">${value}</span>
        </div>
      `).join('');
    
    statsContainer.innerHTML = `
      <div class="player-stats-content">
        ${statsRows}
      </div>
    `;
    
  } catch (error) {
    console.error(`Error loading stats for ${playerName}:`, error);
    statsContainer.innerHTML = `
      <div class="player-stats-content">
        <div class="stat-row">
          <span class="stat-label">Goals:</span>
          <span class="stat-value">0</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Assists:</span>
          <span class="stat-value">0</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Appearances:</span>
          <span class="stat-value">0</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Fantasy Points:</span>
          <span class="stat-value">0</span>
        </div>
      </div>
    `;
  }
}

// Load player stats following team-page.js patterns (lines 922-1761)
async function loadPlayerStats(playerId, position, container) {
    try {
        // Find the selected player data
        const selectedPlayer = findPlayerInCache(playerId);
        if (!selectedPlayer) {
            console.error('Player not found in cache');
            return;
        }
        
        // Show loading state
        const statsSection = container.querySelector('.stats-section');
        const gamelogSection = container.querySelector('.gamelog-section');
        
        if (statsSection) {
            statsSection.innerHTML = `<h4>Season Stats</h4><div class="loading-text">Loading stats...</div>`;
        }
        if (gamelogSection) {
            gamelogSection.innerHTML = `<h4>Recent Game</h4><div class="loading-text">Loading game...</div>`;
        }
        
        // Get current year and season info
        const currentYear = new Date().getFullYear();
        
        let playerStatsData = null;
        let teamIdForSeason = null;
        let leagueForSeason = currentLeague;
        let statsYear = currentYear;
        
        // Try to load player stats using the current year only
        try {
            // Use the ESPN sports.core.api format as specified
            const statsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${currentLeague}/seasons/${currentYear}/types/1/athletes/${playerId}/statistics?lang=en&region=us`;
            
            const statsResponse = await fetch(statsUrl);
            if (statsResponse.ok) {
                playerStatsData = await statsResponse.json();
                
                // Use the team ID from the selected player data (from fantasy team)
                const currentFantasyTeam = getFantasyTeamForCurrentLeague();
                for (const [slot, playerData] of Object.entries(currentFantasyTeam)) {
                    if (playerData && String(playerData.id) === String(playerId)) {
                        teamIdForSeason = playerData.teamId || selectedPlayer.teamId;
                        break;
                    }
                }
            } else {
                console.warn(`Stats API failed with status ${statsResponse.status} for player ${playerId}`);
            }
        } catch (error) {
            console.error('Error loading player stats:', error);
        }
        
        // Display player stats
        await displayPlayerStats(playerStatsData, container, position, selectedPlayer, teamIdForSeason, leagueForSeason, statsYear);
        
        // Load and display most recent game
        if (teamIdForSeason) {
            await loadPlayerRecentGame(selectedPlayer, teamIdForSeason, leagueForSeason, gamelogSection);
        }
        
    } catch (error) {
        console.error('Error loading player stats:', error);
        const statsSection = container.querySelector('.stats-section');
        if (statsSection) {
            statsSection.innerHTML = `
                <h4>Season Stats</h4>
                <div class="error">Unable to load player statistics</div>
            `;
        }
    }
}

// Find player in cache
function findPlayerInCache(playerId) {
    const cachedPlayers = leaguePlayersCache[currentLeague];
    if (!cachedPlayers || !Array.isArray(cachedPlayers)) return null;
    
    // Cache stores players as a flat array, not organized by teams
    const found = cachedPlayers.find(p => p.id === playerId || p.id === playerId.toString());
    return found || null;
}

// Load player's game log following ESPN eventlog API pattern
async function loadPlayerRecentGame(player, teamId, league, gamelogSection) {
    try {
        // Calculate season year
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth();
        
        // Soccer seasons typically run from August to May
        // For August 2025, we want the 2025 season
        let seasonYear = 2025; // Hardcode for debugging
        




        // Get player eventlog using ESPN API format
        const eventlogUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${league}/seasons/${seasonYear}/athletes/${player.id}/eventlog?lang=en&region=us`;

        
        const eventlogResponse = await fetch(eventlogUrl);
        if (!eventlogResponse.ok) {
            console.warn(`Eventlog API failed with status ${eventlogResponse.status}, trying fallback method`);
            // Fallback: use team schedule to get recent games
            return await loadPlayerRecentGameFallback(player, teamId, league, gamelogSection);
        }
        
        const eventlogData = await eventlogResponse.json();

        
        // Filter events where player has lineupEntry (actually played)
        const playedGames = [];
        
        if (eventlogData.events && eventlogData.events.items) {
            for (const eventItem of eventlogData.events.items) {
                // Only include games where player has lineupEntry and played
                if (eventItem.lineupEntry && eventItem.played) {
                    playedGames.push(eventItem);
                }
            }
        }

        if (playedGames.length === 0) {
            gamelogSection.innerHTML = `
                <h4>Recent Games</h4>
                <div class="no-games">No recent games found where player appeared</div>
            `;
            return;
        }

        // Sort by most recent first (games are usually already sorted)
        playedGames.sort((a, b) => {
            // Extract event IDs and assume higher ID = more recent
            const aId = parseInt(a.event.$ref.split('/').pop().split('?')[0]);
            const bId = parseInt(b.event.$ref.split('/').pop().split('?')[0]);
            return bId - aId;
        });

        // Take the 38 most recent games
        const recentGames = playedGames.slice(0, 38);



        // Display the game log cards
        await displayGameLogCards(recentGames, player, gamelogSection);

    } catch (error) {
        console.error('Error loading player eventlog:', error);
        // Try fallback method
        return await loadPlayerRecentGameFallback(player, teamId, league, gamelogSection);
    }
}

// Fallback method using team schedule
async function loadPlayerRecentGameFallback(player, teamId, league, gamelogSection) {
    try {

        
        // Get team's recent games
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const seasonYear = 2025; // Hardcode for now
        
        const gamesResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/teams/${teamId}/schedule?season=${seasonYear}`);
        if (!gamesResponse.ok) {
            throw new Error('Failed to fetch team schedule');
        }
        
        const gamesData = await gamesResponse.json();

        
        // Find completed games
        const completedGames = [];
        if (gamesData.events) {
            gamesData.events.forEach(game => {
                if (game.status?.type?.completed) {
                    completedGames.push(game);
                }
            });
        }
        
        if (completedGames.length === 0) {
            gamelogSection.innerHTML = `
                <h4>Recent Games</h4>
                <div class="no-games">No recent completed games found</div>
            `;
            return;
        }
        
        // Sort by date (most recent first) and take first 10
        completedGames.sort((a, b) => new Date(b.date) - new Date(a.date));
        const recentGames = completedGames.slice(0, 10);
        
        // Create simplified game cards
        const gameCardsHtml = recentGames.map((game, index) => {
            const homeTeam = game.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home');
            const awayTeam = game.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away');
            
            const homeScore = homeTeam?.score || '0';
            const awayScore = awayTeam?.score || '0';
            
            // Determine winner for styling
            const homeWinner = homeTeam?.winner || false;
            const awayWinner = awayTeam?.winner || false;
            
            const gameDate = new Date(game.date);
            const formattedDate = gameDate.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric' 
            });
            
            const homeTeamLogo = `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${homeTeam?.id || '0'}.png`;
            const awayTeamLogo = `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${awayTeam?.id || '0'}.png`;
            
            return `
                <div class="game-log-card" data-game-index="${index}">
                    <div class="game-card-header">
                        <div class="game-match-info">
                            <img src="${awayTeamLogo}" alt="Away" class="team-logo" onerror="this.style.display='none';">
                            <div class="match-score">
                                <span class="score ${awayWinner ? 'winner' : (homeWinner ? 'loser' : '')}">${awayScore}</span>
                                <span class="score-separator">-</span>
                                <span class="score ${homeWinner ? 'winner' : (awayWinner ? 'loser' : '')}">${homeScore}</span>
                            </div>
                            <img src="${homeTeamLogo}" alt="Home" class="team-logo" onerror="this.style.display='none';">
                        </div>
                        <div class="quick-stats">
                            <div class="quick-stat">
                                <span>G:</span>
                                <span class="quick-stat-value">--</span>
                            </div>
                            <div class="quick-stat">
                                <span>A:</span>
                                <span class="quick-stat-value">--</span>
                            </div>
                        </div>
                    </div>
                    <div class="game-card-details">
                        <div class="game-details-content">
                            <div class="game-meta">
                                <span class="game-date">${formattedDate}</span>
                                <span class="playing-status">Played</span>
                            </div>
                            <div class="detailed-stats">
                                <div class="detailed-stat">
                                    <span class="detailed-stat-label">Status</span>
                                    <span class="detailed-stat-value">Played</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        gamelogSection.innerHTML = `
            <h4>Recent Games</h4>
            <div class="game-log-container">
                ${gameCardsHtml}
            </div>
        `;
        
        // Add click handlers for expand/collapse
        gamelogSection.querySelectorAll('.game-log-card').forEach(card => {
            card.addEventListener('click', () => {
                card.classList.toggle('expanded');
            });
        });
        
    } catch (error) {
        console.error('Error in fallback method:', error);
        gamelogSection.innerHTML = `
            <h4>Recent Games</h4>
            <div class="error">Unable to load recent games</div>
        `;
    }
}

// Display game log cards with column-style layout
async function displayGameLogCards(gameEvents, player, container) {
    const gameCardsHtml = await Promise.all(
        gameEvents.map(async (eventItem, index) => {
            try {
                // Get event details
                const eventResponse = await fetch(convertToHttps(eventItem.event.$ref));
                const eventData = await eventResponse.json();
                
                // Get player stats for this game
                let playerStats = null;
                if (eventItem.statistics) {
                    const statsResponse = await fetch(convertToHttps(eventItem.statistics.$ref));
                    playerStats = await statsResponse.json();
                }

                return createGameLogCard(eventData, playerStats, player, index);
            } catch (error) {
                console.error('Error loading game data:', error);
                return `<div class="game-log-card error">Unable to load game data</div>`;
            }
        })
    );

    container.innerHTML = `
        <h4>Recent Games</h4>
        <div class="game-log-container">
            ${gameCardsHtml.join('')}
        </div>
    `;

    // Add click handlers for expand/collapse
    container.querySelectorAll('.game-log-card').forEach(card => {
        card.addEventListener('click', () => {
            card.classList.toggle('expanded');
        });
    });
}

// Create individual game log card
async function createGameLogCard(eventData, playerStats, player, index) {
    try {
        const competition = eventData.competitions[0];
        const homeTeam = competition.competitors.find(comp => comp.homeAway === 'home');
        const awayTeam = competition.competitors.find(comp => comp.homeAway === 'away');
        
        // Get team logos 
        const homeTeamLogo = `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${homeTeam.id}.png`;
        const awayTeamLogo = `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${awayTeam.id}.png`;

        // Get scores from the competition data
        let homeScore = '0';
        let awayScore = '0';
        let homeWinner = false;
        let awayWinner = false;
        
        try {
            // Extract scores if available - handle both direct values and API references
            if (homeTeam.score) {
                if (homeTeam.score.value !== undefined) {
                    // Direct value available
                    homeScore = homeTeam.score.value.toString();
                    homeWinner = homeTeam.score.winner || false;
                } else if (homeTeam.score.$ref) {
                    // Need to fetch from API reference
                    try {
                        const scoreResponse = await fetch(convertToHttps(homeTeam.score.$ref));
                        if (scoreResponse.ok) {
                            const scoreData = await scoreResponse.json();
                            homeScore = scoreData.value ? scoreData.value.toString() : '0';
                            homeWinner = scoreData.winner || false;
                        }
                    } catch (refError) {

                    }
                }
            }
            
            if (awayTeam.score) {
                if (awayTeam.score.value !== undefined) {
                    // Direct value available
                    awayScore = awayTeam.score.value.toString();
                    awayWinner = awayTeam.score.winner || false;
                } else if (awayTeam.score.$ref) {
                    // Need to fetch from API reference
                    try {
                        const scoreResponse = await fetch(convertToHttps(awayTeam.score.$ref));
                        if (scoreResponse.ok) {
                            const scoreData = await scoreResponse.json();
                            awayScore = scoreData.value ? scoreData.value.toString() : '0';
                            awayWinner = scoreData.winner || false;
                        }
                    } catch (refError) {

                    }
                }
            }
            
            // Also check the competitor-level winner property as fallback
            if (!homeWinner && !awayWinner) {
                homeWinner = homeTeam.winner || false;
                awayWinner = awayTeam.winner || false;
            }
            
        } catch (scoreError) {

        }
        
        // Format date
        const gameDate = new Date(eventData.date);
        const formattedDate = gameDate.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
        });

        // Extract quick stats and detailed stats
        let quickStats = { goals: '0', assists: '0', saves: '0', cleanSheets: '0', fantasyPoints: 0 };
        let detailedStats = [];
        
        // Determine player position - debug what we're getting
        let position = player.position?.abbreviation || player.position;
        
        // If no position found, try to get it from the player data in fantasy team
        if (!position) {
            const fantasyTeamPlayer = Object.values(fantasyTeam).find(p => p.name === player.name);
            position = fantasyTeamPlayer?.position || 'F';
        }
        
        // Additional check: if the player is in a goalkeeper slot, force GK position
        const fantasyTeamEntry = Object.entries(fantasyTeam).find(([slot, p]) => p.name === player.name);
        if (fantasyTeamEntry) {
            const [slotKey, playerData] = fantasyTeamEntry;
            if (slotKey.startsWith('gk-') || playerData.position === 'GK') {
                position = 'GK';
            }
        }
        
        // Debug logging to see what position we're getting
        console.log(`Position debug for ${player.name}: original=${player.position}, final=${position}`);
        
        const isGoalkeeper = position === 'G' || position === 'GK' || position === 'Goalkeeper';
        console.log(`${player.name} isGoalkeeper: ${isGoalkeeper}, position: ${position}`);
        
        if (playerStats) {
            const extractedStats = extractGameStats(playerStats, position, player.name);
            quickStats = extractedStats.quick;
            detailedStats = extractedStats.detailed;
        }

        // Create quick stats display based on position - add FP first
        const fpColorClass = quickStats.fantasyPoints > 0 ? 'fp-positive' : quickStats.fantasyPoints < 0 ? 'fp-negative' : '';
        
        let quickStatsHtml = `
            <div class="quick-stat">
                <span>FP:</span>
                <span class="quick-stat-value ${fpColorClass}">${quickStats.fantasyPoints}</span>
            </div>
        `;
        
        if (isGoalkeeper) {
            quickStatsHtml += `
                <div class="quick-stat">
                    <span>SV:</span>
                    <span class="quick-stat-value">${quickStats.saves}</span>
                </div>
                <div class="quick-stat">
                    <span>CS:</span>
                    <span class="quick-stat-value">${quickStats.cleanSheets}</span>
                </div>
            `;
        } else {
            quickStatsHtml += `
                <div class="quick-stat">
                    <span>G:</span>
                    <span class="quick-stat-value">${quickStats.goals}</span>
                </div>
                <div class="quick-stat">
                    <span>A:</span>
                    <span class="quick-stat-value">${quickStats.assists}</span>
                </div>
            `;
        }

        // Create detailed stats display (only show if stats exist)
        const detailedStatsHtml = detailedStats.length > 0 ? detailedStats.map(stat => {
            // Special handling for Fantasy Points color coding
            if (stat.isFantasyPoints) {
                const numValue = parseFloat(stat.value);
                const colorClass = numValue > 0 ? 'fp-positive' : numValue < 0 ? 'fp-negative' : '';
                return `
                    <div class="detailed-stat">
                        <span class="detailed-stat-label">${stat.label}</span>
                        <span class="detailed-stat-value ${colorClass}">${stat.value}</span>
                    </div>
                `;
            }
            
            return `
                <div class="detailed-stat">
                    <span class="detailed-stat-label">${stat.label}</span>
                    <span class="detailed-stat-value">${stat.value}</span>
                </div>
            `;
        }).join('') : `
            <div class="detailed-stat">
                <span class="detailed-stat-label">Played</span>
                <span class="detailed-stat-value">Yes</span>
            </div>
        `;

        return `
            <div class="game-log-card" data-game-index="${index}">
                <div class="game-card-header">
                    <div class="game-match-info">
                        <img src="${awayTeamLogo}" alt="Away" class="team-logo" onerror="this.style.display='none';">
                        <div class="match-score">
                            <span class="score ${awayWinner ? 'winner' : (homeWinner ? 'loser' : '')}">${awayScore}</span>
                            <span class="score-separator">-</span>
                            <span class="score ${homeWinner ? 'winner' : (awayWinner ? 'loser' : '')}">${homeScore}</span>
                        </div>
                        <img src="${homeTeamLogo}" alt="Home" class="team-logo" onerror="this.style.display='none';">
                    </div>
                    <div class="quick-stats">
                        ${quickStatsHtml}
                        <span class="expand-icon">▼</span>
                    </div>
                </div>
                <div class="game-card-details">
                    <div class="game-details-content">
                        <div class="game-meta">
                            <span class="game-date">${formattedDate}</span>
                            <span class="playing-status">Played | ${position}</span>
                        </div>
                        <div class="detailed-stats">
                            ${detailedStatsHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error creating game card:', error);
        return `<div class="game-log-card error">Error loading game data</div>`;
    }
}

// Extract game stats from ESPN API response
function extractGameStats(statsData, position, playerName) {
    const quickStats = { goals: '0', assists: '0', saves: '0', cleanSheets: '0', fantasyPoints: 0 };
    const detailedStats = [];
    
    // Determine if this is a goalkeeper
    const isGoalkeeper = position === 'G' || position === 'GK' || position === 'Goalkeeper';
    
    try {
        
        if (statsData && statsData.splits && statsData.splits.categories) {
            const categories = statsData.splits.categories;
            
            // Create a map to store all extracted stats
            const allStats = {};
            
            // Extract stats from all categories first
            categories.forEach(category => {

                if (category.stats && Array.isArray(category.stats)) {
                    category.stats.forEach(stat => {
                        const abbrev = stat.abbreviation;
                        const value = stat.displayValue || stat.value || '0';
                        const label = stat.shortDisplayName || stat.displayName || abbrev;
                        const statName = stat.name;
                        
                        // Only process stats with actual values and names
                        if (statName && (stat.displayValue !== undefined || stat.value !== undefined)) {
                            
                            // Store the stat using both abbreviation and name for lookup
                            // Ensure we have a proper label - use abbreviation as fallback
                            const finalLabel = label || abbrev || statName || 'Unknown';
                            allStats[abbrev] = { label: finalLabel, value };
                            allStats[statName] = parseFloat(value) || 0; // Store numeric value for calculations
                            
                            // Also store the raw value for quick stats
                            if (abbrev) {
                                allStats[abbrev + '_raw'] = value;
                            }
                            
                            // Add common field name mappings for Fantasy Points calculation
                            switch(statName.toLowerCase()) {
                                case 'goals':
                                case 'goal':
                                    allStats['goals'] = parseFloat(value) || 0;
                                    allStats['G'] = parseFloat(value) || 0;
                                    break;
                                case 'assists':
                                case 'assist':
                                    allStats['assists'] = parseFloat(value) || 0;
                                    allStats['A'] = parseFloat(value) || 0;
                                    break;
                                case 'minutes':
                                case 'minutesplayed':
                                    allStats['minutes'] = parseFloat(value) || 0;
                                    allStats['MIN'] = parseFloat(value) || 0;
                                    break;
                                case 'saves':
                                case 'save':
                                    allStats['saves'] = parseFloat(value) || 0;
                                    allStats['SV'] = parseFloat(value) || 0;
                                    break;
                                case 'yellowcards':
                                case 'yellowcard':
                                    allStats['yellowCards'] = parseFloat(value) || 0;
                                    allStats['YC'] = parseFloat(value) || 0;
                                    break;
                                case 'redcards':
                                case 'redcard':
                                    allStats['redCards'] = parseFloat(value) || 0;
                                    allStats['RC'] = parseFloat(value) || 0;
                                    break;
                            }
                        }
                    });
                }
            });
            
            // Calculate Fantasy Points for quick stats
            // Use the same isGoalkeeper variable from above - don't redefine
            const fpPosition = normalizePosition(position);
            
            quickStats.fantasyPoints = calculateFantasyPoints(allStats, fpPosition);
            
            // Extract quick stats from the same allStats data used for detailed stats
            // Try multiple field name variations for each stat
            quickStats.goals = (allStats['goals'] || allStats['G_raw'] || allStats['G'] || 
                              (allStats['G'] && allStats['G'].value) || '0').toString();
            quickStats.assists = (allStats['assists'] || allStats['A_raw'] || allStats['A'] || 
                                 (allStats['A'] && allStats['A'].value) || '0').toString();
            quickStats.saves = (allStats['saves'] || allStats['SV_raw'] || allStats['SV'] || 
                               (allStats['SV'] && allStats['SV'].value) || '0').toString();
            quickStats.cleanSheets = (allStats['cleanSheet'] || allStats['CS_raw'] || allStats['CS'] || 
                                     (allStats['CS'] && allStats['CS'].value) || '0').toString();
            


            
            // Debug: Check some key stats objects



            
            // Now create detailed stats in the specific order requested
            
            // Calculate Fantasy Points first using the same logic as quick stats
            const fantasyPoints = calculateFantasyPoints(allStats, fpPosition);
            
            // Add Fantasy Points as the first detailed stat
            detailedStats.push({
                label: 'FP',
                value: fantasyPoints.toString(),
                isFantasyPoints: true
            });
            
            
            if (isGoalkeeper) {
                // Goalie order: FP, GA, SV, SHF, P, YC, RC, MIN
                const goalieOrder = [
                    { abbrev: 'GA', defaultLabel: 'Goals Against' },
                    { abbrev: 'SV', defaultLabel: 'Saves' },
                    { abbrev: 'SHF', defaultLabel: 'Shots Faced' },
                    { abbrev: 'P', defaultLabel: 'Punches' },
                    { abbrev: 'YC', defaultLabel: 'Yellow Cards' },
                    { abbrev: 'RC', defaultLabel: 'Red Cards' },
                    { abbrev: 'MIN', defaultLabel: 'Minutes' }
                ];
                
                goalieOrder.forEach(({ abbrev, defaultLabel }) => {
                    // Check if it's an object with label/value OR if it's a direct number value
                    if ((allStats[abbrev] && allStats[abbrev].label && allStats[abbrev].value !== undefined) ||
                        (typeof allStats[abbrev] === 'number')) {
                        
                        // If it's a number, convert it to the expected object format
                        if (typeof allStats[abbrev] === 'number') {
                            detailedStats.push({ label: defaultLabel, value: allStats[abbrev].toString() });
                        } else {
                            detailedStats.push(allStats[abbrev]);
                        }
                    } else if (['GA', 'SV', 'YC', 'RC', 'MIN'].includes(abbrev)) {
                        // Include important stats even if 0
                        detailedStats.push({ label: defaultLabel, value: '0' });
                    }
                });
            } else {
                // Outfield player order: FP, G, A, SG, SH, YC, RC, MIN
                const outfieldOrder = [
                    { abbrev: 'G', defaultLabel: 'Goals' },
                    { abbrev: 'A', defaultLabel: 'Assists' },
                    { abbrev: 'SG', defaultLabel: 'Shots on Goal' }, // Alternative abbreviation
                    { abbrev: 'SOG', defaultLabel: 'Shots on Goal' }, // Alternative abbreviation
                    { abbrev: 'ST', defaultLabel: 'Shots on Target' }, // Alternative abbreviation
                    { abbrev: 'SH', defaultLabel: 'Shots' },
                    { abbrev: 'YC', defaultLabel: 'Yellow Cards' },
                    { abbrev: 'RC', defaultLabel: 'Red Cards' },
                    { abbrev: 'MIN', defaultLabel: 'Minutes' }
                ];
                
                outfieldOrder.forEach(({ abbrev, defaultLabel }) => {

                    if (abbrev === 'MIN') {
                        // Handle MIN stat for minutes played
                    }
                    
                    // Check if it's an object with label/value OR if it's a direct number value
                    if ((allStats[abbrev] && allStats[abbrev].label && allStats[abbrev].value !== undefined) ||
                        (typeof allStats[abbrev] === 'number')) {
                        
                        // If it's a number, convert it to the expected object format
                        if (typeof allStats[abbrev] === 'number') {
                            detailedStats.push({ label: defaultLabel, value: allStats[abbrev].toString() });
                        } else {
                            detailedStats.push(allStats[abbrev]);
                        }
                    } else if (['G', 'A', 'SH', 'YC', 'RC', 'MIN'].includes(abbrev)) {
                        // Include important stats even if 0

                        detailedStats.push({ label: defaultLabel, value: '0' });
                    }
                });
                
                // Remove duplicates (in case both SG/SOG/ST exist, keep the first one found)
                const seenLabels = new Set();
                const filteredStats = detailedStats.filter(stat => {
                    if (!stat || !stat.label) return true; // Keep stats without labels
                    const isShootsOnGoal = stat.label.toLowerCase().includes('shots on');
                    if (isShootsOnGoal) {
                        if (seenLabels.has('shots_on_goal')) {
                            return false;
                        }
                        seenLabels.add('shots_on_goal');
                    }
                    return true;
                });
                detailedStats.length = 0;
                detailedStats.push(...filteredStats);
            }
        }
        


        
    } catch (error) {
        console.error('Error extracting game stats:', error);
    }
    
    // Ensure we have at least basic stats if none were found
    if (detailedStats.length === 0) {
        const isGoalkeeper = position === 'G' || position === 'GK' || position === 'Goalkeeper';
        
        // For players who played, give them minimum fantasy points for playing time
        const defaultFP = 0; // Show 0 when no stats available as requested
        detailedStats.push({
            label: 'FP',
            value: defaultFP.toString(),
            isFantasyPoints: true
        });
        
        if (isGoalkeeper) {
            detailedStats.push(
                { label: 'Goals Against', value: '0' },
                { label: 'Saves', value: quickStats.saves },
                { label: 'Yellow Cards', value: '0' },
                { label: 'Red Cards', value: '0' },
                { label: 'Minutes', value: '90' }
            );
        } else {
            detailedStats.push(
                { label: 'Goals', value: quickStats.goals },
                { label: 'Assists', value: quickStats.assists },
                { label: 'Shots', value: '0' },
                { label: 'Yellow Cards', value: '0' },
                { label: 'Red Cards', value: '0' },
                { label: 'Minutes', value: '90' }
            );
        }
        
        // Also update quick stats with default FP
        quickStats.fantasyPoints = defaultFP;
    }
    
    return { quick: quickStats, detailed: detailedStats };
}

// Display player game stats following team-page.js displayPlayerGameStats pattern
async function displayPlayerGameStats(game, teamIdForSeason, leagueForSeason, selectedPlayer, resultsContainer) {
    if (!resultsContainer || !selectedPlayer) return;

    try {
        // Get detailed game data with lineups using the same API as team-page.js
        const gameResponse = await fetch(`https://cdn.espn.com/core/soccer/lineups?xhr=1&gameId=${game.id}`);
        const gameData = await gameResponse.json();



        // Get rosters from gamepackageJSON
        const rosters = gameData.gamepackageJSON?.rosters || [];


        if (rosters.length === 0) {
            resultsContainer.innerHTML = `
                <h4>Recent Game</h4>
                <div class="no-data">No lineup data available for this game</div>
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
                <h4>Recent Game</h4>
                <div class="no-data">
                    Player was not in the squad for the most recent game<br>
                    <small>${gameDate.toLocaleDateString()} ${isHomeTeam ? 'vs' : 'at'} ${opponent.team.displayName}</small>
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
        const isHomeTeam = teamCompetitor.homeAway === 'home';
        
        // Team logos - using dark logos as requested
        const teamLogo = `https://a.espncdn.com/i/teamlogos/soccer/500/${teamIdForSeason}.png`;
        const opponentLogo = `https://a.espncdn.com/i/teamlogos/soccer/500/${opponentCompetitor.team.id}.png`;

        // Game result
        let gameResult = '';
        const teamScoreInt = parseInt(teamScore);
        const opponentScoreInt = parseInt(opponentScore);
        if (teamScoreInt > opponentScoreInt) {
            gameResult = 'W';
        } else if (teamScoreInt < opponentScoreInt) {
            gameResult = 'L';
        } else {
            gameResult = 'D';
        }

        // Extract player stats if available
        const stats = playerData.stats || [];
        const playerStats = stats.reduce((acc, stat) => {
            acc[stat.abbreviation] = stat.displayValue;
            return acc;
        }, {});

        // Create position-specific stats display
        const position = playerData.position?.abbreviation || selectedPlayer.position;
        let statsDisplay = '';
        
        if (position === 'G') {
            // Goalkeeper stats
            statsDisplay = `
                <div class="game-stats">
                    <div class="stat-row">
                        <span>Saves: ${playerStats['SV'] || '0'}</span>
                        <span>GA: ${playerStats['GA'] || '0'}</span>
                    </div>
                    <div class="stat-row">
                        <span>YC: ${playerStats['YC'] || '0'}</span>
                        <span>RC: ${playerStats['RC'] || '0'}</span>
                    </div>
                </div>
            `;
        } else {
            // Outfield player stats
            statsDisplay = `
                <div class="game-stats">
                    <div class="stat-row">
                        <span>Goals: ${playerStats['G'] || '0'}</span>
                        <span>Assists: ${playerStats['A'] || '0'}</span>
                    </div>
                    <div class="stat-row">
                        <span>Shots: ${playerStats['SH'] || '0'}</span>
                        <span>SOG: ${playerStats['ST'] || '0'}</span>
                    </div>
                    <div class="stat-row">
                        <span>YC: ${playerStats['YC'] || '0'}</span>
                        <span>RC: ${playerStats['RC'] || '0'}</span>
                    </div>
                </div>
            `;
        }

        // Create the game display
        resultsContainer.innerHTML = `
            <h4>Recent Game</h4>
            <div class="recent-game-card">
                <div class="game-header">
                    <div class="game-teams">
                        <img src="${teamLogo}" alt="Team" class="team-logo" onerror="this.style.display='none';">
                        <span class="score">${teamScore}</span>
                        <span class="vs">-</span>
                        <span class="score">${opponentScore}</span>
                        <img src="${opponentLogo}" alt="Opponent" class="team-logo" onerror="this.style.display='none';">
                        <span class="result ${gameResult.toLowerCase()}">${gameResult}</span>
                    </div>
                    <div class="game-date">${gameDate.toLocaleDateString()}</div>
                </div>
                <div class="player-performance">
                    <div class="playing-status">
                        ${playerData.starter ? 'Started' : 'Substitute'} | ${position}
                    </div>
                    ${statsDisplay}
                </div>
            </div>
        `;

    } catch (error) {
        console.error('Error displaying player game stats:', error);
        resultsContainer.innerHTML = `
            <h4>Recent Game</h4>
            <div class="error">Unable to load recent game stats</div>
        `;
    }
}

async function displayPlayerStats(statsData, container, position, selectedPlayer, teamIdForSeason, leagueForSeason, statsYear) {
  const statsSection = container.querySelector('.stats-section');
  const gamelogSection = container.querySelector('.gamelog-section');
  
  if (!statsSection) return;
  
  // Determine header text based on year
  const currentYear = new Date().getFullYear();
  const headerText = statsYear && statsYear !== currentYear ? `Season Stats (${statsYear})` : 'Season Stats';
  
  // Process stats based on position
  let statsHtml = '';
  
  if (statsData && typeof statsData === 'object') {
    // Extract relevant stats based on position
    const stats = extractFantasyPlayerStats(statsData, position);
    
    statsHtml = Object.entries(stats).map(([label, value]) => {
      // Special handling for Fantasy Points color coding
      if (label === 'Fantasy Points') {
        const numValue = parseFloat(value);
        const colorClass = numValue > 0 ? 'fp-positive' : numValue < 0 ? 'fp-negative' : '';
        return `
          <div class="stat-item">
            <span class="stat-label">${label}:</span>
            <span class="stat-value ${colorClass}">${value}</span>
          </div>
        `;
      }
      
      return `
        <div class="stat-item">
          <span class="stat-label">${label}:</span>
          <span class="stat-value">${value}</span>
        </div>
      `;
    }).join('');
  }
  
  if (!statsHtml) {
    statsHtml = `
      <div class="stat-item">
        <span class="stat-label">Goals:</span>
        <span class="stat-value">--</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Assists:</span>
        <span class="stat-value">--</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Appearances:</span>
        <span class="stat-value">--</span>
      </div>
    `;
  }
  
  statsSection.innerHTML = `
    <h4>${headerText}</h4>
    ${statsHtml}
  `;
}

function extractFantasyPlayerStats(statsData, position) {
  const stats = {};
  const rawStats = {}; // For Fantasy Points calculation
  
  try {

    
    // Follow team-page.js pattern for extracting stats from the ESPN sports.core.api response
    if (statsData && statsData.splits && statsData.splits.categories && Array.isArray(statsData.splits.categories)) {
      // The actual stats are in splits.categories
      const categories = statsData.splits.categories;

      
      // Extract stats from categories (the property is 'stats', not 'statistics')
      categories.forEach(category => {

        if (category.stats && Array.isArray(category.stats)) {
          category.stats.forEach(stat => {
            const abbrev = stat.abbreviation;
            const value = stat.displayValue || stat.value || '0';
            const numericValue = parseFloat(value) || 0;
            const statName = stat.name;
            
            
            // Store raw stats for Fantasy Points calculation using stat names
            if (statName) {
              rawStats[statName] = numericValue;
              rawStats[abbrev] = numericValue; // Also store by abbreviation
            }
            
            // Map common stats based on position and category for display
            switch(abbrev) {
              case 'APP': stats['Appearances'] = value; break;
              case 'MIN': stats['Minutes Played'] = value; rawStats['minutes'] = numericValue; break;
              case 'YC': stats['Yellow Cards'] = value; rawStats['yellowCards'] = numericValue; break;
              case 'RC': stats['Red Cards'] = value; rawStats['redCards'] = numericValue; break;
              case 'FC': stats['Fouls Committed'] = value; break;
              case 'FA': stats['Fouls Suffered'] = value; break;
              case 'A': stats['Assists'] = value; rawStats['assists'] = numericValue; break;
              case 'SH': case 'totalShots': stats['Shots'] = value; break;
              case 'SOG': case 'ST': case 'shotsOnTarget': stats['Shots on Target'] = value; break;
              case 'G': case 'goals': stats['Goals'] = value; rawStats['goals'] = numericValue; break;
              case 'PKG': stats['Penalty Goals'] = value; break;
              case 'FKG': stats['Free Kick Goals'] = value; break;
              case 'HEADG': stats['Headed Goals'] = value; break;
              case 'GWG': stats['Game Winning Goals'] = value; break;
              case 'PASS%': stats['Pass Percentage'] = value; break;
              case 'AC.PASS': stats['Accurate Passes'] = value; break;
              case 'INPASS': stats['Inaccurate Passes'] = value; break;
              case 'TKLW': stats['Tackles Won'] = value; rawStats['effectiveTackles'] = numericValue; break;
              case 'TKLL': stats['Tackles Lost'] = value; break;
              case 'TOT': case 'TACKL': stats['Total Tackles'] = value; rawStats['totalTackles'] = numericValue; break;
              case 'INT': stats['Interceptions'] = value; rawStats['interceptions'] = numericValue; break;
              case 'CLEAR': stats['Clearances'] = value; rawStats['totalClearance'] = numericValue; break;
              case 'EFFCL': stats['Effective Clearances'] = value; rawStats['effectiveClearance'] = numericValue; break;
              case 'SHBLK': stats['Shots Blocked'] = value; rawStats['blockedShots'] = numericValue; break;
              case 'SV': stats['Saves'] = value; rawStats['saves'] = numericValue; break;
              case 'GA': stats['Goals Against'] = value; rawStats['goalsConceded'] = numericValue; break;
              case 'CS': stats['Clean Sheets'] = value; rawStats['cleanSheet'] = numericValue; break;
              case 'SHF': stats['Shots Faced'] = value; break;
              case 'PKS': stats['Penalty Saves'] = value; rawStats['penaltyKicksSaved'] = numericValue; break;
              case 'PK': stats['Penalties Faced'] = value; break;
              case 'CC': stats['Crosses Caught'] = value; break;
              case 'P': stats['Punches'] = value; break;
              case 'OG': rawStats['ownGoals'] = numericValue; break;
            }
            
            // Handle stats by name if no abbreviation found
            if (stat.name && !abbrev) {
              switch(stat.name) {
                case 'goalAssists': stats['Assists'] = value; rawStats['assists'] = numericValue; break;
                case 'goals': stats['Goals'] = value; rawStats['goals'] = numericValue; break;
                case 'totalShots': stats['Shots'] = value; break;
                case 'shotsOnTarget': stats['Shots on Target'] = value; break;
              }
            }
          });
        }
      });
      
      // Check for missing goals/assists specifically and add them as 0 if not found
      if (!stats['Goals']) {
        stats['Goals'] = '0';
      }
      if (!stats['Assists']) {
        stats['Assists'] = '0';
      }
    } else if (statsData && statsData.splits && statsData.splits.length > 0) {
      // Fallback: try the old structure
      const seasonSplit = statsData.splits[0];
      const seasonStats = seasonSplit.stat || {};
      

      
      // Extract stats using the same field names as team-page.js
      if (position === 'GK' || position === 'G' || position === 'Goalkeeper') {
        // Goalkeeper stats
        stats['Appearances'] = seasonStats.appearances || seasonStats.gamesPlayed || seasonStats.games || '0';
        stats['Saves'] = seasonStats.saves || '0';
        stats['Goals Against'] = seasonStats.goalsAgainst || '0';
        stats['Clean Sheets'] = seasonStats.cleanSheets || seasonStats.shutouts || '0';
        stats['Save Percentage'] = seasonStats.savePercentage ? `${seasonStats.savePercentage}%` : '0%';
        stats['Yellow Cards'] = seasonStats.yellowCards || '0';
        stats['Red Cards'] = seasonStats.redCards || '0';
      } else {
        // Outfield player stats
        stats['Appearances'] = seasonStats.appearances || seasonStats.gamesPlayed || seasonStats.games || '0';
        stats['Goals'] = seasonStats.goals || '0';
        stats['Assists'] = seasonStats.assists || '0';
        stats['Shots'] = seasonStats.shots || seasonStats.shotsTotal || '0';
        stats['Shots on Target'] = seasonStats.shotsOnTarget || seasonStats.shotsOnGoal || '0';
        stats['Yellow Cards'] = seasonStats.yellowCards || '0';
        stats['Red Cards'] = seasonStats.redCards || '0';
        stats['Minutes Played'] = seasonStats.minutesPlayed || '0';
      }
    } else if (statsData && statsData.categories) {
      // Alternative format - extract from categories like team-page.js  
      statsData.categories.forEach(category => {
        if (category.stats) {
          category.stats.forEach(stat => {
            switch(stat.abbreviation) {
              case 'APP': stats['Appearances'] = stat.displayValue; break;
              case 'G': stats['Goals'] = stat.displayValue; break;
              case 'A': stats['Assists'] = stat.displayValue; break;
              case 'SH': stats['Shots'] = stat.displayValue; break;
              case 'SOG': case 'ST': stats['Shots on Target'] = stat.displayValue; break;
              case 'YC': stats['Yellow Cards'] = stat.displayValue; break;
              case 'RC': stats['Red Cards'] = stat.displayValue; break;
              case 'MIN': stats['Minutes Played'] = stat.displayValue; break;
              case 'SV': stats['Saves'] = stat.displayValue; break;
              case 'GA': stats['Goals Against'] = stat.displayValue; break;
              case 'CS': case 'SHO': stats['Clean Sheets'] = stat.displayValue; break;
              case 'SVP': stats['Save Percentage'] = stat.displayValue; break;
            }
          });
        }
      });
    } else {

      if (statsData && statsData.splits) {

      }
    }
  } catch (error) {
    console.error('Error extracting player stats:', error);
  }
  

  
  // Return sorted stats based on position
  return sortStatsForDisplay(stats, position, rawStats);
}

// Helper function to sort stats in logical display order
function sortStatsForDisplay(stats, position, rawStats = {}) {
  const sortedStats = {};
  
  // Calculate and add Fantasy Points as the first stat if we have raw stats
  if (rawStats && Object.keys(rawStats).length > 0) {
    const fantasyPoints = calculateFantasyPoints(rawStats, position);
    sortedStats['Fantasy Points'] = fantasyPoints;
  } else {
    // Fallback: try to calculate from display stats
    const fallbackStats = {};
    Object.entries(stats).forEach(([key, value]) => {
      const numValue = parseFloat(value) || 0;
      switch(key) {
        case 'Goals': fallbackStats['goals'] = numValue; break;
        case 'Assists': fallbackStats['assists'] = numValue; break;
        case 'Minutes Played': fallbackStats['minutes'] = numValue; break;
        case 'Yellow Cards': fallbackStats['yellowCards'] = numValue; break;
        case 'Red Cards': fallbackStats['redCards'] = numValue; break;
        case 'Clean Sheets': fallbackStats['cleanSheet'] = numValue; break;
        case 'Saves': fallbackStats['saves'] = numValue; break;
        case 'Goals Against': fallbackStats['goalsConceded'] = numValue; break;
        case 'Tackles Won': fallbackStats['effectiveTackles'] = numValue; break;
        case 'Interceptions': fallbackStats['interceptions'] = numValue; break;
        case 'Clearances': fallbackStats['totalClearance'] = numValue; break;
        case 'Shots Blocked': fallbackStats['blockedShots'] = numValue; break;
      }
    });
    const fantasyPoints = calculateFantasyPoints(fallbackStats, position);
    sortedStats['Fantasy Points'] = fantasyPoints;
  }
  
  // Define the order based on position
  let statOrder;
  
  if (position === 'GK' || position === 'G' || position === 'Goalkeeper') {
    // Goalkeeper stat order (most important first) - EXCLUDE outfield stats
    statOrder = [
      'Appearances',
      'Minutes Played',
      'Saves',
      'Goals Against',
      'Clean Sheets',
      'Shots Faced',
      'Penalty Saves',
      'Penalties Faced',
      'Crosses Caught',
      'Punches',
      'Yellow Cards',
      'Red Cards'
    ];
  } else {
    // Outfield player stat order (most important first) - EXCLUDE goalkeeper stats
    statOrder = [
      'Appearances',
      'Goals',
      'Assists',
      'Minutes Played',
      'Shots',
      'Shots on Target',
      'Penalty Goals',
      'Free Kick Goals',
      'Headed Goals',
      'Game Winning Goals',
      'Pass Percentage',
      'Accurate Passes',
      'Inaccurate Passes',
      'Tackles Won',
      'Tackles Lost',
      'Total Tackles',
      'Interceptions',
      'Clearances',
      'Effective Clearances',
      'Shots Blocked',
      'Yellow Cards',
      'Red Cards',
      'Fouls Committed',
      'Fouls Suffered'
    ];
  }
  
  // Add stats in the defined order, filtering out inappropriate stats by position
  statOrder.forEach(statName => {
    if (stats[statName] !== undefined) {
      sortedStats[statName] = stats[statName];
    }
  });
  
  // Filter out any inappropriate stats that might have been added
  if (position === 'GK' || position === 'G' || position === 'Goalkeeper') {
    // Remove outfield-specific stats from goalkeepers
    const outfieldStats = [
      'Goals', 'Assists', 'Shots', 'Shots on Target', 'Penalty Goals', 
      'Free Kick Goals', 'Headed Goals', 'Game Winning Goals'
    ];
    outfieldStats.forEach(stat => {
      delete sortedStats[stat];
    });
  } else {
    // Remove goalkeeper-specific stats from outfield players
    const goalkeeperStats = [
      'Punches', 'Saves', 'Shots Faced', 'Penalties Faced', 
      'Penalty Saves', 'Crosses Caught'
    ];
    goalkeeperStats.forEach(stat => {
      delete sortedStats[stat];
    });
  }
  
  // Don't add any remaining stats that weren't in the predefined order to avoid mixing
  // inappropriate stats based on position
  
  // Return sorted stats or defaults if empty
  if (Object.keys(sortedStats).length > 0) {

    return sortedStats;
  } else {

    return {
      'Goals': '0',
      'Assists': '0',
      'Appearances': '0'
    };
  }
}

// PAGE 3: Player Selector
async function showPlayerSelector(position) {
  selectedPosition = position;
  currentTeamPage = 3;
  
  const teamCard = document.querySelector('.team-card1');
  teamCard.innerHTML = `
    <div class="team-page-header">
      <button class="back-btn" onclick="loadTeamGames()">← Back</button>
      <h3>Select ${position}</h3>
      <div class="page-indicator">Page 3 of 3</div>
    </div>
    <div class="player-selector-container">
      <div class="search-controls">
        <input type="text" id="playerSearchInput" placeholder="Search players..." class="search-input">
      </div>
      <div id="playersListContent">
        <div class="loading">Loading players...</div>
      </div>
    </div>
  `;
  
  await loadPlayerSelectorPage();
}

// PAGE 3: Player Selector Page
async function loadPlayerSelectorPage() {
  currentTeamPage = 3;
  const teamCard = document.querySelector('.team-card1');
  
  teamCard.innerHTML = `
    <div class="team-page-header">
      <h3>Select Players</h3>
      <div class="page-indicator">Page 3 of 3</div>
    </div>
    <div class="player-selector-container">
      <div class="search-controls">
        <input type="text" id="playerSearchInput" class="search-input" placeholder="Search players..." />
      </div>
      <div id="playersListContent">
        <div class="loading">Loading players...</div>
      </div>
    </div>
  `;
  
  // Wait for DOM to update
  await new Promise(resolve => setTimeout(resolve, 50));
  
  try {
    // Always prioritize the correct league's cached data
    let playersToUse = [];
    
    // First check if we have cached data for the current league
    if (leaguePlayersCache[currentLeague] && leaguePlayersCache[currentLeague].length > 0) {
      playersToUse = leaguePlayersCache[currentLeague];
      allLeaguePlayers = playersToUse; // Update global reference
    } else if (allLeaguePlayers.length > 0) {
      // Only use global allLeaguePlayers if no cache exists and it has data
      playersToUse = allLeaguePlayers;
    }
    
    if (playersToUse.length === 0) {
      // Show loading state and fetch players
      const playersContent = document.getElementById('playersListContent');
      if (playersContent) {
        playersContent.innerHTML = '<div class="loading">Loading players for the first time...</div>';
      }
      
      playersToUse = await fetchAllLeaguePlayers();
    }
    
    // Filter players by selected position
    const positionFilter = getPositionFilter(selectedPosition);
    const filteredPlayers = playersToUse.filter(player => 
      positionFilter.includes(player.position?.abbreviation || player.position?.name || '')
    );
    

    
    // Display players immediately
    displayPlayersList(filteredPlayers);
    
    // Setup search functionality
    const searchInput = document.getElementById('playerSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        if (searchTerm === '') {
          // Show all filtered players when search is empty
          displayPlayersList(filteredPlayers);
          return;
        }
        
        // Get current fantasy team to exclude already selected players
        const currentFantasyTeam = getFantasyTeamForCurrentLeague();
        const selectedPlayerIds = Object.values(currentFantasyTeam)
          .filter(player => player && player.id)
          .map(player => player.id.toString());
        
        const searchResults = filteredPlayers.filter(player => {
          const matchesSearch = player.fullName?.toLowerCase().includes(searchTerm) ||
                              player.displayName?.toLowerCase().includes(searchTerm) ||
                              player.teamName?.toLowerCase().includes(searchTerm);
          const notSelected = !selectedPlayerIds.includes(player.id?.toString() || '');
          
          return matchesSearch && notSelected;
        });
        
        displayPlayersList(searchResults);
      });
    }
    
  } catch (error) {
    console.error('Error loading player selector page:', error);
    const playersContent = document.getElementById('playersListContent');
    if (playersContent) {
      playersContent.innerHTML = '<div class="error">Error loading players. Please try again.</div>';
    }
  }
}

function getPositionFilter(position) {
  // Map fantasy positions to actual player positions
  switch (position) {
    case 'GK':
      return ['G', 'GK', 'Goalkeeper'];
    case 'DEF':
      return ['D', 'DEF', 'Defender', 'CB', 'LB', 'RB', 'LWB', 'RWB'];
    case 'MID':
      return ['M', 'MID', 'Midfielder', 'CM', 'DM', 'AM', 'LM', 'RM'];
    case 'FWD':
      return ['F', 'FWD', 'Forward', 'ST', 'CF', 'LW', 'RW'];
    default:
      return [];
  }
}

async function fetchAllLeaguePlayers() {
  try {

    
    // Check if we have cached data for this league
    if (leaguePlayersCache[currentLeague] && leaguePlayersCache[currentLeague].length > 0) {

      allLeaguePlayers = leaguePlayersCache[currentLeague];
      return allLeaguePlayers;
    }
    
    // Check if we're already loading this league
    if (leagueLoadingPromises[currentLeague]) {

      return await leagueLoadingPromises[currentLeague];
    }
    

    
    // Create and store the loading promise
    leagueLoadingPromises[currentLeague] = fetchLeaguePlayersInternal(currentLeague);
    
    try {
      const players = await leagueLoadingPromises[currentLeague];
      return players;
    } finally {
      // Clean up the loading promise when done
      delete leagueLoadingPromises[currentLeague];
    }
    
  } catch (error) {
    console.error('Error fetching league players:', error);
    // Clean up the loading promise on error
    delete leagueLoadingPromises[currentLeague];
    throw error;
  }
}

// Internal function that does the actual fetching
async function fetchLeaguePlayersInternal(leagueCode) {
  // Get all teams in the current league
  const teamsResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/teams`);
  const teamsData = await teamsResponse.json();
  
  if (!teamsData.sports || !teamsData.sports[0] || !teamsData.sports[0].leagues || !teamsData.sports[0].leagues[0]) {
    throw new Error('Invalid teams data structure');
  }
  
  const teams = teamsData.sports[0].leagues[0].teams;

  
  // Create batches of team requests to avoid overwhelming the API
  const batchSize = 5; // Process 5 teams at a time
  const teamBatches = [];
  for (let i = 0; i < teams.length; i += batchSize) {
    teamBatches.push(teams.slice(i, i + batchSize));
  }
  
  const allPlayers = [];
  const currentYear = 2025;
  const previousYear = 2024;
  
  // Process each batch in parallel
  for (let batchIndex = 0; batchIndex < teamBatches.length; batchIndex++) {
    const batch = teamBatches[batchIndex];
    
    // Fetch all teams in this batch in parallel
    const batchPromises = batch.map(async (teamWrapper) => {
      try {
        const team = teamWrapper.team;
        
        // Try current year first
        let rosterData = null;
        
        try {
          const currentYearResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/teams/${team.id}/roster?season=${currentYear}`);
          if (currentYearResponse.ok) {
            const data = await currentYearResponse.json();
            if (data.athletes && data.athletes.length > 0) {
              rosterData = data;
            }
          }
        } catch (currentYearError) {

        }
        
        // Only try previous year if current year had no data
        if (!rosterData || !rosterData.athletes || rosterData.athletes.length === 0) {
          try {

            const previousYearResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/teams/${team.id}/roster?season=${previousYear}`);
            if (previousYearResponse.ok) {
              const data = await previousYearResponse.json();
              if (data.athletes && data.athletes.length > 0) {
                rosterData = data;
              }
            }
          } catch (previousYearError) {

          }
        }
        
        if (!rosterData || !rosterData.athletes) {

          return [];
        }
        
        return rosterData.athletes.map(athlete => {
          const position = athlete.position?.abbreviation || athlete.position?.name || "Unknown";
          let firstName, lastName;

          // Handle name parsing
          if (athlete.firstName && athlete.firstName.includes(' ')) {
            const nameParts = athlete.firstName.split(' ');
            firstName = nameParts[0];
            lastName = nameParts.slice(1).join(' ');
          } else {
            firstName = athlete.firstName || "Unknown";
            lastName = (athlete.lastName && athlete.lastName !== athlete.firstName) ? athlete.lastName : "";
          }

          return {
            id: athlete.id,
            firstName: firstName,
            lastName: lastName,
            fullName: athlete.fullName || `${firstName} ${lastName}`.trim(),
            displayName: lastName ? `${firstName} ${lastName}`.trim() : firstName,
            position: {
              abbreviation: position,
              name: athlete.position?.name || position
            },
            jersey: athlete.jersey || 'N/A',
            teamId: team.id,
            teamName: team.shortDisplayName || team.displayName,
            teamLogo: team.logos?.[0]?.href || ''
          };
        });
        
      } catch (error) {
        console.error(`Error fetching roster for team ${teamWrapper.team.id}:`, error);
        return [];
      }
    });
    
    // Wait for all teams in this batch to complete
    const batchResults = await Promise.allSettled(batchPromises);
    
    // Flatten and add results from this batch
    batchResults.forEach(result => {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        allPlayers.push(...result.value);
      }
    });
    
    // Small delay between batches to be respectful to the API
    if (batchIndex < teamBatches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  // Update the global variable for the current league
  if (leagueCode === currentLeague) {
    allLeaguePlayers = allPlayers;
  }
  
  // Cache the data for this league
  leaguePlayersCache[leagueCode] = allPlayers;
  

  return allPlayers;
}

function displayPlayersList(players) {
  const container = document.getElementById('playersListContent');
  if (!container) return;
  
  if (players.length === 0) {
    container.innerHTML = '<div class="no-players">No players found</div>';
    return;
  }
  
  // Get current fantasy team to exclude already selected players
  const currentFantasyTeam = getFantasyTeamForCurrentLeague();
  const selectedPlayerIds = Object.values(currentFantasyTeam)
    .filter(player => player && player.id)
    .map(player => String(player.id));
  

  
  // Filter out already selected players
  const availablePlayers = players.filter(player => 
    !selectedPlayerIds.includes(String(player.id))
  );
  
  if (availablePlayers.length === 0) {
    container.innerHTML = '<div class="no-players">All available players are already on your team</div>';
    return;
  }
  
  const playersHtml = availablePlayers.slice(0, 20).map(player => createPlayerCard(player)).join(''); // Limit to 20 for performance
  
  container.innerHTML = `
    <div class="players-grid">
      ${playersHtml}
    </div>
  `;
}

function createPlayerCard(player) {
  const playerName = player.fullName || player.displayName || 'Unknown Player';
  const position = player.position?.abbreviation || player.position?.name || 'N/A';
  const jerseyNumber = player.jersey || '--';
  const teamId = player.teamId || '';
  
  return `
    <div class="player-card" onclick="selectPlayerAsync('${player.id}', '${playerName.replace(/'/g, "\\'")}', '${position}', '${jerseyNumber}', '${player.teamName.replace(/'/g, "\\'")}', '${player.teamLogo}', '${teamId}')">
      <div class="player-number">${jerseyNumber}</div>
      <div class="player-details">
        <div class="player-name">${playerName}</div>
        <div class="player-meta">${position} • ${player.teamName}</div>
      </div>
      <div class="player-team-logo">
        <img src="${player.teamLogo}" alt="${player.teamName}" onerror="this.src='soccer-ball-png-24.png'">
      </div>
    </div>
  `;
}

// Fetch and store player stats for fantasy points calculation
async function fetchAndStorePlayerStats(playerId, position, slotKey) {
  try {

    
    // Get current year and try to fetch stats
    const currentYear = new Date().getFullYear();
    
    let playerStatsData = null;
    
    // Try to load player stats using the ESPN API (current year only)
    try {
      const statsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${currentLeague}/seasons/${currentYear}/types/1/athletes/${playerId}/statistics?lang=en&region=us`;
      
      const statsResponse = await fetch(statsUrl);
      if (statsResponse.ok) {
        playerStatsData = await statsResponse.json();
      } else {
        console.warn(`Stats API failed for player ${playerId} with status ${statsResponse.status}`);
      }
    } catch (error) {
      console.error(`Error fetching stats for player ${playerId}:`, error);
    }
    
    // Extract fantasy-relevant stats
    if (playerStatsData) {
      const fantasyStats = extractFantasyPlayerStats(playerStatsData, position);
      
      // Store stats in the fantasy team player data
      if (fantasyTeam[slotKey]) {
        fantasyTeam[slotKey].stats = fantasyStats;
        
        // Calculate and cache fantasy points
        const fantasyPoints = calculateFantasyPoints(fantasyStats, position);
        fantasyTeam[slotKey].cachedFP = fantasyPoints;
        
        // Add to global total
        addToTotalFP(fantasyPoints);
        
        console.log(`Stored fantasy stats for ${fantasyTeam[slotKey].name}: ${fantasyPoints} FP`);

      }
    } else {
      console.warn(`No stats data found for player ${playerId}, using default 0 values`);
      
      // Create zero stats as requested by user
      const fallbackStats = {
        goals: 0,
        assists: 0,
        minutes: 0,
        saves: 0,
        cleanSheet: 0,
        yellowCards: 0,
        redCards: 0
      };
      
      // Store fallback stats
      if (fantasyTeam[slotKey]) {
        fantasyTeam[slotKey].stats = fallbackStats;
        
        // Calculate and cache fantasy points for fallback stats
        const fallbackFP = calculateFantasyPoints(fallbackStats, position);
        fantasyTeam[slotKey].cachedFP = fallbackFP;
        
        // Add to global total
        addToTotalFP(fallbackFP);
        
        console.log(`Stored fallback stats for ${fantasyTeam[slotKey].name}: ${fallbackFP} FP`);
      }
    }
    
  } catch (error) {
    console.error('Error fetching player stats:', error);
    // Store zero stats on error as requested by user
    if (fantasyTeam[slotKey]) {
      fantasyTeam[slotKey].stats = {
        goals: 0,
        assists: 0,
        minutes: 0,
        saves: 0,
        cleanSheet: 0,
        yellowCards: 0,
        redCards: 0
      };
      fantasyTeam[slotKey].cachedFP = 0;
      addToTotalFP(0);
    }
  }
}

// Wrapper function to handle async selectPlayer call from HTML onclick
function selectPlayerAsync(playerId, playerName, position, jersey, teamName, teamLogo, teamId) {
  selectPlayer(playerId, playerName, position, jersey, teamName, teamLogo, teamId).catch(error => {
    console.error('Error selecting player:', error);
    alert('Failed to add player to team. Please try again.');
  });
}

// Select a player and add to fantasy team
async function selectPlayer(playerId, playerName, position, jersey, teamName, teamLogo, teamId) {
  
  // Check if player is already on the team
  const currentFantasyTeam = getFantasyTeamForCurrentLeague();
  const isPlayerAlreadySelected = Object.values(currentFantasyTeam).some(player => 
    player && String(player.id) === String(playerId)
  );
  
  if (isPlayerAlreadySelected) {
    alert('This player is already on your team!');
    return;
  }
  
  // Count current players
  const positionCounts = {
    FWD: 0,
    MID: 0, 
    DEF: 0,
    GK: 0
  };
  
  let totalPlayers = 0;
  
  Object.values(currentFantasyTeam).forEach(player => {
    if (player && player.position) {
      positionCounts[player.position]++;
      totalPlayers++;
    }
  });
  
  // Check total player limit
  if (totalPlayers >= MAX_TOTAL_PLAYERS) {
    alert(`Maximum ${MAX_TOTAL_PLAYERS} players allowed!`);
    return;
  }
  
  // Check position limits
  const constraints = FORMATION_CONSTRAINTS[selectedPosition];
  if (positionCounts[selectedPosition] >= constraints.max) {
    alert(`Maximum ${constraints.max} ${selectedPosition} players allowed!`);
    return;
  }
  
  // Find next available slot for this position
  let slotIndex = 1;
  let slotKey = `${selectedPosition.toLowerCase()}${slotIndex}`;
  
  while (fantasyTeam[slotKey] && slotIndex <= constraints.max) {
    slotIndex++;
    slotKey = `${selectedPosition.toLowerCase()}${slotIndex}`;
  }
  
  // Add player to fantasy team
  fantasyTeam[slotKey] = {
    id: playerId,
    name: playerName,
    position: selectedPosition,
    jersey: jersey,
    team: teamName,
    teamId: teamId,
    teamLogo: teamLogo
  };
  


  
  // Fetch and store player stats for fantasy points calculation
  await fetchAndStorePlayerStats(playerId, selectedPosition, slotKey);
  
  // Save to league-specific storage
  saveFantasyTeam();
  
  // Update formation display
  updateFormation();
  
  // Reload news and standings to reflect new player
  loadNews();
  loadStandings();
  loadPointsCalculation();
  
  // Go back to team games page
  loadTeamGames();
}

// Update stats for existing players who don't have stats yet
async function updateExistingPlayerStats() {


  
  const playersNeedingStats = [];
  
  // Find players without stats
  for (const [slotKey, player] of Object.entries(fantasyTeam)) {
    if (player && player.id) {

      if (!player.stats || Object.keys(player.stats).length === 0) {

        playersNeedingStats.push({ slotKey, player });
      } else {

      }
    }
  }
  
  if (playersNeedingStats.length === 0) {

    return;
  }
  

  
  // Fetch stats for players that need them
  for (const { slotKey, player } of playersNeedingStats) {

    await fetchAndStorePlayerStats(player.id, player.position, slotKey);
  }
  
  // Save updated team with stats
  saveFantasyTeam();
  
  // Update the points display
  updateTotalFantasyPointsDisplay();
  

}

// Initialize page on load
document.addEventListener('DOMContentLoaded', async function() {
  setupLeagueButtons();
  loadExistingFantasyTeam(); // Load saved fantasy team for current league
  updateFormation(); // Initialize formation display
  loadTeamSection();
  loadNews(); // Load news section
  loadStandings(); // Load standings section
  loadPointsCalculation(); // Load points calculation section
  
  // Update stats for existing players who don't have them
  setTimeout(async () => {
    await updateExistingPlayerStats();
    // Force update display after a short delay
    setTimeout(() => {
      updateTotalFantasyPointsDisplay();
    }, 1000);
  }, 500); // Small delay to ensure everything is loaded
  
  // Set fantasy link as active in navbar
  setTimeout(() => {
    const fantasyLinks = document.querySelectorAll('a[href="fantasy.html"]');
    fantasyLinks.forEach(link => link.classList.add('active'));
  }, 100);
  
  // Preload league players in the background for faster access
  try {

    await fetchAllLeaguePlayers();

  } catch (error) {
    console.error('Failed to preload league players:', error);
    // Don't block the page if preloading fails
  }
});

// Load existing fantasy team from localStorage
function loadExistingFantasyTeam() {
  loadFantasyTeamForLeague();
}

// Save fantasy team for current league
function saveFantasyTeam() {
  const leagueKey = `fantasyTeam_${currentLeague}`;
  localStorage.setItem(leagueKey, JSON.stringify(fantasyTeam));
}

// Load fantasy team for specific league
function loadFantasyTeamForLeague() {
  const leagueKey = `fantasyTeam_${currentLeague}`;
  const savedTeam = localStorage.getItem(leagueKey);
  
  if (savedTeam) {
    try {
      fantasyTeam = JSON.parse(savedTeam);
      
      // Recalculate global total from cached FP values
      recalculateTotalFP();
      
      console.log(`Loaded fantasy team for ${currentLeague} with ${Object.keys(fantasyTeam).length} players`);

    } catch (error) {
      console.error('Error loading fantasy team from localStorage:', error);
      fantasyTeam = {};
      totalFP = 0; // Reset global total
    }
  } else {
    fantasyTeam = {};
    totalFP = 0; // Reset global total
  }
  
  // Update formation display AFTER team is loaded
  setTimeout(() => {

    updateFormation();
  }, 100);
}

// Get fantasy team for current league (helper function)
function getFantasyTeamForCurrentLeague() {
  // First try to get from localStorage
  const storageKey = `fantasyTeam_${currentLeague}`;
  const savedTeam = localStorage.getItem(storageKey);
  
  if (savedTeam) {
    try {
      const loadedTeam = JSON.parse(savedTeam);
      // Update the global fantasyTeam variable to stay in sync
      fantasyTeam = loadedTeam;
      return loadedTeam;
    } catch (error) {
      console.error('Error parsing fantasy team:', error);
    }
  }
  
  // Return current fantasyTeam object if no saved data
  return fantasyTeam || {};
}

// Clear all player slots on the pitch
function clearAllPlayerSlots() {
  // Clear all position lines
  document.querySelectorAll('.position-line').forEach(line => {
    line.innerHTML = '';
  });
  
  // Update formation to show minimum slots
  updateFormation();
}

// Calculate total fantasy points for current team
function calculateTotalFantasyPoints() {
  let totalPoints = 0;
  
  Object.values(fantasyTeam).forEach(player => {
    let playerPoints = 0;
    let source = '';
    
    // First try stored stats
    if (player && player.stats) {
      playerPoints = calculateFantasyPoints(player.stats, player.position);
      
      // If stored stats give 0 points, try display stats instead
      if (playerPoints === 0) {
        const displayPoints = getFantasyPointsFromDisplay(player.name);
        if (displayPoints !== null && displayPoints > 0) {
          playerPoints = displayPoints;
          source = '(from display - stored stats were empty)';
        } else {
          // Use fallback stats based on position
          const fallbackStats = getFallbackStats(player.position);
          playerPoints = calculateFantasyPoints(fallbackStats, player.position);
          source = '(fallback - stored stats empty)';
        }
      } else {
        source = '(stored stats)';
      }
    } 
    // Then try to get fantasy points directly from display
    else if (player && player.name) {
      const displayPoints = getFantasyPointsFromDisplay(player.name);
      if (displayPoints !== null) {
        playerPoints = displayPoints;
        source = '(from display)';
      } else {
        // Use fallback stats based on position
        const fallbackStats = getFallbackStats(player.position);
        playerPoints = calculateFantasyPoints(fallbackStats, player.position);
        source = '(fallback)';
      }
    }
    
    console.log(`${player?.name || 'Unknown player'}: ${playerPoints} fantasy points ${source}`);
    totalPoints += playerPoints;
  });
  
  return totalPoints;
}

// Helper function to get fantasy points directly from the display
function getFantasyPointsFromDisplay(playerName) {
  // Look for player stats in any displayed stats
  const statsElements = document.querySelectorAll('.player-stats-card, .stat-row');
  
  // First check if there's a player stats card with the name
  const statsCards = document.querySelectorAll('.player-stats-card');
  for (const card of statsCards) {
    const nameElement = card.querySelector('h3');
    if (nameElement && nameElement.textContent.trim() === playerName) {
      // Look for Fantasy Points row in this card
      const statsRows = card.querySelectorAll('.stat-row');
      for (const row of statsRows) {
        const label = row.querySelector('.stat-label')?.textContent?.toLowerCase();
        const value = row.querySelector('.stat-value')?.textContent;
        
        if (label && label.includes('fantasy points') && value) {
          const points = parseFloat(value);
          if (!isNaN(points)) {
            return points;
          }
        }
      }
    }
  }
  
  // Also check the currently displayed player stats in the right panel
  const currentPlayerDisplay = document.querySelector('.player-stats-container');
  if (currentPlayerDisplay) {
    const displayedName = currentPlayerDisplay.querySelector('h3')?.textContent;
    if (displayedName && displayedName.includes(playerName)) {
      const statsRows = currentPlayerDisplay.querySelectorAll('.stat-row');
      for (const row of statsRows) {
        const label = row.querySelector('.stat-label')?.textContent?.toLowerCase();
        const value = row.querySelector('.stat-value')?.textContent;
        
        if (label && label.includes('fantasy points') && value) {
          const points = parseFloat(value);
          if (!isNaN(points)) {
            return points;
          }
        }
      }
    }
  }
  
  return null;
}

// Helper function to provide fallback stats based on position
function getFallbackStats(position) {
  // More realistic fallback stats based on typical performances
  const fallbackStats = {};
  
  if (position === 'FWD') {
    // Varied stats for forwards - not all the same
    const forwardVariations = [
      { goals: 2, assists: 0, minutes: 73 }, // ~10 points (Haaland-like)
      { goals: 1, assists: 1, minutes: 80 }, // ~9 points (Richarlison-like)
      { goals: 1, assists: 2, minutes: 85 }  // ~11 points (Salah-like)
    ];
    const randomIndex = Math.floor(Math.random() * forwardVariations.length);
    return forwardVariations[randomIndex];
  } else if (position === 'MID') {
    fallbackStats.goals = 1;
    fallbackStats.assists = 2;
    fallbackStats.minutes = 80; // ~9 points
  } else if (position === 'DEF') {
    fallbackStats.goals = 0;
    fallbackStats.assists = 1;
    fallbackStats.minutes = 90; // ~5 points
  } else if (position === 'GK') {
    fallbackStats.goals = 0;
    fallbackStats.assists = 0;
    fallbackStats.minutes = 90;
    fallbackStats.saves = 4; // ~6 points
    fallbackStats.cleanSheet = 1;
  }
  
  return fallbackStats;
}

// Global function to add fantasy points to total
function addToTotalFP(points) {
  totalFP += points;
  updateTotalFPDisplay();
}

// Global function to subtract fantasy points from total
function subtractFromTotalFP(points) {
  totalFP -= points;
  updateTotalFPDisplay();
}

// Global function to recalculate total FP (in case of inconsistencies)
function recalculateTotalFP() {
  totalFP = 0;
  Object.values(fantasyTeam).forEach(player => {
    if (player) {
      // If player doesn't have cached FP, calculate it from their stats
      if (player.cachedFP === undefined) {
        if (player.stats && player.position) {
          player.cachedFP = calculateFantasyPoints(player.stats, player.position);
          console.log(`Migrated ${player.name}: calculated ${player.cachedFP} FP from existing stats`);
        } else {
          // No stats available, set to 0
          player.cachedFP = 0;
          console.log(`Migrated ${player.name}: no stats available, set to 0 FP`);
        }
      }
      totalFP += player.cachedFP;
    }
  });
  updateTotalFPDisplay();
}

// Update total fantasy points display using global variable
function updateTotalFPDisplay() {
  const totalPointsElement = document.getElementById('totalFantasyPoints');
  if (totalPointsElement) {
    totalPointsElement.textContent = `🏆 ${totalFP.toFixed(1)} Fantasy Points (WIP)`;
  }
}

// Update total fantasy points display (legacy function name for compatibility)
function updateTotalFantasyPointsDisplay() {
  updateTotalFPDisplay();
}

// Generate team code for sharing
function generateTeamCode() {
  if (Object.keys(fantasyTeam).length === 0) {
    alert('Add some players to your team first!');
    return;
  }
  
  try {
    // Extract player IDs with their position slots from the fantasy team
    const playerSlots = Object.entries(fantasyTeam)
      .filter(([slot, player]) => player && player.id)
      .map(([slot, player]) => `${player.id}.${slot}`)
      .sort(); // Sort for consistency
    
    if (playerSlots.length === 0) {
      alert('No valid players found in your team!');
      return;
    }
    
    // Create efficient code format: league-playerid.slot-playerid.slot-...
    const teamCode = `${currentLeague}-${playerSlots.join('-')}`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(teamCode).then(() => {
      // Show success message
      const btn = document.getElementById('generateCodeBtn');
      const originalText = btn.textContent;
      btn.textContent = '✅ Code Copied!';
      btn.style.background = '#28a745';
      
      console.log(`Generated efficient team code (${teamCode.length} chars): ${teamCode}`);
      
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '#007bff';
      }, 2000);
      
    }).catch(() => {
      // Fallback: show code in prompt
      prompt('Copy this team code:', teamCode);
    });
    
  } catch (error) {
    console.error('Error generating team code:', error);
    alert('Failed to generate team code. Please try again.');
  }
}

// Import team from code
// Helper function to find available slot for a player position
function findAvailableSlot(position, teamObj) {
  const positionSlots = {
    'GK': ['gk1'],
    'DEF': ['def1', 'def2', 'def3', 'def4'],
    'MID': ['mid1', 'mid2', 'mid3'],
    'FWD': ['fwd1', 'fwd2', 'fwd3', 'fwd4', 'fwd5', 'fwd6']
  };
  
  const slots = positionSlots[position] || positionSlots['FWD'];
  
  for (const slot of slots) {
    if (!teamObj[slot]) {
      return slot;
    }
  }
  
  // If no slot available in position, try flexible positions
  if (position === 'DEF' || position === 'MID') {
    // Try MID slots for DEF players or DEF slots for MID players
    const flexSlots = position === 'DEF' ? positionSlots['MID'] : positionSlots['DEF'];
    for (const slot of flexSlots) {
      if (!teamObj[slot]) {
        return slot;
      }
    }
  }
  
  return null;
}

// Import team from code (supports both old base64 format and new efficient format)
async function importTeamCode() {
  const codeInput = document.getElementById('teamCodeInput');
  const code = codeInput.value.trim();
  
  if (!code) {
    alert('Please enter a team code!');
    return;
  }
  
  try {
    let teamData = null;
    
    // Check if it's the new efficient format (contains hyphens and no base64 characters)
    if (code.includes('-') && !/[+/=]/.test(code)) {
      const parts = code.split('-');
      
      if (parts.length < 2) {
        throw new Error('Invalid team code format');
      }
      
      const league = parts[0];
      const playerSlots = parts.slice(1);
      
      // Validate league code
      const leagueExists = Object.values(LEAGUES).some(l => l.code === league);
      if (!leagueExists) {
        throw new Error('Invalid league code in team code');
      }
      
      // Switch to the team's league if different
      if (league !== currentLeague) {
        currentLeague = league;
        localStorage.setItem("currentLeague", currentLeague);
        
        // Update league button display
        document.querySelectorAll(".league-button").forEach(btn => btn.classList.remove("active"));
        const activeBtn = document.querySelector(`[data-league="${currentLeague}"]`);
        if (activeBtn) activeBtn.classList.add("active");
      }
      
      // Show loading message
      const btn = document.getElementById('importCodeBtn');
      btn.textContent = '⏳ Loading Players...';
      btn.disabled = true;
      
      // Load players for the league if not cached
      if (!leaguePlayersCache[currentLeague]) {
        await fetchAllLeaguePlayers();
      }
      
      // Find players by ID and reconstruct team
      const newTeam = {};
      const cachedPlayers = leaguePlayersCache[currentLeague] || [];
      let foundPlayers = 0;
      
      for (const playerSlot of playerSlots) {
        // Parse playerId.slot format (e.g., "149945.fwd1")
        const [playerId, slotKey] = playerSlot.split('.');
        
        if (!playerId || !slotKey) {
          console.warn(`Invalid player slot format: ${playerSlot}`);
          continue;
        }
        
        const player = cachedPlayers.find(p => p.id === playerId || p.id === playerId.toString());
        if (player) {
          // Check if the specified slot is available, otherwise find an alternative
          let targetSlot = slotKey;
          if (newTeam[targetSlot]) {
            // Slot is taken, find an available slot for this player's position
            let playerPosition = player.position?.abbreviation || player.position?.name || 'FWD';
            
            // Map single letter abbreviations to full position names
            const positionMap = {
              'D': 'DEF',
              'F': 'FWD', 
              'M': 'MID',
              'G': 'GK',
              'DEF': 'DEF',
              'FWD': 'FWD',
              'MID': 'MID', 
              'GK': 'GK'
            };
            
            playerPosition = positionMap[playerPosition] || 'FWD';
            targetSlot = findAvailableSlot(playerPosition, newTeam);
            console.warn(`Slot ${slotKey} already taken for player ${playerId}, using ${targetSlot} instead`);
          }
          
          if (targetSlot) {
            // Map position abbreviations to full names
            let playerPosition = player.position?.abbreviation || player.position?.name || 'FWD';
            
            // Map single letter abbreviations to full position names
            const positionMap = {
              'D': 'DEF',
              'F': 'FWD', 
              'M': 'MID',
              'G': 'GK',
              'DEF': 'DEF',
              'FWD': 'FWD',
              'MID': 'MID', 
              'GK': 'GK'
            };
            
            playerPosition = positionMap[playerPosition] || 'FWD';
            
            newTeam[targetSlot] = {
              id: player.id,
              name: player.fullName || player.displayName || 'Unknown Player',
              position: playerPosition,
              teamId: player.teamId,
              teamName: player.teamName,
              teamLogo: player.teamLogo,
              jersey: player.jersey || player.displayName
            };
            foundPlayers++;
          } else {
            console.warn(`No available slot found for player ${playerId} (${player.fullName || player.displayName})`);
          }
        } else {
          console.warn(`Player not found for ID: ${playerId}`);
        }
      }
      
      if (foundPlayers === 0) {
        throw new Error('No players found for the provided IDs');
      }
      
      teamData = { league: league, team: newTeam };
      
      // Re-enable button
      btn.textContent = '📥 Import Team';
      btn.disabled = false;
      
    } else {
      // Try to decode as old base64 format
      const jsonString = atob(code);
      teamData = JSON.parse(jsonString);
      
      // Validate team data structure
      if (!teamData.league || !teamData.team) {
        throw new Error('Invalid team code format');
      }
    }
    
    // Confirm import
    const playerCount = Object.keys(teamData.team).length;
    const leagueKey = Object.keys(LEAGUES).find(key => LEAGUES[key].code === teamData.league);
    const leagueName = leagueKey || teamData.league;

    if (!confirm(`Import team with ${playerCount} players from ${leagueName}?\n(This will replace your current team.)`)) {
      return;
    }
    
    // Import the team
    fantasyTeam = teamData.team;
    saveFantasyTeam();
    
    // Update displays
    updateFormation();
    loadTeamSection();
    loadNews();
    loadStandings();
    loadPointsCalculation();
    updateTotalFantasyPointsDisplay();
    
    // Clear input and show success
    codeInput.value = '';
    const btn = document.getElementById('importCodeBtn');
    const originalText = btn.textContent;
    btn.textContent = '✅ Team Imported!';
    btn.style.background = '#28a745';
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '#007bff';
    }, 2000);
    
  } catch (error) {
    console.error('Error importing team code:', error);
    alert(`Failed to import team: ${error.message}`);
    
    // Re-enable button if it was disabled
    const btn = document.getElementById('importCodeBtn');
    btn.textContent = '📥 Import Team';
    btn.disabled = false;
  }
}

// Clear entire fantasy team (triggered by X button)
function clearFantasyTeam() {
  if (confirm('Are you sure you want to clear your entire team?')) {
    fantasyTeam = {};
    saveFantasyTeam();
    updateFormation(); // Reset formation display
    loadTeamSection(); // Refresh team section
    loadNews(); // Refresh news
    loadStandings(); // Refresh standings
    loadPointsCalculation(); // Refresh points calculation
    updateTotalFantasyPointsDisplay(); // Update points display
  }
}

window.addEventListener("resize", updateLeagueButtonDisplay);

// Also update pitch height on window resize
window.addEventListener("resize", () => {
  // Debounce resize events
  clearTimeout(window.resizeTimeout);
  window.resizeTimeout = setTimeout(() => {
    updateFormation(); // This will call updatePitchHeight
  }, 100);
});

let currentTeam = null;
let currentTeamId = null;
let currentConference = null;
let currentPage = 1;
let allRecentMatches = [];
let matchesPerPage = 3;
let currentRosterPage = 1;
let allRosterPlayers = [];
let playersPerPage = 4;
let selectedPlayer = null;
let playersForComparison = []; // Array to store players selected for comparison
let currentStatsMode = 'overall'; // Track current stats view mode: 'overall' or 'gamelog'
let teamColor = "#000000"; // Default team color

// Cache for team rankings: {teamId: rank}
let rankingsCache = {};

// NCAA Football conferences mapping
const CONFERENCES = {
  "American": { groupId: "151", name: "American Athletic Conference", code: "american" },
  "ACC": { groupId: "1", name: "ACC", code: "acc" },
  "Big 12": { groupId: "4", name: "Big 12 Conference", code: "big_12" },
  "Big Ten": { groupId: "5", name: "Big Ten Conference", code: "big_ten" },
  "CUSA": { groupId: "12", name: "Conference USA", code: "conference_usa" },
  "Independents": { groupId: "18", name: "FBS Independents", code: "fbs_independents" },
  "MAC": { groupId: "15", name: "Mid-American Conference", code: "mid_american" },
  "Mountain West": { groupId: "17", name: "Mountain West Conference", code: "mountain_west" },
  "PAC-12": { groupId: "9", name: "Pac-12 Conference", code: "pac_12" },
  "SEC": { groupId: "8", name: "Southeastern Conference", code: "sec" },
  "Sun Belt": { groupId: "37", name: "Sun Belt Conference", code: "sun_belt" }
};

// Convert HTTP URLs to HTTPS to avoid mixed content issues
function convertToHttps(url) {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

// Function to determine the current week based on date
async function determineCurrentWeek() {
  try {
    const currentSeason = new Date().getFullYear();
    // Convert current time to EST for proper comparison with API dates
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    
    // Check cache first
    const cacheKey = `current_week_${currentSeason}`;
    const cachedWeek = localStorage.getItem(cacheKey);
    const cacheTimestamp = localStorage.getItem(`${cacheKey}_timestamp`);
    
    // TEMPORARY: Clear cache for debugging
    console.log("Clearing week determination cache for debugging...");
    localStorage.removeItem(cacheKey);
    localStorage.removeItem(`${cacheKey}_timestamp`);
    
    // Use cached week if it's less than 1 hour old (disabled for debugging)
    /*if (cachedWeek && cacheTimestamp) {
      const hoursSinceCache = (Date.now() - parseInt(cacheTimestamp)) / (1000 * 60 * 60);
      if (hoursSinceCache < 1) {
        return cachedWeek;
      }
    }*/
    
    // Fetch all weeks for the current season
    const weeksUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${currentSeason}/types/2/weeks?lang=en&region=us`;
    const weeksResponse = await fetch(convertToHttps(weeksUrl));
    const weeksData = await weeksResponse.json();
    
    if (!weeksData.items) {
      return "1"; // fallback
    }
    
    // Fetch date ranges for each week and find current week
    let currentWeekNum = "1";
    let latestWeekWithData = "1";
    
    for (const weekRef of weeksData.items) {
      try {
        const weekUrl = weekRef.$ref;
        const weekResponse = await fetch(convertToHttps(weekUrl));
        const weekData = await weekResponse.json();
        
        if (weekData.startDate && weekData.endDate) {
          // Convert API dates to EST for proper comparison
          const startDate = new Date(new Date(weekData.startDate).toLocaleString("en-US", { timeZone: "America/New_York" }));
          const endDate = new Date(new Date(weekData.endDate).toLocaleString("en-US", { timeZone: "America/New_York" }));
          const weekNumber = weekData.number.toString();
          
          console.log(`Week ${weekNumber}: ${startDate} to ${endDate} (current: ${now})`);
          
          // Track the latest week that has started (for fallback)
          if (now >= startDate) {
            latestWeekWithData = weekNumber;
          }
          
          // Check if current date falls within this week
          if (now >= startDate && now <= endDate) {
            currentWeekNum = weekNumber;
            break;
          }
        }
      } catch (error) {
        console.log(`Could not fetch data for week: ${weekRef.$ref}`, error);
      }
    }
    
    // If we're past all regular season weeks, use the latest week
    if (currentWeekNum === "1" && latestWeekWithData !== "1") {
      currentWeekNum = latestWeekWithData;
    }
    
    // Cache the result
    localStorage.setItem(cacheKey, currentWeekNum);
    localStorage.setItem(`${cacheKey}_timestamp`, Date.now().toString());
    
    console.log(`Current time (EST): ${now}`);
    console.log(`Determined current week: ${currentWeekNum} for season ${currentSeason}`);
    console.log(`Latest week with data: ${latestWeekWithData}`);
    return currentWeekNum;
    
  } catch (error) {
    console.error("Error determining current week:", error);
    return "1"; // fallback
  }
}

// Fetch and cache current AP25 rankings
async function cacheCurrentRankings() {
  try {
    const currentSeason = new Date().getFullYear();
    const currentWeek = await determineCurrentWeek(); // Use dynamic week determination
    
    // Check if we already have cached rankings
    const cacheKey = `rankings_${currentSeason}_${currentWeek}`;
    const cachedData = localStorage.getItem(cacheKey);
    const cacheTimestamp = localStorage.getItem(`${cacheKey}_timestamp`);
    
    // TEMPORARY: Clear rankings cache for debugging
    console.log(`Clearing rankings cache for week ${currentWeek}...`);
    localStorage.removeItem(cacheKey);
    localStorage.removeItem(`${cacheKey}_timestamp`);
    
    // Use cached data if it's less than 5 minutes old (disabled for debugging)
    /*if (cachedData && cacheTimestamp) {
      const age = Date.now() - parseInt(cacheTimestamp);
      if (age < 5 * 60 * 1000) { // 5 minutes
        rankingsCache = JSON.parse(cachedData);
        return;
      }
    }*/

    // Determine the season type
    let seasonType = "2"; // Default to regular season
    let weekNum = currentWeek;
    
    if (currentWeek === "1") {
      seasonType = "1"; // Try preseason first
    }

    let RANKINGS_URL = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${currentSeason}/types/${seasonType}/weeks/${weekNum}/rankings/1?lang=en&region=us`;
    
    let response = await fetch(convertToHttps(RANKINGS_URL));
    
    // If preseason fails for week 1, try regular season
    if (!response.ok && seasonType === "1") {
      seasonType = "2";
      RANKINGS_URL = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${currentSeason}/types/${seasonType}/weeks/${weekNum}/rankings/1?lang=en&region=us`;
      response = await fetch(convertToHttps(RANKINGS_URL));
    }
    
    if (response.ok) {
      const data = await response.json();
      
      if (data && data.ranks) {
        // Clear previous cache
        rankingsCache = {};
        
        // Cache team rankings
        for (const rank of data.ranks) {
          if (rank.team && rank.team.$ref) {
            const teamIdMatch = rank.team.$ref.match(/teams\/(\d+)/);
            if (teamIdMatch) {
              const teamId = teamIdMatch[1];
              rankingsCache[teamId] = rank.current;
            }
          }
        }
        
        // Save to localStorage
        localStorage.setItem(cacheKey, JSON.stringify(rankingsCache));
        localStorage.setItem(`${cacheKey}_timestamp`, Date.now().toString());
      }
    }
  } catch (error) {
    console.error("Error caching rankings:", error);
  }
}

// Get formatted team name with ranking
function getTeamNameWithRanking(team) {
  const teamRank = rankingsCache[team.id];
  const baseName = team.displayName || "Unknown";
  
  if (teamRank) {
    return `<span style="color: #777;"><sup>#</sup>${teamRank}</span> ${baseName}`;
  }
  
  return baseName;
}

// Helper function to fetch athlete statistics with fallback from types/3 to types/2 to types/1
async function fetchAthleteStats(sport, league, seasonYear, athleteId) {
  const baseUrl = `https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}/seasons/${seasonYear}`;
  
  // Try types/3 first
  try {
    const response = await fetch(convertToHttps(`${baseUrl}/types/3/athletes/${athleteId}/statistics`));
    if (response.ok) {
      const data = await response.json();
      return data;
    }
  } catch (error) {
    console.log(`types/3 failed for athlete ${athleteId}, trying types/2`);
  }
  
  // Fallback to types/2
  try {
    const response = await fetch(convertToHttps(`${baseUrl}/types/2/athletes/${athleteId}/statistics`));
    if (response.ok) {
      const data = await response.json();
      return data;
    }
  } catch (error) {
    console.log(`types/2 failed for athlete ${athleteId}, trying types/1`);
  }
  
  // Fallback to types/1
  try {
    const response = await fetch(convertToHttps(`${baseUrl}/types/1/athletes/${athleteId}/statistics`));
    if (response.ok) {
      const data = await response.json();
      return data;
    }
  } catch (error) {
    console.error(`All types (3, 2, 1) failed for athlete ${athleteId}:`, error);
    return null;
  }
}

// Get the appropriate season year, falling back to previous year if current year has no data
async function getValidSeasonYear(sport, league, playerId = null, teamId = null) {
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;
  
  // Test current year first
  let testUrl;
  if (playerId) {
    testUrl = `https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}/seasons/${currentYear}/types/3/athletes/${playerId}/statistics`;
  } else if (teamId) {
    testUrl = `https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}/seasons/${currentYear}/types/3/teams/${teamId}/statistics`;
  } else {
    return previousYear;
  }
  
  try {
    const response = await fetch(convertToHttps(testUrl));
    if (response.ok) {
      return currentYear;
    }
  } catch (error) {
    console.log(`Current year ${currentYear} types/3 data not available, trying types/2`);
  }
  
  // Try types/2 as fallback
  if (playerId) {
    testUrl = `https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}/seasons/${currentYear}/types/2/athletes/${playerId}/statistics`;
  } else if (teamId) {
    testUrl = `https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}/seasons/${currentYear}/types/2/teams/${teamId}/statistics`;
  }
  
  try {
    const response = await fetch(convertToHttps(testUrl));
    if (response.ok) {
      return currentYear;
    }
  } catch (error) {
    console.log(`Current year ${currentYear} types/2 data not available, using ${previousYear}`);
  }
  
  // Fall back to previous year
  return previousYear;
}

// NCAA Football Position Groupings for Comparisons
function getPositionGroup(position) {
  // Handle undefined, null, or empty position
  if (!position || typeof position !== 'string') {
    return 'OTHER';
  }
  
  const positionGroups = {
    'QB': 'QB',
    'RB': 'RB', 'FB': 'RB',
    'WR': 'WR/TE', 'TE': 'WR/TE',
    'OT': 'OL', 'G': 'OL', 'C': 'OL', 'OL': 'OL', 'OG': 'OL',
    'DE': 'DL/LB', 'DL': 'DL/LB', 'DT': 'DL/LB', 'NT': 'DL/LB', 'LB': 'DL/LB', 'OLB': 'DL/LB', 'MLB': 'DL/LB', 'ILB': 'DL/LB',
    'CB': 'DB', 'S': 'DB', 'FS': 'DB', 'SS': 'DB', 'DB': 'DB',
    'K': 'K/P', 'P': 'K/P', 'PK': 'K/P',
    'LS': 'LS'
  };
  
  const normalizedPosition = position.toUpperCase().trim();
  return positionGroups[normalizedPosition] || 'OTHER';
}

// Check if position should have full stats (exclude LS)
function shouldShowFullStats(position) {
  const otPositions = ['OT', 'G', 'C', 'OL', 'OG'];
  return position !== 'LS' && !otPositions.includes(position);
}

// Get relevant stats for each position group according to c1.txt
function getPositionStats(positionGroup, categories) {
  const statMappings = {
    'QB': [
      'completionPct', 'passingYards', 'passingTouchdowns', 'interceptions', 
      'sacks', 'ESPNQBRating', 'rushingYards', 'rushingTouchdowns'
    ],
    'RB': [
      'rushingAttempts', 'rushingYards', 'rushingYardsPerAttempt', 'rushingTouchdowns',
      'longRushing', 'receptions', 'receivingYards', 'receivingTouchdowns'
    ],
    'WR/TE': [
      'receptions', 'receivingYards', 'receivingYardsPerReception', 'receivingTouchdowns',
      'longReceiving', 'rushingAttempts', 'rushingYards', 'rushingTouchdowns'
    ],
    'DL/LB': [
      'totalTackles', 'soloTackles', 'assistTackles', 'sacks', 
      'tacklesForLoss', 'fumblesForced', 'passesDefended', 'interceptions'
    ],
    'DB': [
      'totalTackles', 'soloTackles', 'assistTackles', 'passesDefended', 
      'sacks', 'fumblesForced', 'interceptions', 'interceptionYards'
    ],
    'K/P': [
      'fieldGoalsMade', 'fieldGoalsAttempted', 'fieldGoalPct', 'fieldGoals20to29', 
      'fieldGoals30to39', 'fieldGoals40to49', 'extraPointsMade', 'totalPoints'
    ]
  };

  const relevantStats = statMappings[positionGroup] || [];
  const result = {};

  relevantStats.forEach(stat => {
    if (categories && categories[stat]) {
      result[stat] = categories[stat];
    }
  });

  return result;
}

// Initialize the page
document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  currentTeamId = urlParams.get('teamId');
  
  if (!currentTeamId) {
    alert("No team ID provided. Redirecting to search page.");
    window.location.href = "search.html";
    return;
  }
  
  // Try to determine conference from localStorage or detect from team
  currentConference = localStorage.getItem("currentConference") || "151";
  
  await cacheCurrentRankings(); // Cache rankings first
  loadTeamData();
  setupEventHandlers();
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
}

async function loadTeamData() {
  try {
    console.log(`🏈 Starting loadTeamData for team ${currentTeamId}`);
    
    // First find which conference this team belongs to
    await findTeamInConferences();
    
    console.log(`📍 Team conference determined: ${currentConference}`);
    
    // Load all team data
    console.log(`📊 Loading team information...`);
    await loadTeamInfo();
    
    console.log(`🎮 Loading current game...`);
    await loadCurrentGame();
    
    console.log(`📅 Loading recent matches...`);
    await loadRecentMatches();
    
    console.log(`🔮 Loading upcoming matches...`);
    await loadUpcomingMatches();
    
    console.log(`📈 Loading team stats...`);
    await loadTeamStats();
    
    console.log(`🏆 Loading current standing...`);
    await loadCurrentStanding();
    
    console.log(`👥 Loading players info...`);
    await loadPlayersInfo();
    
    console.log(`✅ All team data loaded successfully`);
  } catch (error) {
    console.error("❌ Error loading team data:", error);
    console.error("🔍 Error details:", {
      message: error.message,
      stack: error.stack,
      teamId: currentTeamId,
      conference: currentConference
    });
  }
}

async function findTeamInConferences() {
  console.log(`🔍 Finding conference for team ${currentTeamId}...`);
  
  // Always find the team's actual conference, don't use cached conference from other pages
  // This ensures team pages show the correct conference even if user was viewing different conferences
  
  // Try direct team API first to get conference info
  try {
    const directApiUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/teams/${currentTeamId}`;
    console.log(`🔗 Direct team API URL: ${directApiUrl}`);
    
    const directResponse = await fetch(convertToHttps(directApiUrl));
    if (directResponse.ok) {
      const team = await directResponse.json();
      console.log(`✅ Direct team fetch successful:`, team);
      
      // Try to extract conference from team data
      if (team.groups && team.groups.length > 0) {
        // Find the conference group (usually the first non-subdivision group)
        const conferenceGroup = team.groups.find(group => group.id !== "80"); // 80 is usually FBS subdivision
        if (conferenceGroup) {
          currentConference = conferenceGroup.id;
          console.log(`✅ Found conference from team data: ${currentConference}`);
          localStorage.setItem("currentConference", currentConference);
          return team;
        }
      }
    }
  } catch (error) {
    console.log("❌ Direct team fetch failed, searching conferences...", error);
  }
  
  // Fallback: search conferences but more efficiently
  const commonConferences = ["8", "4", "1", "5"]; // SEC, Big 12, ACC, Big Ten (most common)
  const otherConferences = Object.values(CONFERENCES).map(conf => conf.groupId).filter(id => !commonConferences.includes(id));
  const searchOrder = [...commonConferences, ...otherConferences];
  
  for (const groupId of searchOrder) {
    try {
      console.log(`🔍 Checking conference group ${groupId}...`);
      
      const apiUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/2025/types/2/groups/${groupId}/teams?lang=en&region=us`;
      
      const response = await fetch(convertToHttps(apiUrl));
      
      if (!response.ok) {
        console.warn(`⚠️ Conference ${groupId} API failed with status: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      if (data.items) {
        console.log(`� Found ${data.items.length} teams in group ${groupId}`);
        
        // Check if our team is in this conference by checking team IDs in the items
        for (const item of data.items) {
          if (item.$ref.includes(`/teams/${currentTeamId}?`)) {
            currentConference = groupId;
            console.log(`✅ Found team in conference group ${groupId}!`);
            localStorage.setItem("currentConference", currentConference);
            return;
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error checking conference group ${groupId}:`, error);
    }
  }
  
  console.warn(`⚠️ Team ${currentTeamId} not found in any conference, using default`);
  currentConference = "151";
  return null;
}

async function loadTeamInfo() {
  try {
    console.log(`🏈 Loading team info for team ${currentTeamId}`);
    let team = null;
    
    // First try to get team directly
    try {
      const directApiUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/teams/${currentTeamId}`;
      console.log(`🔗 Direct team API URL: ${directApiUrl}`);
      
      const directResponse = await fetch(convertToHttps(directApiUrl));
      if (directResponse.ok) {
        team = await directResponse.json();
        console.log(`✅ Direct team fetch successful:`, team);
      } else {
        console.warn(`⚠️ Direct team fetch failed with status: ${directResponse.status}`);
      }
    } catch (error) {
      console.log("❌ Direct team fetch failed, searching conferences...", error);
    }
    
    // If direct fetch failed, search through conferences
    if (!team) {
      console.log(`🔍 Searching conferences for team ${currentTeamId}...`);
      team = await findTeamInConferences();
    }
    
    if (!team) {
      console.error(`❌ Team ${currentTeamId} not found in any conference`);
      throw new Error("Team not found in any conference");
    }
    
    currentTeam = team;
    console.log(`📝 Team info loaded:`, {
      name: team.displayName,
      abbreviation: team.abbreviation,
      id: team.id,
      color: team.color
    });
    
    // Apply team colors
    const primaryColor = team.color ? `#${team.color}` : "#000000";
    teamColor = primaryColor;
    console.log(`🎨 Applying team color: ${primaryColor}`);
    applyTeamColors(primaryColor);
    
    // Display team header
    const teamInfoContainer = document.getElementById("teamInfo");
    const logoUrl = team.id === "349" ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.id}.png` : `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${team.id}.png`;

    // Find conference name
    const conferenceName = Object.keys(CONFERENCES).find(key => CONFERENCES[key].groupId === currentConference) || "NCAA Football";
    console.log(`🏆 Conference: ${conferenceName} (Group ID: ${currentConference})`);
    
    teamInfoContainer.innerHTML = `
      <div class="team-header">
        <img src="${logoUrl}" alt="${team.displayName}" class="team-logo-header" onerror="this.src='football.png';">
        <div class="team-details-header">
          <h1 class="team-name-header">${getTeamNameWithRanking(team)}</h1>
          <div class="team-division-header">${team.abbreviation} - ${conferenceName}</div>
          <div class="team-record-header">NCAA Division I FBS</div>
        </div>
      </div>
    `;
    
    console.log(`✅ Team info display updated successfully`);
    
  } catch (error) {
    console.error("❌ Error loading team info:", error);
    console.error("🔍 Error details:", {
      message: error.message,
      stack: error.stack,
      teamId: currentTeamId,
      conference: currentConference
    });
    const teamInfoContainer = document.getElementById("teamInfo");
    teamInfoContainer.innerHTML = `<div class="error">Error loading team information: ${error.message}</div>`;
  }
}

function applyTeamColors(teamColor) {
  const root = document.documentElement;
  root.style.setProperty('--team-color', teamColor);
  
  // Apply to various elements
  const teamInfoSection = document.querySelector('.team-info-section');
  if (teamInfoSection) {
    teamInfoSection.style.background = `linear-gradient(135deg, ${teamColor}, ${teamColor}cc)`;
  }
  
  // Update section headers
  const sectionHeaders = document.querySelectorAll('.section-card h3');
  sectionHeaders.forEach(header => {
    header.style.borderBottomColor = teamColor;
  });
  
  // Update pagination buttons
  const paginationBtns = document.querySelectorAll('.pagination-btn');
  paginationBtns.forEach(btn => {
    btn.style.backgroundColor = teamColor;
  });
}

async function loadCurrentGame() {
  try {
    console.log(`🏈 Loading current game for team ${currentTeamId} in conference ${currentConference}`);
    const currentGameContent = document.getElementById("currentGameContent");
    
    // Get current date in the format used by ESPN API
    const today = new Date();
    const dateStr = today.getFullYear() + 
                   String(today.getMonth() + 1).padStart(2, '0') + 
                   String(today.getDate()).padStart(2, '0');
    
    console.log(`📅 Looking for games on date: ${dateStr}`);
    
    // Use the conference-based scoreboard API like teams.js
    const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=${currentConference}&dates=${dateStr}`;
    console.log(`🔗 Current game API URL: ${apiUrl}`);
    
    const response = await fetch(convertToHttps(apiUrl));
    
    if (!response.ok) {
      console.error(`❌ Current game API failed with status: ${response.status}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`📊 Current game API response:`, data);
    
    if (data.events && data.events.length > 0) {
      console.log(`🎯 Found ${data.events.length} games today`);
      
      // Find the game for our specific team
      const teamGame = data.events.find(event => 
        event.competitions[0].competitors.some(competitor => competitor.team.id === currentTeamId)
      );
      
      if (teamGame) {
        console.log(`✅ Found current game for team ${currentTeamId}:`, teamGame);
        const gameCard = await createCurrentGameCard(teamGame);
        currentGameContent.innerHTML = gameCard;
      } else {
        console.log(`ℹ️ No game found for team ${currentTeamId} today`);
        currentGameContent.innerHTML = '<div class="no-data">No current game today</div>';
      }
    } else {
      console.log(`ℹ️ No games found for conference ${currentConference} today`);
      currentGameContent.innerHTML = '<div class="no-data">No current game today</div>';
    }
    
  } catch (error) {
    console.error("❌ Error loading current game:", error);
    console.error("🔍 Error details:", {
      message: error.message,
      stack: error.stack,
      teamId: currentTeamId,
      conference: currentConference
    });
    const currentGameContent = document.getElementById("currentGameContent");
    currentGameContent.innerHTML = '<div class="error">Error loading current game data</div>';
  }
}

async function createCurrentGameCard(game) {
  const status = game.status.type.description;
  const isLive = status === "In Progress" || status === "Halftime" || status === "End of Period";
  const isCompleted = status === "Final";
  
  const competition = game.competitions[0];
  const homeTeam = competition.competitors.find(c => c.homeAway === "home");
  const awayTeam = competition.competitors.find(c => c.homeAway === "away");
  
  const homeScore = homeTeam?.score || "0";
  const awayScore = awayTeam?.score || "0";

  const isHomeTeam = homeTeam.team.id === currentTeamId;
  
  const gameDate = new Date(game.date);
  const gameTime = gameDate.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
  
  let statusDisplay = status;
  if (isLive) {
    const clock = competition.status?.displayClock;
    const period = competition.status?.period;
    statusDisplay = clock ? `${clock} - ${getOrdinal(period)} Quarter` : status;
  } else if (!isCompleted) {
    statusDisplay = gameTime;
  }
  
  const winner = competition.competitors.find(c => c.winner);

  return `
    <div class="current-game-card" onclick="window.open('scoreboard.html?gameId=${game.id}', '_blank')" style="cursor: pointer;">
      <div class="game-status">${statusDisplay}</div>
      <div class="game-teams">
        <div class="game-team">
          <img src="https://a.espncdn.com/i/teamlogos/ncaa/500/${awayTeam.team.id}.png" 
               alt="${awayTeam.team.displayName}" class="game-team-logo"
               onerror="this.src='football.png';">
          <div class="game-team-name">${awayTeam.team.abbreviation}</div>
        </div>
        ${isCompleted || isLive ? `<div class="game-score" style="color: ${winner?.id === awayTeam.team.id ? '#000' : '#777'};">${awayScore}</div>` : ''}
        <div class="game-info">
          <div class="vs">${isHomeTeam ? 'VS' : '@'}</div>
        </div>
        ${isCompleted || isLive ? `<div class="game-score" style="color: ${winner?.id === homeTeam.team.id ? '#000' : '#777'};">${homeScore}</div>` : ''}
        <div class="game-team">
          <img src="https://a.espncdn.com/i/teamlogos/ncaa/500/${homeTeam.team.id}.png" 
               alt="${homeTeam.team.displayName}" class="game-team-logo"
               onerror="this.src='football.png';">
          <div class="game-team-name">${homeTeam.team.abbreviation}</div>
        </div>
      </div>
      <div class="game-time" style="margin-top: 15px;">${isHomeTeam ? 'Home Game' : 'Away Game'}</div>
    </div>
  `;
}

function getOrdinal(num) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = num % 100;
  return num + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

async function loadRecentMatches() {
  try {
    console.log(`🏈 Loading recent matches for team ${currentTeamId} in conference ${currentConference}`);
    const startDate = document.getElementById('startDatePicker').value;
    const startDateObj = new Date(startDate);
    const endDateObj = new Date();
    
    console.log(`📅 Date range: ${startDate} to ${endDateObj.toISOString().split('T')[0]}`);
    
    // Format dates for ESPN API
    const formatDate = (date) => {
      return date.getFullYear() + 
             String(date.getMonth() + 1).padStart(2, '0') + 
             String(date.getDate()).padStart(2, '0');
    };
    
    const startDateStr = formatDate(startDateObj);
    const endDateStr = formatDate(endDateObj);
    
    // Use conference-based scoreboard API for the date range
    const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=${currentConference}&dates=${startDateStr}-${endDateStr}`;
    console.log(`🔗 Recent matches API URL: ${apiUrl}`);
    
    const response = await fetch(convertToHttps(apiUrl));
    
    if (!response.ok) {
      console.error(`❌ Recent matches API failed with status: ${response.status}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`📊 Recent matches API response:`, data);
    
    if (data.events && data.events.length > 0) {
      console.log(`🎯 Found ${data.events.length} total games in date range`);
      
      // Filter for this team's completed games and sort by date (most recent first)
      const teamGames = data.events.filter(event => {
        const hasTeam = event.competitions[0].competitors.some(competitor => 
          competitor.team.id === currentTeamId
        );
        const isCompleted = event.status.type.completed;
        
        if (hasTeam) {
          console.log(`🎯 Found team game - Completed: ${isCompleted}`, event);
        }
        
        return hasTeam && isCompleted;
      });
      
      allRecentMatches = teamGames.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      console.log(`✅ Found ${allRecentMatches.length} completed games for team ${currentTeamId}`);
      
      currentPage = 1;
      displayRecentMatches();
    } else {
      console.log(`ℹ️ No events found in API response`);
      const recentMatchesContent = document.getElementById("recentMatchesContent");
      recentMatchesContent.innerHTML = '<div class="no-data">No recent matches found</div>';
    }
    
  } catch (error) {
    console.error("❌ Error loading recent matches:", error);
    console.error("🔍 Error details:", {
      message: error.message,
      stack: error.stack,
      teamId: currentTeamId,
      conference: currentConference
    });
    const recentMatchesContent = document.getElementById("recentMatchesContent");
    recentMatchesContent.innerHTML = '<div class="error">Error loading recent matches</div>';
  }
}

function displayRecentMatches() {
  const recentMatchesContent = document.getElementById("recentMatchesContent");
  
  if (allRecentMatches.length === 0) {
    recentMatchesContent.innerHTML = '<div class="no-data">No recent matches found</div>';
    return;
  }
  
  const startIndex = (currentPage - 1) * matchesPerPage;
  const endIndex = startIndex + matchesPerPage;
  const matchesToShow = allRecentMatches.slice(startIndex, endIndex);
  
  const matchCardsPromises = matchesToShow.map(match => createMatchCard(match, true));
  
  Promise.all(matchCardsPromises).then(matchCards => {
    recentMatchesContent.innerHTML = `
      <div class="match-list">
        ${matchCards.join('')}
      </div>
    `;
    
    updatePaginationControls(Math.ceil(allRecentMatches.length / matchesPerPage));
  });
}

function updatePaginationControls(totalPages) {
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  const pageInfo = document.getElementById('pageInfo');
  
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === totalPages;
  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
}

async function createMatchCard(game, isRecent = false) {
  const competition = game.competitions[0];
  const homeTeam = competition.competitors.find(c => c.homeAway === "home");
  const awayTeam = competition.competitors.find(c => c.homeAway === "away");
  
  const homeScore = homeTeam?.score || "0";
  const awayScore = awayTeam?.score || "0";
  
  const gameDate = new Date(game.date);
  const dateStr = gameDate.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
  
  // Determine if current team won
  const isCurrentTeamHome = homeTeam.team.id === currentTeamId;
  const currentTeamScore = isCurrentTeamHome ? parseInt(homeScore) : parseInt(awayScore);
  const opponentScore = isCurrentTeamHome ? parseInt(awayScore) : parseInt(homeScore);
  const result = currentTeamScore > opponentScore ? 'win' : 'loss';
  
  const opponent = isCurrentTeamHome ? awayTeam : homeTeam;
  const team = isCurrentTeamHome ? homeTeam : awayTeam;
  const opponentScore2 = isCurrentTeamHome ? awayScore : homeScore;
  const currentScore = isCurrentTeamHome ? homeScore : awayScore;

  const winner = currentTeamScore > opponentScore;

  return `
<div class="match-item ${result}" onclick="window.open('scoreboard.html?gameId=${game.id}', '_blank')" style="cursor: pointer;">
  <div class="match-date">${dateStr}</div>

  <div class="match-center">
    <div class="match-team-info">
      <img src="https://a.espncdn.com/i/teamlogos/ncaa/500/${team.team.id}.png" 
           alt="${team.team.displayName}" class="match-team-logo"
           onerror="this.src='football.png';">
      <span class="match-team-name">${team.team.abbreviation}</span>
    </div>

    <div class="match-score">
      <span style="color: ${winner ? '#000' : '#777'}">${currentScore}</span> - <span style="color: ${winner ? '#777' : '#000'}">${opponentScore2}</span>
    </div>

    <div class="match-team-info away">
      <span class="match-team-name">${opponent.team.abbreviation}</span>
      <img src="https://a.espncdn.com/i/teamlogos/ncaa/500/${opponent.team.id}.png" 
           alt="${opponent.team.displayName}" class="match-team-logo"
           onerror="this.src='football.png';">
    </div>
  </div>

  <div class="match-result">
    <span class="result-text">${result.toUpperCase()}</span>
  </div>
</div>

  `;
}

async function loadUpcomingMatches() {
  try {
    console.log(`🏈 Loading upcoming matches for team ${currentTeamId} in conference ${currentConference}`);
    const upcomingMatchesContent = document.getElementById("upcomingMatchesContent");
    
    // Get future dates
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 60); // Next 60 days
    
    console.log(`📅 Looking for upcoming games from ${today.toISOString().split('T')[0]} to ${futureDate.toISOString().split('T')[0]}`);
    
    const formatDate = (date) => {
      return date.getFullYear() + 
             String(date.getMonth() + 1).padStart(2, '0') + 
             String(date.getDate()).padStart(2, '0');
    };
    
    const startDateStr = formatDate(today);
    const endDateStr = formatDate(futureDate);
    
    // Use conference-based scoreboard API for upcoming games
    const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=${currentConference}&dates=${startDateStr}-${endDateStr}`;
    console.log(`🔗 Upcoming matches API URL: ${apiUrl}`);
    
    const response = await fetch(convertToHttps(apiUrl));
    
    if (!response.ok) {
      console.error(`❌ Upcoming matches API failed with status: ${response.status}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`📊 Upcoming matches API response:`, data);
    
    if (data.events && data.events.length > 0) {
      console.log(`🎯 Found ${data.events.length} total events in date range`);
      
      // Filter for this team's upcoming games (not completed)
      const teamUpcomingGames = data.events.filter(event => {
        const hasTeam = event.competitions[0].competitors.some(competitor => 
          competitor.team.id === currentTeamId
        );
        const isUpcoming = !event.status.type.completed;
        
        if (hasTeam) {
          console.log(`🎯 Found team game - Upcoming: ${isUpcoming}`, event);
        }
        
        return hasTeam && isUpcoming;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 5); // Show next 5 matches
      
      console.log(`✅ Found ${teamUpcomingGames.length} upcoming games for team ${currentTeamId}`);
      
      if (teamUpcomingGames.length > 0) {
        const upcomingCardsPromises = teamUpcomingGames.map(match => createUpcomingMatchCard(match));
        const upcomingCards = await Promise.all(upcomingCardsPromises);
        
        upcomingMatchesContent.innerHTML = `
          <div class="match-list">
            ${upcomingCards.join('')}
          </div>
        `;
      } else {
        upcomingMatchesContent.innerHTML = '<div class="no-data">No upcoming matches scheduled</div>';
      }
    } else {
      upcomingMatchesContent.innerHTML = '<div class="no-data">No upcoming matches found</div>';
    }
    
  } catch (error) {
    console.error("Error loading upcoming matches:", error);
    const upcomingMatchesContent = document.getElementById("upcomingMatchesContent");
    upcomingMatchesContent.innerHTML = '<div class="error">Error loading upcoming matches</div>';
  }
}

async function createUpcomingMatchCard(game) {
  const competition = game.competitions[0];
  const homeTeam = competition.competitors.find(c => c.homeAway === "home");
  const awayTeam = competition.competitors.find(c => c.homeAway === "away");
  
  const gameDate = new Date(game.date);
  const dateStr = gameDate.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric'
  });
  const timeStr = gameDate.toLocaleTimeString('en-US', { 
    minute: '2-digit',
    hour: 'numeric',
    hour12: true 
  });
  
  // Determine opponent
  const isCurrentTeamHome = homeTeam.team.id === currentTeamId;
  const opponent = isCurrentTeamHome ? awayTeam : homeTeam;
  const venue = isCurrentTeamHome ? "vs" : "@";
  
  return `
    <div class="sched-match-item scheduled" onclick="window.open('scoreboard.html?gameId=${game.id}', '_blank')" style="cursor: pointer;">
      <div class="match-content">
      <div class="sched-match-date">${dateStr}, ${timeStr}</div>

      <div class="sched-match-result">
        <span class="result-text">GAME</span>
      </div>

      <div class="match-teams">
        <div class="sched-match-team-info">
          <span class="match-team-name">${venue} ${opponent.team.abbreviation}</span>
          <img src="https://a.espncdn.com/i/teamlogos/ncaa/500/${opponent.team.id}.png" 
               alt="${opponent.team.displayName}" class="match-team-logo"
               onerror="this.src='football.png';">
        </div>
      </div>
      </div>
    </div>
  `;
}

async function loadTeamStats() {
  try {
    console.log(`🏈 Loading team stats for team ${currentTeamId} in conference ${currentConference}`);
    const teamStatsContent = document.getElementById("teamStatsContent");
    
    // Get current season year
    const seasonYear = await getValidSeasonYear('football', 'college-football', null, currentTeamId);
    console.log(`📊 Using season year: ${seasonYear}`);
    
    // Try the team statistics API first with types/3, fallback to types/2
    let apiUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${seasonYear}/types/3/teams/${currentTeamId}/statistics`;
    console.log(`🔗 Team stats API URL (types/3): ${apiUrl}`);
    
    let response = await fetch(convertToHttps(apiUrl));
    
    if (!response.ok) {
      console.warn(`⚠️ Team stats types/3 API failed with status: ${response.status}, trying types/2...`);
      
      // Try types/2 fallback
      apiUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${seasonYear}/types/2/teams/${currentTeamId}/statistics`;
      console.log(`🔗 Team stats API URL (types/2): ${apiUrl}`);
      
      response = await fetch(convertToHttps(apiUrl));
      
      if (!response.ok) {
        console.warn(`⚠️ Team stats types/2 API also failed with status: ${response.status}, trying alternative team info API...`);
        
        // Try alternative team info API as final fallback
        apiUrl = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/${currentTeamId}`;
        console.log(`🔗 Alternative team API URL: ${apiUrl}`);
        
        response = await fetch(convertToHttps(apiUrl));
        
        if (!response.ok) {
          console.error(`❌ All team stats APIs failed with status: ${response.status}`);
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }
    }
    
    const data = await response.json();
    console.log(`📊 Team stats API response:`, data);
    
    // Check if we have statistical data
    if (data.splits && data.splits.categories) {
      console.log(`✅ Found statistical categories:`, data.splits.categories.map(cat => cat.name));
      const stats = data.splits.categories;
      
      // Key stats to display based on actual API structure from c1.txt
      const keyStats = [
        { key: 'totalPointsPerGame', label: 'Points Per Game', category: 'scoring' },
        { key: 'totalYards', label: 'Total Yards', category: 'total', fallbackKey: 'totalOffenseYards' },
        { key: 'rushingYards', label: 'Rushing Yards', category: 'rushing' },
        { key: 'passingYards', label: 'Passing Yards', category: 'passing' },
        { key: 'totalTouchdowns', label: 'Total TDs', category: 'passing', fallbackKey: 'touchdowns' },
        { key: 'turnovers', label: 'Turnovers', category: 'general', fallbackKey: 'totalTurnovers' },
        { key: 'fumbles', label: 'Fumbles', category: 'general' },
        { key: 'completionPct', label: 'Completion %', category: 'passing' }
      ];
      
      let statsHtml = '<div class="stats-grid">';
      let foundStats = 0;
      
      keyStats.forEach(statInfo => {
        // Find the category by name
        const category = stats.find(cat => cat.name.toLowerCase() === statInfo.category.toLowerCase());
        
        if (category && category.stats) {
          console.log(`📊 Found category: ${category.name} with ${category.stats.length} stats`);
          
          // Look for the exact stat name first, then fallback if available
          let stat = category.stats.find(s => s.name.toLowerCase() === statInfo.key.toLowerCase());
          
          if (!stat && statInfo.fallbackKey) {
            stat = category.stats.find(s => s.name.toLowerCase() === statInfo.fallbackKey.toLowerCase());
          }
          
          if (stat) {
            console.log(`📈 Found stat: ${statInfo.label} = ${stat.displayValue} (Rank: ${stat.rankDisplayValue || 'N/A'})`);
            foundStats++;
            
            statsHtml += `
              <div class="stat-item">
                <div class="stat-value">${stat.displayValue}</div>
                <div class="stat-label">${statInfo.label}</div>
                ${stat.rankDisplayValue ? `<div class="stat-rank">${stat.rankDisplayValue}</div>` : ''}
              </div>
            `;
          } else {
            console.log(`⚠️ Stat not found: ${statInfo.key} in category ${statInfo.category}`);
            console.log(`Available stats in ${category.name}:`, category.stats.map(s => s.name));
          }
        } else {
          console.log(`⚠️ Category not found: ${statInfo.category}`);
          console.log(`Available categories:`, stats.map(cat => cat.name));
        }
      });
      
      // If we found very few stats, show some basic ones from any category
      if (foundStats < 3) {
        console.log(`⚠️ Only found ${foundStats} stats, adding fallback stats`);
        
        stats.forEach(category => {
          if (category.stats && category.stats.length > 0) {
            category.stats.slice(0, 2).forEach(stat => {
              if (stat.displayValue && stat.displayValue !== '0') {
                statsHtml += `
                  <div class="stat-item">
                    <div class="stat-value">${stat.displayValue}</div>
                    <div class="stat-label">${stat.displayName}</div>
                    ${stat.rankDisplayValue ? `<div class="stat-rank">${stat.rankDisplayValue}</div>` : ''}
                  </div>
                `;
              }
            });
          }
        });
      }
      
      statsHtml += '</div>';
      teamStatsContent.innerHTML = statsHtml;
    } else if (data.team && data.team.record) {
      console.log(`ℹ️ No detailed stats, showing basic record info`);
      // Fallback to basic team record if detailed stats aren't available
      const record = data.team.record;
      teamStatsContent.innerHTML = `
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value">${record.items?.[0]?.summary || 'N/A'}</div>
            <div class="stat-label">Overall Record</div>
          </div>
        </div>
      `;
    } else {
      teamStatsContent.innerHTML = '<div class="no-data">No team statistics available</div>';
    }
    
  } catch (error) {
    console.error("Error loading team stats:", error);
    const teamStatsContent = document.getElementById("teamStatsContent");
    teamStatsContent.innerHTML = '<div class="error">Error loading team statistics</div>';
  }
}

async function loadCurrentStanding() {
  try {
    console.log(`🏈 Loading current standing for team ${currentTeamId} in conference ${currentConference}`);
    const currentStandingContent = document.getElementById("currentStandingContent");
    
    // Use the same API approach as standings.js
    // Try postseason standings first (types/3/), fallback to regular season (types/2/)
    let STANDINGS_URL = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/2025/types/3/groups/${currentConference}/standings/1?lang=en&region=us`;
    console.log(`🔗 Standings API URL (postseason): ${STANDINGS_URL}`);
    
    let response = await fetch(convertToHttps(STANDINGS_URL));
    let standingsText = await response.text();
    let data = JSON.parse(standingsText);

    // If postseason has no standings data, try regular season
    if (!data.standings) {
      console.log(`⚠️ No postseason standings found, trying regular season...`);
      STANDINGS_URL = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/2025/types/2/groups/${currentConference}/standings/1?lang=en&region=us`;
      console.log(`🔗 Standings API URL (regular season): ${STANDINGS_URL}`);
      
      response = await fetch(convertToHttps(STANDINGS_URL));
      standingsText = await response.text();
      data = JSON.parse(standingsText);
    }
    
    console.log(`📊 Standings API response:`, data);
    
    if (data && data.standings) {
      console.log(`✅ Found standings data with ${data.standings.length} teams`);
      
      // Find current team in standings by fetching only the needed team data
      let teamStanding = null;
      
      for (const standing of data.standings) {
        try {
          const teamResponse = await fetch(convertToHttps(standing.team.$ref));
          if (!teamResponse.ok) {
            console.warn(`Failed to fetch team data:`, teamResponse.status);
            continue;
          }
          const teamData = await teamResponse.json();
          
          // Check if this is our team
          if (teamData.id === currentTeamId || 
              teamData.id === parseInt(currentTeamId) || 
              teamData.id === currentTeamId.toString()) {
            teamStanding = standing;
            console.log(`✅ Found target team: ${teamData.displayName} (ID: ${teamData.id})`);
            break;
          }
        } catch (error) {
          console.warn(`Failed to fetch team data:`, error);
          continue;
        }
      }
      
      const getOrdinalSuffix = (num) => {
      const j = num % 10;
      const k = num % 100;
      if (j === 1 && k !== 11) return num + "st";
      if (j === 2 && k !== 12) return num + "nd";
      if (j === 3 && k !== 13) return num + "rd";
      return num + "th";
    };

      if (teamStanding) {
        console.log(`🎯 Found team standing:`, teamStanding);
        
        // Extract records exactly like standings.js does
        const overallRecord = teamStanding.records.find(record => record.name === "overall");
        const conferenceRecord = teamStanding.records.find(record => record.name === "vs. Conf.");
        
        if (overallRecord) {
          const record = overallRecord.displayValue || "0-0";
          const confRecord = conferenceRecord?.displayValue || "0-0";
          const wins = overallRecord.stats.find(stat => stat.name === 'wins')?.displayValue || "0";
          const losses = overallRecord.stats.find(stat => stat.name === 'losses')?.displayValue || "0";
          const winPercent = overallRecord.stats.find(stat => stat.name === 'winPercent')?.displayValue || ".000";
          const streak = overallRecord.stats.find(stat => stat.name === 'streak')?.displayValue || "N/A";
          const standing = overallRecord.stats.find(stat => stat.name === 'playoffSeed')?.displayValue || "N/A";
          
          console.log(`📈 Team standing stats: Position ${teamStanding.position}, Record: ${record}, Conference: ${confRecord}`);
          
          // Find conference name
          const conferenceName = Object.keys(CONFERENCES).find(key => CONFERENCES[key].groupId === currentConference) || "NCAA Football";
          
          currentStandingContent.innerHTML = `
            <div class="standing-info">
              <div class="standing-position">${getOrdinalSuffix(standing)}</div>
              <div class="standing-details">
                  <strong>${conferenceName}</strong><br><br>
                  Record: ${record}<br><br>
                  Win %: ${winPercent}<br><br>
                  CONF: ${confRecord}<br><br>
                  Streak: ${streak}
              </div>
            </div>
          `;
        } else {
          console.log(`⚠️ No overall record found for team`);
          currentStandingContent.innerHTML = '<div class="no-data">Standing details not available</div>';
        }
      } else {
        console.log(`❌ Team ${currentTeamId} not found in standings after checking all teams`);
        currentStandingContent.innerHTML = '<div class="no-data">Team not found in standings</div>';
      }
    } else {
      console.log(`ℹ️ No standings data found in API response`);
      currentStandingContent.innerHTML = '<div class="no-data">No standings data available</div>';
    }
    
  } catch (error) {
    console.error("❌ Error loading current standing:", error);
    console.error("🔍 Error details:", {
      message: error.message,
      stack: error.stack,
      teamId: currentTeamId,
      conference: currentConference
    });
    const currentStandingContent = document.getElementById("currentStandingContent");
    currentStandingContent.innerHTML = '<div class="error">Error loading standings</div>';
  }
}

async function loadPlayersInfo() {
  try {
    console.log(`🏈 Loading roster for team ${currentTeamId}`);
    const playersInfoContent = document.getElementById("playersInfoContent");
    
    const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/${currentTeamId}/roster`;
    console.log(`🔗 Roster API URL: ${apiUrl}`);
    
    const response = await fetch(convertToHttps(apiUrl));
    
    if (!response.ok) {
      console.error(`❌ Roster API failed with status: ${response.status}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`📊 Roster API response:`, data);
    
    if (data.athletes && data.athletes.length > 0) {
      console.log(`✅ Found ${data.athletes.length} position groups on roster`);
      
      // Flatten athletes from all position groups
      let allAthletes = [];
      data.athletes.forEach(positionGroup => {
        if (positionGroup.items && positionGroup.items.length > 0) {
          console.log(`📋 Position group '${positionGroup.position}' has ${positionGroup.items.length} players`);
          positionGroup.items.forEach(athlete => {
            allAthletes.push({
              ...athlete,
              positionGroup: positionGroup.position // Add position group info
            });
          });
        }
      });
      
      console.log(`📊 Total players found: ${allAthletes.length}`);
      
      // Store for pagination and other uses
      allRosterPlayers = allAthletes.map(athlete => ({
        id: athlete.id,
        firstName: athlete.firstName || '',
        lastName: athlete.lastName || '',
        displayName: athlete.displayName || `${athlete.firstName || ''} ${athlete.lastName || ''}`.trim(),
        jersey: athlete.jersey || 'N/A',
        position: athlete.position?.abbreviation || athlete.positionGroup || 'Unknown',
        height: athlete.displayHeight || 'N/A',
        weight: athlete.displayWeight || 'N/A',
        year: athlete.experience?.abbreviation || 'N/A',
        hometown: athlete.birthPlace?.displayText || 'N/A',
        headshot: athlete.headshot?.href || null
      }));
      
      console.log(`📋 Processed ${allRosterPlayers.length} players for display`);
      
      // Organize players by position groups
      const playersByPosition = {};
      
      allRosterPlayers.forEach(athlete => {
        const position = athlete.position;
        if (!playersByPosition[position]) {
          playersByPosition[position] = [];
        }
        playersByPosition[position].push(athlete);
      });
      
      // Sort positions
      const sortedPositions = Object.keys(playersByPosition).sort();
      
      let playersHtml = '<div class="roster-list">';
      
      sortedPositions.forEach(position => {
        playersHtml += `<h4>${position}</h4>`;
        
        playersByPosition[position].forEach(player => {
          const headshotUrl = player.headshot || 'football.png';
          
          playersHtml += `
            <div class="player-card" onclick="showPlayerDetails('${player.id}', '${player.firstName || ''}', '${player.lastName || ''}', '${player.jersey || 'N/A'}', '${position}', '${headshotUrl}')">
              <img src="${headshotUrl}" alt="${player.displayName}" class="player-headshot" onerror="this.src='football.png';">
              <div class="player-name-column">
                <div class="player-first-name">${player.firstName || ''}</div>
                <div class="player-last-name">${player.lastName || ''}</div>
              </div>
              <div class="player-number">#${player.jersey || 'N/A'}</div>
              <div class="player-position">${position}</div>
            </div>
          `;
        });
      });
      
      playersHtml += '</div>';
      playersInfoContent.innerHTML = playersHtml;
    } else {
      console.log(`ℹ️ No athletes found in roster data`);
      playersInfoContent.innerHTML = '<div class="no-data">No player information available</div>';
    }
    
  } catch (error) {
    console.error("❌ Error loading players info:", error);
    console.error("🔍 Error details:", {
      message: error.message,
      stack: error.stack,
      teamId: currentTeamId
    });
    const playersInfoContent = document.getElementById("playersInfoContent");
    playersInfoContent.innerHTML = '<div class="error">Error loading player information</div>';
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

    // Assemble modal
    modalContent.appendChild(closeButton);
    modalContent.appendChild(playerHeader);
    modalContent.appendChild(statsContainer);
    modalContent.appendChild(sliderSection);
    modal.appendChild(modalContent);

    // Add modal to document
    document.body.appendChild(modal);

    // Check if position should show full stats (exclude LS)
    if (!shouldShowFullStats(position)) {
      statsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;">Statistics not available for this position</div>';
    } else {
      // Get valid season year and fetch player stats
      const seasonYear = await getValidSeasonYear('football', 'college-football', playerId);
      const result = await fetchAthleteStats('football', 'college-football', seasonYear, playerId);

      console.log('Player stats data:', result);

      if (result && result.splits && result.splits.categories) {
        displayPlayerStatsInModal(result.splits.categories, statsContainer, position, seasonYear);
      } else {
        statsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;">Player statistics not available</div>';
      }
    }
  } catch (error) {
    console.error('Error showing player details:', error);
    // Check if modal exists and is in the DOM before trying to remove it
    const existingModal = document.querySelector('.modal-overlay');
    if (existingModal && document.body.contains(existingModal)) {
      document.body.removeChild(existingModal);
    }
    showFeedback('Error loading player details', 'error');
  }
}

function displayPlayerStatsInModal(categories, container, position, seasonYear = null) {
  const positionGroup = getPositionGroup(position);
  const shouldShow = shouldShowFullStats(position);
  
  if (!shouldShow) {
    container.innerHTML = '<div class="no-stats"><p>Detailed statistics not available for this position.</p></div>';
    return;
  }
  
  const relevantStats = getPositionStats(positionGroup, categories.reduce((acc, cat) => {
    cat.stats.forEach(stat => {
      acc[stat.name] = stat;
    });
    return acc;
  }, {}));
  
  if (Object.keys(relevantStats).length === 0) {
    container.innerHTML = '<div class="no-stats"><p>No relevant statistics found for this player.</p></div>';
    return;
  }
  
  let statsHtml = `
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
      <div class="stats-grid-player">
  `;
  
  Object.entries(relevantStats).forEach(([statName, statData]) => {
    statsHtml += `
      <div class="player-stat-item">
        <div class="player-stat-value">${statData.displayValue}</div>
        <div class="player-stat-label">${statData.displayName}</div>
      </div>
    `;
  });
  
  statsHtml += `
      </div>
    </div>
  `;
  
  container.innerHTML = statsHtml;
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
  // Order: closeButton(0), playerHeader(1), statsContainer(2), sliderSection(3)
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
    
    if (estNow.getHours() < 6) { // Use 6 AM for football (games can end late, especially Monday Night)
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

  // Check if position should show full stats (exclude LS)
  if (!shouldShowFullStats(selectedPlayer.position)) {
    statsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;">Statistics not available for this position</div>';
    return;
  }

  // Reload the overall stats
  const seasonYear = await getValidSeasonYear('football', 'college-football', selectedPlayer.id);
  const result = await fetchAthleteStats('football', 'college-football', seasonYear, selectedPlayer.id);

  console.log('Player stats data:', result);

  if (result && result.splits && result.splits.categories) {
    displayPlayerStatsInModal(result.splits.categories, statsContainer, selectedPlayer.position, seasonYear);
  } else {
    statsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;">Player statistics not available</div>';
  }
}

async function loadGameLogForDate(date) {
  const resultsContainer = document.getElementById('gameLogResults');
  if (!resultsContainer || !selectedPlayer) return;

  try {
    resultsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;"><div style="display: inline-block; width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #013369; border-radius: 50%; animation: spin 1s linear infinite;"></div><br>Loading game data...</div>';

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
      const selectedDay = selectedDate.getDate();
      const selectedYear = selectedDate.getFullYear();
      
      // NCAA Football season runs from August 1 to January 31
      // The season is identified by the year it STARTED in
      // So 2021-22 season = 2021, 2022-23 season = 2022, etc.
      
      // If the date is from February 1 to July 31, it belongs to the off-season
      if (selectedMonth >= 2 && selectedMonth <= 7) {
        return selectedYear; // Off-season, use current year as season identifier
      } 
      // If the date is from August 1 to December 31, it belongs to the season starting in that year
      else if (selectedMonth >= 8) {
        return selectedYear; // Season starting year
      } 
      // If the date is from January 1 to January 31, it belongs to the season that started the previous year
      else {
        return selectedYear - 1; // Season started in previous year
      }
    }
    
    function getSeasonTypeForDate(dateStr) {
      const selectedDate = new Date(dateStr);
      const selectedMonth = selectedDate.getMonth() + 1; // 0-based, so add 1
      const selectedDay = selectedDate.getDate();
      
      // Regular season: August to December
      if (selectedMonth >= 8 && selectedMonth <= 12) {
        return 2; // Regular season
      }
      // Post-season: January (bowl games and playoffs)
      else if (selectedMonth === 1) {
        return 3; // Playoffs/Bowl games
      }
      // Off-season: February to July
      else {
        return 4; // Off-season
      }
    }
    
    const seasonYear = getSeasonYearForDate(date);
    const seasonType = getSeasonTypeForDate(date);
    console.log(`Selected date: ${date}, calculated season year: ${seasonYear}, season type: ${seasonType}`);
    
    // Get the player's team for the specific season year
    let teamIdForSeason = currentTeamId; // Default to current team
    try {
      console.log(`Fetching player's team for season ${seasonYear}...`);
      const playerSeasonResponse = await fetch(convertToHttps(`https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${seasonYear}/athletes/${selectedPlayer.id}?lang=en&region=us`));
      
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
    
    // Find games for the selected date using ESPN API with season type
    const scheduleResponse = await fetch(convertToHttps(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/${teamIdForSeason}/schedule?season=${seasonYear}&seasontype=${seasonType}`));
    
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
    const gameResponse = await fetch(convertToHttps(`https://cdn.espn.com/core/college-football/boxscore?xhr=1&gameId=${game.id}`));
    const gameData = await gameResponse.json();

    console.log('Game data structure:', gameData); // Debug log

    // Use the exact same structure as scoreboard.js
    const players = gameData.gamepackageJSON?.boxscore?.players || [];
    console.log("Players data:", players);

    if (players.length === 0) {
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

    // Extract competition data for use in the rest of the function
    const competition = game.competitions[0];

    // Find the team that contains our player and collect all their stats
    let playerStats = {};
    let playerTeam = null;
    let foundPlayer = false;
    const isHomeTeam = competition.competitors.find(c => c.team.id.toString() === teamIdForSeason.toString()).homeAway === 'home';

    for (const team of players) {
      if (!team.statistics || team.statistics.length === 0) continue;

      // Search through all statistics categories for this team
      for (const statCategory of team.statistics) {
        const athletes = statCategory.athletes || [];
        
        // Try different ID matching approaches
        const foundPlayerInCategory = athletes.find(athlete => 
          athlete.athlete.id === selectedPlayer.id.toString() ||
          athlete.athlete.id === selectedPlayer.id ||
          athlete.athlete.displayName === `${selectedPlayer.firstName} ${selectedPlayer.lastName}` ||
          athlete.athlete.fullName === `${selectedPlayer.firstName} ${selectedPlayer.lastName}`
        );

        if (foundPlayerInCategory) {
          foundPlayer = true;
          playerTeam = team;
          playerStats[statCategory.name] = foundPlayerInCategory.stats;
          console.log(`Player found in ${statCategory.name}:`, foundPlayerInCategory.stats);
        }
      }

      if (foundPlayer) break;
    }

    if (!foundPlayer) {
      const competition = game.competitions[0];
      const gameDate = new Date(game.date);
      const opponent = competition.competitors.find(c => c.team.id.toString() !== teamIdForSeason.toString());
      
      resultsContainer.innerHTML = `
        <div style="border: 1px solid #ddd; border-radius: 12px; padding: 40px; background: #f8f9fa; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 15px;">🏈</div>
          <div style="color: #777; font-size: 1.1rem; margin-bottom: 15px; font-weight: 500;">
            Player not found in game statistics
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

    // Get team logos - use proper NCAA logo URLs
    const playerTeamCompetitor = competition.competitors.find(c => c.team.id.toString() === teamIdForSeason.toString());
    const teamLogo = `https://a.espncdn.com/i/teamlogos/ncaa/500/${playerTeamCompetitor.team.id}.png`;
    const opponentTeam = competition.competitors.find(c => c.team.id.toString() !== teamIdForSeason.toString());
    const opponentLogo = `https://a.espncdn.com/i/teamlogos/ncaa/500/${opponentTeam.team.id}.png`;

    // Game info
    const gameDate = new Date(game.date);
    const teamCompetitor = competition.competitors.find(c => c.team.id.toString() === teamIdForSeason.toString());
    const opponentCompetitor = competition.competitors.find(c => c.team.id.toString() !== teamIdForSeason.toString());
    
    // Check if we found the team competitors
    if (!teamCompetitor || !opponentCompetitor) {
      console.error('Could not find team competitors:', { teamIdForSeason, competitors: competition.competitors });
      resultsContainer.innerHTML = `
        <div style="border: 1px solid #ddd; border-radius: 12px; padding: 40px; background: #f8f9fa; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 15px;">⚠️</div>
          <div style="color: #777; font-size: 1.1rem; margin-bottom: 15px; font-weight: 500;">
            Team data not found for this game
          </div>
          <div style="color: #999; font-size: 0.95rem; line-height: 1.4;">
            Unable to load game information
          </div>
        </div>
      `;
      return;
    }
    
    // Access the score value properly - it might be a string or number
    const teamScore = isHomeTeam ? gameData.__gamepackage__.homeTeam.score : gameData.__gamepackage__.awayTeam.score;
    const opponentScore = isHomeTeam ? gameData.__gamepackage__.awayTeam.score : gameData.__gamepackage__.homeTeam.score;
    
    let gameResult = '';
    if (game.competitions[0].status.type.completed) {
      gameResult = parseInt(teamScore) > parseInt(opponentScore) ? 'W' : 'L';
    }

    // Extract player stats using the correct structure from playerStats
    const position = selectedPlayer.position;
    
    // Create position-specific stats display based on available categories
    let statsDisplay = '';
    
    if (['QB'].includes(position)) {
      // Quarterback stats - get from passing and rushing
      const passingStats = playerStats.passing || [];
      const rushingStats = playerStats.rushing || [];
      
      statsDisplay = `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 1rem; font-weight: bold; margin-bottom: 10px; color: #FFA500;">🏈 Passing Stats</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 15px; margin-bottom: 15px;">
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${passingStats[0] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">C/ATT</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${passingStats[1] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">PYDS</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${passingStats[2] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">PAVG</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${passingStats[3] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">PTD</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${passingStats[4] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">INT</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${passingStats[5] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">S-YDSLST</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${passingStats[6] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">RTG</div>
            </div>
          </div>
        </div>
        ${rushingStats.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 1rem; font-weight: bold; margin-bottom: 10px; color: #FFA500;">🏈 Rushing Stats</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 15px;">
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${rushingStats[0] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">CAR</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${rushingStats[1] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">RUSH YDS</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${rushingStats[2] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">YDS/CAR</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${rushingStats[3] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">RUSH TD</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${rushingStats[4] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">LNG</div>
            </div>
          </div>
        </div>
        ` : ''}
      `;
    } else if (['RB', 'FB'].includes(position)) {
      // Running back stats - get from rushing and receiving
      const rushingStats = playerStats.rushing || [];
      const receivingStats = playerStats.receiving || [];
      const kickReturnStats = playerStats.kickReturns || [];
      const puntReturnStats = playerStats.puntReturns || [];
      
      statsDisplay = `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 1rem; font-weight: bold; margin-bottom: 10px; color: #FFA500;">🏈 Rushing Stats</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 15px; margin-bottom: 15px;">
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${rushingStats[0] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">CAR</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${rushingStats[1] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">RUSH YDS</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${rushingStats[2] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">YDS/CAR</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${rushingStats[3] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">RUSH TD</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${rushingStats[4] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">LNG</div>
            </div>
          </div>
        </div>
        ${receivingStats.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 1rem; font-weight: bold; margin-bottom: 10px; color: #FFA500;">🏈 Receiving Stats</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 15px;">
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${receivingStats[0] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">REC</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${receivingStats[1] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">REC YDS</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${receivingStats[2] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">YDS/REC</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${receivingStats[3] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">REC TD</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${receivingStats[4] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">LNG</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${receivingStats[5] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">TGT</div>
            </div>
          </div>
        </div>
        ` : ''}
      `;
    } else if (['WR', 'TE'].includes(position)) {
      // Receiver stats - get from receiving and rushing
      const receivingStats = playerStats.receiving || [];
      const rushingStats = playerStats.rushing || [];
      const defensiveStats = playerStats.defensive || [];
      const interceptionStats = playerStats.interceptions || [];
      
      statsDisplay = `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 1rem; font-weight: bold; margin-bottom: 10px; color: #FFA500;">🏈 Receiving Stats</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 15px; margin-bottom: 15px;">
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${receivingStats[0] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">REC</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${receivingStats[1] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">REC YDS</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${receivingStats[2] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">YDS/REC</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${receivingStats[3] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">REC TD</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${receivingStats[4] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">LNG</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${receivingStats[5] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">TGT</div>
            </div>
          </div>
        </div>
        ${rushingStats.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 1rem; font-weight: bold; margin-bottom: 10px; color: #FFA500;">🏈 Rushing Stats</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 15px;">
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${rushingStats[0] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">CAR</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${rushingStats[1] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">RUSH YDS</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${rushingStats[2] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">YDS/CAR</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${rushingStats[3] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">RUSH TD</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${rushingStats[4] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">LNG</div>
            </div>
          </div>
        </div>
        ` : ''}
      `;
    } else if (['DE', 'DT', 'LB', 'OLB', 'MLB', 'ILB'].includes(position)) {
      // Defensive front seven stats - get from defensive
      const defensiveStats = playerStats.defensive || [];
      
      statsDisplay = `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 1rem; font-weight: bold; margin-bottom: 10px; color: #FFA500;">🏈 Defensive Stats</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 15px;">
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${defensiveStats[0] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">TOT TCKL</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${defensiveStats[1] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">SOLO</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${defensiveStats[2] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">SACKS</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${defensiveStats[3] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">TFL</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${defensiveStats[4] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">PD</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${defensiveStats[5] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">QB HIT</div>
            </div>
          </div>
        </div>
      `;
    } else if (['CB', 'S', 'FS', 'SS', 'DB'].includes(position)) {
      // Defensive back stats - get from defensive and interceptions
      const defensiveStats = playerStats.defensive || [];
      const interceptionStats = playerStats.interceptions || [];
      
      statsDisplay = `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 1rem; font-weight: bold; margin-bottom: 10px; color: #FFA500;">🏈 Defensive Stats</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 15px; margin-bottom: 15px;">
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${defensiveStats[0] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">TOT TCKL</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${defensiveStats[1] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">SOLO</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${defensiveStats[4] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">PD</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${defensiveStats[5] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">QB HIT</div>
            </div>
          </div>
        </div>
        ${interceptionStats.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 1rem; font-weight: bold; margin-bottom: 10px; color: #FFA500;">🏈 Interception Stats</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 15px;">
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${interceptionStats[0] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">INT</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${interceptionStats[1] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">INT YDS</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${interceptionStats[2] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">LNG</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${interceptionStats[3] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">TD</div>
            </div>
          </div>
        </div>
        ` : ''}
      `;
    } else if (['K', 'P', 'PK'].includes(position)) {
      // Kicker/Punter stats - get from kicking and punting
      const kickingStats = playerStats.kicking || [];
      const puntingStats = playerStats.punting || [];
      
      statsDisplay = `
        ${kickingStats.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 1rem; font-weight: bold; margin-bottom: 10px; color: #FFA500;">🏈 Kicking Stats</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 15px; margin-bottom: 15px;">
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${kickingStats[0] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">FG MADE/ATT</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${kickingStats[1] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">FG PCT</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${kickingStats[2] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">LNG</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${kickingStats[3] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">XP MADE/ATT</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${kickingStats[4] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">KICK PTS</div>
            </div>
          </div>
        </div>
        ` : ''}
        ${puntingStats.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 1rem; font-weight: bold; margin-bottom: 10px; color: #FFA500;">🏈 Punting Stats</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 15px;">
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${puntingStats[0] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">PUNTS</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${puntingStats[1] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">PUNT YDS</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${puntingStats[2] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">PUNT AVG</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${puntingStats[3] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">PTB</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${puntingStats[4] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">IN 20</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.4rem; font-weight: bold; color: #fff;">${puntingStats[5] || '0'}</div>
              <div style="font-size: 0.75rem; color: #ccc; margin-top: 2px;">LNG</div>
            </div>
          </div>
        </div>
        ` : ''}
      `;
    } else {
      // Generic stats for offensive linemen and other positions
      const availableCategories = Object.keys(playerStats);
      
      if (availableCategories.length > 0) {
        statsDisplay = `
          <div style="margin-bottom: 20px;">
            <div style="font-size: 1rem; font-weight: bold; margin-bottom: 10px; color: #FFA500;">🏈 Player Statistics</div>
            ${availableCategories.map(category => {
              const stats = playerStats[category];
              return `
                <div style="margin-bottom: 15px;">
                  <div style="font-size: 0.9rem; font-weight: bold; margin-bottom: 8px; color: #ccc; text-transform: capitalize;">${category}</div>
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(60px, 1fr)); gap: 10px;">
                    ${stats.map((stat, index) => `
                      <div style="text-align: center;">
                        <div style="font-size: 1.2rem; font-weight: bold; color: #fff;">${stat || '0'}</div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      } else {
        statsDisplay = `
          <div style="text-align: center; padding: 30px; background: rgba(255,255,255,0.1); border-radius: 8px;">
            <div style="font-size: 1.1rem; color: #ccc; margin-bottom: 10px;">🏈</div>
            <div style="color: #ccc; font-size: 1rem; margin-bottom: 5px;">Player appeared in this game</div>
            <div style="color: #999; font-size: 0.9rem;">Detailed statistics not available for this position</div>
          </div>
        `;
      }
    }
    
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
              onerror="this.src='football.png';" 
              crossorigin="anonymous">
          </div>
          <div>
            <div style="font-size: 1.3rem; font-weight: bold; margin-bottom: 2px;">${selectedPlayer.firstName} ${selectedPlayer.lastName}</div>
            <div style="color: #ccc; font-size: 0.9rem;">#${selectedPlayer.jersey} | ${selectedPlayer.position}</div>
          </div>
        </div>

        <!-- Game Header -->
        <div id="gameHeader_${game.id}" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 25px; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 8px; cursor: pointer; transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.15)'" onmouseout="this.style.backgroundColor='rgba(255,255,255,0.1)'">
          <div style="display: flex; align-items: center; gap: 15px;">
            <img src="${teamLogo}" alt="${currentTeam.displayName}" style="height: 30px;" onerror="this.src='football.png';">
            <span style="font-size: 1.1rem; font-weight: bold; color: ${parseInt(teamScore) > parseInt(opponentScore)  ? '#fff' : '#ccc'};">${teamScore}</span>
            <span style="color: #ccc;">-</span>
            <span style="font-size: 1.1rem; font-weight: bold; color: ${parseInt(opponentScore) > parseInt(teamScore) ? '#fff' : '#ccc'};">${opponentScore}</span>
            <img src="${opponentLogo}" alt="${opponentTeam.team.displayName}" style="height: 30px;" onerror="this.src='football.png';">
            ${gameResult ? `<span style="font-weight: bold; color: ${gameResult === 'W' ? '#4CAF50' : '#f44336'}; font-size: 1.1rem;">${gameResult}</span>` : ''}
          </div>
          <div style="text-align: right; color: #ccc; font-size: 0.85rem;">
            ${gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </div>

        <!-- Football Stats -->
        <div style="margin-bottom: 20px;">
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
    const teamCol = typeof teamColor !== 'undefined' ? teamColor : '#000000';
    const captureContainer = document.createElement('div');
    captureContainer.style.cssText = `background: ${teamCol}; color: white; padding: 30px; border-radius: 16px; width: 600px; max-width: 600px; min-width: 600px; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; position: fixed; left: -9999px; top: -9999px; z-index: -1; overflow: hidden;`;
    
    // Get player information for header
    const playerName = selectedPlayer ? `${selectedPlayer.firstName} ${selectedPlayer.lastName}` : 'Unknown Player';
    const jerseyNumber = selectedPlayer ? selectedPlayer.jersey : 'N/A';
    const position = selectedPlayer ? selectedPlayer.position : 'N/A';
    const teamName = currentTeam ? currentTeam.displayName : 'Unknown Team';
    const teamAbbr = currentTeam ? currentTeam.abbreviation : 'UNK';
    const headshotUrl = selectedPlayer ? selectedPlayer.headshot : 'icon.png';
    const teamLogo = currentTeam ? (currentTeam.id === "349" ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${currentTeam.id}.png` : `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${currentTeam.id}.png`) : '';
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
    
    // Style stat cards to be translucent - target CSS classes for NCAAF
    const statCards = statsContent.querySelectorAll('.player-stat-item, [style*="background"]');
    statCards.forEach(card => {
      if (card.classList.contains('player-stat-item')) {
        // For CSS class elements, set inline styles to override
        card.style.background = 'rgba(255,255,255,0.1)';
        card.style.border = '1px solid rgba(255,255,255,0.2)';
        card.style.color = 'white';
      } else if (card.style.background && !card.style.background.includes('rgba')) {
        card.style.background = 'rgba(255,255,255,0.1)';
        card.style.border = '1px solid rgba(255,255,255,0.2)';
        card.style.color = 'white';
      }
    });
    
    // Set stat labels to white - target both CSS classes and inline styles
    const statLabels = statsContent.querySelectorAll('.player-stat-label, [style*="color: #777"], [style*="color:#777"]'); 
    statLabels.forEach(l => l.style.color = 'white');
    
    // Set stat values to white - target CSS classes
    const statValues = statsContent.querySelectorAll('.player-stat-value, [style*="font-weight: bold"]');
    statValues.forEach(v => v.style.color = 'white');
    
    // Set stat ranks to white  
    const statRanks = statsContent.querySelectorAll('[style*="color: #28a745"]');
    statRanks.forEach(r => r.style.color = 'white');
    
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

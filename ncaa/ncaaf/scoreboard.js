const TEAMS_API_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams";

// Cache for team rankings: {teamId: rank}
let rankingsCache = {};

// Function to convert any URL to HTTPS
function convertToHttps(url) {
  if (typeof url !== 'string') return url;
  return url.replace(/^http:\/\//i, 'https://');
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
    
    // Use cached week if it's less than 1 hour old
    if (cachedWeek && cacheTimestamp) {
      const hoursSinceCache = (Date.now() - parseInt(cacheTimestamp)) / (1000 * 60 * 60);
      if (hoursSinceCache < 1) {
        return cachedWeek;
      }
    }
    
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
    
    console.log(`Determined current week: ${currentWeekNum} for season ${currentSeason}`);
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
    
    // Use cached data if it's less than 5 minutes old
    if (cachedData && cacheTimestamp) {
      const age = Date.now() - parseInt(cacheTimestamp);
      if (age < 5 * 60 * 1000) { // 5 minutes
        rankingsCache = JSON.parse(cachedData);
        return;
      }
    }

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

// Get formatted team abbreviation with ranking
function getTeamAbbreviationWithRanking(team) {
  const teamRank = rankingsCache[team.id];
  const baseAbbr = team.abbreviation || "UNK";
  
  if (teamRank) {
    return `<span style="color: #777;">${teamRank}</span> ${baseAbbr}`;
  }
  
  return baseAbbr;
}

// NCAA Football Position Groupings for Scoring Cards
function getPositionGroup(position) {
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
  
  return positionGroups[position] || 'OTHER';
}

// Get relevant stats for position group for scoring cards
function getPositionStatsForCard(positionGroup, boxScoreData, playerName, preferredStatCategory = null) {
  console.log('getPositionStatsForCard called with:', { positionGroup, playerName, preferredStatCategory, hasBoxScore: !!boxScoreData });
  
  if (!boxScoreData || !boxScoreData.gamepackageJSON?.boxscore?.players) {
    return [];
  }

  const players = boxScoreData.gamepackageJSON.boxscore.players;
  let playerStats = {};
  let foundInPreferredCategory = false;

  console.log('Searching for player in box score, teams:', players.length);

  // First pass: try to find player in preferred stat category
  if (preferredStatCategory) {
    for (const team of players) {
      for (const statCategory of team.statistics || []) {
        if (statCategory.name === preferredStatCategory) {
          console.log('Checking preferred stat category:', statCategory.name, 'with labels:', statCategory.labels);
          for (const athlete of statCategory.athletes || []) {
            const athleteName = athlete.athlete?.displayName || '';
            const athleteFullName = athlete.athlete?.fullName || '';
            
            // Check for exact match first
            if (athleteName === playerName || athleteFullName === playerName) {
              console.log('Found exact matching player in preferred category!', athleteName);
              const stats = athlete.stats || [];
              for (let i = 0; i < stats.length; i++) {
                const statName = statCategory.labels?.[i];
                if (statName) {
                  playerStats[statName] = stats[i];
                  console.log('Added preferred stat:', statName, '=', stats[i]);
                }
              }
              foundInPreferredCategory = true;
              break;
            }
            // Check for abbreviated name match
            else if (playerName.includes('.') && athleteName) {
              const [firstInitial, lastName] = playerName.split('.');
              if (athleteName.toLowerCase().startsWith(firstInitial.toLowerCase()) && 
                  athleteName.toLowerCase().includes(lastName.toLowerCase())) {
                console.log('Found matching player by abbreviation in preferred category!', athleteName, 'matches', playerName);
                const stats = athlete.stats || [];
                for (let i = 0; i < stats.length; i++) {
                  const statName = statCategory.labels?.[i];
                  if (statName) {
                    playerStats[statName] = stats[i];
                    console.log('Added preferred stat:', statName, '=', stats[i]);
                  }
                }
                foundInPreferredCategory = true;
                break;
              }
            }
          }
          if (foundInPreferredCategory) break;
        }
      }
      if (foundInPreferredCategory) break;
    }
  }

  // If not found in preferred category or no preferred category, search all categories
  if (!foundInPreferredCategory) {
    console.log('Player not found in preferred category, searching all categories');
    // Find the player in the box score data
    for (const team of players) {
      console.log('Checking team:', team.team?.displayName);
      for (const statCategory of team.statistics || []) {
        console.log('Checking stat category:', statCategory.name, 'with labels:', statCategory.labels);
        for (const athlete of statCategory.athletes || []) {
          const athleteName = athlete.athlete?.displayName || '';
          const athleteFullName = athlete.athlete?.fullName || '';
          console.log('Checking athlete:', athleteName);
          
          // Check for exact match first
          if (athleteName === playerName || athleteFullName === playerName) {
            console.log('Found exact matching player!', athleteName);
            const stats = athlete.stats || [];
            for (let i = 0; i < stats.length; i++) {
              const statName = statCategory.labels?.[i];
              if (statName) {
                playerStats[statName] = stats[i];
                console.log('Added stat:', statName, '=', stats[i]);
              }
            }
          }
          // Check for abbreviated name match (e.g., "G.Helm" matches "Greg Helm")
          else if (playerName.includes('.') && athleteName) {
            const [firstInitial, lastName] = playerName.split('.');
            if (athleteName.toLowerCase().startsWith(firstInitial.toLowerCase()) && 
                athleteName.toLowerCase().includes(lastName.toLowerCase())) {
              console.log('Found matching player by abbreviation!', athleteName, 'matches', playerName);
              const stats = athlete.stats || [];
              for (let i = 0; i < stats.length; i++) {
                const statName = statCategory.labels?.[i];
                if (statName) {
                  playerStats[statName] = stats[i];
                  console.log('Added stat:', statName, '=', stats[i]);
                }
              }
            }
          }
        }
      }
    }
  }

  console.log('Player stats found:', playerStats);

  // Map position-specific stats for scoring cards (6 stats each)
  const statMappings = {
    'QB': [
      { key: 'CMP', label: 'Comp' },
      { key: 'ATT', label: 'Att' },
      { key: 'YDS', label: 'Pass Yds' },
      { key: 'TD', label: 'Pass TD' },
      { key: 'INT', label: 'INT' },
      { key: 'QBR', label: 'QBR' }
    ],
    'RB': [
      { key: 'CAR', label: 'Carries' },
      { key: 'YDS', label: 'Rush Yds' },
      { key: 'TD', label: 'Rush TD' },
      { key: 'AVG', label: 'Avg' },
      { key: 'REC', label: 'Rec' },
      { key: 'YDS', label: 'Rec Yds' }
    ],
    'RB_RUSHING': [
      { key: 'CAR', label: 'Carries' },
      { key: 'YDS', label: 'Rush Yds' },
      { key: 'AVG', label: 'Avg' },
      { key: 'TD', label: 'Rush TD' },
      { key: 'LONG', label: 'Long' }
    ],
    'WR': [
      { key: 'REC', label: 'Rec' },
      { key: 'YDS', label: 'Rec Yds' },
      { key: 'TD', label: 'Rec TD' },
      { key: 'AVG', label: 'Avg' },
      { key: 'LONG', label: 'Long' },
      { key: 'TGTS', label: 'Targets' }
    ],
    'WR/TE': [
      { key: 'REC', label: 'Rec' },
      { key: 'YDS', label: 'Rec Yds' },
      { key: 'TD', label: 'Rec TD' },
      { key: 'AVG', label: 'Avg' },
      { key: 'LONG', label: 'Long' },
      { key: 'TGTS', label: 'Targets' }
    ],
    'K': [
      { key: 'FGM', label: 'FG Made' },
      { key: 'FGA', label: 'FG Att' },
      { key: 'XPM', label: 'XP Made' },
      { key: 'XPA', label: 'XP Att' },
      { key: 'PTS', label: 'Points' },
      { key: 'LNG', label: 'Long' }
    ],
    'DL/LB': [
      { key: 'SOLO', label: 'Solo' },
      { key: 'TOT', label: 'Total' },
      { key: 'SACKS', label: 'Sacks' },
      { key: 'TFL', label: 'TFL' },
      { key: 'QH', label: 'QB Hits' },
      { key: 'PD', label: 'PD' }
    ],
    'DB': [
      { key: 'SOLO', label: 'Solo' },
      { key: 'TOT', label: 'Total' },
      { key: 'INT', label: 'INT' },
      { key: 'PD', label: 'PD' },
      { key: 'SACKS', label: 'Sacks' },
      { key: 'TFL', label: 'TFL' }
    ],
    'K/P': [
      { key: 'FG', label: 'FG' },
      { key: 'XP', label: 'XP' },
      { key: 'PTS', label: 'Points' },
      { key: 'AVG', label: 'Avg' },
      { key: 'LONG', label: 'Long' },
      { key: 'TB', label: 'TB' }
    ]
  };

  const positionStatConfig = statMappings[positionGroup] || statMappings['DL/LB'];
  const formattedStats = [];

  positionStatConfig.forEach(config => {
    const value = playerStats[config.key] || '0';
    formattedStats.push({
      label: config.label,
      value: value
    });
  });

  return formattedStats;
}

// NCAA Football team name normalization with ranking support
function normalizeTeamName(teamName) {
  // Special cases for specific team names
  const specialCases = {
    'nc state wolfpack': 'north-carolina-state-wolfpack',
    'north carolina state': 'north-carolina-state-wolfpack',
    'north carolina state wolfpack': 'north-carolina-state-wolfpack',
    'miami (oh) redhawks': 'miami-oh-red-hawks',
    'saint francis red flash': 'st-francis-red-flash',
    'ul monroe warhawks': 'louisiana-monroe-warhawks',
    'ul lafayette': 'louisiana-lafayette',
    'southern miss': 'southern-mississippi',
    'usf': 'south-florida',
    'south florida': 'south-florida',
    'usc': 'southern-california',
    'southern california': 'southern-california',
    'uva': 'virginia',
    'bc': 'boston-college',
    'boston college': 'boston-college',
    'unc': 'north-carolina',
    'north carolina': 'north-carolina',
    'ole miss': 'mississippi',
    'mississippi': 'mississippi',
    'byu': 'brigham-young',
    'brigham young': 'brigham-young',
    'army black knights': 'army',
    'army': 'army',
    'navy midshipmen': 'navy',
    'navy': 'navy',
    'air force falcons': 'air-force',
    'air force': 'air-force'
  };

  const lowerName = teamName.toLowerCase();

  // Remove rankings (e.g., "#5 Georgia" -> "Georgia")
  const withoutRank = lowerName.replace(/^#\d+\s+/, '');

  if (specialCases[withoutRank]) {
    return specialCases[withoutRank];
  }

  // Convert team names to streaming format with proper special character handling
  return withoutRank.toLowerCase()
    // First, convert special characters to ASCII equivalents (matching API format)
    .replace(/á/g, 'a')
    .replace(/é/g, 'e')
    .replace(/í/g, 'i')
    .replace(/ó/g, 'o')
    .replace(/ú/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/ç/g, 'c')
    .replace(/ß/g, 'ss')
    // Handle accented characters that become multiple characters
    .replace(/ë/g, 'e')
    .replace(/ï/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ä/g, 'a')
    .replace(/å/g, 'a')
    .replace(/ø/g, 'o')
    // Convert spaces to hyphens
    .replace(/\s+/g, '-')
    // Remove any remaining non-alphanumeric characters except hyphens
    .replace(/[^a-z0-9\-]/g, '')
    // Clean up multiple hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Remove common prefixes/suffixes (be more conservative)
    .replace(/^afc-/, '')  // Remove "AFC " prefix
    .replace(/-afc$/, '')  // Remove " AFC" suffix
    // Keep "FC " prefix as it's often part of the official name
}

// Global variables for stream functionality
let currentStreamType = 'alpha1'; // Track which stream type is active ('alpha1', 'alpha2', 'bravo')
let currentAwayTeam = ''; // Store current away team name
let currentHomeTeam = ''; // Store current home team name
let isMuted = true; // Start muted to prevent autoplay issues
let availableStreams = {}; // Store available streams from API
let streamInitialized = false; // Flag to prevent unnecessary stream re-renders

// API functions for streamed.pk
const STREAM_API_BASE = 'https://streamed.pk/api';

// Cache for API responses to reduce data transfer
let liveMatchesCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30000; // 30 seconds cache

// Function to clear cache (useful for debugging or forcing fresh data)
function clearStreamCache() {
  liveMatchesCache = null;
  cacheTimestamp = 0;
  console.log('Stream cache cleared');
}

// Make cache clearing function available globally
window.clearStreamCache = clearStreamCache;

async function fetchLiveMatches() {
  try {
    // Check cache first
    const now = Date.now();
    if (liveMatchesCache && (now - cacheTimestamp) < CACHE_DURATION) {
      console.log('Using cached live matches data');
      return liveMatchesCache;
    }

    console.log(`Fetching live matches from API...`);
    const response = await fetch(`${STREAM_API_BASE}/matches/live`);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const allMatches = await response.json();
    console.log(`Found ${allMatches.length} total live matches`);

    // Debug: Check what sport values are in the API response
    if (allMatches.length > 0) {
      const uniqueSports = [...new Set(allMatches.map(match => match.sport || match.category).filter(sport => sport))];
      console.log('Available sports in API:', uniqueSports);

      // Show sample of matches with their sport values
      console.log('Sample matches with sport values:');
      for (let i = 0; i < Math.min(5, allMatches.length); i++) {
        const match = allMatches[i];
        const sportValue = match.sport || match.category || 'unknown';
        console.log(`  ${i+1}. "${match.title}" - Sport: "${sportValue}"`);
      }
    }

    // Filter matches by multiple sports for NCAAF (american-football and afl)
    const relevantSports = ['american-football', 'afl'];
    const matches = allMatches.filter(match => {
      const matchSport = match.sport || match.category;
      return relevantSports.includes(matchSport);
    });
    console.log(`Filtered to ${matches.length} NCAAF matches (${relevantSports.join(' or ')})`);

    // Cache the response
    liveMatchesCache = matches;
    cacheTimestamp = now;

    return matches;
  } catch (error) {
    console.error('Error fetching live matches:', error);
    return [];
  }
}

async function fetchStreamsForSource(source, sourceId) {
  try {
    console.log(`Fetching streams for ${source}/${sourceId}...`);
    const response = await fetch(`${STREAM_API_BASE}/stream/${source}/${sourceId}`);

    if (!response.ok) {
      throw new Error(`Stream API request failed: ${response.status}`);
    }

    const streams = await response.json();
    console.log(`Found ${streams.length} streams for ${source}`);
    return streams;
  } catch (error) {
    console.error(`Error fetching streams for ${source}/${sourceId}:`, error);
    return [];
  }
}

async function findMatchStreams(homeTeamName, awayTeamName) {
  try {
    console.log(`Looking for streams: ${homeTeamName} vs ${awayTeamName}`);

    // Fetch live matches for NCAAF (american-football and afl)
    const matches = await fetchLiveMatches();

    // Debug: Check if we got any matches and what they look like
    console.log(`After filtering: Got ${matches.length} NCAAF matches`);
    if (matches.length === 0) {
      console.log('No NCAAF matches found! This could be due to:');
      console.log('1. API sport field name changed');
      console.log('2. No american-football or afl matches currently live');
    } else {
      console.log('Sample filtered matches:');
      for (let i = 0; i < Math.min(3, matches.length); i++) {
        const match = matches[i];
        const sportValue = match.sport || match.category || 'unknown';
        console.log(`  ${i+1}. "${match.title}" - Sport: "${sportValue}"`);
      }
    }

    // Try to find our match
    const homeNormalized = normalizeTeamName(homeTeamName).toLowerCase();
    const awayNormalized = normalizeTeamName(awayTeamName).toLowerCase();

    console.log(`Normalized names: ${homeNormalized} vs ${awayNormalized}`);

    // Check if both teams have the same first word (city name) - this causes confusion
    const homeFirstWord = homeNormalized.split('-')[0];
    const awayFirstWord = awayNormalized.split('-')[0];
    const hasSameCity = homeFirstWord === awayFirstWord;

    console.log(`Team analysis: Home first word: "${homeFirstWord}", Away first word: "${awayFirstWord}", Same city: ${hasSameCity}`);

    let bestMatch = null;
    let bestScore = 0;

    // Quick pre-filter to reduce processing - look for obvious matches first
    const quickMatches = matches.slice(0, Math.min(matches.length, 100)).filter(match => {
      const title = match.title.toLowerCase();

      if (hasSameCity) {
        // If teams have same city, require BOTH full team names to be present
        const hasHomeTeam = title.includes(homeNormalized) ||
                           (match.teams?.home?.name?.toLowerCase().includes(homeNormalized));
        const hasAwayTeam = title.includes(awayNormalized) ||
                           (match.teams?.away?.name?.toLowerCase().includes(awayNormalized));
        return hasHomeTeam && hasAwayTeam;
      } else {
        // Normal case: require BOTH teams to have some match, not just one
        // For multi-part names, require at least two parts to match to avoid false positives
        const homeParts = homeNormalized.split('-').filter(p => p.length > 0);
        const awayParts = awayNormalized.split('-').filter(p => p.length > 0);
        
        let homeHasMatch = false;
        if (homeParts.length >= 2) {
          homeHasMatch = (title.includes(homeParts[0]) && title.includes(homeParts[1])) ||
                        title.includes(homeNormalized) ||
                        (match.teams?.home?.name?.toLowerCase().includes(homeNormalized));
        } else {
          homeHasMatch = title.includes(homeNormalized) ||
                        (match.teams?.home?.name?.toLowerCase().includes(homeNormalized));
        }
        
        let awayHasMatch = false;
        if (awayParts.length >= 2) {
          awayHasMatch = (title.includes(awayParts[0]) && title.includes(awayParts[1])) ||
                        title.includes(awayNormalized) ||
                        (match.teams?.away?.name?.toLowerCase().includes(awayNormalized));
        } else {
          awayHasMatch = title.includes(awayNormalized) ||
                        (match.teams?.away?.name?.toLowerCase().includes(awayNormalized));
        }

        // Require BOTH teams to match, not just one
        return homeHasMatch && awayHasMatch;
      }
    });

    // If we found quick matches, prioritize them
    const matchesToProcess = quickMatches.length > 0 ? quickMatches : matches.slice(0, Math.min(matches.length, 100));

    console.log(`Processing ${matchesToProcess.length} matches (${quickMatches.length > 0 ? 'pre-filtered' : 'full set'})`);

    // Debug: Show first few matches to understand API format (limited)
    if (matches.length > 0) {
      console.log('Sample matches from API:');
      for (let i = 0; i < Math.min(5, matches.length); i++) {
        const match = matches[i];
        console.log(`  ${i+1}. Title: "${match.title}"`);
        if (match.teams) {
          console.log(`     Home: ${match.teams.home?.name}, Away: ${match.teams.away?.name}`);
        }
        if (match.sources) {
          console.log(`     Sources: ${match.sources.map(s => s.source).join(', ')}`);
        }
      }
    }

    // Process the filtered matches
    for (let i = 0; i < matchesToProcess.length; i++) {
      const match = matchesToProcess[i];

      if (!match.sources || match.sources.length === 0) continue;

      const matchTitle = match.title.toLowerCase();
      let totalScore = 0;

      // Multiple matching strategies with rough/fuzzy matching
      const strategies = [
        // Strategy 0: Special handling for ranked games (e.g., "6 Notre Dame vs 10 Miami")
        () => {
          let score = 0;
          
          // Check for ranked game format: "#rank TeamName vs #rank TeamName"
          const rankedGamePattern = /(\d+\s+)?([a-z\s]+?)\s+vs\s+(\d+\s+)?([a-z\s]+)/i;
          const rankedMatch = matchTitle.match(rankedGamePattern);
          
          if (rankedMatch) {
            const team1 = rankedMatch[2].trim().replace(/\s+/g, '-').toLowerCase();
            const team2 = rankedMatch[4].trim().replace(/\s+/g, '-').toLowerCase();
            
            console.log(`Ranked game pattern found: "${team1}" vs "${team2}"`);
            console.log(`Looking for: "${homeNormalized}" vs "${awayNormalized}"`);
            
            // More flexible matching for team names
            const homeKeywords = homeNormalized.split('-').filter(word => word.length > 3);
            const awayKeywords = awayNormalized.split('-').filter(word => word.length > 3);
            
            let homeMatches = false;
            let awayMatches = false;
            
            // Check if home team matches either API team
            homeKeywords.forEach(keyword => {
              if (team1.includes(keyword) || team2.includes(keyword) || 
                  keyword.includes(team1) || keyword.includes(team2)) {
                homeMatches = true;
              }
            });
            
            // Check if away team matches either API team  
            awayKeywords.forEach(keyword => {
              if (team1.includes(keyword) || team2.includes(keyword) || 
                  keyword.includes(team1) || keyword.includes(team2)) {
                awayMatches = true;
              }
            });
            
            // Special handling for common team name variations
            const homeFirst = homeKeywords[0] || '';
            const awayFirst = awayKeywords[0] || '';
            
            // Notre Dame special case
            if ((homeFirst === 'notre' && (team1.includes('notre') || team2.includes('notre'))) ||
                (awayFirst === 'notre' && (team1.includes('notre') || team2.includes('notre')))) {
              if (homeFirst === 'notre') homeMatches = true;
              if (awayFirst === 'notre') awayMatches = true;
            }
            
            // Miami special case  
            if ((homeFirst === 'miami' && (team1.includes('miami') || team2.includes('miami'))) ||
                (awayFirst === 'miami' && (team1.includes('miami') || team2.includes('miami')))) {
              if (homeFirst === 'miami') homeMatches = true;
              if (awayFirst === 'miami') awayMatches = true;
            }
            
            if (homeMatches && awayMatches) {
              score += 3.0; // Very high score for ranked games that match both teams
              console.log(`✓ Found ranked game match: "${matchTitle}" with teams "${team1}" and "${team2}"`);
            } else {
              console.log(`✗ Ranked game doesn't match: home=${homeMatches}, away=${awayMatches}`);
            }
          }
          
          return score;
        },
        // Strategy 1: Rough name matching in title (more flexible)
        () => {
          let score = 0;
          const titleWords = matchTitle.split(/[\s\-]+/);

          if (hasSameCity) {
            // For same-city teams, require both full team names to be present
            if (matchTitle.includes(homeNormalized) && matchTitle.includes(awayNormalized)) {
              score += 1.0; // High score for exact matches
            } else {
              // Check for partial matches but be more strict
              const homeParts = homeNormalized.split('-').filter(word => word.length > 2);
              const awayParts = awayNormalized.split('-').filter(word => word.length > 2);

              let homeMatches = 0;
              let awayMatches = 0;

              homeParts.forEach(part => {
                if (titleWords.some(word => word.includes(part))) homeMatches++;
              });
              awayParts.forEach(part => {
                if (titleWords.some(word => word.includes(part))) awayMatches++;
              });

              // Require at least 2 parts to match for each team when they have same city
              if (homeMatches >= 2 && awayMatches >= 2) {
                score += 0.8;
              } else if (homeMatches >= 1 && awayMatches >= 1) {
                score += 0.4;
              }
            }
          } else {
            // Normal case: check if major parts of team names appear in title
            const homeParts = homeNormalized.split('-').filter(word => word.length > 2);
            const awayParts = awayNormalized.split('-').filter(word => word.length > 2);

            let homePartMatches = 0;
            let awayPartMatches = 0;

            homeParts.forEach(part => {
              // Use more precise matching - require exact word matches or very close matches
              const hasMatch = titleWords.some(word => {
                // Exact match
                if (word === part || part === word) return true;
                // Allow partial matching only for longer words (6+ chars) to avoid false positives
                if (part.length >= 6 && word.length >= 6) {
                  return word.includes(part) || part.includes(word);
                }
                return false;
              });
              if (hasMatch) {
                homePartMatches++;
                score += 0.5;
              }
            });
            
            awayParts.forEach(part => {
              // Use more precise matching - require exact word matches or very close matches
              const hasMatch = titleWords.some(word => {
                // Exact match
                if (word === part || part === word) return true;
                // Allow partial matching only for longer words (6+ chars) to avoid false positives
                if (part.length >= 6 && word.length >= 6) {
                  return word.includes(part) || part.includes(word);
                }
                return false;
              });
              if (hasMatch) {
                awayPartMatches++;
                score += 0.5;
              }
            });

            // Bonus for having both teams represented
            if (homePartMatches > 0 && awayPartMatches > 0) {
              score += 0.3;
            }

            // Penalty for matches that only have one team
            if (homePartMatches === 0 || awayPartMatches === 0) {
              score = 0; // Reset score if only one team matches
            }
          }

          return score;
        },
        // Strategy 2: Check team objects if available (rough matching)
        () => {
          let score = 0;
          if (match.teams) {
            const homeApiName = match.teams.home?.name?.toLowerCase() || '';
            const awayApiName = match.teams.away?.name?.toLowerCase() || '';

            if (hasSameCity) {
              // For same-city teams, require both API team names to match our normalized names
              if (homeApiName.includes(homeNormalized) && awayApiName.includes(awayNormalized)) {
                score += 1.2; // Very high score for exact API matches
              } else {
                // Check for partial matches but be more strict
                const homeParts = homeNormalized.split('-').filter(word => word.length > 2);
                const awayParts = awayNormalized.split('-').filter(word => word.length > 2);

                let homeMatches = 0;
                let awayMatches = 0;

                homeParts.forEach(part => {
                  if (homeApiName.includes(part)) homeMatches++;
                });
                awayParts.forEach(part => {
                  if (awayApiName.includes(part)) awayMatches++;
                });

                // Require at least 2 parts to match for each team when they have same city
                if (homeMatches >= 2 && awayMatches >= 2) {
                  score += 0.9;
                } else if (homeMatches >= 1 && awayMatches >= 1) {
                  score += 0.5;
                }
              }
            } else {
              // Normal case: more precise matching against API team names
              const homeParts = homeNormalized.split('-').filter(word => word.length > 2);
              const awayParts = awayNormalized.split('-').filter(word => word.length > 2);

              let homeApiMatches = 0;
              let awayApiMatches = 0;

              homeParts.forEach(part => {
                // More precise API name matching
                if (homeApiName === part || 
                    (part.length >= 4 && homeApiName.includes(part)) ||
                    (homeApiName.length >= 4 && part.includes(homeApiName))) {
                  homeApiMatches++;
                  score += 0.7;
                }
              });
              
              awayParts.forEach(part => {
                // More precise API name matching
                if (awayApiName === part || 
                    (part.length >= 4 && awayApiName.includes(part)) ||
                    (awayApiName.length >= 4 && part.includes(awayApiName))) {
                  awayApiMatches++;
                  score += 0.7;
                }
              });

              // Bonus for having both teams in API data
              if (homeApiMatches > 0 && awayApiMatches > 0) {
                score += 0.5;
              }

              // Penalty for matches that only have one team in API data
              if ((homeApiMatches === 0 && homeApiName.length > 0) || 
                  (awayApiMatches === 0 && awayApiName.length > 0)) {
                score *= 0.3; // Reduce score significantly for partial API matches
              }
            }
          }
          return score;
        },
        // Strategy 3: NCAAF-specific abbreviations and common names
        () => {
          const abbreviations = {
            'georgia': ['georgia', 'uga', 'bulldogs', 'georgia-bulldogs'],
            'alabama': ['alabama', 'bama', 'crimson-tide', 'alabama-crimson-tide'],
            'ohio': ['ohio', 'ohio-state', 'buckeyes', 'ohio-state-buckeyes'],
            'notre': ['notre-dame', 'irish', 'fighting-irish', 'notre-dame-fighting-irish'],
            'florida': ['florida', 'gators', 'florida-gators'],
            'texas': ['texas', 'longhorns', 'texas-longhorns'],
            'oklahoma': ['oklahoma', 'sooners', 'oklahoma-sooners'],
            'oregon': ['oregon', 'ducks', 'oregon-ducks'],
            'usc': ['usc', 'southern-california', 'trojans', 'usc-trojans'],
            'penn': ['penn-state', 'nittany-lions', 'penn-state-nittany-lions'],
            'michigan': ['michigan', 'wolverines', 'michigan-wolverines'],
            'lsu': ['lsu', 'tigers', 'lsu-tigers'],
            'auburn': ['auburn', 'tigers', 'auburn-tigers'],
            'clemson': ['clemson', 'tigers', 'clemson-tigers'],
            'tennessee': ['tennessee', 'volunteers', 'tennessee-volunteers'],
            'florida-state': ['florida-state', 'seminoles', 'florida-state-seminoles'],
            'north-carolina': ['north-carolina', 'tar-heels', 'north-carolina-tar-heels'],
            'virginia-tech': ['virginia-tech', 'hokies', 'virginia-tech-hokies'],
            'pittsburgh': ['pittsburgh', 'panthers', 'pittsburgh-panthers'],
            'northwestern': ['northwestern', 'wildcats', 'northwestern-wildcats'],
            'wisconsin': ['wisconsin', 'badgers', 'wisconsin-badgers'],
            'minnesota': ['minnesota', 'golden-gophers', 'minnesota-golden-gophers'],
            'iowa': ['iowa', 'hawkeyes', 'iowa-hawkeyes'],
            'illinois': ['illinois', 'fighting-illini', 'illinois-fighting-illini'],
            'indiana': ['indiana', 'hoosiers', 'indiana-hoosiers'],
            'maryland': ['maryland', 'terrapins', 'maryland-terrapins'],
            'rutgers': ['rutgers', 'scarlet-knights', 'rutgers-scarlet-knights'],
            'michigan-state': ['michigan-state', 'spartans', 'michigan-state-spartans'],
            'nebraska': ['nebraska', 'cornhuskers', 'nebraska-cornhuskers'],
            'iowa-state': ['iowa-state', 'cyclones', 'iowa-state-cyclones'],
            'kansas-state': ['kansas-state', 'wildcats', 'kansas-state-wildcats'],
            'west-virginia': ['west-virginia', 'mountaineers', 'west-virginia-mountaineers'],
            'texas-tech': ['texas-tech', 'red-raiders', 'texas-tech-red-raiders'],
            'oklahoma-state': ['oklahoma-state', 'cowboys', 'oklahoma-state-cowboys'],
            'kansas': ['kansas', 'jayhawks', 'kansas-jayhawks'],
            'texas-am': ['texas-am', 'aggies', 'texas-am-aggies'],
            'mississippi-state': ['mississippi-state', 'bulldogs', 'mississippi-state-bulldogs'],
            'kentucky': ['kentucky', 'wildcats', 'kentucky-wildcats'],
            'south-carolina': ['south-carolina', 'gamecocks', 'south-carolina-gamecocks'],
            'vanderbilt': ['vanderbilt', 'commodores', 'vanderbilt-commodores'],
            'missouri': ['missouri', 'tigers', 'missouri-tigers'],
            'arkansas': ['arkansas', 'razorbacks', 'arkansas-razorbacks'],
            'ole-miss': ['ole-miss', 'mississippi', 'rebels', 'mississippi-rebels'],
            'tulane': ['tulane', 'green-wave', 'tulane-green-wave'],
            'temple': ['temple', 'owls', 'temple-owls'],
            'navy': ['navy', 'midshipmen', 'navy-midshipmen'],
            'army': ['army', 'black-knights', 'army-black-knights'],
            'air-force': ['air-force', 'falcons', 'air-force-falcons']
          };

          let score = 0;
          const titleWords = matchTitle.split(/[\s\-]+/);

          // Check home team abbreviations
          const homeParts = homeNormalized.split('-');
          homeParts.forEach(part => {
            if (abbreviations[part]) {
              abbreviations[part].forEach(abbr => {
                if (titleWords.some(word => word.includes(abbr) || abbr.includes(word))) score += 0.3;
              });
            }
          });

          // Check away team abbreviations
          const awayParts = awayNormalized.split('-');
          awayParts.forEach(part => {
            if (abbreviations[part]) {
              abbreviations[part].forEach(abbr => {
                if (titleWords.some(word => word.includes(abbr) || abbr.includes(word))) score += 0.3;
              });
            }
          });

          return score;
        }
      ];

      // Apply all strategies and sum scores
      strategies.forEach(strategy => {
        totalScore += strategy();
      });

      console.log(`Match "${match.title.substring(0, 50)}..." score: ${totalScore.toFixed(2)}`);

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestMatch = match;

        // Don't exit early - evaluate all matches to find the best one
        console.log(`New best match found with score ${bestScore}`);
      }
    }

    if (!bestMatch || bestScore < 0.1) {
      console.log(`No good matching live match found in API (best score: ${bestScore.toFixed(2)})`);
      console.log(`Searched for: ${homeNormalized} vs ${awayNormalized}`);
      console.log(`Processed: ${matchesToProcess.length} matches out of ${matches.length} total`);
      return {};
    }

    console.log(`Found matching match: ${bestMatch.title} (score: ${bestScore.toFixed(2)})`);

    // VALIDATION: Ensure the matched game actually contains both teams
    const matchedTitle = bestMatch.title.toLowerCase();
    const matchedHomeTeam = bestMatch.teams?.home?.name?.toLowerCase() || '';
    const matchedAwayTeam = bestMatch.teams?.away?.name?.toLowerCase() || '';

    // Check if both teams appear in the title (using flexible word matching like relevance check)
    const homeWords = homeNormalized.split('-').filter(word => word.length > 2);
    const awayWords = awayNormalized.split('-').filter(word => word.length > 2);

    let homeInTitle = false;
    let awayInTitle = false;

    // Check if significant words from each team appear in title or API team names
    homeWords.forEach(word => {
      if (matchedTitle.includes(word) || matchedHomeTeam.includes(word)) homeInTitle = true;
    });
    awayWords.forEach(word => {
      if (matchedTitle.includes(word) || matchedAwayTeam.includes(word)) awayInTitle = true;
    });

    if (!homeInTitle || !awayInTitle) {
      console.log(`WARNING: Matched game "${bestMatch.title}" doesn't contain both teams!`);
      console.log(`Expected: ${homeNormalized} vs ${awayNormalized}`);
      console.log(`Found in title: Home=${homeInTitle}, Away=${awayInTitle}`);
      console.log(`API teams: Home="${matchedHomeTeam}", Away="${matchedAwayTeam}"`);

      // If this is a same-city scenario and validation fails, reject the match
      if (hasSameCity) {
        console.log('Rejecting match due to same-city validation failure');
        return {};
      }
      
      // For matches that fail validation with a high score, it's likely a false positive
      console.log('Match failed validation - rejecting as potential false positive');
      return {};
    } else {
      console.log(`✓ Validation passed: Matched game contains both teams`);
    }

    // Fetch streams for each source
    const streams = {};

    for (const source of bestMatch.sources) {
      const sourceStreams = await fetchStreamsForSource(source.source, source.id);

      // Store the first stream for each source (usually the best quality)
      if (sourceStreams.length > 0) {
        streams[source.source] = sourceStreams[0];
        console.log(`Got stream for ${source.source}: ${sourceStreams[0].embedUrl}`);
      }
    }

    return streams;
  } catch (error) {
    console.error('Error finding match streams:', error);
    return {};
  }
}

// Enhanced video control functions matching the iframe pattern
window.toggleMute = function() {
  const iframe = document.getElementById('streamIframe');
  const muteButton = document.getElementById('muteButton');

  if (!iframe || !muteButton) return;

  // Toggle muted state
  isMuted = !isMuted;
  muteButton.textContent = isMuted ? '🔊 Unmute' : '🔇 Mute';

  // Multiple approaches to control video muting
  try {
    // Method 1: Direct iframe manipulation
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    if (iframeDoc) {
      const videos = iframeDoc.querySelectorAll('video');
      videos.forEach(video => {
        video.muted = isMuted;
        // Also try to control volume
        video.volume = isMuted ? 0 : 1;
      });

      console.log(isMuted ? 'Video muted via direct access' : 'Video unmuted via direct access');
    }
  } catch (e) {
    console.log('Direct video access blocked by CORS');
  }

  // Method 2: Enhanced PostMessage to iframe
  try {
    iframe.contentWindow.postMessage({
      action: 'toggleMute',
      muted: isMuted,
      volume: isMuted ? 0 : 1
    }, '*');

    // Also send autoplay and mute parameters
    iframe.contentWindow.postMessage({
      action: 'setVideoParams',
      autoplay: 1,
      mute: isMuted ? 1 : 0
    }, '*');

    console.log(isMuted ? 'Mute message sent to iframe' : 'Unmute message sent to iframe');
  } catch (e) {
    console.log('PostMessage failed');
  }

  // Method 3: Simulate key events
  try {
    const keyEvent = new KeyboardEvent('keydown', { key: 'm', code: 'KeyM' });
    iframe.contentWindow.dispatchEvent(keyEvent);
    console.log('Mute key event sent to iframe');
  } catch (e) {
    console.log('Key event failed');
  }

  // Method 4: Try to modify iframe src with mute parameter
  if (iframe.src && !iframe.src.includes('mute=')) {
    const separator = iframe.src.includes('?') ? '&' : '?';
    const newSrc = `${iframe.src}${separator}mute=${isMuted ? 1 : 0}&autoplay=1`;
    // Don't reload unless necessary
    if (iframe.src !== newSrc) {
      iframe.src = newSrc;
      console.log('Updated iframe src with mute parameter');
    }
  }
};

window.switchToStream = function(streamType) {
  console.log('Switching to stream type:', streamType);
  console.log('Current team names:', currentAwayTeam, currentHomeTeam);

  // Update current stream type
  currentStreamType = streamType;

  // If team names are not available, try to get them from other sources
  if (!currentAwayTeam || !currentHomeTeam) {
    console.log('Team names not available, attempting to retrieve them...');

    // Try to get team names from the current game data by looking at the scoreboard
    const awayTeamElement = document.querySelector('.team-name');
    const homeTeamElement = document.querySelectorAll('.team-name')[1];

    if (awayTeamElement) {
      currentAwayTeam = awayTeamElement.textContent?.trim() || 'away';
    }

    if (homeTeamElement) {
      currentHomeTeam = homeTeamElement.textContent?.trim() || 'home';
    }

    console.log('Retrieved team names:', currentAwayTeam, currentHomeTeam);
  }

  // Generate new embed URL using renderStreamEmbed to avoid browser history
  if (currentAwayTeam && currentHomeTeam) {
    streamInitialized = false; // Reset flag to allow stream switching
    
    // Handle the async renderStreamEmbed function properly
    renderStreamEmbed(currentAwayTeam, currentHomeTeam)
      .then(streamHTML => {
        const streamContainer = document.getElementById('streamEmbed');
        if (streamContainer && streamHTML) {
          streamContainer.innerHTML = streamHTML;
          streamInitialized = true;
          console.log('NCAAF switchToStream: Updated stream container with new HTML');
        } else {
          console.error('NCAAF switchToStream: Stream container not found or no HTML returned');
        }
      })
      .catch(error => {
        console.error('NCAAF Error switching stream:', error);
      });
    
    streamInitialized = true; // Set flag after successful switch
  } else {
    console.error('Team names still not available for stream switch');
    alert('Unable to switch stream: team names not available. Please refresh the page and try again.');
  }
};

// Helper function to update button texts based on current stream type
function updateStreamButtons(currentType) {
  // This function is now handled by the dynamic button generation in renderStreamEmbed
  // No longer needed since buttons are regenerated each time
  console.log(`Stream buttons updated for current type: ${currentType}`);
}

// Make helper function available globally
window.updateStreamButtons = updateStreamButtons;

// Stream functionality using embedsports.top embed service

// Debug function to test streaming embed URLs
function debugStreamExtraction(homeTeamName, awayTeamName, streamType = 'alpha1') {
  console.log('=== STREAM DEBUGGING START ===');
  console.log(`Testing embed URLs for: ${homeTeamName} vs ${awayTeamName}, type: ${streamType}`);

  const homeNormalized = normalizeTeamName(homeTeamName);
  const awayNormalized = normalizeTeamName(awayTeamName);

  console.log(`Normalized names: ${homeNormalized} vs ${awayNormalized}`);

  let embedUrl = '';
  if (streamType === 'alpha1') {
    embedUrl = `https://embedsports.top/embed/alpha/${awayNormalized}-vs-${homeNormalized}/1`;
  } else if (streamType === 'alpha2') {
    embedUrl = `https://embedsports.top/embed/alpha/${awayNormalized}-vs-${homeNormalized}/2`;
  } else if (streamType === 'bravo') {
    const timestamp = Date.now();
    embedUrl = `https://embedsports.top/embed/bravo/${timestamp}-${awayNormalized}-${homeNormalized}-english-/1`;
  }

  console.log('Generated embed URL:', embedUrl);
  console.log('Expected iframe HTML:');
  console.log(`<iframe title="${homeTeamName} vs ${awayTeamName} Player" marginheight="0" marginwidth="0" src="${embedUrl}" scrolling="no" allowfullscreen="yes" allow="encrypted-media; picture-in-picture;" width="100%" height="100%" frameborder="0"></iframe>`);

  console.log('=== STREAM DEBUGGING END ===');
}

// Make debug function available globally for console testing
window.debugStreamExtraction = debugStreamExtraction;

async function renderStreamEmbed(awayTeamName, homeTeamName) {
  console.log('renderStreamEmbed called with:', { awayTeamName, homeTeamName });
  
  const streamContainer = document.getElementById('streamEmbed');

  if (!streamContainer) {
    console.error('Stream container not found! Cannot render stream.');
    return;
  }

  console.log('Stream container found, proceeding with stream rendering...');

  // Store current team names for toggle function
  currentAwayTeam = awayTeamName;
  currentHomeTeam = homeTeamName;

  console.log('Storing team names in renderStreamEmbed:', awayTeamName, homeTeamName);
  console.log('Current stored names:', currentAwayTeam, currentHomeTeam);

  const isSmallScreen = window.innerWidth < 525;
  const screenHeight = isSmallScreen ? 250 : 700;

  // Try to fetch streams from API first
  console.log('Attempting to fetch streams from API...');
  availableStreams = await findMatchStreams(homeTeamName, awayTeamName);

  // Generate embed URL based on stream type and available streams
  let embedUrl = '';

  // Try to use the exact requested stream type first
  if (availableStreams.alpha && currentStreamType === 'alpha1') {
    embedUrl = availableStreams.alpha.embedUrl;
  } else if (availableStreams.alpha && currentStreamType === 'alpha2') {
    // For alpha2, modify the API URL to use /2 instead of /1
    embedUrl = availableStreams.alpha.embedUrl.replace(/\/1$/, '/2');
  } else if (availableStreams.bravo && currentStreamType === 'bravo') {
    embedUrl = availableStreams.bravo.embedUrl;
  } else if (availableStreams.echo && currentStreamType === 'echo') {
    embedUrl = availableStreams.echo.embedUrl;
  } else if (availableStreams.intel && currentStreamType === 'intel') {
    embedUrl = availableStreams.intel.embedUrl;
  }

  // If requested stream type not available, use the first available stream
  if (!embedUrl && Object.keys(availableStreams).length > 0) {
    const firstStreamKey = Object.keys(availableStreams)[0];
    embedUrl = availableStreams[firstStreamKey].embedUrl;
    console.log(`Requested stream type '${currentStreamType}' not available, using first available stream: ${firstStreamKey}`);
    // Update current stream type to the one we're actually using
    currentStreamType = firstStreamKey;
  }

  // Fallback to manual URL construction if API doesn't have any streams
  if (!embedUrl) {
    console.log('API streams not available, falling back to manual URL construction');
    const homeNormalized = normalizeTeamName(homeTeamName);
    const awayNormalized = normalizeTeamName(awayTeamName);

    if (currentStreamType === 'alpha1') {
      embedUrl = `https://embedsports.top/embed/alpha/${awayNormalized}-vs-${homeNormalized}/1`;
    } else if (currentStreamType === 'alpha2') {
      embedUrl = `https://embedsports.top/embed/alpha/${awayNormalized}-vs-${homeNormalized}/2`;
    } else if (currentStreamType === 'bravo') {
      const timestamp = Date.now();
      embedUrl = `https://embedsports.top/embed/bravo/${timestamp}-${awayNormalized}-${homeNormalized}-english-/1`;
    } else if (currentStreamType === 'echo') {
      embedUrl = `https://embedsports.top/embed/echo/${awayNormalized}-vs-${homeNormalized}/1`;
    } else if (currentStreamType === 'intel') {
      embedUrl = `https://embedsports.top/embed/intel/${awayNormalized}-vs-${homeNormalized}/1`;
    } else {
      // Default fallback to alpha1 if unknown stream type
      embedUrl = `https://embedsports.top/embed/alpha/${awayNormalized}-vs-${homeNormalized}/1`;
    }
  }

  console.log('Generated embed URL:', embedUrl);

  // Determine which buttons to show based on current stream type and available streams
  // Generate dynamic stream buttons based on available streams
  const streamTypes = Object.keys(availableStreams);
  let streamButtons = '';
  
  // Add predefined buttons for common stream types
  const allPossibleStreams = ['alpha1', 'alpha2', 'bravo', 'echo', 'intel'];
  
  allPossibleStreams.forEach(streamType => {
    if (streamType === currentStreamType) return; // Don't show button for current stream
    
    const streamName = streamType === 'alpha1' ? 'Alpha 1' : 
                      streamType === 'alpha2' ? 'Alpha 2' : 
                      streamType.charAt(0).toUpperCase() + streamType.slice(1);
    
    let isAvailable = false;
    let buttonAction = '';
    
    if (streamType === 'alpha1' || streamType === 'alpha2') {
      isAvailable = availableStreams.alpha;
    } else {
      isAvailable = availableStreams[streamType];
    }
    
    const buttonText = isAvailable ? `Stream ${streamName}` : `Try ${streamName}`;
    buttonAction = `switchToStream('${streamType}')`;
    
    streamButtons += `<button onclick="${buttonAction}" style="padding: 8px 16px; margin: 0 5px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">${buttonText}</button>`;
  });

  const streamHTML = `
    <div style="background: #1a1a1a; border-radius: 1rem; padding: 1rem; margin-bottom: 2rem;">
      <div class="stream-header" style="margin-bottom: 10px; text-align: center;">
        <h3 style="color: white; margin: 0;">Live Stream (${currentStreamType.toUpperCase()})</h3>
        <div class="stream-controls" style="margin-top: 10px;">
          <button id="fullscreenButton" onclick="toggleFullscreen()" style="padding: 8px 16px; margin: 0 5px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">⛶ Fullscreen</button>
          ${streamButtons}
        </div>
      </div>
      <div id="streamConnecting" style="display: block; color: white; padding: 20px; background: #333; margin-bottom: 10px; border-radius: 8px; text-align: center;">
        <p>Loading stream... <span id="streamStatus"></span></p>
      </div>
      <div class="stream-iframe-container" style="position: relative; width: 100%; margin: 0 auto; overflow: hidden; isolation: isolate;">
        <iframe
          id="streamIframe"
          src="${embedUrl}"
          width="100%"
          height="${screenHeight}"
          style="aspect-ratio: 16/9; background: #000; display: none; border-radius: 8px; isolation: isolate; will-change: auto; backface-visibility: hidden; transform: translateZ(0);"
          frameborder="0"
          allowfullscreen
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          referrerpolicy="no-referrer-when-downgrade"
          onload="handleStreamLoad()"
          onerror="handleStreamError()"
          title="${homeTeamName} vs ${awayTeamName} Player">
        </iframe>
      </div>
    </div>
  `;

  // Show the iframe after a delay
  setTimeout(() => {
    const iframe = document.getElementById('streamIframe');
    const connectingDiv = document.getElementById('streamConnecting');
    if (iframe) {
      iframe.style.display = 'block';
    }
    if (connectingDiv) {
      connectingDiv.style.display = 'none';
    }
  }, 1000);

  // Return the HTML content
  console.log('NCAAF renderStreamEmbed returning HTML content (length:', streamHTML.length, ')');
  return streamHTML;
}

// Stream control functions (adapted from CWC/MLB)
window.toggleFullscreen = function() {
  const iframe = document.getElementById('streamIframe');

  if (iframe) {
    try {
      // For iOS Safari and other WebKit browsers
      if (iframe.webkitEnterFullscreen) {
        iframe.webkitEnterFullscreen();
        console.log('iOS/WebKit fullscreen requested');
      }
      // Standard fullscreen API
      else if (iframe.requestFullscreen) {
        iframe.requestFullscreen();
        console.log('Standard fullscreen requested');
      }
      // Chrome/Safari prefixed version
      else if (iframe.webkitRequestFullscreen) {
        iframe.webkitRequestFullscreen();
        console.log('WebKit fullscreen requested');
      }
      // IE/Edge prefixed version
      else if (iframe.msRequestFullscreen) {
        iframe.msRequestFullscreen();
        console.log('MS fullscreen requested');
      }
      // Mozilla prefixed version
      else if (iframe.mozRequestFullScreen) {
        iframe.mozRequestFullScreen();
        console.log('Mozilla fullscreen requested');
      }
      else {
        console.log('Fullscreen API not supported on this device');
        // Fallback: try to make the iframe larger on unsupported devices
        if (iframe.style.position !== 'fixed') {
          iframe.style.position = 'fixed';
          iframe.style.top = '0';
          iframe.style.left = '0';
          iframe.style.width = '100vw';
          iframe.style.height = '100vh';
          iframe.style.zIndex = '9999';
          iframe.style.backgroundColor = '#000';
          console.log('Applied fullscreen-like styling as fallback');
        } else {
          // Exit fullscreen-like mode
          iframe.style.position = '';
          iframe.style.top = '';
          iframe.style.left = '';
          iframe.style.width = '100%';
          iframe.style.height = '400px';
          iframe.style.zIndex = '';
          iframe.style.backgroundColor = '';
          console.log('Exited fullscreen-like styling');
        }
      }
    } catch (e) {
      console.log('Fullscreen request failed:', e);
      // Additional fallback for cases where even the API calls fail
      alert('Fullscreen not supported on this device. Try rotating your device to landscape mode for a better viewing experience.');
    }
  }
};

window.handleStreamLoad = function() {
  const iframe = document.getElementById('streamIframe');
  const connectingDiv = document.getElementById('streamConnecting');

  if (iframe && connectingDiv) {
    console.log('Stream loaded successfully');
    iframe.style.display = 'block';
    connectingDiv.style.display = 'none';
  }
};

window.handleStreamError = function() {
  console.log('Stream error occurred');
  const connectingDiv = document.getElementById('streamConnecting');
  if (connectingDiv) {
    connectingDiv.innerHTML = '<p>Stream temporarily unavailable. Retrying...</p>';
    // Auto-retry after a delay
    setTimeout(() => {
      const iframe = document.getElementById('streamIframe');
      if (iframe) {
        iframe.src = iframe.src; // Reload the iframe
      }
    }, 3000);
  }
};

function getAdjustedDateForNCAA() {
  const now = new Date();
  // For college football, games typically start in the afternoon/evening
  // Adjust cutoff to 6 AM EST to handle late night games
  const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  
  if (estNow.getHours() < 6) {
    estNow.setDate(estNow.getDate() - 1);
  }
  
  const adjustedDate = estNow.getFullYear() +
                       String(estNow.getMonth() + 1).padStart(2, "0") +
                       String(estNow.getDate()).padStart(2, "0");
  return adjustedDate;
}

function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

// Function to render NCAA Football scoring card
function renderScoringCard(play, teamInfo, teamColor, homeScore, awayScore, teamSide, homeTeam, awayTeam, boxScoreData) {
  console.log('renderScoringCard called with play:', play);
  
  // Get game state information first
  const clock = play.clock?.displayValue || '';
  const period = play.period?.number || '';
  const scoringType = play.scoringType?.displayName || '';
  const playText = play.text || '';
  
  // Get scorer information from play participants or extract from play text
  let scorer = play.participants?.[0]?.athlete;
  let scorerName = 'Unknown Player';
  let scorerPosition = '';
  
  if (scorer) {
    scorerName = scorer.displayName || 'Unknown Player';
    scorerPosition = scorer.position?.abbreviation || '';
    console.log('Found scorer from participants:', scorerName, scorerPosition);
  } else {
    // Try to extract player name from play text for NCAA Football
    console.log('No participants found, trying to extract from text:', playText);
    console.log('Scoring type:', scoringType);
    
    // Enhanced NCAA Football scoring patterns - prioritize actual scorers over extra point kickers
    const patterns = [
      // Most specific patterns first for NCAA Football format
      // Pattern for "Player run for X yds for a TD" - like Elijah Gilliam example
      /([A-Z][A-Za-z'\-\s\.]+?)\s+run\s+for\s+\d+\s+yds?\s+for\s+a\s+TD/i,
      
      // Pattern for "Player pass complete to Receiver for X yds for a TD" - like Jalon Daniels example  
      /([A-Z][A-Za-z'\-\s\.]+?)\s+pass\s+complete\s+to\s+([A-Z][A-Za-z'\-\s\.]+?)\s+for\s+\d+\s+yds?\s+for\s+a\s+TD/i,
      
      // Additional NCAA-specific patterns
      // "Player rush for X yds for a TD"
      /([A-Z][A-Za-z'\-\s\.]+?)\s+rush\s+for\s+\d+\s+yds?\s+for\s+a\s+TD/i,
      
      // "Player X yd run TD" - shorter format
      /([A-Z][A-Za-z'\-\s\.]+?)\s+\d+\s+yd\s+run\s+TD/i,
      
      // "Player X yd TD run"
      /([A-Z][A-Za-z'\-\s\.]+?)\s+\d+\s+yd\s+TD\s+run/i,
      
      // Field goals first (most reliable)
      /([A-Z][A-Za-z'\-\s\.]+?)\s+\d+\s+yd\s+FG\s+GOOD/i,
      /([A-Z][A-Za-z'\-\s\.]+?)\s+\d+\s+yard\s+field\s+goal\s+is\s+GOOD/i,
      
      // More touchdown patterns
      // Direct pass completions with different wording
      /([A-Z][A-Za-z'\-\s\.]+)\s+pass\s+complete\s+to\s+([A-Z][A-Za-z'\-\s\.]+?)\s+for\s+\d+\s+yds?\s+for\s+a\s+TD/i,
      
      // Regular passing TDs: "pass to PLAYER for X yards, TOUCHDOWN"
      /pass\s+(?:deep\s+)?(?:right|left|middle)?\s*to\s+([A-Z][A-Za-z'\-\s\.]+?)\s+for\s+\d+\s+yards?,?\s+(?:TOUCHDOWN|TD)/i,
      
      // Rushing touchdowns with more context
      /([A-Z][A-Za-z'\-\s\.]+?)\s+(?:run|rush)\s+(?:up\s+the\s+middle|left\s+end|right\s+end|left\s+guard|right\s+guard|left\s+tackle|right\s+tackle)\s+for\s+\d+\s+yards?,?\s+(?:TOUCHDOWN|TD)/i,
      
      // Generic rushing: "PLAYER for X yards, TOUCHDOWN"
      /([A-Z][A-Za-z'\-\s\.]+?)\s+for\s+\d+\s+yards?,?\s+(?:TOUCHDOWN|TD)/i,
      
      // Short yardage patterns: "PLAYER 1 yd rush TD"
      /([A-Z][A-Za-z'\-\s\.]+?)\s+\d+\s+yds?\s+rush\s+TD/i,
      /([A-Z][A-Za-z'\-\s\.]+?)\s+\d+\s+yds?\s+TD/i
    ];
    
    // Special handling for extra points - only use kicker if this is specifically an extra point play
    if (scoringType && scoringType.toLowerCase().includes('extra point')) {
      const extraPointPattern = /([A-Z][A-Za-z'\-\s\.]+?)\s+extra\s+point\s+is\s+GOOD/i;
      const match = playText.match(extraPointPattern);
      if (match && match[1]) {
        scorerName = match[1].trim();
        scorerPosition = 'K';
        console.log('Extracted extra point kicker:', scorerName);
      }
    } else {
      // For touchdowns and field goals, use the main patterns
      for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];
        const match = playText.match(pattern);
        console.log(`Pattern ${i + 1}:`, pattern.source, '- Match:', match ? 'YES' : 'NO');
        
        if (match && match[1]) {
          console.log('Match groups:', match);
          
          // Special handling for different play patterns
          if (pattern.source.includes('pass\\s+complete\\s+to') && match[2]) {
            // For pass completions, we want the receiver (match[2]), not the QB (match[1])
            scorerName = match[2].trim();
            scorerPosition = 'WR'; // Receiving touchdown
            console.log('Extracted receiver from pass completion:', scorerName);
          } else if (pattern.source.includes('run\\s+for') || pattern.source.includes('rush\\s+for') || 
                     pattern.source.includes('yd\\s+run\\s+TD') || pattern.source.includes('yd\\s+TD\\s+run')) {
            // For rushing TDs
            scorerName = match[1].trim();
            scorerPosition = 'RB'; // Rushing touchdown
            console.log('Extracted rusher from run play:', scorerName);
          } else {
            scorerName = match[1].trim();
            console.log('Extracted scorer from text:', scorerName);
            
            // Try to determine position from play context
            if (playText.includes('pass') && playText.includes('to ' + scorerName)) {
              scorerPosition = 'WR'; // Receiving touchdown
            } else if (playText.includes(scorerName + ' right guard') || 
                       playText.includes(scorerName + ' left guard') ||
                       playText.includes(scorerName + ' run') || 
                       playText.includes(scorerName + ' rush') ||
                       playText.includes(scorerName + ' up the middle') ||
                       playText.includes(scorerName + ' left end') ||
                       playText.includes(scorerName + ' right end') ||
                       playText.includes(scorerName + ' left tackle') ||
                       playText.includes(scorerName + ' right tackle')) {
              scorerPosition = 'RB'; // Rushing touchdown
            } else if (playText.includes('field goal') || playText.includes('FG')) {
              scorerPosition = 'K'; // Kicker
            }
          }
          
          console.log('Inferred position:', scorerPosition);
          break;
        }
      }
    }
    
    // If still no scorer found, continue anyway for the card
    if (scorerName === 'Unknown Player') {
      console.log('Could not extract scorer, using team info');
    }
  }

  // Get team abbreviation and logo
  const scoringTeam = teamSide === 'home' ? homeTeam : awayTeam;
  const teamAbbr = scoringTeam?.team?.abbreviation || scoringTeam?.abbreviation || '';
  const teamId = scoringTeam?.team?.id || '';
  const teamLogo = convertToHttps(teamId === "349" ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${teamId}.png` : `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${teamId}.png`);

  // Determine scoring situation
  let scoringSituation = '';
  if (teamSide === 'home') {
    if (homeScore > awayScore) {
      scoringSituation = homeScore - awayScore === 1 ? 'Go-ahead Score' : 'Extends Lead';
    } else if (homeScore === awayScore) {
      scoringSituation = 'Ties Game';
    }
  } else {
    if (awayScore > homeScore) {
      scoringSituation = awayScore - homeScore === 1 ? 'Go-ahead Score' : 'Extends Lead';
    } else if (awayScore === homeScore) {
      scoringSituation = 'Ties Game';
    }
  }

  // Get position-specific stats
  const positionGroup = getPositionGroup(scorerPosition);
  console.log('Getting stats for:', { scorerName, scorerPosition, positionGroup });
  
  // For RBs, determine if this was a rushing or receiving touchdown to show appropriate stats
  let adjustedPositionGroup = positionGroup;
  let preferredStatCategory = null;
  
  if (positionGroup === 'RB') {
    // Check if this was a receiving touchdown (pass play)
    if (playText.includes('pass') && playText.includes('to ' + scorerName)) {
      adjustedPositionGroup = 'WR/TE'; // Show receiving stats for receiving TDs
      preferredStatCategory = 'receiving';
      console.log('RB receiving TD detected, showing receiving stats');
    } else {
      adjustedPositionGroup = 'RB_RUSHING'; // Show rushing-focused stats for rushing TDs
      preferredStatCategory = 'rushing';
      console.log('RB rushing TD detected, showing rushing stats');
    }
  }
  
  const playerStats = getPositionStatsForCard(adjustedPositionGroup, boxScoreData, scorerName, preferredStatCategory);
  console.log('Player stats retrieved:', playerStats);

  // Get team logos for score display
  const homeTeamLogo = convertToHttps(homeTeam?.team?.id === "349" ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${homeTeam?.team?.id}.png` : `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${homeTeam?.team?.id}.png`);
  const awayTeamLogo = convertToHttps(awayTeam?.team?.id === "349" ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${awayTeam?.team?.id}.png` : `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${awayTeam?.team?.id}.png`);

  const teamColorHex = teamColor.startsWith('#') ? teamColor : `#${teamColor}`;
  const scoringCardId = `scoring-card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  console.log('About to render scoring card with:', {
    scorerName,
    scorerPosition,
    teamAbbr,
    scoringType,
    playerStats: playerStats.length,
    teamColor,
    teamColorHex
  });

  return `
    <div id="${scoringCardId}" class="scoring-card" style="background: linear-gradient(135deg, ${teamColorHex}20 0%, ${teamColorHex}08 100%); border-left: 4px solid ${teamColorHex}; margin: 10px 0; padding: 20px; border-radius: 8px; color: white; position: relative;">
      <div class="copy-button" onclick="copyScoringCardAsImage('${scoringCardId}')" style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.6); border: none; border-radius: 50%; width: 30px; height: 30px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; z-index: 10;">
        📋
      </div>
      
      <div class="scoring-card-header" style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 15px; margin-right: 40px;">
        <div style="display: flex; align-items: center; flex: 1;">
          <img src="${teamLogo}" alt="${teamInfo?.displayName || 'Team'}" style="width: 40px; height: 40px; margin-right: 15px;">
          <div class="scoring-info">
            <div class="scoring-type" style="font-size: 14px; font-weight: bold; color: white; margin-bottom: 4px;">
              🏈 ${scoringType} ${scoringSituation ? `• ${scoringSituation}` : ''}
            </div>
            <div class="scoring-time" style="font-size: 12px; color: rgba(255,255,255,0.8);">
              Q${period} ${clock}
            </div>
          </div>
        </div>
      </div>
      
      <div class="scoring-card-body">
        <div class="scorer-info" style="margin-bottom: 15px;">
          <div class="scorer-name" style="font-size: 18px; font-weight: bold; color: white; margin-bottom: 7.5px;">
            ${scorerName} (${scorerPosition}) - ${teamAbbr}
          </div>
          <div class="play-description" style="font-size: 14px; color: #eee; margin-bottom: 10px;">
            ${playText}
          </div>
        </div>
        
        <div class="scoring-score-line" style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; margin-bottom: 15px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${homeTeamLogo}" alt="Home" style="width: 24px; height: 24px;">
            <span style="font-size: 16px; font-weight: bold; color: white;">${homeScore} - ${awayScore}</span>
            <img src="${awayTeamLogo}" alt="Away" style="width: 24px; height: 24px;">
          </div>
          <div style="background: ${teamColorHex}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">
            ${scoringType.toUpperCase()}
          </div>
        </div>
        
        ${playerStats.length > 0 ? `
          <div class="scorer-stats" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
            ${playerStats.map(stat => `
              <div style="text-align: center; background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px;">
                <div style="font-size: 16px; font-weight: bold; color: white;">${stat.value}</div>
                <div style="font-size: 12px; color: rgba(255,255,255,0.8);">${stat.label}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// Function to copy scoring card as image
async function copyScoringCardAsImage(cardId) {
  try {
    const element = document.getElementById(cardId);
    if (!element) {
      console.error('Scoring card element not found');
      return;
    }
    
    // Hide the copy button before taking screenshot
    const copyButton = element.querySelector('.copy-button');
    const originalDisplay = copyButton ? copyButton.style.display : null;
    if (copyButton) {
      copyButton.style.display = 'none';
    }
    
    showFeedback('Preparing image...', 'loading');
    await captureAndCopyImage(element);
    
    // Restore the copy button after screenshot
    if (copyButton) {
      copyButton.style.display = originalDisplay || 'flex';
    }
    
  } catch (error) {
    console.error('Error copying scoring card:', error);
    
    // Make sure to restore the copy button even if there's an error
    const element = document.getElementById(cardId);
    const copyButton = element?.querySelector('.copy-button');
    if (copyButton) {
      copyButton.style.display = 'flex';
    }
    
    showFeedback('Failed to copy scoring card', 'error');
  }
}

// Function to capture and copy element as image
async function captureAndCopyImage(element) {
  const { default: html2canvas } = await import('https://cdn.skypack.dev/html2canvas');
  
  const canvas = await html2canvas(element, {
    backgroundColor: '#1a1a1a',
    scale: 3,
    useCORS: true
  });
  
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      // Check if device is mobile
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                      ('ontouchstart' in window) || 
                      (navigator.maxTouchPoints > 0);

      try {
        if (isMobile) {
          // On mobile, download the image
          console.log('Mobile device detected, attempting download...');
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `scoring-card-${new Date().getTime()}.png`;
          link.style.display = 'none';
          
          // Add to DOM and trigger download
          document.body.appendChild(link);
          
          // Use a timeout to ensure the link is properly added to DOM
          setTimeout(() => {
            try {
              link.click();
              console.log('Download triggered successfully');
              showFeedback('Scoring card downloaded!', 'success');
              resolve();
            } catch (clickError) {
              console.error('Error triggering download:', clickError);
              
              // Fallback: try to open in new tab for mobile browsers
              try {
                console.log('Trying fallback: open in new tab');
                window.open(url, '_blank');
                showFeedback('Image opened in new tab', 'success');
                resolve();
              } catch (fallbackError) {
                console.error('Fallback also failed:', fallbackError);
                showFeedback('Download failed. Try again', 'error');
                reject(clickError);
              }
            } finally {
              // Clean up
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
            }
          }, 100);
        } else {
          // On desktop, try to copy to clipboard using modern API
          if (navigator.clipboard && window.ClipboardItem) {
            const clipboardItem = new ClipboardItem({
              'image/png': blob
            });
            await navigator.clipboard.write([clipboardItem]);
            showFeedback('Scoring card copied to clipboard!', 'success');
            resolve();
          } else {
            showFeedback('Could not copy to clipboard. Try again', 'error');
            reject(new Error('Clipboard API not available'));
          }
        }
      } catch (clipboardError) {
        console.error('Error handling image:', clipboardError);
        showFeedback('Could not copy to clipboard. Try again', 'error');
        reject(clipboardError);
      }
    }, 'image/png', 0.95);
  });
}

// Function to show feedback messages
function showFeedback(message, type) {
  const existingFeedback = document.getElementById('copyFeedback');
  if (existingFeedback) {
    existingFeedback.remove();
  }

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

  switch (type) {
    case 'success':
      feedback.style.backgroundColor = '#28a745';
      break;
    case 'error':
      feedback.style.backgroundColor = '#dc3545';
      break;
    case 'loading':
      feedback.style.backgroundColor = '#007bff';
      break;
    default:
      feedback.style.backgroundColor = '#6c757d';
  }

  feedback.textContent = message;
  document.body.appendChild(feedback);

  if (type !== 'loading') {
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.remove();
      }
    }, 3000);
  }
}

async function renderBoxScore(gameId, gameState) {
  try {
    const BOX_SCORE_API_URL = `https://cdn.espn.com/core/college-football/boxscore?xhr=1&gameId=${gameId}`;
    console.log("Fetching box score from:", BOX_SCORE_API_URL);
    const response = await fetch(convertToHttps(BOX_SCORE_API_URL));
    const data = await response.json();

    console.log("Box score data received:", data);

    const isSmallScreen = window.innerWidth <= 475;

    const players = data.gamepackageJSON?.boxscore?.players || [];
    console.log("Players data:", players);
    
    const boxScoreDiv = document.getElementById("boxScore");
    if (!boxScoreDiv) {
      console.error("Error: 'boxScore' element not found.");
      return;
    }

    // Check if we have valid player data
    if (players.length === 0) {
      boxScoreDiv.innerHTML = `<div style="color: white; text-align: center; padding: 20px;"></div>`;
      return;
    }

    const renderTeamRoster = (team) => {
      if (!team || !team.statistics || team.statistics.length === 0) {
        console.log("Team data structure:", team);
        console.error("Invalid team data for player stats rendering.");
        return `<div class="error-message"></div>`;
      }

      const teamName = team.team.shortDisplayName;
      const teamColor = `#${team.team.color}`;
      const teamLogo = convertToHttps(team.team.id === "349" ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.team.id}.png` : `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${team.team.id}.png`);

      // NCAA Football has different stat categories: passing, rushing, receiving, etc.
      let playersHtml = '';
      
      team.statistics.forEach(statCategory => {
        const categoryName = statCategory.name;
        const athletes = statCategory.athletes || [];
        
        // Skip fumbles category and empty categories
        if (athletes.length === 0) return;

        // Create header for this stat category
        const categoryLabels = statCategory.labels || [];
        const categoryDescriptions = statCategory.descriptions || [];
        
        // Handle mobile column filtering - hide specific defensive stats
        let displayLabels = categoryLabels;
        let labelIndices = categoryLabels.map((_, i) => i); // Track original indices
        
        if (isSmallScreen) {
          console.log('Mobile filtering - Category:', categoryName, 'Labels:', categoryLabels);
          
          // For defensive stats, filter out QB HUR/QH and TD columns
          if (categoryName.toLowerCase().includes('defensive') || 
              categoryName.toLowerCase().includes('defense') ||
              categoryLabels.some(label => ['SOLO', 'TOT', 'SACKS', 'TFL', 'QH', 'PD', 'INT'].includes(label))) {
            
            console.log('Detected defensive category, filtering mobile columns');
            
            // Filter out QB Hurries/Hits and TD for defensive stats on mobile
            // Check for various possible label formats
            const filteredData = categoryLabels.map((label, index) => ({ label, index }))
              .filter(item => {
                const labelUpper = item.label.toUpperCase();
                const shouldHide = ['QH', 'QB HUR', 'QB HURR', 'HURR', 'HURRIES', 'TD', 'TDS'].includes(labelUpper) ||
                                   labelUpper.includes('HURR') || 
                                   labelUpper.includes('QB') && labelUpper.includes('HUR');
                if (shouldHide) {
                  console.log('Hiding defensive stat on mobile:', item.label);
                }
                return !shouldHide;
              })
              .slice(0, 3); // Show first 3 remaining stats
            
            displayLabels = filteredData.map(item => item.label);
            labelIndices = filteredData.map(item => item.index);
            console.log('Mobile defensive stats after filtering:', displayLabels);
          } else {
            // For non-defensive stats, show first 3 as before
            displayLabels = categoryLabels.slice(0, 3);
            labelIndices = [0, 1, 2];
          }
        }
        
        playersHtml += `
          <div class="stat-category">
            <h4>${statCategory.text || categoryName.charAt(0).toUpperCase() + categoryName.slice(1)}</h4>
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  ${displayLabels.map(label => `<th>${label}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${athletes.map(playerData => {
                  const player = playerData.athlete;
                  const stats = playerData.stats || [];
                  const displayStats = isSmallScreen ? labelIndices.map(i => stats[i] || '0') : stats;
                  
                  return `
                    <tr>
                      <td>
                        ${isSmallScreen ? player.firstName?.charAt(0) + '. ' || '' : player.firstName || ''} ${player.lastName || player.displayName || 'Unknown'}
                        <span style="color: grey;"> #${player.jersey || 'N/A'}</span>
                      </td>
                      ${displayStats.map(stat => `<td>${stat || '0'}</td>`).join('')}
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      });

      return `
        <div class="team-box-score ${gameState === "Final" ? "final" : ""} responsive-team-box-score">
          <h3 style="background-color: ${teamColor}; display: flex; align-items: center; gap: 10px;">
            <img src="${teamLogo}" alt="${teamName}" style="width: 30px; height: 30px; border-radius: 50%;"> ${teamName}
          </h3>
          ${playersHtml}
        </div>
      `;
    };

    const team1 = players.find(team => team.displayOrder === 1);
    const team2 = players.find(team => team.displayOrder === 2);

    boxScoreDiv.innerHTML = `
      ${renderTeamRoster(team1)}
      ${renderTeamRoster(team2)}
    `;
  } catch (error) {
    console.error("Error fetching NCAA Football box score data:", error);
  }
}

// Global state tracking for UI preservation
let openDrives = new Set(); // Track which drives are open

async function renderPlayByPlay(gameId) {
  try {
    const PLAY_BY_PLAY_API_URL = `https://cdn.espn.com/core/college-football/playbyplay?xhr=1&gameId=${gameId}`;
    console.log("Fetching play-by-play from:", PLAY_BY_PLAY_API_URL);
    const response = await fetch(convertToHttps(PLAY_BY_PLAY_API_URL));
    const data = await response.json();

    console.log("Play-by-play data received:", data);

    const drives = data.gamepackageJSON?.drives?.previous || [];
    console.log("Drives data:", drives);
    
    const playsDiv = document.querySelector("#playsContent .plays-placeholder");
    if (!playsDiv) {
      console.error("Error: 'plays-placeholder' element not found.");
      return;
    }

    // Check if we have valid drives data
    if (drives.length === 0) {
      playsDiv.innerHTML = `
        <h2>Plays</h2>
        <div style="color: white; text-align: center; padding: 20px;">No play data available for this game.</div>
      `;
      return;
    }

    // Get team information for layout decisions
    const gameId_param = getQueryParam("gameId");
    let homeTeamId = null;
    let awayTeamId = null;
    let homeTeam = null;
    let awayTeam = null;
    let boxScoreData = null;
    
    // Fetch box score data for player stats
    try {
      const BOX_SCORE_API_URL = `https://cdn.espn.com/core/college-football/boxscore?xhr=1&gameId=${gameId_param}`;
      const boxScoreResponse = await fetch(convertToHttps(BOX_SCORE_API_URL));
      boxScoreData = await boxScoreResponse.json();
    } catch (error) {
      console.log("Could not fetch box score data for scoring cards");
    }
    
    // Try to get home/away team IDs from the game-specific API
    if (drives.length > 0) {
      // Use the game-specific API endpoint instead of searching through scoreboard
      try {
        const GAME_API_URL = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${gameId_param}`;
        console.log('Fetching game data from:', GAME_API_URL);
        const gameResponse = await fetch(convertToHttps(GAME_API_URL));
        const gameData = await gameResponse.json();
        
        if (gameData?.header?.competitions?.[0]?.competitors) {
          const competitors = gameData.header.competitions[0].competitors;
          const homeCompetitor = competitors.find(c => c.homeAway === "home");
          const awayCompetitor = competitors.find(c => c.homeAway === "away");
          
          homeTeamId = homeCompetitor?.team?.id;
          awayTeamId = awayCompetitor?.team?.id;
          homeTeam = homeCompetitor;
          awayTeam = awayCompetitor;
          
          console.log('Team IDs retrieved:', { homeTeamId, awayTeamId });
        }
      } catch (e) {
        console.log("Could not fetch team home/away info from game API:", e);
        
        // Fallback: try to determine from the scoreboard API
        try {
          const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard`;
          const scoreboardResponse = await fetch(convertToHttps(SCOREBOARD_API_URL));
          const scoreboardData = await scoreboardResponse.json();
          const currentGame = scoreboardData.events?.find(game => game.id === gameId_param);
          
          if (currentGame) {
            homeTeamId = currentGame.competitions[0].competitors.find(c => c.homeAway === "home")?.team?.id;
            awayTeamId = currentGame.competitions[0].competitors.find(c => c.homeAway === "away")?.team?.id;
            homeTeam = currentGame.competitions[0].competitors.find(c => c.homeAway === "home");
            awayTeam = currentGame.competitions[0].competitors.find(c => c.homeAway === "away");
          }
        } catch (e2) {
          console.log("Could not fetch team home/away info from scoreboard API:", e2);
        }
      }
    }

    const drivesHtml = drives.reverse().map((drive, index) => {
      const driveNumber = drives.length - index; // Correct numbering: first drive = 1, latest drive = highest number
      const teamName = drive.team?.shortDisplayName || drive.team?.abbreviation || 'Unknown';
      const teamLogo = drive.team?.logos?.[1]?.href || '';
      const driveResult = drive.displayResult || drive.result || 'No Result';
      const driveDescription = drive.description || '';
      const isScore = drive.isScore || false;
      const teamId = drive.team?.id;
      
      // Determine if this is the home team
      const isHomeTeam = homeTeamId && teamId === homeTeamId;
      
      // Debug logging
      console.log('Drive team debugging:', {
        teamName,
        teamId,
        homeTeamId,
        awayTeamId,
        isHomeTeam,
        driveNumber
      });
      
      // Get drive summary info
      const startText = drive.start?.text || '';
      const endText = drive.end?.text || '';
      const timeElapsed = drive.timeElapsed?.displayValue || '';
      
      // Get first play time and quarter information
      const firstPlay = drive.plays?.[0]; // First play in the drive
      const firstPlayQuarter = firstPlay?.period?.number || '';
      const firstPlayTime = firstPlay?.clock?.displayValue || '';
      const firstPlayTimeText = (firstPlayQuarter && firstPlayTime) ? `Q${firstPlayQuarter} ${firstPlayTime}` : '';
      
      // Create yard line graphic with gradient from start to end
      const startYardLine = drive.start?.yardLine || 0;
      const endYardLine = drive.end?.yardLine;
      const startPosition = Math.min(100, Math.max(0, startYardLine));
      const hasEndPosition = endYardLine !== undefined && endYardLine !== null;
      const endPosition = hasEndPosition ? Math.min(100, Math.max(0, endYardLine)) : startPosition;
      
      // Calculate gradient line from start to end (only if drive has ended)
      let fieldProgressHtml = '';
      let endMarkerHtml = '';
      
      if (hasEndPosition) {
        const leftPosition = Math.min(startPosition, endPosition);
        const rightPosition = Math.max(startPosition, endPosition);
        const width = rightPosition - leftPosition;
        
        // Flip gradient direction for away teams (green to red for home, red to green for away)
        const gradientDirection = isHomeTeam ? 'linear-gradient(90deg, #28a745 0%, #dc3545 100%)' : 'linear-gradient(90deg, #dc3545 0%, #28a745 100%)';
        
        fieldProgressHtml = `<div class="field-progress" style="left: ${leftPosition}%; width: ${width}%; background: ${gradientDirection};"></div>`;
        endMarkerHtml = `<div class="field-marker end-marker" style="left: ${endPosition}%"></div>`;
      }
      
      const yardLineGraphic = `
        <div class="yard-line-graphic ${isHomeTeam ? 'home-team' : ''}">
          <div class="yard-info ${isHomeTeam ? 'home-team' : ''}">
            ${hasEndPosition ? `<span>End: ${endText}</span>` : '<span>&nbsp;</span>'}
            <div class="field-graphic">
              <div class="field-line">
                ${fieldProgressHtml}
                <div class="field-marker start-marker" style="left: ${startPosition}%"></div>
                ${endMarkerHtml}
              </div>
            </div>
            <span>Start: ${startText}</span>
          </div>
        </div>
      `;
      
      // Generate plays HTML for this drive (reverse order so latest plays first)
      const playsHtml = (drive.plays || []).reverse().map((play, playIndex) => {
        const playText = play.text || 'No description available';
        const clock = play.clock?.displayValue || '';
        const period = play.period?.number || '';
        const homeScore = play.homeScore || 0;
        const awayScore = play.awayScore || 0;
        const isScoringPlay = play.scoringPlay || false;
        const scoringType = play.scoringType?.displayName || '';
        
        // Also check if this is a scoring play by looking at text patterns (backup check)
        // But distinguish between touchdowns and extra points
        const isTouchdown = /\bTOUCHDOWN\b/i.test(playText);
        const isFieldGoal = /\d+\s+yard\s+field\s+goal\s+is\s+GOOD/i.test(playText);
        const isExtraPointOnly = /extra\s+point\s+is\s+GOOD/i.test(playText) && !isTouchdown;
        const isSafety = /safety/i.test(playText);
        
        const isLikelyScoringPlay = isScoringPlay || isTouchdown || isFieldGoal || isSafety;
        // Don't show cards for extra point only plays (they're usually combined with touchdown plays)
        const shouldShowScoringCard = isLikelyScoringPlay && !isExtraPointOnly;
        
        console.log('Play analysis:', {
          playText,
          isScoringPlay,
          isTouchdown,
          isFieldGoal,
          isExtraPointOnly,
          shouldShowScoringCard,
          scoringType,
          hasParticipants: !!play.participants
        });
        
        // Generate scoring card for scoring plays
        let scoringCardHtml = '';
        if (shouldShowScoringCard) {
          console.log('Scoring play detected:', {
            scoringType,
            playText,
            isScoringPlay: isLikelyScoringPlay,
            play,
            teamId,
            homeTeamId,
            awayTeamId
          });
          
          try {
            // Determine which team scored
            const teamSide = teamId === homeTeamId ? 'home' : 'away';
            
            // Get team color from the appropriate team data
            let teamColor = drive.team?.color;
            if (!teamColor) {
              // Fallback to get color from home/away team data
              if (teamSide === 'home' && homeTeam?.team?.color) {
                teamColor = homeTeam.team.color;
              } else if (teamSide === 'away' && awayTeam?.team?.color) {
                teamColor = awayTeam.team.color;
              } else {
                // Default fallback color
                teamColor = '000000';
              }
            }
            
            console.log('Rendering scoring card with:', {
              teamSide,
              teamColor,
              homeScore,
              awayScore,
              homeTeam,
              awayTeam
            });
            
            scoringCardHtml = renderScoringCard(
              play, 
              drive.team, 
              teamColor, 
              homeScore, 
              awayScore, 
              teamSide, 
              homeTeam, 
              awayTeam, 
              boxScoreData
            );
            
            console.log('Scoring card HTML generated:', scoringCardHtml ? 'SUCCESS' : 'EMPTY');
          } catch (error) {
            console.log('Error rendering scoring card:', error);
          }
        }
        
        return `
          <div class="play-item ${shouldShowScoringCard ? 'scoring-play' : ''}">
            <div class="play-header">
              <span class="play-time">Q${period} ${clock}</span>
              <span class="play-score">${awayScore} - ${homeScore}</span>
              ${shouldShowScoringCard ? `<span class="scoring-indicator">${scoringType || (isTouchdown ? 'Touchdown' : isFieldGoal ? 'Field Goal' : 'Score')}</span>` : ''}
            </div>
            <div class="play-description">${playText}</div>
            ${scoringCardHtml}
          </div>
        `;
      }).join('');

      return `
        <div class="drive-container">
          <div class="drive-header ${isScore ? 'scoring-drive' : ''}" onclick="toggleDrive(${index})">
            <div class="drive-info ${isHomeTeam ? 'home-team' : ''}">
              <div class="drive-team">
                ${teamLogo ? `<img src="${teamLogo}" alt="${teamName}" class="drive-team-logo">` : ''}
                <span class="drive-team-name">${teamName}</span>
                <span class="drive-number">Drive ${driveNumber}</span>
              </div>
              <div class="drive-result ${isScore ? 'score' : ''}">${driveResult}</div>
            </div>
            <div class="drive-summary ${isHomeTeam ? 'home-team' : ''}">
              <span class="drive-description">${driveDescription}</span>
              <div class="drive-timing ${isHomeTeam ? 'home-team' : ''}">
                ${firstPlayTimeText ? `<span class="first-play-time">${firstPlayTimeText}</span>` : ''}
                ${timeElapsed ? `<span class="drive-time">${timeElapsed}</span>` : ''}
              </div>
            </div>
            ${yardLineGraphic}
            <div class="drive-toggle">
              <span class="toggle-icon" id="toggle-${index}">▼</span>
            </div>
          </div>
          <div class="drive-plays" id="drive-${index}" style="display: none;">
            ${playsHtml}
          </div>
        </div>
      `;
    }).join('');

    playsDiv.innerHTML = `
      <h2>Plays</h2>
      <div class="drives-container">
        ${drivesHtml}
      </div>
    `;
    
    // Restore previously open drives
    openDrives.forEach(driveIndex => {
      const driveElement = document.getElementById(`drive-${driveIndex}`);
      const toggleIcon = document.getElementById(`toggle-${driveIndex}`);
      if (driveElement && toggleIcon) {
        driveElement.style.display = 'block';
        toggleIcon.textContent = '▲';
      }
    });
  } catch (error) {
    console.error("Error fetching NCAA Football play-by-play data:", error);
    const playsDiv = document.querySelector("#playsContent .plays-placeholder");
    if (playsDiv) {
      playsDiv.innerHTML = `
        <h2>Plays</h2>
        <div style="color: white; text-align: center; padding: 20px;">Error loading play data.</div>
      `;
    }
  }
}

async function fetchAndRenderTopScoreboard() {
  try {
    const gameId = getQueryParam("gameId");
    if (!gameId) {
      document.getElementById('topScoreboard').innerHTML = '<div style="color: #888;">No game specified</div>';
      return;
    }

    // Fetch game data
    const response = await fetch(convertToHttps(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${gameId}`));
    const data = await response.json();

    if (!data.header || !data.header.competitions || data.header.competitions.length === 0) {
      throw new Error('Invalid game data structure');
    }

    const competition = data.header.competitions[0];
    const competitors = competition.competitors;
    
    if (!competitors || competitors.length < 2) {
      throw new Error('Missing team data');
    }

    const awayTeam = competitors.find(team => team.homeAway === 'away');
    const homeTeam = competitors.find(team => team.homeAway === 'home');

    const awayScore = parseInt(awayTeam.score || '0');
    const homeScore = parseInt(homeTeam.score || '0');
    
    console.log('DEBUG: Top scoreboard scores:', {
      awayTeam: awayTeam.team.displayName,
      awayScore,
      homeTeam: homeTeam.team.displayName, 
      homeScore,
      awayScoreType: typeof awayScore,
      homeScoreType: typeof homeScore
    });
    
    const gameStatus = competition.status.type.description;
    const gameState = competition.status.type.state;
    const clock = competition.status.displayClock;
    const period = competition.status.period;

    // Format status display
    let statusDisplay = gameStatus;
    if (gameState === 'in' && clock && period) {
      const quarterName = period <= 4 ? `${getOrdinal(period)} Quarter` : 'OT';
      statusDisplay = `${clock}<br><br>${quarterName}`;
    }

    const finished = gameState === 'post';

    // Get team colors
    const awayColor = awayTeam.team.color ? `#${awayTeam.team.color}` : '#777';
    const homeColor = homeTeam.team.color ? `#${homeTeam.team.color}` : '#777';

    // Store game state for other functions
    window.currentGameState = {
      awayTeam: awayTeam.team,
      homeTeam: homeTeam.team,
      awayScore,
      homeScore,
      status: gameStatus,
      clock,
      period
    };

    // Render top scoreboard
    const isMobile = window.innerWidth <= 475;
    
    let scoreboardHtml;
    
    if (isMobile) {
      // Mobile layout: Row with two team columns, each team has score above logo
      scoreboardHtml = `
        <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; width: 140%; margin-right: ${finished ? '-5px;' : '-30px;'} padding: 0 10px;">
          <div style="display: flex; flex-direction: column; align-items: center; text-align: center; flex: 1; max-width: 120px;">
            <div class="team-score responsive-score" style="color: ${awayScore > homeScore ? awayColor : '#888'}; margin-bottom: 10px;">${awayScore}</div>
            <div class="team-block" onclick="window.open('team-page.html?teamId=${awayTeam.team.id}', '_blank')" style="cursor: pointer; display: flex; flex-direction: column; align-items: center; text-align: center;">
              <img src="${convertToHttps(awayTeam.team.id === '349' ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${awayTeam.team.id}.png` : `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${awayTeam.team.id}.png`)}" 
                   alt="${awayTeam.team.displayName}" class="team-logo responsive-logo"
                   onerror="this.src='football.png';">
              <div class="team-name responsive-name">${getTeamAbbreviationWithRanking(awayTeam.team)}</div>
              <div class="team-record responsive-record">${awayTeam.record?.[0]?.summary || ''}</div>
            </div>
          </div>
          
          <div class="inning-center" style="flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; margin: 0 10px;">
            <div class="inning-status responsive-inning-status">${statusDisplay}</div>
            <div class="game-clock responsive-game-clock" style="color: grey;">
              ${gameState === 'pre' ? new Date(competition.date).toLocaleString() : ''}
            </div>
          </div>
          
          <div style="display: flex; flex-direction: column; align-items: center; text-align: center; flex: 1; max-width: 120px;">
            <div class="team-score responsive-score" style="color: ${homeScore > awayScore ? homeColor : '#888'}; margin-bottom: 10px;">${homeScore}</div>
            <div class="team-block" onclick="window.open('team-page.html?teamId=${homeTeam.team.id}', '_blank')" style="cursor: pointer; display: flex; flex-direction: column; align-items: center; text-align: center;">
              <img src="${convertToHttps(homeTeam.team.id === '349' ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${homeTeam.team.id}.png` : `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${homeTeam.team.id}.png`)}" 
                   alt="${homeTeam.team.displayName}" class="team-logo responsive-logo"
                   onerror="this.src='football.png';">
              <div class="team-name responsive-name">${getTeamAbbreviationWithRanking(homeTeam.team)}</div>
              <div class="team-record responsive-record">${homeTeam.record?.[0]?.summary || ''}</div>
            </div>
          </div>
        </div>
      `;
    } else {
      // Desktop layout: Keep original horizontal layout
      scoreboardHtml = `
        <div class="team-block" onclick="window.open('team-page.html?teamId=${awayTeam.team.id}', '_blank')" style="cursor: pointer;">
          <img src="${convertToHttps(awayTeam.team.id === '349' ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${awayTeam.team.id}.png` : `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${awayTeam.team.id}.png`)}" 
               alt="${awayTeam.team.displayName}" class="team-logo responsive-logo"
               onerror="this.src='football.png';">
          <div class="team-name responsive-name">${getTeamAbbreviationWithRanking(awayTeam.team)}</div>
          <div class="team-record responsive-record">${awayTeam.record?.[0]?.summary || ''}</div>
        </div>
        
        <div class="team-score responsive-score" style="color: ${awayScore > homeScore ? awayColor : '#888'}">${awayScore}</div>
        
        <div class="inning-center">
          <div class="inning-status responsive-inning-status">${statusDisplay}</div>
          <div class="game-clock responsive-game-clock" style="color: grey;">
            ${gameState === 'pre' ? new Date(competition.date).toLocaleString() : ''}
          </div>
        </div>
        
        <div class="team-score responsive-score" style="color: ${homeScore > awayScore ? homeColor : '#888'}">${homeScore}</div>
        
        <div class="team-block" onclick="window.open('team-page.html?teamId=${homeTeam.team.id}', '_blank')" style="cursor: pointer;">
          <img src="${convertToHttps(homeTeam.team.id === '349' ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${homeTeam.team.id}.png` : `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${homeTeam.team.id}.png`)}" 
               alt="${homeTeam.team.displayName}" class="team-logo responsive-logo"
               onerror="this.src='football.png';">
          <div class="team-name responsive-name">${getTeamAbbreviationWithRanking(homeTeam.team)}</div>
          <div class="team-record responsive-record">${homeTeam.record?.[0]?.summary || ''}</div>
        </div>
      `;
    }

    document.getElementById('topScoreboard').innerHTML = scoreboardHtml;

    // Debug linescore data
    console.log('DEBUG: Linescore data:', {
      hasCompetitionLinescores: !!(competition.linescores && competition.linescores.length > 0),
      competitionLinescores: competition.linescores,
      awayTeamLinescores: awayTeam.linescores,
      homeTeamLinescores: homeTeam.linescores
    });

    // Render linescore if available at team level
    if ((awayTeam.linescores && awayTeam.linescores.length > 0) || 
        (homeTeam.linescores && homeTeam.linescores.length > 0)) {
      console.log('DEBUG: Rendering linescore table');
      renderLinescoreTable(
        awayTeam.linescores || [],
        homeTeam.linescores || [],
        getTeamAbbreviationWithRanking(awayTeam.team),
        getTeamAbbreviationWithRanking(homeTeam.team),
        awayScore,
        homeScore
      );
    }

    // Render last play description if available
    if (data.drives?.current?.plays?.length > 0) {
      const lastPlay = data.drives.current.plays[data.drives.current.plays.length - 1];
      renderPlayDescription(lastPlay, clock, competitors);
    }

    // Set up stream embed only for live games - but only if not already initialized
    console.log('Stream check:', { gameState, streamInitialized, awayTeam: awayTeam.team.displayName, homeTeam: homeTeam.team.displayName });
    
    if (gameState === 'in') {
      console.log('Game is live, checking stream initialization...');
      if (!streamInitialized) {
        console.log('Initializing stream for live game...');
        
        // Handle the async renderStreamEmbed function properly
        renderStreamEmbed(awayTeam.team.displayName, homeTeam.team.displayName)
          .then(streamHTML => {
            const streamContainer = document.getElementById('streamEmbed');
            if (streamContainer && streamHTML) {
              streamContainer.innerHTML = streamHTML;
              streamInitialized = true;
              console.log('NCAAF Stream initialized successfully');
            } else {
              console.error('NCAAF Stream container not found or no HTML returned');
            }
          })
          .catch(error => {
            console.error('NCAAF Error initializing stream:', error);
          });
      } else {
        console.log('Stream already initialized, skipping...');
      }
    } else {
      console.log('Game is not live (state:', gameState, '), clearing stream...');
      // Clear stream container for non-live games and reset flag
      const streamContainer = document.getElementById('streamEmbed');
      if (streamContainer) {
        streamContainer.innerHTML = '';
        streamInitialized = false; // Reset flag when game is not live
        console.log('Stream container cleared and flag reset');
      }
    }

    // Load box score and play by play
    const boxScoreData = await renderBoxScore(gameId, window.currentGameState);
    await renderPlayByPlay(gameId);

    return { boxScoreData, gameState: window.currentGameState };

  } catch (error) {
    console.error('Error fetching scoreboard:', error);
    document.getElementById('topScoreboard').innerHTML = '<div style="color: #888;">Error loading game data</div>';
  }
}

function getOrdinal(num) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = num % 100;
  return num + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

let updateInterval;

// Fetch and render the scoreboard based on the gameId in the URL
const gameId = getQueryParam("gameId");
if (gameId) {
  // Cache rankings first
  cacheCurrentRankings().then(() => {
    fetchAndRenderTopScoreboard();
  });
  
  // Update every 10 seconds for live games
  updateInterval = setInterval(() => {
    if (window.currentGameState && window.currentGameState.status !== 'Final') {
      fetchAndRenderTopScoreboard();
    }
  }, 10000);
  
  // Handle window resize to switch between mobile/desktop layouts
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (window.currentGameState) {
        fetchAndRenderTopScoreboard();
      }
    }, 250); // Debounce resize events
  });
} else {
  document.getElementById('topScoreboard').innerHTML = '<div style="color: #888;">No game ID provided</div>';
}

function renderLinescoreTable(awayLinescores, homeLinescores, awayAbbr, homeAbbr, awayTotal, homeTotal) {
  console.log('DEBUG: renderLinescoreTable called with:', {
    awayLinescores,
    homeLinescores,
    awayAbbr,
    homeAbbr,
    awayTotal,
    homeTotal
  });
  
  const linescoreContainer = document.getElementById('linescoreTable');
  
  if (!linescoreContainer) {
    console.log('DEBUG: linescoreTable element not found');
    return;
  }
  
  if (!awayLinescores.length && !homeLinescores.length) {
    console.log('DEBUG: No linescore data, hiding container');
    linescoreContainer.style.display = 'none';
    return;
  }

  console.log('DEBUG: Rendering linescore table with data');

  const maxPeriods = Math.max(awayLinescores.length, homeLinescores.length);
  
  let headerHtml = '<th>Team</th>';
  for (let i = 1; i <= maxPeriods; i++) {
    if (i <= 4) {
      headerHtml += `<th>${i}</th>`;
    } else {
      headerHtml += `<th>OT${i > 5 ? i - 4 : ''}</th>`;
    }
  }
  headerHtml += '<th>T</th>';

  let awayRowHtml = `<td style="font-weight: bold;">${awayAbbr}</td>`;
  for (let i = 0; i < maxPeriods; i++) {
    const score = awayLinescores[i]?.displayValue || awayLinescores[i]?.value || '-';
    awayRowHtml += `<td>${score}</td>`;
  }
  awayRowHtml += `<td style="font-weight: bold;">${awayTotal}</td>`;

  let homeRowHtml = `<td style="font-weight: bold;">${homeAbbr}</td>`;
  for (let i = 0; i < maxPeriods; i++) {
    const score = homeLinescores[i]?.displayValue || homeLinescores[i]?.value || '-';
    homeRowHtml += `<td>${score}</td>`;
  }
  homeRowHtml += `<td style="font-weight: bold;">${homeTotal}</td>`;

  linescoreContainer.innerHTML = `
    <table>
      <thead>
        <tr>${headerHtml}</tr>
      </thead>
      <tbody>
        <tr>${awayRowHtml}</tr>
        <tr>${homeRowHtml}</tr>
      </tbody>
    </table>
  `;
  
  linescoreContainer.style.display = 'block';
}

function renderPlayDescription(lastPlay, clock, competitors) {
  const playContainer = document.getElementById('playDescription');
  if (!playContainer) return;
  
  if (!lastPlay || !lastPlay.text) {
    playContainer.style.display = 'none';
    return;
  }

  const playText = lastPlay.text;
  const timeLeft = clock || '';

  playContainer.innerHTML = `
    <div class="play-description-content">
      <div class="play-text">${playText}</div>
      ${timeLeft ? `<div class="time-left">${timeLeft}</div>` : ''}
    </div>
  `;
  
  playContainer.style.display = 'flex';
}

// Content slider functions
function showStats() {
  document.getElementById('statsContent').style.display = 'block';
  document.getElementById('playsContent').style.display = 'none';
  document.getElementById('statsBtn').classList.add('active');
  document.getElementById('playsBtn').classList.remove('active');
}

function showPlays() {
  document.getElementById('statsContent').style.display = 'none';
  document.getElementById('playsContent').style.display = 'block';
  document.getElementById('statsBtn').classList.remove('active');
  document.getElementById('playsBtn').classList.add('active');
}

// Function to toggle drive visibility with state preservation
function toggleDrive(driveIndex) {
  const driveElement = document.getElementById(`drive-${driveIndex}`);
  const toggleIcon = document.getElementById(`toggle-${driveIndex}`);
  
  if (driveElement && toggleIcon) {
    if (driveElement.style.display === 'none') {
      driveElement.style.display = 'block';
      toggleIcon.textContent = '▲';
      openDrives.add(driveIndex); // Track as open
    } else {
      driveElement.style.display = 'none';
      toggleIcon.textContent = '▼';
      openDrives.delete(driveIndex); // Track as closed
    }
  }
}

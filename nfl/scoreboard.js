const TEAMS_API_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams";

// Function to convert any URL to HTTPS
function convertToHttps(url) {
  if (typeof url !== 'string') return url;
  return url.replace(/^http:\/\//i, 'https://');
}

// NFL Position Groupings for Scoring Cards
function getPositionGroup(position) {
  const positionGroups = {
    'QB': 'QB',
    'RB': 'RB', 'FB': 'RB',
    'WR': 'WR/TE', 'TE': 'WR/TE',
    'OT': 'OL', 'G': 'OL', 'C': 'OL', 'OL': 'OL',
    'DE': 'DL/LB', 'DT': 'DL/LB', 'LB': 'DL/LB', 'OLB': 'DL/LB', 'MLB': 'DL/LB', 'ILB': 'DL/LB',
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
    console.log('No box score data available');
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

// NFL team name normalization 
function normalizeTeamName(teamName) {
  // Convert team names to the format used in the streaming site URLs
  const nameMap = {
    "Arizona Cardinals": "arizona-cardinals",
    "Atlanta Falcons": "atlanta-falcons", 
    "Baltimore Ravens": "baltimore-ravens",
    "Buffalo Bills": "buffalo-bills",
    "Carolina Panthers": "carolina-panthers",
    "Chicago Bears": "chicago-bears",
    "Cincinnati Bengals": "cincinnati-bengals",
    "Cleveland Browns": "cleveland-browns",
    "Dallas Cowboys": "dallas-cowboys",
    "Denver Broncos": "denver-broncos",
    "Detroit Lions": "detroit-lions",
    "Green Bay Packers": "green-bay-packers",
    "Houston Texans": "houston-texans",
    "Indianapolis Colts": "indianapolis-colts",
    "Jacksonville Jaguars": "jacksonville-jaguars",
    "Kansas City Chiefs": "kansas-city-chiefs",
    "Las Vegas Raiders": "las-vegas-raiders",
    "Los Angeles Chargers": "los-angeles-chargers",
    "Los Angeles Rams": "los-angeles-rams",
    "Miami Dolphins": "miami-dolphins",
    "Minnesota Vikings": "minnesota-vikings",
    "New England Patriots": "new-england-patriots",
    "New Orleans Saints": "new-orleans-saints",
    "New York Giants": "new-york-giants",
    "New York Jets": "new-york-jets",
    "Philadelphia Eagles": "philadelphia-eagles",
    "Pittsburgh Steelers": "pittsburgh-steelers",
    "San Francisco 49ers": "san-francisco-49ers",
    "Seattle Seahawks": "seattle-seahawks",
    "Tampa Bay Buccaneers": "tampa-bay-buccaneers",
    "Tennessee Titans": "tennessee-titans",
    "Washington Commanders": "washington-commanders"
  };

  const lowerName = teamName.toLowerCase();

  if (nameMap[teamName]) {
    return nameMap[teamName];
  }

  // Convert team names to streaming format with proper special character handling
  return lowerName.toLowerCase()
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

    // Filter matches by NFL sports (american-football and nfl)
    const relevantSports = ['american-football', 'nfl'];
    const matches = allMatches.filter(match => {
      const matchSport = match.sport || match.category;
      return relevantSports.includes(matchSport);
    });
    console.log(`Filtered to ${matches.length} NFL matches (${relevantSports.join(' or ')})`);

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

    // Fetch live matches for NFL (american-football and nfl)
    const matches = await fetchLiveMatches();

    // Debug: Check if we got any matches and what they look like
    console.log(`After filtering: Got ${matches.length} NFL matches`);
    if (matches.length === 0) {
      console.log('No NFL matches found! This could be due to:');
      console.log('1. API sport field name changed');
      console.log('2. No american-football or nfl matches currently live');
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
        // Strategy 0: Special handling for teams (e.g., "Chiefs vs Raiders")
        () => {
          let score = 0;
          
          // Check for simple team vs team format
          const simpleGamePattern = /([a-z\s]+?)\s+vs\s+([a-z\s]+)/i;
          const gameMatch = matchTitle.match(simpleGamePattern);
          
          if (gameMatch) {
            const team1 = gameMatch[1].trim().replace(/\s+/g, '-').toLowerCase();
            const team2 = gameMatch[2].trim().replace(/\s+/g, '-').toLowerCase();
            
            console.log(`Simple game pattern found: "${team1}" vs "${team2}"`);
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
            
            if (homeMatches && awayMatches) {
              score += 3.0; // Very high score for games that match both teams
              console.log(`✓ Found game match: "${matchTitle}" with teams "${team1}" and "${team2}"`);
            } else {
              console.log(`✗ Game doesn't match: home=${homeMatches}, away=${awayMatches}`);
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
        // Strategy 3: NFL-specific abbreviations and common names
        () => {
          const abbreviations = {
            'arizona': ['cardinals', 'arizona-cardinals'],
            'atlanta': ['falcons', 'atlanta-falcons'],
            'baltimore': ['ravens', 'baltimore-ravens'],
            'buffalo': ['bills', 'buffalo-bills'],
            'carolina': ['panthers', 'carolina-panthers'],
            'chicago': ['bears', 'chicago-bears'],
            'cincinnati': ['bengals', 'cincinnati-bengals'],
            'cleveland': ['browns', 'cleveland-browns'],
            'dallas': ['cowboys', 'dallas-cowboys'],
            'denver': ['broncos', 'denver-broncos'],
            'detroit': ['lions', 'detroit-lions'],
            'green-bay': ['packers', 'green-bay-packers'],
            'houston': ['texans', 'houston-texans'],
            'indianapolis': ['colts', 'indianapolis-colts'],
            'jacksonville': ['jaguars', 'jacksonville-jaguars'],
            'kansas-city': ['chiefs', 'kansas-city-chiefs'],
            'las-vegas': ['raiders', 'las-vegas-raiders'],
            'los-angeles-chargers': ['chargers', 'los-angeles-chargers'],
            'los-angeles-rams': ['rams', 'los-angeles-rams'],
            'miami': ['dolphins', 'miami-dolphins'],
            'minnesota': ['vikings', 'minnesota-vikings'],
            'new-england': ['patriots', 'new-england-patriots'],
            'new-orleans': ['saints', 'new-orleans-saints'],
            'new-york-giants': ['giants', 'new-york-giants'],
            'new-york-jets': ['jets', 'new-york-jets'],
            'philadelphia': ['eagles', 'philadelphia-eagles'],
            'pittsburgh': ['steelers', 'pittsburgh-steelers'],
            'san-francisco': ['49ers', 'san-francisco-49ers'],
            'seattle': ['seahawks', 'seattle-seahawks'],
            'tampa-bay': ['buccaneers', 'tampa-bay-buccaneers'],
            'tennessee': ['titans', 'tennessee-titans'],
            'washington': ['commanders', 'washington-commanders']
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
          console.log('NFL switchToStream: Updated stream container with new HTML');
        } else {
          console.error('NFL switchToStream: Stream container not found or no HTML returned');
        }
      })
      .catch(error => {
        console.error('NFL Error switching stream:', error);
      });
    
    streamInitialized = true; // Set flag after successful switch
  } else {
    console.error('Team names still not available for stream switch');
    alert('Unable to switch stream: team names not available. Please refresh the page and try again.');
  }
};

// Helper function to update button texts based on current stream type
function updateStreamButtons(currentType) {
  const button1 = document.getElementById('streamButton1');
  const button2 = document.getElementById('streamButton2');

  if (currentType === 'alpha1') {
    if (button1) {
      button1.textContent = availableStreams.alpha ? 'Stream Alpha 2' : 'Try Alpha 2';
      // Event listener is already attached in renderStreamEmbed
    }
    if (button2) {
      button2.textContent = availableStreams.bravo ? 'Stream Bravo' : 'Try Bravo';
      // Event listener is already attached in renderStreamEmbed
    }
  } else if (currentType === 'alpha2') {
    if (button1) {
      button1.textContent = availableStreams.alpha ? 'Stream Alpha 1' : 'Try Alpha 1';
      // Event listener is already attached in renderStreamEmbed
    }
    if (button2) {
      button2.textContent = availableStreams.bravo ? 'Stream Bravo' : 'Try Bravo';
      // Event listener is already attached in renderStreamEmbed
    }
  } else if (currentType === 'bravo') {
    if (button1) {
      button1.textContent = availableStreams.alpha ? 'Stream Alpha 1' : 'Try Alpha 1';
      // Event listener is already attached in renderStreamEmbed
    }
    if (button2) {
      button2.textContent = availableStreams.alpha ? 'Stream Alpha 2' : 'Try Alpha 2';
      // Event listener is already attached in renderStreamEmbed
    }
  }
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
    embedUrl = `https://embedsports.top/embed/alpha/${homeNormalized}-vs-${awayNormalized}/1`;
  } else if (streamType === 'alpha2') {
    embedUrl = `https://embedsports.top/embed/alpha/${homeNormalized}-vs-${awayNormalized}/2`;
  } else if (streamType === 'bravo') {
    const timestamp = Date.now();
    embedUrl = `https://embedsports.top/embed/bravo/${timestamp}-${homeNormalized}-${awayNormalized}-english-/1`;
  }

  console.log('Generated embed URL:', embedUrl);
  console.log('Expected iframe HTML:');
  console.log(`<iframe title="${homeTeamName} vs ${awayTeamName} Player" marginheight="0" marginwidth="0" src="${embedUrl}" scrolling="no" allowfullscreen="yes" allow="encrypted-media; picture-in-picture;" width="100%" height="100%" frameborder="0"></iframe>`);

  console.log('=== STREAM DEBUGGING END ===');
}

// Make debug function available globally for console testing
window.debugStreamExtraction = debugStreamExtraction;

async function renderStreamEmbed(awayTeamName, homeTeamName) {
  console.log('NFL renderStreamEmbed called with:', { awayTeamName, homeTeamName });
  
  const streamContainer = document.getElementById('streamEmbed');

  if (!streamContainer) {
    console.error('NFL Stream container not found! Cannot render stream.');
    return;
  }

  console.log('NFL Stream container found, proceeding with stream rendering...');

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

  if (availableStreams.alpha && currentStreamType === 'alpha1') {
    embedUrl = availableStreams.alpha.embedUrl;
  } else if (availableStreams.alpha && currentStreamType === 'alpha2') {
    // For alpha2, modify the API URL to use /2 instead of /1
    embedUrl = availableStreams.alpha.embedUrl.replace(/\/1$/, '/2');
  } else if (availableStreams.bravo && currentStreamType === 'bravo') {
    embedUrl = availableStreams.bravo.embedUrl;
  }

  // Fallback to manual URL construction if API doesn't have the stream
  if (!embedUrl) {
    console.log('API streams not available, falling back to manual URL construction');
    const homeNormalized = normalizeTeamName(homeTeamName);
    const awayNormalized = normalizeTeamName(awayTeamName);

    if (currentStreamType === 'alpha1') {
      embedUrl = `https://embedsports.top/embed/alpha/${homeNormalized}-vs-${awayNormalized}/1`;
    } else if (currentStreamType === 'alpha2') {
      embedUrl = `https://embedsports.top/embed/alpha/${homeNormalized}-vs-${awayNormalized}/2`;
    } else if (currentStreamType === 'bravo') {
      const timestamp = Date.now();
      embedUrl = `https://embedsports.top/embed/bravo/${timestamp}-${homeNormalized}-${awayNormalized}-english-/1`;
    }
  }

  console.log('Generated embed URL:', embedUrl);

  // Determine which buttons to show based on current stream type and available streams
  let button1Text = '';
  let button2Text = '';
  let button1Action = '';
  let button2Action = '';

  if (currentStreamType === 'alpha1') {
    button1Text = availableStreams.alpha ? 'Stream Alpha 2' : 'Try Alpha 2';
    button2Text = availableStreams.bravo ? 'Stream Bravo' : 'Try Bravo';
    button1Action = 'switchToStream(\'alpha2\')';
    button2Action = 'switchToStream(\'bravo\')';
  } else if (currentStreamType === 'alpha2') {
    button1Text = availableStreams.alpha ? 'Stream Alpha 1' : 'Try Alpha 1';
    button2Text = availableStreams.bravo ? 'Stream Bravo' : 'Try Bravo';
    button1Action = 'switchToStream(\'alpha1\')';
    button2Action = 'switchToStream(\'bravo\')';
  } else if (currentStreamType === 'bravo') {
    button1Text = availableStreams.alpha ? 'Stream Alpha 1' : 'Try Alpha 1';
    button2Text = availableStreams.alpha ? 'Stream Alpha 2' : 'Try Alpha 2';
    button1Action = 'switchToStream(\'alpha1\')';
    button2Action = 'switchToStream(\'alpha2\')';
  }

  const streamHTML = `
    <div style="background: #1a1a1a; border-radius: 1rem; padding: 1rem; margin-bottom: 2rem;">
      <div class="stream-header" style="margin-bottom: 10px; text-align: center;">
        <h3 style="color: white; margin: 0;">Live Stream (${currentStreamType.toUpperCase()})</h3>
        <div class="stream-controls" style="margin-top: 10px;">
          <button id="fullscreenButton" onclick="toggleFullscreen()" style="padding: 8px 16px; margin: 0 5px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">⛶ Fullscreen</button>
          <button id="streamButton1" onclick="${button1Action}" style="padding: 8px 16px; margin: 0 5px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">${button1Text}</button>
          <button id="streamButton2" onclick="${button2Action}" style="padding: 8px 16px; margin: 0 5px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">${button2Text}</button>
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
  console.log('NFL renderStreamEmbed returning HTML content (length:', streamHTML.length, ')');
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

function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

// Function to render NFL scoring card
async function renderScoringCard(play, teamInfo, teamColor, homeScore, awayScore, teamSide, homeTeam, awayTeam, boxScoreData) {
  console.log('renderScoringCard called with play:', play);
  
  // Get game state information first
  const clock = play.clock?.displayValue || '';
  const period = play.period?.number || '';
  const scoringType = play.scoringType?.displayName || '';
  const playText = play.text || '';
  
  // Get scorer information from play participants or extract from play text
  let scorer = null;
  let scorerName = 'Unknown Player';
  let scorerPosition = '';
  
  // Try to get scorer from participants (fetch athlete data from $ref)
  if (play.participants && play.participants.length > 0) {
    try {
      // For scoring plays, prioritize the actual scorer over other participants
      let mainParticipant = null;
      
      // Look for scorer-specific participant types first
      mainParticipant = play.participants.find(p => 
        p.type === 'scorer' || p.type === 'receiver' || p.type === 'rusher'
      );
      
      // If no specific scorer found, fall back to other types
      if (!mainParticipant) {
        mainParticipant = play.participants.find(p => 
          p.type === 'passer' || p.type === 'kicker'
        ) || play.participants[0];
      }
      
      if (mainParticipant?.athlete?.$ref) {
        console.log('Fetching athlete data from:', mainParticipant.athlete.$ref);
        const athleteResponse = await fetch(convertToHttps(mainParticipant.athlete.$ref));
        const athleteData = await athleteResponse.json();
        
        scorer = athleteData;
        scorerName = athleteData.displayName || athleteData.fullName || 'Unknown Player';
        
        // Get position from athlete data or participant type
        if (athleteData.position?.abbreviation) {
          scorerPosition = athleteData.position.abbreviation;
        } else if (mainParticipant.type) {
          // Map participant type to position abbreviation
          const typeToPosition = {
            'kicker': 'K',
            'rusher': 'RB',
            'receiver': 'WR',
            'passer': 'QB',
            'returner': 'RB',
            'scorer': 'WR' // Default for scorer type
          };
          scorerPosition = typeToPosition[mainParticipant.type] || '';
        }
        
        console.log('Found scorer from participants:', scorerName, scorerPosition, 'Type:', mainParticipant.type);
      }
    } catch (error) {
      console.error('Error fetching athlete data:', error);
    }
  }
  
  // Fallback: try to extract player name from play text if no participant data worked
  if (scorerName === 'Unknown Player') {
    console.log('No participants found or failed to fetch, trying to extract from text:', playText);
    
    // Enhanced NFL scoring patterns - prioritize actual scorers over extra point kickers
    const patterns = [
      // Receiving touchdowns: "pass to PLAYER for X yards, TOUCHDOWN"
      /pass\s+(?:deep\s+)?(?:right|left|middle)?\s*to\s+([A-Z]\.[A-Za-z]+)\s+for\s+\d+\s+yards?,?\s+TOUCHDOWN/i,
      // Rushing touchdowns: "PLAYER run/rush/guard/tackle/end for X yards, TOUCHDOWN"
      /([A-Z]\.[A-Za-z]+)\s+(?:run|rush|up the middle|left end|right end|left guard|right guard|left tackle|right tackle)\s+for\s+\d+\s+yards?,?\s+TOUCHDOWN/i,
      // Scrambling touchdowns: "PLAYER scrambles up the middle/left/right for X yards, TOUCHDOWN"
      /([A-Z]\.[A-Za-z]+)\s+scrambles\s+(?:up the middle|left|right|left end|right end)\s+for\s+\d+\s+yards?,?\s+TOUCHDOWN/i,
      // Generic rushing: "PLAYER for X yards, TOUCHDOWN" (before any extra point mention)
      /([A-Z]\.[A-Za-z]+)\s+for\s+\d+\s+yards?,?\s+TOUCHDOWN/i,
      // Field goals: "PLAYER X yard field goal is GOOD" (only for field goals, not touchdowns)
      /([A-Z]\.[A-Za-z]+)\s+\d+\s+yard\s+field\s+goal\s+is\s+GOOD/i
    ];
    
    // Special handling for extra points - only use kicker if this is specifically an extra point play
    if (scoringType && scoringType.toLowerCase().includes('extra point')) {
      const extraPointPattern = /([A-Z]\.[A-Za-z]+)\s+extra\s+point\s+is\s+GOOD/i;
      const match = playText.match(extraPointPattern);
      if (match && match[1]) {
        scorerName = match[1].trim();
        scorerPosition = 'K';
        console.log('Extracted extra point kicker:', scorerName);
      }
    } else {
      // For touchdowns and field goals, use the main patterns
      for (const pattern of patterns) {
        const match = playText.match(pattern);
        if (match && match[1]) {
          scorerName = match[1].trim();
          console.log('Extracted scorer from text:', scorerName);
          
          // Try to determine position from play context
          if (playText.includes('pass') && playText.includes('to ' + scorerName)) {
            scorerPosition = 'WR'; // Receiving touchdown
          } else if (playText.includes(scorerName + ' scrambles')) {
            scorerPosition = 'QB'; // Quarterback scramble
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
          } else if (playText.includes('field goal')) {
            scorerPosition = 'K'; // Kicker
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
  const teamLogo = (teamAbbr === "NYG" || teamAbbr === "NYJ") ? `https://a.espncdn.com/i/teamlogos/nfl/500-dark/${teamAbbr}.png` : `https://a.espncdn.com/i/teamlogos/nfl/500/${teamAbbr}.png`;

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
  } else if (positionGroup === 'QB' && playText.includes(scorerName + ' scrambles')) {
    // For QB scrambles, show rushing stats instead of passing stats
    adjustedPositionGroup = 'RB_RUSHING';
    preferredStatCategory = 'rushing';
    console.log('QB scramble TD detected, showing rushing stats');
  }
  
  const playerStats = getPositionStatsForCard(adjustedPositionGroup, boxScoreData, scorerName, preferredStatCategory);
  console.log('Player stats retrieved for scoring card:', { scorerName, adjustedPositionGroup, preferredStatCategory, statsCount: playerStats.length });
  
  // If no stats found with the current name, try alternative name formats
  if (playerStats.length === 0 && scorer?.shortName && scorer.shortName !== scorerName) {
    console.log('No stats found with display name, trying short name:', scorer.shortName);
    const alternativeStats = getPositionStatsForCard(adjustedPositionGroup, boxScoreData, scorer.shortName, preferredStatCategory);
    if (alternativeStats.length > 0) {
      console.log('Found stats with short name!');
      playerStats.push(...alternativeStats);
    }
  }
  
  // If still no stats and we have full name, try that too
  if (playerStats.length === 0 && scorer?.fullName && scorer.fullName !== scorerName) {
    console.log('Still no stats found, trying full name:', scorer.fullName);
    const fullNameStats = getPositionStatsForCard(adjustedPositionGroup, boxScoreData, scorer.fullName, preferredStatCategory);
    if (fullNameStats.length > 0) {
      console.log('Found stats with full name!');
      playerStats.push(...fullNameStats);
    }
  }

  // Get team logos for score display
  const homeTeamLogo = (homeTeam.team.abbreviation === "NYG" || homeTeam.team.abbreviation === "NYJ") ? `https://a.espncdn.com/i/teamlogos/nfl/500-dark/${homeTeam?.team?.abbreviation || homeTeam?.abbreviation}.png` : `https://a.espncdn.com/i/teamlogos/nfl/500/${homeTeam?.team?.abbreviation || homeTeam?.abbreviation}.png`;
  const awayTeamLogo = (awayTeam.team.abbreviation === "NYG" || awayTeam.team.abbreviation === "NYJ") ? `https://a.espncdn.com/i/teamlogos/nfl/500-dark/${awayTeam?.team?.abbreviation || awayTeam?.abbreviation}.png` : `https://a.espncdn.com/i/teamlogos/nfl/500/${awayTeam?.team?.abbreviation || awayTeam?.abbreviation}.png`;

  const teamColorHex = teamColor.startsWith('#') ? teamColor : `#${teamColor}`;
  const scoringCardId = `scoring-card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  console.log('About to render scoring card with:', {
    scorerName,
    scorerPosition,
    teamAbbr,
    scoringType,
    playerStats: playerStats.length
  });

  return `
    <div id="${scoringCardId}" class="scoring-card" style="background: linear-gradient(135deg, ${teamColorHex}15 0%, ${teamColorHex}05 100%); border-left: 4px solid ${teamColorHex}; margin: 10px 0; padding: 20px; border-radius: 8px; color: white; position: relative;">
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
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `scoring-card-${new Date().getTime()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          showFeedback('Scoring card downloaded!', 'success');
          resolve();
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

// Function to capture and copy play card as image
async function captureAndCopyPlayCard(element) {
  const { default: html2canvas } = await import('https://cdn.skypack.dev/html2canvas');

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                  ('ontouchstart' in window) || 
                  (navigator.maxTouchPoints > 0);
  
  // Clone the element to modify it for clipboard copy without affecting the original
  const clonedElement = element.cloneNode(true);
  
  // Add padding for clipboard copy
  clonedElement.style.paddingTop = '20px';
  clonedElement.style.paddingLeft = '20px';
  clonedElement.style.paddingRight = '20px';
  clonedElement.style.paddingBottom = '20px';
  
  // Modify headshot size for clipboard copy
  const containerImg = clonedElement.querySelector('.copy-player-image-container');
  if (containerImg) {
    containerImg.style.width = '120px';
    containerImg.style.height = '80px';
  }
  const headshotImg = clonedElement.querySelector('.copy-player-image');
  if (headshotImg) {
    headshotImg.style.width = '114px';
    headshotImg.style.height = `${isMobile ? '76px' : '74px'}`;
  }

  // Temporarily add the cloned element to the DOM for rendering
  clonedElement.style.position = 'absolute';
  clonedElement.style.left = '-9999px';
  clonedElement.style.top = '-9999px';
  document.body.appendChild(clonedElement);
  
  const canvas = await html2canvas(clonedElement, {
    backgroundColor: '#1a1a1a',
    scale: 3,
    useCORS: true
  });
  
  // Remove the cloned element from DOM
  document.body.removeChild(clonedElement);
  
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
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
          link.download = `play-card-${new Date().getTime()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          showFeedback('Play card downloaded!', 'success');
          resolve();
        } else {
          // On desktop, try to copy to clipboard using modern API
          if (navigator.clipboard && window.ClipboardItem) {
            const clipboardItem = new ClipboardItem({
              'image/png': blob
            });
            await navigator.clipboard.write([clipboardItem]);
            showFeedback('Play card copied to clipboard!', 'success');
            resolve();
          } else {
            showFeedback('Could not copy to clipboard. Try again', 'error');
            reject(new Error('Clipboard API not available'));
          }
        }
      } catch (clipboardError) {
        console.error('Error handling play card image:', clipboardError);
        showFeedback('Could not copy to clipboard. Try again', 'error');
        reject(clipboardError);
      }
    }, 'image/png', 0.95);
  });
}

async function renderBoxScore(gameId, gameState) {
  try {
    const BOX_SCORE_API_URL = `https://cdn.espn.com/core/nfl/boxscore?xhr=1&gameId=${gameId}`;
    console.log("Fetching box score from:", BOX_SCORE_API_URL);
    const response = await fetch(BOX_SCORE_API_URL);
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
      const teamLogo = (team.team.abbreviation === "NYG" || team.team.abbreviation === "NYJ") ? `https://a.espncdn.com/i/teamlogos/nfl/500-dark/${team.team.abbreviation}.png` : `https://a.espncdn.com/i/teamlogos/nfl/500/${team.team.abbreviation}.png`;

      // NFL has different stat categories: passing, rushing, receiving, etc.
      let playersHtml = '';
      
      team.statistics.forEach(statCategory => {
        const categoryName = statCategory.name;
        const athletes = statCategory.athletes || [];
        
        // Skip fumbles category and empty categories
        if (athletes.length === 0) return;

        // Create header for this stat category
        const categoryLabels = statCategory.labels || [];
        const categoryDescriptions = statCategory.descriptions || [];
        
        playersHtml += `
          <div class="stat-category">
            <h4>${statCategory.text || categoryName.charAt(0).toUpperCase() + categoryName.slice(1)}</h4>
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  ${categoryLabels.slice(0, isSmallScreen ? 3 : categoryLabels.length).map(label => `<th>${label}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${athletes.map(playerData => {
                  const player = playerData.athlete;
                  const stats = playerData.stats || [];
                  const displayStats = isSmallScreen ? stats.slice(0, 3) : stats;
                  
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
    console.error("Error fetching NFL box score data:", error);
  }
}

// Helper function to format yard line text
function formatYardLineText(yardLine, teamAbbr, homeTeam, awayTeam) {
  if (yardLine === undefined || yardLine === null) return '';
  
  if (yardLine === 50) {
    return '50';
  } else if (yardLine > 50) {
    // In opponent territory - show opponent team abbreviation
    const opponentAbbr = (teamAbbr === homeTeam?.abbreviation) ? awayTeam?.abbreviation : homeTeam?.abbreviation;
    const yardLineFromGoal = 100 - yardLine;
    return opponentAbbr ? `${opponentAbbr} ${yardLineFromGoal}` : `${yardLineFromGoal}`;
  } else {
    // In own territory - show own team abbreviation
    return teamAbbr ? `${teamAbbr} ${yardLine}` : `${yardLine}`;
  }
}

async function renderPlayByPlay(gameId) {
  try {
    console.log("Rendering play-by-play for game:", gameId);
    
    // Use the drives API endpoint as specified
    const drivesUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${gameId}/competitions/${gameId}/drives?lang=en&region=us`;
    console.log("Fetching drives from:", drivesUrl);
    
    const response = await fetch(convertToHttps(drivesUrl));
    const drivesData = await response.json();
    
    console.log("Drives data received:", drivesData);
    
    const drives = drivesData.items || [];
    
    // Get team information for layout decisions
    const gameId_param = getQueryParam("gameId");
    
    // Store current play data for copy functionality
    currentPlayData = {
      drives: drives,
      gameId: gameId,
      boxScoreUrl: `https://cdn.espn.com/core/nfl/boxscore?xhr=1&gameId=${gameId_param || gameId}`
    };
    
    const playsDiv = document.querySelector("#playsContent .plays-placeholder");
    if (!playsDiv) {
      console.error("Error: 'plays-placeholder' element not found.");
      return;
    }
    
    if (drives.length === 0) {
      console.log("No drives found");
      playsDiv.innerHTML = `
        <h2>Plays</h2>
        <div style="color: white; text-align: center; padding: 20px;">No play data available for this game.</div>
      `;
      return;
    }

    let homeTeamId = null;
    let awayTeamId = null;
    let homeTeam = null;
    let awayTeam = null;
    let boxScoreData = null;
    
    // Fetch box score data for player stats
    try {
      const BOX_SCORE_API_URL = `https://cdn.espn.com/core/nfl/boxscore?xhr=1&gameId=${gameId_param}`;
      const boxScoreResponse = await fetch(BOX_SCORE_API_URL);
      boxScoreData = await boxScoreResponse.json();
    } catch (error) {
      console.log("Could not fetch box score data for scoring cards");
    }
    
    // Try to get home/away team IDs from the game-specific API
    try {
      const GAME_API_URL = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId_param}`;
      console.log('Fetching game data from:', GAME_API_URL);
      const gameResponse = await fetch(GAME_API_URL);
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
    }

    const drivesHtml = await Promise.all(drives.reverse().map(async (drive, index) => {
      const driveNumber = drives.length - index; // Correct numbering: first drive = 1, latest drive = highest number
      
      // Get team information
      let teamInfo = null;
      if (drive.team && drive.team.$ref) {
        try {
          const teamResponse = await fetch(convertToHttps(drive.team.$ref));
          teamInfo = await teamResponse.json();
        } catch (error) {
          console.error("Error fetching team info:", error);
        }
      }
      
      const teamName = teamInfo?.shortDisplayName || teamInfo?.abbreviation || 'Unknown';
      const teamLogo = teamInfo?.logos?.[1]?.href || '';
      const teamColor = teamInfo?.color ? `#${teamInfo.color}` : '#333';
      const teamId = teamInfo?.id;
      const driveResult = drive.displayResult || drive.result || 'In Progress';
      const driveDescription = drive.description || '';
      const isScore = drive.isScore || false;
      
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
      
      // Get first play time and quarter information from plays
      let firstPlay = null;
      if (drive.plays && drive.plays.items && drive.plays.items.length > 0) {
        // Sort plays by sequence number to get the actual first play
        const sortedPlays = drive.plays.items.sort((a, b) => {
          const seqA = parseInt(a.sequenceNumber) || 0;
          const seqB = parseInt(b.sequenceNumber) || 0;
          return seqA - seqB;
        });
        firstPlay = sortedPlays[0];
        
        // Get detailed play information if $ref is available
        if (firstPlay.$ref) {
          try {
            const playResponse = await fetch(convertToHttps(firstPlay.$ref));
            firstPlay = await playResponse.json();
          } catch (error) {
            console.error("Error fetching first play details:", error);
          }
        }
      }
      
      const firstPlayQuarter = firstPlay?.period?.number || '';
      const firstPlayTime = firstPlay?.clock?.displayValue || '';
      const firstPlayTimeText = (firstPlayQuarter && firstPlayTime) ? `Q${firstPlayQuarter} ${firstPlayTime}` : '';
      
      // Create yard line graphic with gradient from start to current/end position
      const startYardLine = drive.start?.yardLine || 0;
      const driveEndYardLine = drive.end?.yardLine;
      const startPosition = Math.min(100, Math.max(0, startYardLine));
      const hasDriveEnded = driveEndYardLine !== undefined && driveEndYardLine !== null;
      
      // If drive hasn't ended, find the most recent play's end position as current position
      let currentYardLine = driveEndYardLine;
      let currentText = drive.end?.text || '';
      
      // If currentText is empty but we have a yard line, generate text
      if (!currentText && driveEndYardLine !== undefined) {
        currentText = formatYardLineText(driveEndYardLine, drive.team?.abbreviation, homeTeam, awayTeam);
      }
      
      if (!hasDriveEnded && drive.plays?.items && drive.plays.items.length > 0) {
        // Sort plays by sequence number to get the most recent play
        const sortedPlays = drive.plays.items.sort((a, b) => {
          const seqA = parseInt(a.sequenceNumber) || 0;
          const seqB = parseInt(b.sequenceNumber) || 0;
          return seqB - seqA; // Most recent first
        });
        
        // Get the most recent play's end position
        let mostRecentPlay = sortedPlays[0];
        
        // Fetch detailed play data if needed
        if (mostRecentPlay.$ref) {
          try {
            const playResponse = await fetch(convertToHttps(mostRecentPlay.$ref));
            mostRecentPlay = await playResponse.json();
          } catch (error) {
            console.error("Error fetching most recent play details:", error);
          }
        }
        
        if (mostRecentPlay.end?.yardLine !== undefined) {
          currentYardLine = mostRecentPlay.end.yardLine;
          currentText = mostRecentPlay.end.text || '';
          
          // If currentText is empty, generate it from the yard line
          if (!currentText) {
            currentText = formatYardLineText(currentYardLine, drive.team?.abbreviation, homeTeam, awayTeam);
          }
          
          console.log('Using current position from most recent play:', currentText, currentYardLine);
        }
      }
      
      const hasCurrentPosition = currentYardLine !== undefined && currentYardLine !== null;
      const currentPosition = hasCurrentPosition ? Math.min(100, Math.max(0, currentYardLine)) : startPosition;
      
      // Calculate gradient line from start to current position
      let fieldProgressHtml = '';
      let currentMarkerHtml = '';
      
      if (hasCurrentPosition) {
        const leftPosition = Math.min(startPosition, currentPosition);
        const rightPosition = Math.max(startPosition, currentPosition);
        const width = rightPosition - leftPosition;
        
        // Flip gradient direction for away teams (green to red for home, red to green for away)
        const gradientDirection = isHomeTeam ? 'linear-gradient(90deg, #28a745 0%, #dc3545 100%)' : 'linear-gradient(90deg, #dc3545 0%, #28a745 100%)';
        
        fieldProgressHtml = `<div class="field-progress" style="left: ${leftPosition}%; width: ${width}%; background: ${gradientDirection};"></div>`;
        currentMarkerHtml = `<div class="field-marker end-marker" style="left: ${currentPosition}%"></div>`;
      }
      
      const yardLineGraphic = `
        <div class="yard-line-graphic ${isHomeTeam ? 'home-team' : ''}">
          <div class="yard-info ${isHomeTeam ? 'home-team' : ''}">
            ${hasCurrentPosition ? `<span>${hasDriveEnded ? 'End' : 'Current'}: ${currentText}</span>` : '<span>&nbsp;</span>'}
            <div class="field-graphic">
              <div class="field-line">
                ${fieldProgressHtml}
                <div class="field-marker start-marker" style="left: ${startPosition}%"></div>
                ${currentMarkerHtml}
              </div>
            </div>
            <span>Start: ${startText}</span>
          </div>
        </div>
      `;
      
      // Generate plays HTML for this drive
      const playsHtml = await Promise.all((drive.plays?.items || []).reverse().map(async (play, playIndex) => {
        // Get detailed play information if $ref is available
        let playDetails = play;
        if (play.$ref) {
          try {
            const playResponse = await fetch(convertToHttps(play.$ref));
            playDetails = await playResponse.json();
          } catch (error) {
            console.error("Error fetching play details:", error);
          }
        }
        
        const playText = playDetails.text || 'No description available';
        const clock = playDetails.clock?.displayValue || '';
        const period = playDetails.period?.number || '';
        const homeScore = playDetails.homeScore || 0;
        const awayScore = playDetails.awayScore || 0;
        const isScoringPlay = playDetails.scoringPlay || false;
        const scoringType = playDetails.scoringType?.displayName || '';
        
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
          hasParticipants: !!playDetails.participants
        });
        
        // Generate scoring card for scoring plays
        let scoringCardHtml = '';
        if (shouldShowScoringCard) {
          console.log('Scoring play detected:', {
            scoringType,
            playText,
            isScoringPlay: isLikelyScoringPlay,
            play: playDetails,
            teamId,
            homeTeamId,
            awayTeamId
          });
          
          try {
            // Determine which team scored
            const teamSide = teamId === homeTeamId ? 'home' : 'away';
            
            // Get team color from the appropriate team data
            let currentTeamColor = teamInfo?.color;
            if (!currentTeamColor) {
              // Fallback to get color from home/away team data
              if (teamSide === 'home' && homeTeam?.team?.color) {
                currentTeamColor = homeTeam.team.color;
              } else if (teamSide === 'away' && awayTeam?.team?.color) {
                currentTeamColor = awayTeam.team.color;
              } else {
                // Default fallback color
                currentTeamColor = '000000';
              }
            }
            
            console.log('Rendering scoring card with:', {
              teamSide,
              teamColor: currentTeamColor,
              homeScore,
              awayScore,
              homeTeam,
              awayTeam
            });
            
            scoringCardHtml = await renderScoringCard(
              playDetails, 
              teamInfo, 
              currentTeamColor, 
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
          <div class="play-item ${shouldShowScoringCard ? 'scoring-play' : ''}" data-play-id="${play.id}">
            <div class="play-header">
              <span class="play-time">Q${period} ${clock}</span>
              <span class="play-score">${awayScore} - ${homeScore}</span>
              ${shouldShowScoringCard ? `<span class="scoring-indicator">${scoringType || (isTouchdown ? 'Touchdown' : isFieldGoal ? 'Field Goal' : 'Score')}</span>` : ''}
              ${play.participants && play.participants.length > 0 ? `<button class="copy-play-btn" onclick="copyPlay('${play.id}')" title="Copy play">📋</button>` : ''}
            </div>
            <div class="play-description">${playText}</div>
            ${scoringCardHtml}
            <div id="copy-card-${play.id}" class="copy-card" style="display: none;"></div>
          </div>
        `;
      }));

      return `
        <div class="drive-container">
          <div class="drive-header ${isScore ? 'scoring-drive' : ''}" onclick="toggleDrive(${index})">
            <div class="drive-info ${isHomeTeam ? 'home-team' : ''}">
              <div class="drive-team">
                ${teamLogo ? `<img src="${convertToHttps(teamLogo)}" alt="${teamName}" class="drive-team-logo">` : ''}
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
            ${playsHtml.join('')}
          </div>
        </div>
      `;
    }));

    playsDiv.innerHTML = `
      <h2>Plays</h2>
      <div class="drives-container">
        ${drivesHtml.join('')}
      </div>
    `;
  } catch (error) {
    console.error("Error fetching NFL play-by-play data:", error);
    const playsDiv = document.querySelector("#playsContent .plays-placeholder");
    if (playsDiv) {
      playsDiv.innerHTML = `
        <h2>Plays</h2>
        <div style="color: white; text-align: center; padding: 20px;">Error loading play data: ${error.message}</div>
      `;
    }
  }
}

async function fetchAndRenderTopScoreboard() {
  try {
    function getOrdinalSuffix(num) {
      if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
      switch (num % 10) {
        case 1: return `${num}st`;
        case 2: return `${num}nd`;
        case 3: return `${num}rd`;
        default: return `${num}th`;
      }
    }

    const gameId = getQueryParam("gameId");
    const gameDate = getQueryParam("date");
    
    if (!gameId) {
      console.error("No gameId provided");
      return;
    }

    let selectedGame = null;
    let scoreboardData = null;

    if (gameDate) {
      // Use the specific date provided
      const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${gameDate}`;
      
      try {
        const response = await fetch(SCOREBOARD_API_URL);
        const data = await response.json();
        const games = data.events || [];
        
        selectedGame = games.find(game => game.id === gameId);
        if (selectedGame) {
          scoreboardData = data;
        }
      } catch (error) {
        console.error(`Error fetching data for date ${gameDate}:`, error);
      }
    }

    // Fallback: search recent dates if specific date doesn't work
    if (!selectedGame) {
      const today = new Date();
      for (let daysBack = 0; daysBack <= 30; daysBack++) {
        const searchDate = new Date(today);
        searchDate.setDate(today.getDate() - daysBack);
        
        const adjustedDate = searchDate.getFullYear() +
                             String(searchDate.getMonth() + 1).padStart(2, "0") +
                             String(searchDate.getDate()).padStart(2, "0");
        
        const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${adjustedDate}`;

        try {
          const response = await fetch(SCOREBOARD_API_URL);
          const data = await response.json();
          const games = data.events || [];
          
          selectedGame = games.find(game => game.id === gameId);
          if (selectedGame) {
            scoreboardData = data;
            break;
          }
        } catch (error) {
          console.error(`Error fetching data for date ${adjustedDate}:`, error);
        }
      }
    }

    if (!selectedGame) {
      console.error(`Game with ID ${gameId} not found.`);
      return;
    }

    const awayTeam = selectedGame.competitions[0].competitors.find(c => c.homeAway === "away")?.team;
    const homeTeam = selectedGame.competitions[0].competitors.find(c => c.homeAway === "home")?.team;

    const awayScore = selectedGame.competitions[0].competitors.find(c => c.homeAway === "away")?.score || "0";
    const homeScore = selectedGame.competitions[0].competitors.find(c => c.homeAway === "home")?.score || "0";

    const awayLinescores = selectedGame.competitions[0].competitors.find(c => c.homeAway === "away")?.linescores || [];
    const homeLinescores = selectedGame.competitions[0].competitors.find(c => c.homeAway === "home")?.linescores || [];

    const slug = selectedGame.season?.slug || "regular-season";

    const homeTeamRecord = slug === "post-season"
      ? selectedGame.competitions[0].competitors.find(c => c.homeAway === "home")?.record || "0-0"
      : selectedGame.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamRecord = slug === "post-season"
      ? selectedGame.competitions[0].competitors.find(c => c.homeAway === "away")?.record || "0-0"
      : selectedGame.competitions[0].competitors.find(c => c.homeAway === "away")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const period = selectedGame.status.period || 0;
    const clock = selectedGame.status.displayClock || "00:00";
    const gameStatus = selectedGame.status.type.description;
    const isGameOver = gameStatus === "Final";
    const isGameScheduled = gameStatus === "Scheduled";

    const possession = selectedGame?.competitions[0]?.situation?.possession;
    const text = selectedGame?.competitions[0]?.situation?.possessionText || "";
    const distance = selectedGame?.competitions[0]?.situation?.distance || "N/A";
    const yardLine = selectedGame?.competitions[0]?.situation?.yardLine || "N/A";
    const kickoff = selectedGame?.competitions[0]?.situation?.shortDownDistanceText === "1st & 10" && distance === 10 && (yardLine === 65 || yardLine === 35) ? "Kickoff" : selectedGame?.competitions[0]?.situation?.shortDownDistanceText || "";


    const topScoreboardEl = document.getElementById("topScoreboard");
    if (!topScoreboardEl) {
      console.error("Error: 'topScoreboard' element not found.");
      return;
    }

    const periodText = isGameOver ? "Final"
      : isGameScheduled ? "Scheduled"
      : period > 4
      ? "OT"
      : `${getOrdinalSuffix(period)} Quarter`;

    const timeLeft = isGameOver ? "End" : isGameScheduled ? `${selectedGame.status.type.shortDetail}` : clock;

    // Determine score colors for the final game state
    const awayScoreColor = gameStatus === "Final" && parseInt(awayScore) < parseInt(homeScore) ? "grey" : "white";
    const homeScoreColor = gameStatus === "Final" && parseInt(homeScore) < parseInt(awayScore) ? "grey" : "white";

    topScoreboardEl.innerHTML = `
      <div class="team-block">
        <div class="team-score responsive-score" style="color: ${awayScoreColor};">${awayScore}</div>
        <img class="team-logo responsive-logo" src="${`https://a.espncdn.com/i/teamlogos/nfl/500-dark/${awayTeam?.abbreviation}.png` || ""}" alt="${awayTeam?.displayName}">
        <div class="team-name responsive-name">${awayTeam?.shortDisplayName}</div>
        <div class="team-record responsive-record">${awayTeamRecord}</div>
      </div>
      <div class="inning-center">
        <div class="inning-status responsive-inning-status">${periodText}</div>
        <div class="time-left responsive-game-clock">${timeLeft}</div>
        <div class="time-left responsive-text1" style="margin-top: 25px">${kickoff}</div>
        <div class="time-left responsive-text2" style="color: white;">${text ? (possession === homeTeam.id ? `${text} ▶` : `◀ ${text}`) : ""}</div>
      </div>
      <div class="team-block">
        <div class="team-score responsive-score" style="color: ${homeScoreColor};">${homeScore}</div>
        <img class="team-logo responsive-logo" src="${`https://a.espncdn.com/i/teamlogos/nfl/500-dark/${homeTeam?.abbreviation}.png` || ""}" alt="${homeTeam?.displayName}">
        <div class="team-name responsive-name">${homeTeam?.shortDisplayName}</div>
        <div class="team-record responsive-record">${homeTeamRecord}</div>
      </div>
    `;

    renderLinescoreTable(awayLinescores, homeLinescores, awayTeam?.abbreviation, homeTeam?.abbreviation, awayScore, homeScore);

    // Add stream embed after linescore (only render once and only for in-progress games)
    const isInProgress = gameStatus !== "Final" && gameStatus !== "Scheduled";
    console.log('NFL Stream check:', { gameStatus, isInProgress, streamInitialized, awayTeam: awayTeam?.displayName, homeTeam: homeTeam?.displayName });
    
    if (isInProgress && !streamInitialized) {
      console.log('Game is in progress, initializing stream...');
      
      // Handle the async renderStreamEmbed function properly
      renderStreamEmbed(awayTeam?.displayName, homeTeam?.displayName)
        .then(streamHTML => {
          const streamContainer = document.getElementById('streamEmbed');
          if (streamContainer && streamHTML) {
            streamContainer.innerHTML = streamHTML;
            streamInitialized = true;
            console.log('NFL Stream initialized successfully');
          } else {
            console.error('NFL Stream container not found or no HTML returned');
          }
        })
        .catch(error => {
          console.error('NFL Error initializing stream:', error);
        });
    } else if (!isInProgress) {
      console.log('Game is not in progress (status:', gameStatus, '), clearing stream...');
      // Clear stream container if game is finished and reset flag
      const streamContainer = document.getElementById("streamEmbed");
      if (streamContainer && streamContainer.innerHTML) {
        streamContainer.innerHTML = "";
        streamInitialized = false;
        console.log('NFL Stream container cleared and flag reset');
      }
    } else {
      console.log('Stream already initialized for in-progress game, skipping...');
    }

    // Remove play description functionality - no longer needed
    // as it will be handled in the Plays section

    // Render the box score
    renderBoxScore(gameId, gameStatus);

    // Return true if game is over to stop further updates
    return isGameOver;
  } catch (error) {
    console.error("Error fetching NFL scoreboard data:", error);
    return true; // Stop fetching on error
  }
}

let updateInterval;

// Fetch and render the scoreboard based on the gameId in the URL
const gameId = getQueryParam("gameId");
if (gameId) {
  const updateScoreboard = async () => {
    const gameOver = await fetchAndRenderTopScoreboard();
    if (gameOver && updateInterval) {
      clearInterval(updateInterval);
      console.log("Game is over. Stopped fetching updates.");
    }
  };

  updateScoreboard(); // Initial fetch
  updateInterval = setInterval(updateScoreboard, 2000);
} else {
  document.getElementById("scoreboardContainer").innerHTML = "<p>No game selected.</p>";
}

function renderLinescoreTable(awayLinescores, homeLinescores, awayAbbr, homeAbbr, awayTotal, homeTotal) {
  const linescoreTableDiv = document.getElementById("linescoreTable");
  if (!linescoreTableDiv) {
    console.error("Error: 'linescoreTable' element not found.");
    return;
  }

  const periods = [1, 2, 3, 4]; // Standard NFL periods
  const periodHeaders = periods.map(period => `<th>${period}</th>`).join("");

  const awayScores = periods.map(period => {
    const score = awayLinescores.find(ls => ls.period === period)?.displayValue || "-";
    return `<td>${score}</td>`;
  }).join("");

  const homeScores = periods.map(period => {
    const score = homeLinescores.find(ls => ls.period === period)?.displayValue || "-";
    return `<td>${score}</td>`;
  }).join("");

  linescoreTableDiv.innerHTML = `
    <table>
      <thead>
        <tr>
          <th></th>
          ${periodHeaders}
          <th></th> <!-- Space between periods and total -->
          <th>T</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${awayAbbr}</td>
          ${awayScores}
          <td></td> <!-- Space between periods and total -->
          <td>${awayTotal}</td>
        </tr>
        <tr>
          <td>${homeAbbr}</td>
          ${homeScores}
          <td></td> <!-- Space between periods and total -->
          <td>${homeTotal}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function renderPlayDescription(lastPlay, clock, competitors) {
  const playDescriptionDiv = document.getElementById("playDescription");
  if (!playDescriptionDiv) {
    console.error("Error: 'playDescription' element not found.");
    return;
  }

  if (!lastPlay || !lastPlay.text) {
    playDescriptionDiv.innerHTML = `
      <div class="play-description-content">
        <div class="play-text">No play data available</div>
      </div>
    `;
    playDescriptionDiv.style.backgroundColor = "#1a1a1a"; // Default background color
    return;
  }

  // Handle clock display
  const displayClock = clock === "0.0" ? "End" : clock;

  // Find the team in the competitors array that matches the team ID from lastPlay
  const team = competitors.find(c => c.team.id === lastPlay.team?.id);

  // Use the team's color or fallback to a default color
  const teamColor = team?.team?.color ? `#${team.team.color}` : "#1a1a1a";
  playDescriptionDiv.style.backgroundColor = teamColor;

  playDescriptionDiv.innerHTML = `
    <div class="play-description-content">
      <div class="play-text">${lastPlay.text}</div>
    </div>
  `;
}

// Content slider functions
function showStats() {
  // Update tab states
  document.querySelectorAll('.slider-btn').forEach(btn => btn.classList.remove('active'));
  const statsBtn = document.getElementById('statsBtn');
  if (statsBtn) statsBtn.classList.add('active');
  
  // Show/hide content sections - handle all content classes
  document.querySelectorAll('.content-section, .content2-section, .content1-section').forEach(content => {
    content.classList.remove('active');
  });
  const statsContent = document.getElementById('statsContent');
  if (statsContent) statsContent.classList.add('active');
  
  // Hide stream embed when on stats
  const streamEmbed = document.getElementById('streamEmbed');
  if (streamEmbed) {
    streamEmbed.style.display = 'none';
  }
  
  // Load stats data when switching to stats view
  const gameId = getQueryParam("gameId");
  if (gameId) {
    loadMatchStats(gameId);
  }
}

function showBoxscore() {
  // Update tab states
  document.querySelectorAll('.slider-btn').forEach(btn => btn.classList.remove('active'));
  const boxscoreBtn = document.getElementById('boxscoreBtn');
  if (boxscoreBtn) boxscoreBtn.classList.add('active');
  
  // Show/hide content sections - handle all content classes
  document.querySelectorAll('.content-section, .content2-section, .content1-section').forEach(content => {
    content.classList.remove('active');
  });
  const boxscoreContent = document.getElementById('boxscoreContent');
  if (boxscoreContent) boxscoreContent.classList.add('active');
  
  // Show stream embed when on boxscore (if game is in progress)
  const streamEmbed = document.getElementById('streamEmbed');
  if (streamEmbed) {
    streamEmbed.style.display = 'block';
  }
}

function showPlays() {
  // Update tab states
  document.querySelectorAll('.slider-btn').forEach(btn => btn.classList.remove('active'));
  const playsBtn = document.getElementById('playsBtn');
  if (playsBtn) playsBtn.classList.add('active');
  
  // Show/hide content sections - handle all content classes
  document.querySelectorAll('.content-section, .content2-section, .content1-section').forEach(content => {
    content.classList.remove('active');
  });
  const playsContent = document.getElementById('playsContent');
  if (playsContent) playsContent.classList.add('active');
  
  // Hide stream embed when on plays
  const streamEmbed = document.getElementById('streamEmbed');
  if (streamEmbed) {
    streamEmbed.style.display = 'none';
  }
  
  // Load play-by-play data when switching to plays view
  const gameId = getQueryParam("gameId");
  if (gameId) {
    renderPlayByPlay(gameId);
  }
}

// Function to toggle drive visibility
function toggleDrive(driveIndex) {
  const driveElement = document.getElementById(`drive-${driveIndex}`);
  const toggleIcon = document.getElementById(`toggle-${driveIndex}`);
  
  if (driveElement && toggleIcon) {
    if (driveElement.style.display === 'none') {
      driveElement.style.display = 'block';
      toggleIcon.textContent = '▲';
    } else {
      driveElement.style.display = 'none';
      toggleIcon.textContent = '▼';
    }
  }
}

// Stats functionality
async function loadMatchStats(gameId) {
  try {
    console.log('Loading match stats for game:', gameId);
    
    // Replace gameId in the URL with the actual gameId
    const STATS_API_URL = `https://cdn.espn.com/core/nfl/matchup?xhr=1&gameId=${gameId}`;
    console.log('Fetching stats from:', STATS_API_URL);
    
    const response = await fetch(STATS_API_URL);
    const data = await response.json();
    
    console.log('Stats data received:', data);
    console.log('Full gamepackageJSON:', data.gamepackageJSON);
    
    const statsContainer = document.getElementById('matchStatsDisplay');
    if (!statsContainer) {
      console.error('Stats container not found');
      return;
    }
    
    // Check if we have valid data
    if (!data || !data.gamepackageJSON) {
      statsContainer.innerHTML = '<div style="color: white; text-align: center; padding: 20px;">Stats not available for this game.</div>';
      return;
    }
    
    // Look for teams in different possible locations
    let teams = data.gamepackageJSON.teams;
    
    // Try alternative locations if teams not found
    if (!teams && data.gamepackageJSON.boxscore) {
      teams = data.gamepackageJSON.boxscore.teams;
    }
    if (!teams && data.gamepackageJSON.header) {
      teams = data.gamepackageJSON.header.competitions?.[0]?.competitors;
    }
    
    console.log('Teams found:', teams);
    
    if (!teams || teams.length < 2) {
      // Try to find team info in header/competitors
      const competitors = data.gamepackageJSON.header?.competitions?.[0]?.competitors;
      if (competitors && competitors.length >= 2) {
        console.log('Using competitors data:', competitors);
        
        // Convert competitors to team format
        const awayTeam = competitors.find(c => c.homeAway === 'away') || competitors[1];
        const homeTeam = competitors.find(c => c.homeAway === 'home') || competitors[0];
        
        // Render basic team info without detailed stats
        renderBasicTeamInfo(awayTeam, homeTeam, statsContainer);
        return;
      }
      
      statsContainer.innerHTML = '<div style="color: white; text-align: center; padding: 20px;">Team data not available.</div>';
      return;
    }
    
    const awayTeam = teams.find(team => team.homeAway === 'away') || teams[0];
    const homeTeam = teams.find(team => team.homeAway === 'home') || teams[1];
    
    console.log('Away team:', awayTeam);
    console.log('Home team:', homeTeam);
    
    // Get team statistics
    const awayStats = awayTeam.statistics || [];
    const homeStats = homeTeam.statistics || [];
    
    console.log('Away stats:', awayStats);
    console.log('Home stats:', homeStats);
    
    // Render stats similar to soccer format
    renderMatchStats(awayTeam, homeTeam, awayStats, homeStats);
    
  } catch (error) {
    console.error('Error loading match stats:', error);
    const statsContainer = document.getElementById('matchStatsDisplay');
    if (statsContainer) {
      statsContainer.innerHTML = '<div style="color: white; text-align: center; padding: 20px;">Error loading stats.</div>';
    }
  }
}

// Function to render basic team info when detailed stats aren't available
function renderBasicTeamInfo(awayTeam, homeTeam, statsContainer) {
  console.log('Rendering basic team info');
  
  // Get team logos and names
  const awayLogo = awayTeam.team?.logo || awayTeam.team?.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/nfl/500/${awayTeam.team?.abbreviation}.png`;
  const homeLogo = homeTeam.team?.logo || homeTeam.team?.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/nfl/500/${homeTeam.team?.abbreviation}.png`;
  
  const awayName = awayTeam.team?.shortDisplayName || awayTeam.team?.displayName || awayTeam.team?.name;
  const homeName = homeTeam.team?.shortDisplayName || homeTeam.team?.displayName || homeTeam.team?.name;
  
  const statsHtml = `
    <div class="match-stats-container">
      <div class="stats-header">Team Information</div>
      
      <div class="stats-teams">
        <div class="stats-team away">
          <img src="${awayLogo}" alt="${awayName}" class="stats-team-logo">
          <div class="stats-team-name">${awayName}</div>
        </div>
        <div class="stats-team home">
          <div class="stats-team-name">${homeName}</div>
          <img src="${homeLogo}" alt="${homeName}" class="stats-team-logo">
        </div>
      </div>
      
      <div style="color: white; text-align: center; padding: 20px;">
        Detailed team statistics will be available during or after the game.
      </div>
    </div>
  `;
  
  statsContainer.innerHTML = statsHtml;
}

// Function to render match stats similar to soccer
function renderMatchStats(awayTeam, homeTeam, awayStats, homeStats) {
  const statsContainer = document.getElementById('matchStatsDisplay');
  if (!statsContainer) return;
  
  console.log('Rendering match stats for:', awayTeam, homeTeam);
  
  // Get team logos with multiple fallback options
  const awayLogo = awayTeam.team?.logo || 
                   awayTeam.team?.logos?.[0]?.href || 
                   awayTeam.logo || 
                   `https://a.espncdn.com/i/teamlogos/nfl/500/${awayTeam.team?.abbreviation || awayTeam.abbreviation}.png`;
  
  const homeLogo = homeTeam.team?.logo || 
                   homeTeam.team?.logos?.[0]?.href || 
                   homeTeam.logo || 
                   `https://a.espncdn.com/i/teamlogos/nfl/500/${homeTeam.team?.abbreviation || homeTeam.abbreviation}.png`;
  
  // Get team names with multiple fallback options
  const awayName = awayTeam.team?.shortDisplayName || 
                   awayTeam.team?.displayName || 
                   awayTeam.team?.name || 
                   awayTeam.shortDisplayName || 
                   awayTeam.displayName || 
                   awayTeam.name;
  
  const homeName = homeTeam.team?.shortDisplayName || 
                   homeTeam.team?.displayName || 
                   homeTeam.team?.name || 
                   homeTeam.shortDisplayName || 
                   homeTeam.displayName || 
                   homeTeam.name;

  // Get team colors with fallbacks
  const awayColor = awayTeam.team?.color || awayTeam.color || 'dc3545';
  const homeColor = homeTeam.team?.color || homeTeam.color || '007bff';
  
  // Ensure colors have # prefix
  const awayColorHex = awayColor.startsWith('#') ? awayColor : `#${awayColor}`;
  const homeColorHex = homeColor.startsWith('#') ? homeColor : `#${homeColor}`;
  
  // Create stats sections based on available data
  let statsHtml = `
    <div class="match-stats-container">
      <div class="stats-header">Match Stats</div>
      
      <div class="stats-teams">
        <div class="stats-team away">
          <img src="${awayLogo}" alt="${awayName}" class="stats-team-logo" onerror="this.src='football.png';">
          <div class="stats-team-name">${awayName}</div>
        </div>
        <div class="stats-team home">
          <div class="stats-team-name">${homeName}</div>
          <img src="${homeLogo}" alt="${homeName}" class="stats-team-logo" onerror="this.src='football.png';">
        </div>
      </div>
  `;
  
  // Process statistics if available
  if (awayStats.length > 0 && homeStats.length > 0) {
    // Get possession data
    const awayPossessionStat = awayStats.find(stat => stat.name === 'possessionTime');
    const homePossessionStat = homeStats.find(stat => stat.name === 'possessionTime');
    
    if (awayPossessionStat && homePossessionStat) {
      // Use the actual seconds values from the data
      const awaySeconds = awayPossessionStat.value; // Already in seconds
      const homeSeconds = homePossessionStat.value; // Already in seconds
      const totalSeconds = awaySeconds + homeSeconds;
      
      const awayPercent = ((awaySeconds / totalSeconds) * 100).toFixed(1);
      const homePercent = ((homeSeconds / totalSeconds) * 100).toFixed(1);
      
      // Use displayValue for the time format display
      const awayTimeDisplay = awayPossessionStat.displayValue; // "40:15"
      const homeTimeDisplay = homePossessionStat.displayValue; // "19:45"
      
      statsHtml += `
        <div class="stats-section">
          <div class="stats-section-title">Possession</div>
          <div class="possession-section">
            <div class="possession-circle" style="background: conic-gradient(${homeColorHex} 0% ${homePercent}%, ${awayColorHex} ${homePercent}% 100%);">
              <div class="possession-center">
                <div>Possession</div>
              </div>
            </div>
            <div class="possession-values">
              <div class="possession-team away-team">
                <div class="possession-color" style="background: ${awayColorHex};"></div>
                <span>${awayName} ${awayPercent}% (${awayTimeDisplay})</span>
              </div>
              <div class="possession-team home-team">
                <span>${homeName} ${homePercent}% (${homeTimeDisplay})</span>
                <div class="possession-color" style="background: ${homeColorHex};"></div>
              </div>
            </div>
          </div>
        </div>
      `;
    }
    
    // Create stat categories (11 categories as requested)
    const statCategories = {
      'Offense': ['firstDowns', 'totalOffensivePlays', 'totalYards', 'yardsPerPlay'],
      'Passing': ['netPassingYards', 'completionAttempts', 'yardsPerPass'],
      'Rushing': ['rushingYards', 'rushingAttempts', 'yardsPerRushAttempt'],
      'Turnovers': ['interceptions', 'fumblesLost'],
      'Penalties': ['totalPenaltiesYards'],
      'Third Down': ['thirdDownEff'],
      'Fourth Down': ['fourthDownEff'],
      'Red Zone': ['redZoneAttempts'],
      'Defense': ['sacksYardsLost'],
      'Drives': ['totalDrives']
    };
    
    Object.entries(statCategories).forEach(([category, statKeys]) => {
      statsHtml += `<div class="stats-section">
        <div class="stats-section-title">${category}</div>`;
      
      statKeys.forEach(statKey => {
        const awayStat = findStatValue(awayStats, statKey);
        const homeStat = findStatValue(homeStats, statKey);
        
        if (awayStat !== null && homeStat !== null) {
          // Get display name for stat
          const statLabel = getStatDisplayName(statKey);
          
          // For percentage stats, use the raw values for comparison
          let awayValue, homeValue;
          if (statKey.includes('Eff') || statKey.includes('Attempts')) {
            // For efficiency stats, extract percentage or fraction
            awayValue = extractNumericValue(awayStat);
            homeValue = extractNumericValue(homeStat);
          } else {
            awayValue = parseFloat(awayStat) || 0;
            homeValue = parseFloat(homeStat) || 0;
          }
          
          const maxValue = Math.max(awayValue, homeValue);
          const total = awayValue + homeValue;
          
          // Calculate percentages for bar widths (like soccer - based on proportion of total)
          let awayPercent = 0;
          let homePercent = 0;
          
          if (total > 0) {
            awayPercent = (awayValue / total) * 100;
            homePercent = (homeValue / total) * 100;
          }
          
          statsHtml += `
            <div class="stats-row">
              <div class="stats-value away">${awayStat}</div>
              <div class="stats-bar-container">
                <div class="stats-bar">
                  <div class="stats-bar-fill away" style="width: ${awayPercent}%; background: ${awayColorHex};"></div>
                </div>
                <div class="stats-bar">
                  <div class="stats-bar-fill home" style="width: ${homePercent}%; background: ${homeColorHex};"></div>
                </div>
              </div>
              <div class="stats-value home">${homeStat}</div>
            </div>
            <div class="stats-label">${statLabel}</div>
          `;
        }
      });
      
      statsHtml += '</div>';
    });
    
  } else {
    statsHtml += '<div style="color: white; text-align: center; padding: 20px;">Detailed statistics will be available during or after the game.</div>';
  }
  
  statsHtml += '</div>';
  
  // First set the main stats HTML
  statsContainer.innerHTML = statsHtml;
  
  // Then load and append leaders data
  loadMatchLeaders();
}

// Helper function to find stat values in the stats array
function findStatValue(stats, statKey) {
  for (const stat of stats) {
    if (stat.name === statKey || stat.abbreviation === statKey) {
      return stat.displayValue || stat.value;
    }
  }
  return null;
}

// Helper function to convert time (MM:SS) to seconds
function convertTimeToSeconds(timeString) {
  if (!timeString || typeof timeString !== 'string') return 0;
  
  const parts = timeString.split(':');
  if (parts.length === 2) {
    const minutes = parseInt(parts[0]) || 0;
    const seconds = parseInt(parts[1]) || 0;
    return (minutes * 60) + seconds;
  }
  return 0;
}

// Helper function to get display names for stats
function getStatDisplayName(statKey) {
  const displayNames = {
    'firstDowns': '1st Downs',
    'totalOffensivePlays': 'Total Plays',
    'totalYards': 'Total Yards',
    'yardsPerPlay': 'Yards per Play',
    'netPassingYards': 'Net Passing Yards',
    'completionAttempts': 'Comp/Att',
    'yardsPerPass': 'Yards per Pass',
    'rushingYards': 'Rushing Yards',
    'rushingAttempts': 'Rushing Attempts',
    'yardsPerRushAttempt': 'Yards per Rush',
    'interceptions': 'Interceptions',
    'fumblesLost': 'Fumbles Lost',
    'totalPenaltiesYards': 'Penalties-Yards',
    'thirdDownEff': '3rd Down Efficiency',
    'fourthDownEff': '4th Down Efficiency',
    'redZoneAttempts': 'Red Zone (Made-Att)',
    'sacksYardsLost': 'Sacks-Yards Lost',
    'timeOfPossession': 'Time of Possession',
    'totalDrives': 'Total Drives'
  };
  
  return displayNames[statKey] || statKey;
}

// Helper function to extract numeric value from stat strings like "9-12" or "75%"
function extractNumericValue(statString) {
  if (!statString || statString === '-') return 0;
  
  // Handle fractions like "9-12" (convert to percentage)
  if (statString.includes('-')) {
    const parts = statString.split('-');
    if (parts.length === 2) {
      const made = parseFloat(parts[0]) || 0;
      const attempted = parseFloat(parts[1]) || 0;
      return attempted > 0 ? (made / attempted) : 0;
    }
  }
  
  // Handle percentages like "75%"
  if (statString.includes('%')) {
    return parseFloat(statString.replace('%', '')) || 0;
  }
  
  // Handle regular numbers
  return parseFloat(statString) || 0;
}

// Function to load and render leaders data
async function loadMatchLeaders() {
  try {
    const gameId = getQueryParam("gameId");
    if (!gameId) return;
    
    const LEADERS_API_URL = `https://cdn.espn.com/core/nfl/matchup?xhr=1&gameId=${gameId}`;
    const response = await fetch(LEADERS_API_URL);
    const data = await response.json();
    
    console.log('Leaders data received:', data);
    
    if (data && data.gamepackageJSON && data.gamepackageJSON.leaders) {
      renderLeaders(data.gamepackageJSON.leaders);
    }
  } catch (error) {
    console.error('Error loading leaders:', error);
  }
}

// Function to render leaders (like soccer's form containers)
function renderLeaders(leadersData) {
  const statsContainer = document.getElementById('matchStatsDisplay');
  if (!statsContainer || !leadersData) return;
  
  // Create leaders HTML similar to soccer's form containers
  let leadersHtml = `
    <div class="form-containers">
  `;
  
  // Reverse the order so away team is on left, home team is on right
  const orderedLeaders = [...leadersData].reverse();
  
  // Process each team's leaders
  orderedLeaders.forEach(teamLeaders => {
    const team = teamLeaders.team;
    const leaders = teamLeaders.leaders;
    
    if (!team || !leaders) return;
    
    leadersHtml += `
      <div class="form-container">
        <div class="form-header">
          <img src="${team.logo || team.logos?.[0]?.href}" alt="${team.displayName}" class="form-team-logo-header" onerror="this.src='football.png';">
          <div class="form-team-info">
            <div class="form-team-name">${team.displayName}</div>
            <div class="form-subtitle">LEADERS</div>
          </div>
        </div>
        
        <div class="form-matches">
    `;
    
    // Add leaders for key categories
    const keyLeaders = ['passingYards', 'rushingYards', 'receivingYards'];
    
    keyLeaders.forEach(leaderType => {
      const leaderCategory = leaders.find(cat => cat.name === leaderType);
      if (leaderCategory && leaderCategory.leaders && leaderCategory.leaders.length > 0) {
        const leader = leaderCategory.leaders[0]; // Top leader
        const athlete = leader.athlete;
        
        leadersHtml += `
          <div class="form-match">
            <div class="form-match-header">
              <div class="form-date">${leaderCategory.displayName}</div>
              <div class="form-competition" style="margin-left: auto; font-size: 12px; color: #888;">${athlete.position?.abbreviation || 'Player'}</div>
            </div>
            <div class="form-match-teams">
              <div class="form-team">
                <img src="${athlete.headshot?.href || 'football.png'}" alt="${athlete.displayName}" class="form-team-logo-small" onerror="this.src='football.png';">
                <span class="form-team-abbr">${athlete.shortName || athlete.displayName}</span>
              </div>
              <div class="form-score">${leader.displayValue}</div>
            </div>
          </div>
        `;
      }
    });
    
    leadersHtml += `
        </div>
      </div>
    `;
  });
  
  leadersHtml += `</div>`;
  
  // Append leaders to the stats container
  statsContainer.innerHTML += leadersHtml;
}

// Global variable to store play data for copying
let currentPlayData = null;

// Function to copy play data
async function copyPlay(playId) {
  console.log('Copy play clicked for ID:', playId);
  
  const copyCard = document.getElementById(`copy-card-${playId}`);
  if (!copyCard) {
    console.log('Copy card not found for play ID:', playId);
    return;
  }
  
  try {
    // Always render the copy card (but keep it hidden)
    const cardHtml = await renderPlayCopyCard(playId);
    copyCard.innerHTML = cardHtml;
    copyCard.style.display = 'block';
    
    // Wait a moment for the card to render in the DOM
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Find the play copy card inside the copy card div
    const playCardElement = copyCard.querySelector('.play-copy-card');
    if (playCardElement) {
      // Copy the card as image
      showFeedback('Preparing image...', 'loading');
      await captureAndCopyPlayCard(playCardElement);
    } else {
      console.error('Play copy card element not found within copy card');
      showFeedback('Error: Could not find copy card element', 'error');
    }
    
    // Hide the copy card after copying
    copyCard.style.display = 'none';
    
  } catch (error) {
    console.error('Error copying play:', error);
    showFeedback('Failed to copy play', 'error');
    // Hide the copy card on error
    copyCard.style.display = 'none';
  }
}

// Function to render the play copy card
async function renderPlayCopyCard(playId) {
  console.log('Rendering copy card for play ID:', playId);
  
  if (!currentPlayData) {
    console.log('No current play data available');
    return '<div class="copy-card-error">Play data not available</div>';
  }
  
  // Find the play in the current data
  let targetPlay = null;
  let homeTeamData = null;
  let awayTeamData = null;
  
  for (const drive of currentPlayData.drives) {
    if (drive.plays && drive.plays.items) {
      for (const play of drive.plays.items) {
        if (play.id === playId) {
          targetPlay = play;
          break;
        }
      }
    }
    if (targetPlay) break;
  }
  
  if (!targetPlay) {
    console.log('Play not found in current data');
    return '<div class="copy-card-error">Play not found</div>';
  }
  
  // Get team data from boxscore
  try {
    const boxScoreUrl = convertToHttps(currentPlayData.boxScoreUrl);
    console.log('Fetching boxscore from:', boxScoreUrl);
    const boxScoreResponse = await fetch(boxScoreUrl);
    const boxScoreData = await boxScoreResponse.json();
    
    console.log('Boxscore data structure:', boxScoreData);
    
    // Check for correct structure
    if (boxScoreData.gamepackageJSON?.boxscore?.teams) {
      console.log('Using gamepackageJSON structure');
      homeTeamData = boxScoreData.gamepackageJSON.boxscore.teams[1]; // Home team
      awayTeamData = boxScoreData.gamepackageJSON.boxscore.teams[0]; // Away team
    } else if (boxScoreData.boxscore?.teams) {
      console.log('Using direct boxscore structure');
      homeTeamData = boxScoreData.boxscore.teams[1]; // Home team
      awayTeamData = boxScoreData.boxscore.teams[0]; // Away team
    } else {
      console.log('Available boxscore keys:', Object.keys(boxScoreData));
      console.log('Using fallback - no team data available');
      homeTeamData = null;
      awayTeamData = null;
    }
    
    console.log('Home team data:', homeTeamData);
    console.log('Away team data:', awayTeamData);
    
  } catch (error) {
    console.error('Error fetching team data:', error);
    console.log('Using fallback - team data fetch failed');
    homeTeamData = null;
    awayTeamData = null;
  }
  
  // Get basic play info
  const period = targetPlay.period?.number || 1;
  const periodType = period > 4 ? 'OT' : 'Q';
  const periodNumber = period > 4 ? period - 4 : period;
  const clock = targetPlay.clock?.displayValue || '';
  const awayScore = targetPlay.awayScore || 0;
  const homeScore = targetPlay.homeScore || 0;
  const shortText = targetPlay.shortText || targetPlay.text || '';
  const downDistanceText = targetPlay.start?.downDistanceText || targetPlay.end?.downDistanceText || '';

  // Get team logos
  const homeTeamLogo = homeTeamData?.team?.logo || homeTeamData?.team?.logos?.[0]?.href || 'football.png';
  const awayTeamLogo = awayTeamData?.team?.logo || awayTeamData?.team?.logos?.[0]?.href || 'football.png';
  
  // Process participants
  let participantsList = [];
  if (targetPlay.participants) {
    const participantPromises = targetPlay.participants.map(async (participant) => {
      if (participant.athlete?.$ref) {
        try {
          const athleteResponse = await fetch(convertToHttps(participant.athlete.$ref));
          const athleteData = await athleteResponse.json();
          
          return {
            name: athleteData.shortName || athleteData.displayName || 'Unknown',
            fullName: athleteData.fullName || athleteData.displayName || 'Unknown',
            headshot: athleteData.headshot?.href || '',
            jersey: athleteData.jersey || '',
            position: athleteData.position?.abbreviation || '',
            team: participant.team || targetPlay.team,
            type: participant.type || '',
            order: participant.order || 1,
            stats: participant.stats || []
          };
        } catch (error) {
          console.error('Error fetching athlete data:', error);
          return {
            name: 'Unknown',
            fullName: 'Unknown',
            headshot: '',
            jersey: '',
            position: '',
            team: participant.team || targetPlay.team,
            type: participant.type || '',
            order: participant.order || 1,
            stats: participant.stats || []
          };
        }
      }
      return null;
    });
    
    const resolvedParticipants = await Promise.all(participantPromises);
    participantsList = resolvedParticipants.filter(p => p !== null);
  }
  
  // Sort participants by order (main participant first)
  participantsList.sort((a, b) => a.order - b.order);
  
  // Check for special cases using play type ID
  const playTypeId = targetPlay.type?.id;
  const isSpecialPlayType = ['53', '26', '52', '29', '7'].includes(playTypeId); // Kickoff, Interception, Punt, Fumble, Sack
  const isRushingPlay = playTypeId === '5'; // Rush
  const isPassingPlay = playTypeId === '24'; // Pass Reception
  const isScoringPlay = targetPlay.scoringPlay || targetPlay.text?.toLowerCase().includes('touchdown');
  
  console.log('Play type ID:', playTypeId, 'Is special:', isSpecialPlayType, 'Is scoring:', isScoringPlay);
  console.log('Available participant types:', participantsList.map(p => `${p.name}: ${p.type}`));
  
  // Get main participant
  let mainParticipant;
  
  // First check if it's a scoring play and prioritize the scorer
  if (isScoringPlay) {
    const scorer = participantsList.find(p => 
      p.type === 'scorer' || p.type === 'rusher' || p.type === 'receiver'
    );
    if (scorer) {
      console.log('Found scoring participant:', scorer?.name, 'Type:', scorer?.type);
      mainParticipant = scorer;
    }
  }
  
  // If no scorer found or not a scoring play, use regular logic
  if (!mainParticipant) {
    if (isSpecialPlayType && participantsList.length > 1) {
      // For special play types, look for recoverer, returner, or sackedBy participant type
      const specialParticipant = participantsList.find(p => 
        p.type === 'recoverer' || p.type === 'returner' || p.type === 'sackedBy'
      );
      console.log('Found special participant:', specialParticipant?.name, 'Type:', specialParticipant?.type);
      mainParticipant = specialParticipant || participantsList[0];
    } else if (isRushingPlay) {
      // For rushing plays, prioritize the rusher
      const rusher = participantsList.find(p => p.type === 'rusher');
      mainParticipant = rusher || participantsList[0];
    } else if (isPassingPlay) {
      // For passing plays, prioritize the receiver
      const receiver = participantsList.find(p => p.type === 'receiver');
      mainParticipant = receiver || participantsList[0];
    } else {
      mainParticipant = participantsList[0]; // Use first participant normally
    }
  }
  
  console.log('Selected main participant:', mainParticipant?.name, 'Type:', mainParticipant?.type);
  
  // Reorder participants array to put main participant first
  if (mainParticipant && (isSpecialPlayType || isRushingPlay || isPassingPlay || isScoringPlay)) {
    const otherParticipants = participantsList.filter(p => p.name !== mainParticipant.name);
    participantsList = [mainParticipant, ...otherParticipants];
  }
  
  // Get team data for the main participant to get team colors
  let participantTeamData = null;
  let participantTeamLogo = '';
  let teamColor = '#3498db'; // Default blue
  let teamColorDark = '#2980b9'; // Default dark blue
  
  if (mainParticipant?.team?.$ref) {
    try {
      const teamResponse = await fetch(convertToHttps(mainParticipant.team.$ref));
      participantTeamData = await teamResponse.json();
      participantTeamLogo = participantTeamData.logos?.[0]?.href || '';
      
      // Get team color
      if (participantTeamData.color) {
        teamColor = `#${participantTeamData.color}`;
        // Create a darker shade for the border
        const r = parseInt(participantTeamData.color.substr(0, 2), 16);
        const g = parseInt(participantTeamData.color.substr(2, 2), 16);
        const b = parseInt(participantTeamData.color.substr(4, 2), 16);
        teamColorDark = `rgb(${Math.max(0, r - 40)}, ${Math.max(0, g - 40)}, ${Math.max(0, b - 40)})`;
      }
    } catch (error) {
      console.error('Error fetching participant team data:', error);
    }
  }
  
  // Build participants text with separate rows
  let participantsText = '';
  const seenParticipants = new Set();
  
  participantsList.forEach((participant, index) => {
    if (!seenParticipants.has(participant.name)) {
      seenParticipants.add(participant.name);
      
      if (index > 0) participantsText += '<br>'; // Line break between participants
      
      // First participant in the reordered array is always the main one
      if (index === 0) {
        // Main participant - bold
        participantsText += `<strong>${participant.name}`;
        
        // Add stats if available for main participant
        if (participant.stats && participant.stats.length > 0) {
          participant.stats.forEach(stat => {
            if (stat.displayValue && stat.abbreviation) {
              participantsText += ` • ${stat.displayValue} ${stat.abbreviation}`;
            }
          });
        }
        
        participantsText += `</strong>`;
      } else {
        // Other participants - regular and smaller
        participantsText += `<span class="secondary-participant">${participant.name}`;
        
        // Add stats if available for secondary participant
        if (participant.stats && participant.stats.length > 0) {
          participant.stats.forEach(stat => {
            if (stat.displayValue && stat.abbreviation) {
              participantsText += ` • ${stat.displayValue} ${stat.abbreviation}`;
            }
          });
        }
        
        participantsText += `</span>`;
      }
    }
  });
  
  // Get additional play data
  const yardsAfterCatch = targetPlay.yardsAfterCatch;
  const penalty = targetPlay.penalty;
  
  // Get probability data for the drive team
  let probabilityText = '';
  let probabilityTeamLogo = '';
  if (targetPlay.probability?.$ref) {
    try {
      const probResponse = await fetch(convertToHttps(targetPlay.probability.$ref));
      const probData = await probResponse.json();
      
      const homeWinPct = probData.homeWinPercentage || 0;
      const awayWinPct = probData.awayWinPercentage || 0;
      
      // Determine if the drive team is home or away based on the main participant's team
      const driveTeamId = participantTeamData?.id;
      const homeTeamId = homeTeamData?.team?.id;
      const awayTeamId = awayTeamData?.team?.id;
      
      if (driveTeamId === homeTeamId) {
        // Drive team is home team
        probabilityText = `${(homeWinPct * 100).toFixed(2)}%`;
        probabilityTeamLogo = participantTeamLogo;
      } else if (driveTeamId === awayTeamId) {
        // Drive team is away team
        probabilityText = `${(awayWinPct * 100).toFixed(2)}%`;
        probabilityTeamLogo = participantTeamLogo;
      } else {
        // Fallback to higher percentage
        if (homeWinPct > awayWinPct) {
          probabilityText = `${(homeWinPct * 100).toFixed(2)}%`;
          probabilityTeamLogo = homeTeamLogo;
        } else {
          probabilityText = `${(awayWinPct * 100).toFixed(2)}%`;
          probabilityTeamLogo = awayTeamLogo;
        }
      }
    } catch (error) {
      console.error('Error fetching probability data:', error);
    }
  }
  
  const playCardId = `play-copy-card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  return `
    <div id="${playCardId}" class="play-copy-card" style="position: relative;">
      <div class="copy-card-header">
        <div class="copy-score-section">
          <img src="${convertToHttps(awayTeamLogo)}" alt="Away" class="copy-team-logo">
          <span class="copy-score">${awayScore} - ${homeScore}</span>
          <img src="${convertToHttps(homeTeamLogo)}" alt="Home" class="copy-team-logo">
        </div>
        <div class="copy-game-info">
          ${periodType}${periodNumber} ${clock} • ${downDistanceText}
        </div>
      </div>
      
      <div class="copy-card-main">
        <div class="copy-player-section">
          ${mainParticipant?.headshot ? `
            <div class="copy-player-image-container">
              <div class="copy-player-image">
                <img src="${convertToHttps(mainParticipant.headshot)}" alt="${mainParticipant.name}" class="copy-player-headshot">
              </div>
              ${participantTeamLogo ? `<img src="${convertToHttps(participantTeamLogo)}" alt="Team" class="copy-player-team-logo">` : ''}
            </div>
          ` : ''}
        </div>
        
        <div class="copy-play-section">
          <div class="copy-play-text">${shortText}</div>
          <div class="copy-participants">${participantsText}</div>
        </div>
      </div>
      
      <div class="copy-card-bottom">
        <div class="copy-additional-info">
          ${yardsAfterCatch ? `<span class="copy-yac">Yards After Catch: ${yardsAfterCatch}</span>` : ''}
          ${penalty ? `
            <div class="copy-penalty">
              ${penalty.type?.text || 'Penalty'} (${penalty.yards || 0} yards)
              ${penalty.status?.text ? `, ${penalty.status.text}` : ''}
            </div>
          ` : ''}
        </div>
        
        ${probabilityText ? `
          <div class="copy-probability">
            <span class="copy-prob-text">W ${probabilityText}</span>
            ${probabilityTeamLogo ? `<img src="${convertToHttps(probabilityTeamLogo)}" alt="Team" class="copy-prob-logo">` : ''}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

const BASE_URL = "https://statsapi.mlb.com";

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

const teamColors = {
  "Arizona Diamondbacks": "#A71930", "Atlanta Braves": "#CE1141", "Baltimore Orioles": "#DF4601", "Boston Red Sox": "#BD3039",
  "Chicago White Sox": "#27251F", "Chicago Cubs": "#0E3386", "Cincinnati Reds": "#C6011F", "Cleveland Guardians": "#E50022",
  "Colorado Rockies": "#333366", "Detroit Tigers": "#0C2340", "Houston Astros": "#002D62", "Kansas City Royals": "#004687",
  "Los Angeles Angels": "#BA0021", "Los Angeles Dodgers": "#005A9C", "Miami Marlins": "#00A3E0", "Milwaukee Brewers": "#FFC52F",
  "Minnesota Twins": "#002B5C", "New York Yankees": "#003087", "New York Mets": "#FF5910", "Athletics": "#EFB21E",
  "Philadelphia Phillies": "#E81828", "Pittsburgh Pirates": "#FDB827", "San Diego Padres": "#2F241D", "San Francisco Giants": "#FD5A1E",
  "Seattle Mariners": "#005C5C", "St. Louis Cardinals": "#C41E3A", "Tampa Bay Rays": "#092C5C", "Texas Rangers": "#003278",
  "Toronto Blue Jays": "#134A8E", "Washington Nationals": "#AB0003",
  // Additional short name mappings
  "Royals": "#004687", "Diamondbacks": "#A71930", "Braves": "#13274F", "Orioles": "#000000", "Red Sox": "#0C2340",
  "White Sox": "#000000", "Cubs": "#0E3386", "Reds": "#C6011F", "Guardians": "#0F223E", "Rockies": "#333366",
  "Tigers": "#0C2340", "Astros": "#002D62", "Angels": "#BA0021", "Dodgers": "#A5ACAF", "Marlins": "#00A3E0",
  "Brewers": "#FFC52F", "Twins": "#002B5C", "Yankees": "#003087", "Mets": "#002D72", "Phillies": "#E81828",
  "Pirates": "#27251F", "Padres": "#2F241D", "Giants": "#000000", "Mariners": "#005C5C", "Cardinals": "#C41E3A",
  "Rays": "#092C5C", "Rangers": "#003278", "Blue Jays": "#1D2D5C", "Nationals": "#AB0003"
};

async function getLogoUrl(teamName) {
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

function getQueryParam(param) {
  return new URLSearchParams(window.location.search).get(param);
}

function ordinalSuffix(n) {
  if (n > 3 && n < 21) return n + "th";
  switch (n % 10) {
    case 1: return n + "st";
    case 2: return n + "nd";
    case 3: return n + "rd";
    default: return n + "th";
  }
}

function renderBases(runners) {
  return `
    <div class="diamond">
      <div class="base second ${runners.second ? "occupied" : ""}"></div>
      <div class="base third ${runners.third ? "occupied" : ""}"></div>
      <div class="base first ${runners.first ? "occupied" : ""}"></div>
    </div>
  `;
}

function renderCount(balls, strikes, outs) {
  return `
    <div class="count-display">
      ${"🔴".repeat(outs)}${"⚪".repeat(3 - outs)} <br><br> Balls: ${balls} | Strikes: ${strikes}
    </div>
  `;
}

async function renderTopScoreboard(away, home, awayTeamData, homeTeamData, state, count, runners) {
  const isSmallScreen = window.innerWidth <= 525;
  let awayLogo, homeLogo;
    
    if (away.team.name === "American League All-Stars") {
      awayLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/331.svg`; 
      homeLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/332.svg`;
    } else if (away.team.name === "National League All-Stars") {
      awayLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/332.svg`; 
      homeLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/331.svg`;
    } else {
      awayLogo = await getLogoUrl(away.team.name);
      homeLogo = await getLogoUrl(home.team.name);
    }
  const isFinal = state.inning === "Final";
  const inningText = isFinal
    ? `<span style="font-size: ${isSmallScreen ? '0.9rem' : '1.5rem'};">Final</span>`
    : `${state.isTopInning ? "Top" : "Bottom"} ${ordinalSuffix(state.inning)}`;

  const awayRecord = awayTeamData.record?.leagueRecord;
  const homeRecord = homeTeamData.record?.leagueRecord;

  // Determine which team's score should be greyed out only if the game is final
  const awayScore = away.teamStats.batting.runs;
  const homeScore = home.teamStats.batting.runs;
  const awayScoreColor = isFinal && awayScore < homeScore ? "grey" : "white";
  const homeScoreColor = isFinal && homeScore < awayScore ? "grey" : "white";

  document.getElementById("topScoreboard").innerHTML = `
    <div class="team-block">
      <div class="away-team-score" style="color: ${awayScoreColor};">${awayScore}</div>
      <img class="team-logo" src="${awayLogo}" alt="${awayTeamData.teamName}">
      <div class="team-abbr">${awayTeamData.teamName}</div>
      <div class="team-record">${awayRecord ? `${awayRecord.wins}-${awayRecord.losses}` : "Record unavailable"}</div>
    </div>

    <div class="inning-center">
      <div class="inning-status">${inningText}</div>
      ${isFinal ? "" : renderBases(runners)}
      ${isFinal ? "" : renderCount(count.balls, count.strikes, count.outs)}
    </div>

    <div class="team-block">
      <div class="home-team-score" style="color: ${homeScoreColor};">${homeScore}</div>
      <img class="team-logo" src="${homeLogo}" alt="${homeTeamData.teamName}">
      <div class="team-abbr">${homeTeamData.teamName}</div>
      <div class="team-record">${homeRecord ? `${homeRecord.wins}-${homeRecord.losses}` : "Record unavailable"}</div>
    </div>
  `;
}

function normalizeTeamName(teamName) {
  // Convert team names to the format used in the streaming site URLs
  const nameMap = {
    "Arizona Diamondbacks": "arizona-diamondbacks",
    "Atlanta Braves": "atlanta-braves", 
    "Baltimore Orioles": "baltimore-orioles",
    "Boston Red Sox": "boston-red-sox",
    "Chicago White Sox": "chicago-white-sox",
    "Chicago Cubs": "chicago-cubs",
    "Cincinnati Reds": "cincinnati-reds",
    "Cleveland Guardians": "cleveland-guardians",
    "Colorado Rockies": "colorado-rockies",
    "Detroit Tigers": "detroit-tigers",
    "Houston Astros": "houston-astros",
    "Kansas City Royals": "kansas-city-royals",
    "Los Angeles Angels": "los-angeles-angels",
    "Los Angeles Dodgers": "los-angeles-dodgers",
    "Miami Marlins": "miami-marlins",
    "Milwaukee Brewers": "milwaukee-brewers",
    "Minnesota Twins": "minnesota-twins",
    "New York Yankees": "new-york-yankees",
    "New York Mets": "new-york-mets",
    "Athletics": "athletics",
    "Philadelphia Phillies": "philadelphia-phillies",
    "Pittsburgh Pirates": "pittsburgh-pirates",
    "San Diego Padres": "san-diego-padres",
    "San Francisco Giants": "san-francisco-giants",
    "Seattle Mariners": "seattle-mariners",
    "St. Louis Cardinals": "st-louis-cardinals",
    "Tampa Bay Rays": "tampa-bay-rays",
    "Texas Rangers": "texas-rangers",
    "Toronto Blue Jays": "toronto-blue-jays",
    "Washington Nationals": "washington-nationals",
    "American League All-Stars": "american-league-all-stars",
    "National League All-Stars": "national-league-all-stars"
  };
  
  // First check if we have a direct mapping
  if (nameMap[teamName]) {
    return nameMap[teamName];
  }
  
  // Convert team names to streaming format with proper special character handling
  return teamName.toLowerCase()
    .replace(/á/g, 'a')
    .replace(/é/g, 'e')
    .replace(/í/g, 'i')
    .replace(/ó/g, 'o')
    .replace(/ú/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/ç/g, 'c')
    .replace(/ß/g, 'ss')
    .replace(/ë/g, 'e')
    .replace(/ï/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ä/g, 'a')
    .replace(/å/g, 'a')
    .replace(/ø/g, 'o')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function extractVideoPlayerUrl(pageUrl) {
  try {
    console.log('Extracting video URL from:', pageUrl);

    // Use a CORS proxy to fetch the page content with timeout
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(pageUrl)}`;

    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    const response = await fetch(proxyUrl, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('Proxy request failed:', response.status);
      return null;
    }

    const data = await response.json();

    if (!data.contents) {
      console.error('No content received from proxy');
      return null;
    }

    console.log('Received page content, length:', data.contents.length);

    // More comprehensive regex patterns for different streaming providers
    const patterns = [
      // Original patterns
      /src="([^"]*castweb\.xyz[^"]*)"/i,
      /iframe[^>]*src="([^"]*\.php[^"]*)"/i,

      // Common streaming patterns
      /src="([^"]*\.m3u8[^"]*)"/i,  // HLS streams
      /src="([^"]*\.mp4[^"]*)"/i,   // MP4 streams
      /src="([^"]*embed[^"]*\.php[^"]*)"/i,  // Embed PHP files
      /iframe[^>]*src="([^"]*player[^"]*\.php[^"]*)"/i,  // Player PHP files
      /src="([^"]*stream[^"]*\.php[^"]*)"/i,  // Stream PHP files

      // Alternative streaming providers
      /src="([^"]*vidplay[^"]*)"/i,
      /src="([^"]*streamtape[^"]*)"/i,
      /src="([^"]*doodstream[^"]*)"/i,
      /src="([^"]*mixdrop[^"]*)"/i,
      /src="([^"]*upstream[^"]*)"/i,

      // Generic iframe sources
      /<iframe[^>]*src="([^"]+)"/i,
      /<embed[^>]*src="([^"]+)"/i,
      /<video[^>]*src="([^"]+)"/i,

      // Data attributes that might contain URLs
      /data-src="([^"]+)"/i,
      /data-url="([^"]+)"/i,
      /data-stream="([^"]+)"/i
    ];

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = data.contents.match(pattern);
      if (match && match[1]) {
        const extractedUrl = match[1];
        console.log(`Pattern ${i} matched: ${extractedUrl}`);

        // Validate the URL
        try {
          new URL(extractedUrl);
          return extractedUrl;
        } catch (urlError) {
          console.log(`Invalid URL format: ${extractedUrl}, trying next pattern`);
          continue;
        }
      }
    }

    console.log('No video URLs found with any pattern');

    // Log a sample of the content for debugging
    const contentSample = data.contents.substring(0, 500);
    console.log('Page content sample:', contentSample);

    return null;

  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Request timeout for:', pageUrl);
    } else {
      console.error('Error extracting video player URL:', error);
    }
    return null;
  }
}

// Global variables for stream functionality
let currentStreamType = 'alpha1'; // Track which stream type is active ('alpha1', 'alpha2', 'bravo', 'charlie')
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

    console.log('Fetching live matches from API...');
    const response = await fetch(`${STREAM_API_BASE}/matches/live`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
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

    // Filter matches by baseball
    const matches = allMatches.filter(match => {
      const matchSport = match.sport || match.category;
      return matchSport === 'baseball';
    });
    console.log(`Filtered to ${matches.length} MLB matches`);

    // Cache the response
    liveMatchesCache = matches;
    cacheTimestamp = now;
    
    return matches;
  } catch (error) {
    console.error('Error fetching live matches:', error);
    return null;
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
    console.log(`Finding streams for: ${awayTeamName} vs ${homeTeamName}`);

    const liveMatches = await fetchLiveMatches();
    if (!liveMatches || !Array.isArray(liveMatches) || liveMatches.length === 0) {
      console.log('No live matches data available');
      return {};
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
    const quickMatches = liveMatches.slice(0, Math.min(liveMatches.length, 100)).filter(match => {
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
        const homeHasMatch = title.includes(homeNormalized.split('-')[0]) ||
                            title.includes(homeNormalized.split('-')[1] || '') ||
                            (match.teams?.home?.name?.toLowerCase().includes(homeNormalized.split('-')[0]));
        const awayHasMatch = title.includes(awayNormalized.split('-')[0]) ||
                            title.includes(awayNormalized.split('-')[1] || '') ||
                            (match.teams?.away?.name?.toLowerCase().includes(awayNormalized.split('-')[0]));

        // Require BOTH teams to match, not just one
        return homeHasMatch && awayHasMatch;
      }
    });

    // If we found quick matches, prioritize them
    const matchesToProcess = quickMatches.length > 0 ? quickMatches : liveMatches.slice(0, Math.min(liveMatches.length, 100));

    console.log(`Processing ${matchesToProcess.length} matches (${quickMatches.length > 0 ? 'pre-filtered' : 'full set'})`);

    // Debug: Show first few matches to understand API format
    if (liveMatches.length > 0) {
      console.log('Sample matches from API:');
      for (let i = 0; i < Math.min(5, liveMatches.length); i++) {
        const match = liveMatches[i];
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

            homeParts.forEach(part => {
              if (titleWords.some(word => word.includes(part) || part.includes(word))) score += 0.4;
            });
            awayParts.forEach(part => {
              if (titleWords.some(word => word.includes(part) || part.includes(word))) score += 0.4;
            });
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
              // Normal case: rough matching against API team names
              const homeParts = homeNormalized.split('-').filter(word => word.length > 2);
              const awayParts = awayNormalized.split('-').filter(word => word.length > 2);

              homeParts.forEach(part => {
                if (homeApiName.includes(part)) score += 0.6;
              });
              awayParts.forEach(part => {
                if (awayApiName.includes(part)) score += 0.6;
              });
            }
          }
          return score;
        },
        // Strategy 3: MLB-specific abbreviations and common names
        () => {
          const abbreviations = {
            'arizona': ['arizona', 'diamondbacks', 'arizona-diamondbacks'],
            'atlanta': ['atlanta', 'braves', 'atlanta-braves'],
            'baltimore': ['baltimore', 'orioles', 'baltimore-orioles'],
            'boston': ['boston', 'red-sox', 'boston-red-sox'],
            'chicago': ['chicago', 'white-sox', 'cubs', 'chicago-white-sox', 'chicago-cubs'],
            'cincinnati': ['cincinnati', 'reds', 'cincinnati-reds'],
            'cleveland': ['cleveland', 'guardians', 'cleveland-guardians'],
            'colorado': ['colorado', 'rockies', 'colorado-rockies'],
            'detroit': ['detroit', 'tigers', 'detroit-tigers'],
            'houston': ['houston', 'astros', 'houston-astros'],
            'kansas': ['kansas', 'royals', 'kansas-city-royals'],
            'los-angeles': ['los-angeles', 'angels', 'dodgers', 'los-angeles-angels', 'los-angeles-dodgers'],
            'miami': ['miami', 'marlins', 'miami-marlins'],
            'milwaukee': ['milwaukee', 'brewers', 'milwaukee-brewers'],
            'minnesota': ['minnesota', 'twins', 'minnesota-twins'],
            'new-york': ['new-york', 'yankees', 'mets', 'new-york-yankees', 'new-york-mets'],
            'oakland': ['oakland', 'athletics', 'oakland-athletics'],
            'philadelphia': ['philadelphia', 'phillies', 'philadelphia-phillies'],
            'pittsburgh': ['pittsburgh', 'pirates', 'pittsburgh-pirates'],
            'san-diego': ['san-diego', 'padres', 'san-diego-padres'],
            'san-francisco': ['san-francisco', 'giants', 'san-francisco-giants'],
            'seattle': ['seattle', 'mariners', 'seattle-mariners'],
            'st-louis': ['st-louis', 'cardinals', 'st-louis-cardinals'],
            'tampa': ['tampa', 'rays', 'tampa-bay-rays'],
            'texas': ['texas', 'rangers', 'texas-rangers'],
            'toronto': ['toronto', 'blue-jays', 'toronto-blue-jays'],
            'washington': ['washington', 'nationals', 'washington-nationals']
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

        // Early exit if we find a very good match (score >= 1.0 for rough matching)
        if (bestScore >= 1.0) {
          console.log(`Found excellent match with score ${bestScore}, stopping search early`);
          break;
        }
      }
    }

    if (!bestMatch || bestScore < 0.3) {
      console.log(`No good matching live match found in API (best score: ${bestScore.toFixed(2)})`);
      console.log(`Searched for: ${homeNormalized} vs ${awayNormalized}`);
      console.log(`Processed: ${matchesToProcess.length} matches out of ${liveMatches.length} total`);
      return {};
    }

    console.log(`Found matching match: ${bestMatch.title} (score: ${bestScore.toFixed(2)})`);

    // Validate that the matched game actually contains both team names
    const matchTitle = bestMatch.title.toLowerCase();
    const homeApiName = bestMatch.teams?.home?.name?.toLowerCase() || '';
    const awayApiName = bestMatch.teams?.away?.name?.toLowerCase() || '';

    const titleHasHome = matchTitle.includes(homeNormalized) || homeApiName.includes(homeNormalized);
    const titleHasAway = matchTitle.includes(awayNormalized) || awayApiName.includes(awayNormalized);

    if (!titleHasHome || !titleHasAway) {
      console.log(`WARNING: Matched game "${bestMatch.title}" doesn't contain both team names!`);
      console.log(`Expected: ${homeNormalized} vs ${awayNormalized}`);
      console.log(`Found: ${homeApiName} vs ${awayApiName}`);

      // Try to find a better match by being more strict
      let betterMatch = null;
      let betterScore = 0;

      for (const match of matchesToProcess) {
        if (match === bestMatch) continue; // Skip the one we already found

        const mTitle = match.title.toLowerCase();
        const mHomeApi = match.teams?.home?.name?.toLowerCase() || '';
        const mAwayApi = match.teams?.away?.name?.toLowerCase() || '';

        const mTitleHasHome = mTitle.includes(homeNormalized) || mHomeApi.includes(homeNormalized);
        const mTitleHasAway = mTitle.includes(awayNormalized) || mAwayApi.includes(awayNormalized);

        if (mTitleHasHome && mTitleHasAway) {
          // This match has both teams, calculate its score
          let score = 0;
          if (mTitle.includes(homeNormalized) && mTitle.includes(awayNormalized)) score += 2.0;
          if (mHomeApi.includes(homeNormalized) && mAwayApi.includes(awayNormalized)) score += 2.0;

          if (score > betterScore) {
            betterMatch = match;
            betterScore = score;
          }
        }
      }

      if (betterMatch && betterScore > 0) {
        console.log(`Found better match: ${betterMatch.title} (score: ${betterScore})`);
        bestMatch = betterMatch;
        bestScore = betterScore;
      }
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

    // Fallback: try to create a basic embed URL using the match ID
    console.log('Trying fallback stream URL construction');
    try {
      const homeNormalized = normalizeTeamName(homeTeamName);
      const awayNormalized = normalizeTeamName(awayTeamName);
      const fallbackUrl = `https://streamed.pk/embed/${homeNormalized}-vs-${awayNormalized}`;

      return {
        alpha: fallbackUrl,
        fallback: true
      };
    } catch (fallbackError) {
      console.error('Fallback URL construction failed:', fallbackError);
      return {};
    }
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
          iframe.style.height = '700px';
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

window.handleStreamError = function() {
  console.log('Stream error occurred');
  const connectingDiv = document.getElementById('streamConnecting');
  if (connectingDiv) {
    connectingDiv.innerHTML = '<p>Stream unavailable. Please try another stream option.</p>';
  }
};

window.handleStreamLoad = function() {
  const iframe = document.getElementById('streamIframe');
  const connectingDiv = document.getElementById('streamConnecting');

  if (iframe && connectingDiv) {
    iframe.style.display = 'block';
    connectingDiv.style.display = 'none';
  }
};

function checkStreamContent(iframe) {
  const connectingDiv = document.getElementById('streamConnecting');

  console.log('Checking stream content for iframe:', iframe.src);

  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

    // Simple video detection
    const hasVideo = iframeDoc.querySelector('video') ||
                    iframeDoc.querySelector('.video-js') ||
                    iframeDoc.querySelector('[id*="video"]') ||
                    iframeDoc.querySelector('[class*="player"]');

    if (hasVideo) {
      console.log('Video content detected in iframe');
      iframe.style.display = 'block';
      if (connectingDiv) {
        connectingDiv.style.display = 'none';
      }
      return;
    }
  } catch (e) {
    console.log('Cannot access iframe content (cross-origin), assuming external stream');
    iframe.style.display = 'block';
    if (connectingDiv) {
      connectingDiv.style.display = 'none';
    }
    return;
  }

  // If no video detected, still show the iframe (external stream)
  console.log('No video detected or cross-origin, showing iframe anyway');
  iframe.style.display = 'block';
  if (connectingDiv) {
    connectingDiv.style.display = 'none';
  }
}


function renderLinescoreTable(linescore, awayName, homeName) {
  const table = document.getElementById("linescoreTable");

  // Determine the innings to display based on screen size
  const isSmallScreen = window.innerWidth <= 475;
  const currentInning = linescore.currentInning || 1;

  const innings = isSmallScreen
    ? currentInning <= 3
      ? Array.from({ length: 3 }, (_, i) => linescore.innings[i] || { num: i + 1, away: {}, home: {} }) // Always show innings 1-3
      : Array.from({ length: 3 }, (_, i) => linescore.innings[currentInning - 3 + i] || { num: currentInning - 2 + i, away: {}, home: {} }) // Show previous 3 innings
    : Array.from({ length: 9 }, (_, i) => linescore.innings[i] || { num: i + 1, away: {}, home: {} });

  // Generate inning headers
  const inningHeaders = innings.map(inning => `<th>${inning.num}</th>`).join("");

  // Generate away team scores
  const awayScores = innings.map(inning => `<td>${inning.away?.runs ?? "-"}</td>`).join("");

  // Generate home team scores
  const homeScores = innings.map(inning => `<td>${inning.home?.runs ?? "-"}</td>`).join("");

  // Render the linescore table
  table.innerHTML = `
    <table>
      <thead>
        <tr>
          <th></th>
          ${inningHeaders}
          <th></th> <!-- Break between innings and totals -->
          <th>R</th>
          <th>H</th>
          <th>E</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${awayName}</td>
          ${awayScores}
          <td></td> <!-- Break between innings and totals -->
          <td>${linescore.teams.away.runs || 0}</td>
          <td>${linescore.teams.away.hits || 0}</td>
          <td>${linescore.teams.away.errors || 0}</td>
        </tr>
        <tr>
          <td>${homeName}</td>
          ${homeScores}
          <td></td> <!-- Break between innings and totals -->
          <td>${linescore.teams.home.runs || 0}</td>
          <td>${linescore.teams.home.hits || 0}</td>
          <td>${linescore.teams.home.errors || 0}</td>
        </tr>
      </tbody>
    </table>
  `;
}

async function renderPlayerStats(title, headers, players, isPitching = false, battingOrder = [], teamType = "") {
  // Adjust headers for small screens
  const isSmallScreen = window.innerWidth <= 475;
  const filteredHeaders = isSmallScreen
    ? headers.filter(h => (isPitching ? ["IP", "BB", "K"].includes(h.label) : ["AB", "R", "H"].includes(h.label)))
    : headers;

  const cols = filteredHeaders.map(h => `<th>${h.label}</th>`).join("");
  const rows = players.map(p => {
    const isSubbedOut = !isPitching && !battingOrder.includes(p.person.id);
    const rowClass = isSubbedOut ? "subbed-out" : "";

    // Handle position abbreviation
    const position = isPitching
      ? `<span style="color: rgb(97, 97, 97);">${p.stats.pitching.note && /^(?:\(L|\(W|\(S)/.test(p.stats.pitching.note) ? `${p.stats.pitching.note}` : ""}</span>` // Style for pitchers
      : `<span style="color: rgb(97, 97, 97);">${p.position.abbreviation}</span>`; // Style position for batters

    const name = `<td>${p.person.fullName} ${position}</td>`;
    const stats = filteredHeaders.map(h => {
      let value;
      if (h.key === "era" || h.key === "avg") {
        value = p.seasonStats?.[isPitching ? "pitching" : "batting"]?.[h.key];
      } else {
        value = p.stats?.[isPitching ? "pitching" : "batting"]?.[h.key];
      }
      return `<td>${value ?? "-"}</td>`;
    }).join("");

    return `<tr class="${rowClass}">${name}${stats}</tr>`;
  }).join("");

  return `
    <div class="stat-section">
      <h3>${title}</h3>
      <table>
        <thead><tr><th>Player</th>${cols}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

let lastScoreboardHash = null;

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}


async function renderStreamEmbed(awayTeamName, homeTeamName) {
  console.log('MLB renderStreamEmbed called with:', { awayTeamName, homeTeamName });
  
  // Check if stream is already properly initialized and iframe exists
  const existingIframe = document.getElementById('streamIframe');
  if (existingIframe && streamInitialized) {
    console.log('MLB Stream already initialized with existing iframe, preventing recreation to avoid mobile pause');
    return streamContainer.innerHTML; // Return existing content
  }
  
  const streamContainer = document.getElementById('streamEmbed');

  if (!streamContainer) {
    console.error('MLB Stream container not found! Cannot render stream.');
    return;
  }

  console.log('MLB Stream container found, proceeding with stream rendering...');

  // Store current team names for toggle function
  currentAwayTeam = awayTeamName;
  currentHomeTeam = homeTeamName;

  console.log('Storing team names in renderStreamEmbed:', awayTeamName, homeTeamName);
  console.log('Current stored names:', currentAwayTeam, currentHomeTeam);

  const isSmallScreen = window.innerWidth < 525;
  const screenHeight = isSmallScreen ? 250 : 700;

  // Try to fetch streams from API first
  console.log('Attempting to fetch streams from API...');
  availableStreams = await findMatchStreams(awayTeamName, homeTeamName);

  // Generate embed URL based on stream type and available streams
  let embedUrl = '';

  console.log('Requested stream type:', currentStreamType);
  console.log('Available streams:', Object.keys(availableStreams));

  // First, try to use the exact requested stream type
  if (availableStreams[currentStreamType]) {
    embedUrl = availableStreams[currentStreamType].embedUrl;
    console.log(`Using requested stream type: ${currentStreamType}`);
  } else {
    // If exact type not available, fallback with preference order but don't override currentStreamType
    console.log(`Requested stream type '${currentStreamType}' not available, trying fallbacks...`);
    
    if (availableStreams.alpha1) {
      embedUrl = availableStreams.alpha1.embedUrl;
      if (currentStreamType === 'alpha1') {
        console.log('Using alpha1 as requested');
      } else {
        console.log('Falling back to alpha1 (requested type not available)');
      }
    } else if (availableStreams.alpha2) {
      embedUrl = availableStreams.alpha2.embedUrl;
      if (currentStreamType === 'alpha2') {
        console.log('Using alpha2 as requested');
      } else {
        console.log('Falling back to alpha2 (requested type not available)');
      }
    } else if (availableStreams.bravo) {
      embedUrl = availableStreams.bravo.embedUrl;
      if (currentStreamType === 'bravo') {
        console.log('Using bravo as requested');
      } else {
        console.log('Falling back to bravo (requested type not available)');
      }
    } else if (availableStreams.charlie) {
      embedUrl = availableStreams.charlie.embedUrl;
      if (currentStreamType === 'charlie') {
        console.log('Using charlie as requested');
      } else {
        console.log('Falling back to charlie (requested type not available)');
      }
    } else {
      // Use any available stream if alpha1, alpha2, bravo, charlie don't exist
      const streamKeys = Object.keys(availableStreams);
      if (streamKeys.length > 0) {
        const fallbackKey = streamKeys[0];
        embedUrl = availableStreams[fallbackKey].embedUrl;
        console.log(`Using fallback stream: ${fallbackKey}`);
        // Update currentStreamType to the actual stream being used
        currentStreamType = fallbackKey;
      }
    }
  }

  // Fallback to manual URL construction if API doesn't have the stream
  if (!embedUrl) {
    console.log('No streams available from API');
    // Return message that no streams are available
    return `
      <div style="background: #1a1a1a; border-radius: 1rem; padding: 1rem; margin-bottom: 2rem;">
        <div class="stream-header" style="margin-bottom: 10px; text-align: center;">
          <h3 style="color: white; margin: 0;">Live Stream</h3>
        </div>
        <div style="color: white; padding: 20px; background: #333; border-radius: 8px; text-align: center;">
          <p>No streams available at this time. Please try again later.</p>
        </div>
      </div>
    `;
  } else {
    console.log('Using API stream URL:', embedUrl);
  }

  // Determine which buttons to show based on current stream type and available streams
  let button1Text = '';
  let button2Text = '';
  let button1Action = '';
  let button2Action = '';

  // Get all available stream types except the current one
  const availableStreamTypes = Object.keys(availableStreams).filter(type => type !== currentStreamType);
  
  console.log('Available streams:', Object.keys(availableStreams));
  console.log('Current stream type:', currentStreamType);
  console.log('Alternative stream types:', availableStreamTypes);

  if (currentStreamType === 'alpha1') {
    if (availableStreams.alpha2) {
      button1Text = 'Alpha2';
      button1Action = "switchToStream('alpha2')";
    }
    if (availableStreams.charlie) {
      button2Text = 'Charlie';
      button2Action = "switchToStream('charlie')";
    } else if (availableStreams.bravo) {
      button2Text = 'Bravo';
      button2Action = "switchToStream('bravo')";
    }
    // If alpha2 or charlie/bravo not available, show any other available stream
    if (!button1Text && availableStreamTypes.length > 0) {
      const altStream = availableStreamTypes[0];
      button1Text = altStream.charAt(0).toUpperCase() + altStream.slice(1);
      button1Action = `switchToStream('${altStream}')`;
    }
    if (!button2Text && availableStreamTypes.length > 1) {
      const altStream = availableStreamTypes[1];
      button2Text = altStream.charAt(0).toUpperCase() + altStream.slice(1);
      button2Action = `switchToStream('${altStream}')`;
    }
  } else if (currentStreamType === 'alpha2') {
    if (availableStreams.alpha1) {
      button1Text = 'Alpha1';
      button1Action = "switchToStream('alpha1')";
    }
    if (availableStreams.charlie) {
      button2Text = 'Charlie';
      button2Action = "switchToStream('charlie')";
    } else if (availableStreams.bravo) {
      button2Text = 'Bravo';
      button2Action = "switchToStream('bravo')";
    }
    // If alpha1 or charlie/bravo not available, show any other available stream
    if (!button1Text && availableStreamTypes.length > 0) {
      const altStream = availableStreamTypes[0];
      button1Text = altStream.charAt(0).toUpperCase() + altStream.slice(1);
      button1Action = `switchToStream('${altStream}')`;
    }
    if (!button2Text && availableStreamTypes.length > 1) {
      const altStream = availableStreamTypes[1];
      button2Text = altStream.charAt(0).toUpperCase() + altStream.slice(1);
      button2Action = `switchToStream('${altStream}')`;
    }
  } else if (currentStreamType === 'bravo') {
    if (availableStreams.alpha1) {
      button1Text = 'Alpha1';
      button1Action = "switchToStream('alpha1')";
    }
    if (availableStreams.charlie) {
      button2Text = 'Charlie';
      button2Action = "switchToStream('charlie')";
    } else if (availableStreams.alpha2) {
      button2Text = 'Alpha2';
      button2Action = "switchToStream('alpha2')";
    }
    // If alpha1 or charlie/alpha2 not available, show any other available stream
    if (!button1Text && availableStreamTypes.length > 0) {
      const altStream = availableStreamTypes[0];
      button1Text = altStream.charAt(0).toUpperCase() + altStream.slice(1);
      button1Action = `switchToStream('${altStream}')`;
    }
    if (!button2Text && availableStreamTypes.length > 1) {
      const altStream = availableStreamTypes[1];
      button2Text = altStream.charAt(0).toUpperCase() + altStream.slice(1);
      button2Action = `switchToStream('${altStream}')`;
    }
  } else if (currentStreamType === 'charlie') {
    if (availableStreams.alpha1) {
      button1Text = 'Alpha1';
      button1Action = "switchToStream('alpha1')";
    }
    if (availableStreams.alpha2) {
      button2Text = 'Alpha2';
      button2Action = "switchToStream('alpha2')";
    } else if (availableStreams.bravo) {
      button2Text = 'Bravo';
      button2Action = "switchToStream('bravo')";
    }
    // If alpha1 or alpha2/bravo not available, show any other available stream
    if (!button1Text && availableStreamTypes.length > 0) {
      const altStream = availableStreamTypes[0];
      button1Text = altStream.charAt(0).toUpperCase() + altStream.slice(1);
      button1Action = `switchToStream('${altStream}')`;
    }
    if (!button2Text && availableStreamTypes.length > 1) {
      const altStream = availableStreamTypes[1];
      button2Text = altStream.charAt(0).toUpperCase() + altStream.slice(1);
      button2Action = `switchToStream('${altStream}')`;
    }
  } else {
    // For any other stream types, always show available alternatives with preference for alpha1, alpha2, bravo, charlie
    if (availableStreams.alpha1) {
      button1Text = 'Alpha1';
      button1Action = "switchToStream('alpha1')";
    } else if (availableStreams.alpha2) {
      button1Text = 'Alpha2';
      button1Action = "switchToStream('alpha2')";
    } else if (availableStreamTypes.length > 0) {
      const firstAlternative = availableStreamTypes[0];
      button1Text = firstAlternative.charAt(0).toUpperCase() + firstAlternative.slice(1);
      button1Action = `switchToStream('${firstAlternative}')`;
    }

    if (availableStreams.charlie) {
      button2Text = 'Charlie';
      button2Action = "switchToStream('charlie')";
    } else if (availableStreams.bravo) {
      button2Text = 'Bravo';
      button2Action = "switchToStream('bravo')";
    } else if (availableStreams.alpha2 && button1Text !== 'Alpha2') {
      button2Text = 'Alpha2';
      button2Action = "switchToStream('alpha2')";
    } else if (availableStreams.alpha1 && button1Text !== 'Alpha1') {
      button2Text = 'Alpha1';
      button2Action = "switchToStream('alpha1')";
    } else if (availableStreamTypes.length > 1) {
      const secondAlternative = availableStreamTypes[1];
      button2Text = secondAlternative.charAt(0).toUpperCase() + secondAlternative.slice(1);
      button2Action = `switchToStream('${secondAlternative}')`;
    }
  }

  const streamHTML = `
    <div style="background: #1a1a1a; border-radius: 1rem; padding: 1rem; margin-bottom: 2rem;">
      <div class="stream-header" style="margin-bottom: 10px; text-align: center;">
        <h3 style="color: white; margin: 0;">Live Stream (${currentStreamType.toUpperCase()})</h3>
        <div class="stream-controls" style="margin-top: 10px;">
          <button id="fullscreenButton" onclick="toggleFullscreen()" style="padding: 8px 16px; margin: 0 5px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">⛶ Fullscreen</button>
          ${button1Text ? `<button id="streamButton1" onclick="${button1Action}" style="padding: 8px 16px; margin: 0 5px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">${button1Text}</button>` : ''}
          ${button2Text ? `<button id="streamButton2" onclick="${button2Action}" style="padding: 8px 16px; margin: 0 5px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">${button2Text}</button>` : ''}
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
    if (iframe) {
      iframe.style.display = 'block';
      
      // Add mobile-specific optimizations to prevent pausing
      iframe.style.isolation = 'isolate';
      iframe.style.willChange = 'auto';
      iframe.style.backfaceVisibility = 'hidden';
      iframe.style.transform = 'translateZ(0)';
      iframe.setAttribute('data-mobile-optimized', 'true');
      
      const connectingDiv = document.getElementById('streamConnecting');
      if (connectingDiv) {
        connectingDiv.style.display = 'none';
      }
      
      console.log('MLB iframe optimized for mobile streaming');
    }
  }, 1000);

  // Return the HTML content
  console.log('MLB renderStreamEmbed returning HTML content (length:', streamHTML.length, ')');
  return streamHTML;
}

window.switchToStream = function(streamType) {
  console.log('Switching to stream type:', streamType);
  console.log('Current team names:', currentAwayTeam, currentHomeTeam);

  // Update current stream type
  currentStreamType = streamType;

  // If team names are not available, try to get them from other sources
  if (!currentAwayTeam || !currentHomeTeam) {
    console.error('Team names not available for stream switching');
    return;
  }

  // Generate new embed URL using renderStreamEmbed and set the HTML
  if (currentAwayTeam && currentHomeTeam) {
    streamInitialized = false; // Reset flag to allow stream switching
    renderStreamEmbed(currentAwayTeam, currentHomeTeam)
      .then(streamHTML => {
        const streamContainer = document.getElementById('streamEmbed');
        if (streamContainer && streamHTML) {
          streamContainer.innerHTML = streamHTML;
          streamInitialized = true; // Set flag after successful switch
          console.log('MLB Stream switched successfully to:', streamType);
        } else {
          console.error('Failed to switch stream: no container or HTML');
        }
      })
      .catch(error => {
        console.error('Error switching stream:', error);
      });
  } else {
    console.error('Cannot switch streams: team names not available');
  }
};

// Helper function to update button texts based on current stream type
function updateStreamButtons(currentType) {
  const button1 = document.getElementById('streamButton1');
  const button2 = document.getElementById('streamButton2');

  if (currentType === 'alpha1') {
    if (button1) button1.textContent = 'Alpha2';
    if (button2) button2.textContent = 'Bravo';
  } else if (currentType === 'alpha2') {
    if (button1) button1.textContent = 'Alpha1';
    if (button2) button2.textContent = 'Bravo';
  } else if (currentType === 'bravo') {
    if (button1) button1.textContent = 'Alpha1';
    if (button2) button2.textContent = 'Alpha2';
  } else {
    // For other stream types, try to show alternatives
    if (button1) button1.textContent = 'Alpha1';
    if (button2) button2.textContent = 'Bravo';
  }
}

// Stream testing functionality
let streamTestTimeout = null;
let isStreamTesting = false;

async function testStream(url) {
  return new Promise((resolve) => {
    const testIframe = document.createElement('iframe');
    testIframe.src = url;
    testIframe.style.display = 'none';
    testIframe.style.width = '1px';
    testIframe.style.height = '1px';

    let hasLoaded = false;
    let hasError = false;

    const cleanup = () => {
      if (testIframe.parentNode) {
        testIframe.parentNode.removeChild(testIframe);
      }
      if (streamTestTimeout) {
        clearTimeout(streamTestTimeout);
        streamTestTimeout = null;
      }
    };

    testIframe.onload = () => {
      hasLoaded = true;
      console.log('Stream test: iframe loaded successfully');
      cleanup();
      resolve(true);
    };

    testIframe.onerror = () => {
      hasError = true;
      console.log('Stream test: iframe failed to load');
      cleanup();
      resolve(false);
    };

    // Add to DOM to start loading
    document.body.appendChild(testIframe);

    // Timeout after 10 seconds
    streamTestTimeout = setTimeout(() => {
      if (!hasLoaded && !hasError) {
        console.log('Stream test: timeout after 10 seconds');
        cleanup();
        resolve(false);
      }
    }, 10000);
  });
}

async function tryNextStream() {
  if (isStreamTesting) return;
  isStreamTesting = true;

  console.log('Trying next available stream...');

  const streamOrder = ['alpha1', 'alpha2', 'bravo'];
  const currentIndex = streamOrder.indexOf(currentStreamType);

  // Try streams in order: current -> next -> next -> back to first
  for (let i = 1; i <= streamOrder.length; i++) {
    const nextIndex = (currentIndex + i) % streamOrder.length;
    const nextStreamType = streamOrder[nextIndex];

    if (availableStreams[nextStreamType]) {
      console.log(`Testing stream: ${nextStreamType}`);

      let testUrl = '';
      if (availableStreams[nextStreamType].embedUrl) {
        testUrl = availableStreams[nextStreamType].embedUrl;
      } else {
        // Fallback URL construction
        const homeNormalized = normalizeTeamName(currentHomeTeam);
        const awayNormalized = normalizeTeamName(currentAwayTeam);

        if (nextStreamType === 'alpha1') {
          testUrl = `https://embedsports.top/embed/alpha/${awayNormalized}-vs-${homeNormalized}/1`;
        } else if (nextStreamType === 'alpha2') {
          testUrl = `https://embedsports.top/embed/alpha/${awayNormalized}-vs-${homeNormalized}/2`;
        } else if (nextStreamType === 'bravo') {
          const timestamp = Date.now();
          testUrl = `https://embedsports.top/embed/bravo/${timestamp}-${awayNormalized}-${homeNormalized}-english-/1`;
        }
      }

      const isWorking = await testStream(testUrl);
      if (isWorking) {
        console.log(`Stream ${nextStreamType} is working, switching to it`);
        switchToStream(nextStreamType);
        isStreamTesting = false;
        return;
      }
    }
  }

  console.log('No working streams found');
  isStreamTesting = false;
}

function startStreamTesting() {
  if (isStreamTesting) return;

  console.log('Starting automatic stream testing...');

  // Test current stream first
  const currentIframe = document.getElementById('streamIframe');
  if (currentIframe && currentIframe.src) {
    testStream(currentIframe.src).then(isWorking => {
      if (!isWorking) {
        console.log('Current stream not working, trying next stream...');
        tryNextStream();
      } else {
        console.log('Current stream is working');
      }
    });
  } else {
    // No current stream, try to find a working one
    tryNextStream();
  }
}

// Make stream testing functions available globally
window.testStream = testStream;
window.tryNextStream = tryNextStream;
window.startStreamTesting = startStreamTesting;

async function fetchAndUpdateScoreboard(gamePk) {
  try {
    const res = await fetch(`${BASE_URL}/api/v1.1/game/${gamePk}/feed/live`);
    const text = await res.text();
    const newHash = hashString(text);

    if (newHash === lastScoreboardHash) {
      return; // No changes, skip update
    }
    lastScoreboardHash = newHash;

    const data = JSON.parse(text);

    // Ensure required data exists
    if (!data || !data.liveData || !data.gameData) {
      throw new Error("Incomplete game data");
    }

    const { boxscore } = data.liveData;
    const { linescore } = data.liveData;
    const currentPlay = data.liveData.plays?.currentPlay || {};
    const baseState = linescore?.offense || {};
    const count = currentPlay.count || { balls: 0, strikes: 0, outs: 0 };

    const away = boxscore?.teams?.away || {};
    const home = boxscore?.teams?.home || {};

    const awayTeamData = data.gameData.teams?.away || {};
    const homeTeamData = data.gameData.teams?.home || {};

    const detailedState = data.gameData.status?.detailedState || "Unknown";
    const codedGameState = data.gameData.status?.codedGameState || "";

    // Determine if the game is in progress
    const isInProgress = ["In Progress", "Manager challenge"].includes(detailedState) || codedGameState === "M";
    const isGameOver = ["Final", "Game Over", "Completed Early"].includes(detailedState) || codedGameState === "F";

    // Fetch small team logos
    let awayLogo, homeLogo;
    
    if (away.team.name === "American League All-Stars") {
      awayLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/331.svg`; 
      homeLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/332.svg`;
    } else if (away.team.name === "National League All-Stars") {
      awayLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/332.svg`; 
      homeLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/331.svg`;
    } else {
      awayLogo = await getLogoUrl(away.team?.name || "Unknown");
      homeLogo = await getLogoUrl(home.team?.name || "Unknown");
    }

    // Render the top scoreboard
    await renderTopScoreboard(
      away,
      home,
      awayTeamData,
      homeTeamData,
      isInProgress ? currentPlay.about : { inning: "Final", isTopInning: false },
      isInProgress ? count : { balls: 0, strikes: 0, outs: 0 },
      isInProgress
        ? { first: !!baseState.first, second: !!baseState.second, third: !!baseState.third }
        : { first: false, second: false, third: false }
    );

    // Render the linescore table
    renderLinescoreTable(linescore || {}, awayTeamData.abbreviation || "AWAY", homeTeamData.abbreviation || "HOME");

    // Add stream embed (only render once and only for in-progress games)
    // This is done asynchronously to not block the box score rendering
    const streamContainer = document.getElementById("streamEmbed");
    console.log('MLB Stream check:', { streamContainer: !!streamContainer, isInProgress, streamInitialized, awayTeam: away.team?.name, homeTeam: home.team?.name });
    
    if (streamContainer && isInProgress && !streamInitialized) {
      console.log('MLB Game is in progress, initializing stream...');
      // Don't await - render stream asynchronously to avoid blocking box score
      renderStreamEmbed(away.team?.name || "Unknown", home.team?.name || "Unknown")
        .then(streamHTML => {
          streamContainer.innerHTML = streamHTML;
          streamInitialized = true; // Set flag after successful initialization
          console.log('MLB Stream initialized successfully');
          
          console.log('Initial stream setup - Team names:', away.team?.name, home.team?.name);
          console.log('Stored team names:', currentAwayTeam, currentHomeTeam);
          
          // Ensure team names are stored
          if (away.team?.name && home.team?.name) {
            currentAwayTeam = away.team.name;
            currentHomeTeam = home.team.name;
            console.log('Team names stored successfully:', currentAwayTeam, currentHomeTeam);
          }
        })
        .catch(error => {
          console.error('Error rendering stream embed:', error);
        });
    } else if (streamContainer && !isInProgress && streamInitialized) {
      console.log('MLB Game is not in progress, clearing stream...');
      // Clear stream container if game is no longer in progress and reset flag
      streamContainer.innerHTML = '';
      streamInitialized = false; // Reset flag when game is no longer in progress
      console.log('MLB Stream container cleared and flag reset');
    } else {
      console.log('MLB Stream conditions not met or already initialized');
    }

    // Hide bases, outs, and count if the game is not in progress
    const inningCenter = document.querySelector(".inning-center");
    const isSmallScreen = window.innerWidth <= 525;
    if (!isInProgress && inningCenter) {
      inningCenter.innerHTML = `<div class="inning-status" style="font-size: ${isSmallScreen ? '1.75rem' : '3.5rem'};"> ${isGameOver ? "Final" : "Scheduled"}</div>`; // Replace with "Final"
    }

    // Render player stats
    const playerStatsDiv = document.getElementById("playerStats");

    // Filter out pitchers from batters
    const awayBatters = (away.batters || [])
      .map(id => away.players?.[`ID${id}`])
      .filter(player => player && player.position?.abbreviation !== "P");
    const homeBatters = (home.batters || [])
      .map(id => home.players?.[`ID${id}`])
      .filter(player => player && player.position?.abbreviation !== "P");

    const awayPitchers = (away.pitchers || []).map(id => away.players?.[`ID${id}`]).filter(Boolean);
    const homePitchers = (home.pitchers || []).map(id => home.players?.[`ID${id}`]).filter(Boolean);

    playerStatsDiv.innerHTML = `
    <div class="stat-section">
      <h3><img src="${awayLogo}" alt="Away Team Logo" class="small-team-logo"> ${awayTeamData.teamName || "Away Team"} Hitting</h3>
      ${await renderPlayerStats("", [
        { label: "AB", key: "atBats" },
        { label: "R", key: "runs" },
        { label: "H", key: "hits" },
        { label: "RBI", key: "rbi" },
        { label: "HR", key: "homeRuns" },
        { label: "BB", key: "baseOnBalls" },
        { label: "K", key: "strikeOuts" },
        { label: "AVG", key: "avg" }
      ], awayBatters, false, away.battingOrder || [])}

      <h3><img src="${awayLogo}" alt="Away Team Logo" class="small-team-logo"> ${awayTeamData.teamName || "Away Team"} Pitching</h3>
      ${await renderPlayerStats("", [
        { label: "IP", key: "inningsPitched" },
        { label: "H", key: "hits" },
        { label: "R", key: "runs" },
        { label: "ER", key: "earnedRuns" },
        { label: "BB", key: "baseOnBalls" },
        { label: "HR", key: "homeRuns" },
        { label: "K", key: "strikeOuts" },
        { label: "ERA", key: "era" }
      ], awayPitchers, true)}
      <br><br><br><br>
      <h3><img src="${homeLogo}" alt="Home Team Logo" class="small-team-logo"> ${homeTeamData.teamName || "Home Team"} Hitting</h3>
      ${await renderPlayerStats("", [
        { label: "AB", key: "atBats" },
        { label: "R", key: "runs" },
        { label: "H", key: "hits" },
        { label: "RBI", key: "rbi" },
        { label: "HR", key: "homeRuns" },
        { label: "BB", key: "baseOnBalls" },
        { label: "K", key: "strikeOuts" },
        { label: "AVG", key: "avg" }
      ], homeBatters, false, home.battingOrder || [])}

      <h3><img src="${homeLogo}" alt="Home Team Logo" class="small-team-logo"> ${homeTeamData.teamName || "Home Team"} Pitching</h3>
      ${await renderPlayerStats("", [
        { label: "IP", key: "inningsPitched" },
        { label: "H", key: "hits" },
        { label: "R", key: "runs" },
        { label: "ER", key: "earnedRuns" },
        { label: "BB", key: "baseOnBalls" },
        { label: "HR", key: "homeRuns" },
        { label: "K", key: "strikeOuts" },
        { label: "ERA", key: "era" }
      ], homePitchers, true)}
    </div>
    `;

    // Update play-by-play if it's currently visible
    const playsContent = document.getElementById('playsContent');
    if (playsContent && playsContent.classList.contains('active')) {
      await renderPlayByPlay(gamePk, data);
    }

    // Update momentum chart if team stats tab is currently visible
    const teamStatsContent = document.getElementById('teamStatsContent');
    if (teamStatsContent && teamStatsContent.classList.contains('active')) {
      const awayColor = teamColors[away.team?.name] || '#f44336';
      const homeColor = teamColors[home.team?.name] || '#4CAF50';
      await renderWinProbabilityChart(gamePk, awayColor, homeColor, away.team?.name || 'Away', home.team?.name || 'Home');
    }

    // Return true if game is over to stop further updates
    return isGameOver;
  } catch (error) {
    console.error("Failed to load scoreboard:", error);
    document.getElementById("scoreboardContainer").innerHTML = "<p>Error loading game data.</p>";
    return true; // Stop fetching on error
  }
}

window.showStats = function() {
  const teamStatsBtn = document.getElementById('teamStatsBtn');
  const statsBtn = document.getElementById('statsBtn');
  const playsBtn = document.getElementById('playsBtn');
  const teamStatsContent = document.getElementById('teamStatsContent');
  const statsContent = document.getElementById('statsContent');
  const playsContent = document.getElementById('playsContent');
  const streamEmbed = document.getElementById('streamEmbed');

  teamStatsBtn.classList.remove('active');
  statsBtn.classList.add('active');
  playsBtn.classList.remove('active');
  teamStatsContent.classList.remove('active');
  statsContent.classList.add('active');
  playsContent.classList.remove('active');
  
  // Show stream embed when on player stats
  if (streamEmbed) {
    streamEmbed.style.display = 'block';
  }
};

window.showTeamStats = function() {
  const teamStatsBtn = document.getElementById('teamStatsBtn');
  const statsBtn = document.getElementById('statsBtn');
  const playsBtn = document.getElementById('playsBtn');
  const teamStatsContent = document.getElementById('teamStatsContent');
  const statsContent = document.getElementById('statsContent');
  const playsContent = document.getElementById('playsContent');
  const streamEmbed = document.getElementById('streamEmbed');

  teamStatsBtn.classList.add('active');
  statsBtn.classList.remove('active');
  playsBtn.classList.remove('active');
  teamStatsContent.classList.add('active');
  statsContent.classList.remove('active');
  playsContent.classList.remove('active');
  
  // Hide stream embed when on team stats
  if (streamEmbed) {
    streamEmbed.style.display = 'none';
  }

  // Render team stats if not already loaded
  const gamePk = getQueryParam("gamePk");
  if (gamePk) {
    renderTeamStats(gamePk);
  }
};

window.showPlays = function() {
  const teamStatsBtn = document.getElementById('teamStatsBtn');
  const statsBtn = document.getElementById('statsBtn');
  const playsBtn = document.getElementById('playsBtn');
  const teamStatsContent = document.getElementById('teamStatsContent');
  const statsContent = document.getElementById('statsContent');
  const playsContent = document.getElementById('playsContent');
  const streamEmbed = document.getElementById('streamEmbed');

  teamStatsBtn.classList.remove('active');
  statsBtn.classList.remove('active');
  playsBtn.classList.add('active');
  teamStatsContent.classList.remove('active');
  statsContent.classList.remove('active');
  playsContent.classList.add('active');
  
  // Hide stream embed when on plays
  if (streamEmbed) {
    streamEmbed.style.display = 'none';
  }

  // Fetch and render plays when switching to plays tab
  const gamePk = getQueryParam("gamePk");
  if (gamePk) {
    renderPlayByPlay(gamePk);
  }
};

// Global variables for preserving play-by-play state
let openPlays = new Set(); // Track which plays are open
let playsScrollPosition = 0; // Track scroll position

window.togglePlay = function(index) {
  const playDetails = document.getElementById(`play-${index}`);
  const toggleIcon = document.getElementById(`toggle-${index}`);
  
  if (playDetails.style.display === 'none' || playDetails.style.display === '') {
    playDetails.style.display = 'block';
    toggleIcon.textContent = '▲';
    openPlays.add(index); // Track that this play is open
  } else {
    playDetails.style.display = 'none';
    toggleIcon.textContent = '▼';
    openPlays.delete(index); // Track that this play is closed
  }
};

function renderPitchVisualization(pitchData, details) {
  if (!pitchData || !pitchData.coordinates) {
    return '';
  }

  // Strike zone is 17 inches wide and extends from knees to chest
  // The coordinate system: pX = 0 is center of plate, pZ = strike zone middle
  const plateWidth = 17; // inches
  
  // Convert plate coordinates to percentage within expanded visualization area
  // pX ranges roughly from -0.83 to +0.83 (feet) for the strike zone width
  // We'll expand the visualization to show pitches outside the zone
  // Map pX from -2.0 to +2.0 feet to 0-100% (giving more space around strike zone)
  const xPercent = ((pitchData.coordinates.pX + 2.0) / 4.0) * 100;
  const yPercent = pitchData.strikeZoneTop && pitchData.strikeZoneBottom ? 
    ((pitchData.strikeZoneTop - pitchData.coordinates.pZ) / 
     (pitchData.strikeZoneTop - pitchData.strikeZoneBottom)) * 60 + 20 : 50; // 60% for zone, 20% padding top/bottom

  // Constrain to visualization area but allow outside strike zone
  const finalXPercent = Math.max(5, Math.min(95, xPercent));
  const finalYPercent = Math.max(5, Math.min(95, yPercent));

  // Determine pitch color based on call
  let pitchClass = 'ball-pitch';
  if (details.isStrike) {
    pitchClass = 'strike-pitch';
  } else if (details.isInPlay) {
    pitchClass = 'in-play-pitch';
  }

  return `
    <div class="pitch-visualization">
      <div class="strike-zone-container">
        <div class="strike-zone-outline"></div>
        <div class="pitch-location ${pitchClass}" style="left: ${finalXPercent}%; top: ${finalYPercent}%;"></div>
      </div>
      <div class="pitch-data">
        <div>Speed: ${pitchData.startSpeed?.toFixed(1) || 'N/A'} mph</div>
        <div>Type: ${details.type?.description || 'Unknown'}</div>
        <div>Zone: ${pitchData.zone || 'N/A'}</div>
        ${pitchData.breaks ? `<div>Spin: ${pitchData.breaks.spinRate || 'N/A'} rpm</div>` : ''}
      </div>
    </div>
  `;
}

function renderPlayBases(runners) {
  if (!runners) {
    return '';
  }
  
  return `
    <div class="play-bases">
      <div class="diamond-small">
        <div class="base-small second ${runners.second ? "occupied" : ""}"></div>
        <div class="base-small third ${runners.third ? "occupied" : ""}"></div>
        <div class="base-small first ${runners.first ? "occupied" : ""}"></div>
      </div>
    </div>
  `;
}

async function renderEnhancedScoringPlay(play, teamName, teamLogo, isTopInning, awayTeam, homeTeam, gameData) {
  // Extract score and inning information
  const awayScore = play.result?.awayScore || 0;
  const homeScore = play.result?.homeScore || 0;
  const inning = play.about?.inning || 0;
  const halfInning = play.about?.halfInning || '';
  
  // Format inning display (e.g., "Top 1st", "Bot 1st")
  const inningDisplay = inning > 0 ? 
    `${isTopInning ? 'Top' : 'Bot'} ${ordinalSuffix(inning)}` : 
    '';
  
  // Get team logos for score display
  const homeTeamLogo = homeTeam?.logo || `https://www.mlbstatic.com/team-logos/${homeTeam?.id}.svg`;
  const awayTeamLogo = awayTeam?.logo || `https://www.mlbstatic.com/team-logos/${awayTeam?.id}.svg`;
  // Get all pitches for this at-bat (in original order, not reversed)
  // Filter to only include actual pitches (events with pitch data and speed)
  const pitchEvents = [...(play.playEvents || [])].filter(event => 
    event.pitchData && 
    event.pitchData.startSpeed && 
    event.pitchData.startSpeed > 0
  );
  
  // Get the batter and pitcher information from matchup
  const batterFromMatchup = play.matchup?.batter || {};
  const pitcherFromMatchup = play.matchup?.pitcher || {};
  
  // Find the full player objects from the box score data to get their season stats
  let batterFullData = batterFromMatchup;
  let pitcherFullData = pitcherFromMatchup;
  
  if (gameData && gameData.liveData && gameData.liveData.boxscore) {
    const { boxscore } = gameData.liveData;
    
    // Look for batter in the appropriate team's players
    const batterTeamPlayers = isTopInning ? boxscore.teams?.away?.players : boxscore.teams?.home?.players;
    if (batterTeamPlayers && batterFromMatchup.id) {
      const batterKey = `ID${batterFromMatchup.id}`;
      if (batterTeamPlayers[batterKey]) {
        batterFullData = batterTeamPlayers[batterKey];
      }
    }
    
    // Look for pitcher in the appropriate team's players (opposite team from batter)
    const pitcherTeamPlayers = isTopInning ? boxscore.teams?.home?.players : boxscore.teams?.away?.players;
    if (pitcherTeamPlayers && pitcherFromMatchup.id) {
      const pitcherKey = `ID${pitcherFromMatchup.id}`;
      if (pitcherTeamPlayers[pitcherKey]) {
        pitcherFullData = pitcherTeamPlayers[pitcherKey];
      }
    }
  }
  
  // Get player headshots using ESPN athlete API format
  // Get headshots using MLB official URLs (same as team-page.js)
  const batterHeadshot = batterFromMatchup.id ? 
    `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${batterFromMatchup.id}/headshot/67/current` : null;
  const pitcherHeadshot = pitcherFromMatchup.id ? 
    `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${pitcherFromMatchup.id}/headshot/67/current` : null;
  
  // Get hit data from the last pitch (the one that resulted in the hit)
  const lastPitch = pitchEvents[pitchEvents.length - 1];
  const hitData = lastPitch?.hitData || {};
  
  // Get team color for background
  const teamNameForColor = isTopInning ? awayTeam.teamName : homeTeam.teamName;
  const fullTeamNameForColor = isTopInning ? awayTeam.name : homeTeam.name;
  
  // Get team abbreviations for batter and pitcher
  const batterTeamName = isTopInning ? awayTeam.name : homeTeam.name;
  const pitcherTeamName = isTopInning ? homeTeam.name : awayTeam.name;
  const batterTeamAbbr = getTeamAbbreviation(batterTeamName);
  const pitcherTeamAbbr = getTeamAbbreviation(pitcherTeamName);
  const scoringTeamColor = teamColors[teamNameForColor] || teamColors[fullTeamNameForColor] || '#1a472a';
  
  // Create unified pitch visualization with all pitches in one strike zone
  const createUnifiedPitchVisualization = (pitches) => {
    if (!pitches || pitches.length === 0) {
      return '<div class="unified-pitch-box">No pitch data available</div>';
    }

    // Generate all pitch dots for the unified strike zone
    const pitchDots = pitches.map((pitch, index) => {
      if (!pitch.pitchData || !pitch.pitchData.coordinates) {
        return '';
      }

      const plateWidth = 17; // inches
      const xPercent = ((pitch.pitchData.coordinates.pX + 2.0) / 4.0) * 100;
      const yPercent = pitch.pitchData.strikeZoneTop && pitch.pitchData.strikeZoneBottom ? 
        ((pitch.pitchData.strikeZoneTop - pitch.pitchData.coordinates.pZ) / 
         (pitch.pitchData.strikeZoneTop - pitch.pitchData.strikeZoneBottom)) * 60 + 20 : 50;

      const finalXPercent = Math.max(5, Math.min(95, xPercent));
      const finalYPercent = Math.max(5, Math.min(95, yPercent));

      // Determine pitch color
      let pitchClass = 'ball-pitch';
      if (pitch.details?.isStrike) {
        pitchClass = 'strike-pitch';
      } else if (pitch.details?.isInPlay) {
        pitchClass = 'in-play-pitch';
      }

      return `
        <div class="pitch-location-numbered ${pitchClass}" 
             style="left: ${finalXPercent}%; top: ${finalYPercent}%;"
             title="Pitch ${index + 1}: ${pitch.details?.type?.description || 'Unknown'} ${pitch.pitchData?.startSpeed?.toFixed(1) || 'N/A'} mph">
          ${index + 1}
        </div>
      `;
    }).join('');

    return `
      <div class="unified-pitch-visualization">
        <div class="unified-strike-zone-container">
          <div class="strike-zone-outline"></div>
          ${pitchDots}
        </div>
      </div>
    `;
  };

  // Create pitch descriptions list
  const pitchDescriptionsList = pitchEvents.map((pitch, index) => {
    const count = pitch.count || {};
    const pitchType = pitch.details?.type?.description || 'Unknown';
    const speed = pitch.pitchData?.startSpeed || 0;
    const description = pitch.details?.description || '';
    
    let pitchColor = '#4CAF50'; // ball (green)
    if (pitch.details?.isStrike) pitchColor = '#f44336'; // strike (red)
    else if (pitch.details?.isInPlay) pitchColor = '#2196F3'; // in play (blue)
    
    return `
      <div class="pitch-description-item" style="display: flex; align-items: flex-start; margin-bottom: 8px; padding: 8px; border-radius: 4px; background: rgba(255,255,255,0.05); border-left: 3px solid ${pitchColor};">
        <span style="color: white; font-weight: bold; min-width: 20px;">${index + 1}.</span>
        <span style="flex: 1; line-height: 1.3;">
          ${pitchType} ${speed > 0 ? speed.toFixed(0) : 'N/A'} mph - ${description}
          <span style="color: #ccc; font-size: 0.85em; margin-left: 8px;">(${count.balls || 0}-${count.strikes || 0})</span>
        </span>
      </div>
    `;
  }).join('');
  
  // Get runners on base
  let runners = {
    first: false,
    second: false,
    third: false
  };
  
  if (play.matchup) {
    if (play.matchup.postOnFirst && play.matchup.postOnFirst.id) {
      runners.first = true;
    }
    if (play.matchup.postOnSecond && play.matchup.postOnSecond.id) {
      runners.second = true;
    }
    if (play.matchup.postOnThird && play.matchup.postOnThird.id) {
      runners.third = true;
    }
  }
  
  // Generate unique ID for this enhanced scoring play
  const enhancedPlayId = `enhancedPlay_${play.atBatIndex || Math.random().toString(36).substr(2, 9)}`;
  
  return `
    <div id="${enhancedPlayId}" class="enhanced-scoring-play">
      <!-- Clipboard Icon -->
      <div style="position: absolute; top: 12px; right: 12px; cursor: pointer; background: rgba(255,255,255,0.1); border-radius: 6px; padding: 6px; transition: background-color 0.2s ease; z-index: 10;" onclick="copyEnhancedPlayAsImage('${enhancedPlayId}')" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.2)'" onmouseout="this.style.backgroundColor='rgba(255,255,255,0.1)'" title="Copy enhanced play as image">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
          <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/>
        </svg>
      </div>
      
      <div class="enhanced-play-header">
        <div class="score-and-inning" style="display: flex; align-items: center; justify-content: center; gap: 15px; margin: 10px 0; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 6px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${homeTeamLogo}" alt="Home" style="width: 20px; height: 20px;" onerror="this.style.display='none';">
            <span style="font-size: 16px; font-weight: bold; color: white;">${homeScore}</span>
            <span style="color: rgba(255,255,255,0.8);">-</span>
            <span style="font-size: 16px; font-weight: bold; color: white;">${awayScore}</span>
            <img src="${awayTeamLogo}" alt="Away" style="width: 20px; height: 20px;" onerror="this.style.display='none';">
          </div>
          ${inningDisplay ? `
            <div style="background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; color: white;">
              ${inningDisplay}
            </div>
          ` : ''}
        </div>
        <h3>🏆 SCORING PLAY</h3>
        <div class="play-result-summary">${play.result?.description || play.result?.event || 'Scoring Play'}</div>
      </div>
      
      <div class="enhanced-play-content">
        <div class="batter-section">
          <div class="player-info">
            <div class="player-header">
              ${batterHeadshot ? `
                <div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: #333; position: relative;">
                  <img src="${batterHeadshot}" 
                       alt="${batterFromMatchup.fullName}" 
                       style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%; height: auto; min-height: 100%; object-fit: cover;" 
                       onerror="this.src='icon.png';" 
                       crossorigin="anonymous">
                </div>
              ` : ''}
              <div class="player-name">${batterFromMatchup.fullName || 'Unknown'} (${batterTeamAbbr})</div>
            </div>
            <div class="player-stats">${batterFullData.stats?.batting?.summary || 0}</div>
          </div>
        </div>
        
        <div class="pitcher-section">
          <div class="player-info">
            <div class="player-header">
              ${pitcherHeadshot ? `
                <div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: #333; position: relative;">
                  <img src="${pitcherHeadshot}" 
                       alt="${pitcherFromMatchup.fullName}" 
                       style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%; height: auto; min-height: 100%; object-fit: cover;" 
                       onerror="this.src='icon.png';" 
                       crossorigin="anonymous">
                </div>
              ` : ''}
              <div class="player-name">${pitcherFromMatchup.fullName || 'Unknown'} (${pitcherTeamAbbr}, P)</div>
            </div>
            <div class="player-stats">${pitcherFullData.stats?.pitching?.summary || 0}</div>
          </div>
        </div>
        
        <div class="pitch-sequence-box">
          <h4>At-Bat Pitches (${pitchEvents.length} pitches)</h4>
          <div class="unified-pitch-container">
            <div class="unified-pitch-left">
              ${createUnifiedPitchVisualization(pitchEvents)}
            </div>
            <div class="unified-pitch-right">
              <div class="pitch-descriptions-list">
                ${pitchDescriptionsList || '<div style="color: #ccc; text-align: center; padding: 20px;">No pitch data available</div>'}
              </div>
            </div>
          </div>
        </div>
        
        ${hitData.launchSpeed ? `
        <div class="hit-details">
          <div class="hit-stat">Exit Velocity: ${hitData.launchSpeed} mph</div>
          <div class="hit-stat">Launch Angle: ${hitData.launchAngle}°</div>
          <div class="hit-stat">Distance: ${hitData.totalDistance} ft</div>
        </div>
        ` : ''}
        
        <div class="bases-section">
          <h4 style="margin-bottom: -12.75px;">Runners on Base</h4>
          ${renderPlayBases(runners)}
        </div>
      </div>
    </div>
  `;
}

async function renderPlayByPlay(gamePk, gameData = null) {
  try {
    let data = gameData;
    if (!data) {
      const response = await fetch(`${BASE_URL}/api/v1.1/game/${gamePk}/feed/live`);
      data = await response.json();
    }

    const allPlays = data.liveData?.plays?.allPlays || [];
    
    const playsDiv = document.querySelector("#playsContent .plays-placeholder");
    if (!playsDiv) {
      console.error("Error: 'plays-placeholder' element not found.");
      return;
    }

    // Check if we have valid plays data
    if (allPlays.length === 0) {
      playsDiv.innerHTML = `
        <h2>Plays</h2>
        <div style="color: white; text-align: center; padding: 20px;">No play data available for this game.</div>
      `;
      return;
    }

    // Get team information
    const awayTeam = data.gameData.teams?.away || {};
    const homeTeam = data.gameData.teams?.home || {};
    
    let awayLogo, homeLogo;
    if (awayTeam.name === "American League All-Stars") {
      awayLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/331.svg`; 
      homeLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/332.svg`;
    } else if (awayTeam.name === "National League All-Stars") {
      awayLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/332.svg`; 
      homeLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/331.svg`;
    } else {
      awayLogo = await getLogoUrl(awayTeam.name || "Unknown");
      homeLogo = await getLogoUrl(homeTeam.name || "Unknown");
    }

    const playsHtml = await Promise.all(allPlays.reverse().map(async (play, index) => {
      const isTopInning = play.about?.isTopInning;
      const teamName = isTopInning ? awayTeam.teamName : homeTeam.teamName;
      const teamLogo = isTopInning ? awayLogo : homeLogo;
      
      // Check if this play scored a run using isScoringEvent
      let isScoring = false;
      let scoringTeamColor = '';
      
      if (play.runners) {
        const hasScoring = play.runners.some(runner => {
          const isScoringEvent = runner.details?.isScoringEvent === true;
          return isScoringEvent;
        });
        
        if (hasScoring) {
          isScoring = true;
          // Use the team color of the team that's batting (the team that scored)
          const teamName = isTopInning ? awayTeam.teamName : homeTeam.teamName;
          const fullTeamName = isTopInning ? awayTeam.name : homeTeam.name;
          
          // Try both teamName and full name to find the color
          scoringTeamColor = teamColors[teamName] || teamColors[fullTeamName];
        }
      }
      
      // Show matchup info if no result, otherwise show play result
      let displayText;
      if (!play.result?.description && !play.result?.event) {
        const batter = play.matchup?.batter?.fullName || 'Unknown Batter';
        const pitcher = play.matchup?.pitcher?.fullName || 'Unknown Pitcher';
        displayText = `${batter} vs ${pitcher}`;
      } else {
        displayText = play.result?.description || play.result?.event || 'No Result';
      }
      
      const awayScore = play.result?.awayScore || 0;
      const homeScore = play.result?.homeScore || 0;
      const inning = play.about?.inning || 0;
      const halfInning = play.about?.halfInning || '';
      
      // Format inning display (e.g., "Top 1st", "Bot 1st")
      const inningDisplay = inning > 0 ? 
        `${isTopInning ? 'Top' : 'Bot'} ${ordinalSuffix(inning)}` : 
        '';
      
      // Get runners on base for this play
      let runners = {
        first: false,
        second: false,
        third: false
      };
      
      // Check if we have matchup data with base runners
      if (play.matchup) {
        if (play.matchup.postOnFirst && play.matchup.postOnFirst.id) {
          runners.first = true;
        }
        if (play.matchup.postOnSecond && play.matchup.postOnSecond.id) {
          runners.second = true;
        }
        if (play.matchup.postOnThird && play.matchup.postOnThird.id) {
          runners.third = true;
        }
      }
      
      // If matchup data isn't available, fall back to runner movement start positions
      if (!play.matchup && play.runners) {
        const runnerStartingPositions = new Map();
        
        play.runners.forEach(runner => {
          const playerId = runner.details?.runner?.id;
          if (playerId && runner.movement && runner.movement.start) {
            runnerStartingPositions.set(playerId, runner.movement.start);
          }
        });
        
        // Create runners object based on starting positions
        const startingPositions = Array.from(runnerStartingPositions.values());
        runners = {
          first: startingPositions.includes("1B"),
          second: startingPositions.includes("2B"),
          third: startingPositions.includes("3B")
        };
      }
      
      // Generate pitch events HTML for this play (reverse order for most recent first)
      const pitchEvents = play.playEvents || [];
      const pitchesHtml = [...pitchEvents].reverse().map((pitch, pitchIndex) => {
        const pitchDescription = pitch.details?.description || 'Unknown pitch';
        const pitchSpeed = pitch.pitchData?.startSpeed;
        const count = pitch.count || {};
        const pitchType = pitch.details?.type?.description || 'Unknown';
        
        const pitchVisualization = renderPitchVisualization(pitch.pitchData, pitch.details);
        
        return `
          <div class="pitch-container">
            <div class="pitch-header">
              <span class="pitch-count">B: ${count.balls || 0} S: ${count.strikes || 0} O: ${count.outs || 0}</span>
              <span class="pitch-speed">${pitchSpeed ? `${pitchSpeed.toFixed(0)} mph` : 'N/A'}</span>
              <span class="pitch-type">${pitchType}</span>
            </div>
            <div class="pitch-description">${pitchDescription}</div>
            ${pitchVisualization}
          </div>
        `;
      }).join('');

      // Generate the enhanced scoring play content if this is a scoring play (for inside the dropdown)
      const enhancedContent = isScoring ? await renderEnhancedScoringPlay(play, teamName, teamLogo, isTopInning, awayTeam, homeTeam, data) : '';

      return `
        <div class="play-container" ${scoringTeamColor ? `style="background-color: ${scoringTeamColor}; border-left: 4px solid ${scoringTeamColor};"` : ''}>
          <div class="play-header" onclick="togglePlay(${index})">
            <div class="play-info">
              ${teamLogo ? `<img src="${teamLogo}" alt="${teamName}" class="play-team-logo">` : ''}
              <div class="play-summary">
                <span class="play-team-name">${teamName}</span>
                <div class="play-result">${displayText}</div>
                ${renderPlayBases(runners)}
              </div>
            </div>
            <div class="play-score-section">
              ${inningDisplay ? `<div class="play-inning">${inningDisplay}</div>` : ''}
              <div class="play-score">${awayScore} - ${homeScore}</div>
            </div>
            <div class="play-toggle">
              <span class="toggle-icon" id="toggle-${index}">${openPlays.has(index) ? '▲' : '▼'}</span>
            </div>
          </div>
          <div class="play-details" id="play-${index}" style="display: ${openPlays.has(index) ? 'block' : 'none'};">
            ${enhancedContent}
            ${pitchesHtml}
          </div>
        </div>
      `;
    })).then(plays => plays.join(''));

    // Store current scroll position before updating
    const playsContainer = playsDiv.querySelector('.plays-container');
    if (playsContainer) {
      playsScrollPosition = playsContainer.scrollTop;
    }

    playsDiv.innerHTML = `
      <h2>Play by Play</h2>
      <div class="plays-container">
        ${playsHtml}
      </div>
    `;

    // Restore scroll position after updating
    setTimeout(() => {
      const newPlaysContainer = playsDiv.querySelector('.plays-container');
      if (newPlaysContainer && playsScrollPosition > 0) {
        newPlaysContainer.scrollTop = playsScrollPosition;
      }
    }, 0);
  } catch (error) {
    console.error("Error fetching MLB play-by-play data:", error);
    const playsDiv = document.querySelector("#playsContent .plays-placeholder");
    if (playsDiv) {
      playsDiv.innerHTML = `
        <h2>Plays</h2>
        <div style="color: white; text-align: center; padding: 20px;">Error loading play data.</div>
      `;
    }
  }
}

let updateInterval;

function startScoreboardUpdates(gamePk) {
  const updateScoreboard = async () => {
    const gameOver = await fetchAndUpdateScoreboard(gamePk);
    if (gameOver && updateInterval) {
      clearInterval(updateInterval);
      console.log("Game is over. Stopped fetching updates.");
    }
  };

  updateScoreboard(); // Initial fetch
  
  // Use different update intervals based on whether stream is active
  // Reduce frequency when stream is playing to minimize mobile interruptions
  const getUpdateInterval = () => {
    const streamIframe = document.getElementById('streamIframe');
    const isStreamActive = streamIframe && streamInitialized && streamIframe.style.display !== 'none';
    console.log('MLB Update interval check:', { isStreamActive, streamInitialized, iframeExists: !!streamIframe });
    return isStreamActive ? 8000 : 2000; // 8 seconds if stream active, 2 seconds otherwise
  };
  
  updateInterval = setInterval(updateScoreboard, getUpdateInterval());
  
  // Dynamically adjust interval based on stream status
  setInterval(() => {
    if (updateInterval) {
      const currentInterval = getUpdateInterval();
      clearInterval(updateInterval);
      updateInterval = setInterval(updateScoreboard, currentInterval);
      console.log('MLB Update interval adjusted to:', currentInterval, 'ms');
    }
  }, 15000); // Check every 15 seconds if we need to adjust frequency
}

// Utility function to get team abbreviations
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

// Function to copy enhanced scoring play as image
async function copyEnhancedPlayAsImage(playId) {
  try {
    const playElement = document.getElementById(playId);
    if (!playElement) {
      console.error('Enhanced scoring play not found');
      return;
    }

    // Import html2canvas dynamically
    if (!window.html2canvas) {
      // Load html2canvas library
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      script.onload = () => {
        captureAndCopyEnhancedPlay(playElement);
      };
      document.head.appendChild(script);
    } else {
      captureAndCopyEnhancedPlay(playElement);
    }
  } catch (error) {
    console.error('Error copying enhanced play as image:', error);
    showEnhancedPlayFeedback('Error copying image', 'error');
  }
}

async function captureAndCopyEnhancedPlay(element) {
  try {
    showEnhancedPlayFeedback('Capturing image...', 'loading');
    
    // Replace all external images with base64 versions or remove them
    const images = element.querySelectorAll('img');

    for (const img of images) {
      try {
        // For MLB headshots and logos, convert to base64 for html2canvas compatibility
        if (img.src.includes('mlbstatic.com') || img.src.includes('http')) {
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
    
    const isSmallScreen = window.innerWidth < 525;
    
    // Height adjustment for enhanced scoring play (similar to team-page.js approach)
    // Count the number of pitches in the at-bat to adjust height for longer sequences
    const pitchElements = element.querySelectorAll('.pitch-description-item');
    const pitchCount = pitchElements.length;
    
    // Base height adjustment
    let heightAdjustment = 30;
    
    // Add 20px for every pitch above 4
    if (pitchCount > 4) {
      const extraPitches = pitchCount - 4;
      heightAdjustment += extraPitches * 20;
    }

    // Capture the element with html2canvas using exact element dimensions
    const canvas = await html2canvas(element, {
      backgroundColor: '#333333', // Set the actual background color to match enhanced scoring play
      scale: 3, // Use scale 3 to avoid logo scaling issues
      useCORS: true,
      allowTaint: false, // Allow tainted canvas for better compatibility
      logging: false,
      width: isSmallScreen ? element.clientWidth : element.clientWidth,
      height: isSmallScreen ? element.clientHeight : element.clientHeight + heightAdjustment,
      scrollX: 0,
      scrollY: 0,
      ignoreElements: (element) => {
        try {
          // Ignore the clipboard icon itself
          if (element && element.getAttribute && element.getAttribute('onclick') && 
              element.getAttribute('onclick').includes('copyEnhancedPlayAsImage')) {
            return true;
          }
          return false;
        } catch (e) {
          return false;
        }
      }
    });
    
    // Convert to blob
    canvas.toBlob(async (blob) => {
      if (!blob) {
        showEnhancedPlayFeedback('Failed to create image', 'error');
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
          link.download = `enhanced-scoring-play-${new Date().getTime()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          showEnhancedPlayFeedback('Enhanced play downloaded!', 'success');
        } else {
          // On desktop, try to copy to clipboard using modern API
          if (navigator.clipboard && window.ClipboardItem) {
            const clipboardItem = new ClipboardItem({
              'image/png': blob
            });
            await navigator.clipboard.write([clipboardItem]);
            showEnhancedPlayFeedback('Enhanced play copied to clipboard!', 'success');
          } else {
            showEnhancedPlayFeedback('Could not copy to clipboard. Try again', 'error');
          }
        }
      } catch (clipboardError) {
        showEnhancedPlayFeedback('Could not copy to clipboard. Try again', 'error');
      }
    }, 'image/png', 0.95);
    
  } catch (error) {
    console.error('Error capturing enhanced play:', error);
    showEnhancedPlayFeedback('Failed to capture image: ' + error.message, 'error');
  }
}

function showEnhancedPlayFeedback(message, type) {
  // Remove existing feedback
  const existingFeedback = document.getElementById('enhancedPlayFeedback');
  if (existingFeedback) {
    existingFeedback.remove();
  }

  // Create feedback element
  const feedback = document.createElement('div');
  feedback.id = 'enhancedPlayFeedback';
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

// Team Stats Functions
async function renderTeamStats(gamePk) {
  try {
    console.log('Fetching team stats for game:', gamePk);
    
    // Fetch game data with boxscore
    const gameResponse = await fetch(`${BASE_URL}/api/v1/game/${gamePk}/boxscore`);
    const gameData = await gameResponse.json();
    
    const awayTeam = gameData.teams.away;
    const homeTeam = gameData.teams.home;
    
    console.log('Away team stats:', awayTeam);
    console.log('Home team stats:', homeTeam);
    
    const teamStatsDisplay = document.getElementById('teamStatsDisplay');
    if (!teamStatsDisplay) return;
    
    // Get team colors
    const awayColor = teamColors[awayTeam.team.name] || '#f44336';
    const homeColor = teamColors[homeTeam.team.name] || '#4CAF50';
    
    // Get team logos
    const awayLogo = await getLogoUrl(awayTeam.team.name);
    const homeLogo = await getLogoUrl(homeTeam.team.name);
    
    // Helper function to render stats row with bars (like soccer)
    const renderStatsRow = (label, awayValue, homeValue, isPercentage = false) => {
      const awayNum = typeof awayValue === 'number' ? awayValue : parseFloat(awayValue) || 0;
      const homeNum = typeof homeValue === 'number' ? homeValue : parseFloat(homeValue) || 0;
      const total = awayNum + homeNum;
      const awayPercent = total > 0 ? (awayNum / total) * 100 : 50;
      const homePercent = total > 0 ? (homeNum / total) * 100 : 50;

      return `
        <div class="stats-row">
          <div class="stats-value away">${awayValue}${isPercentage ? '%' : ''}</div>
          <div class="stats-bar-container">
            <div class="stats-bar">
              <div class="stats-bar-fill away" style="width: ${awayPercent}%; background: ${awayColor};"></div>
            </div>
            <div class="stats-bar">
              <div class="stats-bar-fill home" style="width: ${homePercent}%; background: ${homeColor};"></div>
            </div>
          </div>
          <div class="stats-value home">${homeValue}${isPercentage ? '%' : ''}</div>
        </div>
        <div class="stats-label">${label}</div>
      `;
    };
    
    // Create team stats HTML matching soccer layout
    const teamStatsHtml = `
      <div class="match-stats-container">
        <!-- Win Probability Chart (moved to top) -->
        <div id="winProbabilityChart"></div>
        
        <div class="stats-teams">
          <div class="stats-team away">
            <img src="${awayLogo}" alt="${awayTeam.team.name}" class="stats-team-logo">
            <span class="stats-team-name">${awayTeam.team.name}</span>
          </div>
          <div class="stats-team home">
            <span class="stats-team-name home">${homeTeam.team.name}</span>
            <img src="${homeLogo}" alt="${homeTeam.team.name}" class="stats-team-logo">
          </div>
        </div>
        
        <div class="stats-section">
          <div class="stats-section-title">Team Statistics</div>
          ${renderStatsRow('Hits', awayTeam.teamStats.batting.hits || 0, homeTeam.teamStats.batting.hits || 0)}
          ${renderStatsRow('At Bats', awayTeam.teamStats.batting.atBats || 0, homeTeam.teamStats.batting.atBats || 0)}
          ${renderStatsRow('Batting Avg', parseFloat(awayTeam.teamStats.batting.avg || 0).toFixed(3), parseFloat(homeTeam.teamStats.batting.avg || 0).toFixed(3))}
          ${renderStatsRow('OPS', parseFloat(awayTeam.teamStats.batting.ops || 0).toFixed(3), parseFloat(homeTeam.teamStats.batting.ops || 0).toFixed(3))}
          ${renderStatsRow('Strikeouts', awayTeam.teamStats.batting.strikeOuts || 0, homeTeam.teamStats.batting.strikeOuts || 0)}
          ${renderStatsRow('Walks', awayTeam.teamStats.batting.baseOnBalls || 0, homeTeam.teamStats.batting.baseOnBalls || 0)}
          ${renderStatsRow('Left on Base', awayTeam.teamStats.batting.leftOnBase || 0, homeTeam.teamStats.batting.leftOnBase || 0)}
          ${renderStatsRow('Home Runs', awayTeam.teamStats.batting.homeRuns || 0, homeTeam.teamStats.batting.homeRuns || 0)}
          ${renderStatsRow('Stolen Bases', awayTeam.teamStats.batting.stolenBases || 0, homeTeam.teamStats.batting.stolenBases || 0)}
          ${renderStatsRow('Earned Runs', awayTeam.teamStats.pitching.earnedRuns || 0, homeTeam.teamStats.pitching.earnedRuns || 0)}
          ${renderStatsRow('Pitching Ks', awayTeam.teamStats.pitching.strikeOuts || 0, homeTeam.teamStats.pitching.strikeOuts || 0)}
        </div>
      </div>
    `;
    
    teamStatsDisplay.innerHTML = teamStatsHtml;
    
    // Render momentum chart with team colors
    await renderWinProbabilityChart(gamePk, awayColor, homeColor, awayTeam.team.name, homeTeam.team.name);
    
  } catch (error) {
    console.error('Error rendering team stats:', error);
    const teamStatsDisplay = document.getElementById('teamStatsDisplay');
    if (teamStatsDisplay) {
      teamStatsDisplay.innerHTML = '<div class="error-message">Unable to load team statistics</div>';
    }
  }
}

async function renderWinProbabilityChart(gamePk, awayColor, homeColor, awayTeamName, homeTeamName) {
  try {
    // Get linescore data for inning-by-inning momentum
    const gameResponse = await fetch(`${BASE_URL}/api/v1/game/${gamePk}/linescore`);
    const gameData = await gameResponse.json();
    
    const winProbContainer = document.getElementById('winProbabilityChart');
    if (!winProbContainer || !gameData.innings) return;
    
    const innings = gameData.innings;
    
    // Calculate momentum for each inning
    let momentumPoints = [];
    let cumulativeAwayRuns = 0;
    let cumulativeHomeRuns = 0;
    let cumulativeAwayHits = 0;
    let cumulativeHomeHits = 0;
    
    // Starting at balanced (50%)
    momentumPoints.push(50);
    
    innings.forEach((inning, index) => {
      const awayRuns = inning.away?.runs || 0;
      const homeRuns = inning.home?.runs || 0;
      const awayHits = inning.away?.hits || 0;
      const homeHits = inning.home?.hits || 0;
      
      cumulativeAwayRuns += awayRuns;
      cumulativeHomeRuns += homeRuns;
      cumulativeAwayHits += awayHits;
      cumulativeHomeHits += homeHits;
      
      // Calculate momentum based on runs and hits
      // Runs are weighted more heavily than hits
      const runDiff = cumulativeHomeRuns - cumulativeAwayRuns;
      const hitDiff = cumulativeHomeHits - cumulativeAwayHits;
      
      // Momentum calculation: runs worth 3x hits, with diminishing returns
      const momentumScore = (runDiff * 3) + (hitDiff * 1);
      
      // Convert to percentage (0-100, where 50 is balanced)
      // Use sigmoid-like function for smooth transitions
      let momentum = 50 + (momentumScore * 5);
      
      // Add some recent inning bias (what happened this inning affects momentum more)
      const recentRunDiff = homeRuns - awayRuns;
      const recentHitDiff = homeHits - awayHits;
      const recentMomentum = (recentRunDiff * 2) + (recentHitDiff * 0.5);
      momentum += recentMomentum * 3;
      
      // Cap between 10-90% for visual appeal
      momentum = Math.max(10, Math.min(90, momentum));
      
      momentumPoints.push(momentum);
    });
    
    // Ensure we have at least 9 innings for proper display
    const totalInnings = Math.max(9, innings.length);
    
    // Calculate individual inning data for both teams
    let inningData = [];
    
    for (let i = 0; i < totalInnings; i++) {
      if (i < innings.length) {
        const inning = innings[i];
        const awayRuns = inning.away?.runs || 0;
        const homeRuns = inning.home?.runs || 0;
        const awayHits = inning.away?.hits || 0;
        const homeHits = inning.home?.hits || 0;
        
        // Calculate combined activity for each team (runs worth more than hits)
        const awayActivity = (awayRuns * 3) + awayHits;
        const homeActivity = (homeRuns * 3) + homeHits;
        
        inningData.push({
          inning: i + 1,
          awayRuns: awayRuns,
          homeRuns: homeRuns,
          awayHits: awayHits,
          homeHits: homeHits,
          awayActivity: awayActivity,
          homeActivity: homeActivity
        });
      } else {
        // For innings beyond current game, show no activity
        inningData.push({
          inning: i + 1,
          awayRuns: 0,
          homeRuns: 0,
          awayHits: 0,
          homeHits: 0,
          awayActivity: 0,
          homeActivity: 0
        });
      }
    }
    
    // Find max activity for scaling bars
    const maxActivity = Math.max(...inningData.map(d => Math.max(d.awayActivity, d.homeActivity)), 1);
    
    // Helper function for ordinal suffixes
    const ordinalSuffix = (num) => {
      const j = num % 10;
      const k = num % 100;
      if (j === 1 && k !== 11) return num + "st";
      if (j === 2 && k !== 12) return num + "nd";
      if (j === 3 && k !== 13) return num + "rd";
      return num + "th";
    };
    
    let chartHtml = `
      <div class="win-prob-container">
        <h3 class="win-prob-title">Momentum</h3>
        <div class="win-prob-chart-wrapper">
          <div class="team-labels">
            <div class="team-label away" style="color: ${awayColor}">
              ${awayTeamName}
            </div>
            <div class="team-label home" style="color: ${homeColor}">
              ${homeTeamName}
            </div>
          </div>
          
          <div class="chart-container">
            <svg width="600" height="280" viewBox="0 0 600 280" class="win-prob-svg">
              <!-- Center line (balanced) -->
              <line x1="0" y1="140" x2="600" y2="140" 
                    stroke="#666" 
                    stroke-width="1" 
                    stroke-dasharray="3,3"/>
              
              <!-- Inning momentum bars -->
    `;
    
    // Add momentum bars for each inning - stacked vertically
    const barWidth = 50; // Wider bars for bigger chart
    const barSpacing = 60; // More spacing between bars
    
    inningData.forEach((data, index) => {
      const baseX = (index * barSpacing) + 25;
      const centerY = 140; // Updated center Y for bigger chart
      const maxBarHeight = 100; // Taller bars for bigger chart
      
      // Away team bar (extends upward from center)
      if (data.awayActivity > 0) {
        const awayBarHeight = (data.awayActivity / maxActivity) * maxBarHeight;
        chartHtml += `
          <rect x="${baseX}" y="${centerY - awayBarHeight}" 
                width="${barWidth}" height="${awayBarHeight}" 
                fill="${awayColor}" 
                opacity="0.8"
                rx="3"/>
        `;
        
        // Add stats text for away team (above the bar)
        if (data.awayRuns > 0 || data.awayHits > 0) {
          chartHtml += `
            <text x="${baseX + barWidth/2}" y="${centerY - awayBarHeight - 5}" 
                  fill="white" 
                  font-size="9" 
                  font-weight="bold"
                  text-anchor="middle">${data.awayRuns}R ${data.awayHits}H</text>
          `;
        }
      }
      
      // Home team bar (extends downward from center) - same X position as away team
      if (data.homeActivity > 0) {
        const homeBarHeight = (data.homeActivity / maxActivity) * maxBarHeight;
        chartHtml += `
          <rect x="${baseX}" y="${centerY}" 
                width="${barWidth}" height="${homeBarHeight}" 
                fill="${homeColor}" 
                opacity="0.8"
                rx="3"/>
        `;
        
        // Add stats text for home team (below the bar)
        if (data.homeRuns > 0 || data.homeHits > 0) {
          chartHtml += `
            <text x="${baseX + barWidth/2}" y="${centerY + homeBarHeight + 15}" 
                  fill="white" 
                  font-size="9" 
                  font-weight="bold"
                  text-anchor="middle">${data.homeRuns}R ${data.homeHits}H</text>
          `;
        }
      }
      
      // Add inning label below the home team bar
      chartHtml += `
        <text x="${baseX + barWidth/2}" y="270" 
              fill="#ccc" 
              font-size="12" 
              text-anchor="middle">${ordinalSuffix(data.inning)}</text>
      `;
      
      // Add vertical separator line between innings
      if (index < totalInnings - 1) {
        chartHtml += `
          <line x1="${baseX + barWidth + 15}" y1="30" x2="${baseX + barWidth + 15}" y2="250" 
                stroke="#444" 
                stroke-width="1" 
                opacity="0.3"/>
        `;
      }
    });
    
    chartHtml += `
            </svg>
          </div>
        </div>
      </div>
    `;
    
    winProbContainer.innerHTML = chartHtml;
    
  } catch (error) {
    console.error('Error rendering momentum chart:', error);
  }
}
const gamePk = getQueryParam("gamePk");
if (gamePk) {
  startScoreboardUpdates(gamePk);
} else {
  document.getElementById("scoreboardContainer").innerHTML = "<p>No game selected.</p>";
}
const TEAMS_API_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams";

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
    const now = Date.now();

    // Check if we have cached data that's still fresh
    if (liveMatchesCache && (now - cacheTimestamp) < CACHE_DURATION) {
      console.log('Using cached live matches data');
      return liveMatchesCache;
    }

    console.log('Fetching fresh live matches from API...');
    const response = await fetch(`${STREAM_API_BASE}/matches/live`);

    if (!response.ok) {
      throw new Error(`Stream API request failed: ${response.status}`);
    }

    const allMatches = await response.json();
    console.log(`Fetched ${allMatches.length} total matches from API`);

    // Filter matches by basketball category for WNBA
    const relevantSports = ['basketball'];
    const matches = allMatches.filter(match => {
      const matchSport = match.sport || match.category;
      return relevantSports.includes(matchSport);
    });
    console.log(`Filtered to ${matches.length} WNBA matches (${relevantSports.join(' or ')})`);

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
    console.error('Error fetching streams for source:', error);
    return [];
  }
}

async function findMatchStreams(homeTeamName, awayTeamName) {
  try {
    console.log(`Looking for streams: ${homeTeamName} vs ${awayTeamName}`);

    // Fetch live matches for WNBA (basketball category)
    const matches = await fetchLiveMatches();

    // Debug: Check if we got any matches and what they look like
    console.log(`After filtering: Got ${matches.length} WNBA matches`);
    if (matches.length === 0) {
      console.log('No WNBA matches found! This could be due to:');
      console.log('1. API sport field name changed');
      console.log('2. Category value is different than expected');
      console.log('3. No basketball matches currently live');
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
        // Strategy 3: WNBA-specific abbreviations and common names
        () => {
          const abbreviations = {
            'los-angeles': ['los-angeles', 'la', 'lakers', 'clippers', 'kings', 'angels', 'dodgers'],
            'golden-state': ['golden-state', 'gs', 'warriors', 'gs-warriors'],
            'san-antonio': ['san-antonio', 'sa', 'spurs', 'sa-spurs'],
            'oklahoma-city': ['oklahoma-city', 'okc', 'thunder', 'okc-thunder'],
            'portland': ['portland', 'por', 'trail-blazers', 'blazers'],
            'utah': ['utah', 'uta', 'jazz', 'uta-jazz'],
            'denver': ['denver', 'den', 'nuggets', 'den-nuggets'],
            'minnesota': ['minnesota', 'min', 'timberwolves', 'wolves'],
            'dallas': ['dallas', 'dal', 'mavericks', 'dal-mavericks'],
            'new-orleans': ['new-orleans', 'no', 'pelicans', 'no-pelicans'],
            'sacramento': ['sacramento', 'sac', 'kings', 'sac-kings'],
            'phoenix': ['phoenix', 'phx', 'suns', 'phx-suns'],
            'orlando': ['orlando', 'orl', 'magic', 'orl-magic'],
            'washington': ['washington', 'wsh', 'wizards', 'wsh-wizards'],
            'toronto': ['toronto', 'tor', 'raptors', 'tor-raptors'],
            'brooklyn': ['brooklyn', 'bkn', 'nets', 'bkn-nets'],
            'boston': ['boston', 'bos', 'celtics', 'bos-celtics'],
            'philadelphia': ['philadelphia', 'phi', '76ers', 'phi-76ers'],
            'miami': ['miami', 'mia', 'heat', 'mia-heat'],
            'atlanta': ['atlanta', 'atl', 'hawks', 'atl-hawks'],
            'charlotte': ['charlotte', 'cha', 'hornets', 'cha-hornets'],
            'chicago': ['chicago', 'chi', 'bulls', 'chi-bulls'],
            'cleveland': ['cleveland', 'cle', 'cavaliers', 'cle-cavaliers'],
            'detroit': ['detroit', 'det', 'pistons', 'det-pistons'],
            'indiana': ['indiana', 'ind', 'pacers', 'ind-pacers'],
            'milwaukee': ['milwaukee', 'mil', 'bucks', 'mil-bucks'],
            'new-york': ['new-york', 'nyk', 'knicks', 'nyk-knicks']
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

function normalizeTeamName(teamName) {
  // Convert team names to the format used in the streaming site URLs
  const nameMap = {
    "Atlanta Dream": "atlanta-dream",
    "Chicago Sky": "chicago-sky",
    "Connecticut Sun": "connecticut-sun",
    "Dallas Wings": "dallas-wings",
    "Indiana Fever": "indiana-fever",
    "Las Vegas Aces": "las-vegas-aces",
    "Los Angeles Sparks": "los-angeles-sparks",
    "Minnesota Lynx": "minnesota-lynx",
    "New York Liberty": "new-york-liberty",
    "Phoenix Mercury": "phoenix-mercury",
    "Seattle Storm": "seattle-storm",
    "Washington Mystics": "washington-mystics"
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

async function renderStreamEmbed(awayTeamName, homeTeamName) {
  console.log('WNBA renderStreamEmbed called with:', { awayTeamName, homeTeamName });
  
  const streamContainer = document.getElementById('streamEmbed');

  if (!streamContainer) {
    console.error('WNBA Stream container not found! Cannot render stream.');
    return;
  }

  console.log('WNBA Stream container found, proceeding with stream rendering...');

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
    console.log('Using alpha stream:', embedUrl);
  } else if (availableStreams.alpha && currentStreamType === 'alpha2') {
    embedUrl = availableStreams.alpha.embedUrl;
    console.log('Using alpha stream:', embedUrl);
  } else if (availableStreams.bravo && currentStreamType === 'bravo') {
    embedUrl = availableStreams.bravo.embedUrl;
    console.log('Using bravo stream:', embedUrl);
  }

  // Fallback to manual URL construction if API doesn't have the stream
  if (!embedUrl) {
    console.log('No API streams found, using fallback URL construction');
    const homeNormalized = normalizeTeamName(homeTeamName);
    const awayNormalized = normalizeTeamName(awayTeamName);

    if (currentStreamType === 'alpha1') {
      embedUrl = `https://embedsu.com/api/source/${homeNormalized}-vs-${awayNormalized}`;
    } else if (currentStreamType === 'alpha2') {
      embedUrl = `https://playerembed.net/api/source/${homeNormalized}-vs-${awayNormalized}`;
    } else if (currentStreamType === 'bravo') {
      embedUrl = `https://www.nflbite.com/embeds/stream/${homeNormalized}-vs-${awayNormalized}`;
    }
    console.log('Fallback embed URL:', embedUrl);
  }

  // Determine which buttons to show based on current stream type and available streams
  let button1Text = '';
  let button2Text = '';
  let button1Action = '';
  let button2Action = '';

  if (currentStreamType === 'alpha1') {
    button1Text = availableStreams.alpha ? 'Stream 2' : '';
    button2Text = availableStreams.bravo ? 'Stream 3' : '';
    button1Action = availableStreams.alpha ? "switchToStream('alpha2')" : '';
    button2Action = availableStreams.bravo ? "switchToStream('bravo')" : '';
  } else if (currentStreamType === 'alpha2') {
    button1Text = availableStreams.alpha ? 'Stream 1' : '';
    button2Text = availableStreams.bravo ? 'Stream 3' : '';
    button1Action = availableStreams.alpha ? "switchToStream('alpha1')" : '';
    button2Action = availableStreams.bravo ? "switchToStream('bravo')" : '';
  } else if (currentStreamType === 'bravo') {
    button1Text = availableStreams.alpha ? 'Stream 1' : '';
    button2Text = availableStreams.alpha ? 'Stream 2' : '';
    button1Action = availableStreams.alpha ? "switchToStream('alpha1')" : '';
    button2Action = availableStreams.alpha ? "switchToStream('alpha2')" : '';
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
          style="aspect-ratio: 16/9; background: #000; border-radius: 8px; isolation: isolate; will-change: auto; backface-visibility: hidden; transform: translateZ(0);"
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

  // The iframe is now visible by default, handleStreamLoad will hide the connecting div when loaded
  // Keep a timeout as fallback in case onload doesn't fire
  setTimeout(() => {
    const connectingDiv = document.getElementById('streamConnecting');
    if (connectingDiv && connectingDiv.style.display !== 'none') {
      connectingDiv.style.display = 'none';
      console.log('Fallback: hid connecting div after timeout');
    }
  }, 3000);

  // Return the HTML content
  console.log('WNBA renderStreamEmbed returning HTML content (length:', streamHTML.length, ')');
  return streamHTML;
}

// Stream control functions
window.switchToStream = function(streamType) {
  console.log('Switching to stream type:', streamType);
  console.log('Current team names:', currentAwayTeam, currentHomeTeam);

  // Update current stream type
  currentStreamType = streamType;

  // If team names are not available, try to get them from other sources
  if (!currentAwayTeam || !currentHomeTeam) {
    console.log('Team names not available, cannot switch streams');
    return;
  }

  // Generate new embed URL using API if available
  if (currentAwayTeam && currentHomeTeam) {
    streamInitialized = false; // Reset flag to allow stream switching
    
    // Handle the async renderStreamEmbed function properly
    renderStreamEmbed(currentAwayTeam, currentHomeTeam)
      .then(streamHTML => {
        const streamContainer = document.getElementById('streamEmbed');
        if (streamContainer && streamHTML) {
          streamContainer.innerHTML = streamHTML;
          streamInitialized = true;
          console.log('WNBA switchToStream: Updated stream container with new HTML');
        } else {
          console.error('WNBA switchToStream: Stream container not found or no HTML returned');
        }
      })
      .catch(error => {
        console.error('WNBA Error switching stream:', error);
      });
    
    streamInitialized = true; // Set flag after successful switch
  } else {
    console.log('Cannot switch streams: team names not available');
  }
};

// Helper function to update button texts based on current stream type
function updateStreamButtons(currentType) {
  const button1 = document.getElementById('streamButton1');
  const button2 = document.getElementById('streamButton2');

  if (currentType === 'alpha1') {
    if (button1) button1.textContent = availableStreams.alpha ? 'Stream 2' : '';
    if (button2) button2.textContent = availableStreams.bravo ? 'Stream 3' : '';
  } else if (currentType === 'alpha2') {
    if (button1) button1.textContent = availableStreams.alpha ? 'Stream 1' : '';
    if (button2) button2.textContent = availableStreams.bravo ? 'Stream 3' : '';
  } else if (currentType === 'bravo') {
    if (button1) button1.textContent = availableStreams.alpha ? 'Stream 1' : '';
    if (button2) button2.textContent = availableStreams.alpha ? 'Stream 2' : '';
  }
}

// Make helper function available globally
window.updateStreamButtons = updateStreamButtons;

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

    console.log('Sent mute toggle message to iframe');
  } catch (e) {
    console.log('PostMessage failed:', e);
  }

  // Method 3: Simulate key events
  try {
    const keyEvent = new KeyboardEvent('keydown', {
      key: 'm',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false
    });
    iframe.dispatchEvent(keyEvent);

    console.log('Simulated mute key event');
  } catch (e) {
    console.log('Key event simulation failed:', e);
  }

  // Method 4: Try to modify iframe src with mute parameter
  if (iframe.src && !iframe.src.includes('mute=')) {
    const separator = iframe.src.includes('?') ? '&' : '?';
    iframe.src = iframe.src + separator + 'mute=' + (isMuted ? '1' : '0');
    console.log('Modified iframe src with mute parameter');
  }
};

window.toggleFullscreen = function() {
  const iframe = document.getElementById('streamIframe');

  if (iframe) {
    if (iframe.requestFullscreen) {
      iframe.requestFullscreen();
    } else if (iframe.webkitRequestFullscreen) {
      iframe.webkitRequestFullscreen();
    } else if (iframe.msRequestFullscreen) {
      iframe.msRequestFullscreen();
    }
  }
};

window.handleStreamError = function() {
  console.log('Stream error occurred');
  const connectingDiv = document.getElementById('streamConnecting');
  if (connectingDiv) {
    connectingDiv.innerHTML = `
      <p>Stream error occurred. <span id="streamStatus">Trying next stream...</span></p>
    `;
    // Auto-try next stream after a delay
    setTimeout(() => {
      tryNextStream();
    }, 3000);
  }
};

window.handleStreamLoad = function() {
  const iframe = document.getElementById('streamIframe');
  const connectingDiv = document.getElementById('streamConnecting');

  if (iframe && connectingDiv) {
    connectingDiv.style.display = 'none';
    iframe.style.display = 'block';
    console.log('Stream loaded successfully');
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

async function renderBoxScore(gameId, gameState) {
  try {
    const BOX_SCORE_API_URL = `https://cdn.espn.com/core/wnba/boxscore?xhr=1&gameId=${gameId}`;
    const response = await fetch(BOX_SCORE_API_URL);
    const data = await response.json();

    const isSmallScreen = window.innerWidth <= 475;

    const players = data.gamepackageJSON.boxscore.players || [];
    const boxScoreDiv = document.getElementById("boxScore");
    if (!boxScoreDiv) {
      console.error("Error: 'boxScore' element not found.");
      return;
    }

    const renderTeamRoster = (team) => {
      if (!team || !team.statistics || !team.statistics[0]?.athletes) {
        console.error("Invalid team data for player stats rendering.");
        return `<div class="error-message"></div>`;
      }

      const teamName = team.team.shortDisplayName;
      const teamColor = `#${team.team.color}`;
      const teamLogo = team.team.logo; // Get the team logo URL
      const athletes = team.statistics[0].athletes; // Access the first statistics object

      const headers = isSmallScreen
        ? ["Player", "M", "PTS", "FG"]
        : ["Player", "MIN", "PTS", "REB", "AST", "PF", "FG", "3PT", "+/-"];

      const starters = athletes
        .filter(player => player.starter)
        .map(player => `
          <tr class="${gameState === "Final" ? "" : player.active ? "active-player" : ""}">
            <td>${gameState === "Final" ? "" : player.active ? "🟢 " : ""}${isSmallScreen ? `${player.athlete.shortName}` : `${player.athlete.displayName}`} <span style="color: grey;">${player.athlete.position.abbreviation}</span></td>
            <td>${player.stats[0] || "0"}</td> <!-- MIN -->
            <td>${player.stats[13] || "0"}</td> <!-- PTS -->
            ${isSmallScreen ? "" : `<td>${player.stats[6] || "0"}</td>`} <!-- REB -->
            ${isSmallScreen ? "" : `<td>${player.stats[7] || "0"}</td>`} <!-- AST -->
            ${isSmallScreen ? "" : `<td>${player.stats[11] || "0"}</td>`} <!-- PF -->
            <td>${player.stats[1] || "0"}</td> <!-- FG -->
            ${isSmallScreen ? "" : `<td>${player.stats[2] || "0-0"}</td>`} <!-- 3PT -->
            ${isSmallScreen ? "" : `<td>${player.stats[12] || "0"}</td>`} <!-- +/- -->
          </tr>
        `).join("");

      const nonStarters = athletes
        .filter(player => !player.starter)
        .sort((a, b) => parseFloat(b.stats[0] || "0") - parseFloat(a.stats[0] || "0")) // Sort by minutes played
        .map(player => `
          <tr class="${gameState === "Final" ? "" : player.active ? "active-player" : ""}">
            <td>${gameState === "Final" ? "" : player.active ? "🟢 " : ""}${isSmallScreen ? `${player.athlete.shortName}` : `${player.athlete.displayName}`} <span style="color: grey;">${player.athlete.position.abbreviation}</span></td>
            <td>${player.stats[0] || "0"}</td> <!-- MIN -->
            <td>${player.stats[13] || "0"}</td> <!-- PTS -->
            ${isSmallScreen ? "" : `<td>${player.stats[6] || "0"}</td>`} <!-- REB -->
            ${isSmallScreen ? "" : `<td>${player.stats[7] || "0"}</td>`} <!-- AST -->
            ${isSmallScreen ? "" : `<td>${player.stats[11] || "0"}</td>`} <!-- PF -->
            <td>${player.stats[1] || "0"}</td> <!-- FG -->
            ${isSmallScreen ? "" : `<td>${player.stats[2] || "0-0"}</td>`} <!-- 3PT -->
            ${isSmallScreen ? "" : `<td>${player.stats[12] || "0"}</td>`} <!-- +/- -->
          </tr>
        `).join("");

      return `
        <div class="team-box-score ${gameState === "Final" ? "final" : ""} responsive-team-box-score ${gameState === "Final" ? "final" : ""}">
          <h3 style="background-color: ${teamColor}; display: flex; align-items: center; gap: 10px;">
            <img src="${teamLogo}" alt="${teamName}" style="width: 30px; height: 30px; border-radius: 50%;"> ${teamName}
          </h3>
          <div class="roster-section">
            <h4>Starters</h4>
            <table>
              <thead>
                <tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr>
              </thead>
              <tbody>${starters}</tbody>
            </table>
          </div>
          <div class="roster-section">
            <h4>Bench</h4>
            <table>
              <thead>
                <tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr>
              </thead>
              <tbody>${nonStarters}</tbody>
            </table>
          </div>
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
    console.error("Error fetching WNBA box score data:", error);
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
      const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${gameDate}`;
      
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
        
        const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${adjustedDate}`;

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
        <img class="team-logo responsive-logo" src="${awayTeam?.logo}" alt="${awayTeam?.displayName}">
        <div class="team-name responsive-name">${awayTeam?.shortDisplayName}</div>
        <div class="team-record responsive-record">${awayTeamRecord}</div>
      </div>
      <div class="inning-center">
        <div class="inning-status responsive-inning-status">${periodText}</div>
        <div class="time-left responsive-game-clock">${timeLeft}</div>
      </div>
      <div class="team-block">
        <div class="team-score responsive-score" style="color: ${homeScoreColor};">${homeScore}</div>
        <img class="team-logo responsive-logo" src="${homeTeam?.logo}" alt="${homeTeam?.displayName}">
        <div class="team-name responsive-name">${homeTeam?.shortDisplayName}</div>
        <div class="team-record responsive-record">${homeTeamRecord}</div>
      </div>
    `;

    renderLinescoreTable(awayLinescores, homeLinescores, awayTeam?.abbreviation, homeTeam?.abbreviation, awayScore, homeScore);

    // Render the box score
    renderBoxScore(gameId, gameStatus);

    // Render the live stream only if teams have changed or no stream exists AND game is not over
    console.log('WNBA Stream check:', { awayTeam: awayTeam?.displayName, homeTeam: homeTeam?.displayName, isGameOver, streamInitialized, gameStatus });
    
    if (awayTeam && homeTeam && !isGameOver) {
      if (!streamInitialized) {
        console.log('WNBA Game is not over, initializing stream embed for first time');
        
        // Handle the async renderStreamEmbed function properly
        renderStreamEmbed(awayTeam.displayName, homeTeam.displayName)
          .then(streamHTML => {
            const streamContainer = document.getElementById('streamEmbed');
            if (streamContainer && streamHTML) {
              streamContainer.innerHTML = streamHTML;
              streamInitialized = true;
              console.log('WNBA Stream initialized successfully');
            } else {
              console.error('WNBA Stream container not found or no HTML returned');
            }
          })
          .catch(error => {
            console.error('WNBA Error initializing stream:', error);
          });
      } else {
        console.log('WNBA Stream already initialized, skipping render to prevent jittering');
      }
    } else if (isGameOver) {
      console.log('WNBA Game is over, clearing stream...');
      // Clear stream container for finished games and reset flag
      const streamContainer = document.getElementById('streamEmbed');
      if (streamContainer) {
        streamContainer.innerHTML = '';
        streamContainer.style.marginBottom = '35px';
        streamInitialized = false; // Reset flag when game is over
        console.log('WNBA Stream container cleared and flag reset');
      }
    } else {
      console.log('WNBA No teams found or other condition not met');
    }

    // Return true if game is over to stop further updates
    return isGameOver;
  } catch (error) {
    console.error("Error fetching WNBA scoreboard data:", error);
    return true; // Stop fetching on error
  }
}

let updateInterval;

// Wait for DOM to be ready before executing
document.addEventListener('DOMContentLoaded', function() {
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
    const scoreboardContainer = document.getElementById("scoreboardContainer");
    if (scoreboardContainer) {
      scoreboardContainer.innerHTML = "<p>No game selected.</p>";
    }
  }
});

function renderLinescoreTable(awayLinescores, homeLinescores, awayAbbr, homeAbbr, awayTotal, homeTotal) {
  const linescoreTableDiv = document.getElementById("linescoreTable");
  if (!linescoreTableDiv) {
    console.error("Error: 'linescoreTable' element not found.");
    return;
  }

  const periods = [1, 2, 3, 4]; // Standard WNBA periods
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

// Global variables for preserving play-by-play state
let openPlays = new Set(); // Track which plays are open
let playsScrollPosition = 0; // Track scroll position

function renderMiniCourt(coordinate, isScoring = false, teamSide = 'home', teamColor = '552583') {
  if (!coordinate || coordinate.x === undefined || coordinate.y === undefined) {
    return ''; // Invalid coordinates
  }

  const espnX = coordinate.x; 
  const espnY = coordinate.y; 
  
  console.log(`Raw coordinates for ${teamSide} team: x=${espnX}, y=${espnY}`);
  
  // Basketball court coordinate system - rotated 90° counter-clockwise:
  // Court split into 2 halves - top half = home, bottom half = away
  // X becomes left-right positioning, Y becomes top-bottom positioning
  // X: 0-50 scale, Y: 0-50 scale (ESPN standard)
  
  const isMobile = window.innerWidth <= 768;
  let leftPercent, bottomPercent;
  
  if (teamSide === 'home') {
    // Home team on top half of court (attacking bottom basket)
    // Y=0 (baseline) → 100% bottom position, Y=25 (center) → 50% bottom position, Y=50 (far baseline) → 0% bottom position
    bottomPercent = 40 + (25 - espnY) * 2; // Y=0→100%, Y=25→50%, Y=50→0%
    leftPercent = espnX * 2; // X=0→0%, X=50→100%
  } else {
    // Away team on bottom half of court (attacking top basket)
    // Y=0 (far baseline) → 0% bottom position, Y=25 (center) → 50% bottom position, Y=50 (baseline) → 100% bottom position
    bottomPercent = (espnY * 2) - 10; // Y=0→0%, Y=25→50%, Y=50→100%
    leftPercent = (50 - espnX) * 2; // X=0→100%, X=50→0% (inverted)
  }
  
  // Constrain to court bounds with some padding
  const finalLeftPercent = Math.max(2, Math.min(98, leftPercent));
  const finalBottomPercent = Math.max(2, Math.min(98, bottomPercent));

  const shotClass = isScoring ? 'made-shot' : 'missed-shot';
  
  // Ensure team color has # prefix
  const finalTeamColor = teamColor.startsWith('#') ? teamColor : `#${teamColor}`;
  
  // For mobile vs desktop positioning
  let finalLeft, finalBottom;
  
  if (isMobile) {
    // Mobile: Since CSS transform: rotate(90deg) handles the visual rotation,
    // we use the same coordinates as desktop - CSS handles the rotation
    finalLeft = finalLeftPercent;
    finalBottom = finalBottomPercent;
  } else {
    // Desktop: portrait court, use the coordinates as calculated
    finalLeft = finalLeftPercent;
    finalBottom = finalBottomPercent;
  }
  
  console.log(`Final positioning: left=${finalLeft}%, bottom=${finalBottom}%`);

  return `
    <div class="mini-court ${isMobile ? 'mobile-landscape' : ''}">
      <div class="court-container">
        <!-- Court outline -->
        <div class="court-outline"></div>
        <!-- Three-point lines -->
        <div class="three-point-line top"></div>
        <div class="three-point-line bottom"></div>
        <!-- Free throw circles -->
        <div class="free-throw-circle top"></div>
        <div class="free-throw-circle bottom"></div>
        <!-- Free throw semicircles -->
        <div class="free-throw-semicircle top"></div>
        <div class="free-throw-semicircle bottom"></div>
        <!-- 3 point semicircles -->
        <div class="three-point-semicircle top"></div>
        <div class="three-point-semicircle bottom"></div>
        <!-- Center circle -->
        <div class="center-circle"></div>
        <!-- Baskets -->
        <div class="basket top"></div>
        <div class="basket bottom"></div>
        <!-- Team side indicator -->
        <div class="team-side-indicator ${teamSide}" style="color: ${finalTeamColor};">${teamSide.toUpperCase()}</div>
        <!-- Shot location -->
        <div class="shot-marker ${shotClass}" style="left: ${finalLeft}%; bottom: ${finalBottom}%; --team-color: ${finalTeamColor};"></div>
      </div>
    </div>
  `;
}

async function getPlayerImage(playerId) {
  try {
    // WNBA player headshot URL pattern
    const imageUrl = `https://a.espncdn.com/i/headshots/wnba/players/full/${playerId}.png`;
    
    // Check if image exists
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(imageUrl);
      img.onerror = () => resolve(''); // Return empty string if image doesn't exist
      img.src = imageUrl;
    });
  } catch (error) {
    return '';
  }
}

async function getPlayerName(playerId) {
  try {
    // You could fetch player data here if needed
    // For now, we'll rely on the participant data from the play
    return '';
  } catch (error) {
    return '';
  }
}

async function renderPlayByPlay(gameId) {
  try {
    const PLAY_BY_PLAY_API_URL = `https://cdn.espn.com/core/wnba/playbyplay?xhr=1&gameId=${gameId}`;
    console.log("Fetching play-by-play from:", PLAY_BY_PLAY_API_URL);
    const response = await fetch(PLAY_BY_PLAY_API_URL);
    const data = await response.json();

    console.log("Play-by-play data received:", data);

    const plays = data.gamepackageJSON?.plays || [];
    console.log("Plays data:", plays);
    
    const playsDiv = document.querySelector("#playsContent .plays-placeholder");
    if (!playsDiv) {
      console.error("Error: 'plays-placeholder' element not found.");
      return;
    }

    // Check if we have valid plays data
    if (plays.length === 0) {
      playsDiv.innerHTML = `
        <h2>Plays</h2>
        <div style="color: white; text-align: center; padding: 20px;">No play data available for this game.</div>
      `;
      return;
    }

    // Get team information and box score data
    const gameDate = getQueryParam("date");
    let awayTeam = null, homeTeam = null;
    let boxScoreData = null;
    
    try {
      // Try to get team info from scoreboard API first (if gameDate is available)
      if (gameDate) {
        const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${gameDate}`;
        const scoreboardResponse = await fetch(SCOREBOARD_API_URL);
        const scoreboardData = await scoreboardResponse.json();
        const currentGame = scoreboardData.events?.find(game => game.id === gameId);
        
        if (currentGame) {
          const awayTeamData = currentGame.competitions[0].competitors.find(c => c.homeAway === "away")?.team;
          const homeTeamData = currentGame.competitions[0].competitors.find(c => c.homeAway === "home")?.team;
          
          // Add proper logo URLs to team objects
          if (awayTeamData) {
            awayTeam = {
              ...awayTeamData,
              logo: awayTeamData.logos?.find(logo => logo.rel.includes('primary_logo_on_black_color'))?.href || `https://a.espncdn.com/i/teamlogos/wnba/500/${awayTeamData.abbreviation}.png`
            };
          }
          
          if (homeTeamData) {
            homeTeam = {
              ...homeTeamData,
              logo: homeTeamData.logos?.find(logo => logo.rel.includes('primary_logo_on_black_color'))?.href || `https://a.espncdn.com/i/teamlogos/wnba/500/${homeTeamData.abbreviation}.png`
            };
          }
        }
      }
      
      // Fallback: Try to get team info from box score data if scoreboard API failed
      if (!awayTeam || !homeTeam) {
        console.log("Trying to get team info from box score as fallback...");
        const BOX_SCORE_API_URL = `https://cdn.espn.com/core/wnba/boxscore?xhr=1&gameId=${gameId}`;
        const boxScoreResponse = await fetch(BOX_SCORE_API_URL);
        boxScoreData = await boxScoreResponse.json();
        
        // Extract team info from box score
        const gameInfo = boxScoreData?.gamepackageJSON?.header?.competitions?.[0];
        if (gameInfo) {
          const awayTeamData = gameInfo.competitors?.find(c => c.homeAway === "away")?.team;
          const homeTeamData = gameInfo.competitors?.find(c => c.homeAway === "home")?.team;
          
          if (awayTeamData && !awayTeam) {
            awayTeam = {
              ...awayTeamData,
              logo: awayTeamData.logos?.find(logo => logo.rel.includes('primary_logo_on_black_color'))?.href || `https://a.espncdn.com/i/teamlogos/wnba/500/${awayTeamData.abbreviation}.png`
            };
          }
          
          if (homeTeamData && !homeTeam) {
            homeTeam = {
              ...homeTeamData,
              logo: homeTeamData.logos?.find(logo => logo.rel.includes('primary_logo_on_black_color'))?.href || `https://a.espncdn.com/i/teamlogos/wnba/500/${homeTeamData.abbreviation}.png`
            };
          }
        }
      } else {
        // We got teams from scoreboard, now get box score data separately
        const BOX_SCORE_API_URL = `https://cdn.espn.com/core/wnba/boxscore?xhr=1&gameId=${gameId}`;
        const boxScoreResponse = await fetch(BOX_SCORE_API_URL);
        boxScoreData = await boxScoreResponse.json();
      }
    } catch (e) {
      console.log("Could not fetch team info or box score for plays");
    }

    // Function to get player stats from box score
    const getPlayerStats = (playerId) => {
      if (!boxScoreData?.gamepackageJSON?.boxscore?.players) return null;
      
      for (const team of boxScoreData.gamepackageJSON.boxscore.players) {
        const athletes = team.statistics?.[0]?.athletes || [];
        const player = athletes.find(athlete => athlete.athlete.id === playerId);
        if (player) {
          return {
            points: player.stats[13] || "0", // PTS
            assists: player.stats[7] || "0", // AST
            rebounds: player.stats[6] || "0", // REB
            name: player.athlete.displayName || player.athlete.shortName
          };
        }
      }
      return null;
    };

    // Store current scroll position before updating
    const playsContainer = playsDiv.querySelector('.plays-container');
    if (playsContainer) {
      playsScrollPosition = playsContainer.scrollTop;
    }

    const playsHtml = await Promise.all(plays.reverse().map(async (play, index) => {
      const teamId = play.team?.id;
      const isHomeTeam = homeTeam && teamId === homeTeam.id;
      const teamLogo = isHomeTeam ? homeTeam?.logo : awayTeam?.logo;
      const teamName = isHomeTeam ? homeTeam?.shortDisplayName : awayTeam?.shortDisplayName;
      
      // Debug team identification
      if (play.coordinate) {
        console.log(`Play ${index}: Team ID ${teamId}, Home Team ID: ${homeTeam?.id}, Away Team ID: ${awayTeam?.id}, isHomeTeam: ${isHomeTeam}, Team Side: ${isHomeTeam ? 'home' : 'away'}`);
      }
      
      const periodDisplay = play.period?.displayValue || '';
      const clock = play.clock?.displayValue || '';
      const homeScore = play.homeScore || 0;
      const awayScore = play.awayScore || 0;
      const playText = play.text || 'No description available';
      const isScoring = play.scoringPlay || false;
      const scoreValue = play.scoreValue || 0;
      
      // Get primary participant (usually the main player)
      const primaryParticipant = play.participants?.[0];
      const secondaryParticipant = play.participants?.[1]; // Could be assist, steal, etc.
      
      // Determine if this is a non-expandable play (timeout, challenge)
      const playTextLower = playText.toLowerCase();
      const isNonExpandablePlay = playTextLower.includes('timeout') || 
                                  playTextLower.includes('challenge') ||
                                  playTextLower.includes('technical foul') ||
                                  playTextLower.includes('flagrant foul') ||
                                  playTextLower.includes('official timeout') ||
                                  playTextLower.includes('tv timeout') ||
                                  playTextLower.includes('instant replay') ||
                                  !primaryParticipant; // No participants means it's likely a non-player event
      
      // Determine if this play should NOT show the mini court (free throws, substitutions, enters the game)
      const isNoCourtPlay = playTextLower.includes('free throw') ||
                           playTextLower.includes('enters the game') ||
                           playTextLower.includes('substitution');
      
      // Determine if this play should be open (preserve open state) - only for expandable plays
      const isOpen = !isNonExpandablePlay && openPlays.has(index);
      const displayStyle = isOpen ? 'block' : 'none';
      const toggleIcon = isOpen ? '▲' : '▼';
      
      // Mini court display for expanded view - only for plays with coordinates and not free throws/substitutions
      const teamSide = isHomeTeam ? 'home' : 'away';
      const teamColor = isHomeTeam ? homeTeam?.color : awayTeam?.color;
      const miniCourt = (!isNonExpandablePlay && !isNoCourtPlay && play.coordinate) ? renderMiniCourt(play.coordinate, isScoring, teamSide, teamColor) : '';
      
      // Apply team color to scoring plays dynamically
      if (isScoring && teamColor) {
        const playColorId = `play-${index}-color`;
        // Remove any existing style for this play
        const existingStyle = document.getElementById(playColorId);
        if (existingStyle) {
          existingStyle.remove();
        }
        
        // Add new style with team color
        const style = document.createElement('style');
        style.id = playColorId;
        style.textContent = `
          .play-container.scoring-play:nth-of-type(${index + 1}) {
            border-left-color: #${teamColor} !important;
          }
        `;
        document.head.appendChild(style);
      }
      
      // Get player images and stats
      let primaryPlayerImg = '';
      let secondaryPlayerImg = '';
      let primaryPlayerInfo = { name: 'Unknown Player', points: '0', assists: '0' };
      let secondaryPlayerInfo = { name: 'Unknown Player', points: '0', assists: '0' };
      let secondaryPlayerRole = 'Assist'; // Default role
      
      if (primaryParticipant?.athlete?.id) {
        primaryPlayerImg = await getPlayerImage(primaryParticipant.athlete.id);
        const stats = getPlayerStats(primaryParticipant.athlete.id);
        primaryPlayerInfo = {
          name: stats?.name || primaryParticipant.athlete.displayName || primaryParticipant.athlete.fullName || 'Unknown Player',
          points: stats?.points || '0',
          assists: stats?.assists || '0'
        };
      }
      
      if (secondaryParticipant?.athlete?.id) {
        secondaryPlayerImg = await getPlayerImage(secondaryParticipant.athlete.id);
        const stats = getPlayerStats(secondaryParticipant.athlete.id);
        secondaryPlayerInfo = {
          name: stats?.name || secondaryParticipant.athlete.displayName || secondaryParticipant.athlete.fullName || 'Unknown Player',
          points: stats?.points || '0',
          assists: stats?.assists || '0'
        };
        
        // Determine the role of the secondary participant based on play text
        const playTextLower = playText.toLowerCase();
        if (playTextLower.includes('assist')) {
          secondaryPlayerRole = 'Assist';
        } else if (playTextLower.includes('steal')) {
          secondaryPlayerRole = 'Steal';
        } else if (playTextLower.includes('block')) {
          secondaryPlayerRole = 'Block';
        } else if (playTextLower.includes('rebound')) {
          secondaryPlayerRole = 'Rebound';
        } else if (playTextLower.includes('foul')) {
          secondaryPlayerRole = 'Foul';
        } else {
          // Try to determine from participant type if available
          secondaryPlayerRole = secondaryParticipant.type || 'Assist';
        }
      }
      
      // Determine team abbreviations for players using the same logic as team color
      const playTeamAbbreviation = isHomeTeam ? homeTeam?.abbreviation : awayTeam?.abbreviation;
      
      // For participants, use the play's team abbreviation since players are associated with the play's team
      const primaryPlayerTeam = playTeamAbbreviation;
      const secondaryPlayerTeam = playTeamAbbreviation;
      
      // Special handling for substitution plays
      const isSubstitution = playTextLower.includes('enters the game');
      let primaryPlayerDisplayName = primaryPlayerInfo.name;
      let secondaryPlayerDisplayName = secondaryPlayerInfo.name;
      
      if (primaryPlayerTeam) {
        primaryPlayerDisplayName = `${primaryPlayerInfo.name} - ${primaryPlayerTeam}`;
      }
      if (secondaryPlayerTeam && !isSubstitution) {
        secondaryPlayerDisplayName = `${secondaryPlayerInfo.name} - ${secondaryPlayerTeam}`;
      }
      
      // For substitutions, modify the role text
      if (isSubstitution) {
        secondaryPlayerRole = ''; // Make second player blank for substitutions
      }
      
      // Determine if this play is copyable (scoring play but not free throw)
      const isCopyablePlay = isScoring && !playTextLower.includes('free throw');
      
      return `
        <div class="play-container ${isScoring ? 'scoring-play' : ''} ${isNonExpandablePlay ? 'non-expandable' : ''}">
          <div class="play-header" ${!isNonExpandablePlay ? `onclick="togglePlay(${index})"` : ''}>
            <div class="play-main-info">
              <div class="play-teams-score">
                <div class="team-score-display">
                  ${awayTeam ? `<img src="${awayTeam.logo}" alt="${awayTeam.shortDisplayName}" class="team-logo-small">` : ''}
                  <span class="score">${awayScore}</span>
                </div>
                <div class="score-separator">-</div>
                <div class="team-score-display">
                  <span class="score">${homeScore}</span>
                  ${homeTeam ? `<img src="${homeTeam.logo}" alt="${homeTeam.shortDisplayName}" class="team-logo-small">` : ''}
                </div>
              </div>
              <div class="play-summary">
                <div class="play-time-period">
                  <span class="period">${periodDisplay}</span>
                  <span class="clock">${clock}</span>
                </div>
                <div class="play-description">${playText}</div>
                ${isScoring ? `<div class="score-indicator">+${scoreValue} PTS</div>` : ''}
              </div>
            </div>
            <div class="play-actions">
              ${!isNonExpandablePlay ? `
                <div class="play-toggle">
                  <span class="toggle-icon" id="toggle-${index}">${toggleIcon}</span>
                </div>
              ` : ''}
            </div>
          </div>
          ${!isNonExpandablePlay ? `
            <div class="play-details" id="play-${index}" style="display: ${displayStyle};">
              ${isCopyablePlay ? `
                <div class="copy-play-container">
                  <button class="copy-play-btn-inside" onclick="copyExpandedPlayCard(${index}, '${teamColor}', '${isHomeTeam ? homeTeam?.displayName || homeTeam?.name || 'Home' : awayTeam?.displayName || awayTeam?.name || 'Away'}', '${isHomeTeam ? homeTeam?.abbreviation || 'HOME' : awayTeam?.abbreviation || 'AWAY'}', ${isHomeTeam})" title="Copy Full Play Card">
                    📋 Copy Play Card
                  </button>
                </div>
              ` : ''}
              <div class="play-details-content" id="play-details-content-${index}">
                ${miniCourt}
                <div class="play-participants">
                  ${primaryParticipant ? `
                    <div class="participant primary">
                      <div class="player-info">
                        <div class="player-image">
                          ${primaryPlayerImg ? `<img src="${primaryPlayerImg}" alt="${primaryPlayerInfo.name}" class="player-headshot">` : ''}
                        </div>
                        <div class="player-details">
                          <div class="player-name">${primaryPlayerDisplayName}</div>
                          <div class="player-stats">
                            ${isSubstitution ? '<span class="player-role">Enter</span>' : ''}
                            ${!isSubstitution && isScoring ? `<span class="stat-highlight">+${scoreValue} Points</span> • ` : ''}
                            ${!isSubstitution ? `<span>${primaryPlayerInfo.points} PTS</span> • <span>${primaryPlayerInfo.assists} AST</span>` : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  ` : ''}
                  ${secondaryParticipant && !isSubstitution ? `
                    <div class="participant secondary">
                      <div class="player-info">
                        <div class="player-image">
                          ${secondaryPlayerImg ? `<img src="${secondaryPlayerImg}" alt="${secondaryPlayerInfo.name}" class="player-headshot">` : ''}
                        </div>
                        <div class="player-details">
                          <div class="player-name">${secondaryPlayerDisplayName}</div>
                          <div class="player-stats">
                            <span class="player-role">${secondaryPlayerRole}</span> • 
                            <span>${secondaryPlayerInfo.points} PTS</span> • 
                            <span>${secondaryPlayerInfo.assists} AST</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ` : ''}
                  ${secondaryParticipant && isSubstitution ? `
                    <div class="participant secondary">
                      <div class="player-info">
                        <div class="player-image">
                          ${secondaryPlayerImg ? `<img src="${secondaryPlayerImg}" alt="${secondaryPlayerInfo.name}" class="player-headshot">` : ''}
                        </div>
                        <div class="player-details">
                          <div class="player-name">${secondaryPlayerTeam ? `${secondaryPlayerInfo.name} - ${secondaryPlayerTeam}` : secondaryPlayerInfo.name}</div>
                          <div class="player-stats">
                            <!-- Blank for second player in substitutions -->
                          </div>
                        </div>
                      </div>
                    </div>
                  ` : ''}
                </div>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }));

    playsDiv.innerHTML = `
      <h2>Play by Play</h2>
      <div class="plays-container">
        ${playsHtml.join('')}
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
    console.error("Error fetching WNBA play-by-play data:", error);
    const playsDiv = document.querySelector("#playsContent .plays-placeholder");
    if (playsDiv) {
      playsDiv.innerHTML = `
        <h2>Plays</h2>
        <div style="color: white; text-align: center; padding: 20px;">Error loading play data.</div>
      `;
    }
  }
}

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

// Content slider functions
window.showBoxscore = function() {
  // Update button states
  document.getElementById('boxscoreBtn').classList.add('active');
  document.getElementById('statsBtn').classList.remove('active');
  document.getElementById('playsBtn').classList.remove('active');
  
  // Show/hide content sections
  document.getElementById('boxscoreContent').classList.add('active');
  document.getElementById('statsContent').classList.remove('active');
  document.getElementById('playsContent').classList.remove('active');
  
  // Show stream when on boxscore tab
  const streamContainer = document.getElementById("streamEmbed");
  if (streamContainer) {
    streamContainer.style.display = 'block';
  }
};

window.showStats = function() {
  // Update button states
  document.getElementById('statsBtn').classList.add('active');
  document.getElementById('boxscoreBtn').classList.remove('active');
  document.getElementById('playsBtn').classList.remove('active');
  
  // Show/hide content sections
  document.getElementById('statsContent').classList.add('active');
  document.getElementById('boxscoreContent').classList.remove('active');
  document.getElementById('playsContent').classList.remove('active');
  
  // Hide stream when on stats tab
  const streamContainer = document.getElementById("streamEmbed");
  if (streamContainer) {
    streamContainer.style.display = 'none';
  }
  
  // Load stats when switching to stats view
  const gameId = getQueryParam("gameId");
  if (gameId) {
    loadMatchStats(gameId);
  }
};

window.showPlays = function() {
  // Update button states
  document.getElementById('playsBtn').classList.add('active');
  document.getElementById('boxscoreBtn').classList.remove('active');
  document.getElementById('statsBtn').classList.remove('active');
  
  // Show/hide content sections
  document.getElementById('playsContent').classList.add('active');
  document.getElementById('boxscoreContent').classList.remove('active');
  document.getElementById('statsContent').classList.remove('active');
  
  // Hide stream when on plays tab
  const streamContainer = document.getElementById("streamEmbed");
  if (streamContainer) {
    streamContainer.style.display = 'none';
  }
  
  // Load play-by-play data when switching to plays view
  const gameId = getQueryParam("gameId");
  if (gameId) {
    renderPlayByPlay(gameId);
  }
};

// Stats functionality
async function loadMatchStats(gameId) {
  try {
    console.log('Loading match stats for game:', gameId);
    
    // Replace gameId in the URL with the actual gameId
    const STATS_API_URL = `https://cdn.espn.com/core/wnba/matchup?xhr=1&gameId=${gameId}`;
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
    
    // Render stats similar to NBA format
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
  const awayLogo = awayTeam.team?.logo || awayTeam.team?.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/wnba/500/${awayTeam.team?.abbreviation}.png`;
  const homeLogo = homeTeam.team?.logo || homeTeam.team?.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/wnba/500/${homeTeam.team?.abbreviation}.png`;
  
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

// Function to render match stats similar to NBA
function renderMatchStats(awayTeam, homeTeam, awayStats, homeStats) {
  const statsContainer = document.getElementById('matchStatsDisplay');
  if (!statsContainer) return;
  
  console.log('Rendering match stats for:', awayTeam, homeTeam);
  
  // Get team logos with multiple fallback options
  const awayLogo = awayTeam.team?.logo || 
                   awayTeam.team?.logos?.[0]?.href || 
                   awayTeam.logo || 
                   `https://a.espncdn.com/i/teamlogos/wnba/500/${awayTeam.team?.abbreviation || awayTeam.abbreviation}.png`;
  
  const homeLogo = homeTeam.team?.logo || 
                   homeTeam.team?.logos?.[0]?.href || 
                   homeTeam.logo || 
                   `https://a.espncdn.com/i/teamlogos/wnba/500/${homeTeam.team?.abbreviation || homeTeam.abbreviation}.png`;
  
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
          <img src="${awayLogo}" alt="${awayName}" class="stats-team-logo" onerror="this.src='icon.png';">
          <div class="stats-team-name">${awayName}</div>
        </div>
        <div class="stats-team home">
          <div class="stats-team-name">${homeName}</div>
          <img src="${homeLogo}" alt="${homeName}" class="stats-team-logo" onerror="this.src='icon.png';">
        </div>
      </div>
  `;
  
  // Process statistics if available
  if (awayStats.length > 0 && homeStats.length > 0) {
    // Create stat categories for WNBA (same as NBA - removing possession since it doesn't apply)
    const statCategories = {
      'Shooting': ['fieldGoalsMade', 'fieldGoalPct', 'threePointMade', 'threePointPct', 'freeThrowsMade', 'freeThrowPct'],
      'Rebounds': ['totalRebounds', 'offensiveRebounds', 'defensiveRebounds'],
      'Offense': ['assists', 'points', 'pointsInPaint', 'fastBreakPoints'],
      'Defense': ['steals', 'blocks', 'turnovers'],
      'Other': ['flagrantFouls', 'technicalFouls', 'teamRebounds']
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
          if (statKey.includes('Pct')) {
            // For percentage stats, extract numeric value
            awayValue = extractNumericValue(awayStat);
            homeValue = extractNumericValue(homeStat);
          } else {
            awayValue = parseFloat(awayStat) || 0;
            homeValue = parseFloat(homeStat) || 0;
          }
          
          const total = awayValue + homeValue;
          
          // Calculate percentages for bar widths
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
  
  // Then load and append head-to-head data
  const gameId = getQueryParam("gameId");
  loadHeadToHead(gameId);
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

// Helper function to extract numeric value from stat strings
function extractNumericValue(statValue) {
  if (typeof statValue === 'number') return statValue;
  if (typeof statValue === 'string') {
    // Handle percentage values like "45.2%" or fractions like "12/25"
    if (statValue.includes('%')) {
      return parseFloat(statValue.replace('%', ''));
    } else if (statValue.includes('/')) {
      const parts = statValue.split('/');
      if (parts.length === 2) {
        const numerator = parseFloat(parts[0]);
        const denominator = parseFloat(parts[1]);
        if (denominator !== 0) {
          return (numerator / denominator) * 100; // Convert to percentage
        }
      }
    } else {
      return parseFloat(statValue) || 0;
    }
  }
  return 0;
}

// Helper function to get display names for stats
function getStatDisplayName(statKey) {
  const displayNames = {
    'fieldGoalsMade': 'Field Goals Made',
    'fieldGoalPct': 'Field Goal %',
    'threePointMade': '3-Point Made',
    'threePointPct': '3-Point %',
    'freeThrowsMade': 'Free Throws Made',
    'freeThrowPct': 'Free Throw %',
    'totalRebounds': 'Total Rebounds',
    'offensiveRebounds': 'Offensive Rebounds',
    'defensiveRebounds': 'Defensive Rebounds',
    'assists': 'Assists',
    'points': 'Points',
    'pointsInPaint': 'Points in Paint',
    'fastBreakPoints': 'Fast Break Points',
    'steals': 'Steals',
    'blocks': 'Blocks',
    'turnovers': 'Turnovers',
    'flagrantFouls': 'Flagrant Fouls',
    'technicalFouls': 'Technical Fouls',
    'teamRebounds': 'Team Rebounds'
  };
  
  return displayNames[statKey] || statKey;
}

// Function to load and render leaders data
async function loadMatchLeaders() {
  try {
    const gameId = getQueryParam("gameId");
    if (!gameId) return;
    
    const LEADERS_API_URL = `https://cdn.espn.com/core/wnba/matchup?xhr=1&gameId=${gameId}`;
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

// Function to render leaders (like NBA's form containers)
function renderLeaders(leadersData) {
  const statsContainer = document.getElementById('matchStatsDisplay');
  if (!statsContainer || !leadersData) return;
  
  // Create leaders HTML similar to NBA's form containers
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
          <img src="${team.logo || team.logos?.[0]?.href}" alt="${team.displayName}" class="form-team-logo-header" onerror="this.src='icon.png';">
          <div class="form-team-info">
            <div class="form-team-name">${team.displayName}</div>
            <div class="form-subtitle">LEADERS</div>
          </div>
        </div>
        
        <div class="form-matches">
    `;
    
    // Add leaders for key categories
    const keyLeaders = ['points', 'rebounds', 'assists'];
    
    keyLeaders.forEach(leaderType => {
      const leaderCategory = leaders.find(cat => cat.name === leaderType);
      if (leaderCategory && leaderCategory.leaders && leaderCategory.leaders.length > 0) {
        const leader = leaderCategory.leaders[0]; // Top leader
        const athlete = leader.athlete;
        
        const map = {
          'Points': {text1: 'PTS', text2: 'FG', text3: 'FT'},
          'Rebounds': {text1: 'REB', text2: 'DREB', text3: 'OREB'},
          'Assists': {text1: 'AST', text2: 'TO', text3: 'MIN'},
        }
        const texts = map[leaderCategory.displayName] || {text1: '', text2: '', text3: ''};

        const { text1, text2, text3 } = texts;

        const isMobile = window.innerWidth <= 525;
        
        leadersHtml += `
          <div class="form-match">
            <div class="form-match-header">
              <div class="form-date">${leaderCategory.displayName}</div>
              <div class="form-competition" style="margin-left: auto; font-size: 12px; color: #888;">${athlete.position?.abbreviation || 'Player'}</div>
            </div>
            <div class="form-match-teams">
              <div class="form-team">
                <img src="${athlete.headshot?.href || 'icon.png'}" alt="${athlete.displayName}" class="form-team-logo-small" onerror="this.src='icon.png';">
                <span class="form-team-abbr">${athlete.shortName || athlete.displayName}</span>
                <span style="color: grey;">#${athlete.jersey || ''}</span>
              </div>
              ${isMobile 
                ? `
              <div class="stat-container">
                <div class="form-score">${leader.statistics[0].displayValue}</div>
                <div style="color: #ccc; font-size: 12px;">${text1}</div>
              </div>
              ` : `
              <div class="stat-container">
                <div class="form-score">${leader.statistics[0].displayValue}</div>
                <div style="color: #ccc; font-size: 12px;">${text1}</div>
              </div>
              <div class="stat-container">
                <div class="form-score">${leader.statistics[1].displayValue}</div>
                <div style="color: #ccc; font-size: 12px;">${text2}</div>
              </div>
              <div class="stat-container">
                <div class="form-score">${leader.statistics[2].displayValue}</div>
                <div style="color: #ccc; font-size: 12px;">${text3}</div>
              </div>
              `}
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

// Function to load and render head-to-head data
async function loadHeadToHead(gameId) {
  try {
    if (!gameId) return;
    
    const H2H_API_URL = `https://cdn.espn.com/core/wnba/matchup?xhr=1&gameId=${gameId}`;
    const response = await fetch(H2H_API_URL);
    const data = await response.json();
    
    console.log('Head-to-head data received:', data);
    
    if (data && data.gamepackageJSON && data.gamepackageJSON.seasonseries) {
      renderHeadToHead(data.gamepackageJSON.seasonseries);
    }
  } catch (error) {
    console.error('Error loading head-to-head:', error);
  }
}

// Function to render head-to-head matches
function renderHeadToHead(seasonSeriesData) {
  const statsContainer = document.getElementById('matchStatsDisplay');
  if (!statsContainer || !seasonSeriesData || !seasonSeriesData.length) return;
  
  const seriesInfo = seasonSeriesData[0]; // Get the main series info
  if (!seriesInfo.events || !seriesInfo.events.length) return;
  
  let h2hHtml = `
    <div class="h2h-container">
      <div class="h2h-header">
        <div class="h2h-title">Head to Head</div>
      </div>
      <div class="h2h-matches">
  `;
  
  // Sort events by date (most recent first)
  const sortedEvents = seriesInfo.events.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  sortedEvents.forEach(event => {
    const date = new Date(event.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    const dateStr = new Date(event.date);
    const estFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = estFormatter.formatToParts(dateStr);
    const estDate = `${parts.find(p => p.type === 'year').value}${parts.find(p => p.type === 'month').value}${parts.find(p => p.type === 'day').value}`;
    
    // Find home and away teams
    const homeTeam = event.competitors.find(c => c.homeAway === 'home');
    const awayTeam = event.competitors.find(c => c.homeAway === 'away');
    
    if (!homeTeam || !awayTeam) return;
    
    const matchId = event.id;
    const score = `${awayTeam.score} - ${homeTeam.score}`;

    const isMobile = window.innerWidth <= 525;
    
    h2hHtml += `
      <div class="h2h-match clickable-match" onclick="openWNBAMatchPage('${matchId}', '${estDate}')" style="cursor: pointer;">
        <div class="h2h-match-header">
          <span class="h2h-date">${date}</span>
          <span class="h2h-competition">WNBA</span>
        </div>
        <div class="h2h-match-teams">
          <div class="h2h-team">
            <img src="${awayTeam.team.logo}" class="h2h-team-logo" onerror="this.src='icon.png'">
            <span class="h2h-team-name">${isMobile ? awayTeam.team.abbreviation : awayTeam.team.displayName}</span>
          </div>
          <span class="h2h-score">${score}</span>
          <div class="h2h-team">
            <img src="${homeTeam.team.logo}" class="h2h-team-logo" onerror="this.src='icon.png'">
            <span class="h2h-team-name">${isMobile ? homeTeam.team.abbreviation : homeTeam.team.displayName}</span>
          </div>
        </div>
      </div>
    `;
  });
  
  h2hHtml += `
      </div>
    </div>
  `;
  
  // Append head-to-head to the stats container
  statsContainer.innerHTML += h2hHtml;
}

// Function to open WNBA match page in new window
window.openWNBAMatchPage = function(matchId, estDate) {
  const url = `scoreboard.html?gameId=${matchId}&date=${estDate}`;
  window.open(url, '_blank');
};

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
      console.log('Test stream loaded successfully:', url);
      cleanup();
      resolve(true);
    };

    testIframe.onerror = () => {
      hasError = true;
      console.log('Test stream failed to load:', url);
      cleanup();
      resolve(false);
    };

    // Set a timeout for the test
    streamTestTimeout = setTimeout(() => {
      if (!hasLoaded && !hasError) {
        console.log('Test stream timed out:', url);
        cleanup();
        resolve(false);
      }
    }, 10000); // 10 second timeout

    document.body.appendChild(testIframe);
  });
}

async function tryNextStream() {
  if (isStreamTesting) {
    console.log('Stream testing already in progress');
    return;
  }

  isStreamTesting = true;
  console.log('Starting automatic stream testing...');

  // Map stream types to available stream keys
  const streamMap = {
    'alpha1': 'alpha',
    'alpha2': 'alpha',
    'bravo': 'bravo'
  };

  const streamOrder = ['alpha1', 'alpha2', 'bravo'];
  const currentIndex = streamOrder.indexOf(currentStreamType);

  for (let i = 1; i < streamOrder.length; i++) {
    const nextIndex = (currentIndex + i) % streamOrder.length;
    const nextStreamType = streamOrder[nextIndex];
    const streamKey = streamMap[nextStreamType];

    if (availableStreams[streamKey]) {
      console.log(`Testing ${nextStreamType} stream...`);
      const isWorking = await testStream(availableStreams[streamKey].embedUrl);

      if (isWorking) {
        console.log(`${nextStreamType} stream is working, switching to it`);
        window.switchToStream(nextStreamType);
        isStreamTesting = false;
        return;
      } else {
        console.log(`${nextStreamType} stream failed test`);
      }
    }
  }

  console.log('No working streams found');
  isStreamTesting = false;
}

function startStreamTesting() {
  if (!isStreamTesting) {
    tryNextStream();
  }
}

// Make stream testing functions available globally
window.testStream = testStream;
window.tryNextStream = tryNextStream;
window.startStreamTesting = startStreamTesting;

// Copy Expanded Play Card Function - captures everything including mini court and players
window.copyExpandedPlayCard = async function(playIndex, teamColor, teamName, teamAbbreviation, isHomeTeam) {
  try {
    // Find the play elements - the expanded content
    const playElement = document.getElementById(`play-${playIndex}`);
    const playDetailsElement = document.getElementById(`play-details-content-${playIndex}`);
    
    if (!playElement || !playDetailsElement) {
      showCopyNotification('Could not find play content to copy', true);
      return;
    }

    // Find the play header element (which contains the play description)
    // The play header is the previous sibling of the expanded play element
    const playContainer = playElement.parentElement;
    const playHeader = playContainer?.querySelector('.play-header');
    
    // Get the play description from the header element
    let playDescription = 'No description available';
    if (playHeader) {
      const descElement = playHeader.querySelector('.play-description');
      playDescription = descElement?.textContent?.trim() || 'No description available';
    }
    
    const scoreChange = playHeader?.querySelector('.score-indicator')?.textContent || '';
    
    console.log('Play description found:', playDescription); // Debug log
    
    // Get the period and clock from the play header
    const playHeaderElement = playElement.previousElementSibling;
    let playPeriod = '';
    let playClock = '';
    let awayScore = '0';
    let homeScore = '0';
    let awayLogo = '';
    let homeLogo = '';
    
    if (playHeader) {
      // Try to get period and clock from play header
      playPeriod = playHeader.querySelector('.period')?.textContent || '';
      playClock = playHeader.querySelector('.clock')?.textContent || '';
      
      // Try to get scores from play header
      const scoresInHeader = playHeader.querySelectorAll('.score');
      if (scoresInHeader.length >= 2) {
        awayScore = scoresInHeader[0]?.textContent || '0';
        homeScore = scoresInHeader[1]?.textContent || '0';
      }
      
      // Try to get team logos from play header
      const logosInHeader = playHeader.querySelectorAll('.team-logo-small');
      if (logosInHeader.length >= 2) {
        awayLogo = logosInHeader[0]?.src || '';
        homeLogo = logosInHeader[1]?.src || '';
      }
    }
    
    // Fallback: Get current game data from the top scoreboard if play header doesn't have the info
    const topScoreboard = document.getElementById('topScoreboard');
    if (!awayLogo || !homeLogo) {
      const teamLogos = topScoreboard?.querySelectorAll('.team-logo') || [];
      awayLogo = awayLogo || teamLogos[0]?.src || '';
      homeLogo = homeLogo || teamLogos[1]?.src || '';
    }
    
    if (!playPeriod || !playClock) {
      playPeriod = playPeriod || topScoreboard?.querySelector('.inning-status')?.textContent || '';
      playClock = playClock || topScoreboard?.querySelector('.time-left')?.textContent || '';
    }

    // Log the scoring team information (now passed directly from the button)
    console.log(`🏀 COPY CARD: Scoring play by ${teamName} (${teamAbbreviation}) - ${isHomeTeam ? 'HOME' : 'AWAY'} team`);
    console.log(`📋 Play Description: ${playDescription}`);
    console.log(`🎯 Score Change: ${scoreChange}`);
    console.log(`⏰ Time: ${playPeriod} ${playClock}`);
    console.log(`Team Color: #${teamColor}`);

    // Import html2canvas dynamically
    let html2canvas;
    try {
      html2canvas = (await import('https://html2canvas.hertzen.com/dist/html2canvas.esm.js')).default;
    } catch (e) {
      // Fallback to CDN
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      document.head.appendChild(script);
      
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
      });
      
      html2canvas = window.html2canvas;
    }

    // Create a container with custom header and the expanded play details
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      top: -10000px;
      left: -10000px;
      width: 800px;
      background: grey;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      border-radius: 8px;
      overflow: visible;
      z-index: 9999;
    `;

    // Create custom header with team logos, scores at time of play, quarter, and time
    const header = document.createElement('div');
    header.style.cssText = `
      background: #333;
      padding: 20px;
      border-radius: 8px 8px 0 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 0;
    `;

    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 15px;">
        ${awayLogo ? `<img src="${awayLogo}" alt="Away Team" style="width: 40px; height: 40px; border-radius: 50%;" crossorigin="anonymous">` : '<div style="width: 40px; height: 40px; background: #555; border-radius: 50%;"></div>'}
        <div style="font-size: 28px; font-weight: bold;">${awayScore}</div>
        <div style="font-size: 20px; color: #ccc;">-</div>
        <div style="font-size: 28px; font-weight: bold;">${homeScore}</div>
        ${homeLogo ? `<img src="${homeLogo}" alt="Home Team" style="width: 40px; height: 40px; border-radius: 50%;" crossorigin="anonymous">` : '<div style="width: 40px; height: 40px; background: #555; border-radius: 50%;"></div>'}
      </div>
      <div style="text-align: right;">
        <div style="font-size: 16px; font-weight: bold; color: #007bff;">${playPeriod}</div>
        <div style="font-size: 14px; color: #ccc;">${playClock}</div>
        ${scoreChange ? `<div style="font-size: 14px; color: #28a745; font-weight: bold;">${scoreChange}</div>` : ''}
      </div>
    `;

    // Create play description section with team color gradient
    const playDesc = document.createElement('div');
    playDesc.style.cssText = `
      background: linear-gradient(135deg, #${teamColor} 0%, #${teamColor + '88'} 100%);
      padding: 15px 20px;
      font-size: 16px;
      font-weight: 600;
      line-height: 1.4;
      margin: 0;
      color: #fff;
      min-height: 20px;
      border-bottom: 1px solid rgba(255,255,255,0.3);
      text-shadow: 1px 1px 2px rgba(0,0,0,0.7);
    `;
    
    // Use play description or fallback text for debugging
    const displayText = playDescription || 'No play description found';
    playDesc.textContent = `${teamAbbreviation}: ${displayText}`;
    console.log('Setting play description text to:', displayText); // Debug log

    // Clone the play details (expanded content) - maintaining the side-by-side layout
    const playDetails = playDetailsElement.cloneNode(true);
    playDetails.style.cssText = `
      display: flex !important;
      gap: 20px;
      align-items: flex-start;
      background: #2a2a2a;
      padding: 20px;
      border-radius: 0 0 8px 8px;
      margin: 0;
    `;

    // Remove any copy buttons from the cloned details
    const copyButtons = playDetails.querySelectorAll('.copy-play-btn-inside');
    copyButtons.forEach(btn => btn.remove());

    // Ensure the mini court maintains its dimensions
    const miniCourt = playDetails.querySelector('.mini-court');
    if (miniCourt) {
      miniCourt.style.cssText = `
        flex-shrink: 0;
        width: 150px;
        height: 200px;
      `;
    }

    const shotMarker = playDetails.querySelector('.shot-marker');
    if (shotMarker) {
      // Only modify size, preserve all existing positioning and color styles
      shotMarker.style.width = '11px';
      shotMarker.style.height = '11px';
    }

    // Ensure participants section takes remaining space
    const participants = playDetails.querySelector('.play-participants');
    if (participants) {
      participants.style.cssText = `
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 10px;
      `;
    }

    const playerImage = playDetails.querySelectorAll('.player-image');
    playerImage.forEach(div => {
      div.style.width = '80px';
      div.style.height = '60px';
      div.style.background = 'transparent';
    });

    // Ensure all images are loaded before capturing
    const images = playDetails.querySelectorAll('img');
    const imagePromises = Array.from(images).map(img => {
      if (img.complete) return Promise.resolve();
      
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        // Add crossorigin to handle CORS
        img.crossOrigin = 'anonymous';
        // Force reload to apply crossorigin
        const src = img.src;
        img.src = '';
        img.src = src;
        
        // Fallback timeout
        setTimeout(resolve, 1000);
      });
    });

    // Wait for images to load
    await Promise.all(imagePromises);

    // Append to container in order: header, play description, then details
    container.appendChild(header);
    container.appendChild(playDesc);
    container.appendChild(playDetails);
    
    // Temporarily add to DOM
    document.body.appendChild(container);

    // Wait a moment for DOM to settle
    await new Promise(resolve => setTimeout(resolve, 100));

    // Capture with html2canvas
    const canvas = await html2canvas(container, {
      backgroundColor: '#1a1a1a',
      scale: 3, // Higher quality
      useCORS: true,
      allowTaint: true,
      foreignObjectRendering: false,
      imageTimeout: 2000,
      removeContainer: true,
      logging: false,
      width: 800,
      height: container.scrollHeight,
      scrollX: 0,
      scrollY: 0,
      windowWidth: 800,
      windowHeight: container.scrollHeight
    });

    // Remove temporary container
    document.body.removeChild(container);

    // Convert to blob and copy
    canvas.toBlob(async (blob) => {
      try {
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        showCopyNotification('Full play card copied to clipboard!');
      } catch (clipboardError) {
        console.error('Clipboard error:', clipboardError);
        
        // Fallback: create download link
        const link = document.createElement('a');
        link.download = `play-card-${playIndex}.png`;
        link.href = canvas.toDataURL();
        link.click();
        
        showCopyNotification('Play card downloaded (clipboard not available)');
      }
    }, 'image/png', 0.95);

  } catch (error) {
    console.error('Error in copyExpandedPlayCard:', error);
    showCopyNotification('Error copying play card', true);
  }
};

// Copy Play Card Function
window.copyPlayCard = async function(playIndex, awayTeamName, homeTeamName, awayTeamLogo, homeTeamLogo, awayScore, homeScore, period, clock, playDescription, scoreValue) {
  try {
    // Create a temporary canvas to generate the play card image
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas dimensions
    canvas.width = 400;
    canvas.height = 200;
    
    // Background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Header background
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, canvas.width, 80);
    
    // Load team logos and draw the card
    const drawCard = async () => {
      try {
        // Load team logos
        const awayLogoImg = new Image();
        const homeLogoImg = new Image();
        
        awayLogoImg.crossOrigin = 'anonymous';
        homeLogoImg.crossOrigin = 'anonymous';
        
        await Promise.all([
          new Promise((resolve, reject) => {
            awayLogoImg.onload = resolve;
            awayLogoImg.onerror = resolve; // Continue even if logo fails
            awayLogoImg.src = awayTeamLogo;
          }),
          new Promise((resolve, reject) => {
            homeLogoImg.onload = resolve;
            homeLogoImg.onerror = resolve; // Continue even if logo fails
            homeLogoImg.src = homeTeamLogo;
          })
        ]);
        
        // Draw away team logo
        if (awayLogoImg.complete && awayLogoImg.naturalWidth > 0) {
          ctx.drawImage(awayLogoImg, 20, 15, 40, 40);
        }
        
        // Draw away team info
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(awayTeamName, 70, 30);
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(awayScore.toString(), 70, 50);
        
        // Draw separator
        ctx.fillStyle = '#ccc';
        ctx.font = '20px sans-serif';
        ctx.fillText('-', 190, 50);
        
        // Draw home team info
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(homeScore.toString(), 210, 50);
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(homeTeamName, 250, 30);
        
        // Draw home team logo
        if (homeLogoImg.complete && homeLogoImg.naturalWidth > 0) {
          ctx.drawImage(homeLogoImg, 340, 15, 40, 40);
        }
        
        // Draw period and clock
        ctx.fillStyle = '#007bff';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`${period} • ${clock}`, 20, 70);
        
        // Draw score indicator
        if (scoreValue > 0) {
          ctx.fillStyle = '#28a745';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText(`+${scoreValue} PTS`, 320, 70);
        }
        
        // Draw play description
        ctx.fillStyle = 'white';
        ctx.font = '14px sans-serif';
        
        // Word wrap the play description
        const words = playDescription.split(' ');
        let line = '';
        let y = 110;
        const maxWidth = canvas.width - 40;
        
        for (let i = 0; i < words.length; i++) {
          const testLine = line + words[i] + ' ';
          const metrics = ctx.measureText(testLine);
          const testWidth = metrics.width;
          
          if (testWidth > maxWidth && i > 0) {
            ctx.fillText(line.trim(), 20, y);
            line = words[i] + ' ';
            y += 20;
            
            // Limit to 3 lines
            if (y > 150) {
              line = line.slice(0, -1) + '...';
              break;
            }
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line.trim(), 20, y);
        
        // Convert canvas to blob and copy to clipboard
        canvas.toBlob(async (blob) => {
          try {
            const item = new ClipboardItem({ 'image/png': blob });
            await navigator.clipboard.write([item]);
            
            // Show success message
            showCopyNotification('Play card copied to clipboard!');
          } catch (clipboardError) {
            console.error('Failed to copy to clipboard:', clipboardError);
            showCopyNotification('Failed to copy play card', true);
          }
        }, 'image/png');
        
      } catch (error) {
        console.error('Error creating play card:', error);
        showCopyNotification('Error creating play card', true);
      }
    };
    
    await drawCard();
    
  } catch (error) {
    console.error('Error in copyPlayCard:', error);
    showCopyNotification('Error copying play card', true);
  }
};

// Show copy notification
function showCopyNotification(message, isError = false) {
  // Create notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${isError ? '#dc3545' : '#28a745'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-weight: bold;
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = message;
  
  // Add animation styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notification);
  
  // Remove notification after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

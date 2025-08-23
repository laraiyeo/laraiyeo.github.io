const TEAMS_API_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams";

// Function to convert any URL to HTTPS
function convertToHttps(url) {
  if (typeof url !== 'string') return url;
  return url.replace(/^http:\/\//i, 'https://');
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

function normalizeTeamName(teamName) {
  // General normalization like soccer - convert to lowercase and replace spaces with hyphens
  return teamName.toLowerCase().replace(/\s+/g, '-');
}

async function extractVideoPlayerUrl(pageUrl) {
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(pageUrl)}`;
    const response = await fetch(proxyUrl);
    const data = await response.json();
    
    if (data.contents) {
      const iframeMatch = data.contents.match(/src="([^"]*castweb\.xyz[^"]*)"/);
      if (iframeMatch) {
        return iframeMatch[1];
      }
      
      const altMatch = data.contents.match(/iframe[^>]*src="([^"]*\.php[^"]*)"/);
      if (altMatch) {
        return altMatch[1];
      }
    }
  } catch (error) {
    console.error('Error extracting video player URL:', error);
  }
  
  return null;
}

function generateStreamUrls(awayTeamName, homeTeamName) {
  const awayNormalized = normalizeTeamName(awayTeamName);
  const homeNormalized = normalizeTeamName(homeTeamName);
  
  // Only use away vs home format (like soccer)
  return [
    `https://papaahd.live/${homeNormalized}-vs-${awayNormalized}/`
  ];
}

// Global variables for stream testing
let streamUrls = [];
let currentStreamIndex = 0;
let streamTestTimeout = null;
let isMuted = true; // Start muted to prevent autoplay issues

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

// Add these functions to handle stream loading
window.loadStream = function(url) {
  const iframe = document.getElementById('streamIframe');
  
  if (iframe) {
    iframe.src = url;
  }
};

window.handleStreamLoad = function() {
  const iframe = document.getElementById('streamIframe');
  const connectingDiv = document.getElementById('streamConnecting');
  
  // Clear any existing timeout
  if (streamTestTimeout) {
    clearTimeout(streamTestTimeout);
    streamTestTimeout = null;
  }
  
  if (iframe.src !== 'about:blank') {
    console.log('Stream loaded:', iframe.src);
    
    // Wait a bit then check content
    setTimeout(() => checkStreamContent(iframe), 1000);
  }
};

window.handleStreamError = function() {
  console.log('Stream error occurred, trying next...');
  tryNextStream();
};

function checkStreamContent(iframe) {
  const connectingDiv = document.getElementById('streamConnecting');
  
  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    
    const hasVideo = iframeDoc.querySelector('video') || 
                    iframeDoc.querySelector('.video-js') || 
                    iframeDoc.querySelector('[id*="video"]') ||
                    iframeDoc.querySelector('[class*="player"]');
    
    if (hasVideo) {
      iframe.style.display = 'block';
      if (connectingDiv) {
        connectingDiv.style.display = 'none';
      }
      streamUrls = [];
      return;
    }
  } catch (e) {
    console.log('Cannot access iframe content (cross-origin), assuming external stream');
    iframe.style.display = 'block';
    if (connectingDiv) {
      connectingDiv.style.display = 'none';
    }
  }
  
  setTimeout(() => {
    if (streamUrls.length > 0) {
      tryNextStream();
    } else {
      iframe.style.display = 'block';
      if (connectingDiv) {
        connectingDiv.style.display = 'none';
      }
    }
  }, 1000);
}

function tryNextStream() {
  const iframe = document.getElementById('streamIframe');
  
  if (currentStreamIndex < streamUrls.length) {
    const nextUrl = streamUrls[currentStreamIndex];
    currentStreamIndex++;
    
    streamTestTimeout = setTimeout(() => {
      tryNextStream();
    }, 4000);
    
    if (iframe) {
      iframe.src = nextUrl;
    }
  } else {
    const connectingDiv = document.getElementById('streamConnecting');
    iframe.style.display = 'block';
    if (connectingDiv) {
      connectingDiv.style.display = 'none';
    }
    streamUrls = [];
  }
}

async function startStreamTesting(awayTeamName, homeTeamName) {
  console.log('Starting stream testing for:', awayTeamName, 'vs', homeTeamName);
  
  // Generate page URLs to extract from
  const pageUrls = generateStreamUrls(awayTeamName, homeTeamName);
  
  streamUrls = [];
  
  // Try to extract actual video player URLs
  const extractionPromises = pageUrls.map(async (url) => {
    try {
      const videoUrl = await extractVideoPlayerUrl(url);
      return videoUrl;
    } catch (error) {
      console.error(`Error extracting from ${url}:`, error);
      return null;
    }
  });
  
  const extractedUrls = await Promise.all(extractionPromises);
  
  extractedUrls.forEach(url => {
    if (url) {
      streamUrls.push(url);
      console.log(`Extracted video URL: ${url}`);
    }
  });
  
  // If no video URLs extracted, use page URLs directly as fallback
  if (streamUrls.length === 0) {
    console.log('No video URLs extracted, using page URLs directly');
    streamUrls = pageUrls;
  }
  
  currentStreamIndex = 0;
  
  // Start stream testing
  setTimeout(() => {
    tryNextStream();
  }, 300);
}

function renderStreamEmbed(awayTeamName, homeTeamName) {
  const streamContainer = document.getElementById('streamEmbed');
  
  if (!streamContainer) return;

  // Check if stream is already initialized and working
  const existingIframe = document.getElementById('streamIframe');
  if (existingIframe && existingIframe.src !== 'about:blank') {
    console.log('Stream already initialized and running, skipping rebuild');
    return;
  }

  const isSmallScreen = window.innerWidth < 525;
  const screenHeight = isSmallScreen ? 250 : 400;
  
  streamContainer.innerHTML = `
    <div style="background: #1a1a1a; border-radius: 1rem; padding: 1rem; margin-bottom: 2rem;">
      <div class="stream-header" style="margin-bottom: 10px; text-align: center;">
        <h3 style="color: white; margin: 0;">Live Stream</h3>
        <div class="stream-controls" style="margin-top: 10px;">
          <button id="fullscreenButton" onclick="toggleFullscreen()" style="padding: 8px 16px; margin: 0 5px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">⛶ Fullscreen</button>
        </div>
      </div>
      <div id="streamConnecting" style="display: block; color: white; padding: 20px; background: #333; margin-bottom: 10px; border-radius: 8px; text-align: center;">
        <p>Connecting to stream... <span id="streamStatus"></span></p>
      </div>
      <div class="stream-iframe-container" style="position: relative; width: 100%; margin: 0 auto; overflow: hidden;">
        <iframe 
          id="streamIframe"
          src="about:blank"
          width="100%" 
          height="${screenHeight}"
          style="aspect-ratio: 16/9; background: #000; display: none; border-radius: 8px;"
          frameborder="0"
          allowfullscreen
          allow="autoplay; fullscreen; encrypted-media"
          referrerpolicy="no-referrer-when-downgrade"
          onload="handleStreamLoad()"
          onerror="handleStreamError()">
        </iframe>
      </div>
    </div>
  `;
  
  // Start stream testing
  if (awayTeamName && homeTeamName) {
    console.log('Starting stream testing for:', awayTeamName, 'vs', homeTeamName);
    startStreamTesting(awayTeamName, homeTeamName);
  }
}

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
      showFeedback('Card not found', 'error');
      return;
    }

    await captureAndCopyImage(element);
    showFeedback('Scoring card copied to clipboard!', 'success');
  } catch (error) {
    console.error('Error copying scoring card:', error);
    showFeedback('Error copying card to clipboard', 'error');
  }
}

// Function to capture and copy element as image
async function captureAndCopyImage(element) {
  // Import html2canvas dynamically
  if (!window.html2canvas) {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    document.head.appendChild(script);
    
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
    });
  }

  const canvas = await html2canvas(element, {
    backgroundColor: null,
    scale: 2,
    logging: false,
    useCORS: true,
    allowTaint: true
  });

  canvas.toBlob(async (blob) => {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
    } catch (err) {
      console.error('Error copying to clipboard:', err);
      throw err;
    }
  });
}

// Function to show feedback messages
function showFeedback(message, type) {
  const feedback = document.createElement('div');
  feedback.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 6px;
    color: white;
    font-weight: bold;
    z-index: 10000;
    animation: slideIn 0.3s ease;
    ${type === 'success' ? 'background: #28a745;' : 'background: #dc3545;'}
  `;
  feedback.textContent = message;
  
  if (!document.getElementById('feedbackStyles')) {
    const style = document.createElement('style');
    style.id = 'feedbackStyles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(feedback);
  
  setTimeout(() => {
    feedback.remove();
  }, 3000);
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
        <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; width: 140%; margin-right: -30px; padding: 0 10px;">
          <div style="display: flex; flex-direction: column; align-items: center; text-align: center; flex: 1; max-width: 120px;">
            <div class="team-score responsive-score" style="color: ${awayScore > homeScore ? awayColor : '#888'}; margin-bottom: 10px;">${awayScore}</div>
            <div class="team-block" onclick="window.open('team-page.html?teamId=${awayTeam.team.id}', '_blank')" style="cursor: pointer; display: flex; flex-direction: column; align-items: center; text-align: center;">
              <img src="${convertToHttps(awayTeam.team.id === '349' ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${awayTeam.team.id}.png` : `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${awayTeam.team.id}.png`)}" 
                   alt="${awayTeam.team.displayName}" class="team-logo responsive-logo"
                   onerror="this.src='football.png';">
              <div class="team-name responsive-name">${awayTeam.team.abbreviation}</div>
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
              <div class="team-name responsive-name">${homeTeam.team.abbreviation}</div>
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
          <div class="team-name responsive-name">${awayTeam.team.abbreviation}</div>
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
          <div class="team-name responsive-name">${homeTeam.team.abbreviation}</div>
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
        awayTeam.team.abbreviation,
        homeTeam.team.abbreviation,
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
    if (gameState === 'in') {
      const streamContainer = document.getElementById('streamEmbed');
      if (streamContainer && streamContainer.innerHTML.trim() === '') {
        // Only initialize stream if container is empty (first time)
        renderStreamEmbed(awayTeam.team.displayName, homeTeam.team.displayName);
      }
    } else {
      // Clear stream container for non-live games
      const streamContainer = document.getElementById('streamEmbed');
      if (streamContainer) {
        streamContainer.innerHTML = '';
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
  fetchAndRenderTopScoreboard();
  
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

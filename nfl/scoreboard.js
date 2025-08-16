const TEAMS_API_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams";

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
  
  return nameMap[teamName] || teamName.toLowerCase().replace(/\s+/g, '-');
}

async function extractVideoPlayerUrl(pageUrl) {
  try {
    // Use a CORS proxy to fetch the page content
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(pageUrl)}`;
    const response = await fetch(proxyUrl);
    
    // Check if the response is successful
    if (!response.ok) {
      console.log(`CORS proxy response not OK: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const responseText = await response.text();
    
    // Check if the response looks like an error page
    if (responseText.includes('Oops') || responseText.includes('Error') || responseText.includes('404')) {
      console.log('CORS proxy returned an error page, skipping extraction');
      return null;
    }
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.log('Failed to parse CORS proxy response as JSON, skipping extraction');
      return null;
    }
    
    if (data && data.contents) {
      console.log('Successfully got page contents, searching for video URLs...');
      
      // Look for castweb.xyz iframe src patterns (most specific first)
      const iframeMatches = [
        /src="([^"]*castweb\.xyz[^"]*)"/i,
        /src='([^']*castweb\.xyz[^']*)'/i,
        /<iframe[^>]*src="([^"]*castweb\.xyz[^"]*)"[^>]*>/i,
        /<iframe[^>]*src='([^']*castweb\.xyz[^']*)'[^>]*>/i
      ];
      
      for (const pattern of iframeMatches) {
        const match = data.contents.match(pattern);
        if (match) {
          console.log(`Found castweb.xyz URL with pattern: ${pattern}`);
          console.log(`Extracted URL: ${match[1]}`);
          return match[1];
        }
      }
      
      // Look for other iframe patterns as fallback
      const altMatches = [
        /iframe[^>]*src="([^"]*\.php[^"]*)"/i,
        /iframe[^>]*src='([^']*\.php[^']*)'/i,
        /<iframe[^>]*src="([^"]*)"[^>]*>/i,
        /<iframe[^>]*src='([^']*)'[^>]*>/i
      ];
      
      for (const pattern of altMatches) {
        const match = data.contents.match(pattern);
        if (match && (match[1].includes('castweb') || match[1].includes('.php'))) {
          console.log(`Found fallback URL with pattern: ${pattern}`);
          console.log(`Extracted URL: ${match[1]}`);
          return match[1];
        }
      }
      
      // Debug: Check if there are any iframes at all
      const anyIframe = data.contents.match(/<iframe[^>]*>/i);
      if (anyIframe) {
        console.log('Found iframe in page but no matching patterns:', anyIframe[0]);
      } else {
        console.log('No iframes found in page content');
      }
      
      // Debug: Check for castweb mentions
      if (data.contents.includes('castweb')) {
        console.log('Page contains "castweb" but extraction failed');
        const castwebContext = data.contents.substring(
          Math.max(0, data.contents.indexOf('castweb') - 100),
          data.contents.indexOf('castweb') + 200
        );
        console.log('Context around castweb:', castwebContext);
      }
    }
  } catch (error) {
    console.log('Error extracting video player URL:', error.message);
  }
  
  return null;
}

// Global variables for stream testing
let streamUrls = [];
let currentStreamIndex = 0;
let streamTestTimeout = null;
let isMuted = true; // Start muted to prevent autoplay issues

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
        video.volume = isMuted ? 0 : 1;
      });
      console.log(isMuted ? 'Videos muted via direct access' : 'Videos unmuted via direct access');
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
      console.log('Iframe src updated with mute parameter');
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
  
  // Reduced delay from 3 seconds to 1 second
  if (iframe.src !== 'about:blank') {
    setTimeout(() => {
      checkStreamContent(iframe);
    }, 1000);
  }
  
  // Check if this is the initial auto-test - reduced delay
  if (streamUrls.length > 0 && iframe.src !== 'about:blank') {
    setTimeout(() => {
      checkStreamContent(iframe);
    }, 1500);
  } else {
    if (iframe.src !== 'about:blank') {
      iframe.style.display = 'block';
      if (connectingDiv) {
        connectingDiv.style.display = 'none';
      }
    }
  }
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
      console.log('Video content detected in iframe');
      return;
    }
  } catch (e) {
    console.log('Cannot access iframe content (cross-origin), assuming external stream');
    iframe.style.display = 'block';
    if (connectingDiv) {
      connectingDiv.style.display = 'none';
    }
  }
  
  // Reduced delay from 2 seconds to 1 second
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
    
    // Check if this URL looks like a full page rather than a video stream
    if (nextUrl.includes('papaahd.live/') && !nextUrl.includes('.php') && !nextUrl.includes('castweb')) {
      console.log(`Skipping full page URL: ${nextUrl}`);
      // Skip this URL and try the next one
      tryNextStream();
      return;
    }
    
    // Reduced timeout from 8 seconds to 4 seconds
    streamTestTimeout = setTimeout(() => {
      tryNextStream();
    }, 4000);
    
    if (iframe) {
      iframe.src = nextUrl;
      console.log(`Trying stream ${currentStreamIndex}/${streamUrls.length}: ${nextUrl}`);
    }
  } else {
    const connectingDiv = document.getElementById('streamConnecting');
    iframe.style.display = 'block';
    if (connectingDiv) {
      connectingDiv.style.display = 'none';
    }
    console.log('No more streams to try, showing connecting message');
    streamUrls = [];
  }
}

async function startStreamTesting(awayTeamName, homeTeamName) {
  const awayNormalized = normalizeTeamName(awayTeamName);
  const homeNormalized = normalizeTeamName(homeTeamName);
  
  // Simplified to only use home vs away format
  const pageUrls = [
    `https://papaahd.live/${homeNormalized}-vs-${awayNormalized}/`
  ];
  
  streamUrls = [];
  
  console.log('Starting stream testing for:', awayTeamName, 'vs', homeTeamName);
  
  // Process URLs in parallel for faster extraction
  const extractionPromises = pageUrls.map(async (url) => {
    try {
      console.log(`Attempting to extract video URL from: ${url}`);
      const videoUrl = await extractVideoPlayerUrl(url);
      if (videoUrl) {
        console.log(`Successfully extracted video URL: ${videoUrl}`);
      } else {
        console.log(`No video URL extracted from: ${url}`);
      }
      return videoUrl;
    } catch (error) {
      console.log(`Error extracting from ${url}:`, error.message);
      return null;
    }
  });
  
  const extractedUrls = await Promise.all(extractionPromises);
  
  // Add valid extracted URLs first
  extractedUrls.forEach(url => {
    if (url) {
      streamUrls.push(url);
    }
  });
  
  // If no video URLs were extracted, fall back to original page URLs
  if (streamUrls.length === 0) {
    console.log('No video URLs extracted, using page URLs directly as fallback');
    streamUrls = pageUrls;
  } else {
    console.log(`Found ${streamUrls.length} video URL(s) to test`);
  }
  
  currentStreamIndex = 0;
  
  // Reduced delay from 1 second to 300ms
  setTimeout(() => {
    tryNextStream();
  }, 300);
}

function renderStreamEmbed(awayTeamName, homeTeamName) {
  const homeNormalized = normalizeTeamName(homeTeamName);
  const awayNormalized = normalizeTeamName(awayTeamName);
  
  // Simplified to only use home vs away format
  const streamUrl = `https://papaahd.live/${homeNormalized}-vs-${awayNormalized}/`;
  const isSmallScreen = window.innerWidth < 525
  const screenHeight = isSmallScreen ? 250 : 700;
  
  return `
    <div class="stream-container" style="margin: 20px 0; text-align: center;">
      <div class="stream-header" style="margin-bottom: 10px; text-align: center;">
        <h3 style="color: white; margin: 0;">Live Stream</h3>
        <div class="stream-controls" style="margin-top: 10px;">
          <button id="fullscreenButton" onclick="toggleFullscreen()" style="padding: 8px 16px; margin: 0 5px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">⛶ Fullscreen</button>
        </div>
      </div>
      <div id="streamConnecting" style="display: block; color: white; padding: 20px; background: #333; border-radius: 8px; margin-bottom: 10px;">
        <p>Connecting to stream... <span id="streamStatus"></span></p>
      </div>
      <div class="stream-iframe-container" style="position: relative; width: 100%; margin: 0 auto; overflow: hidden;">
        <iframe 
          id="streamIframe"
          src="about:blank"
          width="100%" 
          height="${screenHeight}"
          style="aspect-ratio: 16/9; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); background: #000; display: none;"
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
}

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
    // Try to extract player name from play text for NFL
    console.log('No participants found, trying to extract from text:', playText);
    
    // Enhanced NFL scoring patterns - prioritize actual scorers over extra point kickers
    const patterns = [
      // Receiving touchdowns: "pass to PLAYER for X yards, TOUCHDOWN"
      /pass\s+(?:deep\s+)?(?:right|left|middle)?\s*to\s+([A-Z]\.[A-Za-z]+)\s+for\s+\d+\s+yards?,?\s+TOUCHDOWN/i,
      // Rushing touchdowns: "PLAYER run/rush/guard/tackle/end for X yards, TOUCHDOWN"
      /([A-Z]\.[A-Za-z]+)\s+(?:run|rush|up the middle|left end|right end|left guard|right guard|left tackle|right tackle)\s+for\s+\d+\s+yards?,?\s+TOUCHDOWN/i,
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
  const teamLogo = `https://a.espncdn.com/i/teamlogos/nfl/500/${teamAbbr}.png`;

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
  const homeTeamLogo = `https://a.espncdn.com/i/teamlogos/nfl/500/${homeTeam?.team?.abbreviation || homeTeam?.abbreviation}.png`;
  const awayTeamLogo = `https://a.espncdn.com/i/teamlogos/nfl/500/${awayTeam?.team?.abbreviation || awayTeam?.abbreviation}.png`;

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
      const teamLogo = team.team.abbreviation === ("NYG" || "NYJ") ? `https://a.espncdn.com/i/teamlogos/nfl/500-dark/${team.team.abbreviation}.png` : `https://a.espncdn.com/i/teamlogos/nfl/500/${team.team.abbreviation}.png`;

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

async function renderPlayByPlay(gameId) {
  try {
    const PLAY_BY_PLAY_API_URL = `https://cdn.espn.com/core/nfl/playbyplay?xhr=1&gameId=${gameId}`;
    console.log("Fetching play-by-play from:", PLAY_BY_PLAY_API_URL);
    const response = await fetch(PLAY_BY_PLAY_API_URL);
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
      const BOX_SCORE_API_URL = `https://cdn.espn.com/core/nfl/boxscore?xhr=1&gameId=${gameId_param}`;
      const boxScoreResponse = await fetch(BOX_SCORE_API_URL);
      boxScoreData = await boxScoreResponse.json();
    } catch (error) {
      console.log("Could not fetch box score data for scoring cards");
    }
    
    // Try to get home/away team IDs from the first drive or API call
    if (drives.length > 0) {
      // We'll determine home/away from game data
      try {
        const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`;
        const scoreboardResponse = await fetch(SCOREBOARD_API_URL);
        const scoreboardData = await scoreboardResponse.json();
        const currentGame = scoreboardData.events?.find(game => game.id === gameId_param);
        
        if (currentGame) {
          homeTeamId = currentGame.competitions[0].competitors.find(c => c.homeAway === "home")?.team?.id;
          awayTeamId = currentGame.competitions[0].competitors.find(c => c.homeAway === "away")?.team?.id;
          homeTeam = currentGame.competitions[0].competitors.find(c => c.homeAway === "home");
          awayTeam = currentGame.competitions[0].competitors.find(c => c.homeAway === "away");
        }
      } catch (e) {
        console.log("Could not fetch team home/away info");
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
  } catch (error) {
    console.error("Error fetching NFL play-by-play data:", error);
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
    const streamContainer = document.getElementById("streamEmbed");
    if (!streamContainer.innerHTML && isInProgress) {
      streamContainer.innerHTML = renderStreamEmbed(awayTeam?.displayName, homeTeam?.displayName);
      
      // Start stream testing
      startStreamTesting(awayTeam?.displayName, homeTeam?.displayName);
    } else if (isInProgress && !streamContainer.innerHTML) {
      streamContainer.innerHTML = renderStreamEmbed(awayTeam?.displayName, homeTeam?.displayName);
      startStreamTesting(awayTeam?.displayName, homeTeam?.displayName);
    } else if (!isInProgress && streamContainer.innerHTML) {
      // Clear stream container if game is finished
      streamContainer.innerHTML = "";
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
  // Update button states
  document.getElementById('statsBtn').classList.add('active');
  document.getElementById('playsBtn').classList.remove('active');
  
  // Show/hide content sections
  document.getElementById('statsContent').style.display = 'block';
  document.getElementById('playsContent').style.display = 'none';
}

function showPlays() {
  // Update button states
  document.getElementById('playsBtn').classList.add('active');
  document.getElementById('statsBtn').classList.remove('active');
  
  // Show/hide content sections
  document.getElementById('statsContent').style.display = 'none';
  document.getElementById('playsContent').style.display = 'block';
  
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

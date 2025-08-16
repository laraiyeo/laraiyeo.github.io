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
  "Arizona Diamondbacks": "#A71930", "Atlanta Braves": "#13274F", "Baltimore Orioles": "#000000", "Boston Red Sox": "#0C2340",
  "Chicago White Sox": "#000000", "Chicago Cubs": "#0E3386", "Cincinnati Reds": "#C6011F", "Cleveland Guardians": "#0F223E",
  "Colorado Rockies": "#333366", "Detroit Tigers": "#0C2340", "Houston Astros": "#002D62", "Kansas City Royals": "#004687",
  "Los Angeles Angels": "#BA0021", "Los Angeles Dodgers": "#A5ACAF", "Miami Marlins": "#00A3E0", "Milwaukee Brewers": "#FFC52F",
  "Minnesota Twins": "#002B5C", "New York Yankees": "#003087", "New York Mets": "#002D72", "Athletics": "#EFB21E",
  "Philadelphia Phillies": "#E81828", "Pittsburgh Pirates": "#27251F", "San Diego Padres": "#2F241D", "San Francisco Giants": "#000000",
  "Seattle Mariners": "#005C5C", "St. Louis Cardinals": "#C41E3A", "Tampa Bay Rays": "#092C5C", "Texas Rangers": "#003278",
  "Toronto Blue Jays": "#1D2D5C", "Washington Nationals": "#AB0003",
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
  
  return nameMap[teamName] || teamName.toLowerCase().replace(/\s+/g, '-');
}

async function extractVideoPlayerUrl(pageUrl) {
  try {
    // Use a CORS proxy to fetch the page content
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(pageUrl)}`;
    const response = await fetch(proxyUrl);
    const data = await response.json();
    
    if (data.contents) {
      // Look for iframe src in the page content
      const iframeMatch = data.contents.match(/src="([^"]*castweb\.xyz[^"]*)"/);
      if (iframeMatch) {
        return iframeMatch[1];
      }
      
      // Alternative patterns to look for
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
      iframe.style.display = 'block';
      if (connectingDiv) {
        connectingDiv.style.display = 'none';
      }
      
      // Reduced delay from 1 second to 200ms
      setTimeout(() => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          
          if (iframeDoc) {
            // Start with muted state
            const videos = iframeDoc.querySelectorAll('video');
            if (videos.length > 0) {
              videos.forEach(video => {
                video.muted = isMuted;
                video.volume = isMuted ? 0 : 1;
              });
              const muteButton = document.getElementById('muteButton');
              if (muteButton) {
                muteButton.textContent = isMuted ? '🔊 Unmute' : '🔇 Mute';
              }
              console.log(isMuted ? 'Video started muted' : 'Video started unmuted');
            }
          }
        } catch (e) {
          console.log('Cannot access iframe content (cross-origin)');
        }
      }, 200);
      
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
    
    // Reduced timeout from 8 seconds to 4 seconds
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
  const awayNormalized = normalizeTeamName(awayTeamName);
  const homeNormalized = normalizeTeamName(homeTeamName);
  
  // Simplified to only use home vs away format
  const pageUrls = [
    `https://papaahd.live/${homeNormalized}-vs-${awayNormalized}/`
  ];
  
  streamUrls = [];
  
  // Process URLs in parallel for faster extraction
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
  
  // Add valid extracted URLs first
  extractedUrls.forEach(url => {
    if (url) {
      streamUrls.push(url);
      console.log(`Extracted video URL: ${url}`);
    }
  });
  
  // If no video URLs were extracted, fall back to original page URLs
  if (streamUrls.length === 0) {
    console.log('No video URLs extracted, using page URLs directly');
    streamUrls = pageUrls;
  }
  
  currentStreamIndex = 0;
  
  // Reduced delay from 1 second to 300ms
  setTimeout(() => {
    tryNextStream();
  }, 300);
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

    // Add stream embed after linescore (only render once and only for in-progress games)
    const streamContainer = document.getElementById("streamEmbed");
    if (!streamContainer && isInProgress) {
      const contentSlider = document.getElementById("contentSlider");
      if (contentSlider) {
        const streamDiv = document.createElement("div");
        streamDiv.id = "streamEmbed";
        streamDiv.innerHTML = renderStreamEmbed(away.team?.name || "Unknown", home.team?.name || "Unknown");
        contentSlider.parentNode.insertBefore(streamDiv, contentSlider);
        
        // Reduced delay from 500ms to 100ms
        setTimeout(() => {
          startStreamTesting(away.team?.name || "Unknown", home.team?.name || "Unknown");
        }, 100);
      }
    } else if (streamContainer && !isInProgress) {
      // Remove stream container if game is no longer in progress
      streamContainer.remove();
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

    // Return true if game is over to stop further updates
    return isGameOver;
  } catch (error) {
    console.error("Failed to load scoreboard:", error);
    document.getElementById("scoreboardContainer").innerHTML = "<p>Error loading game data.</p>";
    return true; // Stop fetching on error
  }
}

window.showStats = function() {
  const statsBtn = document.getElementById('statsBtn');
  const playsBtn = document.getElementById('playsBtn');
  const statsContent = document.getElementById('statsContent');
  const playsContent = document.getElementById('playsContent');
  const streamEmbed = document.getElementById('streamEmbed');

  statsBtn.classList.add('active');
  playsBtn.classList.remove('active');
  statsContent.classList.add('active');
  playsContent.classList.remove('active');
  
  // Show stream embed when on stats
  if (streamEmbed) {
    streamEmbed.style.display = 'block';
  }
};

window.showPlays = function() {
  const statsBtn = document.getElementById('statsBtn');
  const playsBtn = document.getElementById('playsBtn');
  const statsContent = document.getElementById('statsContent');
  const playsContent = document.getElementById('playsContent');
  const streamEmbed = document.getElementById('streamEmbed');

  statsBtn.classList.remove('active');
  playsBtn.classList.add('active');
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
  updateInterval = setInterval(updateScoreboard, 2000); // Poll every 2 seconds
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

const gamePk = getQueryParam("gamePk");
if (gamePk) {
  startScoreboardUpdates(gamePk);
} else {
  document.getElementById("scoreboardContainer").innerHTML = "<p>No game selected.</p>";
}
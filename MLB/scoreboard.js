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
  "Colorado Rockies": "#333366", "Detroit Tigers": "#0C2340", "Houston Astros": "#EB6E1F", "Kansas City Royals": "#004687",
  "Los Angeles Angels": "#BA0021", "Los Angeles Dodgers": "#005A9C", "Miami Marlins": "#00A3E0", "Milwaukee Brewers": "#FFC52F",
  "Minnesota Twins": "#002B5C", "New York Yankees": "#003087", "New York Mets": "#002D72", "Athletics": "#003831",
  "Philadelphia Phillies": "#E81828", "Pittsburgh Pirates": "#27251F", "San Diego Padres": "#2F241D", "San Francisco Giants": "#FD5A1E",
  "Seattle Mariners": "#005C5C", "St. Louis Cardinals": "#C41E3A", "Tampa Bay Rays": "#092C5C", "Texas Rangers": "#003278",
  "Toronto Blue Jays": "#134A8E", "Washington Nationals": "#AB0003"
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
  const awayLogo = await getLogoUrl(away.team.name);
  const homeLogo = await getLogoUrl(home.team.name);
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
    "Athletics": "oakland-athletics",
    "Philadelphia Phillies": "philadelphia-phillies",
    "Pittsburgh Pirates": "pittsburgh-pirates",
    "San Diego Padres": "san-diego-padres",
    "San Francisco Giants": "san-francisco-giants",
    "Seattle Mariners": "seattle-mariners",
    "St. Louis Cardinals": "st-louis-cardinals",
    "Tampa Bay Rays": "tampa-bay-rays",
    "Texas Rangers": "texas-rangers",
    "Toronto Blue Jays": "toronto-blue-jays",
    "Washington Nationals": "washington-nationals"
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
      if (iframe.requestFullscreen) {
        iframe.requestFullscreen();
      } else if (iframe.webkitRequestFullscreen) {
        iframe.webkitRequestFullscreen();
      } else if (iframe.msRequestFullscreen) {
        iframe.msRequestFullscreen();
      }
      console.log('Fullscreen requested');
    } catch (e) {
      console.log('Fullscreen not supported or failed');
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
          <td>${linescore.teams.away.runs}</td>
          <td>${linescore.teams.away.hits}</td>
          <td>${linescore.teams.away.errors}</td>
        </tr>
        <tr>
          <td>${homeName}</td>
          ${homeScores}
          <td></td> <!-- Break between innings and totals -->
          <td>${linescore.teams.home.runs}</td>
          <td>${linescore.teams.home.hits}</td>
          <td>${linescore.teams.home.errors}</td>
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

function renderPlayDescription(currentPlay, awayTeamName, homeTeamName) {
  const playDescriptionDiv = document.getElementById("playDescription");

  // Determine the background color based on isTopInning
  const isTopInning = currentPlay.about.isTopInning;
  const teamColor = isTopInning ? teamColors[awayTeamName] : teamColors[homeTeamName];
  playDescriptionDiv.style.backgroundColor = teamColor || "#1a1a1a"; // Fallback to default color if team color is unavailable

  // Check if the current play has a description
  if (currentPlay.result.description) {
    playDescriptionDiv.innerHTML = `
      <div>
        ${currentPlay.result.description}
      </div>
    `;
    return;
  }

  // Use the most recent details from playEvents if no description is available
  const playEvents = currentPlay.playEvents || [];
  const recentEvent = playEvents.reverse().find(event => event.details && event.details.description);

  if (recentEvent && recentEvent.details) {
    const pitchDescription = recentEvent.details.type.description;
    const { description, call } = recentEvent.details;
    const pitchSpeed = recentEvent.pitchData?.startSpeed;
    const pitchBall = recentEvent.count.balls;
    const pitchStrike = recentEvent.count.strikes;
    const batterMatch = currentPlay.matchup.batter.fullName;
    const pitcherMatch = currentPlay.matchup.pitcher.fullName;

    // Handle specific cases for call descriptions
    let message = "";
    switch (call?.description) {
      case "Foul":
        message = `${batterMatch} fouls off ${pitchSpeed ? `${pitchSpeed.toFixed(0)} mph` : "unknown speed"} ${pitchDescription.toLowerCase()} from ${pitcherMatch}. Strike ${pitchStrike}.`;
        break;
      case "Swinging Strike":
        message = `${batterMatch} swings at ${pitchSpeed ? `${pitchSpeed.toFixed(0)} mph` : "unknown speed"} ${pitchDescription.toLowerCase()} from ${pitcherMatch}. Strike ${pitchStrike}.`;
        break;
      case "Ball":
        message = `${pitcherMatch} throws ${pitchSpeed ? `${pitchSpeed.toFixed(0)} mph` : "unknown speed"} ${pitchDescription.toLowerCase()} outside to ${batterMatch}. Ball ${pitchBall}.`;
        break;
      case "Called Strike":
        message = `${batterMatch} takes strike ${pitchStrike} looking from ${pitcherMatch}.`;
        break;
      default:
        message = description || "";
    }

    playDescriptionDiv.innerHTML = `
      <div>
        ${message}
      </div>
    `;
  } else {
    // Default message if no relevant data is found
    playDescriptionDiv.innerHTML = `
      <div>
        
      </div>
    `;
  }
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
          <button id="fullscreenButton" onclick="toggleFullscreen()" style="padding: 8px 16px; margin: 0 5px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">🔳 Fullscreen</button>
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
    const awayLogo = await getLogoUrl(away.team?.name || "Unknown");
    const homeLogo = await getLogoUrl(home.team?.name || "Unknown");

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
      const linescoreDiv = document.getElementById("linescoreTable");
      if (linescoreDiv) {
        const streamDiv = document.createElement("div");
        streamDiv.id = "streamEmbed";
        streamDiv.innerHTML = renderStreamEmbed(away.team?.name || "Unknown", home.team?.name || "Unknown");
        linescoreDiv.parentNode.insertBefore(streamDiv, linescoreDiv.nextSibling);
        
        // Reduced delay from 500ms to 100ms
        setTimeout(() => {
          startStreamTesting(away.team?.name || "Unknown", home.team?.name || "Unknown");
        }, 100);
      }
    } else if (streamContainer && !isInProgress) {
      // Remove stream container if game is no longer in progress
      streamContainer.remove();
    }

    // Render the play description only if the game is in progress
    const playDescriptionDiv = document.getElementById("playDescription");
    if (isInProgress) {
      renderPlayDescription(currentPlay, away.team?.name || "Unknown", home.team?.name || "Unknown");
    } else {
      playDescriptionDiv.innerHTML = ""; // Clear play description
      playDescriptionDiv.style.display = "none"; // Hide the play description area
    }

    // Hide bases, outs, and count if the game is not in progress
    const inningCenter = document.querySelector(".inning-center");
    const isSmallScreen = window.innerWidth <= 525;
    if (!isInProgress && inningCenter) {
      inningCenter.innerHTML = `<div class="inning-status" style="font-size: ${isSmallScreen ? '2rem' : '3.5rem'};">Final</div>`; // Replace with "Final"
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

    // Return true if game is over to stop further updates
    return isGameOver;
  } catch (error) {
    console.error("Failed to load scoreboard:", error);
    document.getElementById("scoreboardContainer").innerHTML = "<p>Error loading game data.</p>";
    return true; // Stop fetching on error
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

const gamePk = getQueryParam("gamePk");
if (gamePk) {
  startScoreboardUpdates(gamePk);
} else {
  document.getElementById("scoreboardContainer").innerHTML = "<p>No game selected.</p>";
}
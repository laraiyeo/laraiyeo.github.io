// Function to determine if we're in the Summer League period
function isSummerLeague() {
  const now = new Date();
  const year = now.getFullYear();
  const summerStart = new Date(year, 6, 10); // July 10 (month is 0-indexed)
  const summerEnd = new Date(year, 6, 21);   // July 21
  
  return now >= summerStart && now <= summerEnd;
}

// Function to check if a specific date string is in Summer League period
function isDateInSummerLeague(dateString) {
  if (!dateString) return false;
  
  // Parse the date string (format: YYYYMMDD)
  const year = parseInt(dateString.substring(0, 4));
  const month = parseInt(dateString.substring(4, 6)) - 1; // Month is 0-indexed
  const day = parseInt(dateString.substring(6, 8));
  
  const gameDate = new Date(year, month, day);
  const summerStart = new Date(year, 6, 10); // July 10
  const summerEnd = new Date(year, 6, 21);   // July 21
  
  return gameDate >= summerStart && gameDate <= summerEnd;
}

// Function to get the appropriate league identifier
function getLeagueIdentifier() {
  return isSummerLeague() ? "nba-summer-las-vegas" : "nba";
}

function normalizeTeamName(teamName) {
  // Convert team names to the format used in the streaming site URLs
  const nameMap = {
    "Atlanta Hawks": "atlanta-hawks",
    "Boston Celtics": "boston-celtics",
    "Brooklyn Nets": "brooklyn-nets",
    "Charlotte Hornets": "charlotte-hornets",
    "Chicago Bulls": "chicago-bulls",
    "Cleveland Cavaliers": "cleveland-cavaliers",
    "Dallas Mavericks": "dallas-mavericks",
    "Denver Nuggets": "denver-nuggets",
    "Detroit Pistons": "detroit-pistons",
    "Golden State Warriors": "golden-state-warriors",
    "Houston Rockets": "houston-rockets",
    "Indiana Pacers": "indiana-pacers",
    "LA Clippers": "la-clippers",
    "Los Angeles Lakers": "los-angeles-lakers",
    "Memphis Grizzlies": "memphis-grizzlies",
    "Miami Heat": "miami-heat",
    "Milwaukee Bucks": "milwaukee-bucks",
    "Minnesota Timberwolves": "minnesota-timberwolves",
    "New Orleans Pelicans": "new-orleans-pelicans",
    "New York Knicks": "new-york-knicks",
    "Oklahoma City Thunder": "oklahoma-city-thunder",
    "Orlando Magic": "orlando-magic",
    "Philadelphia 76ers": "philadelphia-76ers",
    "Phoenix Suns": "phoenix-suns",
    "Portland Trail Blazers": "portland-trail-blazers",
    "Sacramento Kings": "sacramento-kings",
    "San Antonio Spurs": "san-antonio-spurs",
    "Toronto Raptors": "toronto-raptors",
    "Utah Jazz": "utah-jazz",
    "Washington Wizards": "washington-wizards"
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
      const content = data.contents;
      
      // Look for various iframe patterns in the content
      const iframePatterns = [
        /src=["']([^"']*(?:embed|player|stream)[^"']*)["']/gi,
        /iframe[^>]*src=["']([^"']*)["']/gi,
        /"(https?:\/\/[^"]*(?:embed|player|stream)[^"]*)"/gi
      ];
      
      for (const pattern of iframePatterns) {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
          const url = match[1];
          if (url && url.startsWith('http') && !url.includes('youtube') && !url.includes('ads')) {
            console.log(`Found potential video URL: ${url}`);
            return url;
          }
        }
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
        video.volume = isMuted ? 0 : 1;
      });
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
      }
      // For standard browsers
      else if (iframe.requestFullscreen) {
        iframe.requestFullscreen();
      }
      // For Firefox
      else if (iframe.mozRequestFullScreen) {
        iframe.mozRequestFullScreen();
      }
      // For Chrome, Safari and Opera
      else if (iframe.webkitRequestFullscreen) {
        iframe.webkitRequestFullscreen();
      }
      // For IE/Edge
      else if (iframe.msRequestFullscreen) {
        iframe.msRequestFullscreen();
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
          iframe.contentWindow.postMessage({ action: 'autoplay' }, '*');
        } catch (e) {
          console.log('Autoplay message failed');
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

const TEAMS_API_URL = `https://site.api.espn.com/apis/site/v2/sports/basketball/${getLeagueIdentifier()}/teams`;

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
    const gameDate = getQueryParam("date");
    let BOX_SCORE_API_URL;
    
    // Check if the game date falls within Summer League period
    const isGameInSummerLeague = isDateInSummerLeague(gameDate);
    
    // Use Summer League API if the game date is within Summer League period
    if (isGameInSummerLeague) {
      BOX_SCORE_API_URL = `https://cdn.espn.com/core/nba-summer-league/boxscore?xhr=1&gameId=${gameId}&league=nba-summer-las-vegas`;
    } else {
      BOX_SCORE_API_URL = `https://cdn.espn.com/core/nba/boxscore?xhr=1&gameId=${gameId}`;
    }
    
    let response = await fetch(BOX_SCORE_API_URL);
    let data = await response.json();
    
    // If first API fails, try the other one as fallback
    if (!data || !data.gamepackageJSON || !data.gamepackageJSON.boxscore) {
      if (isGameInSummerLeague || isSummerLeague) {
        BOX_SCORE_API_URL = `https://cdn.espn.com/core/nba/boxscore?xhr=1&gameId=${gameId}`;
      } else {
        BOX_SCORE_API_URL = `https://cdn.espn.com/core/nba-summer-league/boxscore?xhr=1&gameId=${gameId}&league=nba-summer-las-vegas`;
      }
      response = await fetch(BOX_SCORE_API_URL);
      data = await response.json();
    }

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
    console.error("Error fetching NBA box score data:", error);
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
    
    // Check if the game date falls within Summer League period
    const isGameInSummerLeague = isDateInSummerLeague(gameDate);

    if (gameDate) {
      // Use the specific date provided with appropriate league
      const league = isGameInSummerLeague ? "nba-summer-las-vegas" : "nba";
      const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/basketball/${league}/scoreboard?dates=${gameDate}`;
      
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
        
        // Try both regular NBA and Summer League APIs
        const leagues = ["nba", "nba-summer-las-vegas"];
        
        for (const league of leagues) {
          const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/basketball/${league}/scoreboard?dates=${adjustedDate}`;

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
            console.error(`Error fetching data for date ${adjustedDate} and league ${league}:`, error);
          }
        }
        
        if (selectedGame) break;
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
    
    // Determine if the game is in progress (same logic as MLB)
    const isInProgress = !isGameOver && !isGameScheduled && (gameStatus === "In Progress" || period > 0);

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

    // Add stream embed after linescore (only render once and only for in-progress games)
    const streamContainer = document.getElementById("streamEmbed");
    if (!streamContainer && isInProgress) {
      const contentSlider = document.getElementById("contentSlider");
      if (contentSlider) {
        const streamDiv = document.createElement("div");
        streamDiv.id = "streamEmbed";
        streamDiv.innerHTML = renderStreamEmbed(awayTeam.displayName, homeTeam.displayName);
        contentSlider.parentNode.insertBefore(streamDiv, contentSlider);
        
        // Start stream testing automatically
        setTimeout(() => {
          startStreamTesting(awayTeam.displayName, homeTeam.displayName);
        }, 100);
      }
    } else if (streamContainer && !isInProgress) {
      // Remove stream container if game is no longer in progress
      streamContainer.remove();
    }

    // Render the box score
    renderBoxScore(gameId, gameStatus);

    // Return true if game is over to stop further updates
    return isGameOver;
  } catch (error) {
    console.error("Error fetching NBA scoreboard data:", error);
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

  const periods = [1, 2, 3, 4]; // Standard NBA periods
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
  
  // Court dimensions in pixels (landscape orientation)
  const COURT_WIDTH = 100; // pixels (baseline to baseline) - ESPN uses 0-50 scale
  const COURT_HEIGHT = 50; // pixels (sideline to sideline) - ESPN uses 0-50 scale
  
  // Simple approach: treat coordinates as direct positions
  // x: 26, y: 3 for a layup should be close to the attacking basket
  
  // Convert ESPN coordinates to pixel positions
  // Assume ESPN uses 0-50 scale for both dimensions
  let pixelX = espnX; // Use x coordinate directly  
  let pixelY = espnY; // Use y coordinate directly
  
  console.log(`Direct pixel mapping: x=${pixelX}px, y=${pixelY}px`);
  
  // Convert to percentages for CSS positioning
  let leftPercent = (pixelY / 50) * 100; // Y becomes left-right position (6% for y: 3)
  let bottomPercent = (pixelX / 50) * 100; // X becomes bottom position (52% for x: 26)
  
  // For away team, flip the court positioning
  if (teamSide === 'away') {
    bottomPercent = 100 - bottomPercent; // Flip the court for away team
  }
  
  console.log(`CSS percentages: left=${leftPercent}%, bottom=${bottomPercent}%`);
  
  // Constrain to court bounds
  const finalLeftPercent = Math.max(2, Math.min(98, leftPercent));
  const finalBottomPercent = Math.max(2, Math.min(98, bottomPercent));

  const shotClass = isScoring ? 'made-shot' : 'missed-shot';
  const isMobile = window.innerWidth <= 768;
  
  // Ensure team color has # prefix
  const finalTeamColor = teamColor.startsWith('#') ? teamColor : `#${teamColor}`;
  
  // For mobile (landscape court), use coordinates as-is
  // For desktop (vertical court), we need to rotate the positioning
  let finalLeft, finalBottom;
  
  if (isMobile) {
    // Mobile: landscape court, use coordinates directly
    finalLeft = finalLeftPercent;
    finalBottom = finalBottomPercent;
  } else {
    // Desktop: vertical court, rotate coordinates 90 degrees
    // left becomes bottom, bottom becomes (100 - left)
    finalLeft = finalBottomPercent;
    finalBottom = finalLeftPercent;
  }

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
        <!-- Center circle -->
        <div class="center-circle"></div>
        <!-- Baskets -->
        <div class="basket top"></div>
        <div class="basket bottom"></div>
        <!-- Shot location -->
        <div class="shot-marker ${shotClass}" style="left: ${finalLeft}%; bottom: ${finalBottom}%; --team-color: ${finalTeamColor};"></div>
      </div>
    </div>
  `;
}

async function getPlayerImage(playerId) {
  try {
    // NBA player headshot URL pattern
    const imageUrl = `https://a.espncdn.com/i/headshots/nba/players/full/${playerId}.png`;
    
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
    const gameDate = getQueryParam("date");
    let PLAY_BY_PLAY_API_URL;
    
    // Check if the game date falls within Summer League period
    const isGameInSummerLeague = isDateInSummerLeague(gameDate);
    
    // Use Summer League API if the game date is within Summer League period
    if (isGameInSummerLeague) {
      PLAY_BY_PLAY_API_URL = `https://cdn.espn.com/core/nba-summer-league/playbyplay?xhr=1&gameId=${gameId}&league=nba-summer-las-vegas`;
    } else {
      PLAY_BY_PLAY_API_URL = `https://cdn.espn.com/core/nba/playbyplay?xhr=1&gameId=${gameId}`;
    }
    
    console.log("Fetching play-by-play from:", PLAY_BY_PLAY_API_URL);
    let response = await fetch(PLAY_BY_PLAY_API_URL);
    let data = await response.json();
    
    // If first API fails, try the other one as fallback
    if (!data || !data.gamepackageJSON || !data.gamepackageJSON.plays) {
      if (isGameInSummerLeague || isSummerLeague) {
        PLAY_BY_PLAY_API_URL = `https://cdn.espn.com/core/nba/playbyplay?xhr=1&gameId=${gameId}`;
      } else {
        PLAY_BY_PLAY_API_URL = `https://cdn.espn.com/core/nba-summer-league/playbyplay?xhr=1&gameId=${gameId}&league=nba-summer-las-vegas`;
      }
      console.log("Trying fallback API:", PLAY_BY_PLAY_API_URL);
      response = await fetch(PLAY_BY_PLAY_API_URL);
      data = await response.json();
    }

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
    let awayTeam = null, homeTeam = null;
    let boxScoreData = null;
    
    try {
      const league = isGameInSummerLeague ? "nba-summer-las-vegas" : "nba";
      const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/basketball/${league}/scoreboard?dates=${gameDate}`;
      const scoreboardResponse = await fetch(SCOREBOARD_API_URL);
      const scoreboardData = await scoreboardResponse.json();
      const currentGame = scoreboardData.events?.find(game => game.id === gameId);
      
      if (currentGame) {
        awayTeam = currentGame.competitions[0].competitors.find(c => c.homeAway === "away")?.team;
        homeTeam = currentGame.competitions[0].competitors.find(c => c.homeAway === "home")?.team;
      }

      // Also fetch box score data to get current player stats
      let BOX_SCORE_API_URL;
      if (isGameInSummerLeague) {
        BOX_SCORE_API_URL = `https://cdn.espn.com/core/nba-summer-league/boxscore?xhr=1&gameId=${gameId}&league=nba-summer-las-vegas`;
      } else {
        BOX_SCORE_API_URL = `https://cdn.espn.com/core/nba/boxscore?xhr=1&gameId=${gameId}`;
      }
      const boxScoreResponse = await fetch(BOX_SCORE_API_URL);
      boxScoreData = await boxScoreResponse.json();
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
            ${!isNonExpandablePlay ? `
              <div class="play-toggle">
                <span class="toggle-icon" id="toggle-${index}">${toggleIcon}</span>
              </div>
            ` : ''}
          </div>
          ${!isNonExpandablePlay ? `
            <div class="play-details" id="play-${index}" style="display: ${displayStyle};">
              <div class="play-details-content">
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
    console.error("Error fetching NBA play-by-play data:", error);
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
window.showStats = function() {
  // Update button states
  document.getElementById('statsBtn').classList.add('active');
  document.getElementById('playsBtn').classList.remove('active');
  
  // Show/hide content sections
  document.getElementById('statsContent').classList.add('active');
  document.getElementById('playsContent').classList.remove('active');
  
  // Show stream when on stats tab
  const streamContainer = document.getElementById("streamEmbed");
  if (streamContainer) {
    streamContainer.style.display = 'block';
  }
};

window.showPlays = function() {
  // Update button states
  document.getElementById('playsBtn').classList.add('active');
  document.getElementById('statsBtn').classList.remove('active');
  
  // Show/hide content sections
  document.getElementById('statsContent').classList.remove('active');
  document.getElementById('playsContent').classList.add('active');
  
  // Hide stream when on plays tab (like NFL)
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

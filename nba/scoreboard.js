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
      ? selectedGame.competitions[0].competitors.find(c => c.homeAway === "home")?.record || "1-0"
      : selectedGame.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamRecord = slug === "post-season"
      ? selectedGame.competitions[0].competitors.find(c => c.homeAway === "away")?.record || "1-0"
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
    const STATS_API_URL = `https://cdn.espn.com/core/nba/matchup?xhr=1&gameId=${gameId}`;
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
    
    // Render stats similar to NFL format
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
  const awayLogo = awayTeam.team?.logo || awayTeam.team?.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/nba/500/${awayTeam.team?.abbreviation}.png`;
  const homeLogo = homeTeam.team?.logo || homeTeam.team?.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/nba/500/${homeTeam.team?.abbreviation}.png`;
  
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

// Function to render match stats similar to NFL
function renderMatchStats(awayTeam, homeTeam, awayStats, homeStats) {
  const statsContainer = document.getElementById('matchStatsDisplay');
  if (!statsContainer) return;
  
  console.log('Rendering match stats for:', awayTeam, homeTeam);
  
  // Get team logos with multiple fallback options
  const awayLogo = awayTeam.team?.logo || 
                   awayTeam.team?.logos?.[0]?.href || 
                   awayTeam.logo || 
                   `https://a.espncdn.com/i/teamlogos/nba/500/${awayTeam.team?.abbreviation || awayTeam.abbreviation}.png`;
  
  const homeLogo = homeTeam.team?.logo || 
                   homeTeam.team?.logos?.[0]?.href || 
                   homeTeam.logo || 
                   `https://a.espncdn.com/i/teamlogos/nba/500/${homeTeam.team?.abbreviation || homeTeam.abbreviation}.png`;
  
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
    // Create stat categories for NBA (removing possession since it doesn't apply)
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
    
    const LEADERS_API_URL = `https://cdn.espn.com/core/nba/matchup?xhr=1&gameId=${gameId}`;
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

// Function to render leaders (like NFL's form containers)
function renderLeaders(leadersData) {
  const statsContainer = document.getElementById('matchStatsDisplay');
  if (!statsContainer || !leadersData) return;
  
  // Create leaders HTML similar to NFL's form containers
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
    
    const H2H_API_URL = `https://cdn.espn.com/core/nba/matchup?xhr=1&gameId=${gameId}`;
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
      <div class="h2h-match clickable-match" onclick="openNBAMatchPage('${matchId}', '${estDate}')" style="cursor: pointer;">
        <div class="h2h-match-header">
          <span class="h2h-date">${date}</span>
          <span class="h2h-competition">NBA</span>
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

// Function to open NBA match page in new window
window.openNBAMatchPage = function(matchId, estDate) {
  const url = `scoreboard.html?gameId=${matchId}&date=${estDate}`;
  window.open(url, '_blank');
};

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

    // Fix player headshot styling to prevent width squeezing
    const playerImage = playDetails.querySelectorAll('.player-image');
    playerImage.forEach(div => {
      div.style.width = '80px';
      div.style.height = '60px';
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

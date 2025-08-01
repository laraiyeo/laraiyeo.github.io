const TEAMS_API_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams";

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
      if (iframe.requestFullscreen) {
        iframe.requestFullscreen();
      } else if (iframe.webkitRequestFullscreen) {
        iframe.webkitRequestFullscreen();
      } else if (iframe.msRequestFullscreen) {
        iframe.msRequestFullscreen();
      }
      console.log('Fullscreen requested');
    } catch (e) {
      console.log('Fullscreen request failed:', e);
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
      boxScoreDiv.innerHTML = `<div style="color: white; text-align: center; padding: 20px;">Box score data not yet available for this game.</div>`;
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
      const teamLogo = team.team.logo;

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
                        ${isSmallScreen ? player.firstName?.charAt(0) || '' : player.firstName || ''} ${player.lastName || player.displayName || 'Unknown'}
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
    const isInProgress = gameStatus !== "Final";
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

    const playDescriptionDiv = document.getElementById("playDescription");
    if (gameStatus === "Final") {
      playDescriptionDiv.innerHTML = ""; // Clear play description
      playDescriptionDiv.style.display = "none"; // Hide the play description area
    } else {
      const competitors = selectedGame.competitions[0].competitors;
      const lastPlay = selectedGame.competitions[0].situation?.lastPlay || null; // Correctly access situation
      playDescriptionDiv.style.display = "block"; // Ensure play description is visible
      renderPlayDescription(lastPlay, clock, competitors);
    }

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

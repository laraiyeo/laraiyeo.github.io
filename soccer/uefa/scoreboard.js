function getAdjustedDateForSoccer() {
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

// Logo cache to prevent repeated fetches
let logoCache = new Map();

function convertToHttps(url) {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

// Function to get team logo with fallback and caching
function getTeamLogoWithFallback(teamId) {
  // Check cache first
  if (logoCache.has(teamId)) {
    return Promise.resolve(logoCache.get(teamId));
  }

  return new Promise((resolve) => {
    const primaryUrl = `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`;
    const fallbackUrl = `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
    
    const img = new Image();
    img.onload = () => {
      logoCache.set(teamId, primaryUrl);
      resolve(primaryUrl);
    };
    img.onerror = () => {
      const fallbackImg = new Image();
      fallbackImg.onload = () => {
        logoCache.set(teamId, fallbackUrl);
        resolve(fallbackUrl);
      };
      fallbackImg.onerror = () => {
        logoCache.set(teamId, 'soccer-ball-png-24.png');
        resolve('soccer-ball-png-24.png');
      };
      fallbackImg.src = fallbackUrl;
    };
    img.src = primaryUrl;
  });
}

// Helper function to get team color using alternate color logic like team-page.js
function getTeamColorWithAlternateLogic(team) {
  if (!team || !team.color) return '007bff'; // Default fallback
  
  const isUsingAlternateColor = ["ffffff", "ffee00", "ffff00", "81f733", "000000"].includes(team.color);
  
  if (isUsingAlternateColor && team.alternateColor) {
    return team.alternateColor;
  } else {
    return team.color;
  }
}

// Function to apply team colors with !important (like team-page.js)
function applyTeamColorsToCommentary() {
  const style = document.createElement('style');
  style.textContent = `
    .player-event-info {
      border-left-color: var(--team-color) !important;
    }
    .player-avatar {
      background-color: var(--team-color) !important;
    }
    .play-container {
      border-left: 4px solid var(--team-color) !important;
    }
    .scoring-play {
      border-left: 4px solid var(--team-color) !important;
      background-color: rgba(var(--team-color-rgb), 0.1) !important;
    }
  `;
  document.head.appendChild(style);
}

function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

function getOrdinalSuffix(num) {
  if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
  switch (num % 10) {
    case 1: return `${num}st`;
    case 2: return `${num}nd`;
    case 3: return `${num}rd`;
    default: return `${num}th`;
  }
}

function renderScorersBox(awayScorers, homeScorers) {
  const formatScorer = scorer => {
    const penaltyText = scorer.penaltyKick ? " (Pen.)" : "";
    const fullName = scorer.displayName;
    const lastName = fullName.split(" ").slice(-1).join(" ");
    const displayName = window.innerWidth <= 475 ? (lastName ? lastName : fullName) : fullName;
    return `${displayName} ${scorer.clock}${penaltyText}`;
  };

  const awayScorersHtml = awayScorers.map(formatScorer).join("<br>") || "No scorers";
  const homeScorersHtml = homeScorers.map(formatScorer).join("<br>") || "No scorers";

  return `
    <div class="scorers-box">
      <div class="scorers away-scorers">
        ${awayScorersHtml}
      </div>
      <div class="soccer-ball">
        <img src="soccer-ball-png-24.png" alt="Soccer Ball" class="soccer-ball">
      </div>
      <div class="scorers home-scorers">
        ${homeScorersHtml}
      </div>
    </div>
  `;
}

function renderFootballPitches(homePlayers, awayPlayers, homeFormation, awayFormation, homeLogo, awayLogo, homeSubs, awaySubs) {
  const getPositionStyles = (formation) => {
    switch (formation) {
      case "4-2-3-1":
        return {
          "G": "bottom: 2.5%; left: 50%; transform: translateX(-50%);", "CD-L": "bottom: 20%; left: 30%; transform: translateX(-50%);", "CD-R": "bottom: 20%; left: 70%; transform: translateX(-50%);",
          "LB": "bottom: 30%; left: 15%; transform: translateX(-50%);", "RB": "bottom: 30%; left: 85%; transform: translateX(-50%);", "LM": "bottom: 45%; left: 32.5%; transform: translateX(-50%);",
          "AM-L": "bottom: 65%; left: 17.5%; transform: translateX(-50%);", "AM": "bottom: 65%; left: 50%; transform: translateX(-50%);", "AM-R": "bottom: 65%; left: 82.5%; transform: translateX(-50%);",
          "RM": "bottom: 45%; left: 67.5%; transform: translateX(-50%);", "F": "bottom: 85%; left: 50%; transform: translateX(-50%);"
        };
      case "3-5-2":
        return {
          "G": "bottom: 2.5%; left: 50%; transform: translateX(-50%);", "CD-L": "bottom: 20%; left: 25%; transform: translateX(-50%);", "CD": "bottom: 20%; left: 50%; transform: translateX(-50%);", 
          "CD-R": "bottom: 20%; left: 75%; transform: translateX(-50%);", "LM": "bottom: 60%; left: 15%; transform: translateX(-50%);", "CM-L": "bottom: 45%; left: 25%; transform: translateX(-50%);",
          "AM": "bottom: 45%; left: 50%; transform: translateX(-50%);", "CM-R": "bottom: 45%; left: 75%; transform: translateX(-50%);", "RM": "bottom: 60%; left: 85%; transform: translateX(-50%);",
          "CF-L": "bottom: 85%; left: 40%; transform: translateX(-50%);", "CF-R": "bottom: 85%; left: 60%; transform: translateX(-50%);"
        };
      case "3-4-1-2":
        return {
          "G": "bottom: 2.5%; left: 50%; transform: translateX(-50%);", "CD-L": "bottom: 20%; left: 25%; transform: translateX(-50%);", "CD": "bottom: 20%; left: 50%; transform: translateX(-50%);",
          "CD-R": "bottom: 20%; left: 75%; transform: translateX(-50%);", "LM": "bottom: 42.5%; left: 15%; transform: translateX(-50%);", "CM-L": "bottom: 42.5%; left: 37.5%; transform: translateX(-50%);",
          "AM": "bottom: 62.5%; left: 50%; transform: translateX(-50%);", "CM-R": "bottom: 42.5%; left: 62.5%; transform: translateX(-50%);", "RM": "bottom: 42.5%; left: 85%; transform: translateX(-50%);",
          "CF-L": "bottom: 85%; left: 40%; transform: translateX(-50%);", "CF-R": "bottom: 85%; left: 60%; transform: translateX(-50%);"
        };
      case "3-4-2-1":
        return {
          "G": "bottom: 2.5%; left: 50%; transform: translateX(-50%);", "CD-L": "bottom: 20%; left: 25%; transform: translateX(-50%);", "CD": "bottom: 20%; left: 50%; transform: translateX(-50%);",
          "CD-R": "bottom: 20%; left: 75%; transform: translateX(-50%);", "LM": "bottom: 42.5%; left: 15%; transform: translateX(-50%);", "CM-L": "bottom: 42.5%; left: 37.5%; transform: translateX(-50%);",
          "CM-R": "bottom: 42.5%; left: 62.5%; transform: translateX(-50%);", "RM": "bottom: 42.5%; left: 85%; transform: translateX(-50%);", "CF-L": "bottom: 65%; left: 37.5%; transform: translateX(-50%);", 
          "F": "bottom: 85%; left: 50%; transform: translateX(-50%);", "CF-R": "bottom: 65%; left: 62.5%; transform: translateX(-50%);"  
          };
      case "4-1-4-1":
        return {
          "G": "bottom: 2.5%; left: 50%; transform: translateX(-50%);", "CD-L": "bottom: 20%; left: 30%; transform: translateX(-50%);", "CD-R": "bottom: 20%; left: 70%; transform: translateX(-50%);",
          "LB": "bottom: 30%; left: 15%; transform: translateX(-50%);", "RB": "bottom: 30%; left: 85%; transform: translateX(-50%);", "LM": "bottom: 70%; left: 17.5%; transform: translateX(-50%);",
          "CM-L": "bottom: 62.5%; left: 35%; transform: translateX(-50%);", "CM-R": "bottom: 62.5%; left: 65%; transform: translateX(-50%);", "DM": "bottom: 40%; left: 50%; transform: translateX(-50%);",
          "RM": "bottom: 70%; left: 82.5%; transform: translateX(-50%);", "F": "bottom: 85%; left: 50%; transform: translateX(-50%);"  
        };
      case "4-4-2":
        return {
          "G": "bottom: 2.5%; left: 50%; transform: translateX(-50%);", "CD-L": "bottom: 20%; left: 30%; transform: translateX(-50%);", "CD-R": "bottom: 20%; left: 70%; transform: translateX(-50%);",
          "LB": "bottom: 30%; left: 10%; transform: translateX(-50%);", "RB": "bottom: 30%; left: 90%; transform: translateX(-50%);", "LM": "bottom: 55%; left: 10%; transform: translateX(-50%);",
          "CM-L": "bottom: 45%; left: 30%; transform: translateX(-50%);", "CM-R": "bottom: 45%; left: 70%; transform: translateX(-50%);", "RM": "bottom: 55%; left: 90%; transform: translateX(-50%);",
          "CF-L": "bottom: 85%; left: 40%; transform: translateX(-50%);", "CF-R": "bottom: 85%; left: 60%; transform: translateX(-50%);"
        }; 
      case "3-4-3":
        return {
          "G": "bottom: 2.5%; left: 50%; transform: translateX(-50%);", "CD-L": "bottom: 20%; left: 30%; transform: translateX(-50%);", "CD": "bottom: 20%; left: 50%; transform: translateX(-50%);",
          "CD-R": "bottom: 20%; left: 70%; transform: translateX(-50%);", "LM": "bottom: 55%; left: 10%; transform: translateX(-50%);", "CM-L": "bottom: 45%; left: 30%; transform: translateX(-50%);",
          "CM-R": "bottom: 45%; left: 70%; transform: translateX(-50%);", "RM": "bottom: 55%; left: 90%; transform: translateX(-50%);", "CF-L": "bottom: 80%; left: 22.5%; transform: translateX(-50%);",
          "F": "bottom: 85%; left: 50%; transform: translateX(-50%);", "CF-R": "bottom: 80%; left: 77.5%; transform: translateX(-50%);"
        }; 
      case "4-1-2-1-2":
        return {
          "G": "bottom: 2.5%; left: 50%; transform: translateX(-50%);", "CD-L": "bottom: 20%; left: 30%; transform: translateX(-50%);", "CD-R": "bottom: 20%; left: 70%; transform: translateX(-50%);",
          "LB": "bottom: 30%; left: 10%; transform: translateX(-50%);", "RB": "bottom: 30%; left: 90%; transform: translateX(-50%);", "LM": "bottom: 52.5%; left: 17.5%; transform: translateX(-50%);",
          "AM": "bottom: 62.5%; left: 50%; transform: translateX(-50%);", "DM": "bottom: 40%; left: 50%; transform: translateX(-50%);", "RM": "bottom: 52.5%; left: 82.5%; transform: translateX(-50%);",
          "CF-L": "bottom: 85%; left: 40%; transform: translateX(-50%);", "CF-R": "bottom: 85%; left: 60%; transform: translateX(-50%);"
        };
      case "4-4-1-1":
        return {
          "G": "bottom: 2.5%; left: 50%; transform: translateX(-50%);", "CD-L": "bottom: 20%; left: 30%; transform: translateX(-50%);", "CD-R": "bottom: 20%; left: 70%; transform: translateX(-50%);",
          "LB": "bottom: 30%; left: 10%; transform: translateX(-50%);", "RB": "bottom: 30%; left: 90%; transform: translateX(-50%);", "LM": "bottom: 52.5%; left: 10%; transform: translateX(-50%);",
          "CM-L": "bottom: 42.5%; left: 35%; transform: translateX(-50%);", "CM-R": "bottom: 42.5%; left: 65%; transform: translateX(-50%);", "RM": "bottom: 52.5%; left: 90%; transform: translateX(-50%);",
          "RCF": "bottom: 65%; left: 50%; transform: translateX(-50%);", "F": "bottom: 85%; left: 50%; transform: translateX(-50%);"
        };
      case "4-3-1-2":
        return {
          "G": "bottom: 2.5%; left: 50%; transform: translateX(-50%);", "CD-L": "bottom: 20%; left: 30%; transform: translateX(-50%);", "CD-R": "bottom: 20%; left: 70%; transform: translateX(-50%);",
          "LB": "bottom: 30%; left: 10%; transform: translateX(-50%);", "RB": "bottom: 30%; left: 90%; transform: translateX(-50%);", "LM": "bottom: 50%; left: 22.5%; transform: translateX(-50%);",
          "CM": "bottom: 40%; left: 50%; transform: translateX(-50%);", "RM": "bottom: 50%; left: 77.5%; transform: translateX(-50%);", "AM": "bottom: 62.5%; left: 50%; transform: translateX(-50%);", 
          "M": "bottom: 85%; left: 40%; transform: translateX(-50%);", "CF-R": "bottom: 85%; left: 60%; transform: translateX(-50%);"
        };
      case "3-1-4-2":
        return {
          "G": "bottom: 2.5%; left: 50%; transform: translateX(-50%);", "CD-L": "bottom: 20%; left: 30%; transform: translateX(-50%);", "CD": "bottom: 20%; left: 50%; transform: translateX(-50%);",
          "CD-R": "bottom: 20%; left: 70%; transform: translateX(-50%);", "SW": "bottom: 40%; left: 50%; transform: translateX(-50%);", "LM": "bottom: 60%; left: 15%; transform: translateX(-50%);",
          "CM-L": "bottom: 60%; left: 40%; transform: translateX(-50%);", "CM-R": "bottom: 60%; left: 60%; transform: translateX(-50%);", "RM": "bottom: 60%; left: 85%; transform: translateX(-50%);", 
          "CF-L": "bottom: 85%; left: 40%; transform: translateX(-50%);", "CF-R": "bottom: 85%; left: 60%; transform: translateX(-50%);"
        };
      case "5-3-2":
        return {
          "G": "bottom: 2.5%; left: 50%; transform: translateX(-50%);", "LB": "bottom: 30%; left: 10%; transform: translateX(-50%);", "CD-L": "bottom: 20%; left: 25%; transform: translateX(-50%);",
          "CD": "bottom: 20%; left: 50%; transform: translateX(-50%);", "CD-R": "bottom: 20%; left: 75%; transform: translateX(-50%);", "RB": "bottom: 30%; left: 90%; transform: translateX(-50%);",
          "CM-L": "bottom: 55%; left: 30%; transform: translateX(-50%);", "CM": "bottom: 55%; left: 50%; transform: translateX(-50%);", "CM-R": "bottom: 55%; left: 70%; transform: translateX(-50%);",
          "CF-L": "bottom: 85%; left: 40%; transform: translateX(-50%);", "CF-R": "bottom: 85%; left: 60%; transform: translateX(-50%);"
        };   
      case "5-4-1":
        return {
          "G": "bottom: 2.5%; left: 50%; transform: translateX(-50%);", "LB": "bottom: 30%; left: 5%; transform: translateX(-50%);", "CD-L": "bottom: 20%; left: 25%; transform: translateX(-50%);",
          "CD": "bottom: 20%; left: 50%; transform: translateX(-50%);", "CD-R": "bottom: 20%; left: 75%; transform: translateX(-50%);", "RB": "bottom: 30%; left: 95%; transform: translateX(-50%);",
          "LM": "bottom: 55%; left: 15%; transform: translateX(-50%);", "CM-L": "bottom: 55%; left: 37.5%; transform: translateX(-50%);", "CM-R": "bottom: 55%; left: 62.5%; transform: translateX(-50%);", "RM": "bottom: 55%; left: 85%; transform: translateX(-50%);",
          "F": "bottom: 85%; left: 50%; transform: translateX(-50%);"
        };
      default:
        return {
          "G": "bottom: 2.5%; left: 50%; transform: translateX(-50%);", "CD-L": "bottom: 20%; left: 30%; transform: translateX(-50%);", "CD-R": "bottom: 20%; left: 70%; transform: translateX(-50%);",
          "LB": "bottom: 30%; left: 10%; transform: translateX(-50%);", "RB": "bottom: 30%; left: 90%; transform: translateX(-50%);", "LM": "bottom: 50%; left: 22.5%; transform: translateX(-50%);",
          "CM": "bottom: 55%; left: 50%; transform: translateX(-50%);", "RM": "bottom: 50%; left: 77.5%; transform: translateX(-50%);", "LF": "bottom: 80%; left: 17.5%; transform: translateX(-50%);",
          "F": "bottom: 85%; left: 50%; transform: translateX(-50%);", "RF": "bottom: 80%; left: 82.5%; transform: translateX(-50%);"
        };
    }
  };

  const renderPlayer = (player, positionStyle, teamLogo) => {
    const name = player.athlete && (player.athlete.lastName || player.athlete.displayName) ? 
                 (player.athlete.lastName || player.athlete.displayName) : 'Unknown Player';
    const substitution = player.subbedOutFor?.athlete ? `
      <span class="sub-arrow red-arrow">←</span>
      ` : "";
    const jersey = player.jersey || 'N/A';
    const stats = player.stats && Array.isArray(player.stats) ? player.stats.reduce((acc, stat) => {
      acc[stat.abbreviation] = stat.displayValue;
      return acc;
    }, {}) : {};

    const yellowCard = stats["YC"] === "1";
    const redCard = stats["RC"] === "1";
    const playerNameColor = redCard ? "red" : yellowCard ? "yellow" : "white";

    const hoverCardId = `hover-card-${player.athlete && player.athlete.id ? player.athlete.id : 'unknown'}`;

    // Check if hover card already exists, if not create it
    let hoverCard = document.getElementById(hoverCardId);
    if (!hoverCard) {
      hoverCard = document.createElement("div");
      hoverCard.className = "player-hover-card";
      hoverCard.id = hoverCardId;
      document.body.appendChild(hoverCard);
    }

    // Update hover card content (this will happen every refresh)
    hoverCard.innerHTML = `
      <img src="${teamLogo}" alt="Team Logo" class="hover-team-logo" onerror="this.src='soccer-ball-png-24.png'">
      <div class="hover-player-name">
        <span style="color: grey;">${jersey}</span> 
        <span style="color: ${playerNameColor};">${name}</span>
      </div>

      ${
        player.position.abbreviation === "G"
          ? `<div>SV: ${stats["SV"] || "0"} | GA: ${stats["GA"] || "0"}</div>`
          : `
            <div>Goals: ${stats["G"] || "0"} | Assists: ${stats["A"] || "0"}</div>
            <div>Shots: ${stats["SH"] || "0"} | SOG: ${stats["ST"] || "0"}</div>
          `
      }
    `;

    return `
      <div class="player-container" style="${positionStyle}" data-hover-id="${hoverCardId}">
        <div class="player-circle">${player.jersey}</div>
        <div class="player-name">${substitution}${name}</div>
      </div>
    `;
  };

  const renderTeamPlayers = (players, positionStyles, teamLogo) =>
    players
      .filter(player => player.starter)
      .map(player => renderPlayer(player, positionStyles[player.position && player.position.abbreviation ? player.position.abbreviation : ""] || "", teamLogo))
      .join("");

  const renderSubstitutes = (subs, teamLogo) => `
    <div class="subs-box">
      <div class="subs-header">
        <img src="${teamLogo}" alt="Team Logo" class="subs-team-logo" onerror="this.src='soccer-ball-png-24.png'">
        <span class="subs-title">Subs</span>
      </div>
      <ul class="subs-list">
        ${subs.map(sub => {
          const name = sub.athlete && (sub.athlete.lastName || sub.athlete.displayName) ? 
                       (sub.athlete.lastName || sub.athlete.displayName) : "Unknown";
          const subbedInFor = sub.subbedInFor?.athlete ? `
            <span class="sub-arrow green-arrow">→</span>
            <span class="sub-time">${sub.plays?.[0]?.clock?.displayValue || ""}</span>
            <span class="sub-out">Out: #${sub.subbedInFor.jersey || ""}, ${sub.subbedInFor.athlete && sub.subbedInFor.athlete.displayName ? sub.subbedInFor.athlete.displayName : "Unknown"}</span>
          ` : "";
          const jersey = sub.jersey || "N/A";
          const stats = sub.stats && Array.isArray(sub.stats) ? sub.stats.reduce((acc, stat) => {
            acc[stat.abbreviation] = stat.displayValue;
            return acc;
          }, {}) : {};

          const yellowCard = stats["YC"] === "1";
          const redCard = stats["RC"] === "1";
          const playerNameColor = redCard ? "red" : yellowCard ? "yellow" : "white";

          const hoverCardId = `hover-card-${sub.athlete?.id || "unknown"}`;

          // Check if hover card already exists, if not create it
          let hoverCard = document.getElementById(hoverCardId);
          if (!hoverCard) {
            hoverCard = document.createElement("div");
            hoverCard.className = "player-hover-card";
            hoverCard.id = hoverCardId;
            document.body.appendChild(hoverCard);
          }

          // Update hover card content (this will happen every refresh)
          hoverCard.innerHTML = `
            <img src="${teamLogo}" alt="Team Logo" class="hover-team-logo" onerror="this.src='soccer-ball-png-24.png'">
            <div class="hover-player-name">
              <span style="color: grey;">${jersey}</span> 
              <span style="color: ${playerNameColor};">${name}</span>
            </div>

            ${
              sub.position?.abbreviation === "G"
                ? `<div>SV: ${stats["SV"] || "0"} | GA: ${stats["GA"] || "0"}</div>`
                : `
                  <div>Goals: ${stats["G"] || "0"} | Assists: ${stats["A"] || "0"}</div>
                  <div>Shots: ${stats["SH"] || "0"} | SOG: ${stats["ST"] || "0"}</div>
                `
            }
          `;

          return `
            <li data-hover-id="${hoverCardId}">
              <span class="jersey-number">${jersey}</span> ${name}
              ${subbedInFor}
            </li>
          `;
        }).join("")}
      </ul>
    </div>
  `;

  const homePositionStyles = getPositionStyles(homeFormation);
  const awayPositionStyles = getPositionStyles(awayFormation);

  return `
    <div class="pitches-wrapper">
      <div class="pitch-container">
        <div class="team-info">
          <img src="${awayLogo}" alt="Away Team Logo" class="form-team-logo" style="margin-right: 10px;" onerror="this.src='soccer-ball-png-24.png'">
          <span class="team-formation">${awayFormation}</span>
        </div>
        <div class="football-pitch">
          <div class="center-circle"></div>
          <div class="penalty-box"></div>
          <div class="goal-box"></div>
          <div class="penalty-box-circle"></div>
          ${renderTeamPlayers(awayPlayers, awayPositionStyles, awayLogo)}
        </div>
        ${renderSubstitutes(awaySubs, awayLogo)}
      </div>
      <div class="pitch-container">
        <div class="team-info">
          <span class="team-formation">${homeFormation}</span>
          <img src="${homeLogo}" alt="Home Team Logo" class="form-team-logo" style="margin-left: 10px;" onerror="this.src='soccer-ball-png-24.png'">
        </div>
        <div class="football-pitch">
          <div class="center-circle"></div>
          <div class="penalty-box"></div>
          <div class="goal-box"></div>
          <div class="penalty-box-circle"></div>
          ${renderTeamPlayers(homePlayers, homePositionStyles, homeLogo)}
        </div>
        ${renderSubstitutes(homeSubs, homeLogo)}
      </div>
    </div>
  `;
}

async function fetchAndRenderTopScoreboard() {
  try {
    const gameId = getQueryParam("gameId");
    if (!gameId) {
      console.error("Error: No gameId provided in the URL.");
      return;
    }

    // Determine which tab is currently active
    const statsTabActive = document.getElementById('statsContent')?.classList.contains('active') !== false;
    const playsTabActive = document.getElementById('playsContent')?.classList.contains('active') === true;

    // Only fetch data needed for the current tab
    if (statsTabActive && !playsTabActive) {
      // Stats tab is active - only fetch lineup data
      await fetchAndRenderStatsData(gameId);
    } else if (playsTabActive) {
      // Plays tab is active - only fetch commentary data
      await fetchAndRenderPlaysData(gameId);
    } else {
      // Default to stats if we can't determine (first load)
      await fetchAndRenderStatsData(gameId);
    }
  } catch (error) {
    console.error("Error in fetchAndRenderTopScoreboard:", error);
  }
}

async function fetchAndRenderStatsData(gameId) {
  try {
    const SCOREBOARD_API_URL = `https://cdn.espn.com/core/soccer/lineups?xhr=1&gameId=${gameId}`;
    const response = await fetch(SCOREBOARD_API_URL);
    const scoreboardData = await response.json();

    // Store data globally for other functions to use
    window.currentGameData = scoreboardData;

    const homeTeam = scoreboardData.__gamepackage__.homeTeam.team;
    const awayTeam = scoreboardData.__gamepackage__.awayTeam.team;

    const homeScore = parseInt(scoreboardData.__gamepackage__.homeTeam.score || "0", 10);
    const awayScore = parseInt(scoreboardData.__gamepackage__.awayTeam.score || "0", 10);

    // Retrieve shootout scores
    const homeShootoutScore = parseInt(scoreboardData.__gamepackage__.homeTeam.shootoutScore || "0", 10);
    const awayShootoutScore = parseInt(scoreboardData.__gamepackage__.awayTeam.shootoutScore || "0", 10);

    const competitions = scoreboardData.gamepackageJSON?.header?.competitions;
    if (!competitions || !Array.isArray(competitions) || competitions.length === 0) {
      console.error("Error: Competitions data is missing or invalid.");
      return;
    }

    const shortDetail = competitions[0]?.status?.type.shortDetail || "0'";
    const gameStatus = competitions[0]?.status?.type.description || "N/A";
    const gameState = competitions[0]?.status?.type.state || "N/A";

    const details = competitions[0]?.details || [];
    const homeTeamId = homeTeam.id;
    const awayTeamId = awayTeam.id;

    const homeScorers = details
      .filter(detail => detail.team.id === homeTeamId && detail.scoringPlay)
      .map(detail => ({
        displayName: detail.participants[0]?.athlete?.displayName || "Unknown",
        clock: detail.clock.displayValue,
        penaltyKick: detail.penaltyKick,
      }));

    const awayScorers = details
      .filter(detail => detail.team.id === awayTeamId && detail.scoringPlay)
      .map(detail => ({
        displayName: detail.participants[0]?.athlete?.displayName || "Unknown",
        clock: detail.clock.displayValue,
        penaltyKick: detail.penaltyKick,
      }));

    const topScoreboardEl = document.getElementById("topScoreboard");
    if (!topScoreboardEl) {
      console.error("Error: 'topScoreboard' element not found.");
      return;
    }

    const homeLogo = await getTeamLogoWithFallback(homeTeamId);
    const awayLogo = await getTeamLogoWithFallback(awayTeamId);

    const homeScoreColor = gameState === "post" && (homeShootoutScore || homeScore) < (awayShootoutScore || awayScore) ? "grey" : "white";
    const awayScoreColor = gameState === "post" && (awayShootoutScore || awayScore) < (homeShootoutScore || homeScore) ? "grey" : "white";

    topScoreboardEl.innerHTML = `
      <div class="team-block">
        <div class="team-score responsive-score" style="color: ${homeScoreColor};">
          ${homeScore}${homeShootoutScore > 0 ? `<sup style="font-size: 0.5em;">(${homeShootoutScore})</sup>` : ""}
        </div>
        <img class="team-logo responsive-logo" src="${homeLogo}" alt="${homeTeam.displayName}" onerror="this.src='soccer-ball-png-24.png'">
        <div class="team-name responsive-name">${homeTeam.shortDisplayName}</div>
      </div>
      <div class="inning-center">
        <div class="inning-status responsive-inning-status">${shortDetail}</div>
        <div class="game-clock responsive-game-clock">${gameStatus}</div>
      </div>
      <div class="team-block">
        <div class="team-score responsive-score" style="color: ${awayScoreColor};">
        ${awayScore}${awayShootoutScore > 0 ? `<sup style="font-size: 0.5em;">(${awayShootoutScore})</sup>` : ""}
        </div>
        <img class="team-logo responsive-logo" src="${awayLogo}" alt="${awayTeam.displayName}" onerror="this.src='soccer-ball-png-24.png'">
        <div class="team-name responsive-name">${awayTeam.shortDisplayName}</div>
      </div>
    `;

    let scorersContainer = document.querySelector(".scorers-container");
    if (!scorersContainer) {
      scorersContainer = document.createElement("div");
      scorersContainer.className = "scorers-container";
    }
    scorersContainer.innerHTML = renderScorersBox(homeScorers, awayScorers);

    const homeRoster = scoreboardData.gamepackageJSON.rosters.find(r => r.homeAway === "home");
    const awayRoster = scoreboardData.gamepackageJSON.rosters.find(r => r.homeAway === "away");

    const homePlayers = homeRoster?.roster?.filter(player => player.starter) || [];
    const awayPlayers = awayRoster?.roster?.filter(player => player.starter) || [];

    const homeSubs = homeRoster?.roster?.filter(player => player.formationPlace === "0") || [];
    const awaySubs = awayRoster?.roster?.filter(player => player.formationPlace === "0") || [];

    const homeFormation = homeRoster?.formation || "4-3-3";
    const awayFormation = awayRoster?.formation || "4-3-3";

    // Render formation in the stats content section
    const formationDisplay = document.getElementById("formationDisplay");
    if (formationDisplay) {
      formationDisplay.innerHTML = renderFootballPitches(
        awayPlayers, homePlayers, awayFormation, homeFormation, awayLogo, homeLogo, awaySubs, homeSubs
      );
    }
  } catch (error) {
    console.error("Error fetching scoreboard data:", error);
  }
}

async function renderMatchStats(homeTeam, awayTeam, homeForm, awayForm, headToHeadData) {
  // Get team logos
  const homeLogo = await getTeamLogoWithFallback(homeTeam.team.id);
  const awayLogo = await getTeamLogoWithFallback(awayTeam.team.id);

  // Get team colors (convert hex to proper format)
  const homeColor = homeTeam.team.color ? `#${homeTeam.team.color}` : '#007bff';
  const awayColor = awayTeam.team.color ? `#${awayTeam.team.color}` : '#28a745';

  // Get possession percentages
  const homePossession = parseFloat(homeTeam.statistics.find(stat => stat.name === 'possessionPct')?.displayValue || '0');
  const awayPossession = parseFloat(awayTeam.statistics.find(stat => stat.name === 'possessionPct')?.displayValue || '0');

  // Helper function to get stat value
  const getStat = (team, statName) => {
    const stat = team.statistics.find(s => s.name === statName);
    return stat ? parseFloat(stat.displayValue) || 0 : 0;
  };

  // Helper function to render stats row with bars (fixed mirroring)
  const renderStatsRow = (label, awayValue, homeValue, isPercentage = false) => {
    const awayNum = typeof awayValue === 'number' ? awayValue : parseFloat(awayValue) || 0;
    const homeNum = typeof homeValue === 'number' ? homeValue : parseFloat(homeValue) || 0;
    const total = awayNum + homeNum;
    const awayPercent = total > 0 ? (awayNum / total) * 100 : 50;
    const homePercent = total > 0 ? (homeNum / total) * 100 : 50;

    return `
      <div class="stats-row">
        <div class="stats-value away">${homeValue}${isPercentage ? '%' : ''}</div>
        <div class="stats-bar-container">
          <div class="stats-bar">
            <div class="stats-bar-fill away" style="width: ${homePercent}%; background: ${homeColor};"></div>
          </div>
          <div class="stats-bar">
            <div class="stats-bar-fill home" style="width: ${awayPercent}%; background: ${awayColor};"></div>
          </div>
        </div>
        <div class="stats-value home">${awayValue}${isPercentage ? '%' : ''}</div>
      </div>
      <div class="stats-label">${label}</div>
    `;
  };

  // Render form results with actual game details
  const renderFormResults = (formData, teamSide, teamColor, teamLogo, teamAbbr) => {
    if (!formData || !formData.events) return '<div class="form-no-data">No recent form data</div>';
    
    return formData.events.slice(0, 5).map(event => {
      const result = event.gameResult?.toLowerCase() || 'd';
      const isHome = event.atVs !== '@';
      const opponentLogo = event.opponentLogo || event.opponent?.logo || 'soccer-ball-png-24.png';
      const opponentAbbr = event.opponent?.abbreviation || 'UNK';
      const score = `${event.homeTeamScore}-${event.awayTeamScore}`;
      
      const date = new Date(event.gameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const matchId = event.id; // Get the match ID for navigation
      
      return `
        <div class="form-match clickable-match" onclick="openMatchPage('${matchId}')" style="cursor: pointer;">
          <div class="form-match-header">
            <span class="form-date">${date}</span>
            <span class="form-result-badge ${result}">${result.toUpperCase()}</span>
          </div>
          <div class="form-match-teams">
            ${isHome ? `
              <div class="form-team">
                <img src="${teamLogo}" class="form-team-logo-small" onerror="this.src='soccer-ball-png-24.png'">
                <span class="form-team-abbr">${teamAbbr}</span>
              </div>
              <span class="form-score">${score}</span>
              <div class="form-team" style="flex-direction: row-reverse;">
                <img src="${opponentLogo}" class="form-team-logo-small" onerror="this.src='soccer-ball-png-24.png'">
                <span class="form-team-abbr">${opponentAbbr}</span>
              </div>
            ` : `
              <div class="form-team">
                <img src="${opponentLogo}" class="form-team-logo-small" onerror="this.src='soccer-ball-png-24.png'">
                <span class="form-team-abbr">${opponentAbbr}</span>
              </div>
              <span class="form-score">${score}</span>
              <div class="form-team" style="flex-direction: row-reverse;">
                <img src="${teamLogo}" class="form-team-logo-small" onerror="this.src='soccer-ball-png-24.png'">
                <span class="form-team-abbr">${teamAbbr}</span>
              </div>
            `}
          </div>
          <div class="form-competition">${event.leagueName || event.leagueAbbreviation || ''}</div>
        </div>
      `;
    }).join('');
  };

  // Render head to head matches
  const renderHeadToHeadMatches = (h2hData, homeTeamId, awayTeamId) => {
    if (!h2hData || h2hData.length === 0) return '<div class="h2h-no-data">No recent head-to-head matches</div>';

    // Extract events from the first team data and limit to 5
    const events = h2hData[0]?.events || [];
    
    return events.slice(0, 5).map(event => {
      if (!event) return '';
      
      const date = new Date(event.gameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const isHomeTeamAtHome = event.homeTeamId === homeTeamId;
      const homeTeamInMatch = isHomeTeamAtHome ? homeTeam.team.abbreviation : awayTeam.team.abbreviation;
      const awayTeamInMatch = isHomeTeamAtHome ? awayTeam.team.abbreviation : homeTeam.team.abbreviation;
      const homeLogoInMatch = isHomeTeamAtHome ? homeLogo : awayLogo;
      const awayLogoInMatch = isHomeTeamAtHome ? awayLogo : homeLogo;
      const matchId = event.id; // Get the match ID for navigation
      const score = `${event.homeTeamScore || '0'}-${event.awayTeamScore || '0'}`;

      return `
        <div class="h2h-match clickable-match" onclick="openMatchPage('${matchId}')" style="cursor: pointer;">
          <div class="h2h-match-header">
            <span class="h2h-date">${date}</span>
            <span class="h2h-competition">${event.leagueName || event.leagueAbbreviation || ''}</span>
          </div>
          <div class="h2h-match-teams">
            <div class="h2h-team">
              <img src="${homeLogoInMatch}" class="h2h-team-logo" onerror="this.src='soccer-ball-png-24.png'">
              <span class="h2h-team-name">${homeTeamInMatch}</span>
            </div>
            <span class="h2h-score">${score}</span>
            <div class="h2h-team">
              <img src="${awayLogoInMatch}" class="h2h-team-logo" onerror="this.src='soccer-ball-png-24.png'">
              <span class="h2h-team-name">${awayTeamInMatch}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  };

  return `
    <!-- Main Match Stats Container -->
    <div class="match-stats-container">
      <div class="stats-header">Match Stats</div>
      
      <div class="stats-teams">
        <div class="stats-team home">
          <img src="${homeLogo}" class="stats-team-logo" onerror="this.src='soccer-ball-png-24.png'">
          <div class="stats-team-name">${homeTeam.team.shortDisplayName}</div>
        </div>
        <div class="stats-team away">
          <div class="stats-team-name">${awayTeam.team.shortDisplayName}</div>
          <img src="${awayLogo}" class="stats-team-logo" onerror="this.src='soccer-ball-png-24.png'">
        </div>
      </div>

      <div class="stats-section">
        <div class="stats-section-title">Possession</div>
        <div class="possession-section">
          <div class="possession-circle" style="background: conic-gradient(${awayColor} 0% ${awayPossession}%, ${homeColor} ${awayPossession}% 100%);">
            <div class="possession-center">
              <div>Possession</div>
            </div>
          </div>
          <div class="possession-values">
            <div class="possession-team">
              <div class="possession-color" style="background: ${homeColor};"></div>
              <span>${homeTeam.team.abbreviation} ${homePossession}%</span>
            </div>
            <div class="possession-team">
              <span>${awayPossession}% ${awayTeam.team.abbreviation}</span>
              <div class="possession-color" style="background: ${awayColor};"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="stats-section">
        <div class="stats-section-title">Shots</div>
        ${renderStatsRow('Shots on Goal', getStat(awayTeam, 'shotsOnTarget'), getStat(homeTeam, 'shotsOnTarget'))}
        ${renderStatsRow('Shot Attempts', getStat(awayTeam, 'totalShots'), getStat(homeTeam, 'totalShots'))}
      </div>

      <div class="stats-section">
        <div class="stats-section-title">Discipline</div>
        ${renderStatsRow('Fouls', getStat(awayTeam, 'foulsCommitted'), getStat(homeTeam, 'foulsCommitted'))}
        ${renderStatsRow('Yellow Cards', getStat(awayTeam, 'yellowCards'), getStat(homeTeam, 'yellowCards'))}
        ${renderStatsRow('Red Cards', getStat(awayTeam, 'redCards'), getStat(homeTeam, 'redCards'))}
      </div>

      <div class="stats-section">
        <div class="stats-section-title">Set Pieces</div>
        ${renderStatsRow('Corner Kicks', getStat(awayTeam, 'wonCorners'), getStat(homeTeam, 'wonCorners'))}
        ${renderStatsRow('Saves', getStat(awayTeam, 'saves'), getStat(homeTeam, 'saves'))}
      </div>
    </div>

    <!-- Form Containers -->
    <div class="form-containers">
      <div class="form-container home">
        <div class="form-header">
          <img src="${homeLogo}" class="form-team-logo-header" onerror="this.src='soccer-ball-png-24.png'">
          <div class="form-team-info">
            <span class="form-team-name">${homeTeam.team.shortDisplayName}</span>
            <span class="form-subtitle">Form</span>
          </div>
        </div>
        <div class="form-matches">
          ${renderFormResults(homeForm, 'home', homeColor, homeLogo, homeTeam.team.abbreviation)}
        </div>
      </div>

      <div class="form-container away">
        <div class="form-header">
          <img src="${awayLogo}" class="form-team-logo-header" onerror="this.src='soccer-ball-png-24.png'">
          <div class="form-team-info">
            <span class="form-team-name">${awayTeam.team.shortDisplayName}</span>
            <span class="form-subtitle">Form</span>
          </div>
        </div>
        <div class="form-matches">
          ${renderFormResults(awayForm, 'away', awayColor, awayLogo, awayTeam.team.abbreviation)}
        </div>
      </div>
    </div>

    <!-- Head to Head Container -->
    <div class="h2h-container">
      <div class="h2h-header">
        <span class="h2h-title">Head To Head Record</span>
      </div>
      <div class="h2h-matches">
        ${renderHeadToHeadMatches(headToHeadData, homeTeam.team.id, awayTeam.team.id)}
      </div>
    </div>
  `;
}

async function fetchAndRenderMatchStats(gameId) {
  try {
    const MATCH_STATS_API_URL = `https://cdn.espn.com/core/soccer/matchstats?xhr=1&gameId=${gameId}`;
    const response = await fetch(MATCH_STATS_API_URL);
    const matchStatsData = await response.json();

    // Extract teams data
    const homeTeam = matchStatsData.gamepackageJSON.boxscore.teams.find(team => team.homeAway === 'home');
    const awayTeam = matchStatsData.gamepackageJSON.boxscore.teams.find(team => team.homeAway === 'away');

    // Extract form data
    const homeForm = matchStatsData.gamepackageJSON.boxscore.form.find(form => form.team.id === homeTeam.team.id);
    const awayForm = matchStatsData.gamepackageJSON.boxscore.form.find(form => form.team.id === awayTeam.team.id);

    // Extract head to head data
    const headToHeadData = matchStatsData.gamepackageJSON.headToHeadGames || [];

    const matchStatsDisplay = document.getElementById("matchStatsDisplay");
    if (!matchStatsDisplay) {
      console.error("Error: 'matchStatsDisplay' element not found.");
      return;
    }

    // Render the match stats
    matchStatsDisplay.innerHTML = await renderMatchStats(homeTeam, awayTeam, homeForm, awayForm, headToHeadData);

  } catch (error) {
    console.error("Error fetching match stats data:", error);
  }
}

async function fetchAndRenderPlaysData(gameId) {
  try {
    // Skip update if user is actively scrolling in plays section
    if (isUserScrolling) {
      console.log("Skipping plays update - user is scrolling");
      return;
    }
    
    // Fetch plays data from the new ESPN API endpoint
    const PLAYS_API_URL = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/eng.1/events/${gameId}/competitions/${gameId}/plays?lang=en&region=us&limit=1000`;
    const playsResponse = await fetch(convertToHttps(PLAYS_API_URL));
    
    if (!playsResponse.ok) {
      throw new Error(`Plays API responded with status: ${playsResponse.status}`);
    }
    
    const playsData = await playsResponse.json();
    
    // Store plays data globally for play-by-play rendering
    window.currentPlaysData = playsData;
    
    // Update play-by-play if it's visible
    const playsContent = document.getElementById('playsContent');
    if (playsContent && playsContent.classList.contains('active')) {
      renderPlayByPlay(gameId, playsData);
    }
  } catch (error) {
    console.error("Error fetching plays data:", error);
    
    // Hide play-by-play section and show message
    const playsContainer = document.querySelector('.plays-container');
    if (playsContainer) {
      playsContainer.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #777;">
          <p>Play-by-play data is currently unavailable</p>
          <p style="font-size: 0.9em;">This may be due to network issues or the match hasn't started yet</p>
        </div>
      `;
    }
  }
}

// Function to render mini soccer field with event position
function renderMiniField(coordinate, coordinate2, eventType = 'gen', teamSide = 'home', teamColor = '#007bff', teamName = '') {
  if (!coordinate || coordinate.x === undefined || coordinate.y === undefined) {
    return `
      <div class="mini-field">
        <div class="field-container">
          <div class="field-outline"></div>
          <div class="center-line"></div>
          <div class="center-circle-mini"></div>
          <div class="penalty-area left"></div>
          <div class="penalty-area right"></div>
          <div class="goal-area left"></div>
          <div class="goal-area right"></div>
          <div class="goal left"></div>
          <div class="goal right"></div>
        </div>
      </div>
    `;
  }

  // Simplified coordinate system: 
  // Field split into 2 halves - right half = home, left half = away
  // Half line (center) = x1 for both teams
  // X: 0 = far end, 1 = half line (center)
  const espnX = coordinate.x; 
  const espnY = coordinate.y; 
  
  // Convert ESPN coordinates with new field logic
  let leftPercent, topPercent;
  
  if (teamSide === 'home') {
    // Home team on right half of field
    // X=0 (far right) → 100% left position
    // X=1 (center line) → 50% left position
    leftPercent = 50 + (1 - espnX) * 50; // X=0→100%, X=1→50%
    topPercent = espnY * 100; // Y=0→0%, Y=1→100%
  } else {
    // Away team on left half of field  
    // X=0 (far left) → 0% left position
    // X=1 (center line) → 50% left position
    leftPercent = espnX * 50; // X=0→0%, X=1→50%
    topPercent = (1 - espnY) * 100; // Y=0→100%, Y=1→0% (inverted)
  }
  
  // Constrain to field bounds with some padding
  const finalLeftPercent = Math.max(2, Math.min(98, leftPercent));
  const finalTopPercent = Math.max(2, Math.min(98, topPercent));

  // Handle second coordinate (ball end position) if available - only for goals and attempts
  let ballEndPosition = '';
  let trajectoryLine = '';
  
  if (coordinate2 && coordinate2.x !== undefined && coordinate2.y !== undefined && 
      (eventType === 'goal' || eventType === 'attempt' || eventType === 'shot')) {
    const espnX2 = coordinate2.x;
    const espnY2 = coordinate2.y;
    
    let leftPercent2, topPercent2;
    
    if (teamSide === 'home') {
      // Home team on right half
      leftPercent2 = 50 + (1 - espnX2) * 50; // X=0→100%, X=1→50%
      topPercent2 = espnY2 * 100;
    } else {
      // Away team on left half
      leftPercent2 = espnX2 * 50; // X=0→0%, X=1→50%
      topPercent2 = (1 - espnY2) * 100; // Y=0→100%, Y=1→0% (inverted)
    }
    
    const finalLeftPercent2 = Math.max(2, Math.min(98, leftPercent2));
    const finalTopPercent2 = Math.max(2, Math.min(98, topPercent2));
    
    // Create ball end position marker
    ballEndPosition = `<div class="event-marker ball-end" style="left: ${finalLeftPercent2}%; top: ${finalTopPercent2}%; --team-color: ${teamColor.startsWith('#') ? teamColor : `#${teamColor}`};" title="Ball end: ESPN X=${espnX2.toFixed(3)}, Y=${espnY2.toFixed(3)}"></div>`;
    
    // Create trajectory line using SVG to properly connect the two points
    const x1 = finalLeftPercent;
    const y1 = finalTopPercent;
    const x2 = finalLeftPercent2;
    const y2 = finalTopPercent2;
    
    trajectoryLine = `<svg style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 8;">
      <line x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%" 
            stroke="${teamColor.startsWith('#') ? teamColor : `#${teamColor}`}" 
            stroke-width="2" 
            opacity="0.7" />
    </svg>`;
  }

  const eventClass = eventType === 'goal' ? 'goal' : 
                    eventType === 'shot' ? 'attempt' :
                    eventType === 'card' ? 'card' : 
                    eventType === 'red-card' ? 'red-card' :
                    eventType === 'offside' ? 'offside' :
                    eventType === 'substitution' ? 'substitution' : 'goal';
  
  // Ensure team color has # prefix
  const finalTeamColor = teamColor.startsWith('#') ? teamColor : `#${teamColor}`;

  return `
    <div class="mini-field">
      <div class="field-container" style="background-color: #2d5a2d !important;">
        <div class="field-outline" style="border-color: white !important;"></div>
        <div class="center-line" style="background-color: white !important;"></div>
        <div class="center-circle-mini" style="border-color: white !important;"></div>
        <div class="penalty-area left" style="border-color: white !important;"></div>
        <div class="penalty-area right" style="border-color: white !important;"></div>
        <div class="goal-area left" style="border-color: white !important;"></div>
        <div class="goal-area right" style="border-color: white !important;"></div>
        <div class="goal left" style="background-color: white !important;"></div>
        <div class="goal right" style="background-color: white !important;"></div>
        ${trajectoryLine}
        <!-- Player position marker -->
        <div class="event-marker ${eventClass}" style="left: ${finalLeftPercent}%; top: ${finalTopPercent}%; --team-color: ${finalTeamColor};" title="Player (${teamSide}): ESPN X=${espnX.toFixed(3)}, Y=${espnY.toFixed(3)} | CSS: ${finalLeftPercent.toFixed(1)}%, ${finalTopPercent.toFixed(1)}%"></div>
        ${ballEndPosition}
      </div>
    </div>
  `;
}

// Function to render a custom goal card (similar to MLB home run card)
async function renderGoalCard(play, team, teamColor, teamLogo, homeScore, awayScore, teamSide, homeTeam, awayTeam, gameId) {
  // Get scorer information from participants
  let scorer = null;
  let assister = null;
  
  if (play.participants && play.participants.length > 0) {
    // Find the scorer (type = "scorer")
    const scorerParticipant = play.participants.find(p => p.type === "scorer");
    if (scorerParticipant && scorerParticipant.athlete && scorerParticipant.athlete.$ref) {
      try {
        const athleteResponse = await fetch(convertToHttps(scorerParticipant.athlete.$ref));
        scorer = await athleteResponse.json();
      } catch (error) {
        console.error("Error fetching scorer data:", error);
      }
    }
    
    // Find the assister (type = "assister")
    const assisterParticipant = play.participants.find(p => p.type === "assister");
    if (assisterParticipant && assisterParticipant.athlete && assisterParticipant.athlete.$ref) {
      try {
        const athleteResponse = await fetch(convertToHttps(assisterParticipant.athlete.$ref));
        assister = await athleteResponse.json();
      } catch (error) {
        console.error("Error fetching assister data:", error);
      }
    }
  }
  
  if (!scorer) return '';
  
  const scorerName = scorer.displayName || 'Unknown Player';
  const assisterName = assister ? assister.displayName : null;
  const minute = play.clock?.displayValue || '';
  const playText = play.text || play.shortText || play.type?.text || '';
  const goalType = playText.toLowerCase().includes('penalty') ? 'Penalty Goal' : 
                   play.ownGoal ? 'Own Goal' : 'Goal';
  
  // Get team abbreviation for the scorer
  const scoringTeam = teamSide === 'home' ? homeTeam : awayTeam;
  const teamAbbr = scoringTeam?.team?.abbreviation || scoringTeam?.abbreviation || '';
  
  // Extract field position coordinates for mini field
  let coordinate = null;
  let coordinate2 = null;
  
  if (play.fieldPositionX !== undefined && play.fieldPositionY !== undefined) {
    coordinate = {
      x: play.fieldPositionX,
      y: play.fieldPositionY
    };
    
    if (play.fieldPosition2X !== undefined && play.fieldPosition2Y !== undefined) {
      coordinate2 = {
        x: play.fieldPosition2X,
        y: play.fieldPosition2Y
      };
    }
  }
  
  // Get scorer stats from the new player stats API
  let scorerStats = {
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    yellowCards: 0,
    redCards: 0
  };
  
  // Fetch player stats using the new API endpoint
  try {
    if (scorer.id && team && team.$ref) {
      const teamResponse = await fetch(convertToHttps(team.$ref));
      const teamData = await teamResponse.json();
      const teamId = teamData.id;
      
      // Fetch player stats for this game
      const statsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/eng.1/events/${gameId}/competitions/${gameId}/competitors/${teamId}/roster/${scorer.id}/statistics/0?lang=en&region=us`;
      const statsResponse = await fetch(convertToHttps(statsUrl));
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        
        // Parse the nested structure like in c3.txt
        if (statsData.splits && statsData.splits.categories) {
          const allStats = {};
          
          // Loop through all categories (defensive, offensive, etc.)
          statsData.splits.categories.forEach(category => {
            if (category.stats && Array.isArray(category.stats)) {
              category.stats.forEach(stat => {
                if (stat.name && stat.value !== undefined) {
                  allStats[stat.name] = stat.value;
                }
              });
            }
          });
          
          // Map to the stats we want to display
          scorerStats = {
            goals: allStats.totalGoals || allStats.goalsScored || 0,
            assists: allStats.goalAssists || allStats.assistsProvided || 0,
            shots: allStats.totalShots || allStats.shots || allStats.shotsTotal || 0,
            shotsOnTarget: allStats.shotsOnTarget || allStats.shotsOnGoal || allStats.shotsOnTargetTotal || 0,
            yellowCards: allStats.yellowCards || allStats.yellowCardsReceived || 0,
            redCards: allStats.redCards || allStats.redCardsReceived || 0
          };
          
          console.log('Player stats parsed:', scorerStats, 'from data:', allStats);
        }
      }
    }
  } catch (error) {
    console.warn('Could not fetch player stats for goal card:', error);
  }
  
  // Determine if this was a winning, tying, or leading goal
  let goalSituation = '';
  const finalHomeScore = homeScore;
  const finalAwayScore = awayScore;
  
  if (teamSide === 'home') {
    if (finalHomeScore > finalAwayScore) {
      if (finalHomeScore - finalAwayScore === 1) {
        goalSituation = finalAwayScore === 0 ? 'Opening Goal' : 'Go-ahead Goal';
      } else {
        goalSituation = 'Extends Lead';
      }
    } else if (finalHomeScore === finalAwayScore) {
      goalSituation = 'Equalizer';
    }
  } else {
    if (finalAwayScore > finalHomeScore) {
      if (finalAwayScore - finalHomeScore === 1) {
        goalSituation = finalHomeScore === 0 ? 'Opening Goal' : 'Go-ahead Goal';
      } else {
        goalSituation = 'Extends Lead';
      }
    } else if (finalAwayScore === finalHomeScore) {
      goalSituation = 'Equalizer';
    }
  }
  
  const teamColorHex = teamColor.startsWith('#') ? teamColor : `#${teamColor}`;
  
  // Generate a unique ID for this goal card
  const goalCardId = `goal-card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Generate mini field for the goal card
  const miniFieldHtml = renderMiniField(coordinate, coordinate2, 'goal', teamSide, teamColorHex, team?.shortDisplayName || '');
  
  // Get team logos using cached fallback function
  const homeTeamLogo = await getTeamLogoWithFallback(homeTeam?.team?.id || homeTeam?.id);
  const awayTeamLogo = await getTeamLogoWithFallback(awayTeam?.team?.id || awayTeam?.id);
  
  return `
    <div id="${goalCardId}" class="goal-card" style="background: linear-gradient(135deg, ${teamColorHex}15 0%, ${teamColorHex}05 100%); border-left: 4px solid ${teamColorHex}; margin: 10px 0; padding: 20px; border-radius: 8px; color: white; position: relative;">
      <div class="copy-button" onclick="copyGoalCardAsImage('${goalCardId}')" style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.6); border: none; border-radius: 50%; width: 30px; height: 30px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; z-index: 10;">
        📋
      </div>
      <div class="goal-card-header" style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 10px; margin-right: 55px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; flex: 1; min-width: 200px;">
          <img src="${teamLogo}" alt="${team?.displayName || 'Team'}" style="width: 40px; height: 40px; margin-right: 15px;" onerror="this.src='soccer-ball-png-24.png'">
          <div class="goal-info">
            <div class="goal-type" style="font-size: 14px; font-weight: bold; color: white; margin-bottom: 4px;">
              ⚽ ${goalType} ${goalSituation ? `• ${goalSituation}` : ''}
            </div>
            <div class="goal-time" style="font-size: 12px; color: rgba(255,255,255,0.8);">
              ${minute}
            </div>
          </div>
        </div>
        
        <div class="goal-field" style="width: 100px; height: 60px; flex-shrink: 0;">
          ${miniFieldHtml}
        </div>
      </div>
      
      <div class="goal-card-body">
        <div class="goal-details">
          <div class="scorer-info" style="margin-bottom: 15px;">
            <div class="scorer-name" style="font-size: 18px; font-weight: bold; color: white; margin-bottom: 4px;">
              ${scorerName} - ${teamAbbr}
            </div>
            ${assisterName ? `
              <div class="assist-info" style="font-size: 14px; color: #999;">
                Assist: ${assisterName}
              </div>
            ` : ''}
          </div>
          
          <div class="goal-score-line" style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; margin-bottom: 15px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <img src="${homeTeamLogo}" alt="Home" style="width: 24px; height: 24px;" onerror="this.src='soccer-ball-png-24.png'">
              <span style="font-size: 16px; font-weight: bold; color: white;">${finalHomeScore} - ${finalAwayScore}</span>
              <img src="${awayTeamLogo}" alt="Away" style="width: 24px; height: 24px;" onerror="this.src='soccer-ball-png-24.png'">
            </div>
            <div style="background: ${teamColorHex}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">
              GOAL
            </div>
          </div>
          
          <div class="scorer-stats" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; max-width: 100%;">
            <div style="text-align: center; background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px;">
              <div style="font-size: 16px; font-weight: bold; color: white;">${scorerStats.goals}</div>
              <div style="font-size: 12px; color: rgba(255,255,255,0.8);">Goals</div>
            </div>
            <div style="text-align: center; background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px;">
              <div style="font-size: 16px; font-weight: bold; color: white;">${scorerStats.assists}</div>
              <div style="font-size: 12px; color: rgba(255,255,255,0.8);">Assists</div>
            </div>
            <div style="text-align: center; background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px;">
              <div style="font-size: 16px; font-weight: bold; color: white;">${scorerStats.shots}</div>
              <div style="font-size: 12px; color: rgba(255,255,255,0.8);">Shots</div>
            </div>
            <div style="text-align: center; background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px;">
              <div style="font-size: 16px; font-weight: bold; color: white;">${scorerStats.shotsOnTarget}</div>
              <div style="font-size: 12px; color: rgba(255,255,255,0.8);">SOT</div>
            </div>
            <div style="text-align: center; background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px;">
              <div style="font-size: 16px; font-weight: bold; color: white;">${scorerStats.yellowCards}</div>
              <div style="font-size: 12px; color: rgba(255,255,255,0.8);">YC</div>
            </div>
            <div style="text-align: center; background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px;">
              <div style="font-size: 16px; font-weight: bold; color: white;">${scorerStats.redCards}</div>
              <div style="font-size: 12px; color: rgba(255,255,255,0.8);">RC</div>
            </div>
          </div>
        </div>
      </div>
      
      <style>
        @media (max-width: 768px) {
          .goal-card-header {
            flex-direction: column !important;
            align-items: flex-start !important;
            margin-right: 0 !important;
          }
          .goal-field {
            align-self: center !important;
            margin-top: 5px !important;
            margin-bottom: 80px !important;
            margin-right: 125px !important;
            order: 2 !important;
            width: 80px !important;
            height: 56px !important;
          }
          .scorer-stats {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .goal-card {
            padding: 15px !important;
          }
          .goal-details {
            margin-top: 10px !important;
          }
          .copy-button {
            top: 5px !important;
            right: 5px !important;
            width: 25px !important;
            height: 25px !important;
            font-size: 10px !important;
          }
        }
      </style>
    </div>
  `;
}

// Global variables for preserving play-by-play state
let openPlays = new Set(); // Track which plays are open
let playsScrollPosition = 0; // Track scroll position
let isUserScrolling = false; // Track if user is actively scrolling
let scrollTimeout = null; // Timeout for scroll detection

// Helper function to get team color using alternate color logic like team-page.js
function getTeamColorWithAlternateLogic(team) {
  if (!team || !team.color) return '007bff'; // Default fallback
  
  const isUsingAlternateColor = ["ffffff", "ffee00", "ffff00", "81f733", "000000"].includes(team.color);
  
  if (isUsingAlternateColor && team.alternateColor) {
    return team.alternateColor;
  } else {
    return team.color;
  }
}

async function renderPlayByPlay(gameId, playsData = null) {
  try {
    let data;
    
    // Use existing data if provided, otherwise fetch it
    if (playsData) {
      data = playsData;
    } else {
      const PLAYS_API_URL = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/eng.1/events/${gameId}/competitions/${gameId}/plays?lang=en&region=us&limit=1000`;
      
      let response;
      try {
        response = await fetch(convertToHttps(PLAYS_API_URL));
        if (!response.ok) {
          throw new Error(`Plays API responded with status: ${response.status}`);
        }
        data = await response.json();
      } catch (fetchError) {
        console.warn("Failed to fetch plays data:", fetchError.message);
        
        // Hide play-by-play section and show message
        const playsContainer = document.querySelector('.plays-container');
        if (playsContainer) {
          playsContainer.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #777;">
              <p>Play-by-play data is currently unavailable</p>
              <p style="font-size: 0.9em;">This may be due to network restrictions or the match hasn't started yet</p>
            </div>
          `;
        }
        return;
      }
    }
    
    if (!data.items || data.items.length === 0) {
      console.warn("No plays data available in response");
      const playsContainer = document.querySelector('.plays-container');
      if (playsContainer) {
        playsContainer.innerHTML = `
          <div style="text-align: center; padding: 20px; color: #777;">
            <p>No plays data available for this match</p>
          </div>
        `;
      }
      return;
    }

    // Get team info from a scoring play or use game data
    let homeTeam = null;
    let awayTeam = null;
    
    // Try to get team info from plays data
    for (const play of data.items) {
      if (play.team && play.team.$ref) {
        try {
          const teamResponse = await fetch(convertToHttps(play.team.$ref));
          const teamData = await teamResponse.json();
          
          // We need to get both teams - fetch game data to determine home/away
          if (!homeTeam && !awayTeam) {
            // Try to get game data to determine which team is home/away
            try {
              const gameResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=${gameId}`);
              const gameData = await gameResponse.json();
              
              if (gameData.header && gameData.header.competitions && gameData.header.competitions[0]) {
                const competitors = gameData.header.competitions[0].competitors;
                homeTeam = competitors.find(c => c.homeAway === "home");
                awayTeam = competitors.find(c => c.homeAway === "away");
              }
            } catch (gameError) {
              console.warn("Could not fetch game data for team info:", gameError);
            }
          }
          break;
        } catch (teamError) {
          console.warn("Could not fetch team data:", teamError);
        }
      }
    }
    
    // Fallback if we couldn't get teams from plays or game data
    if (!homeTeam || !awayTeam) {
      console.warn("Could not determine home/away teams");
      const playsContainer = document.querySelector('.plays-container');
      if (playsContainer) {
        playsContainer.innerHTML = `
          <div style="text-align: center; padding: 20px; color: #777;">
            <p>Could not load team information</p>
          </div>
        `;
      }
      return;
    }

    const homeTeamId = homeTeam.team.id;
    const awayTeamId = awayTeam.team.id;

    const homeLogo = await getTeamLogoWithFallback(homeTeamId);
    const awayLogo = await getTeamLogoWithFallback(awayTeamId);

    // Preserve scroll position
    const playsContainer = document.querySelector('.plays-container');
    if (playsContainer) {
      playsScrollPosition = playsContainer.scrollTop;
    }

    // Sort plays in reverse chronological order (most recent first)
    const sortedPlays = [...data.items].reverse();
    
    console.log('Play order after reversal:', sortedPlays.map(play => 
      play.clock?.displayValue || 'No time'
    ));

    const playsHtml = await Promise.all(sortedPlays.map(async (play, index) => {
      const isOpen = openPlays.has(index);
      
      // Check if this is a scoring play
      const isGoalPlay = play.scoringPlay || false;
      
      // Get scores from the play data - for the last play (index 0), use previous play's scores
      let currentHomeScore, currentAwayScore;
      
      if (index === 0 && sortedPlays.length > 1) {
        // This is the last/most recent play - use the previous play's scores
        currentHomeScore = sortedPlays[1].homeScore || 0;
        currentAwayScore = sortedPlays[1].awayScore || 0;
      } else {
        // For all other plays, use their own scores
        currentHomeScore = play.homeScore || 0;
        currentAwayScore = play.awayScore || 0;
      }
      
      const period = play.period ? play.period.number || 1 : 1;
      const clock = play.clock ? play.clock.displayValue : '';
      const text = play.text || play.shortText || play.type?.text || 'No description available';
      
      // Determine if this is a scoring play
      const isScoring = isGoalPlay;

      // Get team colors using alternate color logic
      const homeColor = getTeamColorWithAlternateLogic(homeTeam.team);
      const awayColor = getTeamColorWithAlternateLogic(awayTeam.team);
      
      // Determine event type and team
      let eventType = 'gen';
      let teamSide = 'home';
      let teamColor = homeColor;
      
      if (isScoring) {
        eventType = 'goal';
      } else if (text.toLowerCase().includes('yellow card')) {
        eventType = 'card';
      } else if (text.toLowerCase().includes('red card')) {
        eventType = 'red-card';
      } else if (text.toLowerCase().includes('substitution')) {
        eventType = 'substitution';
      } else if (text.toLowerCase().includes('attempt') || text.toLowerCase().includes('saved') || text.toLowerCase().includes('blocked') || text.toLowerCase().includes('missed')) {
        eventType = 'shot';
      } else if (text.toLowerCase().includes('offside')) {
        eventType = 'offside';
      }
      
      // Determine which team using play.team
      let teamDetermined = false;
      if (play.team && play.team.$ref) {
        try {
          const teamResponse = await fetch(convertToHttps(play.team.$ref));
          const playTeam = await teamResponse.json();
          
          if (playTeam.id === awayTeamId) {
            teamSide = 'away';
            teamColor = awayColor;
            teamDetermined = true;
          } else if (playTeam.id === homeTeamId) {
            teamSide = 'home';
            teamColor = homeColor;
            teamDetermined = true;
          }
        } catch (error) {
          console.warn("Could not fetch team data for play:", error);
        }
      }
      
      // If no team could be determined, use greyish color
      if (!teamDetermined) {
        teamColor = '333';
      }

      // Extract field position coordinates
      let coordinate = null;
      let coordinate2 = null;
      
      if (play.fieldPositionX !== undefined && play.fieldPositionY !== undefined) {
        coordinate = {
          x: play.fieldPositionX,
          y: play.fieldPositionY
        };
        
        if (play.fieldPosition2X !== undefined && play.fieldPosition2Y !== undefined) {
          coordinate2 = {
            x: play.fieldPosition2X,
            y: play.fieldPosition2Y
          };
        }
      }

      const miniField = renderMiniField(coordinate, coordinate2, eventType, teamSide, `#${teamColor}`, '');

      // Render goal card for scoring plays - use actual play scores, not modified ones
      const goalCardHtml = isScoring ? 
        await renderGoalCard(play, play.team, teamColor, (teamSide === 'home' ? homeLogo : awayLogo), play.homeScore || 0, play.awayScore || 0, teamSide, homeTeam, awayTeam, gameId) : '';

      return `
        ${goalCardHtml}
        <div class="play-container ${isScoring ? 'scoring-play' : ''}" style="--team-color: #${teamColor};">
          <div class="play-header" onclick="togglePlay(${index})">
            <div class="play-main-info">
              <div class="play-teams-score">
                <div class="team-score-display">
                  <img src="${homeLogo}" alt="Home" class="team-logo-small" onerror="this.src='soccer-ball-png-24.png'">
                  <span class="score">${currentHomeScore}</span>
                </div>
                <span class="score-separator">-</span>
                <div class="team-score-display">
                  <span class="score">${currentAwayScore}</span>
                  <img src="${awayLogo}" alt="Away" class="team-logo-small" onerror="this.src='soccer-ball-png-24.png'">
                </div>
              </div>
              
              <div class="play-summary">
                <div class="play-time-period">
                  ${period ? `<span class="period">${getOrdinalSuffix(period)} Half</span>` : ''}
                  ${clock ? `<span class="clock">${clock}</span>` : ''}
                </div>
                <div class="play-description-text">${text}</div>
                ${isScoring ? `<span class="score-indicator">GOAL</span>` : ''}
              </div>
            </div>
            
            <div class="play-toggle">
              <span class="toggle-icon" id="toggle-${index}">${isOpen ? '▲' : '▼'}</span>
            </div>
          </div>
          
          <div class="play-details" id="play-${index}" style="display: ${isOpen ? 'block' : 'none'}">
            <div class="play-details-content">
              ${!isScoring ? miniField : ''}
              
              <div class="play-event-info">
                <div class="event-participant ${isScoring ? 'goal-scorer' : 'primary'}" style="--team-color: #${teamColor};">
                  <div class="player-event-info" style="border-left-color: #${teamColor} !important;">
                    <div class="player-avatar" style="background-color: #${teamColor} !important;">
                      <div style="color: white; font-size: 12px; font-weight: bold;">${eventType.toUpperCase()}</div>
                    </div>
                    <div class="event-details">
                      <div class="event-player-name">Match Event</div>
                      <div class="event-description">${text}</div>
                      ${clock ? `<span class="event-type">${period ? `${getOrdinalSuffix(period)} - ${clock}` : clock}</span>` : ''}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }));

    const playsPlaceholder = document.querySelector('.plays-placeholder');
    if (playsPlaceholder) {
      playsPlaceholder.innerHTML = `
        <h2>Plays</h2>
        <div class="plays-container">
          ${playsHtml.join('')}
        </div>
      `;
      
      // Restore scroll position
      const newPlaysContainer = playsPlaceholder.querySelector('.plays-container');
      if (newPlaysContainer && playsScrollPosition > 0) {
        newPlaysContainer.scrollTop = playsScrollPosition;
      }
      
      // Add scroll event listener to detect user scrolling
      if (newPlaysContainer) {
        newPlaysContainer.addEventListener('scroll', function() {
          isUserScrolling = true;
          
          // Clear existing timeout
          if (scrollTimeout) {
            clearTimeout(scrollTimeout);
          }
          
          // Set timeout to reset scrolling flag after user stops scrolling
          scrollTimeout = setTimeout(() => {
            isUserScrolling = false;
            console.log("User stopped scrolling - resuming updates");
          }, 500);

          // Save current scroll position
          playsScrollPosition = newPlaysContainer.scrollTop;
        });
      }
      
      // Apply team colors with !important
      applyTeamColorsToCommentary();
    }
    
  } catch (error) {
    console.error("Error loading plays:", error);
    const playsPlaceholder = document.querySelector('.plays-placeholder');
    if (playsPlaceholder) {
      playsPlaceholder.innerHTML = `
        <h2>Plays</h2>
        <div style="text-align: center; padding: 40px; color: #777;">
          <p>Plays not available for this match.</p>
        </div>
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
    openPlays.add(index);
  } else {
    playDetails.style.display = 'none';
    toggleIcon.textContent = '▼';
    openPlays.delete(index);
  }
};

// Stream functionality (adapted from NBA)
function normalizeTeamName(teamName) {
  // Special cases for specific team names
  const specialCases = {
    'paris saint germain': 'psg',
    'paris saint-germain': 'psg',
    'tottenham hotspur': 'tottenham-hotspur',
    'tottenham': 'tottenham-hotspur',
    'manchester united': 'manchester-united',
    'manchester city': 'manchester-city',
    'real madrid': 'real-madrid',
    'atletico madrid': 'atletico-madrid',
    'bayern munich': 'bayern-munich',
    'borussia dortmund': 'borussia-dortmund',
    'stade rennais': 'rennes',
    'marseille': 'olympique-marseille',
    'lafc': 'los-angeles-fc',
    'sporting kansas city': 'sporting-kc',
    'chicago fire fc': 'chicago-fire',
    'st. louis city sc': 'st-louis-city',
    'afc bournemouth': 'bournemouth',
    'bournemouth': 'bournemouth',
    'west ham united': 'west-ham-united',
    'west ham': 'west-ham-united',
    'brighton & hove albion': 'brighton',
    'brighton': 'brighton',
    'crystal palace': 'crystal-palace',
    'newcastle united': 'newcastle-united',
    'newcastle': 'newcastle-united',
    'wolverhampton wanderers': 'wolves',
    'wolves': 'wolves',
    'nottingham forest': 'nottingham-forest',
    'fulham': 'fulham',
    'burnley': 'burnley',
    'sheffield united': 'sheffield-united',
    'luton town': 'luton-town',
    'millwall': 'millwall',
    'preston north end': 'preston',
    'coventry city': 'coventry-city',
    'swansea city': 'swansea-city',
    'swansea': 'swansea-city',
    'norwich city': 'norwich-city',
    'norwich': 'norwich-city',
    'watford': 'watford',
    'sunderland': 'sunderland',
    'middlesbrough': 'middlesbrough',
    'hull city': 'hull-city',
    'cardiff city': 'cardiff-city',
    'cardiff': 'cardiff-city'
  };
  
  const lowerName = teamName.toLowerCase();
  if (specialCases[lowerName]) {
    return specialCases[lowerName];
  }
  
  // Convert team names to streaming format with proper special character handling
  return teamName.toLowerCase()
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

async function fetchLiveMatches() {
  try {
    console.log(`Fetching live matches from API...`);
    const response = await fetch(`${STREAM_API_BASE}/matches/live`);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const allMatches = await response.json();
    console.log(`Found ${allMatches.length} total live matches`);

    // Debug: Check what category values are in the API response
    if (allMatches.length > 0) {
      const uniqueCategories = [...new Set(allMatches.map(match => match.category || match.sport).filter(category => category))];
      console.log('Available categories in API:', uniqueCategories);

      // Show sample of matches with their category values
      console.log('Sample matches with category values:');
      for (let i = 0; i < Math.min(5, allMatches.length); i++) {
        const match = allMatches[i];
        const categoryValue = match.category || match.sport || 'undefined';
        console.log(`  Match ${i+1}: "${match.title}" - Category: "${categoryValue}"`);
      }
    }

    // Filter matches by category (for soccer: football or other)
    const relevantCategories = ['football', 'other'];
    const matches = allMatches.filter(match => {
      const matchCategory = match.category || match.sport;
      return relevantCategories.includes(matchCategory);
    });
    console.log(`Filtered to ${matches.length} soccer matches (${relevantCategories.join(' or ')})`);
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

    // Fetch live matches for soccer (football and other categories)
    const matches = await fetchLiveMatches();

    // Debug: Check if we got any matches and what they look like
    console.log(`After filtering: Got ${matches.length} soccer matches`);
    if (matches.length === 0) {
      console.log('No soccer matches found! This could be due to:');
      console.log('1. API category field name changed');
      console.log('2. Category value is different than expected');
      console.log('3. No football or other category matches currently live');

      // Try fallback: search all matches if no football matches found
      console.log('Trying fallback: searching all matches...');
      try {
        const allMatchesResponse = await fetch(`${STREAM_API_BASE}/matches/live`);
        if (allMatchesResponse.ok) {
          const allMatchesData = await allMatchesResponse.json();
          console.log(`Fallback: Found ${allMatchesData.length} total matches`);
          // Use all matches as fallback
          matches = allMatchesData;
        }
      } catch (fallbackError) {
        console.error('Fallback fetch failed:', fallbackError);
      }
    } else {
      console.log('Sample filtered matches:');
      for (let i = 0; i < Math.min(3, matches.length); i++) {
        const match = matches[i];
        console.log(`  ${i+1}. "${match.title}" - Sport: "${match.sport}"`);
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

    // Debug: Show first few matches to understand API format
    if (matches.length > 0) {
      console.log('Sample matches from API:');
      for (let i = 0; i < Math.min(10, matches.length); i++) {
        const match = matches[i];
        console.log(`  ${i+1}. Title: "${match.title}"`);
        if (match.teams) {
          console.log(`     Teams: ${match.teams.home?.name || 'N/A'} vs ${match.teams.away?.name || 'N/A'}`);
        }
        if (match.sources) {
          console.log(`     Sources: ${match.sources.map(s => s.source).join(', ')}`);
        }
      }
    }

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
            // Be more strict - require longer words and better matches
            const homeParts = homeNormalized.split('-').filter(word => word.length > 3); // Increased from 2 to 3
            const awayParts = awayNormalized.split('-').filter(word => word.length > 3); // Increased from 2 to 3

            let homeScore = 0;
            let awayScore = 0;

            homeParts.forEach(part => {
              if (titleWords.some(word => word.includes(part) && word.length > 2)) homeScore += 0.3;
              if (part.length > 4) homeScore += 0.2; // Bonus for longer, more specific words
            });
            awayParts.forEach(part => {
              if (titleWords.some(word => word.includes(part) && word.length > 2)) awayScore += 0.3;
              if (part.length > 4) awayScore += 0.2; // Bonus for longer, more specific words
            });

            // Require at least one significant match for each team
            if (homeParts.length > 0 && homeScore > 0) score += Math.min(homeScore, 0.8);
            if (awayParts.length > 0 && awayScore > 0) score += Math.min(awayScore, 0.8);
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
              const homeParts = homeNormalized.split('-').filter(word => word.length > 3); // Increased from 2 to 3
              const awayParts = awayNormalized.split('-').filter(word => word.length > 3); // Increased from 2 to 3

              let homeMatches = 0;
              let awayMatches = 0;

              homeParts.forEach(part => {
                if (homeApiName.includes(part) && part.length > 2) homeMatches++;
              });
              awayParts.forEach(part => {
                if (awayApiName.includes(part) && part.length > 2) awayMatches++;
              });

              // Require more specific matches
              if (homeMatches > 0 && awayMatches > 0) {
                score += 0.4; // Reduced from 0.6
              } else if (homeMatches > 0 || awayMatches > 0) {
                score += 0.2; // Reduced from 0.6
              }
            }
          }
          return score;
        },
        // Strategy 3: Soccer-specific abbreviations and common names
        () => {
          const abbreviations = {
            'tottenham': ['tottenham', 'spurs', 'tottenham-hotspur', 'hotspur', 'spurs-fc'],
            'bournemouth': ['bournemouth', 'afc-bournemouth', 'bournemouth-afc', 'cherries'],
            'manchester': ['manchester', 'manchester-united', 'manchester-city', 'man-utd', 'man-city', 'manc'],
            'united': ['united', 'man-united', 'manchester-united', 'utd', 'red-devils'],
            'city': ['city', 'man-city', 'manchester-city', 'citizens', 'sky-blues'],
            'chelsea': ['chelsea', 'chelsea-fc', 'blues', 'pensioners'],
            'arsenal': ['arsenal', 'arsenal-fc', 'gunners', 'gooners'],
            'liverpool': ['liverpool', 'liverpool-fc', 'reds', 'kop'],
            'everton': ['everton', 'everton-fc', 'toffees', 'blues'],
            'aston': ['aston-villa', 'villa', 'villans', 'claret-and-blue'],
            'west': ['west-brom', 'west-ham', 'bromwich', 'hammers', 'irons'],
            'newcastle': ['newcastle', 'newcastle-united', 'magpies', 'toon-army'],
            'brighton': ['brighton', 'brighton-hove-albion', 'seagulls', 'albion'],
            'crystal': ['crystal-palace', 'palace', 'eagles', 'glaziers'],
            'southampton': ['southampton', 'saints', 'southampton-fc'],
            'leicester': ['leicester', 'leicester-city', 'foxes', 'city-foxes'],
            'wolves': ['wolves', 'wolverhampton', 'wanderers', 'wolves-fc'],
            'fulham': ['fulham', 'fulham-fc', 'cottagers', 'whites'],
            'burnley': ['burnley', 'burnley-fc', 'clarets', 'turf-moor'],
            'sheffield': ['sheffield', 'sheffield-united', 'blades', 'sheff-utd'],
            'west-brom': ['west-brom', 'west-bromwich', 'bromwich-albion', 'baggies'],
            'west-ham': ['west-ham', 'west-ham-united', 'hammers', 'irons'],
            'norwich': ['norwich', 'norwich-city', 'canaries', 'yellows'],
            'watford': ['watford', 'watford-fc', 'hornets', 'golden-boys'],
            'brentford': ['brentford', 'brentford-fc', 'bees', 'red-lions'],
            'leeds': ['leeds', 'leeds-united', 'whites', 'peacocks'],
            'cardiff': ['cardiff', 'cardiff-city', 'bluebirds', 'city-bluebirds'],
            'swansea': ['swansea', 'swansea-city', 'swans', 'jack-army'],
            'hull': ['hull', 'hull-city', 'tigers', 'black-and-amber'],
            'middlesbrough': ['middlesbrough', 'boro', 'boro-fc', 'smoggies'],
            'stoke': ['stoke', 'stoke-city', 'potters', 'red-and-white'],
            'sunderland': ['sunderland', 'sunderland-afc', 'black-cats', 'mackems'],
            'birmingham': ['birmingham', 'birmingham-city', 'blues', 'city-blues'],
            'blackburn': ['blackburn', 'blackburn-rovers', 'rovers', 'blue-and-whites'],
            'bolton': ['bolton', 'bolton-wanderers', 'wanderers', 'trotters'],
            'charlton': ['charlton', 'charlton-athletic', 'addicks', 'red-army'],
            'derby': ['derby', 'derby-county', 'rams', 'county-rams'],
            'ipswich': ['ipswich', 'ipswich-town', 'tractor-boys', 'blues'],
            'luton': ['luton', 'luton-town', 'hatters', 'town-hatters'],
            'millwall': ['millwall', 'millwall-fc', 'lions', 'south-london'],
            'nottingham': ['nottingham', 'nottingham-forest', 'forest', 'tricky-trees'],
            'preston': ['preston', 'preston-north-end', 'north-end', 'lilywhites'],
            'reading': ['reading', 'reading-fc', 'royals', 'biscuitmen'],
            'rotherham': ['rotherham', 'rotherham-united', 'millers', 'red-millers'],
            'wigan': ['wigan', 'wigan-athletic', 'latics', 'tics']
          };

          let score = 0;
          const titleWords = matchTitle.split(/[\s\-]+/);

          // Check home team abbreviations (be more selective)
          const homeParts = homeNormalized.split('-');
          homeParts.forEach(part => {
            if (abbreviations[part]) {
              // Only give points if the abbreviation appears as a complete word, not just substring
              abbreviations[part].forEach(abbr => {
                if (titleWords.some(word => word === abbr || (word.includes(abbr) && abbr.length > 3))) {
                  score += 0.2; // Reduced from 0.3
                }
              });
            }
          });

          // Check away team abbreviations (be more selective)
          const awayParts = awayNormalized.split('-');
          awayParts.forEach(part => {
            if (abbreviations[part]) {
              // Only give points if the abbreviation appears as a complete word, not just substring
              abbreviations[part].forEach(abbr => {
                if (titleWords.some(word => word === abbr || (word.includes(abbr) && abbr.length > 3))) {
                  score += 0.2; // Reduced from 0.3
                }
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

        // Early exit if we find a very good match (increased threshold to prevent wrong matches)
        if (bestScore >= 2.0) {
          console.log(`Found excellent match with score ${bestScore}, stopping search early`);
          break;
        }
      }
    }

    if (!bestMatch || bestScore < 0.5) { // Increased from 0.3 to 0.5 for stricter matching
      console.log(`No good matching live match found in API (best score: ${bestScore.toFixed(2)})`);
      console.log(`Searched for: ${homeNormalized} vs ${awayNormalized}`);
      console.log(`Processed: ${matchesToProcess.length} matches out of ${matches.length} total`);
      return {};
    }

    console.log(`Found matching match: ${bestMatch.title} (score: ${bestScore.toFixed(2)})`);

    // VALIDATION: Ensure the matched game actually contains both teams with stricter checking
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

    // Additional validation: ensure the matched teams are actually relevant
    // For example, if we're looking for "Manchester City", don't match "Montevideo City Torque"
    let relevantHomeMatches = 0;
    let relevantAwayMatches = 0;

    homeWords.forEach(word => {
      if (matchedTitle.includes(word) || matchedHomeTeam.includes(word)) relevantHomeMatches++;
    });
    awayWords.forEach(word => {
      if (matchedTitle.includes(word) || matchedAwayTeam.includes(word)) relevantAwayMatches++;
    });

    // Require at least 50% of significant words to match for each team
    const homeRelevanceRatio = relevantHomeMatches / Math.max(1, homeWords.length);
    const awayRelevanceRatio = relevantAwayMatches / Math.max(1, awayWords.length);

    if (!homeInTitle || !awayInTitle || homeRelevanceRatio < 0.5 || awayRelevanceRatio < 0.5) {
      console.log(`WARNING: Matched game "${bestMatch.title}" doesn't contain both teams or isn't relevant enough!`);
      console.log(`Expected: ${homeNormalized} vs ${awayNormalized}`);
      console.log(`Found in title: Home=${homeInTitle}, Away=${awayInTitle}`);
      console.log(`API teams: Home="${matchedHomeTeam}", Away="${matchedAwayTeam}"`);
      console.log(`Relevance: Home=${homeRelevanceRatio.toFixed(2)}, Away=${awayRelevanceRatio.toFixed(2)}`);

      // Reject the match if validation fails
      console.log('Rejecting match due to validation failure - teams do not match or are not relevant');
      return {};
    } else {
      console.log(`✓ Validation passed: Matched game contains both teams and is relevant`);
      console.log(`Relevance scores: Home=${homeRelevanceRatio.toFixed(2)}, Away=${awayRelevanceRatio.toFixed(2)}`);
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
    
    // Get the HTML from renderStreamEmbed and set it to the container
    const streamHTML = renderStreamEmbed(gameId);
    const streamContainer = document.getElementById('stream-container');
    if (streamContainer && streamHTML) {
      streamContainer.innerHTML = streamHTML;
      console.log('Soccer switchToStream: Updated stream container with new HTML');
    } else {
      console.error('Soccer switchToStream: Stream container not found or no HTML returned');
    }
    
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
      button1.onclick = () => switchToStream('alpha2');
    }
    if (button2) {
      button2.textContent = availableStreams.bravo ? 'Stream Bravo' : 'Try Bravo';
      button2.onclick = () => switchToStream('bravo');
    }
  } else if (currentType === 'alpha2') {
    if (button1) {
      button1.textContent = availableStreams.alpha ? 'Stream Alpha 1' : 'Try Alpha 1';
      button1.onclick = () => switchToStream('alpha1');
    }
    if (button2) {
      button2.textContent = availableStreams.bravo ? 'Stream Bravo' : 'Try Bravo';
      button2.onclick = () => switchToStream('bravo');
    }
  } else if (currentType === 'bravo') {
    if (button1) {
      button1.textContent = availableStreams.alpha ? 'Stream Alpha 1' : 'Try Alpha 1';
      button1.onclick = () => switchToStream('alpha1');
    }
    if (button2) {
      button2.textContent = availableStreams.alpha ? 'Stream Alpha 2' : 'Try Alpha 2';
      button2.onclick = () => switchToStream('alpha2');
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

async function renderStreamEmbed(gameId) {
  console.log('Soccer renderStreamEmbed called with gameId:', gameId);
  
  const streamContainer = document.getElementById("streamEmbed");
  if (!streamContainer) {
    console.error('Soccer Stream container not found! Cannot render stream.');
    return;
  }

  console.log('Soccer Stream container found, checking game progress...');

  // Check if game is in progress before showing stream
  // Get game state from the current page data
  const gameClockElement = document.querySelector('.game-clock');
  const gameStatus = gameClockElement ? gameClockElement.textContent.trim() : '';

  console.log('Soccer Stream check:', { gameStatus, gameClockElement: !!gameClockElement });

  // Only show stream for in-progress games (not scheduled or finished)
  const isGameInProgress = gameStatus &&
    !gameStatus.toLowerCase().includes('final') &&
    !gameStatus.toLowerCase().includes('full time') &&
    !gameStatus.toLowerCase().includes('scheduled') &&
    gameStatus !== 'N/A' &&
    gameStatus !== '';

  console.log('Soccer isGameInProgress:', isGameInProgress);

  if (!isGameInProgress) {
    console.log('Soccer Game is not in progress, clearing stream container');
    streamContainer.innerHTML = '';
    return;
  }

  console.log('Soccer Game is in progress, proceeding with stream rendering...');

  // Get team names from global data first, then API if needed
  let homeTeamName = '';
  let awayTeamName = '';

  // Try to use globally stored data first
  if (window.currentGameData && window.currentGameData.__gamepackage__) {
    const homeTeam = window.currentGameData.__gamepackage__.homeTeam.team;
    const awayTeam = window.currentGameData.__gamepackage__.awayTeam.team;

    homeTeamName = homeTeam.displayName;
    awayTeamName = awayTeam.displayName;

    console.log('Stream Debug - Using global data - Home team:', homeTeamName);
    console.log('Stream Debug - Using global data - Away team:', awayTeamName);
  } else {
    // Fallback to API call if global data not available
    try {
      const SCOREBOARD_API_URL = `https://cdn.espn.com/core/soccer/lineups?xhr=1&gameId=${gameId}`;
      const response = await fetch(SCOREBOARD_API_URL);
      const scoreboardData = await response.json();

      const homeTeam = scoreboardData.__gamepackage__.homeTeam.team;
      const awayTeam = scoreboardData.__gamepackage__.awayTeam.team;

      homeTeamName = homeTeam.displayName;
      awayTeamName = awayTeam.displayName;

      console.log('Stream Debug - API call - Home team:', homeTeamName);
      console.log('Stream Debug - API call - Away team:', awayTeamName);

    } catch (error) {
      console.error('Error fetching team names for stream:', error);
      // Final fallback to DOM scraping
      const homeTeamElement = document.querySelector('.team-name');
      const awayTeamElement = document.querySelectorAll('.team-name')[1];

      if (!homeTeamElement || !awayTeamElement) {
        streamContainer.innerHTML = '';
        return;
      }

      homeTeamName = homeTeamElement.textContent.trim();
      awayTeamName = awayTeamElement.textContent.trim();
      console.log('Stream Debug - DOM fallback - Home team:', homeTeamName);
      console.log('Stream Debug - DOM fallback - Away team:', awayTeamName);
    }
  }

  // Store current team names for toggle function
  currentAwayTeam = awayTeamName;
  currentHomeTeam = homeTeamName;

  console.log('Storing team names in renderStreamEmbed:', homeTeamName, 'vs', awayTeamName);
  console.log('Current stored names - Home:', currentHomeTeam, 'Away:', currentAwayTeam);

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
      <div class="stream-header" style="margin-bottom: 10px; text-align: center;">
        <h3 style="color: white; margin: 0;">Live Stream (${currentStreamType.toUpperCase()})</h3>
        <div class="stream-controls" style="margin-top: 10px;">
          <button id="fullscreenButton" onclick="toggleFullscreen()" style="padding: 8px 16px; margin: 0 5px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">⛶ Fullscreen</button>
          <button id="streamButton1" onclick="${button1Action}" style="padding: 8px 16px; margin: 0 5px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">${button1Text}</button>
          <button id="streamButton2" onclick="${button2Action}" style="padding: 8px 16px; margin: 0 5px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">${button2Text}</button>
        </div>
      </div>
      <div id="streamConnecting" style="display: block; color: white; padding: 20px; background: #333; margin-bottom: 10px;">
        <p>Loading stream... <span id="streamStatus"></span></p>
      </div>
      <div class="stream-iframe-container" style="position: relative; width: 100%; margin: 0 auto; overflow: hidden; isolation: isolate;">
        <iframe
          id="streamIframe"
          src="${embedUrl}"
          width="100%"
          height="${screenHeight}"
          style="aspect-ratio: 16/9; background: #000; display: none; margin-bottom: 50px; isolation: isolate; will-change: auto; backface-visibility: hidden; transform: translateZ(0);"
          frameborder="0"
          allowfullscreen
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          referrerpolicy="no-referrer-when-downgrade"
          onload="handleStreamLoad()"
          onerror="handleStreamError()"
          title="${homeTeamName} vs ${awayTeamName} Player">
        </iframe>
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
  console.log('Soccer renderStreamEmbed returning HTML content (length:', streamHTML.length, ')');
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

  console.log('Stream iframe loaded successfully');

  // Hide connecting message and show iframe
  if (connectingDiv) {
    connectingDiv.style.display = 'none';
  }
  if (iframe) {
    iframe.style.display = 'block';
  }
};

window.handleStreamError = function() {
  const connectingDiv = document.getElementById('streamConnecting');
  const iframe = document.getElementById('streamIframe');

  console.error('Stream failed to load');

  if (connectingDiv) {
    connectingDiv.innerHTML = `
      <p style="color: #ff6b6b;">⚠️ Stream temporarily unavailable</p>
      <p style="font-size: 0.9em; color: #ccc;">This can happen due to:</p>
      <ul style="font-size: 0.8em; color: #ccc; text-align: left; margin: 10px 0;">
        <li>• Network restrictions</li>
        <li>• Streaming service maintenance</li>
        <li>• Match not yet available</li>
      </ul>
      <p style="font-size: 0.9em; color: #ccc;">Try switching to another stream or refresh the page.</p>
    `;
    connectingDiv.style.display = 'block';
  }

  // Hide the iframe if it's showing an error
  if (iframe) {
    iframe.style.display = 'none';
  }
};

// Function to open match page in new window
window.openMatchPage = function(matchId) {
  if (matchId) {
    const matchUrl = `${window.location.origin}/soccer/scoreboard.html?gameId=${matchId}`;
    window.open(matchUrl, '_blank');
  }
};

// Content slider functions
window.showLineup = function() {
  // Update button states
  document.getElementById('lineupBtn').classList.add('active');
  document.getElementById('statsBtn').classList.remove('active');
  document.getElementById('playsBtn').classList.remove('active');
  
  // Show/hide content sections
  document.getElementById('lineupContent').classList.add('active');
  document.getElementById('statsContent').classList.remove('active');
  document.getElementById('playsContent').classList.remove('active');
  
  // Fetch lineup data when switching to lineup tab
  const gameId = getQueryParam("gameId");
  if (gameId) {
    fetchAndRenderStatsData(gameId).catch(console.error);
  }
  
  // Show stream when on lineup tab
  const streamContainer = document.getElementById("streamEmbed");
  console.log('Soccer showLineup - Stream check:', { streamContainer: !!streamContainer, gameId, streamInitialized });
  
  if (streamContainer && gameId && !streamInitialized) {
    console.log('Soccer showLineup - Initializing stream...');
    renderStreamEmbed(gameId).catch(console.error);
    streamInitialized = true;
    console.log('Soccer showLineup - Stream initialized');
  } else {
    console.log('Soccer showLineup - Stream conditions not met or already initialized');
  }
};

window.showStats = function() {
  // Update button states
  document.getElementById('statsBtn').classList.add('active');
  document.getElementById('lineupBtn').classList.remove('active');
  document.getElementById('playsBtn').classList.remove('active');
  
  // Show/hide content sections
  document.getElementById('statsContent').classList.add('active');
  document.getElementById('lineupContent').classList.remove('active');
  document.getElementById('playsContent').classList.remove('active');
  
  // Fetch match stats data when switching to stats tab
  const gameId = getQueryParam("gameId");
  if (gameId) {
    fetchAndRenderMatchStats(gameId).catch(console.error);
  }
};

window.showPlays = function() {
  // Update button states
  document.getElementById('playsBtn').classList.add('active');
  document.getElementById('lineupBtn').classList.remove('active');
  document.getElementById('statsBtn').classList.remove('active');
  
  // Show/hide content sections
  document.getElementById('statsContent').classList.remove('active');
  document.getElementById('lineupContent').classList.remove('active');
  document.getElementById('playsContent').classList.add('active');
  
  // Fetch plays data when switching to plays tab
  const gameId = getQueryParam("gameId");
  if (gameId) {
    fetchAndRenderPlaysData(gameId).catch(console.error);
  }
};

// Fetch and render the scoreboard based on the gameId in the URL
fetchAndRenderTopScoreboard();
setInterval(fetchAndRenderTopScoreboard, 6000);

// Initialize stream on page load
const gameId = getQueryParam("gameId");
console.log('Soccer page load - Stream check:', { gameId, streamInitialized });

if (gameId && !streamInitialized) {
  console.log('Soccer page load - Initializing stream after delay...');
  // Load stream after a short delay to ensure DOM is ready
  setTimeout(() => {
    console.log('Soccer page load - Calling renderStreamEmbed...');
    renderStreamEmbed(gameId).catch(console.error);
    streamInitialized = true;
    console.log('Soccer page load - Stream initialized');
  }, 1000);
} else {
  console.log('Soccer page load - Stream conditions not met or already initialized');
}

document.addEventListener("mouseover", (event) => {
  const hoverTarget = event.target.closest("[data-hover-id]");
  if (hoverTarget) {
    const hoverCardId = hoverTarget.getAttribute("data-hover-id");
    const hoverCard = document.getElementById(hoverCardId);
    if (hoverCard) {
      const rect = hoverTarget.getBoundingClientRect();
      hoverCard.style.display = "block";
      hoverCard.style.top = `${rect.top + window.scrollY - hoverCard.offsetHeight - 10}px`;
      hoverCard.style.left = `${rect.left + window.scrollX + hoverTarget.offsetWidth / 2 - hoverCard.offsetWidth / 2}px`;
    }
  }
});

document.addEventListener("mouseout", (event) => {
  const hoverTarget = event.target.closest("[data-hover-id]");
  if (hoverTarget) {
    const hoverCardId = hoverTarget.getAttribute("data-hover-id");
    const hoverCard = document.getElementById(hoverCardId);
    if (hoverCard) {
      hoverCard.style.display = "none";
    }
  }
});

// Function to copy goal card as image (similar to MLB scoreboard)
async function copyGoalCardAsImage(goalCardId) {
  try {
    const goalElement = document.getElementById(goalCardId);
    if (!goalElement) {
      console.error('Goal card not found');
      return;
    }

    // Import html2canvas dynamically
    if (!window.html2canvas) {
      // Load html2canvas library
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      script.onload = () => {
        captureAndCopyGoalCard(goalElement);
      };
      document.head.appendChild(script);
    } else {
      captureAndCopyGoalCard(goalElement);
    }
  } catch (error) {
    console.error('Error copying goal card as image:', error);
    showGoalCardFeedback('Error copying image', 'error');
  }
}

async function captureAndCopyGoalCard(element) {
  try {
    showGoalCardFeedback('Capturing image...', 'loading');
    
    // Replace all external images with base64 versions or remove them
    const images = element.querySelectorAll('img');

    for (const img of images) {
      try {
        // For soccer logos and images, convert to base64 for html2canvas compatibility
        if (img.src.includes('espncdn.com') || img.src.includes('http')) {
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
                  img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjNjY2Ii8+PC9zdmc+';
                }
                resolve();
              } catch (error) {
                // Fallback to placeholder
                img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjNjY2Ii8+PC9zdmc+';
                resolve();
              }
            };
            
            tempImg.onerror = () => {
              // Use placeholder on error
              img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjNjY2Ii8+PC9zdmc+';
              resolve();
            };
            
            tempImg.src = img.src;
          });
        }
      } catch (error) {
        console.warn('Could not process image:', img.src, error);
      }
    }

    const isSmallScreen = window.innerWidth < 525;
    const heightAdjustment = isSmallScreen ? 0 : 20;

    // Adjust event marker sizes similar to NBA shot marker adjustments
    const eventMarkers = element.querySelectorAll('.event-marker');
    eventMarkers.forEach(marker => {
      // Only modify size, preserve all existing positioning and color styles
      marker.style.width = '12px';
      marker.style.height = '12px';
    });

    const ballEndMarkers = element.querySelectorAll('.event-marker.ball-end');
    ballEndMarkers.forEach(marker => {
      // Adjust ball-end markers to be slightly larger for visibility
      marker.style.width = '10px';
      marker.style.height = '10px';
    });

    // Adjust trajectory line positioning for copy card
    const trajectorySvgs = element.querySelectorAll('svg');
    trajectorySvgs.forEach(svg => {
      // Check if this SVG contains a trajectory line
      if (svg.querySelector('line')) {
        // Move the trajectory line up by 5px for better alignment in copy card
        svg.style.top = '-0.8px';
      }
    });

    // Capture the element with html2canvas
    const canvas = await html2canvas(element, {
      backgroundColor: '#1a1a1a', // Set the actual background color
      scale: 5, // Use scale 5 to avoid logo scaling issues
      useCORS: true,
      allowTaint: false, // Allow tainted canvas for better compatibility
      logging: false,
      width: isSmallScreen ? element.clientWidth : element.clientWidth,
      height: isSmallScreen ? element.clientHeight : element.clientHeight + heightAdjustment,
      scrollX: 0,
      scrollY: 0,
      ignoreElements: (element) => {
        try {
          // Ignore the copy button itself
          if (element && element.getAttribute && element.getAttribute('onclick') && 
              element.getAttribute('onclick').includes('copyGoalCardAsImage')) {
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
        showGoalCardFeedback('Failed to create image', 'error');
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
          link.download = `goal-card-${new Date().getTime()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          showGoalCardFeedback('Goal card downloaded!', 'success');
        } else {
          // On desktop, try to copy to clipboard using modern API
          if (navigator.clipboard && window.ClipboardItem) {
            const clipboardItem = new ClipboardItem({
              'image/png': blob
            });
            await navigator.clipboard.write([clipboardItem]);
            showGoalCardFeedback('Goal card copied to clipboard!', 'success');
          } else {
            showGoalCardFeedback('Could not copy to clipboard. Try again', 'error');
          }
        }
      } catch (clipboardError) {
        showGoalCardFeedback('Could not copy to clipboard. Try again', 'error');
      }
    }, 'image/png', 0.95);
    
  } catch (error) {
    console.error('Error capturing goal card:', error);
    showGoalCardFeedback('Failed to capture image: ' + error.message, 'error');
  }
}

function showGoalCardFeedback(message, type) {
  // Remove any existing feedback
  const existingFeedback = document.getElementById('goal-card-feedback');
  if (existingFeedback) {
    existingFeedback.remove();
  }

  // Create new feedback element
  const feedback = document.createElement('div');
  feedback.id = 'goal-card-feedback';
  feedback.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 6px;
    color: white;
    font-weight: bold;
    font-size: 14px;
    z-index: 10000;
    animation: slideInRight 0.3s ease-out;
    max-width: 300px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;

  // Set background color based on type
  if (type === 'success') {
    feedback.style.backgroundColor = '#28a745';
  } else if (type === 'error') {
    feedback.style.backgroundColor = '#dc3545';
  } else if (type === 'loading') {
    feedback.style.backgroundColor = '#007bff';
    message = '🔄 ' + message;
  }

  feedback.textContent = message;
  document.body.appendChild(feedback);

  // Add CSS animation
  if (!document.getElementById('goal-card-feedback-styles')) {
    const style = document.createElement('style');
    style.id = 'goal-card-feedback-styles';
    style.textContent = `
      @keyframes slideInRight {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Auto-remove after 3 seconds (except for loading)
  if (type !== 'loading') {
    setTimeout(() => {
      if (feedback && feedback.parentNode) {
        feedback.style.animation = 'slideInRight 0.3s ease-out reverse';
        setTimeout(() => {
          if (feedback && feedback.parentNode) {
            feedback.remove();
          }
        }, 300);
      }
    }, 3000);
  }
}

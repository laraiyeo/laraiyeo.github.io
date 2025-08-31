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

async function fetchAndRenderPlaysData(gameId) {
  try {
    // Skip update if user is actively scrolling in plays section
    if (isUserScrolling) {
      console.log("Skipping plays update - user is scrolling");
      return;
    }
    
    // Only fetch commentary data for plays
    const COMMENTARY_API_URL = `https://cdn.espn.com/core/soccer/commentary?xhr=1&gameId=${gameId}`;
    const commentaryResponse = await fetch(COMMENTARY_API_URL);
    
    if (!commentaryResponse.ok) {
      throw new Error(`Commentary API responded with status: ${commentaryResponse.status}`);
    }
    
    const commentaryData = await commentaryResponse.json();
    
    // Store commentary data globally for play-by-play rendering
    window.currentCommentaryData = commentaryData;
    
    // Also ensure we have lineup data for goal card stats (if not already available)
    if (!window.currentGameData || !window.currentGameData.rosters) {
      try {
        const LINEUP_API_URL = `https://cdn.espn.com/core/soccer/lineups?xhr=1&gameId=${gameId}`;
        const lineupResponse = await fetch(LINEUP_API_URL);
        if (lineupResponse.ok) {
          const lineupData = await lineupResponse.json();
          // Store the roster data from lineups for goal card stats
          if (lineupData.gamepackageJSON && lineupData.gamepackageJSON.rosters) {
            if (!window.currentGameData) window.currentGameData = {};
            window.currentGameData.rosters = lineupData.gamepackageJSON.rosters;
          }
        }
      } catch (error) {
        console.warn("Could not fetch lineup data for goal card stats:", error);
      }
    }
    
    // Update play-by-play if it's visible
    const playsContent = document.getElementById('playsContent');
    if (playsContent && playsContent.classList.contains('active')) {
      renderPlayByPlay(gameId, commentaryData);
    }
  } catch (error) {
    console.error("Error fetching commentary data:", error);
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
function renderGoalCard(play, team, teamColor, teamLogo, homeScore, awayScore, teamSide, homeTeam, awayTeam) {
  const playData = play.play || play;
  const scorer = playData.participants?.[0]?.athlete || null;
  const assister = playData.participants?.[1]?.athlete || null;
  
  if (!scorer) return '';
  
  const scorerName = scorer.displayName || 'Unknown Player';
  const assisterName = assister ? assister.displayName : null;
  const minute = play.time?.displayValue || play.clock?.displayValue || '';
  const goalType = play.text?.toLowerCase().includes('penalty') ? 'Penalty Goal' : 'Goal';
  
  // Get team abbreviation for the scorer
  const scoringTeam = teamSide === 'home' ? homeTeam : awayTeam;
  const teamAbbr = scoringTeam?.team?.abbreviation || scoringTeam?.abbreviation || '';
  
  // Extract field position coordinates for mini field (reverted to original)
  let coordinate = null;
  let coordinate2 = null;
  
  if (playData.fieldPositionX !== undefined && playData.fieldPositionY !== undefined) {
    coordinate = {
      x: playData.fieldPositionX,
      y: playData.fieldPositionY
    };
    
    if (playData.fieldPosition2X !== undefined && playData.fieldPosition2Y !== undefined) {
      coordinate2 = {
        x: playData.fieldPosition2X,
        y: playData.fieldPosition2Y
      };
    }
  }
  
  // Get scorer stats from commentary roster data
  let scorerStats = {
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    yellowCards: 0,
    redCards: 0
  };
  
  // Get stats from the commentary roster data
  try {
    // Access the global roster data that should be available
    if (window.currentGameData && window.currentGameData.rosters) {
      const rosters = window.currentGameData.rosters;
      
      for (const roster of rosters) {
        if (roster.roster && Array.isArray(roster.roster)) {
          // Match by athlete displayName or fullName
          const player = roster.roster.find(p => 
            p.athlete && (
              p.athlete.displayName === scorer.displayName ||
              p.athlete.fullName === scorer.displayName ||
              p.athlete.id === scorer.id
            )
          );
          if (player && player.stats) {
            const stats = player.stats.reduce((acc, stat) => {
              acc[stat.abbreviation] = stat.displayValue;
              return acc;
            }, {});
            
            scorerStats = {
              goals: stats["G"] || 0,
              assists: stats["A"] || 0,
              shots: stats["SH"] || 0,
              shotsOnTarget: stats["ST"] || stats["SG"] || 0, // Try both ST and SG
              yellowCards: stats["YC"] || 0,
              redCards: stats["RC"] || 0
            };
            break;
          }
        }
      }
    }
  } catch (error) {
    console.log('Goal Card Debug - Error retrieving stats:', error);
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
  const homeTeamLogo = logoCache.get(homeTeam?.team?.id || homeTeam?.id) || 
                       `https://a.espncdn.com/i/teamlogos/soccer/500/${homeTeam?.team?.id || homeTeam?.id}.png`;
  const awayTeamLogo = logoCache.get(awayTeam?.team?.id || awayTeam?.id) || 
                       `https://a.espncdn.com/i/teamlogos/soccer/500/${awayTeam?.team?.id || awayTeam?.id}.png`;
  
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
                ${assisterName}
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

async function renderPlayByPlay(gameId, existingCommentaryData = null) {
  try {
    let data;
    
    // Use existing data if provided, otherwise fetch it
    if (existingCommentaryData) {
      data = existingCommentaryData;
    } else {
      const COMMENTARY_API_URL = `https://cdn.espn.com/core/soccer/commentary?xhr=1&gameId=${gameId}`;
      
      let response;
      try {
        response = await fetch(COMMENTARY_API_URL);
        if (!response.ok) {
          throw new Error(`Commentary API responded with status: ${response.status}`);
        }
        data = await response.json();
      } catch (fetchError) {
        console.warn("Failed to fetch commentary data (CORS or network issue):", fetchError.message);
        
        // Hide play-by-play section and show message
        const playsContainer = document.querySelector('.plays-container');
        if (playsContainer) {
          playsContainer.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #777;">
              <p>Play-by-play commentary is currently unavailable</p>
              <p style="font-size: 0.9em;">This may be due to CORS restrictions or network issues</p>
            </div>
          `;
        }
        return; // Exit early if commentary fetch fails
      }
    }
    
    if (!data.gamepackageJSON || !data.gamepackageJSON.commentary) {
      console.warn("No commentary data available in response");
      const playsContainer = document.querySelector('.plays-container');
      if (playsContainer) {
        playsContainer.innerHTML = `
          <div style="text-align: center; padding: 20px; color: #777;">
            <p>No commentary data available for this match</p>
          </div>
        `;
      }
      return;
    }

    const commentary = data.gamepackageJSON.commentary;
    const homeTeam = data.gamepackageJSON.header.competitions[0].competitors[0];
    const awayTeam = data.gamepackageJSON.header.competitions[1] || data.gamepackageJSON.header.competitions[0].competitors[1];
    
    const homeTeamId = homeTeam.team.id;
    const awayTeamId = awayTeam.team.id;
    const homeScore = parseInt(homeTeam.score || "0");
    const awayScore = parseInt(awayTeam.score || "0");

    const homeLogo = await getTeamLogoWithFallback(homeTeamId);
    const awayLogo = await getTeamLogoWithFallback(awayTeamId);

    // Preserve scroll position
    const playsContainer = document.querySelector('.plays-container');
    if (playsContainer) {
      playsScrollPosition = playsContainer.scrollTop;
    }

    // Simply reverse the commentary array to show most recent plays first
    const sortedCommentary = [...commentary].reverse();
    
    console.log('Play order after reversal:', sortedCommentary.map(play => 
      play.time?.displayValue || play.clock?.displayValue || 
      (play.play && (play.play.time?.displayValue || play.play.clock?.displayValue)) || 'No time'
    ));
    
    // Track score throughout the match using counter logic based on type.text
    let homeGoalCount = 0;
    let awayGoalCount = 0;
    
    // First pass: process all plays to count goals based on type.text field
    const goalEvents = [];
    
    // Sort commentary in chronological order (oldest first) for proper goal counting
    const chronologicalCommentary = [...sortedCommentary].sort((a, b) => {
      // Sort by sequence number if available (ascending for chronological order)
      if (a.sequence !== undefined && b.sequence !== undefined) {
        return a.sequence - b.sequence;
      }
      
      // Fallback to clock.value if no sequence (ascending for chronological order)
      const aClock = a.clock || (a.play && a.play.clock);
      const bClock = b.clock || (b.play && b.play.clock);
      
      if (aClock && bClock && aClock.value !== undefined && bClock.value !== undefined) {
        return aClock.value - bClock.value; // Lower clock value = earlier
      }
      
      // Final fallback: maintain original order
      return 0;
    });
    
    chronologicalCommentary.forEach(play => {
      const playData = play.play || play;
      
      // Check for goal using type.id field (70, 137, 98, 173 for goals, 97 for own goals)
      const isGoal = playData.type && playData.type.id &&
                     ['70', '137', '98', '173', '97'].includes(playData.type.id.toString());

      // Check if this is an own goal (ID 97)
      const isOwnGoal = playData.type && playData.type.id && playData.type.id.toString() === '97';

      // Check for goal deletion/overturned
      const isGoalDeleted = playData.text && playData.text.toLowerCase().includes('deleted after review');

      if (isGoal) {
        // Determine which team scored using team.displayName
        let scoringTeam = null;

        if (playData.team && playData.team.displayName) {
          if (playData.team.displayName === homeTeam.team.displayName) {
            scoringTeam = 'home';
          } else if (playData.team.displayName === awayTeam.team.displayName) {
            scoringTeam = 'away';
          }
        }
        if (scoringTeam === 'home') {
          homeGoalCount++;
        } else if (scoringTeam === 'away') {
          awayGoalCount++;
        }

        goalEvents.push({
          sequence: play.sequence || null,
          clockValue: (play.clock || (play.play && play.play.clock))?.value || null,
          homeScoreAfter: homeGoalCount,
          awayScoreAfter: awayGoalCount,
          scoringTeam: scoringTeam,
          isOwnGoal: isOwnGoal
        });
      } else if (isGoalDeleted) {
        // Handle deleted/overturned goals - subtract from the appropriate team
        if (playData.team && playData.team.displayName) {
          if (playData.team.displayName === homeTeam.team.displayName && homeGoalCount > 0) {
            homeGoalCount--;
          } else if (playData.team.displayName === awayTeam.team.displayName && awayGoalCount > 0) {
            awayGoalCount--;
          }

          goalEvents.push({
            sequence: play.sequence || null,
            clockValue: (play.clock || (play.play && play.play.clock))?.value || null,
            homeScoreAfter: homeGoalCount,
            awayScoreAfter: awayGoalCount,
            isDeleted: true
          });
        }
      }
    });

    // Function to get score at any given sequence or clock value
    function getScoreAtSequence(play) {
      const playSequence = play.sequence;
      const playClockValue = (play.clock || (play.play && play.play.clock))?.value;
      
      // Find the most recent goal event before or at this play
      let mostRecentGoal = null;
      for (const goal of goalEvents) {
        let isBeforeOrAtThisPlay = false;
        
        // Compare by sequence if both have sequence numbers
        if (playSequence !== undefined && goal.sequence !== undefined) {
          isBeforeOrAtThisPlay = goal.sequence <= playSequence;
        }
        // Compare by clock value if no sequence numbers
        else if (playClockValue !== undefined && goal.clockValue !== undefined) {
          isBeforeOrAtThisPlay = goal.clockValue <= playClockValue;
        }
        // If only one has sequence/clock, use what's available
        else if (goal.sequence !== undefined && playSequence !== undefined) {
          isBeforeOrAtThisPlay = goal.sequence <= playSequence;
        }
        else if (goal.clockValue !== undefined && playClockValue !== undefined) {
          isBeforeOrAtThisPlay = goal.clockValue <= playClockValue;
        }
        
        if (isBeforeOrAtThisPlay) {
          mostRecentGoal = goal;
        } else {
          break; // Goals are sorted, so no need to continue
        }
      }
      
      if (mostRecentGoal) {
        return { home: mostRecentGoal.homeScoreAfter, away: mostRecentGoal.awayScoreAfter };
      } else {
        return { home: 0, away: 0 }; // Score before any goals
      }
    }

    const playsHtml = sortedCommentary.map((play, index) => {
      const isOpen = openPlays.has(index);
      
      // Handle nested play structure - check if play.play exists
      const playData = play.play || play;
      
      // Check if this is a goal play using type.id field (70, 137, or 98)
      const isGoalPlay = playData.type && playData.type.id && 
                         ['70', '137', '98', '173', '97'].includes(playData.type.id.toString());
      
      // Get the score at the time of this play using our counter logic
      let scoreAtThisTime = getScoreAtSequence(play);
      
      // Use the calculated scores for display
      const currentHomeScore = scoreAtThisTime.home;
      const currentAwayScore = scoreAtThisTime.away;
      
      const period = playData.period ? playData.period.number || playData.period.displayValue : '';
      const clock = play.time ? play.time.displayValue : '';
      const text = play.text || 'No description available';
      
      // Determine if this is a scoring play using the isGoalPlay we already calculated
      const isScoring = isGoalPlay;

      // Fix goalText to use correct nested structure
      const goalText = isScoring && playData.participants && playData.participants[1] 
        ? playData.shortText + ' Assisted by ' + playData.participants[1].athlete.displayName 
        : playData.shortText || text;
      
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
      
      // Determine which team - use playData.team if available, otherwise fallback to text analysis
      let teamDetermined = false;
      if (playData.team && playData.team.displayName) {
        if (playData.team.displayName === awayTeam.team.displayName) {
          teamSide = 'away';
          teamColor = awayColor;
          teamDetermined = true;
        } else {
          teamSide = 'home';
          teamColor = homeColor;
          teamDetermined = true;
        }
      } else {
        // Fallback: try to determine from text content
        if (text.includes(awayTeam.team.displayName) || text.includes(awayTeam.team.shortDisplayName)) {
          teamSide = 'away';
          teamColor = awayColor;
          teamDetermined = true;
        } else if (text.includes(homeTeam.team.displayName) || text.includes(homeTeam.team.shortDisplayName)) {
          teamSide = 'home';
          teamColor = homeColor;
          teamDetermined = true;
        }
      }
      
      // Handle own goals - reverse the team for display purposes
      if (teamDetermined && isScoring && playData.type && playData.type.id && playData.type.id.toString() === '97') {
        // Reverse the team assignment for own goals
        if (teamSide === 'away') {
          teamSide = 'home';
          teamColor = homeColor;
        } else {
          teamSide = 'away';
          teamColor = awayColor;
        }
        console.log(`Own goal display: Original team ${playData.team.displayName}, displaying as ${teamSide} team`);
      }
      
      // If no team could be determined, use greyish color
      if (!teamDetermined) {
        teamColor = '333'; // Greyish color for undetermined team events
      }

      // Extract field position coordinates based on event type
      let coordinate = null;
      let coordinate2 = null; // For ball end position
      
      if (playData.fieldPositionX !== undefined && playData.fieldPositionY !== undefined) {
        // Player position (always available)
        coordinate = {
          x: playData.fieldPositionX,
          y: playData.fieldPositionY
        };
        
        // Ball end position (for goals and attempts)
        if (playData.fieldPosition2X !== undefined && playData.fieldPosition2Y !== undefined) {
          coordinate2 = {
            x: playData.fieldPosition2X,
            y: playData.fieldPosition2Y
          };
        }
      }

      const miniField = renderMiniField(coordinate, coordinate2, eventType, teamSide, `#${teamColor}`, playData.team?.displayName || '');

      return `
        ${isScoring ? renderGoalCard(play, playData.team, teamColor, (teamSide === 'home' ? homeLogo : awayLogo), currentHomeScore, currentAwayScore, teamSide, homeTeam, awayTeam) : ''}
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
                      <div class="event-description">${goalText}</div>
                      ${clock ? `<span class="event-type">${period ? `${getOrdinalSuffix(period)} - ${clock}` : clock}</span>` : ''}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const playsPlaceholder = document.querySelector('.plays-placeholder');
    if (playsPlaceholder) {
      playsPlaceholder.innerHTML = `
        <h2>Commentary</h2>
        <div class="plays-container">
          ${playsHtml}
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
          }, 500); // Wait 0.5 seconds after scrolling stops

          // Save current scroll position
          playsScrollPosition = newPlaysContainer.scrollTop;
        });
      }
      
      // Apply team colors with !important
      applyTeamColorsToCommentary();
    }
    
  } catch (error) {
    console.error("Error loading commentary:", error);
    const playsPlaceholder = document.querySelector('.plays-placeholder');
    if (playsPlaceholder) {
      playsPlaceholder.innerHTML = `
        <h2>Commentary</h2>
        <div style="text-align: center; padding: 40px; color: #777;">
          <p>Commentary not available for this match.</p>
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

    const hasHomeInTitle = matchedTitle.includes(homeNormalized) ||
                          matchedHomeTeam.includes(homeNormalized);
    const hasAwayInTitle = matchedTitle.includes(awayNormalized) ||
                          matchedAwayTeam.includes(awayNormalized);

    if (!hasHomeInTitle || !hasAwayInTitle) {
      console.log(`WARNING: Matched game "${bestMatch.title}" doesn't contain both teams!`);
      console.log(`Expected: ${homeNormalized} vs ${awayNormalized}`);
      console.log(`Found in title: Home=${hasHomeInTitle}, Away=${hasAwayInTitle}`);
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

  // Generate new embed URL using API if available
  if (currentAwayTeam && currentHomeTeam) {
    let newEmbedUrl = '';

    // Try to use available streams from API first
    if (availableStreams.alpha && streamType === 'alpha1') {
      newEmbedUrl = availableStreams.alpha.embedUrl;
    } else if (availableStreams.alpha && streamType === 'alpha2') {
      // For alpha2, modify the API URL to use /2 instead of /1
      newEmbedUrl = availableStreams.alpha.embedUrl.replace(/\/1$/, '/2');
    } else if (availableStreams.bravo && streamType === 'bravo') {
      newEmbedUrl = availableStreams.bravo.embedUrl;
    }

    // Fallback to manual URL construction if API doesn't have the stream
    if (!newEmbedUrl) {
      console.log('API streams not available for switch, falling back to manual URL construction');
      const homeNormalized = normalizeTeamName(currentHomeTeam);
      const awayNormalized = normalizeTeamName(currentAwayTeam);

      if (streamType === 'alpha1') {
        newEmbedUrl = `https://embedsports.top/embed/alpha/${homeNormalized}-vs-${awayNormalized}/1`;
      } else if (streamType === 'alpha2') {
        newEmbedUrl = `https://embedsports.top/embed/alpha/${homeNormalized}-vs-${awayNormalized}/2`;
      } else if (streamType === 'bravo') {
        const timestamp = Date.now();
        newEmbedUrl = `https://embedsports.top/embed/bravo/${timestamp}-${homeNormalized}-${awayNormalized}-english-/1`;
      }
    }

    console.log('New embed URL:', newEmbedUrl);

    const iframe = document.getElementById('streamIframe');
    const streamHeader = document.querySelector('.stream-header h3');

    if (iframe) {
      // Show loading message
      const connectingDiv = document.getElementById('streamConnecting');
      if (connectingDiv) {
        connectingDiv.style.display = 'block';
        connectingDiv.innerHTML = '<p>Loading stream...</p>';
        iframe.style.display = 'none';
      }

      // Update header to show current stream type
      if (streamHeader) {
        streamHeader.textContent = `Live Stream (${streamType.toUpperCase()})`;
      }

      // Update button texts based on new current stream type
      updateStreamButtons(streamType);

      // Update iframe src
      iframe.src = newEmbedUrl;

      // Hide loading after a short delay
      setTimeout(() => {
        if (connectingDiv) {
          connectingDiv.style.display = 'none';
        }
        iframe.style.display = 'block';
      }, 2000);
    }
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
  const streamContainer = document.getElementById("streamEmbed");
  if (!streamContainer) return;

  // Check if game is in progress before showing stream
  // Get game state from the current page data
  const gameClockElement = document.querySelector('.game-clock');
  const gameStatus = gameClockElement ? gameClockElement.textContent.trim() : '';

  // Only show stream for in-progress games (not scheduled or finished)
  const isGameInProgress = gameStatus &&
    !gameStatus.toLowerCase().includes('final') &&
    !gameStatus.toLowerCase().includes('full time') &&
    !gameStatus.toLowerCase().includes('scheduled') &&
    gameStatus !== 'N/A' &&
    gameStatus !== '';

  if (!isGameInProgress) {
    streamContainer.innerHTML = '';
    return;
  }

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

  streamContainer.innerHTML = `
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
      <div class="stream-iframe-container" style="position: relative; width: 100%; margin: 0 auto; overflow: hidden;">
        <iframe
          id="streamIframe"
          src="${embedUrl}"
          width="100%"
          height="${screenHeight}"
          style="aspect-ratio: 16/9; background: #000; display: none; margin-bottom: 50px;"
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

  // Show the iframe immediately since we're using direct embed
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

// Content slider functions
window.showStats = function() {
  // Update button states
  document.getElementById('statsBtn').classList.add('active');
  document.getElementById('playsBtn').classList.remove('active');
  
  // Show/hide content sections
  document.getElementById('statsContent').classList.add('active');
  document.getElementById('playsContent').classList.remove('active');
  
  // Fetch stats data when switching to stats tab
  const gameId = getQueryParam("gameId");
  if (gameId) {
    fetchAndRenderStatsData(gameId).catch(console.error);
  }
  
  // Show stream when on stats tab
  const streamContainer = document.getElementById("streamEmbed");
  if (streamContainer) {
    if (gameId) {
      renderStreamEmbed(gameId).catch(console.error);
    }
  }
};

window.showPlays = function() {
  // Update button states
  document.getElementById('playsBtn').classList.add('active');
  document.getElementById('statsBtn').classList.remove('active');
  
  // Show/hide content sections
  document.getElementById('statsContent').classList.remove('active');
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
if (gameId) {
  // Load stream after a short delay to ensure DOM is ready
  setTimeout(() => {
    renderStreamEmbed(gameId).catch(console.error);
  }, 1000);
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

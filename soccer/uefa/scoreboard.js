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
    const displayName = window.innerWidth <= 475 ? lastName : fullName;
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
        <img src="../soccer-ball-png-24.png" alt="Soccer Ball" class="soccer-ball">
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
    const name = player.athlete.lastName ? player.athlete.lastName : player.athlete.displayName;
    const substitution = player.subbedOutFor?.athlete ? `
      <span class="sub-arrow red-arrow">←</span>
      ` : "";
    const jersey = player.jersey;
    const stats = player.stats.reduce((acc, stat) => {
      acc[stat.abbreviation] = stat.displayValue;
      return acc;
    }, {});

    const yellowCard = stats["YC"] === "1";
    const redCard = stats["RC"] === "1";
    const playerNameColor = redCard ? "red" : yellowCard ? "yellow" : "white";

    const hoverCardId = `hover-card-${player.athlete.id}`;

    // Add hover card to the body
    const hoverCard = document.createElement("div");
    hoverCard.className = "player-hover-card";
    hoverCard.id = hoverCardId;
    hoverCard.innerHTML = `
      <img src="${teamLogo}" alt="Team Logo" class="hover-team-logo">
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
    document.body.appendChild(hoverCard);

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
      .map(player => renderPlayer(player, positionStyles[player.position.abbreviation] || "", teamLogo))
      .join("");

  const renderSubstitutes = (subs, teamLogo) => `
    <div class="subs-box">
      <div class="subs-header">
        <img src="${teamLogo}" alt="Team Logo" class="subs-team-logo">
        <span class="subs-title">Subs</span>
      </div>
      <ul class="subs-list">
        ${subs.map(sub => {
          const name = sub.athlete?.lastName || sub.athlete?.displayName || "Unknown";
          const subbedInFor = sub.subbedInFor?.athlete ? `
            <span class="sub-arrow green-arrow">→</span>
            <span class="sub-time">${sub.plays?.[0]?.clock?.displayValue || ""}</span>
            <span class="sub-out">Out: #${sub.subbedInFor.jersey || ""}, ${sub.subbedInFor.athlete.displayName || "Unknown"}</span>
          ` : "";
          const jersey = sub.jersey || "N/A";
          const stats = (sub.stats || []).reduce((acc, stat) => {
            acc[stat.abbreviation] = stat.displayValue;
            return acc;
          }, {});

          const yellowCard = stats["YC"] === "1";
          const redCard = stats["RC"] === "1";
          const playerNameColor = redCard ? "red" : yellowCard ? "yellow" : "white";

          const hoverCardId = `hover-card-${sub.athlete?.id || "unknown"}`;

          // Add hover card to the body
          const hoverCard = document.createElement("div");
          hoverCard.className = "player-hover-card";
          hoverCard.id = hoverCardId;
          hoverCard.innerHTML = `
            <img src="${teamLogo}" alt="Team Logo" class="hover-team-logo">
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
          document.body.appendChild(hoverCard);

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
          <img src="${awayLogo}" alt="Away Team Logo" class="form-team-logo" style="margin-right: 10px;">
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
          <img src="${homeLogo}" alt="Home Team Logo" class="form-team-logo" style="margin-left: 10px;">
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

    const SCOREBOARD_API_URL = `https://cdn.espn.com/core/soccer/lineups?xhr=1&gameId=${gameId}`;
    const response = await fetch(SCOREBOARD_API_URL);
    const scoreboardData = await response.json();

    // Also fetch commentary data for roster stats
    const COMMENTARY_API_URL = `https://cdn.espn.com/core/soccer/commentary?xhr=1&gameId=${gameId}`;
    const commentaryResponse = await fetch(COMMENTARY_API_URL);
    const commentaryData = await commentaryResponse.json();

    // Store data globally for other functions to use (include gamepackageJSON from commentary)
    window.currentGameData = {
      ...scoreboardData,
      rosters: commentaryData.gamepackageJSON?.rosters || []
    };

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

    const homeLogo = `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${homeTeamId}.png`;
    const awayLogo = `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${awayTeamId}.png`;

    const homeScoreColor = gameState === "post" && (homeShootoutScore || homeScore) < (awayShootoutScore || awayScore) ? "grey" : "white";
    const awayScoreColor = gameState === "post" && (awayShootoutScore || awayScore) < (homeShootoutScore || homeScore) ? "grey" : "white";

    topScoreboardEl.innerHTML = `
      <div class="team-block">
        <div class="team-score responsive-score" style="color: ${homeScoreColor};">
          ${homeScore}${homeShootoutScore > 0 ? `<sup style="font-size: 0.5em;">(${homeShootoutScore})</sup>` : ""}
        </div>
        <img class="team-logo responsive-logo" src="${homeLogo}" alt="${homeTeam.displayName}">
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
        <img class="team-logo responsive-logo" src="${awayLogo}" alt="${awayTeam.displayName}">
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
    console.error("Error fetching UEFA scoreboard data:", error);
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
  
  // Debug logging for stats
  console.log('Goal Card Debug - Scorer:', scorer);
  console.log('Goal Card Debug - Looking for scorer name:', scorer.displayName);
  
  // Get stats from the commentary roster data
  try {
    // Access the global roster data that should be available
    if (window.currentGameData && window.currentGameData.rosters) {
      const rosters = window.currentGameData.rosters;
      console.log('Goal Card Debug - Available rosters:', rosters);
      
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
            console.log('Goal Card Debug - Found player with stats:', player);
            const stats = player.stats.reduce((acc, stat) => {
              acc[stat.abbreviation] = stat.displayValue;
              return acc;
            }, {});
            
            console.log('Goal Card Debug - Processed stats:', stats);
            
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
    } else {
      console.log('Goal Card Debug - No roster data available in window.currentGameData');
    }
  } catch (error) {
    console.log('Goal Card Debug - Error retrieving stats:', error);
  }
  
  console.log('Goal Card Debug - Final Scorer Stats:', scorerStats);
  
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
  
  // Get team logos for score display
  const homeTeamLogo = homeTeam?.team?.logos?.find(logo => logo.rel.includes("dark"))?.href || 
                      `https://a.espncdn.com/i/teamlogos/soccer/500/${homeTeam?.team?.id || homeTeam?.id}.png`;
  const awayTeamLogo = awayTeam?.team?.logos?.find(logo => logo.rel.includes("dark"))?.href || 
                      `https://a.espncdn.com/i/teamlogos/soccer/500/${awayTeam?.team?.id || awayTeam?.id}.png`;
  
  return `
    <div id="${goalCardId}" class="goal-card" style="background: linear-gradient(135deg, ${teamColorHex}15 0%, ${teamColorHex}05 100%); border-left: 4px solid ${teamColorHex}; margin: 10px 0; padding: 20px; border-radius: 8px; color: white; position: relative;">
      <div class="copy-button" onclick="copyGoalCardAsImage('${goalCardId}')" style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.6); border: none; border-radius: 50%; width: 30px; height: 30px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; z-index: 10;">
        📋
      </div>
      <div class="goal-card-header" style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 10px; margin-right: 55px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; flex: 1; min-width: 200px;">
          <img src="${teamLogo}" alt="${team?.displayName || 'Team'}" style="width: 40px; height: 40px; margin-right: 15px;">
          <div class="goal-info">
            <div class="goal-type" style="font-size: 14px; font-weight: bold; color: white; margin-bottom: 4px;">
              ⚽ ${goalType} ${goalSituation ? `• ${goalSituation}` : ''}
            </div>
            <div class="goal-time" style="font-size: 12px; color: rgba(255,255,255,0.8);">
              ${minute}
            </div>
          </div>
        </div>
        
        <div class="goal-field" style="width: 100px; height: 70px; flex-shrink: 0;">
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
              <img src="${homeTeamLogo}" alt="Home" style="width: 24px; height: 24px;">
              <span style="font-size: 16px; font-weight: bold; color: white;">${finalHomeScore} - ${finalAwayScore}</span>
              <img src="${awayTeamLogo}" alt="Away" style="width: 24px; height: 24px;">
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
            margin-top: 15px !important;
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

async function renderPlayByPlay(gameId) {
  try {
    const COMMENTARY_API_URL = `https://cdn.espn.com/core/soccer/commentary?xhr=1&gameId=${gameId}`;
    const response = await fetch(COMMENTARY_API_URL);
    const data = await response.json();
    
    if (!data.gamepackageJSON || !data.gamepackageJSON.commentary) {
      throw new Error("No commentary data available");
    }

    const commentary = data.gamepackageJSON.commentary;
    const homeTeam = data.gamepackageJSON.header.competitions[0].competitors[0];
    const awayTeam = data.gamepackageJSON.header.competitions[1] || data.gamepackageJSON.header.competitions[0].competitors[1];
    
    const homeTeamId = homeTeam.team.id;
    const awayTeamId = awayTeam.team.id;
    const homeScore = parseInt(homeTeam.score || "0");
    const awayScore = parseInt(awayTeam.score || "0");
    
    const homeLogo = `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${homeTeamId}.png`;
    const awayLogo = `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${awayTeamId}.png`;

    // Preserve scroll position
    const playsContainer = document.querySelector('.plays-container');
    if (playsContainer) {
      playsScrollPosition = playsContainer.scrollTop;
    }

    // Sort commentary by timestamp or sequence number (most recent first)
    const sortedCommentary = [...commentary].sort((a, b) => {
      // First try to sort by timestamp if available
      const aTime = a.timestamp || (a.play && a.play.timestamp);
      const bTime = b.timestamp || (b.play && b.play.timestamp);
      
      if (aTime && bTime) {
        return new Date(bTime) - new Date(aTime); // Most recent first
      }
      
      // Try to sort by clock time (higher minute = more recent)
      const aClock = a.clock || (a.play && a.play.clock);
      const bClock = b.clock || (b.play && b.play.clock);
      
      if (aClock && bClock && aClock.displayValue && bClock.displayValue) {
        const aMinutes = parseInt(aClock.displayValue) || 0;
        const bMinutes = parseInt(bClock.displayValue) || 0;
        
        if (aMinutes !== bMinutes) {
          return bMinutes - aMinutes; // Higher minute = more recent
        }
      }
      
      // Fallback to sequence number (highest to lowest for reverse chronological)
      return b.sequence - a.sequence;
    });
    
    // Track score throughout the match by sequence
    let currentHomeScore = homeScore;
    let currentAwayScore = awayScore;
    
    // First pass: collect all goal events with their sequences and scores
    const goalEvents = [];
    sortedCommentary.forEach(play => {
      const playData = play.play || play;
      const isScoring = play.scoringPlay === true || playData.scoringPlay === true || 
                       (playData.type && playData.type.text && playData.type.text.toLowerCase().includes('goal')) ||
                       (play.text && play.text.toLowerCase().includes('goal!')) ||
                       (playData.shortText && playData.shortText.toLowerCase().includes('goal'));
      
      if (isScoring && play.text && play.text.includes('Goal!')) {
        // Extract scores using regex pattern for "Team 1, Team 0" format
        const scoreMatch = play.text.match(/(\d+),.*?(\d+)/);
        if (scoreMatch) {
          const homeScoreAfter = parseInt(scoreMatch[1]);
          const awayScoreAfter = parseInt(scoreMatch[2]);
          goalEvents.push({
            sequence: play.sequence,
            homeScoreAfter: homeScoreAfter,
            awayScoreAfter: awayScoreAfter
          });
          console.log(`Goal at sequence ${play.sequence}: score becomes ${homeScoreAfter}-${awayScoreAfter}`);
        }
      }
    });

    // Sort goals by sequence to ensure chronological order
    goalEvents.sort((a, b) => a.sequence - b.sequence);

    // Function to get score at any given sequence
    function getScoreAtSequence(sequence) {
      // Find the most recent goal before or at this sequence
      let mostRecentGoal = null;
      for (const goal of goalEvents) {
        if (goal.sequence <= sequence) {
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
      
      // Get the score at the time of this play
      const isGoalPlay = play.scoringPlay === true || playData.scoringPlay === true ||
                        (playData.type && playData.type.text && playData.type.text.toLowerCase().includes('goal')) ||
                        (play.text && play.text.toLowerCase().includes('goal!')) ||
                        (playData.shortText && playData.shortText.toLowerCase().includes('goal'));
      let scoreAtThisTime;
      
      if (isGoalPlay) {
        // For goal plays, show the score AFTER this goal
        let scoreAfterGoal = null;
        for (const goal of goalEvents) {
          if (goal.sequence <= play.sequence) {
            scoreAfterGoal = goal;
          } else {
            break; // Goals are sorted, so no need to continue
          }
        }
        
        if (scoreAfterGoal) {
          scoreAtThisTime = { home: scoreAfterGoal.homeScoreAfter, away: scoreAfterGoal.awayScoreAfter };
        } else {
          // This shouldn't happen for a goal play, but fallback to 1-0 or 0-1
          const teamSide = playData.team?.id === homeTeamId ? 'home' : 'away';
          scoreAtThisTime = teamSide === 'home' ? { home: 1, away: 0 } : { home: 0, away: 1 };
        }
      } else {
        // For non-goal plays, show the score up to this point (including goals at same sequence)
        scoreAtThisTime = getScoreAtSequence(play.sequence);
      }
      
      currentHomeScore = scoreAtThisTime.home;
      currentAwayScore = scoreAtThisTime.away;
      
      const period = playData.period ? playData.period.number || playData.period.displayValue : '';
      const clock = play.time ? play.time.displayValue : '';
      const text = play.text || 'No description available';
      
      // Determine if this is a scoring play - check both levels and more goal patterns
      const isScoring = play.scoringPlay === true || playData.scoringPlay === true || 
                       (playData.type && playData.type.text && playData.type.text.toLowerCase().includes('goal')) ||
                       (text && text.toLowerCase().includes('goal!')) ||
                       (playData.shortText && playData.shortText.toLowerCase().includes('goal'));

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
                  <img src="${homeLogo}" alt="Home" class="team-logo-small">
                  <span class="score">${currentHomeScore}</span>
                </div>
                <span class="score-separator">-</span>
                <div class="team-score-display">
                  <span class="score">${currentAwayScore}</span>
                  <img src="${awayLogo}" alt="Away" class="team-logo-small">
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
                      <span class="event-type">${getOrdinalSuffix(period)} - ${clock}</span>
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
      
      // Apply team colors with !important
      applyTeamColorsToCommentary();
    }
    
  } catch (error) {
    console.error("Error loading commentary:", error);
    const playsPlaceholder = document.querySelector('.plays-placeholder');
    if (playsPlaceholder) {
      playsPlaceholder.innerHTML = `
        <h2>Commentary</h2>
        <div style="text-align: center; padding: 40px; color: #666;">
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
    'borussia dortmund': 'borussia-dortmund'
  };
  
  const lowerName = teamName.toLowerCase();
  if (specialCases[lowerName]) {
    return specialCases[lowerName];
  }
  
  // Convert team names to streaming format
  return teamName.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/^fc-/, '')
    .replace(/-fc$/, '');
}

// Global variables for stream testing
let streamUrls = [];
let currentStreamIndex = 0;
let streamTestTimeout = null;
let isMuted = true; // Start muted to prevent autoplay issues

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

async function startStreamTesting(homeTeamName, awayTeamName) {
  const homeNormalized = normalizeTeamName(homeTeamName);
  const awayNormalized = normalizeTeamName(awayTeamName);
  
  const pageUrls = [
    `https://papaahd.live/${homeNormalized}-vs-${awayNormalized}/`
  ];
  
  streamUrls = [];
  
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
  
  if (streamUrls.length === 0) {
    console.log('No video URLs extracted, using page URLs directly');
    streamUrls = pageUrls;
  }
  
  currentStreamIndex = 0;
  
  setTimeout(() => {
    tryNextStream();
  }, 300);
}

// Function to get stream ID based on team names or default to common IDs
function getStreamId(homeTeam, awayTeam) {
  // Common stream IDs for different types of matches
  const commonStreamIds = ['1011', '1012', '1013', '1014', '1015'];
  
  // For now, use a hash-based approach to get consistent stream ID for same teams
  const teamString = `${homeTeam.toLowerCase()}-${awayTeam.toLowerCase()}`;
  const hash = teamString.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  const index = Math.abs(hash) % commonStreamIds.length;
  return commonStreamIds[index];
}

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

  const isSmallScreen = window.innerWidth < 525;
  const screenHeight = isSmallScreen ? 250 : 700;
  
  streamContainer.innerHTML = `
      <div class="stream-header" style="margin-bottom: 10px; text-align: center;">
        <h3 style="color: white; margin: 0;">Live Stream</h3>
        <div class="stream-controls" style="margin-top: 10px;">
          <button id="fullscreenButton" onclick="toggleFullscreen()" style="padding: 8px 16px; margin: 0 5px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">⛶ Fullscreen</button>
        </div>
      </div>
      <div id="streamConnecting" style="display: block; color: white; padding: 20px; background: #333; margin-bottom: 10px;">
        <p>Connecting to stream... <span id="streamStatus"></span></p>
      </div>
      <div class="stream-iframe-container" style="position: relative; width: 100%; margin: 0 auto; overflow: hidden;">
        <iframe 
          id="streamIframe"
          src="about:blank"
          width="100%" 
          height="${screenHeight}"
          style="aspect-ratio: 16/9; background: #000; display: none; margin-bottom: 50px;"
          frameborder="0"
          allowfullscreen
          allow="autoplay; fullscreen; encrypted-media"
          referrerpolicy="no-referrer-when-downgrade"
          onload="handleStreamLoad()"
          onerror="handleStreamError()">
        </iframe>
      </div>
  `;

  // Start the stream testing process
  if (homeTeamName && awayTeamName) {
    console.log('Starting stream testing for:', homeTeamName, 'vs', awayTeamName);
    await startStreamTesting(homeTeamName, awayTeamName);
  }
}

// Stream control functions (adapted from CWC/MLB)
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

window.handleStreamLoad = function() {
  const iframe = document.getElementById('streamIframe');
  const connectingDiv = document.getElementById('streamConnecting');
  
  // Clear any existing timeout
  if (streamTestTimeout) {
    clearTimeout(streamTestTimeout);
    streamTestTimeout = null;
  }
  
  if (iframe.src !== 'about:blank') {
    setTimeout(() => {
      iframe.style.display = 'block';
      if (connectingDiv) {
        connectingDiv.style.display = 'none';
      }
    }, 1000);
  }
  
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

window.handleStreamError = function() {
  const connectingDiv = document.getElementById('streamConnecting');
  if (connectingDiv) {
    connectingDiv.innerHTML = '<p style="color: #ff6b6b;">Stream unavailable. Please try refreshing the page.</p>';
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
    const gameId = getQueryParam("gameId");
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
  
  // Load plays when switching to plays tab
  const gameId = getQueryParam("gameId");
  if (gameId) {
    renderPlayByPlay(gameId);
  }
};

// Fetch and render the scoreboard based on the gameId in the URL
fetchAndRenderTopScoreboard();
setInterval(fetchAndRenderTopScoreboard, 2000);

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

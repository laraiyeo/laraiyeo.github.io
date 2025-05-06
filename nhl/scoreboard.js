const BASE_URL = "https://corsproxy.io/?url=https://api-web.nhle.com/v1";

const teamColors = {
  "24": "#F47A38", "53": "#8C2633", "6": "#FFB81C", "7": "#002654",
  "20": "#C8102E", "12": "#CC0000", "16": "#CF0A2C", "21": "#6F263D",
  "29": "#041E42", "25": "#006847", "17": "#CE1126", "22": "#041E42",
  "13": "#041E42", "26": "#111111", "30": "#154734", "8": "#AF1E2D",
  "18": "#FFB81C", "1": "#CE1126", "2": "#00539B", "3": "#0038A8",
  "9": "#C8102E", "4": "#F74902", "5": "#FCB514", "28": "#006D75",
  "55": "#001628", "19": "#002F87", "14": "#002868", "10": "#00205B",
  "23": "#00205B", "54": "#B4975A", "15": "#041E42", "52": "#041E42"
};

function getQueryParam(param) {
  return new URLSearchParams(window.location.search).get(param);
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

function getAdjustedDateForNHL() {
  const now = new Date();
  const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  if (estNow.getHours() < 2) {
    estNow.setDate(estNow.getDate() - 1);
  }
  const adjustedDate = estNow.getFullYear() + "-" +
                       String(estNow.getMonth() + 1).padStart(2, "0") + "-" +
                       String(estNow.getDate()).padStart(2, "0");

  return adjustedDate;
}

async function fetchTeamRecords(gameId) {
  try {
    const today = getAdjustedDateForNHL();
    const scheduleRes = await fetch(`${BASE_URL}/schedule/${today}`);
    const scheduleData = await scheduleRes.json();

    // Ensure the correct structure is used to access games
    const games = scheduleData.gameWeek?.flatMap(week => week.games) || [];

    // Ensure consistent type comparison by converting gameId to a number
    const numericGameId = Number(gameId);
    const game = games.find(g => g.id === numericGameId);

    if (!game) {
      console.error(`Game not found in schedule data. Provided gameId: ${gameId}`);
      return { awayRecord: "Record unavailable", homeRecord: "Record unavailable" };
    }

    const { seriesStatus, awayTeam, homeTeam } = game;

    if (!seriesStatus) {
      console.error("Series status not found for the game.");
      return { awayRecord: "Record unavailable", homeRecord: "Record unavailable" };
    }

    // Determine which team is the top seed and bottom seed
    const awayAbbrev = awayTeam.abbrev;
    const homeAbbrev = homeTeam.abbrev;

    const awayRecord =
      seriesStatus.topSeedTeamAbbrev === awayAbbrev
        ? `${seriesStatus.topSeedWins}-${seriesStatus.bottomSeedWins}`
        : `${seriesStatus.bottomSeedWins}-${seriesStatus.topSeedWins}`;

    const homeRecord =
      seriesStatus.topSeedTeamAbbrev === homeAbbrev
        ? `${seriesStatus.topSeedWins}-${seriesStatus.bottomSeedWins}`
        : `${seriesStatus.bottomSeedWins}-${seriesStatus.topSeedWins}`;

    return { awayRecord, homeRecord };
  } catch (err) {
    console.error("Error fetching team records:", err);
    return { awayRecord: "Record unavailable", homeRecord: "Record unavailable" };
  }
}

async function renderTopScoreboard(awayTeam, homeTeam, periodDescriptor, clock, gameId, gameState) {
  const topScoreboardEl = document.getElementById("topScoreboard");
  if (!topScoreboardEl) {
    console.error("Error: 'topScoreboard' element not found.");
    return;
  }

  const periodText = periodDescriptor.number === 4 
    ? "OT" 
    : `${getOrdinalSuffix(periodDescriptor.number)} Period`;
  const timeLeft = clock.inIntermission ? "End" : clock.timeRemaining || "00:00";

  // Fetch team records
  const { awayRecord, homeRecord } = await fetchTeamRecords(gameId);

  // Check for power play (PP) situations
  const awayPP = awayTeam.situationDescriptions?.includes("PP") 
    ? `<span style="font-size: 2rem; color: grey;"> PP</span>` 
    : "";
  const homePP = homeTeam.situationDescriptions?.includes("PP") 
    ? `<span style="font-size: 2rem; color: grey;"> PP</span>` 
    : "";

  // Determine score color based on gameState and scores
  const isGreyedOut = gameState === "OFF" || gameState === "FINAL";
  const awayScoreColor = isGreyedOut && awayTeam.score < homeTeam.score ? "grey" : "white";
  const homeScoreColor = isGreyedOut && homeTeam.score < awayTeam.score ? "grey" : "white";

  // Remove playDescription if gameState is OFF or FINAL
  if (isGreyedOut) {
    const playDescriptionDiv = document.getElementById("playDescription");
    if (playDescriptionDiv) {
      playDescriptionDiv.innerHTML = "";
      playDescriptionDiv.style.display = "none";
    }
  }

  // Update period and time display for OFF or FINAL state
  const isSmallScreen = window.innerWidth <= 525;

  const periodDisplay = isGreyedOut
    ? `<div class="inning-status" style="font-size: ${isSmallScreen ? '1.3rem' : '4.5rem'};">${periodDescriptor.periodType === "OT" ? "Final/OT" : "Final"}</div>`
    : `<div class="inning-status">${periodText}</div><div class="time-left">${timeLeft}</div>`;

  topScoreboardEl.innerHTML = `
    <div class="team-block">
      <div class="team-score" style="color: ${awayScoreColor};">${awayTeam.score}${awayPP}</div>
      <img class="team-logo" src="${awayTeam.darkLogo}" alt="${awayTeam.commonName.default}">
      <div class="team-abbr">${awayTeam.commonName.default}</div>
      <div class="team-record">${awayRecord}</div>
    </div>
    <div class="inning-center">
      ${periodDisplay}
    </div>
    <div class="team-block">
      <div class="team-score" style="color: ${homeScoreColor};">${homePP}${homeTeam.score}</div>
      <img class="team-logo" src="${homeTeam.darkLogo}" alt="${homeTeam.commonName.default}">
      <div class="team-abbr">${homeTeam.commonName.default}</div>
      <div class="team-record">${homeRecord}</div>
    </div>
  `;
}

function renderPlayerStats(title, players, isGoalie, teamLogo, teamName, boldNames) {
  const playerStatsDiv = document.getElementById("playerStats");
  if (!playerStatsDiv) {
    console.error("Error: 'playerStats' element not found.");
    return;
  }

  const headers = isGoalie
    ? ["SA", "GA", "SV", "SV%", "TOI"]
    : ["G", "A", "P", "+/-", "PIM", "SOG"];

  // Sort players
  const sortedPlayers = players.sort((a, b) => {
    if (isGoalie) {
      return b.toi - a.toi;
    }
    const positionOrder = ["C", "LW", "RW", "D"];
    const posA = positionOrder.indexOf(a.position) !== -1 ? positionOrder.indexOf(a.position) : Infinity;
    const posB = positionOrder.indexOf(b.position) !== -1 ? positionOrder.indexOf(b.position) : Infinity;
    if (posA !== posB) return posA - posB;
    return a.name.default.localeCompare(b.name.default);
  });

  const rows = sortedPlayers.map(player => {
    let position = player.position;
    if (position === "L" || position === "R") position += "W";

    const positionDisplay = `<span style="color: grey;">${position}</span>`;
    const isBold = boldNames.includes(player.name.default);
    const rowStyle = isBold ? "font-weight: bold;" : "";
    const playerName = isBold ? `🟢 ${player.name.default}` : player.name.default;

    const stats = isGoalie
      ? [
          player.shotsAgainst,
          player.goalsAgainst,
          player.saves,
          player.shotsAgainst ? (player.saves / player.shotsAgainst).toFixed(2) : "0",
          player.toi
        ]
      : [player.goals, player.assists, player.points, player.plusMinus, player.pim, player.sog];

    return `
      <tr style="${rowStyle}">
        <td>${playerName} ${positionDisplay}</td>
        ${stats.map(stat => `<td>${stat !== undefined ? stat : "-"}</td>`).join("")}
      </tr>
    `;
  }).join("");

  return `
    <div class="stat-section">
      <h3>
        <img src="${teamLogo}" alt="${teamName}" class="small-team-logo"> ${teamName} ${title}
      </h3>
      <table>
        <thead>
          <tr>
            <th>Player</th>
            ${headers.map(header => `<th>${header}</th>`).join("")}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderLinescoreTable(goals, awayTeamName, homeTeamName, awayTotal, homeTotal) {
  const linescoreTableDiv = document.getElementById("linescoreTable");
  if (!linescoreTableDiv) {
    console.error("Error: 'linescoreTable' element not found.");
    return;
  }

  // Group goals by period
  const periods = {};
  goals.forEach(goal => {
    const periodNumber = goal.periodDescriptor.number;
    if (!periods[periodNumber]) {
      periods[periodNumber] = { awayScore: 0, homeScore: 0 };
    }
    if (goal.teamAbbrev === awayTeamName) {
      periods[periodNumber].awayScore++;
    } else if (goal.teamAbbrev === homeTeamName) {
      periods[periodNumber].homeScore++;
    }
  });

  // Generate table rows
  const periodHeaders = Object.keys(periods).map(period => `<th>${period}</th>`).join("");
  const awayScores = Object.values(periods).map(period => `<td>${period.awayScore}</td>`).join("");
  const homeScores = Object.values(periods).map(period => `<td>${period.homeScore}</td>`).join("");

  linescoreTableDiv.innerHTML = `
    <table>
      <thead>
        <tr>
          <th></th>
          ${periodHeaders}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${awayTeamName}</td>
          ${awayScores}
          <td>${awayTotal}</td>
        </tr>
        <tr>
          <td>${homeTeamName}</td>
          ${homeScores}
          <td>${homeTotal}</td>
        </tr>
      </tbody>
    </table>
  `;
}

async function renderPlayByPlay(gameId) {
  try {
    const playByPlayRes = await fetch(`${BASE_URL}/gamecenter/${gameId}/play-by-play`);
    const playByPlayData = await playByPlayRes.json();

    const rosterSpots = playByPlayData.rosterSpots || [];
    const plays = playByPlayData.plays || [];

    // Find the most recent play by sortOrder
    const mostRecentPlay = plays.reduce((latest, play) => {
      return play.sortOrder > (latest?.sortOrder || 0) ? play : latest;
    }, null);

    if (!mostRecentPlay) {
      console.error("No plays found.");
      return;
    }

    const playDescriptionDiv = document.getElementById("playDescription");
    if (!playDescriptionDiv) {
      console.error("Error: 'playDescription' element not found.");
      return;
    }

    // Helper function to get player name by ID
    function getPlayerNameById(playerId) {
      const player = rosterSpots.find(spot => spot.playerId === playerId);
      return player ? `${player.firstName.default} ${player.lastName.default}` : "Unknown Player";
    }

    // Helper function to get team color by player ID
    function getTeamColorByPlayerId(playerId) {
      const player = rosterSpots.find(spot => spot.playerId === playerId);
      if (player) {
        const teamId = player.teamId.toString(); // Convert teamId to string to match keys in teamColors
        return teamColors[teamId] || "#1a1a1a"; // Default to dark background if no color found
      }
      return "#1a1a1a";
    }

    // Process the play based on typeDescKey
    let description = "";
    let backgroundColor = "#1a1a1a"; // Default background color
    const { typeDescKey, details, timeRemaining } = mostRecentPlay;

    switch (typeDescKey) {
      case "missed-shot":
        const shooter = getPlayerNameById(details.shootingPlayerId);
        backgroundColor = getTeamColorByPlayerId(details.shootingPlayerId);
        description = `${shooter} takes a ${details.shotType} shot that misses ${details.reason}.`;
        break;

      case "goal":
        const scorer = getPlayerNameById(details.scoringPlayerId);
        backgroundColor = getTeamColorByPlayerId(details.scoringPlayerId);
        const assist1 = details.assist1PlayerId ? getPlayerNameById(details.assist1PlayerId) : null;
        const assist2 = details.assist2PlayerId ? getPlayerNameById(details.assist2PlayerId) : null;
        description = `${scorer} scores!`;
        if (assist1) description += ` Assisted by ${assist1}.`;
        if (assist2) description += ` Second assist by ${assist2}.`;
        break;

      case "blocked-shot":
        const blocker = getPlayerNameById(details.blockingPlayerId);
        const shooterBlocked = getPlayerNameById(details.shootingPlayerId);
        backgroundColor = getTeamColorByPlayerId(details.blockingPlayerId);
        description = `${blocker} blocks a shot from ${shooterBlocked}.`;
        break;

      case "hit":
        const hitter = getPlayerNameById(details.hittingPlayerId);
        const hittee = getPlayerNameById(details.hitteePlayerId);
        backgroundColor = getTeamColorByPlayerId(details.hittingPlayerId);
        description = `${hitter} delivers a hit to ${hittee}.`;
        break;

      case "penalty":
        const penalizedPlayer = getPlayerNameById(details.committedByPlayerId);
        backgroundColor = getTeamColorByPlayerId(details.committedByPlayerId);
        description = `${penalizedPlayer} commits a penalty: ${details.descKey}. ${details.duration} minutes.`;
        break;

      case "faceoff":
        const winner = getPlayerNameById(details.winningPlayerId);
        const loser = getPlayerNameById(details.losingPlayerId);
        backgroundColor = getTeamColorByPlayerId(details.winningPlayerId);
        description = `${winner} wins the faceoff against ${loser}.`;
        break;

      case "takeaway":
        const taker = getPlayerNameById(details.playerId);
        backgroundColor = getTeamColorByPlayerId(details.playerId);
        description = `${taker} takes the puck away.`;
        break;

      case "giveaway":
        const giver = getPlayerNameById(details.playerId);
        backgroundColor = getTeamColorByPlayerId(details.playerId);
        description = `${giver} gives the puck away.`;
        break;

      case "shot-on-goal":
        const shooterOnGoal = getPlayerNameById(details.shootingPlayerId);
        const goalieOnGoal = getPlayerNameById(details.goalieInNetId);
        backgroundColor = getTeamColorByPlayerId(details.shootingPlayerId);
        description = `${shooterOnGoal} takes a shot on goal. Saved by ${goalieOnGoal}.`;
        break;

      case "stoppage":
        description = `Play stopped: ${details.reason}.`;
        break;

      case "period-end":
        description = mostRecentPlay.periodDescriptor.periodType === "OT" 
          ? `End of OT ${mostRecentPlay.periodDescriptor.otPeriods}.`
          : `End of period ${mostRecentPlay.periodDescriptor.number}.`;
        break;

      case "game-end":
        description = `The game has ended.`;
        break;

      default:
        description = `Unknown play type: ${typeDescKey}.`;
        break;
    }

    // Display the play description with background color
    playDescriptionDiv.style.backgroundColor = backgroundColor;
    playDescriptionDiv.innerHTML = `
      <div>
        <strong>Time:</strong> ${timeRemaining}<br>${description}
      </div>
    `;
  } catch (err) {
    console.error("Error fetching play-by-play data:", err);
  }
}

async function fetchAndUpdateScoreboard(gameId) {
  try {
    const [boxscoreRes, playByPlayRes] = await Promise.all([
      fetch(`${BASE_URL}/gamecenter/${gameId}/boxscore`),
      fetch(`${BASE_URL}/gamecenter/${gameId}/play-by-play`)
    ]);

    const boxscoreData = await boxscoreRes.json();
    const playByPlayData = await playByPlayRes.json();

    const { awayTeam, homeTeam, periodDescriptor, clock, playerByGameStats, gameState } = boxscoreData;

    // Collect names of players on the ice for both teams
    const awayIceSurfaceNames = playByPlayData.summary?.iceSurface?.awayTeam
      ? [
          ...playByPlayData.summary.iceSurface.awayTeam.forwards.map(player => player.name.default),
          ...playByPlayData.summary.iceSurface.awayTeam.defensemen.map(player => player.name.default),
          ...playByPlayData.summary.iceSurface.awayTeam.goalies.map(player => player.name.default)
        ]
      : []; // Default to an empty array if awayTeam is undefined

    const homeIceSurfaceNames = playByPlayData.summary?.iceSurface?.homeTeam
      ? [
          ...playByPlayData.summary.iceSurface.homeTeam.forwards.map(player => player.name.default),
          ...playByPlayData.summary.iceSurface.homeTeam.defensemen.map(player => player.name.default),
          ...playByPlayData.summary.iceSurface.homeTeam.goalies.map(player => player.name.default)
        ]
      : []; // Default to an empty array if homeTeam is undefined

    await renderTopScoreboard(awayTeam, homeTeam, periodDescriptor, clock, gameId, gameState);

    // Clear stats container before rendering new stats
    const playerStatsDiv = document.getElementById("playerStats");
    if (playerStatsDiv) {
      playerStatsDiv.innerHTML = "";
    }

    // Render skater and goalie stats with bolded names and stars for those on the ice
    playerStatsDiv.innerHTML += renderPlayerStats(
      "Goalies",
      playerByGameStats.awayTeam.goalies,
      true,
      awayTeam.darkLogo,
      awayTeam.commonName.default,
      awayIceSurfaceNames
    );
    playerStatsDiv.innerHTML += renderPlayerStats(
      "Skaters",
      playerByGameStats.awayTeam.forwards.concat(playerByGameStats.awayTeam.defense),
      false,
      awayTeam.darkLogo,
      awayTeam.commonName.default,
      awayIceSurfaceNames
    );
    playerStatsDiv.innerHTML += renderPlayerStats(
      "Goalies",
      playerByGameStats.homeTeam.goalies,
      true,
      homeTeam.darkLogo,
      homeTeam.commonName.default,
      homeIceSurfaceNames
    );
    playerStatsDiv.innerHTML += renderPlayerStats(
      "Skaters",
      playerByGameStats.homeTeam.forwards.concat(playerByGameStats.homeTeam.defense),
      false,
      homeTeam.darkLogo,
      homeTeam.commonName.default,
      homeIceSurfaceNames
    );

    // Render play-by-play
    await renderPlayByPlay(gameId);
  } catch (err) {
    console.error("Error fetching scoreboard data:", err);
    const scoreboardContainerEl = document.getElementById("scoreboardContainer");
    if (scoreboardContainerEl) {
      scoreboardContainerEl.innerHTML = "<p>Error loading game data.</p>";
    }
  }
}

const gameId = getQueryParam("gameId");
if (gameId) {
  fetchAndUpdateScoreboard(gameId);
  setInterval(() => fetchAndUpdateScoreboard(gameId), 2000);
} else {
  document.getElementById("scoreboardContainer").innerHTML = "<p>No game selected.</p>";
}

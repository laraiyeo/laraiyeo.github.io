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

async function getLogoUrl(triCode) {
  return `https://assets.nhle.com/logos/nhl/svg/${triCode}_dark.svg`;
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

function wrapTeamName(name) {
  const words = name.split(" ");
  if (words.length > 1) {
    return `${words[0][0]}. ${words.slice(1).join(" ")}`;
  }
  return name;
}

async function fetchTimeRemaining(gameId) {
  try {
    const res = await fetch(`https://corsproxy.io/?url=https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`);
    const data = await res.json();
    return data.clock?.inIntermission ? "End" : data.clock?.timeRemaining || "00:00"; // Handle intermission
  } catch (err) {
    console.error(`Error fetching timeRemaining for game ${gameId}:`, err);
    return "00:00";
  }
}

async function buildGameCard(game) {
  const { id: gameId, awayTeam, homeTeam, gameState, startTimeUTC, seriesStatus, clock, periodDescriptor } = game;
  const awayLogo = await getLogoUrl(awayTeam.abbrev);
  const homeLogo = await getLogoUrl(homeTeam.abbrev);

  const startTime = new Date(startTimeUTC).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const seriesInfo = seriesStatus
    ? `${seriesStatus.seriesAbbrev || "N/A"} - Game ${seriesStatus.gameNumberOfSeries || "N/A"}`
    : "";

  const awayRecord =
    seriesStatus?.topSeedTeamAbbrev === awayTeam.abbrev
      ? `${seriesStatus.topSeedWins}-${seriesStatus.bottomSeedWins}`
      : `${seriesStatus.bottomSeedWins}-${seriesStatus.topSeedWins}`;

  const homeRecord =
    seriesStatus?.topSeedTeamAbbrev === homeTeam.abbrev
      ? `${seriesStatus.topSeedWins}-${seriesStatus.bottomSeedWins}`
      : `${seriesStatus.bottomSeedWins}-${seriesStatus.topSeedWins}`;

  function getOrdinalSuffix(num) {
    if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
    switch (num % 10) {
      case 1: return `${num}st`;
      case 2: return `${num}nd`;
      case 3: return `${num}rd`;
      default: return `${num}th`;
    }
  }

  const awayIsWinner = awayTeam.score > homeTeam.score;
  const homeIsWinner = homeTeam.score > awayTeam.score;

  let gameSeriesInfo = "";
  if (seriesStatus.topSeedWins > seriesStatus.bottomSeedWins) {
    gameSeriesInfo = `${seriesStatus.topSeedTeamAbbrev} ${seriesStatus.topSeedWins}-${seriesStatus.bottomSeedWins}`;
  } else if (seriesStatus.bottomSeedWins > seriesStatus.topSeedWins) {
    gameSeriesInfo = `${seriesStatus.bottomSeedTeamAbbrev} ${seriesStatus.bottomSeedWins}-${seriesStatus.topSeedWins}`;
  } else {
    gameSeriesInfo = `Tied ${seriesStatus.topSeedWins}-${seriesStatus.bottomSeedWins}`;
  }

  const currentPeriod = periodDescriptor.periodType === "OT"
    ? `${getOrdinalSuffix(periodDescriptor.otPeriods)} OT`
    : `${getOrdinalSuffix(periodDescriptor.number)} Period`;

  const timeRemaining = gameState === "LIVE" || gameState === "CRIT"
    ? await fetchTimeRemaining(gameId)
    : "00:00";

  if (["PRE", "FUT"].includes(gameState)) {
    // Scheduled game card
    return `
      <div class="game-card">
        <div style="font-size: 0.8rem; color: grey; text-align: center;">${seriesInfo}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${awayLogo}" alt="${awayTeam.commonName.default}" style="width: 60px; height: 40px;">
              <span style="font-size: 0.9rem;">${awayRecord}</span>
            </div>
            <div style="margin-top: 6px; font-weight: bold;">${wrapTeamName(awayTeam.commonName.default)}</div>
          </div>
          <div style="font-size: 1.1rem; font-weight: bold;">${startTime}</div>
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 0.9rem;">${homeRecord}</span>
              <img src="${homeLogo}" alt="${homeTeam.commonName.default}" style="width: 60px; height: 40px;">
            </div>
            <div style="margin-top: 6px; font-weight: bold;">${wrapTeamName(homeTeam.commonName.default)}</div>
          </div>
        </div>
      </div>
    `;
  } else if (["FINAL", "OFF"].includes(gameState)) {
    // Finished game card

    return `
      <div class="game-card">
        <div style="font-size: 0.8rem; color: grey; text-align: center;">${seriesInfo}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${awayLogo}" alt="${awayTeam.commonName.default}" style="width: 60px; height: 40px;">
              <span style="font-size: 2.3rem; ${awayIsWinner ? "font-weight: bold;" : ""}">${awayTeam.score}</span>
            </div>
            <div style="margin-top: 6px; ${awayIsWinner ? "font-weight: bold;" : ""}">${wrapTeamName(awayTeam.commonName.default)}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.1rem; font-weight: bold;">${periodDescriptor.periodType === "OT" ? "Final/OT" : "Final"}</div>
            <div style="font-size: 0.9rem; color: grey; margin-top: 8px;">${gameSeriesInfo}</div>
          </div>
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 2.3rem; ${homeIsWinner ? "font-weight: bold;" : ""}">${homeTeam.score}</span>
              <img src="${homeLogo}" alt="${homeTeam.commonName.default}" style="width: 60px; height: 40px;">
            </div>
            <div style="margin-top: 6px; ${homeIsWinner ? "font-weight: bold;" : ""}">${wrapTeamName(homeTeam.commonName.default)}</div>
          </div>
        </div>
      </div>
    `;
  } else {
    // Game in progress card
    return `
      <div class="game-card">
        <div style="font-size: 0.8rem; color: grey; text-align: center;">${seriesInfo}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${awayLogo}" alt="${awayTeam.commonName.default}" style="width: 60px; height: 40px;">
              <span style="font-size: 2.3rem; ${awayIsWinner ? "font-weight: bold;" : ""}">${awayTeam.score}</span>
            </div>
            <div style="margin-top: 6px; ${awayIsWinner ? "font-weight: bold;" : ""}">${wrapTeamName(awayTeam.commonName.default)}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.3rem; font-weight: bold; margin-top: 12px;">${timeRemaining}</div>
            <div style="font-size: 0.8rem; color: grey; margin-top: 8px;">${currentPeriod}</div>
            <div style="font-size: 0.6rem; color: grey; margin-top: 4px;">${gameSeriesInfo}</div>
          </div>
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 2.3rem; ${homeIsWinner ? "font-weight: bold;" : ""}">${homeTeam.score}</span>
              <img src="${homeLogo}" alt="${homeTeam.commonName.default}" style="width: 60px; height: 40px;">
            </div>
            <div style="margin-top: 6px; ${homeIsWinner ? "font-weight: bold;" : ""}">${wrapTeamName(homeTeam.commonName.default)}</div>
          </div>
        </div>
      </div>
    `;
  }
}

let lastScheduleHash = null;

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

let updateInterval;

async function fetchGames() {
  const today = getAdjustedDateForNHL();
  const url = `https://corsproxy.io/?url=https://api-web.nhle.com/v1/schedule/${today}`;

  try {
    const res = await fetch(url);
    const text = await res.text();
    const newHash = hashString(text);

    if (newHash === lastScheduleHash) {
      // Update timeRemaining for live games
      const liveGameCards = document.querySelectorAll(".game-card[data-game-id]");
      for (const card of liveGameCards) {
        const gameId = card.getAttribute("data-game-id");
        const timeRemaining = await fetchTimeRemaining(gameId);
        const timeRemainingEl = card.querySelector(".time-remaining");
        if (timeRemainingEl) {
          timeRemainingEl.textContent = timeRemaining;
        }
      }
      return;
    }
    lastScheduleHash = newHash;

    const gamesData = JSON.parse(text);
    const games = gamesData.gameWeek?.[0]?.games || [];

    // Check if all games are finished
    const allGamesFinished = games.length > 0 && games.every(game => ["FINAL", "OFF"].includes(game.gameState));

    const teamsRes = await fetch(`https://corsproxy.io/?url=https://api.nhle.com/stats/rest/en/team`);
    if (!teamsRes.ok) {
      throw new Error(`Failed to fetch teams: ${teamsRes.status}`);
    }
    const teamsData = await teamsRes.json();
    const teams = teamsData?.data?.filter(team => teamColors[team.id]) || [];

    const container = document.getElementById("gamesContainer");

    if (!container) {
      console.error("Error: Element with ID 'gamesContainer' not found.");
      return;
    }

    container.innerHTML = ""; // Clear previous content

    // Sort teams alphabetically by full name
    const sortedTeams = teams.sort((a, b) => a.fullName.localeCompare(b.fullName));

    for (const team of sortedTeams) {
      const teamCard = document.createElement("div");
      teamCard.className = "team-section";
      teamCard.style.backgroundColor = teamColors[team.id] || "#000";

      const logoUrl = await getLogoUrl(team.triCode);
      teamCard.innerHTML = `
        <div class="team-header">
          <img src="${logoUrl}" alt="${team.fullName}" class="team-logo">
          <h2>${team.fullName}</h2>
        </div>
        <div class="team-games"></div>
      `;

      // Fetch and display games for the team
      const teamGamesContainer = teamCard.querySelector(".team-games");
      const teamGames = games.filter(game => game.awayTeam.id === team.id || game.homeTeam.id === team.id);

      if (teamGames.length > 0) {
        for (const game of teamGames) {
          const gameCardHtml = await buildGameCard(game);
          const gameCard = document.createElement("div");
          gameCard.innerHTML = gameCardHtml;
          gameCard.setAttribute("data-game-id", game.id); // Add game ID for dynamic updates
          teamGamesContainer.appendChild(gameCard);
        }
      } else {
        // No game scheduled card
        const noGameCard = document.createElement("div");
        noGameCard.className = "game-card no-game-card";
        noGameCard.style.display = "flex";
        noGameCard.style.alignItems = "center";
        noGameCard.style.gap = "35px";
        noGameCard.style.padding = "20px";

        noGameCard.innerHTML = `
          <img src="${logoUrl}" alt="${team.fullName} logo" style="width: 80px; height: 70px;">
          <div style="font-weight: bold; font-size: 1.2rem;">No game scheduled <br> for today</div>
        `;

        teamGamesContainer.appendChild(noGameCard);
      }

      container.appendChild(teamCard);

      // Add OBS link copying functionality
      teamCard.addEventListener("click", async () => {
        const url = `https://laraiyeo.github.io/nhl/team.html?team=${encodeURIComponent(team.triCode)}`; // Use triCode
        try {
          await navigator.clipboard.writeText(url);
          alert(`OBS link copied for ${team.fullName}: ${url}`);
        } catch (err) {
          console.error("Failed to copy OBS link:", err);
        }
      });
    }

    // Return true if all games are finished
    return allGamesFinished;
  } catch (err) {
    console.error("Error fetching games:", err);
    return true; // Stop fetching on error
  }
}

const updateGames = async () => {
  const allFinished = await fetchGames();
  if (allFinished && updateInterval) {
    clearInterval(updateInterval);
    console.log("All games are finished. Stopped fetching updates.");
  }
};

updateGames(); // Initial fetch
updateInterval = setInterval(updateGames, 2000);

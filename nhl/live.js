const CORS_PROXY = "https://corsproxy.io/?url=";

async function getLogoUrl(teamTriCode) {
  return `${CORS_PROXY}https://assets.nhle.com/logos/nhl/svg/${teamTriCode}_light.svg`;
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

const liveGameElements = new Map();

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

async function loadLiveGames() {
  try {
    const today = getAdjustedDateForNHL();
    const res = await fetch(`${CORS_PROXY}https://api-web.nhle.com/v1/schedule/${today}`);
    const data = await res.json();
    const games = data.gameWeek?.[0]?.games || [];

    const liveGames = games.filter(game => game.gameState === "LIVE" || game.gameState === "CRIT");
    const container = document.getElementById("gamesContainer");

    if (liveGames.length === 0) {
      if (!document.querySelector(".no-games")) {
        container.innerHTML = `<div class="live-game-block no-games"><p>No live games in progress.</p></div>`;
      }
      liveGameElements.clear();
      return;
    }

    const currentGameIds = new Set();

    for (const game of liveGames) {
      const { id: gameId, awayTeam, homeTeam } = game;
      currentGameIds.add(gameId);

      const awayLogo = await getLogoUrl(awayTeam.abbrev);
      const homeLogo = await getLogoUrl(homeTeam.abbrev);

      let gameDiv = liveGameElements.get(gameId);
      if (!gameDiv) {
        gameDiv = document.createElement("div");
        gameDiv.className = "live-game-block";
        gameDiv.style.width = "350px";
        gameDiv.innerHTML = `
          <div style="display: flex; flex-direction: column; justify-content: space-between; align-items: center; height: 100%; padding: 5px;">
            <div id="period-${gameId}" style="font-size: 1.5rem; font-weight: bold; text-align: center; color: black;"></div>
            <div id="periodStatus-${gameId}" style="font-size: 1rem; color: grey; text-align: center; margin-top: 15px;"></div>
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <div style="text-align: center;">
                <img src="${awayLogo}" alt="${awayTeam.commonName.default}" style="width: 120px; height: 80px;">
                <div id="awayScore-${gameId}" style="font-size: 3.5rem; font-weight: normal; color: black;">0</div>
                <div style="margin-top: 8px; font-weight: bold; color: black; margin-bottom: 15px;">${awayTeam.commonName.default}</div>
              </div>
              <div id="status-${gameId}" style="font-size: 1.75rem; font-weight: bold; color: black; text-align: center;"></div>
              <div style="text-align: center;">
                <img src="${homeLogo}" alt="${homeTeam.commonName.default}" style="width: 120px; height: 80px;">
                <div id="homeScore-${gameId}" style="font-size: 3.5rem; font-weight: normal; color: black;">0</div>
                <div style="margin-top: 8px; font-weight: bold; color: black; margin-bottom: 15px;">${homeTeam.commonName.default}</div>
              </div>
            </div>
          </div>
        `;
        container.appendChild(gameDiv);
        liveGameElements.set(gameId, gameDiv);

        // Add click event to navigate to the scoreboard
        gameDiv.addEventListener("click", () => {
          window.location.href = `scoreboard.html?gameId=${gameId}`;
        });
      }

      fetchGameDetails(gameId, awayTeam, homeTeam);
    }

    for (const [gameId, element] of liveGameElements.entries()) {
      if (!currentGameIds.has(gameId)) {
        element.remove();
        liveGameElements.delete(gameId);
      }
    }
  } catch (err) {
    console.error("Error loading live games:", err);
  }
}

async function fetchGameDetails(gameId, awayTeam, homeTeam) {
  try {
    const res = await fetch(`${CORS_PROXY}https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`);
    const data = await res.json();

    const { awayTeam: awayData, homeTeam: homeData, periodDescriptor, clock } = data;

    // Update scores
    const awayScoreEl = document.getElementById(`awayScore-${gameId}`);
    const homeScoreEl = document.getElementById(`homeScore-${gameId}`);
    if (awayScoreEl && homeScoreEl) {
      const awayScore = awayData.score;
      const homeScore = homeData.score;

      awayScoreEl.textContent = awayScore;
      homeScoreEl.textContent = homeScore;

      awayScoreEl.style.fontWeight = "normal";
      homeScoreEl.style.fontWeight = "normal";

      if (awayScore > homeScore) {
        awayScoreEl.style.fontWeight = "bold";
      } else if (homeScore > awayScore) {
        homeScoreEl.style.fontWeight = "bold";
      }
    }

    // Update period and intermission status
    const periodEl = document.getElementById(`period-${gameId}`);
    const periodStatusEl = document.getElementById(`periodStatus-${gameId}`);
    if (periodEl && periodStatusEl) {
      const periodText = periodDescriptor.periodType === "OT" 
        ? `${getOrdinalSuffix(periodDescriptor.otPeriods)} OT` 
        : `${getOrdinalSuffix(periodDescriptor.number)} Period`;
      periodEl.textContent = periodText;

      const periodStatus = clock.inIntermission ? "" : "";
      periodStatusEl.textContent = periodStatus;
    }

    // Update time left
    const timeLeftEl = document.getElementById(`status-${gameId}`);
    if (timeLeftEl) {
      const timeLeft = clock.inIntermission ? "End" : clock.timeRemaining || "00:00";
      timeLeftEl.textContent = timeLeft;
    }
  } catch (err) {
    console.error(`Error fetching details for game ${gameId}:`, err);
  }
}

loadLiveGames();
setInterval(loadLiveGames, 2000);

const CORS_PROXY = "https://corsproxy.io/?url=";

async function getLogoUrl(teamAbbreviation) {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${teamAbbreviation}.png`;
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

const liveGameElements = new Map();

async function loadLiveGames() {
  try {
    const adjustedDate = getAdjustedDateForNBA();
    const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${adjustedDate}`;
    const res = await fetch(SCOREBOARD_API_URL);
    const data = await res.json();
    const games = data.events || [];

    const liveGames = games.filter(game => 
      game.status.type.description === "In Progress" || game.status.type.description === "Halftime" || game.status.type.description === "End of Period"
    );
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
      const { id: gameId, competitions } = game;
      const homeTeam = competitions[0].competitors.find(c => c.homeAway === "home").team;
      const awayTeam = competitions[0].competitors.find(c => c.homeAway === "away").team;
      const distance = competitions[0].situation.distance || "N/A";
      const possession = competitions[0].situation.possession || "N/A";
      const yardLine = competitions[0].situation.yardLine || "N/A";
      const kickoff = competitions[0].situation.shortDownDistanceText === "1st & 10" && distance === 10 && (yardLine === 65 || yardLine === 35) ? "Kickoff" : competitions[0].situation.shortDownDistanceText || "";

      const possessionColor = possession === homeTeam.id ? `#${homeTeam.color}` : possession === awayTeam.id ? `#${awayTeam.color}` : "grey";

      const text = competitions[0].situation.possessionText || "";

      const isSmallScreen = window.innerWidth < 525;

      currentGameIds.add(gameId);

      const awayLogo = await getLogoUrl(awayTeam.abbreviation);
      const homeLogo = await getLogoUrl(homeTeam.abbreviation);

      let gameDiv = liveGameElements.get(gameId);
      if (!gameDiv) {
        gameDiv = document.createElement("div");
        gameDiv.className = "live-game-block";
        gameDiv.style.width = `${isSmallScreen ? "350px" : "400px"}`;
        gameDiv.innerHTML = `
          <div style="display: flex; flex-direction: column; justify-content: space-between; align-items: center; height: 100%; padding: 10px;">
            <div id="period-${gameId}" style="font-size: 1.5rem; font-weight: bold; text-align: center; color: black;"></div>
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 15px;">
              <div style="text-align: center; flex: 1;">
                <img src="${awayLogo}" alt="${awayTeam.displayName}" style="${isSmallScreen ? "width: 120px; height: 80px;" : "width: 140px; height: 100px;"}">
                <div id="awayScore-${gameId}" style="font-size: ${isSmallScreen ? "3rem" : "3.5rem"}; font-weight: normal; color: black;">0</div>
                <div style="margin-top: 8px; font-weight: bold; color: black; font-size: ${isSmallScreen ? "1rem" : "1.1rem"};">${awayTeam.shortDisplayName}</div>
              </div>
              <div style="text-align: center; ${isSmallScreen ? "" : "flex: 1; min-width: 120px;"}">
                <div id="status-${gameId}" style="font-size: ${isSmallScreen ? "1.75rem" : "2.2rem"}; font-weight: bold; color: black; text-align: center;"></div>
                <div id="periodStatus-${gameId}" style="font-size: ${isSmallScreen ? "0.9rem" : "1.3rem"}; color: grey; text-align: center; margin-top: 15px;">${kickoff}</div>
                <div id="periodStatus-${gameId}" style="font-size: ${isSmallScreen ? "0.75rem" : "1rem"}; color: ${possessionColor}; text-align: center; margin-top: 5px;">${text ? (possession === homeTeam.id ? `${text} ▶` : `◀ ${text}`) : ""}</div>
              </div>
              <div style="text-align: center; flex: 1;">
                <img src="${homeLogo}" alt="${homeTeam.displayName}" style="${isSmallScreen ? "width: 120px; height: 80px;" : "width: 140px; height: 100px;"}">
                <div id="homeScore-${gameId}" style="font-size: ${isSmallScreen ? "3rem" : "3.5rem"}; font-weight: normal; color: black;">0</div>
                <div style="margin-top: 8px; font-weight: bold; color: black; font-size: ${isSmallScreen ? "1rem" : "1.1rem"};">${homeTeam.shortDisplayName}</div>
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

      fetchGameDetails(gameId, competitions[0]);
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

async function fetchGameDetails(gameId, competition) {
  try {
    const homeTeam = competition.competitors.find(c => c.homeAway === "home");
    const awayTeam = competition.competitors.find(c => c.homeAway === "away");

    // Update scores
    const awayScoreEl = document.getElementById(`awayScore-${gameId}`);
    const homeScoreEl = document.getElementById(`homeScore-${gameId}`);
    if (awayScoreEl && homeScoreEl) {
      const awayScore = parseInt(awayTeam.score, 10);
      const homeScore = parseInt(homeTeam.score, 10);

      awayScoreEl.textContent = awayScore;
      homeScoreEl.textContent = homeScore;

      // Reset font weight
      awayScoreEl.style.fontWeight = "normal";
      homeScoreEl.style.fontWeight = "normal";

      // Bold the score for the leading team
      if (awayScore > homeScore) {
        awayScoreEl.style.fontWeight = "bold";
      } else if (homeScore > awayScore) {
        homeScoreEl.style.fontWeight = "bold";
      }
    }

    // Update period and intermission status
    const periodEl = document.getElementById(`period-${gameId}`);
    const periodStatusEl = document.getElementById(`periodStatus-${gameId}`);
    const statusEl = document.getElementById(`status-${gameId}`);
    if (periodEl && periodStatusEl && statusEl) {
      const isHalftime = competition.status.type.description === "Halftime";
      const isEndOfPeriod = competition.status.type.description === "End of Period";
      const periodText = isHalftime
        ? ""
        : isEndOfPeriod
        ? `End of ${getOrdinalSuffix(competition.status.period)} Quarter`
        : `${getOrdinalSuffix(competition.status.period)} Quarter`;
      periodEl.textContent = periodText;

      statusEl.textContent = isHalftime ? "Halftime" : isEndOfPeriod ? "End" : competition.status.displayClock;
    }
  } catch (err) {
    console.error(`Error fetching details for game ${gameId}:`, err);
  }
}

loadLiveGames();
setInterval(loadLiveGames, 2000);

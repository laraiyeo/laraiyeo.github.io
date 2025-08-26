const LEAGUES = {
  "Champions League": { code: "uefa.champions", logo: "2", qualCode: "uefa.champions_qual" },
  "Europa League": { code: "uefa.europa", logo: "2310", qualCode: "uefa.europa_qual" },
  "Europa Conference League": { code: "uefa.europa.conf", logo: "20296", qualCode: "uefa.europa.conf_qual" },
  "Super Cup": { code: "uefa.super_cup", logo: "1272", qualCode: null },
};

let currentUefaLeague = localStorage.getItem("currentUefaLeague") || "uefa.champions"; // Default to Champions League

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

async function loadLiveGames() {
  try {
    // Ensure we have a valid league set
    if (!currentUefaLeague || !Object.values(LEAGUES).some(league => league.code === currentUefaLeague)) {
      currentUefaLeague = "uefa.champions";
      localStorage.setItem("currentUefaLeague", currentUefaLeague);
    }

    const adjustedDate = getAdjustedDateForSoccer();
    
    // Get the current league data to check for qualification tournament
    const currentLeagueData = Object.values(LEAGUES).find(league => league.code === currentUefaLeague);
    
    // Prepare API URLs - main competition and qualification if it exists
    const apiUrls = [`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${adjustedDate}`];
    
    if (currentLeagueData?.qualCode) {
      apiUrls.push(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeagueData.qualCode}/scoreboard?dates=${adjustedDate}`);
      console.log(`Fetching from main competition (${currentUefaLeague}) and qualification (${currentLeagueData.qualCode})`);
    } else {
      console.log(`Fetching from main competition only (${currentUefaLeague})`);
    }

    // Fetch from all relevant competitions in parallel
    const responses = await Promise.all(apiUrls.map(url => fetch(url)));
    const dataResults = await Promise.all(responses.map(res => res.json()));
    
    // Combine games from all competitions
    let allGames = [];
    dataResults.forEach((data, index) => {
      const games = data.events || [];
      // Add competition info to each game for identification
      games.forEach(game => {
        game.isQualification = index > 0; // First API call is main competition, rest are qualifications
        game.competitionCode = index === 0 ? currentUefaLeague : currentLeagueData.qualCode;
      });
      allGames.push(...games);
    });

    const liveGames = allGames.filter(game => 
      game.status.type.state === "in" || game.status.type.state === "halftime"
    );
    const container = document.getElementById("gamesContainer");

    if (!container) {
      console.error("Error: Element with ID 'gamesContainer' not found.");
      return;
    }

    const noGamesMessage = document.querySelector(".no-games");
    if (noGamesMessage) {
      noGamesMessage.remove(); // Remove the "No live games" message if it exists
    }

    const currentGameIds = new Set();

    for (const game of liveGames) {
      const { id: gameId, competitions } = game;
      const homeTeam = competitions?.[0]?.competitors?.find(c => c.homeAway === "home")?.team;
      const awayTeam = competitions?.[0]?.competitors?.find(c => c.homeAway === "away")?.team;

      if (!homeTeam || !awayTeam) {
        console.error(`Error: Missing team data for game ID ${gameId}`);
        continue;
      }

      currentGameIds.add(gameId);

      let gameDiv = liveGameElements.get(gameId);
      if (!gameDiv) {
        // Add qualification indicator if it's a qualification game
        let backgroundColor;

        if (currentUefaLeague === 'uefa.champions') {
          backgroundColor = '#3562A6';
        } else if (currentUefaLeague === 'uefa.europa') {
          backgroundColor = '#E58004';
        } else if (currentUefaLeague === 'uefa.europa.conf') {
          backgroundColor = '#72a53b ';
        } else {
          backgroundColor = '#000000'; // Default color for unknown competitions
        }

        const competitionLabel = game.isQualification ? 
          `<div style="background: ${backgroundColor}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; font-weight: bold; margin-bottom: 5px; text-align: center;">QUALIFICATION</div>` : 
          '';

        gameDiv = document.createElement("div");
        gameDiv.className = "live-game-block";
        gameDiv.style.width = "350px";
        gameDiv.innerHTML = `
          <div style="display: flex; flex-direction: column; justify-content: space-between; align-items: center; height: 100%; padding: 5px;">
            ${competitionLabel}
            <div id="period-${gameId}" style="font-size: 1.5rem; font-weight: bold; text-align: center; color: black;"></div>
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <div style="text-align: center;">
                <img src="${homeTeam?.logo || ""}" alt="${homeTeam.displayName}" style="width: 140px; height: 100px;" onerror="this.src='../soccer-ball-png-24.png'">
                <div id="homeScore-${gameId}" style="font-size: 3.5rem; font-weight: normal; color: black;">0</div>
                <div style="margin-top: 8px; font-weight: bold; color: black;">${homeTeam.shortDisplayName}</div>
              </div>
              <div style="text-align: center;">
                <div id="status-${gameId}" style="font-size: 1.75rem; font-weight: bold; color: black; text-align: center;"></div>
                <div id="periodStatus-${gameId}" style="font-size: 1rem; color: grey; text-align: center; margin-top: 15px;"></div>
              </div>
              <div style="text-align: center;">
                <img src="${awayTeam?.logo || ""}" alt="${awayTeam.displayName}" style="width: 140px; height: 100px;" onerror="this.src='../soccer-ball-png-24.png'">
                <div id="awayScore-${gameId}" style="font-size: 3.5rem; font-weight: normal; color: black;">0</div>
                <div style="margin-top: 8px; font-weight: bold; color: black;">${awayTeam.shortDisplayName}</div>
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

    // Remove game elements that are no longer live
    for (const [gameId, element] of liveGameElements.entries()) {
      if (!currentGameIds.has(gameId)) {
        element.remove();
        liveGameElements.delete(gameId);
      }
    }

    // If no live games exist and no elements are present, display a "no games" message
    if (liveGames.length === 0 && container.children.length === 0) {
      const qualText = currentLeagueData?.qualCode ? " or qualification" : "";
      container.innerHTML = `<div class="live-game-block no-games"><p>No live games in progress${qualText}.</p></div>`;
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
      const periodText = isHalftime
        ? "Halftime"
        : `${competition.status.type.description}`;
      periodEl.textContent = periodText;

      statusEl.textContent = isHalftime ? "" : competition.status.type.shortDetail;
    }
  } catch (err) {
    console.error(`Error fetching details for game ${gameId}:`, err);
  }
}

function setupLeagueButtons() {
  const leagueContainer = document.getElementById("leagueButtons");
  if (!leagueContainer) {
    console.error("Error: Element with ID 'leagueButtons' not found.");
    return;
  }

  leagueContainer.innerHTML = ""; // Clear any existing content

  for (const [leagueName, leagueData] of Object.entries(LEAGUES)) {
    const button = document.createElement("button");
    button.className = `league-button ${currentUefaLeague === leagueData.code ? "active" : ""}`;
    button.innerHTML = `
      <span class="league-text">${leagueName}</span>
      <img class="league-logo" src="https://a.espncdn.com/i/leaguelogos/soccer/500-dark/${leagueData.logo}.png" alt="${leagueName}" style="display: none;" onerror="this.src='../soccer-ball-png-24.png'">
    `;
    button.addEventListener("click", () => {
      currentUefaLeague = leagueData.code;

      // Save the current league to localStorage
      localStorage.setItem("currentUefaLeague", currentUefaLeague);

      // Update active state
      document.querySelectorAll(".league-button").forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");

      loadLiveGames();
    });

    leagueContainer.appendChild(button);
  }

  updateLeagueButtonDisplay(); // Adjust button display based on screen size
}

function updateLeagueButtonDisplay() {
  const isSmallScreen = window.innerWidth < 525;
  document.querySelectorAll(".league-button").forEach(button => {
    const text = button.querySelector(".league-text");
    const logo = button.querySelector(".league-logo");
    if (isSmallScreen) {
      text.style.display = "none";
      logo.style.display = "inline";
    } else {
      text.style.display = "inline";
      logo.style.display = "none";
    }
  });
}

window.addEventListener("resize", updateLeagueButtonDisplay);
window.addEventListener("DOMContentLoaded", () => {
  // Reset to default if coming from another page
  if (!currentUefaLeague || !Object.values(LEAGUES).some(league => league.code === currentUefaLeague)) {
    currentUefaLeague = "uefa.champions";
    localStorage.setItem("currentUefaLeague", currentUefaLeague);
  }

  setupLeagueButtons();
  loadLiveGames();
  setInterval(loadLiveGames, 2000);
});

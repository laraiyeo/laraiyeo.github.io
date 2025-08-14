const LEAGUES = {
  "Premier League": { code: "eng.1", logo: "23" },
  "La Liga": { code: "esp.1", logo: "15" },
  "Bundesliga": { code: "ger.1", logo: "10" },
  "Serie A": { code: "ita.1", logo: "12" },
  "Ligue 1": { code: "fra.1", logo: "9" },
  "MLS": { code: "usa.1", logo: "19" },
  "Saudi PL": { code: "ksa.1", logo: "2488" }
};

let currentLeague = localStorage.getItem("currentLeague") || "eng.1"; // Default to Premier League if not set

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
    const adjustedDate = getAdjustedDateForSoccer();
    const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/scoreboard?dates=${adjustedDate}`;
    const res = await fetch(SCOREBOARD_API_URL);
    const data = await res.json();
    const games = data.events || [];

    const liveGames = games.filter(game => 
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
        gameDiv = document.createElement("div");
        gameDiv.className = "live-game-block";
        gameDiv.style.width = "350px";
        gameDiv.innerHTML = `
          <div style="display: flex; flex-direction: column; justify-content: space-between; align-items: center; height: 100%; padding: 5px;">
            <div id="period-${gameId}" style="font-size: 1.5rem; font-weight: bold; text-align: center; color: black;"></div>
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <div style="text-align: center;">
                <img src="${homeTeam?.logo || ""}" alt="${homeTeam.displayName}" style="width: 140px; height: 100px;">
                <div id="homeScore-${gameId}" style="font-size: 3.5rem; font-weight: normal; color: black;">0</div>
                <div style="margin-top: 8px; font-weight: bold; color: black;">${homeTeam.shortDisplayName}</div>
              </div>
              <div style="text-align: center;">
                <div id="status-${gameId}" style="font-size: 1.75rem; font-weight: bold; color: black; text-align: center;"></div>
                <div id="periodStatus-${gameId}" style="font-size: 1rem; color: grey; text-align: center; margin-top: 15px;"></div>
              </div>
              <div style="text-align: center;">
                <img src="${awayTeam?.logo || ""}" alt="${awayTeam.displayName}" style="width: 140px; height: 100px;">
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
      container.innerHTML = `<div class="live-game-block no-games"><p>No live games in progress.</p></div>`;
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

function setupMobileScrolling(container) {
  // Remove any existing mobile styles first
  const existingStyle = document.getElementById("mobile-scroll-style");
  if (existingStyle) {
    existingStyle.remove();
  }

  // Add horizontal scroll styling for mobile devices
  if (window.innerWidth < 768) {
    // Hide scrollbar for webkit browsers and add mobile-specific styles
    const style = document.createElement("style");
    style.textContent = `
      .league-buttons::-webkit-scrollbar {
        display: none;
      }
      @media (max-width: 767px) {
        .league-buttons {
          overflow-x: auto !important;
          overflow-y: hidden !important;
          justify-content: flex-start !important;
          scroll-behavior: smooth;
          padding: 0 10px;
          -webkit-overflow-scrolling: touch;
          min-height: 50px;
        }
        .league-button {
          flex-shrink: 0 !important;
          white-space: nowrap;
        }
      }
    `;
    style.id = "mobile-scroll-style";
    document.head.appendChild(style);
    
    // Apply container styles directly
    container.style.scrollbarWidth = "none"; // Firefox
    container.style.msOverflowStyle = "none"; // IE/Edge
  }
}

function setupLeagueButtons() {
  const leagueContainer = document.getElementById("leagueButtons");
  if (!leagueContainer) {
    console.error("Error: Element with ID 'leagueButtons' not found.");
    return;
  }

  leagueContainer.innerHTML = ""; // Clear any existing content
  
  // Add horizontal scroll styling for mobile
  setupMobileScrolling(leagueContainer);

  for (const [leagueName, leagueData] of Object.entries(LEAGUES)) {
    const button = document.createElement("button");
    button.className = `league-button ${currentLeague === leagueData.code ? "active" : ""}`;
    button.innerHTML = `
      <span class="league-text">${leagueName}</span>
      <img class="league-logo" src="https://a.espncdn.com/i/leaguelogos/soccer/500-dark/${leagueData.logo}.png" alt="${leagueName}" style="display: none;">
    `;
    button.addEventListener("click", () => {
      currentLeague = leagueData.code;

      // Save the current league to localStorage
      localStorage.setItem("currentLeague", currentLeague);

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
  const leagueContainer = document.getElementById("leagueButtons");
  
  // Update mobile scrolling styles
  if (leagueContainer) {
    setupMobileScrolling(leagueContainer);
  }
  
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

setupLeagueButtons();
loadLiveGames();
setInterval(loadLiveGames, 2000);

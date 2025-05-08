const LEAGUES = {
  "Premier League": { code: "eng.1", logo: "23" },
  "La Liga": { code: "esp.1", logo: "15" },
  "Bundesliga": { code: "ger.1", logo: "10" },
  "Serie A": { code: "ita.1", logo: "12" },
  "Ligue 1": { code: "fra.1", logo: "9" },
};

let currentLeague = localStorage.getItem("currentLeague") || "eng.1"; // Default to Premier League if not set

function setupLeagueButtons() {
  const leagueContainer = document.getElementById("leagueButtons");
  if (!leagueContainer) {
    console.error("Error: Element with ID 'leagueButtons' not found.");
    return;
  }

  leagueContainer.innerHTML = ""; // Clear any existing content

  for (const [leagueName, leagueData] of Object.entries(LEAGUES)) {
    const button = document.createElement("button");
    button.className = `league-button ${currentLeague === leagueData.code ? "active" : ""}`;
    button.innerHTML = `
      <span class="league-text">${leagueName}</span>
      <img class="league-logo" src="https://a.espncdn.com/i/leaguelogos/soccer/500/${leagueData.logo}.png" alt="${leagueName}" style="display: none;">
    `;
    button.addEventListener("click", () => {
      currentLeague = leagueData.code;

      // Save the current league to localStorage
      localStorage.setItem("currentLeague", currentLeague);

      // Update active state
      document.querySelectorAll(".league-button").forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");

      fetchAndDisplayFinishedGames();
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

function getTuesdayRange() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToLastTuesday = (dayOfWeek + 5) % 7; // Days since the last Tuesday
  const lastTuesday = new Date(now);
  lastTuesday.setDate(now.getDate() - daysToLastTuesday);

  const nextMonday = new Date(lastTuesday);
  nextMonday.setDate(lastTuesday.getDate() + 6);

  const formatDate = date =>
    date.getFullYear() +
    String(date.getMonth() + 1).padStart(2, "0") +
    String(date.getDate()).padStart(2, "0");

  return `${formatDate(lastTuesday)}-${formatDate(nextMonday)}`;
}

function formatShortDisplayName(name) {
  if (name === "Bournemouth") return "B'Mouth";
  if (name === "Real Sociedad") return "Sociedad";
  if (name === "Southampton") return "S'Ampton";
  if (name === "Real Madrid") return "R. Madrid";
  if (name === "Nottm Forest") return "N. Forest";
  if (name === "Man United") return "Man Utd";
  if (name === "Las Palmas") return "L. Palmas";
  return name;
}

function getTeamLogo(team) {
  if (["367", "111"].includes(team.id)) {
    return `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${team.id}.png`;
  }
  return team.logo;
}

function buildGameCard(game) {
  const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home");
  const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away");

  const leagueName = Object.keys(LEAGUES).find(
    leagueName => LEAGUES[leagueName].code === currentLeague
  );

  const homeIsWinner = homeTeam.score > awayTeam.score;
  const awayIsWinner = awayTeam.score > homeTeam.score;

  const record = game.competitions[0].competitors.map(c => c.homeAway === "home" ? c.records[0].summary : c.records[0].summary)[0];
  const numbers = record.split("-").map(Number);
  const total = numbers.reduce((sum, num) => sum + num, 0);

  const date = new Date(game.date).toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    hour12: true,
  });

  return `
    <div class="game-card">
      <div style="font-size: 0.8rem; color: grey; text-align: center;">${leagueName}, Round ${total}</div>
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${getTeamLogo(homeTeam.team)}" alt="${homeTeam.team.displayName}" style="width: 60px; height: 60px;">
            <span style="font-size: 2.3rem; ${homeIsWinner ? "font-weight: bold;" : ""}">${homeTeam.score}</span>
          </div>
          <div style="margin-top: 6px; ${homeIsWinner ? "font-weight: bold;" : ""}">${formatShortDisplayName(homeTeam.team.shortDisplayName)}</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 1.1rem; font-weight: bold;">Final</div>
        </div>
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 2.3rem; ${awayIsWinner ? "font-weight: bold;" : ""}">${awayTeam.score}</span>
            <img src="${getTeamLogo(awayTeam.team)}" alt="${awayTeam.team.displayName}" style="width: 60px; height: 60px;">
          </div>
          <div style="margin-top: 6px; ${awayIsWinner ? "font-weight: bold;" : ""}">${formatShortDisplayName(awayTeam.team.shortDisplayName)}</div>
        </div>
      </div>
    </div>
  `;
}

async function fetchAndDisplayFinishedGames() {
  try {
    const tuesdayRange = getTuesdayRange();
    const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/scoreboard?dates=${tuesdayRange}`;

    const scoreboardResponse = await fetch(SCOREBOARD_API_URL);
    const scoreboardData = await scoreboardResponse.json();
    const games = scoreboardData.events || [];

    const finishedGames = games.filter(game => game.status.type.state === "post");

    const container = document.getElementById("finishedGamesContainer");
    if (!container) {
      console.error("Error: Element with ID 'finishedGamesContainer' not found.");
      return;
    }

    container.innerHTML = ""; // Clear any existing content

    if (finishedGames.length === 0) {
      container.innerHTML = `
        <div class="game-card no-game-card">
          <div style="font-size: 1.2rem; font-weight: bold; text-align: center; color: white;">
            No finished games this week.
          </div>
        </div>
      `;
      return;
    }

    // Group games by day
    const gamesByDay = finishedGames.reduce((acc, game) => {
      const gameDate = new Date(game.date).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      if (!acc[gameDate]) acc[gameDate] = [];
      acc[gameDate].push(game);
      return acc;
    }, {});

    // Sort days in chronological order
    const sortedDays = Object.keys(gamesByDay).sort(
      (a, b) => new Date(a) - new Date(b)
    );

    for (const day of sortedDays) {
      const dayHeader = document.createElement("h3");
      dayHeader.textContent = day;
      dayHeader.className = "day-header";
      container.appendChild(dayHeader);

      const dayGames = gamesByDay[day];
      const dayContainer = document.createElement("div");
      dayContainer.className = "games-container";

      for (const game of dayGames) {
        const gameCardHtml = buildGameCard(game);
        const gameCard = document.createElement("div");
        gameCard.innerHTML = gameCardHtml;
        dayContainer.appendChild(gameCard);
      }

      container.appendChild(dayContainer);
    }
  } catch (error) {
    console.error("Error fetching finished games:", error);
  }
}

// Ensure league buttons are displayed
setupLeagueButtons();
updateLeagueButtonDisplay(); // Ensure buttons are displayed correctly on load
fetchAndDisplayFinishedGames();
window.addEventListener("resize", updateLeagueButtonDisplay);

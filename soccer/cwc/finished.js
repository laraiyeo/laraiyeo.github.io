const LEAGUES = {
  "Club World Cup": { code: "fifa.cwc", logo: "19" },
};

let currentCWCLeague = localStorage.getItem("currentCWCLeague") || "fifa.cwc"; // Default to Club World Cup

function getTuesdayRange() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysToLastSunday = dayOfWeek; // Days since the last Sunday
  const lastSunday = new Date(now);
  lastSunday.setDate(now.getDate() - daysToLastSunday);

  const nextSaturday = new Date(lastSunday);
  nextSaturday.setDate(lastSunday.getDate() + 6);

  const formatDate = date =>
    date.getFullYear() +
    String(date.getMonth() + 1).padStart(2, "0") +
    String(date.getDate()).padStart(2, "0");

  return `${formatDate(lastSunday)}-${formatDate(nextSaturday)}`;
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

  const leagueCWC = "Club World Cup"; // Direct assignment instead of lookup

  const homeIsWinner = homeTeam.score > awayTeam.score;
  const awayIsWinner = awayTeam.score > homeTeam.score;

  const header = game.season.slug;
    const formatted = header
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

  const gameDate = new Date(game.date);

  const hour = gameDate.toLocaleString("en-US", {
    hour: "numeric",
    hour12: true,
  });
  const ampm = hour.includes("AM") ? "AM" : "PM";
  const hourOnly = hour.replace(/ AM| PM/, ""); // remove space and AM/PM

  const minutes = gameDate.getMinutes();
  const time = minutes === 0
    ? `${hourOnly} ${ampm}`
    : `${hourOnly}:${minutes.toString().padStart(2, '0')} ${ampm}`;

  const date = `${time}`;

  return `
      <div class="game-card">
        <div style="font-size: 0.8rem; color: grey; text-align: center;">${leagueCWC} - ${formatted}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${getTeamLogo(homeTeam.team)}" alt="${homeTeam.team.displayName}" style="width: 60px; height: 60px;">
              <span style="font-size: 2.3rem; ${homeIsWinner ? "font-weight: bold;" : ""}">${homeTeam.score}</span>
            </div>
            <div style="margin-top: 6px; ${homeIsWinner ? "font-weight: bold;" : ""}">${formatShortDisplayName(homeTeam.team.shortDisplayName)}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.1rem; font-weight: bold; margin-top: 20px; margin-bottom: 18px;">Final</div>
            <div style="font-size: 0.75rem; color: grey; margin-top: 25px;">${date}</div>
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

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

let lastFinishedGamesHash = null;

async function fetchAndDisplayFinishedGames() {
  try {
    const tuesdayRange = getTuesdayRange();
    const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.cwc/scoreboard?dates=${tuesdayRange}`;

    const scoreboardResponse = await fetch(SCOREBOARD_API_URL);
    const scoreboardText = await scoreboardResponse.text();
    const newHash = hashString(scoreboardText);

    if (newHash === lastFinishedGamesHash) {
      console.log("No changes detected in finished games.");
      return;
    }
    lastFinishedGamesHash = newHash;

    const scoreboardData = JSON.parse(scoreboardText);
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
      (a, b) => new Date(b) - new Date(a)
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
        // Add event listener to redirect to scoreboard.html
        gameCard.addEventListener("click", () => {
        window.location.href = `scoreboard.html?gameId=${game.id}`;
        });
      
        dayContainer.appendChild(gameCard);
      }

      container.appendChild(dayContainer);
    }
  } catch (error) {
    console.error("Error fetching finished games:", error);
  }
}

fetchAndDisplayFinishedGames();
setInterval(fetchAndDisplayFinishedGames, 2000);

const TEAMS_API_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams";

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

function adjustTeamShortName(shortName) {
  if (shortName === "Timberwolves") return "T. Wolves";
  if (shortName === "Trail Blazers") return "T. Blazers";
  return shortName;
}

async function buildGameCard(game) {
  const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home")?.team;
  const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away")?.team;
  const homeScore = game.competitions[0].competitors.find(c => c.homeAway === "home")?.score || "0";
  const awayScore = game.competitions[0].competitors.find(c => c.homeAway === "away")?.score || "0";

  const homeTeamShortName = adjustTeamShortName(homeTeam?.shortDisplayName || "Unknown");
  const awayTeamShortName = adjustTeamShortName(awayTeam?.shortDisplayName || "Unknown");

  const slug = game.season?.slug || "regular-season";

  const homeRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "home")?.record || (game.competitions[0].competitors.find(c => c.homeAway === "home")?.record.split("-").reverse().join("-") || "0-0")
      : game.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

  const awayRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "away")?.record || (game.competitions[0].competitors.find(c => c.homeAway === "away")?.record.split("-").reverse().join("-") || "0-0")
      : game.competitions[0].competitors.find(c => c.homeAway === "away")?.records?.find(r => r.type === "total")?.summary || "0-0";

  const homeIsWinner = parseInt(homeScore) > parseInt(awayScore);
  const awayIsWinner = parseInt(awayScore) > parseInt(homeScore);

  const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

  return `
    <div class="game-card final-game-card" style="margin-top: -20px; margin-bottom: 20px;">
      <div class="game-headline">${headline}</div>
      <div class="game-content">
        <div class="team away-team">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${awayTeam?.logo || ""}" alt="${awayTeam?.displayName || "Unknown"}" class="card-team-logo">
            <span class="card-team-score" style="${awayIsWinner ? "font-weight: bold;" : ""}">${awayScore}</span>
          </div>
          <div class="card-team-name">${awayTeamShortName}</div>
          <div class="card-team-record">${awayRecord}</div>
        </div>
        <div class="game-info">
          <div class="line"></div>
          <div class="game-status">Final</div>
        </div>
        <div class="team home-team">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="card-team-score" style="${homeIsWinner ? "font-weight: bold;" : ""}">${homeScore}</span>
            <img src="${homeTeam?.logo || ""}" alt="${homeTeam?.displayName || "Unknown"}" class="card-team-logo">
          </div>
          <div class="card-team-name">${homeTeamShortName}</div>
          <div class="card-team-record">${homeRecord}</div>
        </div>
      </div>
    </div>
  `;
}

async function loadFinishedGames() {
  try {
    const adjustedDate = getAdjustedDateForNBA();
    const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${adjustedDate}`;
    const response = await fetch(SCOREBOARD_API_URL);
    const data = await response.json();

    const games = data.events || [];
    const finishedGames = games.filter(game => game.status.type.description === "Final");

    const container = document.getElementById("gamesContainer");
    if (!container) {
      console.error("Error: Element with ID 'gamesContainer' not found.");
      return;
    }

    container.innerHTML = ""; // Clear any existing content

    if (finishedGames.length === 0) {
      container.innerHTML = `<div class="game-card" style="margin-top: -20px;">No finished games yet.</div>`;
      return;
    }

    for (const game of finishedGames) {
      const gameCardHtml = await buildGameCard(game);
      const gameCard = document.createElement("div");
      gameCard.innerHTML = gameCardHtml;

      // Add event listener to redirect to scoreboard.html
      gameCard.addEventListener("click", () => {
        window.location.href = `scoreboard.html?gameId=${game.id}`;
      });

      container.appendChild(gameCard);
    }
  } catch (error) {
    console.error("Error loading finished games:", error);
  }
}

loadFinishedGames();
setInterval(loadFinishedGames, 2000);

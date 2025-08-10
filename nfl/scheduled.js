const CORS_PROXY = "https://corsproxy.io/?url=";
const TEAMS_API_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams";

async function getLogoUrl(teamTriCode) {
  return `${CORS_PROXY}https://assets.nfl.com/logos/nfl/svg/${teamTriCode}_dark.svg`;
}

function wrapTeamName(name) {
  const words = name.split(" ");
  if (words.length > 1) {
    return `${words[0][0]}. ${words.slice(1).join(" ")}`;
  }
  return name;
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

function adjustTeamShortName(shortName) {
  if (shortName === "Timberwolves") return "T. Wolves";
  if (shortName === "Trail Blazers") return "T. Blazers";
  return shortName;
}

async function buildScheduledGameCard(game) {
  const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home")?.team;
  const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away")?.team;

  const homeTeamShortName = adjustTeamShortName(homeTeam?.shortDisplayName || "Unknown");
  const awayTeamShortName = adjustTeamShortName(awayTeam?.shortDisplayName || "Unknown");

  const slug = game.season?.slug || "regular-season";

  const homeRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "home")?.record || (game.competitions[0].competitors.find(c => c.homeAway === "home")?.record.split("-").reverse().join("-") || "0-0")
      : game.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

  const awayRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "away")?.record || (game.competitions[0].competitors.find(c => c.homeAway === "away")?.record.split("-").reverse().join("-") || "0-0")
      : game.competitions[0].competitors.find(c => c.homeAway === "away")?.records?.find(r => r.type === "total")?.summary || "0-0";

  const startTime = new Date(game.date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

  return `
    <div class="game-card" style="margin-top: -20px; margin-bottom: 20px;">
      <div class="game-headline">${headline}</div>
      <div class="game-content">
        <div class="team away-team">
          <img src="${`https://a.espncdn.com/i/teamlogos/nfl/500-dark/${awayTeam?.abbreviation}.png` || ""}" alt="${awayTeam?.displayName || "Unknown"}" class="card-team-logo">
          <div class="card-team-name">${awayTeamShortName}</div>
          <div class="card-team-record">${awayRecord}</div>
        </div>
        <div class="game-info">
          <div class="game-status">Scheduled</div>
          <div class="game-time">${startTime}</div>
        </div>
        <div class="team home-team">
          <img src="${`https://a.espncdn.com/i/teamlogos/nfl/500-dark/${homeTeam?.abbreviation}.png` || ""}" alt="${homeTeam?.displayName || "Unknown"}" class="card-team-logo">
          <div class="card-team-name">${homeTeamShortName}</div>
          <div class="card-team-record">${homeRecord}</div>
        </div>
      </div>
    </div>
  `;
}

async function loadScheduledGames() {
  try {
    const adjustedDate = getAdjustedDateForNBA();
    const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${adjustedDate}`;
    const response = await fetch(SCOREBOARD_API_URL);
    const data = await response.json();

    const games = data.events || [];
    const scheduledGames = games.filter(game => game.status.type.description === "Scheduled");

    const container = document.getElementById("gamesContainer");
    if (!container) {
      console.error("Error: Element with ID 'gamesContainer' not found.");
      return;
    }

    container.innerHTML = ""; // Clear any existing content

    if (scheduledGames.length === 0) {
      container.innerHTML = `<div class="game-card" style="margin-top: -20px;">No scheduled games at the moment.</div>`;
      return;
    }

    for (const game of scheduledGames) {
      const gameCardHtml = await buildScheduledGameCard(game);
      const gameCard = document.createElement("div");
      gameCard.innerHTML = gameCardHtml;

      container.appendChild(gameCard);
    }
  } catch (error) {
    console.error("Error loading scheduled games:", error);
  }
}

loadScheduledGames();
setInterval(loadScheduledGames, 2000);

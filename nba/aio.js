// Function to determine if we're in the Summer League period
function isSummerLeague() {
  const now = new Date();
  const year = now.getFullYear();
  const summerStart = new Date(year, 6, 10); // July 10 (month is 0-indexed)
  const summerEnd = new Date(year, 6, 21);   // July 21
  
  return now >= summerStart && now <= summerEnd;
}

// Function to get the appropriate league identifier
function getLeagueIdentifier() {
  return isSummerLeague() ? "nba-summer-las-vegas" : "nba";
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

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

let lastScheduleHash = null;

async function buildGameCard(game) {
  function getOrdinalSuffix(num) {
    if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
    switch (num % 10) {
      case 1: return `${num}st`;
      case 2: return `${num}nd`;
      case 3: return `${num}rd`;
      default: return `${num}th`;
    }
  }

  const currentPeriod = game?.competitions[0]?.status?.period
    ? `${getOrdinalSuffix(game.competitions[0].status.period)} Quarter`
    : "Unknown Period";

  const card = document.createElement("div");
  card.className = "game-card";

  if (game && game.status.type.description === "Scheduled") {
    const startTime = new Date(game.date).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

    const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home")?.team || {};
    const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away")?.team || {};
    const slug = game.season?.slug || "regular-season";

    const homeTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "home")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "away")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "away")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamShortName = adjustTeamShortName(awayTeam.shortDisplayName || "Unknown");
    const homeTeamShortName = adjustTeamShortName(homeTeam.shortDisplayName || "Unknown");

    card.innerHTML = `
      <div class="game-card scheduled-game-card">
        <div class="game-headline">${headline}</div>
        <div class="game-content">
          <div class="team away-team">
            <img src="${awayTeam.logo || ""}" alt="${awayTeam.displayName || "Unknown"}" class="card-team-logo">
            <div class="card-team-name">${awayTeamShortName}</div>
            <div class="card-team-record">${awayTeamRecord}</div>
          </div>
          <div class="game-info">
            <div class="game-status">Scheduled</div>
            <div class="game-time">${startTime}</div>
          </div>
          <div class="team home-team">
            <img src="${homeTeam.logo || ""}" alt="${homeTeam.displayName || "Unknown"}" class="card-team-logo">
            <div class="card-team-name">${homeTeamShortName}</div>
            <div class="card-team-record">${homeTeamRecord}</div>
          </div>
        </div>
      </div>
    `;
  } else if (game && game.status.type.description === "Final") {
    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

    const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home")?.team;
    const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away")?.team;
    const homeTeamScore = game.competitions[0].competitors.find(c => c.homeAway === "home")?.score || "0";
    const awayTeamScore = game.competitions[0].competitors.find(c => c.homeAway === "away")?.score || "0";
    const slug = game.season?.slug || "regular-season";

    const homeTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "home")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "away")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "away")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamShortName = adjustTeamShortName(awayTeam?.shortDisplayName || "Unknown");
    const homeTeamShortName = adjustTeamShortName(homeTeam?.shortDisplayName || "Unknown");

    card.innerHTML = `
      <div class="game-card final-game-card">
        <div class="game-headline">${headline}</div>
        <div class="game-content">
          <div class="team away-team">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${awayTeam?.logo || ""}" alt="${awayTeam?.displayName || "Unknown"}" class="card-team-logo">
              <span class="card-team-score">${awayTeamScore}</span>
            </div>
            <div class="card-team-name">${awayTeamShortName}</div>
            <div class="card-team-record">${awayTeamRecord}</div>
          </div>
          <div class="game-info">
            <div class="line"></div>
            <div class="game-status">Final</div>
          </div>
          <div class="team home-team">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="card-team-score">${homeTeamScore}</span>
              <img src="${homeTeam?.logo || ""}" alt="${homeTeam?.displayName || "Unknown"}" class="card-team-logo">
            </div>
            <div class="card-team-name">${homeTeamShortName}</div>
            <div class="card-team-record">${homeTeamRecord}</div>
          </div>
        </div>
      </div>
    `;
  } else if (game && (game.status.type.description === "In Progress" || game.status.type.description === "Halftime" || game.status.type.description === "End of Period")) {
    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

    const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home")?.team;
    const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away")?.team;
    const homeTeamScore = game.competitions[0].competitors.find(c => c.homeAway === "home")?.score || "0";
    const awayTeamScore = game.competitions[0].competitors.find(c => c.homeAway === "away")?.score || "0";
    const slug = game.season?.slug || "regular-season";

    const homeTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "home")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "away")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "away")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamShortName = adjustTeamShortName(awayTeam?.shortDisplayName || "Unknown");
    const homeTeamShortName = adjustTeamShortName(homeTeam?.shortDisplayName || "Unknown");

    const clockTime = game?.competitions[0]?.status?.displayClock;
    const isHalftime = game?.competitions[0]?.status?.type?.description === "Halftime";
    const isEndOfPeriod = game?.competitions[0]?.status?.type?.description === "End of Period";
    const periodDescription = isHalftime
      ? "Halftime"
      : isEndOfPeriod
      ? `End of ${currentPeriod}`
      : currentPeriod;

    card.innerHTML = `
      <div class="game-card in-progress-game-card">
        <div class="game-headline">${headline}</div>
        <div class="game-content">
          <div class="team away-team">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${awayTeam?.logo || ""}" alt="${awayTeam?.displayName || "Unknown"}" class="card-team-logo">
              <span class="card-team-score">${awayTeamScore}</span>
            </div>
            <div class="card-team-name">${awayTeamShortName}</div>
            <div class="card-team-record">${awayTeamRecord}</div>
          </div>
          <div class="game-info">
            <div class="line"></div>
            ${isHalftime || isEndOfPeriod ? "" : `<div class="game-status">${clockTime}</div>`}
            <div class="game-period" style="margin-top:${isHalftime || isEndOfPeriod ? "0" : "-20px"};">${periodDescription}</div>
          </div>
          <div class="team home-team">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="card-team-score">${homeTeamScore}</span>
              <img src="${homeTeam?.logo || ""}" alt="${homeTeam?.displayName || "Unknown"}" class="card-team-logo">
            </div>
            <div class="card-team-name">${homeTeamShortName}</div>
            <div class="card-team-record">${homeTeamRecord}</div>
          </div>
        </div>
      </div>
    `;
  }
  
  // Add click handler to navigate to respective page
  card.addEventListener('click', () => {
    window.location.href = `scoreboard.html?gameId=${game.id}`;
  });
  
  card.style.cursor = 'pointer';
  
  return card;
}

async function displayGames(games, sectionId, containerId, noGamesId) {
  const section = document.getElementById(sectionId);
  const container = document.getElementById(containerId);
  const noGamesDiv = document.getElementById(noGamesId);

  if (games.length === 0) {
    container.style.display = "none";
    noGamesDiv.style.display = "flex";
    section.style.display = "block";
    return;
  }

  container.style.display = "flex";
  noGamesDiv.style.display = "none";
  section.style.display = "block";

  // Clear existing content
  container.innerHTML = '';
  
  for (const game of games) {
    const gameCard = await buildGameCard(game);
    container.appendChild(gameCard);
  }
}

async function fetchAndDisplayAllGames() {
  try {
    const adjustedDate = getAdjustedDateForNBA();
    const leagueId = getLeagueIdentifier();
    const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/basketball/${leagueId}/scoreboard?dates=${adjustedDate}`;

    const scoreboardResponse = await fetch(SCOREBOARD_API_URL);
    const scoreboardText = await scoreboardResponse.text();
    const newHash = hashString(scoreboardText);

    if (newHash === lastScheduleHash) {
      console.log("No changes detected in the schedule.");
      return;
    }
    lastScheduleHash = newHash;

    const scoreboardData = JSON.parse(scoreboardText);
    const games = scoreboardData.events || [];

    // Remove duplicates
    const seenGameIds = new Set();
    const uniqueGames = games.filter(game => {
      if (seenGameIds.has(game.id)) {
        return false;
      }
      seenGameIds.add(game.id);
      return true;
    });

    // Separate games by status and sort by time
    const liveGames = uniqueGames.filter(game => 
      ["In Progress", "Halftime", "End of Period"].includes(game.status.type.description)
    ).sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const scheduledGames = uniqueGames.filter(game => 
      game.status.type.description === "Scheduled"
    ).sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const finishedGames = uniqueGames.filter(game => 
      game.status.type.description === "Final"
    ).sort((a, b) => new Date(a.date) - new Date(b.date));

    await displayGames(liveGames, 'live-section', 'liveGamesContainer', 'no-live-games');
    await displayGames(scheduledGames, 'scheduled-section', 'scheduledGamesContainer', 'no-scheduled-games');
    await displayGames(finishedGames, 'finished-section', 'finishedGamesContainer', 'no-finished-games');
  } catch (error) {
    console.error("Error fetching NBA games:", error);
  }
}

// Initialize page
document.addEventListener("DOMContentLoaded", function() {
  fetchAndDisplayAllGames();
  setInterval(fetchAndDisplayAllGames, 2000); // Refresh every 2 seconds
});

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
    card.className = "game-card scheduled-game-card";
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
    `;
  } else if (game && game.status.type.description === "Final") {
    card.className = "game-card final-game-card";
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

    const homeScore = game.competitions[0].competitors.find(c => c.homeAway === "home")?.score || 0;
    const awayScore = game.competitions[0].competitors.find(c => c.homeAway === "away")?.score || 0;
    const awayTeamShortName = adjustTeamShortName(awayTeam.shortDisplayName || "Unknown");
    const homeTeamShortName = adjustTeamShortName(homeTeam.shortDisplayName || "Unknown");

    card.innerHTML = `
      <div class="game-headline">${headline}</div>
      <div class="game-content">
        <div class="team away-team">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${awayTeam.logo || ""}" alt="${awayTeam.displayName || "Unknown"}" class="card-team-logo">
            <span class="card-team-score">${awayScore}</span>
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
            <span class="card-team-score">${homeScore}</span>
            <img src="${homeTeam.logo || ""}" alt="${homeTeam.displayName || "Unknown"}" class="card-team-logo">
          </div>
          <div class="card-team-name">${homeTeamShortName}</div>
          <div class="card-team-record">${homeTeamRecord}</div>
        </div>
      </div>
    `;
  } else if (game && (game.status.type.description === "In Progress" || game.status.type.state === "in")) {
    card.className = "game-card in-progress-game-card";
    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";
    const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home")?.team || {};
    const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away")?.team || {};
    const homeScore = game.competitions[0].competitors.find(c => c.homeAway === "home")?.score || 0;
    const awayScore = game.competitions[0].competitors.find(c => c.homeAway === "away")?.score || 0;
    const slug = game.season?.slug || "regular-season";

    const homeTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "home")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "away")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "away")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamShortName = adjustTeamShortName(awayTeam.shortDisplayName || "Unknown");
    const homeTeamShortName = adjustTeamShortName(homeTeam.shortDisplayName || "Unknown");

    const clock = game.competitions[0].status?.displayClock || "00:00";
    const isHalftime = game?.competitions[0]?.status?.type?.description === "Halftime";
    const isEndOfPeriod = game?.competitions[0]?.status?.type?.description === "End of Period";
    const periodDescription = isHalftime
      ? "Halftime"
      : isEndOfPeriod
      ? `End of ${currentPeriod}`
      : currentPeriod;

    card.innerHTML = `
      <div class="game-headline">${headline}</div>
      <div class="game-content">
        <div class="team away-team">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${awayTeam.logo || ""}" alt="${awayTeam.displayName || "Unknown"}" class="card-team-logo">
            <span class="card-team-score">${awayScore}</span>
          </div>
          <div class="card-team-name">${awayTeamShortName}</div>
          <div class="card-team-record">${awayTeamRecord}</div>
        </div>
        <div class="game-info">
          <div class="line"></div>
          ${isHalftime || isEndOfPeriod ? "" : `<div class="game-status">${clock}</div>`}
          <div class="game-period" style="margin-top:${isHalftime || isEndOfPeriod ? "0" : "-20px"};">${periodDescription}</div>
        </div>
        <div class="team home-team">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="card-team-score">${homeScore}</span>
            <img src="${homeTeam.logo || ""}" alt="${homeTeam.displayName || "Unknown"}" class="card-team-logo">
          </div>
          <div class="card-team-name">${homeTeamShortName}</div>
          <div class="card-team-record">${homeTeamRecord}</div>
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


async function fetchWNBAGames() {
  try {
    const adjustedDate = getAdjustedDateForNBA();
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${adjustedDate}`);
    const data = await response.json();
    const games = data.events || [];

    const currentTime = new Date();
    
    const liveGames = games.filter(game => 
      game.status.type.description === "In Progress" || game.status.type.state === "in"
    );
    
    const scheduledGames = games.filter(game => 
      game.status.type.description === "Scheduled" && new Date(game.date) > currentTime
    ).sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const finishedGames = games.filter(game => 
      game.status.type.description === "Final"
    ).sort((a, b) => new Date(b.date) - new Date(a.date));

    // Display games using the displayGames function
    await displayGames(liveGames, "live-section", "liveGamesContainer", "no-live-games");
    await displayGames(scheduledGames, "scheduled-section", "scheduledGamesContainer", "no-scheduled-games");
    await displayGames(finishedGames, "finished-section", "finishedGamesContainer", "no-finished-games");

  } catch (error) {
    console.error("Error fetching WNBA games:", error);
  }
}

fetchWNBAGames();
setInterval(fetchWNBAGames, 2000);
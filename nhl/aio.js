function getAdjustedDateForNBA() {
  const now = new Date();
  const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  if (estNow.getHours() < 2) {
    estNow.setDate(estNow.getDate() - 1);
  }
  return estNow.toISOString().split('T')[0];
}

const teamColors = {
  "24": "#F47A38", "53": "#8C2633", "6": "#FFB81C", "7": "#002654",
  "20": "#C8102E", "12": "#CC0000", "16": "#CF0A2C", "21": "#6F263D",
  "29": "#041E42", "25": "#006847", "17": "#CE1126", "22": "#041E42",
  "13": "#041E42", "26": "#111111", "30": "#154734", "8": "#AF1E2D",
  "18": "#FFB81C", "1": "#CE1126", "2": "#00539B", "3": "#0038A8",
  "9": "#C8102E", "4": "#F74902", "5": "#FCB514", "28": "#006D75",
  "55": "#001628", "19": "#002F87", "14": "#002868", "10": "#00205B",
  "23": "#00205B", "54": "#B4975A", "15": "#041E42", "52": "#041E42"
};

async function getLogoUrl(triCode) {
  return `https://assets.nhle.com/logos/nhl/svg/${triCode}_dark.svg`;
}

function wrapTeamName(name) {
  const words = name.split(" ");
  if (words.length > 1) {
    return `${words[0][0]}. ${words.slice(1).join(" ")}`;
  }
  return name;
}

async function fetchTimeRemaining(gameId) {
  try {
    const res = await fetch(`https://corsproxy.io/?url=https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`);
    const data = await res.json();
    return data.clock?.inIntermission ? "End" : data.clock?.timeRemaining || "00:00";
  } catch (err) {
    console.error(`Error fetching timeRemaining for game ${gameId}:`, err);
    return "00:00";
  }
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

  const card = document.createElement("div");

  if (game && game.gameState === 1) { // Scheduled
    card.className = "game-card scheduled-game-card";
    const startTime = new Date(game.startTimeUTC).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const awayTeam = game.awayTeam;
    const homeTeam = game.homeTeam;
    const awayLogo = await getLogoUrl(awayTeam.abbrev);
    const homeLogo = await getLogoUrl(homeTeam.abbrev);
    const awayTeamName = wrapTeamName(awayTeam.placeName.default);
    const homeTeamName = wrapTeamName(homeTeam.placeName.default);

    card.innerHTML = `
      <div class="game-content">
        <div class="team away-team">
          <img src="${awayLogo}" alt="${awayTeam.commonName.default}" class="card-team-logo">
          <div class="card-team-name">${awayTeamName}</div>
        </div>
        <div class="game-info">
          <div class="game-status">Scheduled</div>
          <div class="game-time">${startTime}</div>
        </div>
        <div class="team home-team">
          <img src="${homeLogo}" alt="${homeTeam.commonName.default}" class="card-team-logo">
          <div class="card-team-name">${homeTeamName}</div>
        </div>
      </div>
    `;
  } else if (game && (game.gameState === 4 || game.gameState === 5)) { // Final
    card.className = "game-card finished-game-card";
    const awayTeam = game.awayTeam;
    const homeTeam = game.homeTeam;
    const awayScore = game.awayTeam.score || 0;
    const homeScore = game.homeTeam.score || 0;
    const awayLogo = await getLogoUrl(awayTeam.abbrev);
    const homeLogo = await getLogoUrl(homeTeam.abbrev);
    const awayTeamName = wrapTeamName(awayTeam.placeName.default);
    const homeTeamName = wrapTeamName(homeTeam.placeName.default);

    const seriesStatus = game.seriesStatus?.topSeedWins && game.seriesStatus?.bottomSeedWins
      ? `${game.seriesStatus.topSeedTeamAbbrev} leads ${game.seriesStatus.topSeedWins}-${game.seriesStatus.bottomSeedWins}`
      : "";

    card.innerHTML = `
      <div class="game-content">
        <div class="team away-team">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${awayLogo}" alt="${awayTeam.commonName.default}" class="card-team-logo">
            <span class="card-team-score">${awayScore}</span>
          </div>
          <div class="card-team-name">${awayTeamName}</div>
        </div>
        <div class="game-info">
          <div class="line"></div>
          <div class="game-status">Final${game.periodDescriptor?.periodType === "OT" ? "/OT" : ""}</div>
          ${seriesStatus ? `<div class="series-status">${seriesStatus}</div>` : ""}
        </div>
        <div class="team home-team">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="card-team-score">${homeScore}</span>
            <img src="${homeLogo}" alt="${homeTeam.commonName.default}" class="card-team-logo">
          </div>
          <div class="card-team-name">${homeTeamName}</div>
        </div>
      </div>
    `;
  } else if (game && (game.gameState === 3 || game.gameState === 2)) { // In Progress
    card.className = "game-card in-progress-game-card";
    const awayTeam = game.awayTeam;
    const homeTeam = game.homeTeam;
    const awayScore = game.awayTeam.score || 0;
    const homeScore = game.homeTeam.score || 0;
    const awayLogo = await getLogoUrl(awayTeam.abbrev);
    const homeLogo = await getLogoUrl(homeTeam.abbrev);
    const awayTeamName = wrapTeamName(awayTeam.placeName.default);
    const homeTeamName = wrapTeamName(homeTeam.placeName.default);

    const timeRemaining = await fetchTimeRemaining(game.id);
    const period = game.periodDescriptor?.number || 1;
    const periodType = game.periodDescriptor?.periodType || "REG";
    const isIntermission = game.clock?.inIntermission || false;

    const periodText = periodType === "OT" ? "OT" : 
                      periodType === "SO" ? "SO" : 
                      `${getOrdinalSuffix(period)} Period`;

    const seriesStatus = game.seriesStatus?.topSeedWins && game.seriesStatus?.bottomSeedWins
      ? `${game.seriesStatus.topSeedTeamAbbrev} leads ${game.seriesStatus.topSeedWins}-${game.seriesStatus.bottomSeedWins}`
      : "";

    card.innerHTML = `
      <div class="game-content">
        <div class="team away-team">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${awayLogo}" alt="${awayTeam.commonName.default}" class="card-team-logo">
            <span class="card-team-score">${awayScore}</span>
          </div>
          <div class="card-team-name">${awayTeamName}</div>
        </div>
        <div class="game-info">
          <div class="line"></div>
          ${!isIntermission ? `<div class="game-status">${timeRemaining}</div>` : ""}
          <div class="game-period" style="margin-top:${isIntermission ? "0" : "-20px"};">${isIntermission ? `End of ${periodText}` : periodText}</div>
          ${seriesStatus ? `<div class="series-status">${seriesStatus}</div>` : ""}
        </div>
        <div class="team home-team">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="card-team-score">${homeScore}</span>
            <img src="${homeLogo}" alt="${homeTeam.commonName.default}" class="card-team-logo">
          </div>
          <div class="card-team-name">${homeTeamName}</div>
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

async function fetchNHLGames() {
  try {
    const today = getAdjustedDateForNBA();
    const proxyUrl = 'https://api.allorigins.win/raw?url=';
    const apiUrl = `https://api-web.nhle.com/v1/schedule/${today}`;
    const response = await fetch(proxyUrl + encodeURIComponent(apiUrl));
    const data = await response.json();
    const games = data.gameWeek?.flatMap(day => day.games) || [];

    const currentTime = new Date();
    
    const liveGames = games.filter(game => 
      game.gameState === 3 || game.gameState === 2
    );
    
    const scheduledGames = games.filter(game => 
      game.gameState === 1 && new Date(game.startTimeUTC) > currentTime
    ).sort((a, b) => new Date(a.startTimeUTC) - new Date(b.startTimeUTC));
    
    const finishedGames = games.filter(game => 
      game.gameState === 4 || game.gameState === 5
    ).sort((a, b) => new Date(b.startTimeUTC) - new Date(a.startTimeUTC));

    // Display games using the displayGames function
    await displayGames(liveGames, "live-section", "liveGamesContainer", "no-live-games");
    await displayGames(scheduledGames, "scheduled-section", "scheduledGamesContainer", "no-scheduled-games");
    await displayGames(finishedGames, "finished-section", "finishedGamesContainer", "no-finished-games");

  } catch (error) {
    console.error("Error fetching NHL games:", error);
  }
}

fetchNHLGames();
setInterval(fetchNHLGames, 2000);

const CORS_PROXY = "https://corsproxy.io/?url=";

async function getLogoUrl(teamTriCode) {
  return `${CORS_PROXY}https://assets.nhle.com/logos/nhl/svg/${teamTriCode}_dark.svg`;
}

function wrapTeamName(name) {
    const words = name.split(" ");
    if (words.length > 1) {
      return `${words[0][0]}. ${words.slice(1).join(" ")}`;
    }
    return name;
  }

async function buildCardContent(awayTeam, homeTeam, startTime, seriesStatus) {
  const awayLogo = await getLogoUrl(awayTeam.abbrev);
  const homeLogo = await getLogoUrl(homeTeam.abbrev);

  const awayAbbrev = awayTeam.abbrev;
  const homeAbbrev = homeTeam.abbrev;

  const awayRecord =
    seriesStatus.topSeedTeamAbbrev === awayAbbrev
      ? `${seriesStatus.topSeedWins}-${seriesStatus.bottomSeedWins}`
      : `${seriesStatus.bottomSeedWins}-${seriesStatus.topSeedWins}`;

  const homeRecord =
    seriesStatus.topSeedTeamAbbrev === homeAbbrev
      ? `${seriesStatus.topSeedWins}-${seriesStatus.bottomSeedWins}`
      : `${seriesStatus.bottomSeedWins}-${seriesStatus.topSeedWins}`;
  const seriesInfo = `${seriesStatus.seriesAbbrev || "N/A"} - Game ${seriesStatus.gameNumberOfSeries || "N/A"}`;

  return `
    <div style="display: flex; flex-direction: column; justify-content: space-between; align-items: center; height: 100%;">
      <div style="font-size: 0.8rem; color: grey; text-align: center;">${seriesInfo}</div>
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${awayLogo}" alt="${awayTeam.commonName.default}" style="width: 60px; height: 40px;">
            <span style="font-size: 0.9rem;">${awayRecord}</span>
          </div>
          <div style="margin-top: 6px; font-weight: bold;">${wrapTeamName(awayTeam.commonName.default)}</div>
        </div>
        <div style="font-size: 1.1rem; font-weight: bold;">${startTime}</div>
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 0.9rem;">${homeRecord}</span>
            <img src="${homeLogo}" alt="${homeTeam.commonName.default}" style="width: 60px; height: 40px;">
          </div>
          <div style="margin-top: 6px; font-weight: bold;">${wrapTeamName(homeTeam.commonName.default)}</div>
        </div>
      </div>
    </div>
  `;
}

const scheduledGameElements = new Map();

function getAdjustedDateForNHL() {
  const now = new Date();
  const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  if (estNow.getHours() < 2) {
    estNow.setDate(estNow.getDate() - 1);
  }
  const adjustedDate = estNow.getFullYear() + "-" +
                       String(estNow.getMonth() + 1).padStart(2, "0") + "-" +
                       String(estNow.getDate()).padStart(2, "0");

  return adjustedDate;
}

let lastScheduleHash = null;

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

async function loadScheduledGames() {
  try {
    const today = getAdjustedDateForNHL();
    const res = await fetch(`${CORS_PROXY}https://api-web.nhle.com/v1/schedule/${today}`);
    const text = await res.text();
    const newHash = hashString(text);

    if (newHash === lastScheduleHash) {
      return;
    }
    lastScheduleHash = newHash;

    const data = JSON.parse(text);
    const games = data.gameWeek?.[0]?.games || [];
    const container = document.getElementById("gamesContainer");

    const validStatuses = ["PRE", "OK", "FUT"];
    const seenGameIds = new Set();
    const scheduledGames = games.filter(game =>
      validStatuses.includes(game.gameState) &&
      !seenGameIds.has(game.id) &&
      seenGameIds.add(game.id)
    );

    const currentGameIds = new Set();

    if (scheduledGames.length === 0) {
      container.innerHTML = `<div class="game-card">No scheduled games at the moment.</div>`;
      scheduledGameElements.clear();
      return;
    }

    for (const game of scheduledGames) {
      const gameId = game.id;
      currentGameIds.add(gameId);

      const awayTeam = game.awayTeam;
      const homeTeam = game.homeTeam;
      const startTime = new Date(game.startTimeUTC).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", hour12: true
      });
      const seriesStatus = game.seriesStatus || { topSeedWins: 0, bottomSeedWins: 0 };

      const newContent = await buildCardContent(awayTeam, homeTeam, startTime, seriesStatus);

      if (!scheduledGameElements.has(gameId)) {
        const card = document.createElement("div");
        card.className = "game-card";
        card.style.color = "#fff";
        card.style.width = "300px";
        card.dataset.content = newContent;
        card.innerHTML = newContent;
        scheduledGameElements.set(gameId, card);
        container.appendChild(card);
      } else {
        const existingCard = scheduledGameElements.get(gameId);
        if (existingCard.dataset.content !== newContent) {
          existingCard.innerHTML = newContent;
          existingCard.dataset.content = newContent;
        }
      }
    }

    for (const [gameId, card] of scheduledGameElements.entries()) {
      if (!currentGameIds.has(gameId)) {
        card.remove();
        scheduledGameElements.delete(gameId);
      }
    }

  } catch (err) {
    console.error("Error loading scheduled games:", err);
  }
}

loadScheduledGames();
setInterval(loadScheduledGames, 2000);

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

async function buildFinalCardContent(awayTeam, homeTeam, awayScore, homeScore, seriesStatus, periodDescriptor) {
  const awayLogo = await getLogoUrl(awayTeam.abbrev);
  const homeLogo = await getLogoUrl(homeTeam.abbrev);
  const awayIsWinner = awayScore > homeScore;
  const homeIsWinner = homeScore > awayScore;

  // Determine series info
  let seriesInfo = "";
  if (seriesStatus.topSeedWins > seriesStatus.bottomSeedWins) {
    seriesInfo = `${seriesStatus.topSeedTeamAbbrev} ${seriesStatus.topSeedWins}-${seriesStatus.bottomSeedWins}`;
  } else if (seriesStatus.bottomSeedWins > seriesStatus.topSeedWins) {
    seriesInfo = `${seriesStatus.bottomSeedTeamAbbrev} ${seriesStatus.bottomSeedWins}-${seriesStatus.topSeedWins}`;
  } else {
    seriesInfo = `Tied ${seriesStatus.topSeedWins}-${seriesStatus.bottomSeedWins}`;
  }

  const seriesDetails = `${seriesStatus.seriesAbbrev || "N/A"} - Game ${seriesStatus.gameNumberOfSeries || "N/A"}`;

  return `
    <div style="display: flex; flex-direction: column; justify-content: space-between; align-items: center; height: 100%;">
      <div style="font-size: 0.8rem; color: grey; text-align: center;">${seriesDetails}</div>
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${awayLogo}" alt="${awayTeam.commonName.default}" style="width: 75px; height: 60px;">
            <span style="font-size: 2.2rem; ${awayIsWinner ? 'font-weight: bold;' : ''}">${awayScore}</span>
          </div>
          <div style="margin-top: 6px; ${awayIsWinner ? 'font-weight: bold;' : ''}">${wrapTeamName(awayTeam.commonName.default)}</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 1.1rem; font-weight: bold;">${periodDescriptor.periodType === "OT" ? "Final/OT" : "Final"}</div>
          <div style="font-size: 0.9rem; color: grey; margin-top: 8px;">${seriesInfo}</div>
        </div>
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 2.2rem; ${homeIsWinner ? 'font-weight: bold;' : ''}">${homeScore}</span>
            <img src="${homeLogo}" alt="${homeTeam.commonName.default}" style="width: 75px; height: 60px;">
          </div>
          <div style="margin-top: 6px; ${homeIsWinner ? 'font-weight: bold;' : ''}">${wrapTeamName(homeTeam.commonName.default)}</div>
        </div>
      </div>
    </div>
  `;
}

const finishedGameElements = new Map();

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

async function loadFinishedGames() {
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

    const validStatuses = ["OFF", "FINAL"];
    const seenGameIds = new Set();
    const finishedGames = games.filter(game =>
      validStatuses.includes(game.gameState) &&
      !seenGameIds.has(game.id) &&
      seenGameIds.add(game.id)
    );

    const currentGameIds = new Set();

    if (finishedGames.length === 0) {
      container.innerHTML = `<div class="game-card">No finished games yet.</div>`;
      finishedGameElements.clear();
      return;
    }

    for (const game of finishedGames) {
      const gameId = game.id;
      currentGameIds.add(gameId);

      const awayTeam = game.awayTeam;
      const homeTeam = game.homeTeam;
      const awayScore = game.awayTeam.score;
      const homeScore = game.homeTeam.score;
      const seriesStatus = game.seriesStatus || { topSeedWins: 0, bottomSeedWins: 0 };
      const periodDescriptor = game.periodDescriptor;

      const newContent = await buildFinalCardContent(awayTeam, homeTeam, awayScore, homeScore, seriesStatus, periodDescriptor);

      if (!finishedGameElements.has(gameId)) {
        const card = document.createElement("div");
        card.className = "game-card";
        card.style.color = "#fff";
        card.style.width = "300px";
        card.dataset.content = newContent;
        card.innerHTML = newContent;

        // Add event listener to redirect to scoreboard.html
        card.addEventListener("click", () => {
          window.location.href = `scoreboard.html?gameId=${gameId}`;
        });

        finishedGameElements.set(gameId, card);
        container.appendChild(card);
      } else {
        const existingCard = finishedGameElements.get(gameId);
        if (existingCard.dataset.content !== newContent) {
          existingCard.innerHTML = newContent;
          existingCard.dataset.content = newContent;
        }
      }
    }

    for (const [gameId, card] of finishedGameElements.entries()) {
      if (!currentGameIds.has(gameId)) {
        card.remove();
        finishedGameElements.delete(gameId);
      }
    }

  } catch (err) {
    console.error("Error loading finished games:", err);
  }
}

loadFinishedGames();
setInterval(loadFinishedGames, 2000);

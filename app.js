const BASE_URL = "https://statsapi.mlb.com";
const SCHEDULE_URL = `${BASE_URL}/api/v1/schedule/games/?sportId=1`;

const teamAbbrMap = {
  "Arizona Diamondbacks": "ari_l",
  "Atlanta Braves": "atl_l",
  "Baltimore Orioles": "bal_l",
  "Boston Red Sox": "bos_l",
  "Chicago White Sox": "cws_l",
  "Chicago Cubs": "chc_l",
  "Cincinnati Reds": "cin_l",
  "Cleveland Guardians": "cle_l",
  "Colorado Rockies": "col_l",
  "Detroit Tigers": "det_l",
  "Houston Astros": "hou_l",
  "Kansas City Royals": "kc_l",
  "Los Angeles Angels": "laa_l",
  "Los Angeles Dodgers": "lad_l",
  "Miami Marlins": "mia_l",
  "Milwaukee Brewers": "mil_l",
  "Minnesota Twins": "min_l",
  "New York Yankees": "nyy_l",
  "New York Mets": "nym_l",
  "Athletics": "oak_l",
  "Philadelphia Phillies": "phi_l",
  "Pittsburgh Pirates": "pit_l",
  "San Diego Padres": "sd_l",
  "San Francisco Giants": "sf_l",
  "Seattle Mariners": "sea_l",
  "St. Louis Cardinals": "stl_l",
  "Tampa Bay Rays": "tb_l",
  "Texas Rangers": "tex_l",
  "Toronto Blue Jays": "tor_l",
  "Washington Nationals": "wsh_l"
};

function getLogoUrl(teamName) {
  const abbr = teamAbbrMap[teamName];
  return abbr
    ? `https://raw.githubusercontent.com/MLBAMGames/mlb_teams_logo_svg/main/light/${abbr}.svg`
    : "";
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

const gameElements = new Map();

async function fetchLiveGame() {
  try {
    const res = await fetch(SCHEDULE_URL);
    const data = await res.json();
    const games = data.dates?.[0]?.games || [];

    const liveGames = games.filter(game =>
      game.status.detailedState === "In Progress" ||
      game.status.detailedState === "Manager Challenge"
    );

    const container = document.getElementById("gamesContainer");

    if (liveGames.length === 0) {
      if (!document.querySelector(".no-games")) {
        container.innerHTML = `
          <div class="game-block no-games">
            <p>No current games in progress.</p>
          </div>
        `;
      }
      gameElements.clear();
      return;
    }

    // Keep track of which games are still active
    const currentGamePks = new Set();

    for (const game of liveGames) {
      const { gamePk, gameDate, teams, status } = game;
      currentGamePks.add(gamePk);

      let gameDiv = gameElements.get(gamePk);
      const away = teams.away;
      const home = teams.home;

      const awayLogo = getLogoUrl(away.team.name);
      const homeLogo = getLogoUrl(home.team.name);

      if (!gameDiv) {
        gameDiv = document.createElement("div");
        gameDiv.className = "game-block";
        gameDiv.innerHTML = `
          <div class="matchup">
            <div class="team-column">
              <img src="${awayLogo}" alt="${away.team.name}" class="team-logo">
              <div class="team-score" id="awayScore-${gamePk}">${away.score}</div>
            </div>
            <div class="team-column">
              <img src="${homeLogo}" alt="${home.team.name}" class="team-logo">
              <div class="team-score" id="homeScore-${gamePk}">${home.score}</div>
            </div>
          </div>
          <div class="state" id="state-${gamePk}">${status.detailedState} - ${new Date(gameDate).toLocaleTimeString()}</div>
          <div class="inningInfo" id="inningInfo-${gamePk}"></div>
          <div class="count" id="count-${gamePk}"></div>
          <div class="base-diamond">
            <div class="base base-second" id="secondBase-${gamePk}"></div>
            <div class="base base-third" id="thirdBase-${gamePk}"></div>
            <div class="base base-first" id="firstBase-${gamePk}"></div>
          </div>
        `;
        container.appendChild(gameDiv);
        gameElements.set(gamePk, gameDiv);
      }

      // Update existing score and status
      const awayScoreEl = document.getElementById(`awayScore-${gamePk}`);
      const homeScoreEl = document.getElementById(`homeScore-${gamePk}`);

      awayScoreEl.textContent = away.score;
      homeScoreEl.textContent = home.score;

      awayScoreEl.style.fontWeight = "normal";
      homeScoreEl.style.fontWeight = "normal";
      if (away.score > home.score) {
        awayScoreEl.style.fontWeight = "bold";
      } else if (home.score > away.score) {
        homeScoreEl.style.fontWeight = "bold";
      }

      document.getElementById(`state-${gamePk}`).textContent =
        `${status.detailedState} - ${new Date(gameDate).toLocaleTimeString()}`;

      fetchGameDetails(gamePk);
    }

    // Remove finished games from DOM
    for (const [gamePk, element] of gameElements.entries()) {
      if (!currentGamePks.has(gamePk)) {
        element.remove();
        gameElements.delete(gamePk);
      }
    }
  } catch (err) {
    console.error("Error fetching live game data:", err);
  }
}

async function fetchGameDetails(gamePk) {
  try {
    const res = await fetch(`${BASE_URL}/api/v1.1/game/${gamePk}/feed/live`);
    const data = await res.json();

    const play = data.liveData?.plays?.currentPlay;
    if (!play) return;

    const { halfInning, isTopInning, inning } = play.about;
    const { balls, strikes, outs } = play.count;

    const inningInfoEl = document.getElementById(`inningInfo-${gamePk}`);
    const countEl = document.getElementById(`count-${gamePk}`);

    if (inningInfoEl) {
      inningInfoEl.textContent = `${isTopInning ? "Top" : "Bottom"} of ${getOrdinalSuffix(inning)} Inning`;
    }

    if (countEl) {
      countEl.textContent = `Balls: ${balls} • Strikes: ${strikes} • Outs: ${outs}`;
    }

    const baseFirst = document.getElementById(`firstBase-${gamePk}`);
    const baseSecond = document.getElementById(`secondBase-${gamePk}`);
    const baseThird = document.getElementById(`thirdBase-${gamePk}`);

    [baseFirst, baseSecond, baseThird].forEach(base => base?.classList.remove("occupied"));

    if (play.postOnFirst?.id > 0) baseFirst?.classList.add("occupied");
    if (play.postOnSecond?.id > 0) baseSecond?.classList.add("occupied");
    if (play.postOnThird?.id > 0) baseThird?.classList.add("occupied");

  } catch (err) {
    console.error(`Error fetching details for game ${gamePk}:`, err);
  }
}

fetchLiveGame();
setInterval(fetchLiveGame, 5000);

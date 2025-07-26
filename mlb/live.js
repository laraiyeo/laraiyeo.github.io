const BASE_URL = "https://statsapi.mlb.com";
const SCHEDULE_URL = `${BASE_URL}/api/v1/schedule/games/?sportId=1`;

const teamAbbrMap = {
    "Arizona Diamondbacks": "ari_l", "Atlanta Braves": "atl_l", "Baltimore Orioles": "bal_l", "Boston Red Sox": "bos_l",
    "Chicago White Sox": "cws_l", "Chicago Cubs": "chc_l", "Cincinnati Reds": "cin_l", "Cleveland Guardians": "cle_l",
    "Colorado Rockies": "col_l", "Detroit Tigers": "det_l", "Houston Astros": "hou_l", "Kansas City Royals": "kc_l",
    "Los Angeles Angels": "laa_l", "Los Angeles Dodgers": "lad_l", "Miami Marlins": "mia_l", "Milwaukee Brewers": "mil_l",
    "Minnesota Twins": "min_l", "New York Yankees": "nyy_l", "New York Mets": "nym_l", "Athletics": "oak_l",
    "Philadelphia Phillies": "phi_l", "Pittsburgh Pirates": "pit_l", "San Diego Padres": "sd_l", "San Francisco Giants": "sf_l",
    "Seattle Mariners": "sea_l", "St. Louis Cardinals": "stl_l", "Tampa Bay Rays": "tb_l", "Texas Rangers": "tex_l",
    "Toronto Blue Jays": "tor_l", "Washington Nationals": "wsh_l"
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

function getAdjustedDateForMLB() {
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

async function fetchLiveGame() {
 try {
    const today = getAdjustedDateForMLB();
    const url = `${SCHEDULE_URL}&startDate=${today}&endDate=${today}`;
  
    const res = await fetch(url);
    const text = await res.text();
    const newHash = hashString(text);

    if (newHash === lastScheduleHash) {
      return;
    }
    lastScheduleHash = newHash;

    const data = JSON.parse(text);
    const games = data.dates?.[0]?.games || [];

    const liveGames = games.filter(game =>
        game.status.detailedState === "In Progress" ||
        game.status.detailedState === "Manager challenge" ||
        game.status.codedGameState === "M"
      );      

    const container = document.getElementById("gamesContainer");

    if (liveGames.length === 0) {
      if (!document.querySelector(".no-games")) {
        container.innerHTML = `
          <div class="game-block no-games">
            <p>No live games in progress.</p>
          </div>
        `;
      }
      gameElements.clear();
      return;
    }

    const currentGamePks = new Set();

    for (const game of liveGames) {
      const { gamePk, gameDate, teams, status } = game;
      currentGamePks.add(gamePk);

      let gameDiv = gameElements.get(gamePk);
      const away = teams.away;
      const home = teams.home;
      let awayLogo, homeLogo;
    
     if (away.team.name === "American League All-Stars") {
      awayLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/331.svg`; 
      homeLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/332.svg`;
     } else if (away.team.name === "National League All-Stars") {
      awayLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/332.svg`; 
      homeLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/331.svg`;
     } else {
       awayLogo = getLogoUrl(away.team.name);
       homeLogo = getLogoUrl(home.team.name);
     }

      if (!gameDiv) {
        gameDiv = document.createElement("div");
        gameDiv.className = "game-block";
        gameDiv.innerHTML = `
          <div class="matchup" style="display: flex; justify-content: center; align-items: center; gap: 20px;">
            <div class="team-column" style="text-align: center;">
              <img src="${awayLogo}" alt="${away.team.name}" class="team-logo">
              <div class="team-score" id="awayScore-${gamePk}">${away.score}</div>
            </div>

            <div class="inning-display" id="inningInfo-${gamePk}" style="display: flex; flex-direction: column; align-items: center; font-size: 1rem; font-weight: bold; color: black;">
              <!-- Will be updated -->
            </div>

            <div class="team-column" style="text-align: center;">
              <img src="${homeLogo}" alt="${home.team.name}" class="team-logo">
              <div class="team-score" id="homeScore-${gamePk}">${home.score}</div>
            </div>
          </div>

          <div class="state" id="state-${gamePk}" style="margin-top: 8px; margin-bottom: 13px;">${status.detailedState} - ${new Date(gameDate).toLocaleTimeString()}</div>

          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div class="base-diamond">
              <div class="base base-second" id="secondBase-${gamePk}"></div>
              <div class="base base-third" id="thirdBase-${gamePk}"></div>
              <div class="base base-first" id="firstBase-${gamePk}"></div>
            </div>
            <div class="count-visual" id="countVisual-${gamePk}"></div>
          </div>
        `;
        container.appendChild(gameDiv);
        gameElements.set(gamePk, gameDiv);
      }

      document.getElementById(`awayScore-${gamePk}`).textContent = away.score;
      document.getElementById(`homeScore-${gamePk}`).textContent = home.score;

      const awayScoreEl = document.getElementById(`awayScore-${gamePk}`);
      const homeScoreEl = document.getElementById(`homeScore-${gamePk}`);

      awayScoreEl.style.fontWeight = "normal";
      homeScoreEl.style.fontWeight = "normal";
      if (away.score > home.score) {
        awayScoreEl.style.fontWeight = "bold";
      } else if (home.score > away.score) {
        homeScoreEl.style.fontWeight = "bold";
      }

      const stateText = status.codedGameState === "M" ? "Manager Challenge" : status.detailedState;
      document.getElementById(`state-${gamePk}`).textContent =
        `${stateText} - ${new Date(gameDate).toLocaleTimeString("en-US", {
          hour: "numeric", minute: "2-digit", hour12: true})}`;  

      fetchGameDetails(gamePk);

      gameDiv.addEventListener("click", () => {
        window.location.href = `scoreboard.html?gamePk=${gamePk}`;
      });
      
    }

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
    const text = await res.text();
    const newHash = hashString(text);

    if (newHash === lastScheduleHash) {
      return;
    }
    lastScheduleHash = newHash;

    const data = JSON.parse(text);

    const play = data.liveData?.plays?.currentPlay;
    if (!play) return;

    const { isTopInning, inning } = play.about;
    const { balls, strikes, outs } = play.count;

    const inningInfoEl = document.getElementById(`inningInfo-${gamePk}`);
    if (inningInfoEl) {
      inningInfoEl.innerHTML = `
        <div style="text-transform: uppercase; font-size: 0.8rem;">${isTopInning ? "Top" : "Bottom"}</div>
        <div style="font-size: 1.4rem;">${getOrdinalSuffix(inning)}</div>
      `;
    }

    const countVisual = document.getElementById(`countVisual-${gamePk}`);
    if (countVisual) {
      countVisual.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px; font-weight: bold; color: white;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="width: 16px; color: black;">B: </span>
            ${[...Array(4)].map((_, i) => `<div class="ball-dot ball ${i < balls ? 'active' : ''}"></div>`).join('')}
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="width: 16px; color: black;">S: </span>
            ${[...Array(3)].map((_, i) => `<div class="ball-dot strike ${i < strikes ? 'active' : ''}"></div>`).join('')}
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="width: 16px; color: black;">O: </span>
            ${[...Array(3)].map((_, i) => `<div class="ball-dot out ${i < outs ? 'active' : ''}"></div>`).join('')}
          </div>
        </div>
      `;
    }

    const baseFirst = document.getElementById(`firstBase-${gamePk}`);
    const baseSecond = document.getElementById(`secondBase-${gamePk}`);
    const baseThird = document.getElementById(`thirdBase-${gamePk}`);

    [baseFirst, baseSecond, baseThird].forEach(base => {
      if (base) base.classList.remove("occupied");
    });

    const matchup = play.matchup || {};
    if (matchup.postOnFirst?.id) baseFirst?.classList.add("occupied");
    if (matchup.postOnSecond?.id) baseSecond?.classList.add("occupied");
    if (matchup.postOnThird?.id) baseThird?.classList.add("occupied");

  } catch (err) {
    console.error(`Error fetching details for game ${gamePk}:`, err);
  }
}

fetchLiveGame();
setInterval(fetchLiveGame, 2000);

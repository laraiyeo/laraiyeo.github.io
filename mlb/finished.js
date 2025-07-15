const teamAbbrMap = {
    "Arizona Diamondbacks": "ari_d", "Atlanta Braves": "atl_l", "Baltimore Orioles": "bal_d", "Boston Red Sox": "bos_d",
    "Chicago White Sox": "cws_d", "Chicago Cubs": "chc_d", "Cincinnati Reds": "cin_d", "Cleveland Guardians": "cle_d",
    "Colorado Rockies": "col_d", "Detroit Tigers": "det_d", "Houston Astros": "hou_d", "Kansas City Royals": "kc_d",
    "Los Angeles Angels": "laa_d", "Los Angeles Dodgers": "lad_l", "Miami Marlins": "mia_d", "Milwaukee Brewers": "mil_d",
    "Minnesota Twins": "min_d", "New York Yankees": "nyy_d", "New York Mets": "nym_d", "Athletics": "oak_d",
    "Philadelphia Phillies": "phi_l", "Pittsburgh Pirates": "pit_d", "San Diego Padres": "sd_d", "San Francisco Giants": "sf_d",
    "Seattle Mariners": "sea_d", "St. Louis Cardinals": "stl_d", "Tampa Bay Rays": "tb_d", "Texas Rangers": "tex_d",
    "Toronto Blue Jays": "tor_d", "Washington Nationals": "wsh_d"
  };

  async function getLogoUrl(teamName) {
    const abbr = teamAbbrMap[teamName];
    if (!abbr) return "";
    const darkUrl = `https://raw.githubusercontent.com/MLBAMGames/mlb_teams_logo_svg/main/dark/${abbr}.svg`;
    const lightUrl = `https://raw.githubusercontent.com/MLBAMGames/mlb_teams_logo_svg/main/light/${abbr}.svg`;
  
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(darkUrl);
      img.onerror = () => resolve(lightUrl);
      img.src = darkUrl;
    });
  }

  async function getTeamNameById(id) {
    try {
      const res = await fetch(`https://statsapi.mlb.com/api/v1/teams/${id}`);
      const data = await res.json();
      return data.teams[0].teamName;
    } catch (err) {
      console.error("Error fetching team name for ID:", id, err);
      return "";
    }
  }

  async function buildFinalCardContent(awayFull, awayShort, awayScore, homeFull, homeShort, homeScore) {
    let awayLogo, homeLogo;
    
    if (awayShort === "AL All-Stars") {
      awayLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/331.svg`; 
      homeLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/332.svg`;
    } else if (awayShort === "NL All-Stars") {
      awayLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/332.svg`; 
      homeLogo = `https://sports.cbsimg.net/fly/images/team-logos/alt/light/331.svg`;
    } else {
      awayLogo = await getLogoUrl(awayFull);
      homeLogo = await getLogoUrl(homeFull);
    }

    const awayIsWinner = awayScore > homeScore;
    const homeIsWinner = homeScore > awayScore;
  
    return `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${awayLogo}" alt="${awayShort}" style="width: 45px; height: 45px;">
            <span style="font-size: 2.2rem; ${awayIsWinner ? 'font-weight: bold;' : ''}">${awayScore}</span>
          </div>
          <div style="margin-top: 6px; ${awayIsWinner ? 'font-weight: bold;' : ''}">${awayShort}</div>
        </div>
        <div style="position: absolute; left: 50%; transform: translateX(-50%); font-size: 1.1rem; font-weight: bold;">Final</div>
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px; flex-direction: row-reverse;">
            <img src="${homeLogo}" alt="${homeShort}" style="width: 45px; height: 45px;">
            <span style="font-size: 2.2rem; ${homeIsWinner ? 'font-weight: bold;' : ''}">${homeScore}</span>
          </div>
          <div style="margin-top: 6px; ${homeIsWinner ? 'font-weight: bold;' : ''}">${homeShort}</div>
        </div>
      </div>
    `;
  }

  const finishedGameElements = new Map();
  
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

  async function loadFinishedGames() {
    try {
      const today = getAdjustedDateForMLB();
      const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&startDate=${today}&endDate=${today}`);
      const text = await res.text();
      const newHash = hashString(text);

      if (newHash === lastScheduleHash) {
        return;
      }
      lastScheduleHash = newHash;

      const data = JSON.parse(text);
      const games = data.dates?.[0]?.games || [];
      const container = document.getElementById("gamesContainer");

      const seenGamePks = new Set();
      const finalGames = games.filter(game =>
        ["Final", "Game Over", "Completed Early"].includes(game.status.detailedState) &&
        !seenGamePks.has(game.gamePk) &&
        seenGamePks.add(game.gamePk)
      );

      const currentGamePks = new Set();

      if (finalGames.length === 0) {
        container.innerHTML = `<div class="game-card">No finished games yet.</div>`;
        finishedGameElements.clear();
        return;
      }

      for (const game of finalGames) {
        const gamePk = game.gamePk;
        currentGamePks.add(gamePk);

        const { teams } = game;
        const awayFull = teams.away.team.name;
        const homeFull = teams.home.team.name;
        const awayShort = await getTeamNameById(teams.away.team.id);
        const homeShort = await getTeamNameById(teams.home.team.id);
        const awayScore = teams.away.score;
        const homeScore = teams.home.score;

        const newContent = await buildFinalCardContent(awayFull, awayShort, awayScore, homeFull, homeShort, homeScore);

        if (!finishedGameElements.has(gamePk)) {
          const card = document.createElement("div");
          card.className = "game-card";
          card.style.color = "#fff";
          card.dataset.content = newContent;
          card.innerHTML = newContent;

          // Add event listener to redirect to scoreboard.html
          card.addEventListener("click", () => {
            window.location.href = `scoreboard.html?gamePk=${gamePk}`;
          });

          finishedGameElements.set(gamePk, card);
          container.appendChild(card);
        } else {
          const existingCard = finishedGameElements.get(gamePk);
          if (existingCard.dataset.content !== newContent) {
            existingCard.innerHTML = newContent;
            existingCard.dataset.content = newContent;
          }
        }
      }

      for (const [gamePk, card] of finishedGameElements.entries()) {
        if (!currentGamePks.has(gamePk)) {
          card.remove();
          finishedGameElements.delete(gamePk);
        }
      }

    } catch (err) {
      console.error("Error loading finished games:", err);
    }
  }
  
  loadFinishedGames();
  setInterval(loadFinishedGames, 2000);

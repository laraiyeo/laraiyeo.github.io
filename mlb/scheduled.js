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
  
  async function buildCardContent(awayFull, awayShort, awayRecord, homeFull, homeShort, homeRecord, startTime) {
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

    const isAllStar = awayShort === "AL All-Stars" || awayShort === "NL All-Stars" ||
                        homeShort === "AL All-Stars" || homeShort === "NL All-Stars";
  
    return `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px; flex-direction: ${isAllStar ? "row" : "column-reverse"};">
            <img src="${awayLogo}" alt="${awayShort}" style="width: ${isAllStar ? "100px" : "45px"}; height: 45px;">
            <span style="font-size: 0.95rem;">${isAllStar ? "" : awayRecord}</span>
          </div>
          <div style="margin-top: 6px; font-weight: bold;">${awayShort}</div>
        </div>
        <div style="position: absolute; left: 50%; transform: translateX(-50%); font-size: ${isAllStar ? "1.2rem" : "1.4rem"}; font-weight: bold;">${startTime}</div>
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px; flex-direction: ${isAllStar ? "row-reverse" : "column-reverse"};">
            <img src="${homeLogo}" alt="${homeShort}" style="width: ${isAllStar ? "100px" : "45px"}; height: 45px;">
            <span style="font-size: 0.95rem;">${isAllStar ? "" : homeRecord}</span>
          </div>
          <div style="margin-top: 6px; font-weight: bold;">${homeShort}</div>
        </div>
      </div>
    `;
  }
  
  const scheduledGameElements = new Map();
  
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

  async function loadScheduledGames() {
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
  
      const validStatuses = ["Scheduled", "Pre-Game", "Warmup"];
      const seenGamePks = new Set();
      const scheduledGames = games.filter(game =>
        validStatuses.includes(game.status.detailedState) &&
        !seenGamePks.has(game.gamePk) &&
        seenGamePks.add(game.gamePk)
      );
  
      const currentGamePks = new Set();
  
      if (scheduledGames.length === 0) {
        container.innerHTML = `<div class="game-card">No scheduled games at the moment.</div>`;
        scheduledGameElements.clear();
        return;
      }
  
      for (const game of scheduledGames) {
        const gamePk = game.gamePk;
        currentGamePks.add(gamePk);
  
        const { teams, gameDate } = game;
        const awayFull = teams.away.team.name;
        const homeFull = teams.home.team.name;
        const awayShort = await getTeamNameById(teams.away.team.id);
        const homeShort = await getTeamNameById(teams.home.team.id);
        const awayRecord = `${teams.away.leagueRecord.wins}-${teams.away.leagueRecord.losses}`;
        const homeRecord = `${teams.home.leagueRecord.wins}-${teams.home.leagueRecord.losses}`;
        const startTime = new Date(gameDate).toLocaleTimeString("en-US", {
          hour: "numeric", minute: "2-digit", hour12: true});
  
        const newContent = await buildCardContent(awayFull, awayShort, awayRecord, homeFull, homeShort, homeRecord, startTime);
  
        if (!scheduledGameElements.has(gamePk)) {
          const card = document.createElement("div");
          card.className = "game-card";
          card.style.color = "#fff";
          card.dataset.content = newContent;
          card.innerHTML = newContent;
          scheduledGameElements.set(gamePk, card);
          container.appendChild(card);
        } else {
          const existingCard = scheduledGameElements.get(gamePk);
          if (existingCard.dataset.content !== newContent) {
            existingCard.innerHTML = newContent;
            existingCard.dataset.content = newContent;
          }
        }
      }

      for (const [gamePk, card] of scheduledGameElements.entries()) {
        if (!currentGamePks.has(gamePk)) {
          card.remove();
          scheduledGameElements.delete(gamePk);
        }
      }
  
    } catch (err) {
      console.error("Error loading scheduled games:", err);
    }
  }
  
  loadScheduledGames();
  setInterval(loadScheduledGames, 2000);
  
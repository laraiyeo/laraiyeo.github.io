const teamAbbrMap = {
    "Arizona Diamondbacks": "ari_d",
    "Atlanta Braves": "atl_l",
    "Baltimore Orioles": "bal_d",
    "Boston Red Sox": "bos_d",
    "Chicago White Sox": "cws_d",
    "Chicago Cubs": "chc_d",
    "Cincinnati Reds": "cin_d",
    "Cleveland Guardians": "cle_d",
    "Colorado Rockies": "col_d",
    "Detroit Tigers": "det_d",
    "Houston Astros": "hou_d",
    "Kansas City Royals": "kc_d",
    "Los Angeles Angels": "laa_d",
    "Los Angeles Dodgers": "lad_l",
    "Miami Marlins": "mia_d",
    "Milwaukee Brewers": "mil_d",
    "Minnesota Twins": "min_d",
    "New York Yankees": "nyy_d",
    "New York Mets": "nym_d",
    "Athletics": "oak_d",
    "Philadelphia Phillies": "phi_l",
    "Pittsburgh Pirates": "pit_d",
    "San Diego Padres": "sd_d",
    "San Francisco Giants": "sf_d",
    "Seattle Mariners": "sea_d",
    "St. Louis Cardinals": "stl_d",
    "Tampa Bay Rays": "tb_d",
    "Texas Rangers": "tex_d",
    "Toronto Blue Jays": "tor_d",
    "Washington Nationals": "wsh_d"
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
    const awayLogo = await getLogoUrl(awayFull);
    const homeLogo = await getLogoUrl(homeFull);
  
    return `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${awayLogo}" alt="${awayShort}" style="width: 40px; height: 40px;">
            <span style="font-size: 0.9rem;">${awayRecord}</span>
          </div>
          <div style="margin-top: 6px; font-weight: bold;">${awayShort}</div>
        </div>
  
        <div style="font-size: 1.1rem; font-weight: bold;">${startTime}</div>
  
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 0.9rem;">${homeRecord}</span>
            <img src="${homeLogo}" alt="${homeShort}" style="width: 40px; height: 40px;">
          </div>
          <div style="margin-top: 6px; font-weight: bold;">${homeShort}</div>
        </div>
      </div>
    `;
  }
  
  const scheduledGameElements = new Map();
  
  async function loadScheduledGames() {
    try {
      const today = new Date().toISOString().split("T")[0];
      const url = `https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&startDate=${today}&endDate=${today}`;
      const res = await fetch(url);        
      const data = await res.json();
      const games = data.dates?.[0]?.games || [];
      const container = document.getElementById("gamesContainer");
  
      const validStatuses = ["Scheduled", "Pre-Game", "Warmup"];
  
      // Deduplicate games by gamePk
      const seenGamePks = new Set();
      const scheduledGames = [];
  
      for (const game of games) {
        if (validStatuses.includes(game.status.detailedState) && !seenGamePks.has(game.gamePk)) {
          seenGamePks.add(game.gamePk);
          scheduledGames.push(game);
        }
      }
  
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
        const awayId = teams.away.team.id;
        const homeId = teams.home.team.id;
  
        const awayShort = await getTeamNameById(awayId);
        const homeShort = await getTeamNameById(homeId);
  
        const awayRecord = `${teams.away.leagueRecord.wins}-${teams.away.leagueRecord.losses}`;
        const homeRecord = `${teams.home.leagueRecord.wins}-${teams.home.leagueRecord.losses}`;
  
        const startTime = new Date(gameDate).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "America/New_York"
        });
  
        let card = scheduledGameElements.get(gamePk);
        const newContent = await buildCardContent(awayFull, awayShort, awayRecord, homeFull, homeShort, homeRecord, startTime);
  
        if (card) {
          if (card.dataset.content !== newContent) {
            card.innerHTML = newContent;
            card.dataset.content = newContent;
          }
        } else {
          card = document.createElement("div");
          card.className = "game-card";
          card.style.color = "#fff";
          card.innerHTML = newContent;
          card.dataset.content = newContent;
  
          container.appendChild(card);
          scheduledGameElements.set(gamePk, card);
        }
      }
  
      // Remove outdated cards
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
  setInterval(loadScheduledGames, 1000);
  
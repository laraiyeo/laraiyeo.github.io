const teamAbbrMap = {
    "Arizona Diamondbacks": "ari_d",
    "Atlanta Braves": "atl_d",
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
    "Los Angeles Dodgers": "lad_d",
    "Miami Marlins": "mia_d",
    "Milwaukee Brewers": "mil_d",
    "Minnesota Twins": "min_d",
    "New York Yankees": "nyy_d",
    "New York Mets": "nym_d",
    "Athletics": "oak_d",
    "Philadelphia Phillies": "phi_d",
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
  
  function getLogoUrl(teamName) {
    const abbr = teamAbbrMap[teamName];
    return abbr
      ? `https://raw.githubusercontent.com/MLBAMGames/mlb_teams_logo_svg/main/dark/${abbr}.svg`
      : "";
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
  
  async function loadScheduledGames() {
    try {
      const res = await fetch("https://statsapi.mlb.com/api/v1/schedule?sportId=1");
      const data = await res.json();
      const games = data.dates[0]?.games || [];
      const container = document.getElementById("gamesContainer");
      container.innerHTML = "";
  
      if (games.length === 0) {
        container.innerHTML = `<div class="game-card">No scheduled games today.</div>`;
        return;
      }
  
      for (const game of games) {
        if (game.status.detailedState !== "Scheduled") continue;
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
  
        const card = document.createElement("div");
        card.className = "game-card";
        card.style.color = "#fff";
  
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="text-align: center;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <img src="${getLogoUrl(awayFull)}" alt="${awayShort}" style="width: 40px; height: 40px;">
                <span style="font-size: 0.9rem;">${awayRecord}</span>
              </div>
              <div style="margin-top: 6px; font-weight: bold;">${awayShort}</div>
            </div>
  
            <div style="font-size: 1.1rem; font-weight: bold;">${startTime}</div>
  
            <div style="text-align: center;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 0.9rem;">${homeRecord}</span>
                <img src="${getLogoUrl(homeFull)}" alt="${homeShort}" style="width: 40px; height: 40px;">
              </div>
              <div style="margin-top: 6px; font-weight: bold;">${homeShort}</div>
            </div>
          </div>
        `;
  
        container.appendChild(card);
      }
    } catch (err) {
      console.error("Error loading scheduled games:", err);
    }
  }
  
  loadScheduledGames();
  
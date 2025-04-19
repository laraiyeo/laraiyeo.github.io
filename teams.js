const teamAbbrMap = {
    "Arizona Diamondbacks": "ari_d", "Atlanta Braves": "atl_l", "Baltimore Orioles": "bal_l", "Boston Red Sox": "bos_d",
    "Chicago White Sox": "cws_d", "Chicago Cubs": "chc_d", "Cincinnati Reds": "cin_d", "Cleveland Guardians": "cle_l",
    "Colorado Rockies": "col_d", "Detroit Tigers": "det_d", "Houston Astros": "hou_d", "Kansas City Royals": "kc_d",
    "Los Angeles Angels": "laa_d", "Los Angeles Dodgers": "lad_l", "Miami Marlins": "mia_d", "Milwaukee Brewers": "mil_d",
    "Minnesota Twins": "min_d", "New York Yankees": "nyy_d", "New York Mets": "nym_d", "Athletics": "oak_l",
    "Philadelphia Phillies": "phi_l", "Pittsburgh Pirates": "pit_d", "San Diego Padres": "sd_d", "San Francisco Giants": "sf_d",
    "Seattle Mariners": "sea_d", "St. Louis Cardinals": "stl_d", "Tampa Bay Rays": "tb_d", "Texas Rangers": "tex_d",
    "Toronto Blue Jays": "tor_l", "Washington Nationals": "wsh_d"
  };
  
  const teamColors = {
    "Arizona Diamondbacks": "#A71930", "Atlanta Braves": "#13274F", "Baltimore Orioles": "#000000", "Boston Red Sox": "#0C2340",
    "Chicago White Sox": "#000000", "Chicago Cubs": "#0E3386", "Cincinnati Reds": "#C6011F", "Cleveland Guardians": "#0F223E",
    "Colorado Rockies": "#333366", "Detroit Tigers": "#0C2340", "Houston Astros": "#002D62", "Kansas City Royals": "#004687",
    "Los Angeles Angels": "#BA0021", "Los Angeles Dodgers": "#A5ACAF", "Miami Marlins": "#00A3E0", "Milwaukee Brewers": "#FFC52F",
    "Minnesota Twins": "#002B5C", "New York Yankees": "#003087", "New York Mets": "#002D72", "Athletics": "#EFB21E",
    "Philadelphia Phillies": "#E81828", "Pittsburgh Pirates": "#27251F", "San Diego Padres": "#2F241D", "San Francisco Giants": "#000000",
    "Seattle Mariners": "#005C5C", "St. Louis Cardinals": "#C41E3A", "Tampa Bay Rays": "#092C5C", "Texas Rangers": "#003278",
    "Toronto Blue Jays": "#1D2D5C", "Washington Nationals": "#AB0003"
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
    const awayLogo = await getLogoUrl(awayFull);
    const homeLogo = await getLogoUrl(homeFull);
    const awayIsWinner = awayScore > homeScore;
    const homeIsWinner = homeScore > awayScore;
  
    return `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${awayLogo}" alt="${awayShort}" style="width: 40px; height: 40px;">
            <span style="font-size: 2.2rem; ${awayIsWinner ? 'font-weight: bold;' : ''}">${awayScore}</span>
          </div>
          <div style="margin-top: 6px; ${awayIsWinner ? 'font-weight: bold;' : ''}">${awayShort}</div>
        </div>
        <div style="font-size: 1.1rem; font-weight: bold;">Final</div>
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 2.2rem; ${homeIsWinner ? 'font-weight: bold;' : ''}">${homeScore}</span>
            <img src="${homeLogo}" alt="${homeShort}" style="width: 40px; height: 40px;">
          </div>
          <div style="margin-top: 6px; ${homeIsWinner ? 'font-weight: bold;' : ''}">${homeShort}</div>
        </div>
      </div>
    `;
  }
  
  async function buildCard(game) {
    const { teams, status, gameDate } = game;
    const awayFull = teams.away.team.name;
    const homeFull = teams.home.team.name;
    const awayShort = await getTeamNameById(teams.away.team.id);
    const homeShort = await getTeamNameById(teams.home.team.id);
    const statusText = status.detailedState;
  
    const card = document.createElement("div");
    card.className = "game-card";
    card.style.color = "#fff";
  
    if (["In Progress", "Manager Challenge"].includes(statusText)) {
      const centerText = `${game.linescore?.inningHalf || ""} ${game.linescore?.currentInning || ""}`.trim();
      const awayBottom = teams.away.score;
      const homeBottom = teams.home.score;
  
      const awayLogo = await getLogoUrl(awayFull);
      const homeLogo = await getLogoUrl(homeFull);
  
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${awayLogo}" alt="${awayShort}" style="width: 40px; height: 40px;">
              <span style="font-size: 0.9rem;">${awayBottom}</span>
            </div>
            <div style="margin-top: 6px; font-weight: bold;">${awayShort}</div>
          </div>
          <div style="font-size: 1.1rem; font-weight: bold;">${centerText}</div>
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 0.9rem;">${homeBottom}</span>
              <img src="${homeLogo}" alt="${homeShort}" style="width: 40px; height: 40px;">
            </div>
            <div style="margin-top: 6px; font-weight: bold;">${homeShort}</div>
          </div>
        </div>
      `;
    } else if (["Scheduled", "Pre-Game", "Warmup"].includes(statusText)) {
      const startTime = new Date(gameDate).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York"
      });
      const awayRecord = `${teams.away.leagueRecord.wins}-${teams.away.leagueRecord.losses}`;
      const homeRecord = `${teams.home.leagueRecord.wins}-${teams.home.leagueRecord.losses}`;
      const awayLogo = await getLogoUrl(awayFull);
      const homeLogo = await getLogoUrl(homeFull);
  
      card.innerHTML = `
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
    } else if (statusText === "Final") {
      const content = await buildFinalCardContent(
        awayFull, awayShort, teams.away.score,
        homeFull, homeShort, teams.home.score
      );
      card.innerHTML = content;
    }
  
    return card;
  }
  
  const gamesByTeam = {};
  
  async function createTeamSection(teamName) {
    const container = document.getElementById("gamesContainer");
    const section = document.createElement("div");
    section.className = "team-section";
    section.style.backgroundColor = teamColors[teamName] || "#000000";
  
    const header = document.createElement("div");
    header.className = "team-header";
    const logoUrl = await getLogoUrl(teamName);
    header.innerHTML = `
      <img src="${logoUrl}" alt="${teamName}" class="team-logo"/>
      <h3>${teamName}</h3>
    `;
    section.appendChild(header);
  
    const gameList = document.createElement("div");
    gameList.className = "team-games";
  
    const games = gamesByTeam[teamName];
    if (!games || games.length === 0) {
      const noGameMsg = document.createElement("p");
      noGameMsg.textContent = "No games scheduled for today.";
      noGameMsg.style.color = "#fff";
      noGameMsg.style.textAlign = "center";
      noGameMsg.style.fontWeight = "bold";
      gameList.appendChild(noGameMsg);
    } else {
      for (const game of games) {
        const card = await buildCard(game);
        gameList.appendChild(card);
      }
    }
  
    section.appendChild(gameList);
    container.appendChild(section);
  }
  
  async function fetchGames() {
    const today = new Date().toISOString().split("T")[0];
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=linescore,team`;
  
    try {
      const res = await fetch(url);
      const data = await res.json();
      const games = data.dates[0]?.games || [];
  
      for (const game of games) {
        const awayTeam = game.teams.away.team.name;
        const homeTeam = game.teams.home.team.name;
  
        if (!gamesByTeam[awayTeam]) gamesByTeam[awayTeam] = [];
        if (!gamesByTeam[homeTeam]) gamesByTeam[homeTeam] = [];
  
        gamesByTeam[awayTeam].push(game);
        gamesByTeam[homeTeam].push(game);
      }
  
      for (const teamName of Object.keys(teamAbbrMap)) {
        await createTeamSection(teamName);
      }
    } catch (err) {
      console.error("Error fetching games:", err);
    }
  }
  
  fetchGames();
  
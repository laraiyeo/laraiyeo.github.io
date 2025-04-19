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
  
  async function buildFinalCardContent(awayFull, awayShort, awayScore, homeFull, homeShort, homeScore) {
    const awayLogo = await getLogoUrl(awayFull);
    const homeLogo = await getLogoUrl(homeFull);
  
    const awayIsWinner = awayScore > homeScore;
    const homeIsWinner = homeScore > awayScore;
  
    const awayScoreStyle = `font-size: 2.2rem; ${awayIsWinner ? 'font-weight: bold;' : ''}`;
    const homeScoreStyle = `font-size: 2.2rem; ${homeIsWinner ? 'font-weight: bold;' : ''}`;
    const awayNameStyle = `margin-top: 6px; ${awayIsWinner ? 'font-weight: bold;' : 'font-weight: normal;'}`;
    const homeNameStyle = `margin-top: 6px; ${homeIsWinner ? 'font-weight: bold;' : 'font-weight: normal;'}`;
  
    return `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${awayLogo}" alt="${awayShort}" style="width: 40px; height: 40px;">
            <span style="${awayScoreStyle}">${awayScore}</span>
          </div>
          <div style="${awayNameStyle}">${awayShort}</div>
        </div>
  
        <div style="font-size: 1.1rem; font-weight: bold;">Final</div>
  
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="${homeScoreStyle}">${homeScore}</span>
            <img src="${homeLogo}" alt="${homeShort}" style="width: 40px; height: 40px;">
          </div>
          <div style="${homeNameStyle}">${homeShort}</div>
        </div>
      </div>
    `;
  }  
  
  const finishedGameElements = new Map();
  
  async function loadFinishedGames() {
    try {
      const res = await fetch("https://statsapi.mlb.com/api/v1/schedule?sportId=1");
      const data = await res.json();
      const games = data.dates?.[0]?.games || [];
      const container = document.getElementById("gamesContainer");
  
      const finalGames = games.filter(game => game.status.detailedState === "Final");
  
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
        const awayId = teams.away.team.id;
        const homeId = teams.home.team.id;
  
        const awayShort = await getTeamNameById(awayId);
        const homeShort = await getTeamNameById(homeId);
  
        const awayScore = teams.away.score;
        const homeScore = teams.home.score;
  
        let card = finishedGameElements.get(gamePk);
        const newContent = await buildFinalCardContent(awayFull, awayShort, awayScore, homeFull, homeShort, homeScore);
  
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
          finishedGameElements.set(gamePk, card);
        }
      }
  
      // Clean up
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
  setInterval(loadFinishedGames, 1000);
  
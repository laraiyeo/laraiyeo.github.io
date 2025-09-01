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
  
  const renderedGameCards = new Map();
  const createdSections = new Set();
  
  // Convert hex color to rgba with opacity
  function hexToRgba(hex, opacity) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  
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
  
  function getInningLabel(inningHalf) {
    return inningHalf === "Bottom" ? "Bot" : inningHalf === "Top" ? "Top" : inningHalf;
  }
  
  function getBaseHtml(matchup) {
    const filled = {
      first: matchup?.postOnFirst?.id,
      second: matchup?.postOnSecond?.id,
      third: matchup?.postOnThird?.id,
    };
  
    return `
      <div class="small-base-diamond">
        <div class="small-base small-base-second ${filled.second ? "occupied" : ""}"></div>
        <div class="small-base small-base-third ${filled.third ? "occupied" : ""}"></div>
        <div class="small-base small-base-first ${filled.first ? "occupied" : ""}"></div>
      </div>
    `;
  }  


  async function buildFinalCardContent(awayFull, awayShort, awayScore, homeFull, homeShort, homeScore, inning, extraInning) {
    const awayLogo = await getLogoUrl(awayFull);
    const homeLogo = await getLogoUrl(homeFull);
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
        <div style="position: absolute; left: 50%; transform: translateX(-50%); font-size: 1.4rem; font-weight: bold;">Final${extraInning ? `/${inning}` : ''}</div>
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
  
  async function buildCard(game) {
    const { teams, status, gameDate } = game;
    const awayFull = teams.away.team.name;
    const homeFull = teams.home.team.name;
    const awayShort = await getTeamNameById(teams.away.team.id);
    const homeShort = await getTeamNameById(teams.home.team.id);
    const inning = game.linescore?.currentInning;
    const extraInning = inning > 9;
    const statusText = status.detailedState;
    const card = document.createElement("div");
    card.className = "game-card";
    card.setAttribute('data-game-pk', game.gamePk.toString());
    
    // Apply custom styles if available
    if (typeof window !== 'undefined' && window.getCustomStyles) {
      const customStyles = window.getCustomStyles();
      const opacity = customStyles.backgroundOpacity / 100;
      const bgColor = hexToRgba(customStyles.backgroundColor, opacity);
      card.style.backgroundColor = bgColor;
      card.style.color = customStyles.textColor;
    } else {
      card.style.color = "#fff";
    }
  
    if (["In Progress", "Manager challenge"].includes(statusText) || status.codedGameState === "M") {
        const inningLabel = getInningLabel(game.linescore?.inningHalf) || "Inning";
        const centerText = `${inningLabel} ${game.linescore?.currentInning || ""}`.trim();
        const awayScore = teams.away.score || 0;
        const homeScore = teams.home.score || 0;
        const awayLogo = await getLogoUrl(awayFull);
        const homeLogo = await getLogoUrl(homeFull);
        const leadingAway = awayScore > homeScore;
        const leadingHome = homeScore > awayScore;
        const outs = game.linescore?.outs || 0;
      
        const gamePk = game.gamePk;
        let matchup = {};
        try {
          const res = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
          const data = await res.json();
          matchup = data?.liveData?.plays?.currentPlay?.matchup || {};
        } catch (err) {
          console.error(`Error fetching live feed for game ${gamePk}`, err);
        }
      
        const baseHtml = getBaseHtml(matchup);
      
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="text-align: center;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <img src="${awayLogo}" alt="${awayShort}" style="width: 45px; height: 45px;">
                <span style="font-size: 2rem; ${leadingAway ? 'font-weight: bold;' : ''}">${awayScore}</span>
              </div>
              <div style="margin-top: 6px; font-weight: bold;">${awayShort}</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.1rem; font-weight: bold;">${centerText}</div>
              <div style="font-size: 0.85rem; margin-top: 4px;">Outs: ${outs}</div>
              ${baseHtml}
            </div>
            <div style="text-align: center;">
              <div style="display: flex; align-items: center; gap: 8px; flex-direction: row-reverse;">
                <img src="${homeLogo}" alt="${homeShort}" style="width: 45px; height: 45px;">
                <span style="font-size: 2rem; ${leadingHome ? 'font-weight: bold;' : ''}">${homeScore}</span>
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
          <div style="display: flex; align-items: center; gap: 8px; flex-direction: column-reverse;">
            <img src="${awayLogo}" alt="${awayShort}" style="width: 45px; height: 45px;">
            <span style="font-size: 0.95rem;">${awayRecord}</span>
          </div>
          <div style="margin-top: 6px; font-weight: bold;">${awayShort}</div>
        </div>
        <div style="position: absolute; left: 50%; transform: translateX(-50%); font-size: 1.4rem; font-weight: bold;">${startTime}</div>
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px; flex-direction: column-reverse;">
            <img src="${homeLogo}" alt="${homeShort}" style="width: 45px; height: 45px;">
            <span style="font-size: 0.95rem;">${homeRecord}</span>
          </div>
          <div style="margin-top: 6px; font-weight: bold;">${homeShort}</div>
        </div>
      </div>
    `;
    } else if (statusText === "Postponed") {
      const awayRecord = `${teams.away.leagueRecord.wins}-${teams.away.leagueRecord.losses}`;
      const homeRecord = `${teams.home.leagueRecord.wins}-${teams.home.leagueRecord.losses}`;
      const awayLogo = await getLogoUrl(awayFull);
      const homeLogo = await getLogoUrl(homeFull);
  
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px; flex-direction: column-reverse;">
              <img src="${awayLogo}" alt="${awayShort}" style="width: 45px; height: 45px;">
             <span style="font-size: 0.95rem;">${awayRecord}</span>
            </div>
            <div style="margin-top: 6px; font-weight: bold;">${awayShort}</div>
          </div>
          <div style="position: absolute; left: 50%; transform: translateX(-50%); font-size: 1.3rem; font-weight: bold;">PPD</div>
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px; flex-direction: column-reverse;">
              <img src="${homeLogo}" alt="${homeShort}" style="width: 45px; height: 45px;">
              <span style="font-size: 0.95rem;">${homeRecord}</span>
            </div>
            <div style="margin-top: 6px; font-weight: bold;">${homeShort}</div>
          </div>
        </div>
      `;
    } else if (statusText === "Final","Game Over") {
      card.innerHTML = await buildFinalCardContent(
        awayFull, awayShort, teams.away.score,
        homeFull, homeShort, teams.home.score, inning, extraInning
      );
    }
    return card;
  }
  
  async function createTeamSection(teamName) {
    if (createdSections.has(teamName)) return;

    const container = document.getElementById("gamesContainer");
    const section = document.createElement("div");
    section.className = "team-section";
    section.style.backgroundColor = teamColors[teamName] || "#000";

    const header = document.createElement("div");
    header.className = "team-header";
    const logoUrl = await getLogoUrl(teamName);
    header.innerHTML = `
      <img src="${logoUrl}" alt="${teamName}" class="team-logo" />
      <h2>${teamName}</h2>
    `;
    section.appendChild(header);

    const gameList = document.createElement("div");
    gameList.className = "team-games";
    section.appendChild(gameList);
    container.appendChild(section);

    createdSections.add(teamName);

    // Make the entire section clickable
    section.addEventListener("click", async () => {
      const currentStyles = loadSavedStyles();
      const params = new URLSearchParams();
      params.set('team', teamName);
      params.set('bgColor', currentStyles.backgroundColor);
      params.set('bgOpacity', currentStyles.backgroundOpacity);
      params.set('textColor', currentStyles.textColor);
      
      const url = `https://laraiyeo.github.io/mlb/team.html?${params.toString()}`;

      try {
        await navigator.clipboard.writeText(url);
        alert(`OBS link copied for ${teamName}: ${url}`);
      } catch (err) {
        console.error("Failed to copy OBS link:", err);
      }
    });
  }
  
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
  
  async function fetchGames() {
    const today = getAdjustedDateForMLB();
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=linescore,team`;
  
    try {
      const res = await fetch(url);
      const text = await res.text();
      const newHash = hashString(text);
  
      if (newHash === lastScheduleHash) {
        return;
      }
      lastScheduleHash = newHash;
  
      const data = JSON.parse(text);
      const games = data.dates[0]?.games || [];

      const gameMap = {};
      const uniqueTeams = new Set();

      for (const game of games) {
        const away = game.teams.away.team.name;
        const home = game.teams.home.team.name;
        
        // Store arrays of games for each team to handle doubleheaders
        if (!gameMap[away]) gameMap[away] = [];
        if (!gameMap[home]) gameMap[home] = [];
        
        gameMap[away].push(game);
        gameMap[home].push(game);
        uniqueTeams.add(away);
        uniqueTeams.add(home);
      }      const sortedTeams = Object.keys(teamAbbrMap).sort();
  
      for (const team of sortedTeams) {
        await createTeamSection(team);

        const section = [...document.querySelectorAll(".team-section")]
          .find(s => s.querySelector("h2")?.textContent === team);

        const container = section.querySelector(".team-games");

        const teamGames = gameMap[team];

        if (teamGames && teamGames.length > 0) {
          // Sort games by game time to ensure consistent order for doubleheaders
          teamGames.sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
          
          // For doubleheaders, intelligently pick which game to show
          let gameToShow;
          if (teamGames.length === 1) {
            // Single game - show it
            gameToShow = teamGames[0];
          } else {
            // Multiple games (doubleheader) - show the appropriate one
            const firstGame = teamGames[0];
            const secondGame = teamGames[1];
            
            // Check if first game is finished
            const firstGameFinished = firstGame.status.detailedState === "Final" || 
                                     firstGame.status.detailedState === "Game Over";
            
            // Check if second game is live or in progress
            const secondGameLive = ["In Progress", "Manager challenge"].includes(secondGame.status.detailedState) || 
                                  secondGame.status.codedGameState === "M";
            
            if (firstGameFinished && !secondGameLive) {
              // First game finished, second game not started yet - show second game
              gameToShow = secondGame;
            } else if (firstGameFinished && secondGameLive) {
              // First game finished, second game is live - show second game
              gameToShow = secondGame;
            } else {
              // First game not finished yet (scheduled, in progress, etc.) - show first game
              gameToShow = firstGame;
            }
          }
          
          const gameKey = `${gameToShow.gamePk}-${team}`;
          const newCard = await buildCard(gameToShow);
          const newCardHtml = newCard.innerHTML;
          const prevHtml = renderedGameCards.get(gameKey);
          
          // Check if we need to update the display
          const existingCard = container.querySelector(`[data-game-pk="${gameToShow.gamePk}"]`);
          
          if (!existingCard) {
            // No card for this game exists, replace container content
            container.innerHTML = "";
            container.appendChild(newCard);
            renderedGameCards.set(gameKey, newCardHtml);
            
            // Clean up cache for other games that are no longer displayed
            for (const game of teamGames) {
              if (game.gamePk !== gameToShow.gamePk) {
                const otherGameKey = `${game.gamePk}-${team}`;
                renderedGameCards.delete(otherGameKey);
              }
            }
          } else if (prevHtml !== newCardHtml) {
            // Card exists but content changed - update it
            existingCard.replaceWith(newCard);
            renderedGameCards.set(gameKey, newCardHtml);
          }
        } else {
          const existingNoGame = container.querySelector(".no-game-card");
          if (!existingNoGame) {
            const logoUrl = await getLogoUrl(team);
            const noGameCard = document.createElement("div");
            noGameCard.className = "game-card no-game-card";
            noGameCard.style.display = "flex";
            noGameCard.style.alignItems = "center";
            noGameCard.style.gap = "35px";
            noGameCard.style.padding = "20px";

            // Apply custom styles
            const currentStyles = loadSavedStyles();
            const opacity = currentStyles.backgroundOpacity / 100;
            const bgColor = hexToRgba(currentStyles.backgroundColor, opacity);
            noGameCard.style.backgroundColor = bgColor;
            noGameCard.style.color = currentStyles.textColor;

            noGameCard.innerHTML = `
              <img src="${logoUrl}" alt="${team} logo" style="width: 50px; height: 50px;">
              <div style="font-weight: bold; color: inherit;">No game scheduled <br> for today</div>
            `;

            container.innerHTML = "";
            container.appendChild(noGameCard);
          }
        }
      }
    } catch (err) {
      console.error("Error fetching games:", err);
    }
  }
  
  fetchGames();
  setInterval(fetchGames, 2000);

  // Game Card Customization functionality
  const defaultStyles = {
    backgroundColor: '#000000',
    backgroundOpacity: 100,
    textColor: '#ffffff'
  };

  // Load saved styles or use defaults
  function loadSavedStyles() {
    // Check for URL parameters first
    const urlParams = new URLSearchParams(window.location.search);
    const urlBgColor = urlParams.get('bgColor');
    const urlBgOpacity = urlParams.get('bgOpacity');
    const urlTextColor = urlParams.get('textColor');

    if (urlBgColor || urlBgOpacity || urlTextColor) {
      return {
        backgroundColor: urlBgColor || defaultStyles.backgroundColor,
        backgroundOpacity: urlBgOpacity !== null ? parseInt(urlBgOpacity) : defaultStyles.backgroundOpacity,
        textColor: urlTextColor || defaultStyles.textColor
      };
    }

    const saved = localStorage.getItem('mlb-game-card-styles');
    return saved ? JSON.parse(saved) : defaultStyles;
  }

  // Check if we're in URL parameter mode (styles locked by OBS link)
  function isUrlParameterMode() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.has('bgColor') || urlParams.has('bgOpacity') || urlParams.has('textColor');
  }

  // Save styles to localStorage (only if not in URL parameter mode)
  function saveStyles(styles) {
    if (!isUrlParameterMode()) {
      localStorage.setItem('mlb-game-card-styles', JSON.stringify(styles));
    }
  }

  // Apply styles to all game cards
  function applyStylesToCards(styles) {
    const gameCards = document.querySelectorAll('.game-card');
    gameCards.forEach(card => {
      const opacity = styles.backgroundOpacity / 100;
      const bgColor = hexToRgba(styles.backgroundColor, opacity);
      card.style.setProperty('background-color', bgColor, 'important');
      card.style.setProperty('color', styles.textColor, 'important');
    });
  }

  // Convert hex color to rgba with opacity
  function hexToRgba(hex, opacity) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  // Validate hex color
  function isValidHex(hex) {
    return /^#[0-9A-F]{6}$/i.test(hex);
  }

  // Update preview colors
  function updatePreviews(styles) {
    document.getElementById('bg-preview').style.backgroundColor = styles.backgroundColor;
    document.getElementById('text-preview').style.backgroundColor = styles.textColor;
  }

  // Set up customization controls
  function initializeCustomization() {
    const currentStyles = loadSavedStyles();
    const urlMode = isUrlParameterMode();
    
    // Get control elements
    const bgColorPicker = document.getElementById('bg-color-picker');
    const bgColorHex = document.getElementById('bg-color-hex');
    const bgOpacitySlider = document.getElementById('bg-opacity-slider');
    const bgOpacityInput = document.getElementById('bg-opacity-input');
    const textColorPicker = document.getElementById('text-color-picker');
    const textColorHex = document.getElementById('text-color-hex');
    const resetButton = document.getElementById('reset-styles');

    // If in URL parameter mode, disable all controls and show message
    if (urlMode) {
      const panel = document.getElementById('customization-panel') || document.querySelector('.customization-panel');
      if (panel) {
        panel.style.opacity = '0.6';
        panel.style.pointerEvents = 'none';
        const message = document.createElement('div');
        message.style.cssText = 'background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin-bottom: 10px; border-radius: 4px; color: #856404; font-weight: bold; text-align: center;';
        message.textContent = '🔒 Styles are locked by OBS link parameters. Controls are disabled.';
        panel.insertBefore(message, panel.firstChild);
      }
    }

    // Set initial values
    bgColorPicker.value = currentStyles.backgroundColor;
    bgColorHex.value = currentStyles.backgroundColor;
    bgOpacitySlider.value = currentStyles.backgroundOpacity;
    bgOpacityInput.value = currentStyles.backgroundOpacity;
    textColorPicker.value = currentStyles.textColor;
    textColorHex.value = currentStyles.textColor;

    updatePreviews(currentStyles);
    applyStylesToCards(currentStyles);

    // Background color picker change
    bgColorPicker.addEventListener('change', (e) => {
      if (urlMode) return;
      const color = e.target.value;
      bgColorHex.value = color;
      currentStyles.backgroundColor = color;
      updatePreviews(currentStyles);
      applyStylesToCards(currentStyles);
      saveStyles(currentStyles);
    });

    // Background color hex input change
    bgColorHex.addEventListener('input', (e) => {
      if (urlMode) return;
      const color = e.target.value;
      if (isValidHex(color)) {
        bgColorPicker.value = color;
        currentStyles.backgroundColor = color;
        updatePreviews(currentStyles);
        applyStylesToCards(currentStyles);
        saveStyles(currentStyles);
      }
    });

    // Background opacity slider change
    bgOpacitySlider.addEventListener('input', (e) => {
      if (urlMode) return;
      const opacity = parseInt(e.target.value);
      bgOpacityInput.value = opacity;
      currentStyles.backgroundOpacity = opacity;
      applyStylesToCards(currentStyles);
      saveStyles(currentStyles);
    });

    // Background opacity input change
    bgOpacityInput.addEventListener('input', (e) => {
      if (urlMode) return;
      const opacity = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
      bgOpacitySlider.value = opacity;
      e.target.value = opacity;
      currentStyles.backgroundOpacity = opacity;
      applyStylesToCards(currentStyles);
      saveStyles(currentStyles);
    });

    // Text color picker change
    textColorPicker.addEventListener('change', (e) => {
      if (urlMode) return;
      const color = e.target.value;
      textColorHex.value = color;
      currentStyles.textColor = color;
      updatePreviews(currentStyles);
      applyStylesToCards(currentStyles);
      saveStyles(currentStyles);
    });

    // Text color hex input change
    textColorHex.addEventListener('input', (e) => {
      if (urlMode) return;
      const color = e.target.value;
      if (isValidHex(color)) {
        textColorPicker.value = color;
        currentStyles.textColor = color;
        updatePreviews(currentStyles);
        applyStylesToCards(currentStyles);
        saveStyles(currentStyles);
      }
    });

    // Reset button
    resetButton.addEventListener('click', () => {
      if (urlMode) return;
      // Reset to defaults
      bgColorPicker.value = defaultStyles.backgroundColor;
      bgColorHex.value = defaultStyles.backgroundColor;
      bgOpacitySlider.value = defaultStyles.backgroundOpacity;
      bgOpacityInput.value = defaultStyles.backgroundOpacity;
      textColorPicker.value = defaultStyles.textColor;
      textColorHex.value = defaultStyles.textColor;

      // Update current styles explicitly
      currentStyles.backgroundColor = defaultStyles.backgroundColor;
      currentStyles.backgroundOpacity = defaultStyles.backgroundOpacity;
      currentStyles.textColor = defaultStyles.textColor;
      
      updatePreviews(currentStyles);
      applyStylesToCards(currentStyles);
      saveStyles(currentStyles);
    });

    // AIO OBS Link button
    const aioObsButton = document.getElementById('aio-obs-link');
    if (aioObsButton) {
      aioObsButton.addEventListener('click', async () => {
        const currentStyles = loadSavedStyles();
        
        // Load AIO page styles from localStorage (same key as aio.js uses)
        const savedPageStyles = localStorage.getItem('mlb-aio-page-styles');
        const aioPageStyles = savedPageStyles ? JSON.parse(savedPageStyles) : {
          backgroundColor: '#ebebeb',
          backgroundOpacity: 100,
          textColor: '#000000'
        };
        
        const params = new URLSearchParams();
        
        // Game card styling parameters
        params.set('bgColor', currentStyles.backgroundColor);
        params.set('bgOpacity', currentStyles.backgroundOpacity);
        params.set('textColor', currentStyles.textColor);
        
        // Page styling parameters (use actual saved values from AIO page)
        params.set('pageBgColor', aioPageStyles.backgroundColor);
        params.set('pageBgOpacity', aioPageStyles.backgroundOpacity);
        params.set('pageTextColor', aioPageStyles.textColor);
        
        const url = `https://laraiyeo.github.io/mlb/aio-obs.html?${params.toString()}`;

        try {
          await navigator.clipboard.writeText(url);
          alert(`AIO OBS link copied: ${url}`);
        } catch (err) {
          console.error("Failed to copy AIO OBS link:", err);
          // Fallback: show the URL in a prompt
          prompt("Copy this AIO OBS link:", url);
        }
      });
    }

    // Apply styles when new cards are created (no longer needed as buildCard handles it)
    
    // Re-apply styles periodically to catch any dynamically created cards
    setInterval(() => {
      const currentStyles = loadSavedStyles();
      applyStylesToCards(currentStyles);
    }, 5000);
  }

  // Initialize customization after DOM is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCustomization);
  } else {
    initializeCustomization();
  }

  // Make functions available globally for the team.html page
  window.getCustomStyles = loadSavedStyles;
  window.applyCustomStyles = applyStylesToCards;

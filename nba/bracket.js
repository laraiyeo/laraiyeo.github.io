const currentYear = new Date().getFullYear();
const PLAYOFFS_API_URL = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${currentYear}0418-${currentYear}0701`;

let lastBracketHash = null;

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

async function fetchAndUpdateBracket() {
  try {
    const response = await fetch(PLAYOFFS_API_URL);
    const text = await response.text();
    const newHash = hashString(text);

    if (newHash === lastBracketHash) {
      // No changes, skip update
      return;
    }

    lastBracketHash = newHash;
    const data = JSON.parse(text);
    const games = data.events.filter(game => game.season.slug === "post-season");

    // Use a temporary container to compare HTML and avoid jitter
    const bracketContainer = document.getElementById("bracketContainer");
    if (!bracketContainer) {
      console.error("Bracket container not found.");
      return;
    }
    const tempContainer = document.createElement("div");
    tempContainer.className = "bracket-container";
    await renderBracket(games, tempContainer);

    if (bracketContainer.innerHTML !== tempContainer.innerHTML) {
      bracketContainer.innerHTML = tempContainer.innerHTML;
    }
  } catch (error) {
    console.error("Error fetching bracket data:", error);
  }
}

setInterval(fetchAndUpdateBracket, 2000); // Update every 2 seconds

async function fetchPlayoffData() {
  try {
    const response = await fetch(PLAYOFFS_API_URL);
    const data = await response.json();
    return data.events.filter(game => game.season.slug === "post-season"); // Only include post-season games
  } catch (error) {
    console.error("Error fetching playoff data:", error);
    return [];
  }
}

function normalizeTeamName(name) {
  if (!name) return "";
  return name
    .split("/")
    .map(n => n.trim())
    .sort()
    .join("/")
    .toLowerCase();
}

function isSlashTeam(name) {
  return name && name.includes("/");
}

function getBracketLogo(team) {
  // Use icon.png for teams with a slash in the name or if team is TBD, otherwise use ESPN logo
  if (
    !team ||
    !team.shortDisplayName ||
    isSlashTeam(team.shortDisplayName) ||
    team.shortDisplayName.toLowerCase() === "tbd" ||
    team.abbreviation === undefined ||
    team.abbreviation === null ||
    team.abbreviation === "TBD"
  ) {
    return "icon.png";
  }
  return `https://a.espncdn.com/i/teamlogos/nba/500/${team.abbreviation}.png`;
}

function groupGamesByMatchup(games, standings) {
  const matchups = {};
  games.forEach(game => {
    const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home")?.team;
    const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away")?.team;

    if (!homeTeam || !awayTeam) {
      console.warn("Missing team data for game:", game);
      return; // Skip this game if either team is missing
    }

    // Retrieve seed and short name for home and away teams
    const homeSeed = getTeamSeed(homeTeam.id, standings);
    const awaySeed = getTeamSeed(awayTeam.id, standings);
    const homeShortName = homeTeam.shortDisplayName || "Unknown";
    const awayShortName = awayTeam.shortDisplayName || "Unknown";

    // Assign seed and short name to the team objects
    homeTeam.seed = homeSeed;
    awayTeam.seed = awaySeed;
    homeTeam.shortName = homeShortName;
    awayTeam.shortName = awayShortName;

    // Use normalized names for matchups with "/" (e.g., Celtics/Knicks)
    const homeKey = normalizeTeamName(homeTeam.shortDisplayName);
    const awayKey = normalizeTeamName(awayTeam.shortDisplayName);
    const matchupKey = [homeKey, awayKey].sort().join("-"); // Unique key for each matchup, handles "/" cases

    if (!matchups[matchupKey]) {
      matchups[matchupKey] = { homeTeam, awayTeam, games: [] };
    }
    matchups[matchupKey].games.push(game);
  });

  // Sort matchups by the custom seed order: 1st, 4th, 3rd, 2nd, and prioritize Thunder matchups
  const customSeedOrder = [6, 4, 3, 2];
  return Object.values(matchups).sort((a, b) => {
    const aSeed = Math.min(a.homeTeam.seed, a.awayTeam.seed);
    const bSeed = Math.min(b.homeTeam.seed, b.awayTeam.seed);

    const aIndex = customSeedOrder.indexOf(aSeed);
    const bIndex = customSeedOrder.indexOf(bSeed);

    return aIndex - bIndex;
  });
}

function groupGamesByConferenceAndRound(games) {
  const rounds = {
    east: {
      "1st Round": [],
      "Semifinals": [],
      "Finals": []
    },
    west: {
      "1st Round": [],
      "Semifinals": [],
      "Finals": []
    },
    finals: []
  };

  games.forEach(game => {
    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

    if (headline.includes("East 1st Round")) {
      rounds.east["1st Round"].push(game);
    } else if (headline.includes("East Semifinals")) {
      rounds.east["Semifinals"].push(game);
    } else if (headline.includes("East Finals")) {
      rounds.east["Finals"].push(game);
    } else if (headline.includes("West 1st Round")) {
      rounds.west["1st Round"].push(game);
    } else if (headline.includes("West Semifinals")) {
      rounds.west["Semifinals"].push(game);
    } else if (headline.includes("West Finals")) {
      rounds.west["Finals"].push(game);
    } else if (headline.includes("NBA Finals")) {
      rounds.finals.push(game);
    }
  });

  return rounds;
}

function groupGamesByRound(games) {
  const rounds = {
    4: [], // 1st Round
    3: [], // Semifinals
    2: [], // Finals
    1: []  // NBA Finals
  };

  games.forEach(game => {
    const roundType = game.season.type; // Use type to determine the round
    if (rounds[roundType]) {
      rounds[roundType].push(game);
    }
  });

  return rounds;
}

function groupGamesByRoundUsingHeadline(games) {
  const rounds = {
    "1st Round": [],
    "Semifinals": [],
    "Finals": [],
    "NBA Finals": []
  };

  games.forEach(game => {
    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

    if (headline.includes("1st Round")) {
      rounds["1st Round"].push(game);
    } else if (headline.includes("Semifinals")) {
      rounds["Semifinals"].push(game);
    } else if (headline.includes("Finals") && !headline.includes("NBA Finals")) {
      rounds["Finals"].push(game);
    } else if (headline.includes("NBA Finals")) {
      rounds["NBA Finals"].push(game);
    }
  });

  return rounds;
}

function getTeamSeed(teamId, standings) {
  const conference = standings.find(group =>
    group.standings.entries.some(entry => entry.team.id === teamId)
  );
  const teamEntry = conference?.standings.entries.find(entry => entry.team.id === teamId);
  return teamEntry?.team.seed || "-";
}

function getTeamRoundRecord(teamId, games, currentRound, opposingTeamId) {
  const relevantGames = games.filter(game => {
    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";
    return headline.includes(currentRound) &&
           game.competitions[0].competitors.some(c => c.team.id === teamId);
  });

  if (relevantGames.length === 0) return "0-0";

  // Find the most recent game for the team in the current round
  const mostRecentGame = relevantGames.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  const team = mostRecentGame.competitions[0].competitors.find(c => c.team.id === teamId);
  const opposingTeam = mostRecentGame.competitions[0].competitors.find(c => c.team.id === opposingTeamId);

  let record = team?.record || "0-0";

  // If the record starts with "0", calculate it as the opposite of the opposing team's record
  if (record.startsWith("0") && opposingTeam?.record) {
    const [opposingWins, opposingLosses] = opposingTeam.record.split("-").map(Number);
    record = `${opposingLosses}-${opposingWins}`;
  }

  return record;
}

function groupGamesByConferenceAndSeed(games) {
  const conferences = {
    east: [],
    west: []
  };

  games.forEach(game => {
    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

    if (headline.includes("East")) {
      conferences.east.push(game);
    } else if (headline.includes("West")) {
      conferences.west.push(game);
    }
  });

  const sortBySeed = (games) => {
    const matchups = groupGamesByMatchup(games);
    return matchups.sort((a, b) => {
      const aSeedDiff = Math.abs(a.homeTeam.seed - a.awayTeam.seed);
      const bSeedDiff = Math.abs(b.homeTeam.seed - b.awayTeam.seed);
      return aSeedDiff - bSeedDiff;
    });
  };

  return {
    east: sortBySeed(conferences.east),
    west: sortBySeed(conferences.west)
  };
}

function showSeriesPopup(matchup) {
  // Create modal overlay
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `;

  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';
  modalContent.style.cssText = `
    background: white;
    border-radius: 10px;
    padding: 20px;
    max-width: 500px;
    width: 90%;
    position: relative;
  `;

  // Sort matches by date
  const sortedMatches = matchup.games.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Create close button
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '×';
  closeButton.style.cssText = `
    position: absolute;
    top: 10px;
    right: 15px;
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #333;
  `;
  closeButton.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  // Create header
  const header = document.createElement('h3');
  header.textContent = `${matchup.homeTeam.shortDisplayName} vs ${matchup.awayTeam.shortDisplayName}`;
  header.style.cssText = `
    color: #333;
    text-align: center;
    margin-bottom: 20px;
  `;

  // Split games into pages (4 games per page)
  const gamesPerPage = 4;
  const totalPages = Math.ceil(sortedMatches.length / gamesPerPage);
  let currentPage = 1;

  // Create pagination container
  const paginationContainer = document.createElement('div');
  paginationContainer.style.cssText = `
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
  `;

  // Create page info
  const pageInfo = document.createElement('span');
  pageInfo.style.cssText = `
    color: #333;
    font-weight: bold;
  `;

  // Create navigation buttons
  const prevButton = document.createElement('button');
  prevButton.innerHTML = '←';
  prevButton.style.cssText = `
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 16px;
  `;

  const nextButton = document.createElement('button');
  nextButton.innerHTML = '→';
  nextButton.style.cssText = `
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 16px;
  `;

  // Create games container
  const gamesContainer = document.createElement('div');
  gamesContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 15px;
  `;

  function updatePage() {
    // Update page info
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    
    // Update button states
    prevButton.disabled = currentPage === 1;
    nextButton.disabled = currentPage === totalPages;
    prevButton.style.opacity = currentPage === 1 ? '0.5' : '1';
    nextButton.style.opacity = currentPage === totalPages ? '0.5' : '1';

    // Clear games container
    gamesContainer.innerHTML = '';

    // Get games for current page
    const startIndex = (currentPage - 1) * gamesPerPage;
    const endIndex = Math.min(startIndex + gamesPerPage, sortedMatches.length);
    const currentGames = sortedMatches.slice(startIndex, endIndex);

    // Add game cards for current page
    currentGames.forEach((game, index) => {
      const gameNumber = startIndex + index + 1;
      const gameCard = document.createElement('div');
      
      const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home");
      const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away");
      const homeScore = homeTeam.score || 0;
      const awayScore = awayTeam.score || 0;
      const status = game.status.type.description;
      const gameDate = new Date(game.date).toLocaleDateString();

      const isClickable = game.status.type.state === "post" || game.status.type.state === "in";
      
      // Format game date for URL parameter (like search.js does)
      const gameDateForUrl = new Date(game.date);
      const formattedGameDate = gameDateForUrl.getFullYear() +
                               String(gameDateForUrl.getMonth() + 1).padStart(2, "0") +
                               String(gameDateForUrl.getDate()).padStart(2, "0");
      
      gameCard.style.cssText = `
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 15px;
        ${isClickable ? 'cursor: pointer; background-color: #f8f9fa;' : 'background-color: #f5f5f5;'}
        transition: background-color 0.2s ease;
      `;

      if (isClickable) {
        gameCard.addEventListener('mouseenter', () => {
          gameCard.style.backgroundColor = '#e9ecef';
        });
        gameCard.addEventListener('mouseleave', () => {
          gameCard.style.backgroundColor = '#f8f9fa';
        });
        gameCard.addEventListener('click', () => {
          document.body.removeChild(modal);
          // Navigate using same pattern as search.js
          window.location.href = `scoreboard.html?gameId=${game.id}&date=${formattedGameDate}`;
        });
      }

      // Winner logic for this game
      let homeIsWinner = false, awayIsWinner = false;
      if (game.status.type.state === "post") {
        if (parseInt(homeScore) > parseInt(awayScore)) {
          homeIsWinner = true;
        } else if (parseInt(awayScore) > parseInt(homeScore)) {
          awayIsWinner = true;
        }
      }

      const homeTeamLogo = `https://a.espncdn.com/i/teamlogos/nba/500/${homeTeam.team.abbreviation}.png`;
      const awayTeamLogo = `https://a.espncdn.com/i/teamlogos/nba/500/${awayTeam.team.abbreviation}.png`;

      gameCard.innerHTML = `
        <div style="position: relative; display: flex; justify-content: space-between; align-items: center;">
          <!-- Away Team -->
          <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
            <img src="${awayTeamLogo}" alt="${awayTeam.team.shortDisplayName}" style="width: 30px; height: 30px;" onerror="this.src='icon.png'">
            <span style="font-weight: bold; color: ${awayIsWinner ? '#007bff' : '#333'};">${awayTeam.team.shortDisplayName}</span>
          </div>
          
          <div style="
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            font-size: 1.2rem;
            font-weight: bold;
            display: flex;
            gap: 4px;
          ">
            <span style="color: ${awayIsWinner ? '#007bff' : '#333'};">${awayScore}</span>
            <span style="color: #222;">-</span>
            <span style="color: ${homeIsWinner ? '#007bff' : '#333'};">${homeScore}</span>
          </div>

          <!-- Home Team -->
          <div style="display: flex; align-items: center; gap: 10px; flex: 1; justify-content: flex-end;">
            <span style="font-weight: bold; color: ${homeIsWinner ? '#007bff' : '#333'};">${homeTeam.team.shortDisplayName}</span>
            <img src="${homeTeamLogo}" alt="${homeTeam.team.shortDisplayName}" style="width: 30px; height: 30px;" onerror="this.src='icon.png'">
          </div>
        </div>

        <div style="text-align: center; margin-top: 10px; color: #333; font-size: 0.9rem;">
          Game ${gameNumber} - ${status}${gameDate ? ` (${gameDate})` : ''}
        </div>
      `;

      gamesContainer.appendChild(gameCard);
    });
  }

  // Event listeners for navigation
  prevButton.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      updatePage();
    }
  });

  nextButton.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      updatePage();
    }
  });

  // Only show pagination if there are multiple pages
  if (totalPages > 1) {
    paginationContainer.appendChild(prevButton);
    paginationContainer.appendChild(pageInfo);
    paginationContainer.appendChild(nextButton);
  }

  // Calculate series record correctly
  let homeWins = 0, awayWins = 0;
  sortedMatches.forEach(game => {
    if (game.status.type.state === "post") {
      const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home");
      const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away");
      const homeScore = parseInt(homeTeam.score || 0);
      const awayScore = parseInt(awayTeam.score || 0);
      
      // Find which team in the matchup this game's home/away teams correspond to
      const gameHomeTeamId = homeTeam.team.id;
      const gameAwayTeamId = awayTeam.team.id;
      const matchupHomeTeamId = matchup.homeTeam.id;
      const matchupAwayTeamId = matchup.awayTeam.id;
      
      if (homeScore > awayScore) {
        // Home team won this game
        if (gameHomeTeamId === matchupHomeTeamId) {
          homeWins++;
        } else {
          awayWins++;
        }
      } else if (awayScore > homeScore) {
        // Away team won this game
        if (gameAwayTeamId === matchupHomeTeamId) {
          homeWins++;
        } else {
          awayWins++;
        }
      }
    }
  });

  // Add series score
  const seriesDiv = document.createElement('div');
  seriesDiv.style.cssText = `
    text-align: center;
    margin-top: 20px;
    padding: 15px;
    background-color: #e3f2fd;
    border-radius: 8px;
    font-size: 1.1rem;
    font-weight: bold;
    color: #1976d2;
  `;
  
  let seriesStatus = '';
  if (homeWins === 4 || awayWins === 4) {
    const winner = homeWins === 4 ? matchup.homeTeam.shortDisplayName : matchup.awayTeam.shortDisplayName;
    const loserWins = homeWins === 4 ? awayWins : homeWins;
    seriesStatus = `${winner} wins series ${Math.max(homeWins, awayWins)}-${loserWins}`;
  } else if (homeWins !== awayWins) {
    const leader = homeWins > awayWins ? matchup.homeTeam.shortDisplayName : matchup.awayTeam.shortDisplayName;
    seriesStatus = `${leader} leads ${Math.max(homeWins, awayWins)}-${Math.min(homeWins, awayWins)}`;
  } else {
    seriesStatus = `Series tied ${homeWins}-${awayWins}`;
  }
  
  seriesDiv.textContent = seriesStatus;

  // Assemble modal
  modalContent.appendChild(closeButton);
  modalContent.appendChild(header);
  if (totalPages > 1) {
    modalContent.appendChild(paginationContainer);
  }
  modalContent.appendChild(gamesContainer);
  modalContent.appendChild(seriesDiv);
  modal.appendChild(modalContent);

  // Initialize first page
  updatePage();

  // Add to page
  document.body.appendChild(modal);

  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

async function renderBracket(games, container) {
  // If no container is passed, use the default
  if (!container) {
    container = document.getElementById("bracketContainer");
    if (!container) {
      console.error("Bracket container not found.");
      return;
    }
    container.innerHTML = ""; // Clear existing content
    container.className = "bracket-container";
  }

  const standingsResponse = await fetch("https://cdn.espn.com/core/nba/standings?xhr=1");
  const standingsData = await standingsResponse.json();
  const standings = standingsData.content.standings.groups;

  const rounds = groupGamesByConferenceAndRound(games);

  // Check if mobile layout is needed
  const isMobile = window.innerWidth < 525;

  const renderRoundColumn = (roundGames, roundName, conferenceClass) => {
    const roundDiv = document.createElement("div");
    roundDiv.className = `bracket-round ${conferenceClass}`;

    // Only add round title for desktop
    if (!isMobile) {
      const roundTitle = document.createElement("h3");
      roundTitle.className = "round-title";
      roundTitle.textContent = roundName;
      roundDiv.appendChild(roundTitle);
    }

    if (roundGames.length === 0 && ["Semifinals", "Finals", "NBA Finals"].includes(roundName)) {
      const tbaCardCount = roundName === "Semifinals" ? 2 : 1; // Show 2 cards for Semifinals, 1 for others

      for (let i = 0; i < tbaCardCount; i++) {
        const tbaCard = document.createElement("div");
        tbaCard.className = "bracket-row tba-card";

        // Adjust spacing for Semifinals and other rounds (desktop only)
        if (!isMobile) {
          if (roundName === "Semifinals") {
            tbaCard.style.marginTop = i === 0 ? "50px" : "150px"; // Top and bottom spacing for two cards
          } else if (roundName === "Finals") {
            tbaCard.style.marginTop = "180px";
          }
        }

        if (roundName === "NBA Finals") {
          if (isMobile) {
            tbaCard.innerHTML = `
              <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                <div style="font-size: 14px; font-weight: bold; text-align: center; color: black;">NBA FINALS</div>
                <div style="display: flex; justify-content: space-around; width: 100%;">
                  <div style="text-align: center;">
                    <img src="icon.png" alt="TBD" style="width: 30px; height: 30px;">
                    <div style="font-size: 12px; margin-top: 5px; color: #000; font-weight: bold;">TBD</div>
                  </div>
                  <div style="text-align: center;">
                    <img src="icon.png" alt="TBD" style="width: 30px; height: 30px;">
                    <div style="font-size: 12px; margin-top: 5px; color: #000; font-weight: bold;">TBD</div>
                  </div>
                </div>
              </div>
            `;
          } else {
            tbaCard.innerHTML = `
              <div style="font-size: 1.5em; font-weight: bold; margin-bottom: 5px;">CHAMPIONSHIP</div>
              <div style="font-size: 1.2em; margin-bottom: 5px;">${roundName}</div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div class="matchup-container">
                  <div class="team-column" style="margin: 0 30px;">
                    <div class="record" style="font-weight: bold; font-size: 2rem;">-</div>
                    <div class="team-line">
                      <span class="abbrev">TBD</span>
                    </div>
                  </div>
                  <div class="vs">vs</div>
                  <div class="team-column">
                    <div class="record" style="font-weight: bold; font-size: 2rem;">-</div>
                    <div class="team-line">
                      <span class="abbrev">TBD</span>
                    </div>
                  </div>
                </div>
              </div>
            `;
          }
        } else {
          if (isMobile) {
            tbaCard.innerHTML = `
              <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                <img src="icon.png" alt="TBD" style="width: 30px; height: 30px;">
                <div style="text-align: center; font-size: 12px; color: #000;">TBD vs TBD</div>
              </div>
            `;
          } else {
            tbaCard.innerHTML = `
              <div class="series-info">Conf. ${roundName}</div>
              <div class="team-row">
                <span class="team-name">TBD</span>
                <span class="team-record">-</span>
              </div>
              <div class="team-row">
                <span class="team-name">TBD</span>
                <span class="team-record">-</span>
              </div>
            `;
          }
        }

        roundDiv.appendChild(tbaCard);
      }
      return roundDiv;
    }

    const matchups = groupGamesByMatchup(roundGames, standings);

    matchups.forEach((matchup, index) => {
      let { homeTeam, awayTeam, games } = matchup;

      // Ensure the team with the higher seed is on top
      if (homeTeam.seed > awayTeam.seed) {
        [homeTeam, awayTeam] = [awayTeam, homeTeam];
      }

      const homeSeed = homeTeam ? homeTeam.seed : "-";
      const awaySeed = awayTeam ? awayTeam.seed : "-";

      const homeRecord = homeTeam ? getTeamRoundRecord(homeTeam.id, games, roundName, awayTeam?.id).split(`-`)[0] : "0";
      const awayRecord = awayTeam ? getTeamRoundRecord(awayTeam.id, games, roundName, homeTeam?.id).split(`-`)[0] : "0";

      const homeAbbrev = homeTeam ? homeTeam.abbreviation : "TBD";
      const awayAbbrev = awayTeam ? awayTeam.abbreviation : "TBD";

      // Use icon.png for slash teams
      const homeLogo = getBracketLogo(homeTeam);
      const awayLogo = getBracketLogo(awayTeam);

      const homeIsWinner = parseInt(homeRecord) > parseInt(awayRecord);
      const awayIsWinner = parseInt(awayRecord) > parseInt(homeRecord);
      const tied = parseInt(homeRecord) === parseInt(awayRecord);
      const homeWins = parseInt(homeRecord);
      const awayWins = parseInt(awayRecord);

      let seriesInfo = "";
      if (homeWins === 4 || awayWins === 4) {
        const winner = homeWins === 4 ? homeTeam.abbreviation : awayTeam.abbreviation;
        const loserWins = homeWins === 4 ? awayWins : homeWins;
        seriesInfo = `${winner} wins series ${Math.max(homeWins, awayWins)} - ${loserWins}`;
      } else if (homeWins !== awayWins) {
        const leader = homeWins > awayWins ? homeTeam.abbreviation : awayTeam.abbreviation;
        const leaderWins = Math.max(homeWins, awayWins);
        const trailingWins = Math.min(homeWins, awayWins);
        seriesInfo = `${leader} leads ${leaderWins} - ${trailingWins}`;
      } else {
        seriesInfo = `Series tied ${homeWins} - ${awayWins}`;
      }

      const homeName = homeTeam ? homeTeam.shortDisplayName : "TBD";
      const awayName = awayTeam ? awayTeam.shortDisplayName : "TBD";

      const inProgress = (homeWins < 4 && awayWins < 4);

      const matchupRow = document.createElement("div");
      matchupRow.className = "bracket-row";

      // Add proportional spacing for semifinal cards (desktop only)
      if (!isMobile) {
        if (roundName === "Semifinals") {
          matchupRow.style.marginTop = index === 0 ? "60px" : "160px"; // Adjust spacing for top and bottom cards
        } else if (roundName === "Finals") {
          matchupRow.style.marginTop = "190px"; // Adjust spacing for top and bottom cards
        } else if (roundName === "1st Round") {
          matchupRow.style.marginTop = index === 2 ? "50px" : "10px"; // Adjust spacing for top and bottom cards
        } else if (roundName === "NBA Finals") {
          matchupRow.style.marginLeft = "-25px";
          matchupRow.style.padding = "20px";
          matchupRow.style.width = "270px";
          matchupRow.style.border = "2px solid #ccc";
          matchupRow.style.borderRadius = "10px";
          matchupRow.style.backgroundColor = "#f9f9f9";
          matchupRow.style.textAlign = "center";
        }
      }

      // Change box shadow to winning team's color if a team gets 4 wins
      if (homeWins === 4) {
        matchupRow.style.boxShadow = `0 0px 8px rgba(${parseInt(homeTeam.color.slice(0, 2), 16)}, ${parseInt(homeTeam.color.slice(2, 4), 16)}, ${parseInt(homeTeam.color.slice(4, 6), 16)}, 0.8)`;
      } else if (awayWins === 4) {
        matchupRow.style.boxShadow = `0 0px 8px rgba(${parseInt(awayTeam.color.slice(0, 2), 16)}, ${parseInt(awayTeam.color.slice(2, 4), 16)}, ${parseInt(awayTeam.color.slice(4, 6), 16)}, 0.8)`;
      }

      if (roundName === "NBA Finals") {
        if (isMobile) {
          // Mobile finals layout
          matchupRow.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; width: 100%; gap: 10px;">
              <div style="font-size: 14px; font-weight: bold; color: #333; text-align: center;">NBA FINALS</div>
              <div style="display: flex; justify-content: space-around; align-items: center; width: 100%;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                  <img src="${homeLogo}" alt="${homeAbbrev}" style="width: 30px; height: 30px;" onerror="this.src='icon.png'">
                  <div style="text-align: center; font-size: 12px; color: #000; font-weight: bold;">${homeAbbrev}</div>
                  <div style="text-align: center; font-size: 18px; font-weight: bold; color: ${homeWins > awayWins ? '#007bff' : '#333'};">${homeRecord}</div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                  <img src="${awayLogo}" alt="${awayAbbrev}" style="width: 30px; height: 30px;" onerror="this.src='icon.png'">
                  <div style="text-align: center; font-size: 12px; color: #000; font-weight: bold;">${awayAbbrev}</div>
                  <div style="text-align: center; font-size: 18px; font-weight: bold; color: ${awayWins > homeWins ? '#007bff' : '#333'};">${awayRecord}</div>
                </div>
              </div>
            </div>
          `;
          
          // Add glow for winner (mobile finals)
          if (homeWins === 4 || awayWins === 4) {
            const winnerTeam = homeWins === 4 ? homeTeam : awayTeam;
            matchupRow.style.boxShadow = `0 0 16px 4px rgba(${parseInt(winnerTeam.color.slice(0, 2), 16)}, ${parseInt(winnerTeam.color.slice(2, 4), 16)}, ${parseInt(winnerTeam.color.slice(4, 6), 16)}, 0.8)`;
          }
        } else {
          // Desktop finals layout
          matchupRow.innerHTML = `
            <div style="font-size: 1.5em; font-weight: bold; margin-bottom: 5px;">CHAMPIONSHIP</div>
            <div style="font-size: 1.2em; margin-bottom: 5px;">${seriesInfo}</div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div class="matchup-container">
              <img src="${homeLogo}" alt="${homeAbbrev}" style="width: 40px; height: 40px; margin-right: -10px;">
              <div class="team-column">
                  <div class="record" style="font-weight: bold; font-size: 2rem; ${tied ? "" : homeIsWinner ? "" : "color: grey;"}">${homeRecord}</div>
                  <div class="team-line">
                  <span class="seed" style="color: grey; font-size: 0.9rem;">${homeSeed}</span>
                  <span class="abbrev" style="${inProgress ? "" : tied ? "" : homeIsWinner ? "" : "color: grey;"}">${homeAbbrev}</span>
                  </div>
              </div>
              <div class="vs">vs</div>
              <div class="team-column">
                  <div class="record" style="font-weight: bold; font-size: 2rem; ${tied ? "" : awayIsWinner ? "" : "color: grey;"}">${awayRecord}</div>
                  <div class="team-line">
                  <span class="seed" style="color: grey; font-size: 0.9rem;">${awaySeed}</span>
                  <span class="abbrev" style="${inProgress ? "" : tied ? "" : awayIsWinner ? "" : "color: grey;"}">${awayAbbrev}</span>
                  </div>
              </div>
              <img src="${awayLogo}" alt="${awayAbbrev}" style="width: 40px; height: 40px; margin-left: -10px;">
              </div>
            </div>
          `;
        }
        
        // Add click event for Finals popup
        matchupRow.style.cursor = "pointer";
        matchupRow.addEventListener("click", () => {
          showSeriesPopup(matchup);
        });
      } else {
        if (isMobile) {
          // Mobile layout for other rounds
          matchupRow.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; width: 100%; gap: 30px;">
              <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                <img src="${homeLogo}" alt="${homeAbbrev}" style="width: 30px; height: 30px;" onerror="this.src='icon.png'">
                <div style="text-align: center; font-size: 12px; color: #000; font-weight: bold;">${homeAbbrev}</div>
                <div style="text-align: center; font-size: 18px; font-weight: bold; color: ${homeWins > awayWins ? '#007bff' : '#333'};">${homeRecord}</div>
              </div>
              <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                <img src="${awayLogo}" alt="${awayAbbrev}" style="width: 30px; height: 30px;" onerror="this.src='icon.png'">
                <div style="text-align: center; font-size: 12px; color: #000; font-weight: bold;">${awayAbbrev}</div>
                <div style="text-align: center; font-size: 18px; font-weight: bold; color: ${awayWins > homeWins ? '#007bff' : '#333'};">${awayRecord}</div>
              </div>
            </div>
          `;
        } else {
          // Desktop layout for other rounds
          matchupRow.innerHTML = `
          <div class="series-info">
            ${seriesInfo}
          </div>
          <div class="team-row">
            <img src="${homeLogo}" alt="${homeAbbrev}" style="width: 20px; height: 20px; margin-right: 5px;">
            <span class="team-seed" style="color: grey;">${homeSeed}</span>
            <span class="team-name" style="${inProgress ? "" : tied ? "" : homeIsWinner ? "" : "color: grey;"}">${homeName}</span>
            <span class="team-record" style="${tied ? "" : homeIsWinner ? "" : "color: grey;"}">${homeRecord}</span>
          </div>
          <div class="team-row">
            <img src="${awayLogo}" alt="${awayAbbrev}" style="width: 20px; height: 20px; margin-right: 5px;">
            <span class="team-seed" style="color: grey;">${awaySeed}</span>
            <span class="team-name" style="${inProgress ? "" : tied ? "" : awayIsWinner ? "" : "color: grey;"}">${awayName}</span>
            <span class="team-record" style="${tied ? "" : awayIsWinner ? "" : "color: grey;"}">${awayRecord}</span>
          </div>
        `;
        }
        
        // Add click event for other rounds popup
        matchupRow.style.cursor = "pointer";
        matchupRow.addEventListener("click", () => {
          showSeriesPopup(matchup);
        });
      }

      roundDiv.appendChild(matchupRow);
    });

    return roundDiv;
  };

  if (isMobile) {
    // Mobile layout: 4-2-1-1-2-4 arrangement (4 1st Round, 2 SF, 1 Finals, 1 Finals, 2 SF, 4 1st Round)
    const mobileContainer = document.createElement("div");
    mobileContainer.className = "mobile-bracket-container";
    
    // Get all games for each round
    const west1stRoundGames = rounds.west["1st Round"];
    const east1stRoundGames = rounds.east["1st Round"];
    const westSFGames = rounds.west["Semifinals"];
    const eastSFGames = rounds.east["Semifinals"];
    
    // Group games by matchup to get individual matchups
    const west1stRoundMatchups = west1stRoundGames.length > 0 ? groupGamesByMatchup(west1stRoundGames, standings) : [];
    const east1stRoundMatchups = east1stRoundGames.length > 0 ? groupGamesByMatchup(east1stRoundGames, standings) : [];
    const westSFMatchups = westSFGames.length > 0 ? groupGamesByMatchup(westSFGames, standings) : [];
    const eastSFMatchups = eastSFGames.length > 0 ? groupGamesByMatchup(eastSFGames, standings) : [];
    
    // Row 1: 4 West 1st Round games (top)
    const topR1Row = document.createElement("div");
    topR1Row.className = "mobile-row r1-row";
    
    for (let i = 0; i < 4; i++) {
      if (west1stRoundMatchups[i]) {
        const r1 = renderRoundColumn(west1stRoundMatchups[i].games, "1st Round", "mobile-1st-round");
        topR1Row.appendChild(r1);
      } else {
        const r1 = renderRoundColumn([], "1st Round", "mobile-1st-round");
        topR1Row.appendChild(r1);
      }
    }
    
    // Row 2: 2 West Semifinals (left side)
    const leftSFRow = document.createElement("div");
    leftSFRow.className = "mobile-row sf-row";
    
    for (let i = 0; i < 2; i++) {
      if (westSFMatchups[i]) {
        const westSF = renderRoundColumn(westSFMatchups[i].games, "Semifinals", "mobile-semifinals");
        leftSFRow.appendChild(westSF);
      } else {
        const westSF = renderRoundColumn([], "Semifinals", "mobile-semifinals");
        leftSFRow.appendChild(westSF);
      }
    }
    
    // Row 3: 1 West Finals (left)
    const leftFinalsRow = document.createElement("div");
    leftFinalsRow.className = "mobile-row finals-row";
    
    const westFinals = renderRoundColumn(rounds.west["Finals"], "Finals", "mobile-conference-finals");
    leftFinalsRow.appendChild(westFinals);
    
    // Row 4: 1 NBA Finals (center)
    const nbaFinalsRow = document.createElement("div");
    nbaFinalsRow.className = "mobile-row finals-row";
    
    const nbaFinalsColumn = renderRoundColumn(rounds.finals, "NBA Finals", "mobile-finals");
    nbaFinalsRow.appendChild(nbaFinalsColumn);
    
    // Row 5: 1 East Finals (right)
    const rightFinalsRow = document.createElement("div");
    rightFinalsRow.className = "mobile-row finals-row";
    
    const eastFinals = renderRoundColumn(rounds.east["Finals"], "Finals", "mobile-conference-finals");
    rightFinalsRow.appendChild(eastFinals);
    
    // Row 6: 2 East Semifinals (right side)
    const rightSFRow = document.createElement("div");
    rightSFRow.className = "mobile-row sf-row";
    
    for (let i = 0; i < 2; i++) {
      if (eastSFMatchups[i]) {
        const eastSF = renderRoundColumn(eastSFMatchups[i].games, "Semifinals", "mobile-semifinals");
        rightSFRow.appendChild(eastSF);
      } else {
        const eastSF = renderRoundColumn([], "Semifinals", "mobile-semifinals");
        rightSFRow.appendChild(eastSF);
      }
    }
    
    // Row 7: 4 East 1st Round games (bottom)
    const bottomR1Row = document.createElement("div");
    bottomR1Row.className = "mobile-row r1-row";
    
    for (let i = 0; i < 4; i++) {
      if (east1stRoundMatchups[i]) {
        const r1 = renderRoundColumn(east1stRoundMatchups[i].games, "1st Round", "mobile-1st-round");
        bottomR1Row.appendChild(r1);
      } else {
        const r1 = renderRoundColumn([], "1st Round", "mobile-1st-round");
        bottomR1Row.appendChild(r1);
      }
    }
    
    // Append all rows to container in 4-2-1-1-1-2-4 order
    mobileContainer.appendChild(topR1Row);
    mobileContainer.appendChild(leftSFRow);
    mobileContainer.appendChild(leftFinalsRow);
    mobileContainer.appendChild(nbaFinalsRow);
    mobileContainer.appendChild(rightFinalsRow);
    mobileContainer.appendChild(rightSFRow);
    mobileContainer.appendChild(bottomR1Row);
    
    container.appendChild(mobileContainer);
  } else {
    // Desktop layout (existing code)
    const renderConferenceRounds = (conferenceRounds, conferenceClass) => {
      return [
        renderRoundColumn(conferenceRounds["1st Round"], "1st Round", conferenceClass),
        renderRoundColumn(conferenceRounds["Semifinals"], "Semifinals", conferenceClass),
        renderRoundColumn(conferenceRounds["Finals"], "Finals", conferenceClass)
      ];
    };

    const eastRounds = renderConferenceRounds(rounds.east, "east");
    const westRounds = renderConferenceRounds(rounds.west, "west");
    const finalsDiv = renderRoundColumn(rounds.finals, "NBA Finals", "finals");

    // Append rounds in the correct horizontal order
    container.appendChild(westRounds[0]); // West 1st Round
    container.appendChild(westRounds[1]); // West Semifinals
    container.appendChild(westRounds[2]); // West Finals
    container.appendChild(finalsDiv);     // NBA Finals
    container.appendChild(eastRounds[2]); // East Finals
    container.appendChild(eastRounds[1]); // East Semifinals
    container.appendChild(eastRounds[0]); // East 1st Round
  }
}

function getRoundTitle(roundType) {
  switch (parseInt(roundType, 10)) {
    case 4: return "1st Round";
    case 3: return "Semifinals";
    case 2: return "Finals";
    case 1: return "NBA Finals";
    default: return "Unknown Round";
  }
}

async function initializeBracket() {
  const games = await fetchPlayoffData();
  renderBracket(games);
}

initializeBracket();
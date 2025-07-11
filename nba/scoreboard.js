// Function to determine if we're in the Summer League period
function isSummerLeague() {
  const now = new Date();
  const year = now.getFullYear();
  const summerStart = new Date(year, 6, 10); // July 10 (month is 0-indexed)
  const summerEnd = new Date(year, 6, 21);   // July 21
  
  return now >= summerStart && now <= summerEnd;
}

// Function to check if a specific date string is in Summer League period
function isDateInSummerLeague(dateString) {
  if (!dateString) return false;
  
  // Parse the date string (format: YYYYMMDD)
  const year = parseInt(dateString.substring(0, 4));
  const month = parseInt(dateString.substring(4, 6)) - 1; // Month is 0-indexed
  const day = parseInt(dateString.substring(6, 8));
  
  const gameDate = new Date(year, month, day);
  const summerStart = new Date(year, 6, 10); // July 10
  const summerEnd = new Date(year, 6, 21);   // July 21
  
  return gameDate >= summerStart && gameDate <= summerEnd;
}

// Function to get the appropriate league identifier
function getLeagueIdentifier() {
  return isSummerLeague() ? "nba-summer-las-vegas" : "nba";
}



const TEAMS_API_URL = `https://site.api.espn.com/apis/site/v2/sports/basketball/${getLeagueIdentifier()}/teams`;

function getAdjustedDateForNBA() {
  const now = new Date();
  const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  if (estNow.getHours() < 2) {
    estNow.setDate(estNow.getDate() - 1);
  }
  const adjustedDate = estNow.getFullYear() +
                       String(estNow.getMonth() + 1).padStart(2, "0") +
                       String(estNow.getDate()).padStart(2, "0");
  return adjustedDate;
}

function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

async function renderBoxScore(gameId, gameState) {
  try {
    const gameDate = getQueryParam("date");
    let BOX_SCORE_API_URL;
    
    // Check if the game date falls within Summer League period
    const isGameInSummerLeague = isDateInSummerLeague(gameDate);
    
    // Use Summer League API if the game date is within Summer League period
    if (isGameInSummerLeague) {
      BOX_SCORE_API_URL = `https://cdn.espn.com/core/nba-summer-league/boxscore?xhr=1&gameId=${gameId}&league=nba-summer-las-vegas`;
    } else {
      BOX_SCORE_API_URL = `https://cdn.espn.com/core/nba/boxscore?xhr=1&gameId=${gameId}`;
    }
    
    let response = await fetch(BOX_SCORE_API_URL);
    let data = await response.json();
    
    // If first API fails, try the other one as fallback
    if (!data || !data.gamepackageJSON || !data.gamepackageJSON.boxscore) {
      if (isGameInSummerLeague) {
        // Try regular NBA API as fallback
        BOX_SCORE_API_URL = `https://cdn.espn.com/core/nba/boxscore?xhr=1&gameId=${gameId}`;
      } else {
        // Try Summer League API as fallback
        BOX_SCORE_API_URL = `https://cdn.espn.com/core/nba-summer-league/boxscore?xhr=1&gameId=${gameId}&league=nba-summer-las-vegas`;
      }
      response = await fetch(BOX_SCORE_API_URL);
      data = await response.json();
    }

    const isSmallScreen = window.innerWidth <= 475;

    const players = data.gamepackageJSON.boxscore.players || [];
    const boxScoreDiv = document.getElementById("boxScore");
    if (!boxScoreDiv) {
      console.error("Error: 'boxScore' element not found.");
      return;
    }

    const renderTeamRoster = (team) => {
      if (!team || !team.statistics || !team.statistics[0]?.athletes) {
        console.error("Invalid team data for player stats rendering.");
        return `<div class="error-message">Player data unavailable for this team.</div>`;
      }

      const teamName = team.team.shortDisplayName;
      const teamColor = `#${team.team.color}`;
      const teamLogo = team.team.logo; // Get the team logo URL
      const athletes = team.statistics[0].athletes; // Access the first statistics object

      const headers = isSmallScreen
        ? ["Player", "M", "PTS", "FG"]
        : ["Player", "MIN", "PTS", "REB", "AST", "PF", "FG", "3PT", "+/-"];

      const starters = athletes
        .filter(player => player.starter)
        .map(player => `
          <tr class="${gameState === "Final" ? "" : player.active ? "active-player" : ""}">
            <td>${gameState === "Final" ? "" : player.active ? "🟢 " : ""}${isSmallScreen ? `${player.athlete.shortName}` : `${player.athlete.displayName}`} <span style="color: grey;">${player.athlete.position.abbreviation}</span></td>
            <td>${player.stats[0] || "0"}</td> <!-- MIN -->
            <td>${player.stats[13] || "0"}</td> <!-- PTS -->
            ${isSmallScreen ? "" : `<td>${player.stats[6] || "0"}</td>`} <!-- REB -->
            ${isSmallScreen ? "" : `<td>${player.stats[7] || "0"}</td>`} <!-- AST -->
            ${isSmallScreen ? "" : `<td>${player.stats[11] || "0"}</td>`} <!-- PF -->
            <td>${player.stats[1] || "0"}</td> <!-- FG -->
            ${isSmallScreen ? "" : `<td>${player.stats[2] || "0-0"}</td>`} <!-- 3PT -->
            ${isSmallScreen ? "" : `<td>${player.stats[12] || "0"}</td>`} <!-- +/- -->
          </tr>
        `).join("");

      const nonStarters = athletes
        .filter(player => !player.starter)
        .sort((a, b) => parseFloat(b.stats[0] || "0") - parseFloat(a.stats[0] || "0")) // Sort by minutes played
        .map(player => `
          <tr class="${gameState === "Final" ? "" : player.active ? "active-player" : ""}">
            <td>${gameState === "Final" ? "" : player.active ? "🟢 " : ""}${isSmallScreen ? `${player.athlete.shortName}` : `${player.athlete.displayName}`} <span style="color: grey;">${player.athlete?.position?.abbreviation || ""}</span></td>
            <td>${player.stats[0] || "0"}</td> <!-- MIN -->
            <td>${player.stats[13] || "0"}</td> <!-- PTS -->
            ${isSmallScreen ? "" : `<td>${player.stats[6] || "0"}</td>`} <!-- REB -->
            ${isSmallScreen ? "" : `<td>${player.stats[7] || "0"}</td>`} <!-- AST -->
            ${isSmallScreen ? "" : `<td>${player.stats[11] || "0"}</td>`} <!-- PF -->
            <td>${player.stats[1] || "0"}</td> <!-- FG -->
            ${isSmallScreen ? "" : `<td>${player.stats[2] || "0-0"}</td>`} <!-- 3PT -->
            ${isSmallScreen ? "" : `<td>${player.stats[12] || "0"}</td>`} <!-- +/- -->
          </tr>
        `).join("");

      return `
        <div class="team-box-score ${gameState === "Final" ? "final" : ""} responsive-team-box-score ${gameState === "Final" ? "final" : ""}">
          <h3 style="background-color: ${teamColor}; display: flex; align-items: center; gap: 10px;">
            <img src="${teamLogo}" alt="${teamName}" style="width: 30px; height: 30px; border-radius: 50%;"> ${teamName}
          </h3>
          <div class="roster-section">
            <h4>Starters</h4>
            <table>
              <thead>
                <tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr>
              </thead>
              <tbody>${starters}</tbody>
            </table>
          </div>
          <div class="roster-section">
            <h4>Bench</h4>
            <table>
              <thead>
                <tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr>
              </thead>
              <tbody>${nonStarters}</tbody>
            </table>
          </div>
        </div>
      `;
    };

    const team1 = players.find(team => team.displayOrder === 1);
    const team2 = players.find(team => team.displayOrder === 2);

    boxScoreDiv.innerHTML = `
      ${renderTeamRoster(team1)}
      ${renderTeamRoster(team2)}
    `;
  } catch (error) {
    console.error("Error fetching NBA box score data:", error);
  }
}

async function fetchAndRenderTopScoreboard() {
  try {
    function getOrdinalSuffix(num) {
      if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
      switch (num % 10) {
        case 1: return `${num}st`;
        case 2: return `${num}nd`;
        case 3: return `${num}rd`;
        default: return `${num}th`;
      }
    }

    const gameId = getQueryParam("gameId");
    const gameDate = getQueryParam("date");
    
    if (!gameId) {
      console.error("No gameId provided");
      return;
    }

    let selectedGame = null;
    let scoreboardData = null;

    if (gameDate) {
      // Use the specific date provided - check if this game date is in Summer League period
      const isGameInSummerLeague = isDateInSummerLeague(gameDate);
      let foundGame = false;
      
      if (isGameInSummerLeague) {
        // Try Summer League API first for games in Summer League period
        try {
          const summerLeagueAPI = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba-summer-las-vegas/scoreboard?dates=${gameDate}`;
          const response = await fetch(summerLeagueAPI);
          const data = await response.json();
          const games = data.events || [];
          
          selectedGame = games.find(game => game.id === gameId);
          if (selectedGame) {
            scoreboardData = data;
            foundGame = true;
          }
        } catch (error) {
          console.log(`Summer League API failed for date ${gameDate}:`, error);
        }
      }
      
      // If not found in Summer League or not a Summer League game, try regular NBA API
      if (!foundGame) {
        try {
          const nbaAPI = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${gameDate}`;
          const response = await fetch(nbaAPI);
          const data = await response.json();
          const games = data.events || [];
          
          selectedGame = games.find(game => game.id === gameId);
          if (selectedGame) {
            scoreboardData = data;
            foundGame = true;
          }
        } catch (error) {
          console.error(`NBA API failed for date ${gameDate}:`, error);
        }
      }
    }

    // Fallback: search recent dates if specific date doesn't work
    if (!selectedGame) {
      const today = new Date();
      for (let daysBack = 0; daysBack <= 30; daysBack++) {
        const searchDate = new Date(today);
        searchDate.setDate(today.getDate() - daysBack);
        
        const adjustedDate = searchDate.getFullYear() +
                             String(searchDate.getMonth() + 1).padStart(2, "0") +
                             String(searchDate.getDate()).padStart(2, "0");

        // Check if this search date is in Summer League period
        const isSearchDateInSummerLeague = isDateInSummerLeague(adjustedDate);
        let foundInFallback = false;
        
        if (isSearchDateInSummerLeague) {
          // Try Summer League API first for dates in Summer League period
          try {
            const summerLeagueAPI = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba-summer-las-vegas/scoreboard?dates=${adjustedDate}`;
            const response = await fetch(summerLeagueAPI);
            const data = await response.json();
            const games = data.events || [];
            
            selectedGame = games.find(game => game.id === gameId);
            if (selectedGame) {
              scoreboardData = data;
              foundInFallback = true;
            }
          } catch (error) {
            console.log(`Summer League API failed for fallback date ${adjustedDate}:`, error);
          }
        }
        
        // If not found in Summer League, try regular NBA API
        if (!foundInFallback) {
          try {
            const nbaAPI = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${adjustedDate}`;
            const response = await fetch(nbaAPI);
            const data = await response.json();
            const games = data.events || [];
            
            selectedGame = games.find(game => game.id === gameId);
            if (selectedGame) {
              scoreboardData = data;
              foundInFallback = true;
            }
          } catch (error) {
            console.error(`NBA API failed for fallback date ${adjustedDate}:`, error);
          }
        }
        
        if (foundInFallback) break;
      }
    }

    if (!selectedGame) {
      console.error(`Game with ID ${gameId} not found.`);
      return;
    }

    const awayTeam = selectedGame.competitions[0].competitors.find(c => c.homeAway === "away")?.team;
    const homeTeam = selectedGame.competitions[0].competitors.find(c => c.homeAway === "home")?.team;

    const awayScore = selectedGame.competitions[0].competitors.find(c => c.homeAway === "away")?.score || "0";
    const homeScore = selectedGame.competitions[0].competitors.find(c => c.homeAway === "home")?.score || "0";

    const awayLinescores = selectedGame.competitions[0].competitors.find(c => c.homeAway === "away")?.linescores || [];
    const homeLinescores = selectedGame.competitions[0].competitors.find(c => c.homeAway === "home")?.linescores || [];

    const slug = selectedGame.season?.slug || "regular-season";

    const homeTeamRecord = slug === "post-season"
      ? selectedGame.competitions[0].competitors.find(c => c.homeAway === "home")?.record || "0-0"
      : selectedGame.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamRecord = slug === "post-season"
      ? selectedGame.competitions[0].competitors.find(c => c.homeAway === "away")?.record || "0-0"
      : selectedGame.competitions[0].competitors.find(c => c.homeAway === "away")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const period = selectedGame.status.period || 0;
    const clock = selectedGame.status.displayClock || "00:00";
    const gameStatus = selectedGame.status.type.description;
    const isGameOver = gameStatus === "Final";

    const topScoreboardEl = document.getElementById("topScoreboard");
    if (!topScoreboardEl) {
      console.error("Error: 'topScoreboard' element not found.");
      return;
    }

    const periodText = gameStatus === "Final"
      ? "Final"
      : period > 4
      ? "OT"
      : `${getOrdinalSuffix(period)} Quarter`;

    const timeLeft = gameStatus === "Final" || clock === "0.0" ? "End" : clock;

    // Determine score colors for the final game state
    const awayScoreColor = gameStatus === "Final" && parseInt(awayScore) < parseInt(homeScore) ? "grey" : "white";
    const homeScoreColor = gameStatus === "Final" && parseInt(homeScore) < parseInt(awayScore) ? "grey" : "white";

    topScoreboardEl.innerHTML = `
      <div class="team-block">
        <div class="team-score responsive-score" style="color: ${awayScoreColor};">${awayScore}</div>
        <img class="team-logo responsive-logo" src="${awayTeam?.logo}" alt="${awayTeam?.displayName}">
        <div class="team-name responsive-name">${awayTeam?.shortDisplayName}</div>
        <div class="team-record responsive-record">${awayTeamRecord}</div>
      </div>
      <div class="inning-center">
        <div class="inning-status responsive-inning-status">${periodText}</div>
        <div class="time-left responsive-game-clock">${timeLeft}</div>
      </div>
      <div class="team-block">
        <div class="team-score responsive-score" style="color: ${homeScoreColor};">${homeScore}</div>
        <img class="team-logo responsive-logo" src="${homeTeam?.logo}" alt="${homeTeam?.displayName}">
        <div class="team-name responsive-name">${homeTeam?.shortDisplayName}</div>
        <div class="team-record responsive-record">${homeTeamRecord}</div>
      </div>
    `;

    renderLinescoreTable(awayLinescores, homeLinescores, awayTeam?.abbreviation, homeTeam?.abbreviation, awayScore, homeScore);

    const playDescriptionDiv = document.getElementById("playDescription");
    if (gameStatus === "Final") {
      playDescriptionDiv.innerHTML = ""; // Clear play description
      playDescriptionDiv.style.display = "none"; // Hide the play description area
    } else {
      const competitors = selectedGame.competitions[0].competitors;
      const lastPlay = selectedGame.competitions[0].situation?.lastPlay || null;
      playDescriptionDiv.style.display = "block"; // Ensure play description is visible
      renderPlayDescription(lastPlay, clock, competitors);
    }

    // Render the box score
    renderBoxScore(gameId, gameStatus);

    // Return true if game is over to stop further updates
    return isGameOver;
  } catch (error) {
    console.error("Error fetching NBA scoreboard data:", error);
    return true; // Stop fetching on error
  }
}

function renderLinescoreTable(awayLinescores, homeLinescores, awayAbbr, homeAbbr, awayTotal, homeTotal) {
  const linescoreTableDiv = document.getElementById("linescoreTable");
  if (!linescoreTableDiv) {
    console.error("Error: 'linescoreTable' element not found.");
    return;
  }

  const periods = [1, 2, 3, 4]; // Standard NBA periods
  const periodHeaders = periods.map(period => `<th>${period}</th>`).join("");

  const awayScores = periods.map(period => {
    const score = awayLinescores.find(ls => ls.period === period)?.displayValue || "-";
    return `<td>${score}</td>`;
  }).join("");

  const homeScores = periods.map(period => {
    const score = homeLinescores.find(ls => ls.period === period)?.displayValue || "-";
    return `<td>${score}</td>`;
  }).join("");

  linescoreTableDiv.innerHTML = `
    <table>
      <thead>
        <tr>
          <th></th>
          ${periodHeaders}
          <th></th> <!-- Space between periods and total -->
          <th>T</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${awayAbbr}</td>
          ${awayScores}
          <td></td> <!-- Space between periods and total -->
          <td>${awayTotal}</td>
        </tr>
        <tr>
          <td>${homeAbbr}</td>
          ${homeScores}
          <td></td> <!-- Space between periods and total -->
          <td>${homeTotal}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function renderPlayDescription(lastPlay, clock, competitors) {
  const playDescriptionDiv = document.getElementById("playDescription");
  if (!playDescriptionDiv) {
    console.error("Error: 'playDescription' element not found.");
    return;
  }

  if (!lastPlay || !lastPlay.text) {
    playDescriptionDiv.innerHTML = `
      <div class="play-description-content">
        <div class="play-text">No play data available</div>
      </div>
    `;
    playDescriptionDiv.style.backgroundColor = "#1a1a1a"; // Default background color
    return;
  }

  // Handle clock display
  const displayClock = clock === "0.0" ? "End" : clock;

  // Find the team in the competitors array that matches the team ID from lastPlay
  const team = competitors.find(c => c.team.id === lastPlay.team?.id);

  // Use the team's color or fallback to a default color
  const teamColor = team?.team?.color ? `#${team.team.color}` : "#1a1a1a";
  playDescriptionDiv.style.backgroundColor = teamColor;

  playDescriptionDiv.innerHTML = `
    <div class="play-description-content">
      <div class="play-text">${lastPlay.text}</div>
    </div>
  `;
}

// Fetch and render the scoreboard based on the gameId in the URL
const gameId = getQueryParam("gameId");
if (gameId) {
  const updateScoreboard = async () => {
    const gameOver = await fetchAndRenderTopScoreboard();
    if (gameOver && updateInterval) {
      clearInterval(updateInterval);
      console.log("Game is over. Stopped fetching updates.");
    }
  };

  updateScoreboard(); // Initial fetch
  updateInterval = setInterval(updateScoreboard, 2000);
} else {
  document.getElementById("scoreboardContainer").innerHTML = "<p>No game selected.</p>";
}

const LEAGUES = {
  "Champions League": { code: "uefa.champions", logo: "2" },
  "Europa League": { code: "uefa.europa", logo: "2310" },
  "Europa Conference League": { code: "uefa.europa.conf", logo: "20296" },
  "Super Cup": { code: "uefa.super_cup", logo: "1272" },
};

let currentUefaLeague = localStorage.getItem("currentUefaLeague") || "uefa.champions"; // Default to Champions League

// Pagination variables
let fixturesPerPage = 3;
let currentFixturePages = new Map(); // Store current page for each team

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

let lastFixturesHash = null;

function getTeamLogo(team) {
  if (["367", "2950", "111"].includes(team.id)) {
    return team.logos?.find(logo => logo.rel.includes("default"))?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`;
  }
  return team.logos?.find(logo => logo.rel.includes("dark"))?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`;
}

async function fetchAndDisplayFixtures() {
  try {
    const TEAMS_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/teams`;

    const teamsResponse = await fetch(TEAMS_API_URL);
    const teamsData = await teamsResponse.json();
    const teams = teamsData.sports[0].leagues[0].teams.map(teamData => teamData.team);

    // Fetch schedules for all teams in parallel
    const schedulePromises = teams.map(team =>
      fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/teams/${team.id}/schedule`)
        .then(response => response.json())
        .then(data => ({ team, events: data.events || [] }))
    );

    const schedulesData = await Promise.all(schedulePromises);

    // Combine all responses into a single string for hashing (optional, for caching)
    const combinedData = JSON.stringify(schedulesData);
    const newHash = hashString(combinedData);

    if (newHash === lastFixturesHash) {
      return; // No changes, skip update
    }
    lastFixturesHash = newHash;

    const container = document.getElementById("fixturesContainer");
    if (!container) {
      console.error("Fixtures container not found");
      return;
    }

    // Update the header to reflect the current league
    const header = document.querySelector("#scoreboard h2");
    const currentUefaLeagueName = Object.keys(LEAGUES).find(
      leagueName => LEAGUES[leagueName].code === currentUefaLeague
    );
    if (header) {
      header.textContent = `${currentUefaLeagueName} Fixtures`;
    }

    container.innerHTML = ""; // Clear any existing content

    for (const { team, events } of schedulesData) {
      // Skip teams with all-caps names
      if (team.displayName === team.displayName.toUpperCase()) {
        continue;
      }

      // Filter for League Phase events (seasonType.id === 1) and sort in reverse order (last is first)
      const leaguePhaseEvents = events
        .filter(event => event.seasonType && event.seasonType.id === "1")
        .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date descending (newest first)

      const displayName = team.shortDisplayName || team.displayName;

      const logoUrl = ["367", "2950"].includes(team.id)
        ? team.logos?.find(logo => logo.rel.includes("default"))?.href || ""
        : team.logos?.find(logo => logo.rel.includes("dark"))?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`;

      const nameColorChange = ["ffffff", "ffee00", "ffff00", "81f733", "ffef32", "FCEE33"].includes(team.color) ? "black" : "white";

      // Initialize pagination for this team
      if (!currentFixturePages.has(team.id)) {
        currentFixturePages.set(team.id, 1);
      }

      const currentPage = currentFixturePages.get(team.id);
      const totalPages = Math.ceil(leaguePhaseEvents.length / fixturesPerPage);
      const startIndex = (currentPage - 1) * fixturesPerPage;
      const endIndex = startIndex + fixturesPerPage;
      const paginatedEvents = leaguePhaseEvents.slice(startIndex, endIndex);

      const gamesHtml = leaguePhaseEvents.length > 0
        ? `<div class="match-list" id="match-list-${team.id}">${paginatedEvents.map((game, index) => {
            // Calculate round number: first match (newest) gets highest number
            const originalIndex = startIndex + index;
            const roundNumber = leaguePhaseEvents.length - originalIndex;
            return buildGameCard(game, team, roundNumber);
          }).join('')}</div>`
        : `<div class="no-game-card" style="color: ${nameColorChange};">No league phase fixtures available</div>`;

      const paginationHtml = leaguePhaseEvents.length > fixturesPerPage
        ? `<div class="fixture-pagination" id="pagination-${team.id}">
            <button class="pagination-btn" onclick="changeFixturePage('${team.id}', ${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>Prev</button>
            <span class="page-info">Page ${currentPage} of ${totalPages}</span>
            <button class="pagination-btn" onclick="changeFixturePage('${team.id}', ${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>Next</button>
          </div>`
        : '';

      const teamCard = document.createElement("div");
      teamCard.className = "team-card";
      teamCard.style.backgroundColor = ["2950", "3243", "435"].includes(team.id) ? `#${team.alternateColor}` : `#${team.color}`;

      teamCard.innerHTML = `
        <div class="team-header" style="flex-direction: row;">
          <img src="${logoUrl}" alt="${team.displayName}" class="team-logo">
          <h2 class="team-name" style="color: ${nameColorChange};">${displayName}</h2>
        </div>
        <div class="team-games">${gamesHtml}</div>
        ${paginationHtml}
      `;

      // Add click handlers for match cards
      setTimeout(() => {
        const matchList = teamCard.querySelector(`#match-list-${team.id}`);
        if (matchList) {
          matchList.querySelectorAll('.match-item').forEach(item => {
            item.addEventListener('click', () => {
              const gameId = item.getAttribute('data-game-id');
              if (gameId) {
                window.location.href = `scoreboard.html?gameId=${gameId}`;
              }
            });
          });
        }
      }, 0);

      container.appendChild(teamCard);
    }

    // Save the current league to localStorage
    localStorage.setItem("currentUefaLeague", currentUefaLeague);
  } catch (error) {
    console.error("Error fetching UEFA fixtures:", error);
  }
}

function buildGameCard(game, team, roundNumber) {
  const header = `${currentUefaLeague === "uefa.super_cup" ? "Final" : `Round ${roundNumber}`}`;

  const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home");
  const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away");

  const homeAgg = homeTeam?.aggregateScore?.value ?? 0;
  const awayAgg = awayTeam?.aggregateScore?.value ?? 0;

  const isAgg = homeAgg > 0 || awayAgg > 0;

  const leagueName = Object.keys(LEAGUES).find(
    leagueName => LEAGUES[leagueName].code === currentUefaLeague
  );

  const homeShootoutScore = homeTeam?.score?.shootoutScore;
  const awayShootoutScore = awayTeam?.score?.shootoutScore;

  const homeScore = homeTeam?.score?.value || 0;
  const awayScore = awayTeam?.score?.value || 0;

  const gameDate = new Date(game.date);
  const formattedDate = gameDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
  const formattedTime = gameDate.toLocaleTimeString("en-US", {
  hour: "numeric",
  minute: "numeric",
  hour12: true,
  timeZone: "America/New_York"
  });

  const homeLogo = `https://a.espncdn.com/i/teamlogos/soccer/500/${homeTeam.team.id}.png`;
  const awayLogo = `https://a.espncdn.com/i/teamlogos/soccer/500/${awayTeam.team.id}.png`;
  const homeName = homeTeam.team.abbreviation || homeTeam.team.shortDisplayName;
  const awayName = awayTeam.team.abbreviation || awayTeam.team.shortDisplayName;

  let resultClass = "";
  let resultText = "";

  const homeS = homeShootoutScore ? `${homeScore}<sup>(${homeShootoutScore})</sup>` : `${homeScore}`;
  const awayS = awayShootoutScore ? `${awayScore}<sup>(${awayShootoutScore})</sup>` : `${awayScore}`;

  if (game.competitions[0]?.status?.type?.state === "post") {
    // Determine if the current team is home or away
    const isCurrentTeamHome = homeTeam.team.id === team.id;
    const isCurrentTeamAway = awayTeam.team.id === team.id;

    // Calculate result from current team's perspective
    if (homeScore > awayScore || homeShootoutScore > awayShootoutScore) {
      // Home team won
      resultClass = isCurrentTeamHome ? "win" : "loss";
    } else if (homeScore < awayScore || homeShootoutScore < awayShootoutScore) {
      // Away team won
      resultClass = isCurrentTeamAway ? "win" : "loss";
    } else {
      // Draw
      resultClass = "draw";
    }
    resultText = `${homeS} - ${awayS}`;
  } else if (game.competitions[0]?.status?.type?.state === "pre") {
    resultClass = "scheduled";
    resultText = "vs";
  } else {
    resultClass = "live";
    resultText = game.competitions[0]?.status?.type?.shortDetail || 'Live';
  }

  return `
    <div class="match-item" data-game-id="${game.id}">
      <div style="font-size: 0.8rem; color: grey; text-align: center; margin-bottom: 10px;">${leagueName} - ${header}</div>
      <div class="match-teams">
        <div class="match-team-info">
          <img src="${homeLogo}" alt="${homeName}" class="match-team-logo" onerror="this.src='../soccer-ball-png-24.png';">
          <div class="match-team-name">${homeName}</div>
        </div>
        <div class="match-result ${resultClass}">${resultText}</div>
        <div class="match-team-info">
          <div class="match-team-name">${awayName}</div>
          <img src="${awayLogo}" alt="${awayName}" class="match-team-logo" onerror="this.src='../soccer-ball-png-24.png';">
        </div>
      </div>
      <div class="match-date">${formattedDate}, ${formattedTime}</div>
    </div>
  `;
}

function setupLeagueButtons() {
  const leagueContainer = document.getElementById("leagueButtons");
  if (!leagueContainer) {
    console.error("League buttons container not found");
    return;
  }

  leagueContainer.innerHTML = ""; // Clear any existing content

  for (const [leagueName, leagueData] of Object.entries(LEAGUES)) {
    const button = document.createElement("button");
    button.className = `league-button ${currentUefaLeague === leagueData.code ? "active" : ""}`;
    button.innerHTML = `
      <span class="league-text">${leagueName}</span>
      <img class="league-logo" src="https://a.espncdn.com/i/leaguelogos/soccer/500-dark/${leagueData.logo}.png" alt="${leagueName}" style="display: none;">
    `;
    button.addEventListener("click", () => {
      currentUefaLeague = leagueData.code;

      // Save the current league to localStorage
      localStorage.setItem("currentUefaLeague", currentUefaLeague);

      // Update active state
      document.querySelectorAll(".league-button").forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");

      fetchAndDisplayFixtures();
    });

    leagueContainer.appendChild(button);
  }

  updateLeagueButtonDisplay(); // Adjust button display based on screen size
}

function updateLeagueButtonDisplay() {
  const isSmallScreen = window.innerWidth < 525;
  document.querySelectorAll(".league-button").forEach(button => {
    const text = button.querySelector(".league-text");
    const logo = button.querySelector(".league-logo");
    if (isSmallScreen) {
      text.style.display = "none";
      logo.style.display = "inline";
    } else {
      text.style.display = "inline";
      logo.style.display = "none";
    }
  });
}

function changeFixturePage(teamId, newPage) {
  // Update the current page for this team
  currentFixturePages.set(teamId, newPage);
  
  // Re-render the fixtures for this team
  updateTeamFixtures(teamId);
}

async function updateTeamFixtures(teamId) {
  try {
    // Fetch the team's schedule data
    const scheduleResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/teams/${teamId}/schedule`);
    const scheduleData = await scheduleResponse.json();
    const events = scheduleData.events || [];
    
    // Filter for League Phase events and sort in reverse order
    const leaguePhaseEvents = events
      .filter(event => event.seasonType && event.seasonType.id === "1")
      .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date descending (newest first)
    
    // Get current page and calculate pagination
    const currentPage = currentFixturePages.get(teamId);
    const totalPages = Math.ceil(leaguePhaseEvents.length / fixturesPerPage);
    const startIndex = (currentPage - 1) * fixturesPerPage;
    const endIndex = startIndex + fixturesPerPage;
    const paginatedEvents = leaguePhaseEvents.slice(startIndex, endIndex);
    
    // Get team data for buildGameCard function
    const teamsResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/teams/${teamId}`);
    const teamData = await teamsResponse.json();
    const team = teamData.team;
    
    // Update the match list
    const matchList = document.getElementById(`match-list-${teamId}`);
    if (matchList) {
      matchList.innerHTML = paginatedEvents.map((game, index) => {
        // Calculate round number: first match (newest) gets highest number
        const originalIndex = startIndex + index;
        const roundNumber = leaguePhaseEvents.length - originalIndex;
        return buildGameCard(game, team, roundNumber);
      }).join('');
      
      // Re-add click handlers for match cards
      matchList.querySelectorAll('.match-item').forEach(item => {
        item.addEventListener('click', () => {
          const gameId = item.getAttribute('data-game-id');
          if (gameId) {
            window.location.href = `scoreboard.html?gameId=${gameId}`;
          }
        });
      });
    }
    
    // Update pagination buttons
    const paginationContainer = document.getElementById(`pagination-${teamId}`);
    if (paginationContainer) {
      paginationContainer.innerHTML = `
        <button class="pagination-btn" onclick="changeFixturePage('${teamId}', ${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>Prev</button>
        <span class="page-info">Page ${currentPage} of ${totalPages}</span>
        <button class="pagination-btn" onclick="changeFixturePage('${teamId}', ${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>Next</button>
      `;
    }
  } catch (error) {
    console.error("Error updating team fixtures:", error);
  }
}

// Ensure the default league is loaded when the page is opened
window.addEventListener("DOMContentLoaded", () => {
  // Reset to default if coming from another page
  if (!currentUefaLeague || !Object.values(LEAGUES).some(league => league.code === currentUefaLeague)) {
    currentUefaLeague = "uefa.champions";
  }
  setupLeagueButtons();
  fetchAndDisplayFixtures();
});

setInterval(fetchAndDisplayFixtures, 60000); // Update every minute

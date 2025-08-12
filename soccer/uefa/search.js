const LEAGUES = {
  "Champions League": { code: "uefa.champions", logo: "2" },
  "Europa League": { code: "uefa.europa", logo: "2310" },
  "Europa Conference League": { code: "uefa.europa.conf", logo: "20296" },
  "Super Cup": { code: "uefa.super_cup", logo: "1272" },
};

let currentUefaLeague = localStorage.getItem("currentUefaLeague") || "uefa.champions";
let allTeams = [];
let selectedTeam = null;
let filteredTeams = [];
let isLoading = false;

// Initialize the page
document.addEventListener("DOMContentLoaded", () => {
  setupLeagueButtons();
  setupSearchForm();
  loadTeams();
});

// Handle back/forward navigation
window.addEventListener('popstate', (event) => {
  if (event.state) {
    restoreFromState(event.state);
  }
});

function setupLeagueButtons() {
  const leagueContainer = document.getElementById("leagueButtons");
  if (!leagueContainer) return;

  leagueContainer.innerHTML = "";

  for (const [leagueName, leagueData] of Object.entries(LEAGUES)) {
    const button = document.createElement("button");
    button.className = `league-button ${currentUefaLeague === leagueData.code ? "active" : ""}`;
    button.innerHTML = `
      <span class="league-text">${leagueName}</span>
      <img class="league-logo" src="https://a.espncdn.com/i/leaguelogos/soccer/500-dark/${leagueData.logo}.png" alt="${leagueName}" style="display: none;">
    `;
    button.addEventListener("click", () => {
      currentUefaLeague = leagueData.code;
      localStorage.setItem("currentUefaLeague", currentUefaLeague);
      document.querySelectorAll(".league-button").forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");
      loadTeams();
      clearSearch();
    });

    leagueContainer.appendChild(button);
  }

  updateLeagueButtonDisplay();
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

function setupSearchForm() {
  const teamSearchInput = document.getElementById("teamSearch");
  const suggestionsDiv = document.getElementById("teamSuggestions");

  // Team search with autocomplete
  teamSearchInput.addEventListener("input", handleTeamSearch);
  teamSearchInput.addEventListener("blur", () => {
    setTimeout(() => {
      suggestionsDiv.style.display = "none";
    }, 200);
  });

  // Enter key support
  teamSearchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      handleTeamSearch();
    }
  });
}

async function loadTeams() {
  try {
    const TEAMS_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/teams`;
    const response = await fetch(TEAMS_API_URL);
    const data = await response.json();
    
    allTeams = data.sports[0].leagues[0].teams
      .map(teamData => teamData.team)
      .filter(team => team.displayName !== team.displayName.toUpperCase())
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  } catch (error) {
    console.error("Error loading teams:", error);
  }
}

async function handleTeamSearch() {
  const searchTerm = document.getElementById("teamSearch").value.toLowerCase();
  const suggestionsDiv = document.getElementById("teamSuggestions");
  const resultsDiv = document.getElementById("searchResults");

  // Always hide the dropdown suggestions
  suggestionsDiv.style.display = "none";

  if (searchTerm.length < 1) {
    filteredTeams = [];
    resultsDiv.innerHTML = "";
    return;
  }

  // Filter teams based on search term
  filteredTeams = allTeams.filter(team =>
    team.displayName.toLowerCase().includes(searchTerm) ||
    team.shortDisplayName.toLowerCase().includes(searchTerm) ||
    team.abbreviation.toLowerCase().includes(searchTerm)
  );

  // Always display filtered results as team cards
  displayTeamResults(filteredTeams);
}

async function displayTeamResults(teams) {
  const resultsDiv = document.getElementById("searchResults");

  if (teams.length === 0) {
    resultsDiv.innerHTML = `
      <div class="no-results">
        No teams found matching your search.
      </div>
    `;
    return;
  }

  const teamCardPromises = teams.map(team => createTeamCard(team));
  const teamCards = await Promise.all(teamCardPromises);

  resultsDiv.innerHTML = `
    <div class="results-header">
      <h3>Found ${teams.length} team${teams.length === 1 ? '' : 's'}</h3>
      <p>Click on a team to view detailed information</p>
    </div>
    ${teamCards.join('')}
  `;

  // Add click handlers for team cards
  resultsDiv.querySelectorAll('.team-card').forEach(card => {
    card.addEventListener('click', () => {
      const teamId = card.getAttribute('data-team-id');
      if (teamId) {
        // Navigate to team page with league parameter
        window.location.href = `team-page.html?teamId=${teamId}&league=${currentUefaLeague}`;
      }
    });
  });
}

async function createTeamCard(team) {
  const logoUrl = getTeamLogo(team);
  const leagueName = Object.keys(LEAGUES).find(key => LEAGUES[key].code === currentUefaLeague);
  const altColor = ["ffffff", "ffee00", "ffff00", "81f733", "000000"].includes(team.color);
  const teamColor = altColor ? `#${team.alternateColor}` : `#${team.color}`;

  return `
    <div class="team-card" data-team-id="${team.id}">
      <img src="${logoUrl}" alt="${team.displayName}" class="team-logo-large" onerror="this.src='soccer-ball-png-24.png';">
      <div class="team-details">
        <div class="team-name-large">${team.displayName}</div>
        <div class="team-division" style="color: ${teamColor};">${team.abbreviation || team.shortDisplayName} - ${leagueName}</div>
        <div class="team-record">Click to view team details</div>
      </div>
    </div>
  `;
}

function getTeamLogo(team) {
  if (["367", "2950", "111"].includes(team.id)) {
    return team.logos?.find(logo => logo.rel.includes("default"))?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`;
  }
  return team.logos?.find(logo => logo.rel.includes("dark"))?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`;
}

function clearSearch() {
  document.getElementById("teamSearch").value = "";
  document.getElementById("searchResults").innerHTML = "";
  filteredTeams = [];
}

function restoreFromState(state) {
  if (state && state.league) {
    currentUefaLeague = state.league;
    localStorage.setItem("currentUefaLeague", currentUefaLeague);
    setupLeagueButtons();
    loadTeams();
  }
}

// Handle window resize for responsive design
window.addEventListener("resize", updateLeagueButtonDisplay);

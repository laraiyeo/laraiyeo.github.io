const LEAGUES = {
  "Premier League": { code: "eng.1", logo: "23" },
  "La Liga": { code: "esp.1", logo: "15" },
  "Bundesliga": { code: "ger.1", logo: "10" },
  "Serie A": { code: "ita.1", logo: "12" },
  "Ligue 1": { code: "fra.1", logo: "9" },
  "MLS": { code: "usa.1", logo: "19" },
  "Saudi PL": { code: "ksa.1", logo: "2488" }
};

let currentLeague = localStorage.getItem("currentLeague") || "eng.1";
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

function setupMobileScrolling(container) {
  // Remove any existing mobile styles first
  const existingStyle = document.getElementById("mobile-scroll-style");
  if (existingStyle) {
    existingStyle.remove();
  }

  // Add horizontal scroll styling for mobile devices
  if (window.innerWidth < 768) {
    // Hide scrollbar for webkit browsers and add mobile-specific styles
    const style = document.createElement("style");
    style.textContent = `
      .league-buttons::-webkit-scrollbar {
        display: none;
      }
      @media (max-width: 767px) {
        .league-buttons {
          overflow-x: auto !important;
          overflow-y: hidden !important;
          justify-content: flex-start !important;
          scroll-behavior: smooth;
          padding: 0 10px;
          -webkit-overflow-scrolling: touch;
          min-height: 50px;
        }
        .league-button {
          flex-shrink: 0 !important;
          white-space: nowrap;
        }
      }
    `;
    style.id = "mobile-scroll-style";
    document.head.appendChild(style);
    
    // Apply container styles directly
    container.style.scrollbarWidth = "none"; // Firefox
    container.style.msOverflowStyle = "none"; // IE/Edge
  }
}

function setupLeagueButtons() {
  const leagueContainer = document.getElementById("leagueButtons");
  if (!leagueContainer) return;

  leagueContainer.innerHTML = "";
  
  // Add horizontal scroll styling for mobile
  setupMobileScrolling(leagueContainer);

  for (const [leagueName, leagueData] of Object.entries(LEAGUES)) {
    const button = document.createElement("button");
    button.className = `league-button ${currentLeague === leagueData.code ? "active" : ""}`;
    button.innerHTML = `
      <span class="league-text">${leagueName}</span>
      <img class="league-logo" src="https://a.espncdn.com/i/leaguelogos/soccer/500-dark/${leagueData.logo}.png" alt="${leagueName}" style="display: none;">
    `;
    button.addEventListener("click", () => {
      currentLeague = leagueData.code;
      localStorage.setItem("currentLeague", currentLeague);
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
  const leagueContainer = document.getElementById("leagueButtons");
  
  // Update mobile scrolling styles
  if (leagueContainer) {
    setupMobileScrolling(leagueContainer);
  }
  
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
    const TEAMS_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/teams`;
    const response = await fetch(TEAMS_API_URL);
    const data = await response.json();
    
    allTeams = data.sports[0].leagues[0].teams
      .map(teamData => teamData.team)
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
        // Navigate to team page
        window.location.href = `team-page.html?teamId=${teamId}`;
      }
    });
  });
}

async function createTeamCard(team) {
  const logoUrl = getTeamLogo(team);
  const leagueName = Object.keys(LEAGUES).find(key => LEAGUES[key].code === currentLeague);
  const altColor = ["ffffff", "ffee00", "ffff00", "81f733", "000000", "f7f316", "eef209", "ece83a"].includes(team.color);
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
    currentLeague = state.league;
    localStorage.setItem("currentLeague", currentLeague);
    setupLeagueButtons();
    loadTeams();
  }
}

// Handle window resize for responsive design
window.addEventListener("resize", updateLeagueButtonDisplay);

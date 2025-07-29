let allTeams = [];
let selectedTeam = null;
let filteredTeams = [];
let isLoading = false;

// Initialize the page
document.addEventListener("DOMContentLoaded", () => {
  setupSearchForm();
  loadTeams();
});

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
    // Use ESPN WNBA API like other WNBA files
    const TEAMS_API_URL = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams`;
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
  const logoUrl = `https://a.espncdn.com/i/teamlogos/wnba/500-dark/${team.abbreviation}.png`;

  const abbreviation = team.abbreviation || 'WNBA';

  return `
    <div class="team-card" data-team-id="${team.id}">
      <img src="${logoUrl}" alt="${team.displayName}" class="team-logo-large" onerror="this.src='icon.png';">
      <div class="team-details">
        <div class="team-name-large">${team.displayName}</div>
        <div class="team-division" style="color: #${team.color || '000000'};">${abbreviation} - WNBA</div>
        <div class="team-record">Click to view team details</div>
      </div>
    </div>
  `;
}

function clearSearch() {
  document.getElementById("teamSearch").value = "";
  document.getElementById("searchResults").innerHTML = "";
  filteredTeams = [];
}

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
    // Use MLB Stats API like other MLB files
    const TEAMS_API_URL = `https://statsapi.mlb.com/api/v1/teams?sportId=1`;
    const response = await fetch(TEAMS_API_URL);
    const data = await response.json();
    
    allTeams = data.teams
      .filter(team => team.sport.id === 1) // Only MLB teams
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("Error loading teams:", error);
  }
}

async function getLogoUrl(teamName) {
  const teamAbbrMap = {
    "Arizona Diamondbacks": "ari_l", "Atlanta Braves": "atl_l", "Baltimore Orioles": "bal_l", "Boston Red Sox": "bos_l",
    "Chicago White Sox": "cws_l", "Chicago Cubs": "chc_l", "Cincinnati Reds": "cin_l", "Cleveland Guardians": "cle_l",
    "Colorado Rockies": "col_l", "Detroit Tigers": "det_l", "Houston Astros": "hou_l", "Kansas City Royals": "kc_l",
    "Los Angeles Angels": "laa_l", "Los Angeles Dodgers": "lad_l", "Miami Marlins": "mia_l", "Milwaukee Brewers": "mil_l",
    "Minnesota Twins": "min_l", "New York Yankees": "nyy_l", "New York Mets": "nym_l", "Athletics": "oak_l",
    "Philadelphia Phillies": "phi_l", "Pittsburgh Pirates": "pit_l", "San Diego Padres": "sd_l", "San Francisco Giants": "sf_l",
    "Seattle Mariners": "sea_l", "St. Louis Cardinals": "stl_l", "Tampa Bay Rays": "tb_l", "Texas Rangers": "tex_l",
    "Toronto Blue Jays": "tor_l", "Washington Nationals": "wsh_l"
  };
  
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

function getTeamAbbreviation(teamName) {
  const teamAbbrMap = {
    "Arizona Diamondbacks": "ARI", "Atlanta Braves": "ATL", "Baltimore Orioles": "BAL", "Boston Red Sox": "BOS",
    "Chicago White Sox": "CWS", "Chicago Cubs": "CHC", "Cincinnati Reds": "CIN", "Cleveland Guardians": "CLE",
    "Colorado Rockies": "COL", "Detroit Tigers": "DET", "Houston Astros": "HOU", "Kansas City Royals": "KC",
    "Los Angeles Angels": "LAA", "Los Angeles Dodgers": "LAD", "Miami Marlins": "MIA", "Milwaukee Brewers": "MIL",
    "Minnesota Twins": "MIN", "New York Yankees": "NYY", "New York Mets": "NYM", "Athletics": "ATH",
    "Philadelphia Phillies": "PHI", "Pittsburgh Pirates": "PIT", "San Diego Padres": "SD", "San Francisco Giants": "SF",
    "Seattle Mariners": "SEA", "St. Louis Cardinals": "STL", "Tampa Bay Rays": "TB", "Texas Rangers": "TEX",
    "Toronto Blue Jays": "TOR", "Washington Nationals": "WSH"
  };
  
  return teamAbbrMap[teamName] || teamName.substring(0, 3).toUpperCase();
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
    team.name.toLowerCase().includes(searchTerm) ||
    team.teamName.toLowerCase().includes(searchTerm) ||
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
  const logoUrl = await getLogoUrl(team.name);
  
  // Get division info
  const division = team.division?.name || 'Unknown Division';
  
  return `
    <div class="team-card" data-team-id="${team.id}">
      <img src="${logoUrl}" alt="${team.name}" class="team-logo-large" onerror="this.src='icon.png';">
      <div class="team-details">
        <div class="team-name-large">${team.name}</div>
        <div class="team-division">${division}</div>
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
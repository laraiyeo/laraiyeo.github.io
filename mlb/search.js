let allTeams = [];
let selectedTeam = null;
let allMatches = [];
let currentPage = 1;
let matchesPerPage = 10;
let isLoading = false;

// Initialize the page
document.addEventListener("DOMContentLoaded", () => {
  setupSearchForm();
  loadTeams();
  restoreSearchState();
});

// Handle back/forward navigation
window.addEventListener('popstate', (event) => {
  if (event.state) {
    restoreFromState(event.state);
  }
});

function setupSearchForm() {
  const teamSearchInput = document.getElementById("teamSearch");
  const suggestionsDiv = document.getElementById("teamSuggestions");
  const searchButton = document.getElementById("searchButton");
  const startDateInput = document.getElementById("startDate");
  const endDateInput = document.getElementById("endDate");

  // Set default date range (last 30 days to today)
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  startDateInput.value = thirtyDaysAgo.toISOString().split('T')[0];
  endDateInput.value = today.toISOString().split('T')[0];

  // Team search with autocomplete
  teamSearchInput.addEventListener("input", handleTeamSearch);
  teamSearchInput.addEventListener("blur", () => {
    setTimeout(() => {
      suggestionsDiv.style.display = "none";
    }, 200);
  });

  // Search button
  searchButton.addEventListener("click", performSearch);

  // Enter key support
  teamSearchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      performSearch();
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

  if (searchTerm.length < 1) {
    suggestionsDiv.style.display = "none";
    selectedTeam = null;
    return;
  }

  const filteredTeams = allTeams.filter(team =>
    team.name.toLowerCase().includes(searchTerm) ||
    team.teamName.toLowerCase().includes(searchTerm) ||
    team.abbreviation.toLowerCase().includes(searchTerm)
  ).slice(0, 8);

  if (filteredTeams.length > 0) {
    // Create suggestions with logos asynchronously
    const suggestionPromises = filteredTeams.map(async team => {
      const logoUrl = await getLogoUrl(team.name);
      return `
        <div class="suggestion-item" data-team-id="${team.id}">
          <img src="${logoUrl}" alt="${team.name}" onerror="this.src='icon.png'">
          <span>${team.name}</span>
        </div>
      `;
    });

    const suggestions = await Promise.all(suggestionPromises);
    suggestionsDiv.innerHTML = suggestions.join("");

    // Add click handlers
    suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const teamId = item.getAttribute('data-team-id');
        selectedTeam = allTeams.find(team => team.id === parseInt(teamId));
        document.getElementById("teamSearch").value = selectedTeam.name;
        suggestionsDiv.style.display = "none";
      });
    });

    suggestionsDiv.style.display = "block";
  } else {
    suggestionsDiv.style.display = "none";
  }
}

async function performSearch() {
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;
  const resultsDiv = document.getElementById("searchResults");

  if (!selectedTeam) {
    alert("Please select a team from the suggestions.");
    return;
  }

  if (!startDate || !endDate) {
    alert("Please select both start and end dates.");
    return;
  }

  if (new Date(startDate) > new Date(endDate)) {
    alert("Start date must be before end date.");
    return;
  }

  if (isLoading) return;
  isLoading = true;

  // Show loading
  resultsDiv.innerHTML = '<div class="loading">Searching for matches...</div>';

  try {
    allMatches = await searchTeamMatches(selectedTeam.id, startDate, endDate);
    currentPage = 1;
    
    // Save search state
    saveSearchState();
    
    displayResults(allMatches, selectedTeam);
  } catch (error) {
    console.error("Error searching matches:", error);
    resultsDiv.innerHTML = '<div class="no-results">Error occurred while searching. Please try again.</div>';
  } finally {
    isLoading = false;
  }
}

function saveSearchState() {
  const state = {
    teamId: selectedTeam?.id,
    teamName: selectedTeam?.name,
    startDate: document.getElementById("startDate").value,
    endDate: document.getElementById("endDate").value,
    matches: allMatches,
    page: currentPage
  };
  
  localStorage.setItem('mlbSearchState', JSON.stringify(state));
  
  // Update browser history
  const url = new URL(window.location);
  url.searchParams.set('team', selectedTeam.id);
  url.searchParams.set('start', state.startDate);
  url.searchParams.set('end', state.endDate);
  
  history.pushState(state, '', url.toString());
}

function restoreSearchState() {
  // Try to restore from URL parameters first
  const urlParams = new URLSearchParams(window.location.search);
  const teamId = urlParams.get('team');
  const startDate = urlParams.get('start');
  const endDate = urlParams.get('end');
  
  if (teamId && startDate && endDate) {
    loadTeams().then(() => {
      const team = allTeams.find(t => t.id === parseInt(teamId));
      if (team) {
        selectedTeam = team;
        document.getElementById("teamSearch").value = team.name;
        document.getElementById("startDate").value = startDate;
        document.getElementById("endDate").value = endDate;
        performSearch();
      }
    });
    return;
  }
  
  // Fallback to localStorage
  const savedState = localStorage.getItem('mlbSearchState');
  if (savedState) {
    try {
      const state = JSON.parse(savedState);
      if (state.teamId && state.matches && state.matches.length > 0) {
        const team = allTeams.find(t => t.id === parseInt(state.teamId));
        if (team) {
          selectedTeam = team;
          document.getElementById("teamSearch").value = state.teamName || team.name;
          document.getElementById("startDate").value = state.startDate;
          document.getElementById("endDate").value = state.endDate;
          allMatches = state.matches;
          currentPage = state.page || 1;
          displayResults(allMatches, selectedTeam);
        }
      }
    } catch (error) {
      console.error("Error restoring search state:", error);
    }
  }
}

function restoreFromState(state) {
  if (state && state.teamId) {
    const team = allTeams.find(t => t.id === parseInt(state.teamId));
    if (team) {
      selectedTeam = team;
      document.getElementById("teamSearch").value = state.teamName || team.name;
      document.getElementById("startDate").value = state.startDate;
      document.getElementById("endDate").value = state.endDate;
      allMatches = state.matches || [];
      currentPage = state.page || 1;
      if (allMatches.length > 0) {
        displayResults(allMatches, selectedTeam);
      }
    }
  }
}

async function searchTeamMatches(teamId, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const matches = [];
  
  // For very large date ranges, break into yearly chunks
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  
  for (let year = startYear; year <= endYear; year++) {
    const yearStart = year === startYear ? startDate : `${year}-01-01`;
    const yearEnd = year === endYear ? endDate : `${year}-12-31`;
    
    const yearMatches = await fetchMatchesForYear(teamId, yearStart, yearEnd);
    matches.push(...yearMatches);
  }

  return matches.sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));
}

async function fetchMatchesForYear(teamId, startDate, endDate) {
  // Use MLB Stats API for schedule like other MLB files
  const API_URL = `https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&teamId=${teamId}&startDate=${startDate}&endDate=${endDate}`;

  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    
    // Extract games from all dates
    const allGames = [];
    data.dates?.forEach(dateObj => {
      allGames.push(...dateObj.games);
    });

    return allGames;
  } catch (error) {
    console.error("Error fetching matches for year:", error);
    return [];
  }
}

async function createMatchCard(match, teamId) {
  const homeTeam = match.teams.home;
  const awayTeam = match.teams.away;
  
  const isHomeTeam = homeTeam.team.id === teamId;
  const opponent = isHomeTeam ? awayTeam : homeTeam;
  const teamScore = isHomeTeam ? homeTeam.score : awayTeam.score;
  const opponentScore = isHomeTeam ? awayTeam.score : homeTeam.score;

  const matchDate = new Date(match.gameDate);
  const formattedDate = matchDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
  const formattedTime = matchDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });

  const status = match.status.detailedState;
  let statusText = "";
  let scoreDisplay = "";

  if (["Scheduled", "Pre-Game", "Warmup"].includes(status)) {
    statusText = "Scheduled";
    scoreDisplay = "vs";
  } else if (["Final", "Game Over", "Completed Early"].includes(status)) {
    statusText = "Final";
    scoreDisplay = `${teamScore || 0} - ${opponentScore || 0}`;
  } else {
    statusText = status;
    scoreDisplay = `${teamScore || 0} - ${opponentScore || 0}`;
  }

  // Use async getLogoUrl like scoreboard.js
  const teamLogo = await getLogoUrl(selectedTeam.name);
  const opponentLogo = await getLogoUrl(opponent.team.name);

  // Format competition name
  const competitionName = match.season?.type?.name || 'Regular Season';

  return `
    <div class="match-card" data-game-pk="${match.gamePk}">
      <div class="match-header">
        <div class="match-competition">${competitionName.toUpperCase()}</div>
        <div class="match-date">${formattedDate}, ${formattedTime}</div>
      </div>
      <div class="match-teams">
        <div class="team-info">
          <div class="team-logo-container">
            <img src="${teamLogo}" alt="${selectedTeam.name}" class="team-logo" onerror="this.src='icon.png';">
            <span class="team-abbrev">${getTeamAbbreviation(selectedTeam.name)}</span>
          </div>
          <span class="team-name">${selectedTeam.teamName || selectedTeam.name}</span>
        </div>
        <div class="match-score">${scoreDisplay}</div>
        <div class="team-info">
          <span class="team-name">${opponent.team.teamName || opponent.team.name}</span>
          <div class="team-logo-container">
            <img src="${opponentLogo}" alt="${opponent.team.name}" class="team-logo" onerror="this.src='icon.png';">
            <span class="team-abbrev">${getTeamAbbreviation(opponent.team.name)}</span>
          </div>
        </div>
      </div>
      <div class="match-status">${statusText}${isHomeTeam ? ' (Home)' : ' (Away)'}</div>
    </div>
  `;
}

async function displayResults(matches, team) {
  const resultsDiv = document.getElementById("searchResults");

  if (matches.length === 0) {
    resultsDiv.innerHTML = `
      <div class="no-results">
        No matches found for ${team.name} in the selected date range.
      </div>
    `;
    return;
  }
  
  // Calculate pagination
  const totalPages = Math.ceil(matches.length / matchesPerPage);
  const startIndex = (currentPage - 1) * matchesPerPage;
  const endIndex = startIndex + matchesPerPage;
  const paginatedMatches = matches.slice(startIndex, endIndex);

  // Create match cards asynchronously to handle logos properly
  const matchCardPromises = paginatedMatches.map(match => createMatchCard(match, team.id));
  const matchCards = await Promise.all(matchCardPromises);

  resultsDiv.innerHTML = `
    <div class="results-header">
      <h3>Found ${matches.length} match${matches.length === 1 ? '' : 'es'} for ${team.name}</h3>
      <p>in MLB</p>
      ${totalPages > 1 ? `<p>Showing ${startIndex + 1}-${Math.min(endIndex, matches.length)} of ${matches.length} matches</p>` : ''}
    </div>
    ${matchCards.join('')}
    ${createPagination(totalPages)}
  `;

  // Add click handlers for match cards
  resultsDiv.querySelectorAll('.match-card').forEach(card => {
    card.addEventListener('click', () => {
      const gamePk = card.getAttribute('data-game-pk');
      if (gamePk) {
        // Use gamePk parameter like scoreboard.js expects
        window.location.href = `scoreboard.html?gamePk=${gamePk}`;
      }
    });
  });

  // Add pagination handlers
  setupPaginationHandlers(totalPages);
}

function createPagination(totalPages) {
  if (totalPages <= 1) return '';

  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return `
    <div class="pagination">
      <button class="pagination-button" id="prevPage" ${prevDisabled ? 'disabled' : ''}>
        Previous
      </button>
      <span class="pagination-info">
        Page ${currentPage} of ${totalPages}
      </span>
      <button class="pagination-button" id="nextPage" ${nextDisabled ? 'disabled' : ''}>
        Next
      </button>
    </div>
  `;
}

function setupPaginationHandlers(totalPages) {
  const prevButton = document.getElementById('prevPage');
  const nextButton = document.getElementById('nextPage');

  if (prevButton) {
    prevButton.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        displayResults(allMatches, selectedTeam);
        saveSearchState();
        // Scroll to top of results
        document.getElementById('searchResults').scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  if (nextButton) {
    nextButton.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        displayResults(allMatches, selectedTeam);
        saveSearchState();
        // Scroll to top of results
        document.getElementById('searchResults').scrollIntoView({ behavior: 'smooth' });
      }
    });
  }
}

function clearSearch() {
  document.getElementById("teamSearch").value = "";
  document.getElementById("searchResults").innerHTML = "";
  selectedTeam = null;
  allMatches = [];
  currentPage = 1;
  
  // Clear saved state
  localStorage.removeItem('mlbSearchState');
  
  // Update URL
  const url = new URL(window.location);
  url.search = '';
  history.replaceState(null, '', url.toString());
}
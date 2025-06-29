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
    // Use the same API endpoint as teams.js
    const teamsRes = await fetch(`https://corsproxy.io/?url=https://api.nhle.com/stats/rest/en/team`);
    if (!teamsRes.ok) {
      throw new Error(`Failed to fetch teams: ${teamsRes.status}`);
    }
    const teamsData = await teamsRes.json();
    
    // Define teamColors like in teams.js to filter valid teams
    const teamColors = {
      "24": "#F47A38", "53": "#8C2633", "6": "#FFB81C", "7": "#002654",
      "20": "#C8102E", "12": "#CC0000", "16": "#CF0A2C", "21": "#6F263D",
      "29": "#041E42", "25": "#006847", "17": "#CE1126", "22": "#041E42",
      "13": "#041E42", "26": "#111111", "30": "#154734", "8": "#AF1E2D",
      "18": "#FFB81C", "1": "#CE1126", "2": "#00539B", "3": "#0038A8",
      "9": "#C8102E", "4": "#F74902", "5": "#FCB514", "28": "#006D75",
      "55": "#001628", "19": "#002F87", "14": "#002868", "10": "#00205B",
      "23": "#00205B", "54": "#B4975A", "15": "#041E42", "52": "#041E42"
    };
    
    // Filter and map teams exactly like teams.js does
    const teams = teamsData?.data?.filter(team => teamColors[team.id]) || [];
    
    allTeams = teams.map(team => ({
      id: team.id,
      fullName: team.fullName,
      triCode: team.triCode,
      displayName: team.fullName,
      shortDisplayName: team.fullName
    })).sort((a, b) => a.fullName.localeCompare(b.fullName));
      
  } catch (error) {
    console.error("Error loading teams:", error);
    allTeams = []; // Set empty array on error
  }
}

function handleTeamSearch() {
  const searchTerm = document.getElementById("teamSearch").value.toLowerCase();
  const suggestionsDiv = document.getElementById("teamSuggestions");

  if (searchTerm.length < 1) {
    suggestionsDiv.style.display = "none";
    selectedTeam = null;
    return;
  }

  const filteredTeams = allTeams.filter(team =>
    (team.fullName && team.fullName.toLowerCase().includes(searchTerm)) ||
    (team.triCode && team.triCode.toLowerCase().includes(searchTerm)) ||
    (team.displayName && team.displayName.toLowerCase().includes(searchTerm))
  ).slice(0, 8);

  if (filteredTeams.length > 0) {
    suggestionsDiv.innerHTML = filteredTeams.map(team => {
      const logoUrl = getTeamLogo(team.triCode);
      return `
        <div class="suggestion-item" data-team-id="${team.id}">
          <img src="${logoUrl}" alt="${team.fullName}" onerror="this.src='icon.png'">
          <span>${team.fullName}</span>
        </div>
      `;
    }).join("");

    // Add click handlers
    suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const teamId = item.getAttribute('data-team-id');
        selectedTeam = allTeams.find(team => team.id === parseInt(teamId));
        document.getElementById("teamSearch").value = selectedTeam.fullName;
        suggestionsDiv.style.display = "none";
      });
    });

    suggestionsDiv.style.display = "block";
  } else {
    suggestionsDiv.style.display = "none";
  }
}

function getTeamLogo(triCode) {
  return `https://assets.nhle.com/logos/nhl/svg/${triCode}_light.svg`;
}

function getAdjustedDateForNHL() {
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
    teamName: selectedTeam?.fullName,
    startDate: document.getElementById("startDate").value,
    endDate: document.getElementById("endDate").value,
    matches: allMatches,
    page: currentPage
  };
  
  localStorage.setItem('nhlSearchState', JSON.stringify(state));
  
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
        document.getElementById("teamSearch").value = team.fullName;
        document.getElementById("startDate").value = startDate;
        document.getElementById("endDate").value = endDate;
        performSearch();
      }
    });
    return;
  }
  
  // Fallback to localStorage
  const savedState = localStorage.getItem('nhlSearchState');
  if (savedState) {
    try {
      const state = JSON.parse(savedState);
      if (state.teamId && state.matches && state.matches.length > 0) {
        const team = allTeams.find(t => t.id === state.teamId);
        if (team) {
          selectedTeam = team;
          document.getElementById("teamSearch").value = state.teamName || team.fullName;
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
    const team = allTeams.find(t => t.id === state.teamId);
    if (team) {
      selectedTeam = team;
      document.getElementById("teamSearch").value = state.teamName || team.fullName;
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

  // Search day by day for NHL (keeping existing logic but optimizing for large ranges)
  const currentDate = new Date(start);
  
  while (currentDate <= end) {
    const dateString = currentDate.getFullYear() + "-" +
                      String(currentDate.getMonth() + 1).padStart(2, "0") + "-" +
                      String(currentDate.getDate()).padStart(2, "0");
    
    const dayMatches = await fetchMatchesForDate(teamId, dateString);
    matches.push(...dayMatches);
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Sort matches by date (newest first)
  return matches.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function fetchMatchesForDate(teamId, dateString) {
  const API_URL = `https://corsproxy.io/?url=https://api-web.nhle.com/v1/schedule/${dateString}`;

  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    const events = data.gameWeek?.[0]?.games || [];

    return events.filter(event => {
      return event.awayTeam.id === teamId || event.homeTeam.id === teamId;
    });
  } catch (error) {
    console.error("Error fetching matches for date:", error);
    return [];
  }
}

function displayResults(matches, team) {
  const resultsDiv = document.getElementById("searchResults");

  if (matches.length === 0) {
    resultsDiv.innerHTML = `
      <div class="no-results">
        No matches found for ${team.fullName} in the selected date range.
      </div>
    `;
    return;
  }
  
  // Calculate pagination
  const totalPages = Math.ceil(matches.length / matchesPerPage);
  const startIndex = (currentPage - 1) * matchesPerPage;
  const endIndex = startIndex + matchesPerPage;
  const paginatedMatches = matches.slice(startIndex, endIndex);

  resultsDiv.innerHTML = `
    <div class="results-header">
      <h3>Found ${matches.length} match${matches.length === 1 ? '' : 'es'} for ${team.fullName}</h3>
      <p>in NHL</p>
      ${totalPages > 1 ? `<p>Showing ${startIndex + 1}-${Math.min(endIndex, matches.length)} of ${matches.length} matches</p>` : ''}
    </div>
    ${paginatedMatches.map(match => createMatchCard(match, team.id)).join('')}
    ${createPagination(totalPages)}
  `;

  // Add click handlers for match cards
  resultsDiv.querySelectorAll('.match-card').forEach(card => {
    card.addEventListener('click', () => {
      const gameId = card.getAttribute('data-game-id');
      if (gameId) {
        window.location.href = `scoreboard.html?gameId=${gameId}`;
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

function getTeamAbbreviation(triCode) {
  return triCode || "NHL";
}

function createMatchCard(match, teamId) {
  const homeTeam = match.homeTeam;
  const awayTeam = match.awayTeam;
  
  const isHomeTeam = homeTeam.id === teamId;
  const opponent = isHomeTeam ? awayTeam : homeTeam;
  const teamScore = isHomeTeam ? homeTeam.score : awayTeam.score;
  const opponentScore = isHomeTeam ? awayTeam.score : homeTeam.score;

  const matchDate = new Date(match.startTimeUTC);
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

  const status = match.gameState;
  let statusText = "";
  let scoreDisplay = "";

  if (status === "PRE" || status === "FUT") {
    statusText = "Scheduled";
    scoreDisplay = "vs";
  } else if (status === "FINAL" || status === "OFF") {
    statusText = "Final";
    scoreDisplay = `${teamScore || 0} - ${opponentScore || 0}`;
  } else {
    statusText = "Live";
    scoreDisplay = `${teamScore || 0} - ${opponentScore || 0}`;
  }

  const teamLogo = getTeamLogo(selectedTeam.triCode);
  const opponentLogo = getTeamLogo(opponent.abbrev);

  // Format competition name
  const competitionName = match.season?.slug || 'NHL';

  return `
    <div class="match-card" data-game-id="${match.id}">
      <div class="match-header">
        <div class="match-competition">${competitionName.toUpperCase()}</div>
        <div class="match-date">${formattedDate}, ${formattedTime}</div>
      </div>
      <div class="match-teams">
        <div class="team-info">
          <div class="team-logo-container">
            <img src="${teamLogo}" alt="${selectedTeam.fullName}" class="team-logo" onerror="this.src='icon.png';">
            <span class="team-abbrev">${getTeamAbbreviation(selectedTeam.triCode)}</span>
          </div>
          <span class="team-name">${selectedTeam.triCode}</span>
        </div>
        <div class="match-score">${scoreDisplay}</div>
        <div class="team-info">
          <span class="team-name">${opponent.abbrev}</span>
          <div class="team-logo-container">
            <img src="${opponentLogo}" alt="${opponent.commonName?.default || opponent.name}" class="team-logo" onerror="this.src='icon.png';">
            <span class="team-abbrev">${getTeamAbbreviation(opponent.abbrev)}</span>
          </div>
        </div>
      </div>
      <div class="match-status">${statusText}${isHomeTeam ? ' (Home)' : ' (Away)'}</div>
    </div>
  `;
}

function clearSearch() {
  document.getElementById("teamSearch").value = "";
  document.getElementById("searchResults").innerHTML = "";
  selectedTeam = null;
  allMatches = [];
  currentPage = 1;
  
  // Clear saved state
  localStorage.removeItem('nhlSearchState');
  
  // Update URL
  const url = new URL(window.location);
  url.search = '';
  history.replaceState(null, '', url.toString());
}
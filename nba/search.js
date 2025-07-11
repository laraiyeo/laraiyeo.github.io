let allTeams = [];
let selectedTeam = null;
let allMatches = [];
let currentPage = 1;
let matchesPerPage = 10;
let isLoading = false;

// Function to determine if we're in the Summer League period
function isSummerLeague() {
  const now = new Date();
  const year = now.getFullYear();
  const summerStart = new Date(year, 6, 10); // July 10 (month is 0-indexed)
  const summerEnd = new Date(year, 6, 21);   // July 21
  
  return now >= summerStart && now <= summerEnd;
}

// Function to get the appropriate league identifier
function getLeagueIdentifier() {
  return isSummerLeague() ? "nba-summer-las-vegas" : "nba";
}

const TEAMS_API_URL = `https://site.api.espn.com/apis/site/v2/sports/basketball/${getLeagueIdentifier()}/teams`;

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

function adjustTeamShortName(shortName) {
  if (shortName === "Timberwolves") return "T. Wolves";
  if (shortName === "Trail Blazers") return "T. Blazers";
  return shortName;
}

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
    const nbaTeamsAPI = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams`;
    const summerLeagueTeamsAPI = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba-summer-las-vegas/teams`;
    
    const allTeamsMap = new Map();

    // Fetch NBA teams
    try {
      const nbaResponse = await fetch(nbaTeamsAPI);
      const nbaData = await nbaResponse.json();
      const nbaTeams = nbaData.sports[0].leagues[0].teams.map(teamData => teamData.team);
      
      nbaTeams.forEach(team => {
        allTeamsMap.set(team.id, team);
      });
    } catch (nbaError) {
      console.error("Error loading NBA teams:", nbaError);
    }

    // Fetch Summer League teams
    try {
      const summerResponse = await fetch(summerLeagueTeamsAPI);
      const summerData = await summerResponse.json();
      const summerTeams = summerData.sports[0].leagues[0].teams.map(teamData => teamData.team);
      
      summerTeams.forEach(team => {
        // Only add if not already present (avoid duplicates)
        if (!allTeamsMap.has(team.id)) {
          allTeamsMap.set(team.id, team);
        }
      });
    } catch (summerError) {
      console.log("Summer League teams not available:", summerError);
    }

    // Convert map to array and sort
    allTeams = Array.from(allTeamsMap.values())
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
      
  } catch (error) {
    console.error("Error loading teams:", error);
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
    team.displayName.toLowerCase().includes(searchTerm) ||
    team.shortDisplayName.toLowerCase().includes(searchTerm) ||
    team.abbreviation.toLowerCase().includes(searchTerm)
  ).slice(0, 8);

  if (filteredTeams.length > 0) {
    suggestionsDiv.innerHTML = filteredTeams.map(team => {
      const logoUrl = `https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${team.abbreviation}.png`;
      
      return `
        <div class="suggestion-item" data-team-id="${team.id}">
          <img src="${logoUrl}" alt="${team.displayName}" onerror="this.src='icon.png'">
          <span>${team.displayName}</span>
        </div>
      `;
    }).join("");

    // Add click handlers
    suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const teamId = item.getAttribute('data-team-id');
        selectedTeam = allTeams.find(team => team.id === teamId);
        document.getElementById("teamSearch").value = selectedTeam.displayName;
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
    teamName: selectedTeam?.displayName,
    startDate: document.getElementById("startDate").value,
    endDate: document.getElementById("endDate").value,
    matches: allMatches,
    page: currentPage
  };
  
  localStorage.setItem('nbaSearchState', JSON.stringify(state));
  
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
      const team = allTeams.find(t => t.id === teamId);
      if (team) {
        selectedTeam = team;
        document.getElementById("teamSearch").value = team.displayName;
        document.getElementById("startDate").value = startDate;
        document.getElementById("endDate").value = endDate;
        performSearch();
      }
    });
    return;
  }
  
  // Fallback to localStorage
  const savedState = localStorage.getItem('nbaSearchState');
  if (savedState) {
    try {
      const state = JSON.parse(savedState);
      if (state.teamId && state.matches && state.matches.length > 0) {
        const team = allTeams.find(t => t.id === state.teamId);
        if (team) {
          selectedTeam = team;
          document.getElementById("teamSearch").value = state.teamName || team.displayName;
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
      document.getElementById("teamSearch").value = state.teamName || team.displayName;
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

  // Search month by month to avoid hitting API limits
  const currentDate = new Date(start);
  
  while (currentDate <= end) {
    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    const searchStart = currentDate < monthStart ? monthStart : currentDate;
    const searchEnd = end < monthEnd ? end : monthEnd;
    
    const monthMatches = await fetchMatchesForPeriod(teamId, searchStart, searchEnd);
    matches.push(...monthMatches);
    
    // Move to next month
    currentDate.setMonth(currentDate.getMonth() + 1);
    currentDate.setDate(1);
  }

  // Sort matches by date (newest first)
  return matches.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function fetchMatchesForPeriod(teamId, startDate, endDate) {
  const formatDate = (date) => {
    return date.getFullYear() +
      String(date.getMonth() + 1).padStart(2, "0") +
      String(date.getDate()).padStart(2, "0");
  };

  const dateRange = `${formatDate(startDate)}-${formatDate(endDate)}`;
  
  // Fetch from both NBA and Summer League APIs
  const nbaAPI = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateRange}`;
  const summerLeagueAPI = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba-summer-las-vegas/scoreboard?dates=${dateRange}`;
  
  const allMatches = [];

  try {
    // Fetch from regular NBA API
    const nbaResponse = await fetch(nbaAPI);
    const nbaData = await nbaResponse.json();
    const nbaEvents = nbaData.events || [];
    
    const nbaMatches = nbaEvents.filter(event => {
      const competition = event.competitions?.[0];
      if (!competition) return false;
      return competition.competitors.some(competitor => competitor.team.id === teamId);
    });
    
    // Add league identifier to NBA matches
    nbaMatches.forEach(match => {
      match.leagueType = 'NBA';
    });
    
    allMatches.push(...nbaMatches);

    // Fetch from Summer League API
    try {
      const summerResponse = await fetch(summerLeagueAPI);
      const summerData = await summerResponse.json();
      const summerEvents = summerData.events || [];
      
      const summerMatches = summerEvents.filter(event => {
        const competition = event.competitions?.[0];
        if (!competition) return false;
        return competition.competitors.some(competitor => competitor.team.id === teamId);
      });
      
      // Add league identifier to Summer League matches
      summerMatches.forEach(match => {
        match.leagueType = 'Summer League';
      });
      
      allMatches.push(...summerMatches);
    } catch (summerError) {
      console.log("Summer League data not available for this period:", summerError);
    }

    return allMatches;
  } catch (error) {
    console.error("Error fetching matches for period:", error);
    return [];
  }
}

function displayResults(matches, team) {
  const resultsDiv = document.getElementById("searchResults");

  if (matches.length === 0) {
    resultsDiv.innerHTML = `
      <div class="no-results">
        No matches found for ${team.displayName} in the selected date range.
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
      <h3>Found ${matches.length} match${matches.length === 1 ? '' : 'es'} for ${team.displayName}</h3>
      <p>in NBA & Summer League</p>
      ${totalPages > 1 ? `<p>Showing ${startIndex + 1}-${Math.min(endIndex, matches.length)} of ${matches.length} matches</p>` : ''}
    </div>
    ${paginatedMatches.map(match => createMatchCard(match, team.id)).join('')}
    ${createPagination(totalPages)}
  `;

  // Add click handlers for match cards
  resultsDiv.querySelectorAll('.match-card').forEach(card => {
    card.addEventListener('click', () => {
      const gameId = card.getAttribute('data-game-id');
      const gameDate = card.getAttribute('data-game-date');
      if (gameId && gameDate) {
        window.location.href = `scoreboard.html?gameId=${gameId}&date=${gameDate}`;
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
        document.getElementById('searchResults').scrollIntoView({ behavior: 'smooth' });
      }
    });
  }
}

function createMatchCard(match, teamId) {
  const competition = match.competitions[0];
  const homeTeam = competition.competitors.find(c => c.homeAway === "home");
  const awayTeam = competition.competitors.find(c => c.homeAway === "away");
  
  const isHomeTeam = homeTeam.team.id === teamId;
  const opponent = isHomeTeam ? awayTeam : homeTeam;
  const teamScore = isHomeTeam ? homeTeam.score : awayTeam.score;
  const opponentScore = isHomeTeam ? awayTeam.score : homeTeam.score;

  const matchDate = new Date(match.date);
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

  const status = match.status.type.description;
  let statusText = "";
  let scoreDisplay = "";

  if (status === "Scheduled") {
    statusText = "Scheduled";
    scoreDisplay = "vs";
  } else if (status === "Final") {
    statusText = "Final";
    scoreDisplay = `${teamScore || 0} - ${opponentScore || 0}`;
  } else {
    statusText = status;
    scoreDisplay = `${teamScore || 0} - ${opponentScore || 0}`;
  }

  const teamLogo = `https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${selectedTeam.abbreviation}.png`;
  
  const opponentLogo = `https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${opponent.team.abbreviation}.png`;

  // Format competition name
  const competitionName = match.season?.slug || 'regular-season';
  const leagueType = match.leagueType || 'NBA';
  const formattedCompetition = competitionName === 'post-season' ? 
    `${leagueType} PLAYOFFS` : 
    `${leagueType} ${competitionName === 'regular-season' ? 'REGULAR SEASON' : competitionName.toUpperCase()}`;

  // Format game date for URL parameter
  const gameDate = new Date(match.date);
  const formattedGameDate = gameDate.getFullYear() +
                           String(gameDate.getMonth() + 1).padStart(2, "0") +
                           String(gameDate.getDate()).padStart(2, "0");

  return `
    <div class="match-card" data-game-id="${match.id}" data-game-date="${formattedGameDate}">
      <div class="match-header">
        <div class="match-competition">${formattedCompetition}</div>
        <div class="match-date">${formattedDate}, ${formattedTime}</div>
      </div>
      <div class="match-teams">
        <div class="team-info">
          <div class="team-logo-container">
            <img src="${teamLogo}" alt="${selectedTeam.displayName}" class="team-logo" onerror="this.src='icon.png';">
            <span class="team-abbrev">${selectedTeam.abbreviation}</span>
          </div>
          <span class="team-name">${adjustTeamShortName(selectedTeam.shortDisplayName || selectedTeam.displayName)}</span>
        </div>
        <div class="match-score">${scoreDisplay}</div>
        <div class="team-info">
          <span class="team-name">${adjustTeamShortName(opponent.team.shortDisplayName || opponent.team.displayName)}</span>
          <div class="team-logo-container">
            <img src="${opponentLogo}" alt="${opponent.team.displayName}" class="team-logo" onerror="this.src='icon.png';">
            <span class="team-abbrev">${opponent.team.abbreviation}</span>
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
  localStorage.removeItem('nbaSearchState');
  
  // Update URL
  const url = new URL(window.location);
  url.search = '';
  history.replaceState(null, '', url.toString());
}

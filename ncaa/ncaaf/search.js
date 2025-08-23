const CONFERENCES = {
  "American": { groupId: "151", name: "American Athletic Conference", code: "american" },
  "ACC": { groupId: "1", name: "ACC", code: "acc" },
  "Big 12": { groupId: "4", name: "Big 12 Conference", code: "big_12" },
  "Big Ten": { groupId: "5", name: "Big Ten Conference", code: "big_ten" },
  "CUSA": { groupId: "12", name: "Conference USA", code: "conference_usa" },
  "Independents": { groupId: "18", name: "FBS Independents", code: "fbs_independents" },
  "MAC": { groupId: "15", name: "Mid-American Conference", code: "mid_american" },
  "Mountain West": { groupId: "17", name: "Mountain West Conference", code: "mountain_west" },
  "PAC-12": { groupId: "9", name: "Pac-12 Conference", code: "pac_12" },
  "SEC": { groupId: "8", name: "Southeastern Conference", code: "sec" },
  "Sun Belt": { groupId: "37", name: "Sun Belt Conference", code: "sun_belt" }
};

let currentConference = localStorage.getItem("currentConference") || "8"; // Default to SEC
let allTeams = [];
let selectedTeam = null;
let filteredTeams = [];
let isLoading = false;

// Convert HTTP URLs to HTTPS to avoid mixed content issues
function convertToHttps(url) {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

// Initialize the page
document.addEventListener("DOMContentLoaded", () => {
  setupConferenceButtons();
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
      .conference-buttons::-webkit-scrollbar {
        display: none;
      }
      @media (max-width: 767px) {
        .conference-buttons {
          overflow-x: auto !important;
          overflow-y: hidden !important;
          justify-content: flex-start !important;
          scroll-behavior: smooth;
          padding: 0 10px;
          -webkit-overflow-scrolling: touch;
          min-height: 50px;
        }
        .conference-button {
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

function setupConferenceButtons() {
  const conferenceContainer = document.getElementById("conferenceButtons");
  if (!conferenceContainer) return;

  conferenceContainer.innerHTML = "";
  
  // Add horizontal scroll styling for mobile
  setupMobileScrolling(conferenceContainer);

  for (const [confName, confData] of Object.entries(CONFERENCES)) {
    const button = document.createElement("button");
    button.className = `conference-button ${currentConference === confData.groupId ? "active" : ""}`;
    
    // Create button content with both text and logo (similar to teams.js and standings.js)
    const logoUrl = convertToHttps(`https://a.espncdn.com/i/teamlogos/ncaa_conf/500/${confData.code}.png`);
    button.innerHTML = `
      <span class="conference-text">${confName}</span>
      <img class="conference-logo" src="${logoUrl}" alt="${confName}" style="display: none;" onerror="this.style.display='none'; this.parentElement.querySelector('.conference-text').style.display='inline';">
    `;
    
    button.addEventListener("click", () => {
      if (currentConference !== confData.groupId) {
        currentConference = confData.groupId;
        localStorage.setItem("currentConference", currentConference);
        
        // Update button styles
        document.querySelectorAll(".conference-button").forEach(btn => {
          btn.classList.remove("active");
        });
        button.classList.add("active");
        
        loadTeams();
        clearSearch(); // Clear search when switching conferences
      }
    });
    
    conferenceContainer.appendChild(button);
  }

  updateConferenceButtonDisplay();
}

function updateConferenceButtonDisplay() {
  const isSmallScreen = window.innerWidth < 525;
  const conferenceContainer = document.getElementById("conferenceButtons");
  
  // Update mobile scrolling styles
  if (conferenceContainer) {
    setupMobileScrolling(conferenceContainer);
  }
  
  document.querySelectorAll(".conference-button").forEach(button => {
    const text = button.querySelector(".conference-text");
    const logo = button.querySelector(".conference-logo");
    
    // Toggle between text and logo based on screen size
    if (isSmallScreen && logo) {
      text.style.display = "none";
      logo.style.display = "inline-block";
    } else if (text && logo) {
      text.style.display = "inline";
      logo.style.display = "none";
    }
    
    // Update active state - need to check by button content since textContent changed
    const confName = text ? text.textContent : button.textContent;
    const confData = CONFERENCES[confName];
    if (confData && confData.groupId === currentConference) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
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

function getConferenceTeamsURL(conferenceId) {
  if (conferenceId === "T25") {
    // For TOP 25, we'll need to get ranked teams differently
    return null; // Will handle separately
  }
  return `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/2025/types/2/groups/${conferenceId}/teams?lang=en&region=us`;
}

async function fetchTeamDetails(teamUrl) {
  try {
    const response = await fetch(teamUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const team = await response.json();
    return team;
  } catch (error) {
    console.error(`Error fetching team details from ${teamUrl}:`, error);
    return null;
  }
}

async function loadTeams() {
  try {
    isLoading = true;
    const resultsDiv = document.getElementById("searchResults");
    resultsDiv.innerHTML = '<div class="loading">Loading teams...</div>';

    const apiUrl = getConferenceTeamsURL(currentConference);
    
    if (!apiUrl) {
      // Handle TOP 25 differently if needed
      resultsDiv.innerHTML = '<div class="no-results">TOP 25 rankings not available yet</div>';
      return;
    }

    console.log("Fetching teams from:", apiUrl);

    // Fetch the conference teams list
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("Conference teams data:", data);
    
    if (!data.items || data.items.length === 0) {
      resultsDiv.innerHTML = '<div class="no-results">No teams found for this conference.</div>';
      return;
    }

    console.log(`Found ${data.items.length} teams, fetching details...`);

    // Fetch details for each team
    const teamPromises = data.items.map(item => {
      console.log("Fetching team details from:", item.$ref);
      return fetchTeamDetails(item.$ref);
    });
    
    const teams = await Promise.all(teamPromises);
    console.log("Team details fetched:", teams);

    // Filter out any failed requests
    const validTeams = teams.filter(team => team !== null);

    if (validTeams.length === 0) {
      resultsDiv.innerHTML = '<div class="no-results">No team details could be loaded.</div>';
      return;
    }

    console.log(`Successfully loaded ${validTeams.length} teams`);

    // Store teams data globally and sort alphabetically
    allTeams = validTeams.sort((a, b) => a.displayName.localeCompare(b.displayName));
    
    // Clear search input and display all teams for the conference
    document.getElementById("teamSearch").value = "";
    displayTeamResults(allTeams);

  } catch (error) {
    console.error("Error loading teams:", error);
    const resultsDiv = document.getElementById("searchResults");
    resultsDiv.innerHTML = `<div class="no-results">Error loading teams: ${error.message}</div>`;
  } finally {
    isLoading = false;
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
    // Show all teams in current conference when search is empty
    displayTeamResults(allTeams);
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

  const conferenceName = Object.keys(CONFERENCES).find(key => CONFERENCES[key].groupId === currentConference);
  const searchTerm = document.getElementById("teamSearch").value;
  
  resultsDiv.innerHTML = `
    <div class="results-header">
      <h3>Found ${teams.length} team${teams.length === 1 ? '' : 's'}${searchTerm ? ' matching your search' : ` in ${conferenceName}`}</h3>
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
  const logoUrl = `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.id}.png`;
  const conferenceName = Object.keys(CONFERENCES).find(key => CONFERENCES[key].groupId === currentConference);
  const altColor = ["ffffff", "ffee00", "ffff00", "81f733", "000000", "f7f316", "eef209", "ece83a"].includes(team.color);
  const teamColor = altColor ? `#${team.alternateColor}` : `#${team.color}`;

  return `
    <div class="team-card" data-team-id="${team.id}">
      <img src="${logoUrl}" alt="${team.displayName}" class="team-logo-large" onerror="this.src='football.png';">
      <div class="team-details">
        <div class="team-name-large">${team.displayName}</div>
        <div class="team-division" style="color: ${teamColor};">${team.abbreviation || team.shortDisplayName} - ${conferenceName}</div>
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

function restoreFromState(state) {
  if (state && state.conference) {
    currentConference = state.conference;
    localStorage.setItem("currentConference", currentConference);
    updateConferenceButtonDisplay();
    loadTeams();
  }
}

// Handle window resize for responsive design
window.addEventListener("resize", updateConferenceButtonDisplay);

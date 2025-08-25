const LEAGUES = {
  "Premier League": { code: "eng.1", logo: "23" },
  "La Liga": { code: "esp.1", logo: "15" },
  "Bundesliga": { code: "ger.1", logo: "10" },
  "Serie A": { code: "ita.1", logo: "12" },
  "Ligue 1": { code: "fra.1", logo: "9" },
  "MLS": { code: "usa.1", logo: "19" },
  "Saudi PL": { code: "ksa.1", logo: "2488" }
};

const NOTE_COLORS = {
  "Champions League": "#008000", // Green
  "Champions League qualifying": "#81D6AC", // Light Green
  "Europa League": "#469dfa", // Dark Blue
  "Conference League qualifying": "#ADD8E6", // Light Blue
  "Relegation playoff": "#FFFF00", // Yellow
  "Relegation": "#FF7F84", // Red
};

let currentLeague = localStorage.getItem("currentLeague") || "eng.1"; // Default to Premier League if not set
let currentSeason = localStorage.getItem("currentSeason") || new Date().getFullYear().toString(); // Default to current year

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

let lastStandingsHash = null;

async function fetchStandings() {
  try {
    const STANDINGS_URL = `https://cdn.espn.com/core/soccer/table?xhr=1&league=${currentLeague}&season=${currentSeason}`;
    const response = await fetch(STANDINGS_URL);
    const standingsText = await response.text();
    const newHash = hashString(standingsText);

    if (newHash === lastStandingsHash) {
      console.log("No changes detected in the standings.");
      return;
    }
    lastStandingsHash = newHash;

    const data = JSON.parse(standingsText);
    
    // Check if this is MLS which has Eastern and Western conferences
    const isMLS = currentLeague === "usa.1";
    
    if (isMLS && data.content.standings.groups.length >= 2) {
      // MLS has conferences - render both Eastern and Western
      const easternConference = data.content.standings.groups[0];
      const westernConference = data.content.standings.groups[1];
      
      renderMLSConferences(easternConference, westernConference);
    } else {
      // Regular single table standings for other leagues
      const standings = data.content.standings.groups[0].standings.entries;

      const container = document.getElementById("standingsContainer");
      if (!container) {
        console.error("Error: Element with ID 'standingsContainer' not found.");
        return;
      }
      
      renderStandings(standings, "standingsContainer");
    }

    // Update the header to reflect the current league and season
    const header = document.querySelector("#standings h2");
    const currentLeagueName = Object.keys(LEAGUES).find(
      leagueName => LEAGUES[leagueName].code === currentLeague
    );
    if (header) {
      // Always update the header text first
      header.textContent = `${currentLeagueName} Standings`;
      header.style.cssText = `
        margin: 0;
        font-size: 1.8rem;
        font-weight: bold;
        color: #333;
      `;
      
      // Check for existing header wrapper globally (not just as sibling)
      let headerWrapper = document.querySelector('#headerWrapper');
      if (!headerWrapper) {
        headerWrapper = document.createElement('div');
        headerWrapper.id = 'headerWrapper';
        headerWrapper.style.cssText = `
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 15px;
        `;
        
        // Insert the wrapper before the header and move header into it
        header.parentElement.insertBefore(headerWrapper, header);
        headerWrapper.appendChild(header);
      } else {
        // HeaderWrapper exists, make sure header is inside it
        if (header.parentElement !== headerWrapper) {
          headerWrapper.appendChild(header);
        }
      }
      
      // Check for existing year selector globally
      let yearSelector = document.querySelector('#headerYearSelector');
      if (!yearSelector) {
        yearSelector = document.createElement('div');
        yearSelector.id = 'headerYearSelector';
        headerWrapper.appendChild(yearSelector);
        
        const currentYear = new Date().getFullYear();
        const startYear = 2020;
        
        yearSelector.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px; background: #f8f9fa; padding: 8px 15px; border-radius: 8px; border: 1px solid #ddd;">
            <label style="font-weight: 600; color: #555; font-size: 14px; white-space: nowrap;">Season:</label>
            <select id="seasonDropdown" style="padding: 6px 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; background: white; color: #333; cursor: pointer; min-width: 80px;">
              ${Array.from({length: currentYear - startYear + 1}, (_, i) => currentYear - i).map(year => 
                `<option value="${year}" ${year.toString() === currentSeason ? 'selected' : ''}>${year}</option>`
              ).join('')}
            </select>
          </div>
        `;
        
        // Add event listener for season changes
        const seasonDropdown = yearSelector.querySelector("#seasonDropdown");
        if (seasonDropdown) {
          seasonDropdown.addEventListener("change", () => {
            currentSeason = seasonDropdown.value;
            localStorage.setItem("currentSeason", currentSeason);
            fetchStandings();
          });
        }
      } else {
        // Year selector exists, just update the selected value and ensure it's in the right place
        if (yearSelector.parentElement !== headerWrapper) {
          headerWrapper.appendChild(yearSelector);
        }
        const seasonDropdown = yearSelector.querySelector("#seasonDropdown");
        if (seasonDropdown) {
          seasonDropdown.value = currentSeason;
        }
      }
    }

    // Save the current league and season to localStorage
    localStorage.setItem("currentLeague", currentLeague);
    localStorage.setItem("currentSeason", currentSeason);
  } catch (error) {
    console.error(`Error fetching standings for league ${currentLeague} season ${currentSeason}:`, error);
  }
}

function renderMLSConferences(easternConference, westernConference) {
  // Clear the main container and set up conference structure
  const mainContainer = document.getElementById("standingsContainer");
  if (!mainContainer) {
    console.error("Error: Element with ID 'standingsContainer' not found.");
    return;
  }

  mainContainer.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 20px; max-width: 100%; overflow-x: auto;">
      <div style="min-width: 0;">
        <h3 style="text-align: center; margin-bottom: 15px; color: #333; font-size: 1.3rem;">Eastern Conference</h3>
        <div id="easternConferenceStandings"></div>
      </div>
      <div style="min-width: 0;">
        <h3 style="text-align: center; margin-bottom: 15px; color: #333; font-size: 1.3rem;">Western Conference</h3>
        <div id="westernConferenceStandings"></div>
      </div>
    </div>
  `;

  // Render each conference
  renderStandings(easternConference.standings.entries, "easternConferenceStandings");
  renderStandings(westernConference.standings.entries, "westernConferenceStandings");
  
  // Make responsive for mobile
  if (window.innerWidth <= 768) {
    const gridContainer = mainContainer.querySelector('div[style*="grid-template-columns"]');
    if (gridContainer) {
      gridContainer.style.gridTemplateColumns = '1fr';
      gridContainer.style.gap = '30px';
    }
  }
}

function renderStandings(standings, containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container with ID '${containerId}' not found.`);
    return;
  }

  container.innerHTML = ""; // Clear previous content

  const isSmallScreen = window.innerWidth < 525;

  const table = document.createElement("table");
  table.className = "division-table";

  // Add table headers
  const headers = `
    <thead>
      <tr>
        <th>Team</th>
        <th>GP</th>
        <th>W-D-L</th>
        <th>GD</th>
        ${!isSmallScreen ? "<th>F</th><th>A</th>" : ""} <!-- Hide columns on small screens -->
        <th>P</th>
      </tr>
    </thead>
  `;
  table.innerHTML = headers;

  // Add table body
  const tbody = document.createElement("tbody");
  const legend = new Map(); // To store unique notes for the legend

  standings.forEach(entry => {
    const team = entry.team;
    const stats = entry.stats;

    const gamesPlayed = stats.find(stat => stat.name === "gamesPlayed")?.displayValue || "0";
    const wins = stats.find(stat => stat.name === "wins")?.displayValue || "0";
    const draws = stats.find(stat => stat.name === "ties")?.displayValue || "0";
    const losses = stats.find(stat => stat.name === "losses")?.displayValue || "0";
    const goalDifference = stats.find(stat => stat.name === "pointDifferential")?.displayValue || "0";
    const goalsFor = stats.find(stat => stat.name === "pointsFor")?.displayValue || "0";
    const goalsAgainst = stats.find(stat => stat.name === "pointsAgainst")?.displayValue || "0";
    const points = stats.find(stat => stat.name === "points")?.displayValue || "0";

    const displayName = window.innerWidth <= 525 ? team.shortDisplayName : team.displayName;

    const row = document.createElement("tr");

    // Check for note and apply custom background color if present
    let textColor = "white"; // Default text color
    if (entry.note) {
      const customColor = NOTE_COLORS[entry.note.description] || entry.note.color;
      row.style.backgroundColor = customColor;

      // Determine text color based on background color
      if (["#81D6AC", "#ADD8E6", "#FFFF00", "#B5E7CE", "#B2BFD0"].includes(customColor)) {
        textColor = "black";
      }

      legend.set(customColor, entry.note.description); // Add to legend
    }

    row.innerHTML = `
      <td class="team-name" style="color: ${textColor};">
        <img src="https://a.espncdn.com/i/teamlogos/soccer/500-dark/${team.id}.png" alt="${team.displayName}" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle;" onerror="this.onerror=null; this.src='soccer-ball-png-24.png';">
        ${displayName}
      </td>
      <td style="color: ${textColor};">${gamesPlayed}</td>
      <td style="color: ${textColor};">${wins}-${draws}-${losses}</td>
      <td style="color: ${textColor};">${goalDifference}</td>
      ${!isSmallScreen ? `<td style="color: ${textColor};">${goalsFor}</td><td style="color: ${textColor};">${goalsAgainst}</td>` : ""}
      <td style="color: ${textColor};">${points}</td>
    `;

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);

  // Add legend below the table
  if (legend.size > 0) {
    const legendContainer = document.createElement("div");
    legendContainer.className = "legend-container";

    legend.forEach((description, color) => {
      const legendItem = document.createElement("div");
      legendItem.className = "legend-item";
      legendItem.innerHTML = `
        <span class="legend-color" style="background-color: ${color};"></span>
        <span class="legend-description">${description}</span>
      `;
      legendContainer.appendChild(legendItem);
    });

    container.appendChild(legendContainer);
  }
}

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
  if (!leagueContainer) {
    console.error("Error: Element with ID 'leagueButtons' not found.");
    return;
  }

  leagueContainer.innerHTML = ""; // Clear any existing content
  
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

      // Save the current league to localStorage
      localStorage.setItem("currentLeague", currentLeague);

      // Update active state
      document.querySelectorAll(".league-button").forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");

      fetchStandings();
    });

    leagueContainer.appendChild(button);
  }

  updateLeagueButtonDisplay(); // Adjust button display based on screen size
}

function setupSeasonSelector() {
  // Season selector is now integrated into the header in fetchStandings()
  // This function is kept for compatibility but does nothing
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
  
  // Also update MLS conference layout if it exists
  const mlsGrid = document.querySelector('#standingsContainer div[style*="grid-template-columns"]');
  if (mlsGrid) {
    if (window.innerWidth <= 768) {
      mlsGrid.style.gridTemplateColumns = '1fr';
      mlsGrid.style.gap = '30px';
      // Reset max-width for mobile stacked layout
      const conferenceContainers = mlsGrid.querySelectorAll('div[style*="max-width"]');
      conferenceContainers.forEach(container => {
        container.style.maxWidth = '100%';
      });
    } else {
      mlsGrid.style.gridTemplateColumns = '1fr 1fr';
      mlsGrid.style.gap = '15px';
      // Apply max-width for desktop side-by-side layout
      const conferenceContainers = mlsGrid.querySelectorAll('div[style*="min-width"]');
      conferenceContainers.forEach(container => {
        container.style.maxWidth = 'calc(50vw - 40px)';
      });
    }
  }
}

window.addEventListener("resize", updateLeagueButtonDisplay);

setupLeagueButtons();
setupSeasonSelector();
fetchStandings();
setInterval(fetchStandings, 6000);

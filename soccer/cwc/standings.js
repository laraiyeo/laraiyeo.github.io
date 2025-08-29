const LEAGUES = {
  "Club World Cup": { code: "fifa.cwc", logo: "19" },
};

let currentCWCLeague = localStorage.getItem("currentCWCLeague") || "fifa.cwc"; // Default to Club World Cup

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

// Function to fetch team matches (group stage only - first 3 games)
async function fetchTeamMatches(teamId) {
  try {
    // Get current year for fetching matches
    const currentYear = new Date().getFullYear();
    
    // Fetch all matches for the current CWC season
    const startDate = `${currentYear}0601`; // Start from June 1st
    const endDate = `${currentYear}1231`; // End December 31st
    
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.cwc/scoreboard?dates=${startDate}-${endDate}`);
    const data = await response.json();
    
    if (!data.events) {
      return [];
    }
    
    // Filter matches for this team and get only first 3 (group stage)
    const teamMatches = data.events
      .filter(event => {
        const competition = event.competitions[0];
        return competition.competitors.some(competitor => competitor.team.id === teamId);
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date)) // Sort by date ascending
      .slice(0, 3); // Take only first 3 matches (group stage)
    
    return teamMatches;
  } catch (error) {
    console.error("Error fetching team matches:", error);
    return [];
  }
}

// Function to get team logo (using team-page.js logic)
function getTeamLogo(team) {
  if (["367", "2950", "111"].includes(team.id)) {
    return team.logos?.find(logo => logo.rel.includes("default"))?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`;
  }
  return team.logos?.find(logo => logo.rel.includes("dark"))?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`;
}

// Function to show team matches popup
async function showTeamMatchesPopup(teamId, teamName, teamLogo) {
  // Create modal overlay
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `;

  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 20px;
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    position: relative;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  `;

  // Create close button
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '×';
  closeButton.style.cssText = `
    position: absolute;
    top: 15px;
    right: 20px;
    background: none;
    border: none;
    font-size: 28px;
    cursor: pointer;
    color: #777;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s ease;
  `;
  
  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.backgroundColor = '#f0f0f0';
    closeButton.style.color = '#333';
  });
  
  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.backgroundColor = 'transparent';
    closeButton.style.color = '#777';
  });
  
  closeButton.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  // Create header
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 25px;
    padding-bottom: 15px;
    border-bottom: 2px solid #eee;
  `;
  
  const logoSrc = teamLogo || `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`;
  header.innerHTML = `
    <img src="${logoSrc}" alt="${teamName}" style="width: 40px; height: 40px; object-fit: contain;">
    <div>
      <h3 style="margin: 0; color: #333; font-size: 1.4rem;">${teamName}</h3>
      <p style="margin: 5px 0 0 0; color: #777; font-size: 0.9rem;">Group Stage Matches</p>
    </div>
  `;

  // Create matches container
  const matchesContainer = document.createElement('div');
  matchesContainer.style.cssText = `
    text-align: center;
    padding: 20px;
    color: #777;
  `;
  matchesContainer.innerHTML = 'Loading matches...';

  // Assemble modal
  modalContent.appendChild(closeButton);
  modalContent.appendChild(header);
  modalContent.appendChild(matchesContainer);
  modal.appendChild(modalContent);

  // Add to document
  document.body.appendChild(modal);

  // Close modal when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });

  // Fetch and display matches
  try {
    const matches = await fetchTeamMatches(teamId);
    
    if (matches.length === 0) {
      matchesContainer.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #777;">
          <p>No group stage matches found for this team.</p>
        </div>
      `;
      return;
    }

    // Create match cards using team-page.js logic
    const matchCards = matches.map((match, index) => {
      const competition = match.competitions[0];
      const homeTeam = competition.competitors.find(c => c.homeAway === "home");
      const awayTeam = competition.competitors.find(c => c.homeAway === "away");
      
      const isHomeTeam = homeTeam.team.id === teamId;
      const opponent = isHomeTeam ? awayTeam : homeTeam;
      const currentTeamData = isHomeTeam ? homeTeam : awayTeam;
      const teamScore = parseInt(isHomeTeam ? homeTeam.score : awayTeam.score) || 0;
      const opponentScore = parseInt(isHomeTeam ? awayTeam.score : homeTeam.score) || 0;
      
      const gameDate = new Date(match.date);
      const formattedDate = gameDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
      
      const status = match.status.type.state;
      let scoreDisplay, statusText, resultClass;
      
      if (status === "post") {
        // Use team-page.js win logic and format
        if (teamScore > opponentScore) {
          resultClass = "win";
          scoreDisplay = "W " + teamScore + "-" + opponentScore;
        } else if (teamScore < opponentScore) {
          resultClass = "loss";
          scoreDisplay = "L " + teamScore + "-" + opponentScore;
        } else {
          resultClass = "tie";
          scoreDisplay = "D " + teamScore + "-" + opponentScore;
        }
        statusText = "Final";
      } else if (status === "in") {
        scoreDisplay = `${teamScore || 0} - ${opponentScore || 0}`;
        statusText = "Live";
        resultClass = "live";
      } else {
        scoreDisplay = "vs";
        statusText = formattedDate;
        resultClass = "scheduled";
      }
      
      // Get result colors and background colors (using team-page.js logic)
      let resultColor = "#fff"; // White text
      let backgroundColor = "#777"; // Default gray
      
      switch(resultClass) {
        case "win":
          backgroundColor = "#d4edda"; // Green background
          resultColor = "#155724"; // Dark green text
          break;
        case "loss":
          backgroundColor = "#f8d7da"; // Red background
          resultColor = "#721c24"; // Dark red text
          break;
        case "tie":
          backgroundColor = "#fff3cd"; // Yellow background
          resultColor = "#856404"; // Black text for visibility
          break;
        case "live":
          backgroundColor = "#17a2b8"; // Blue background
          resultColor = "#fff"; // White text
          break;
        default:
          backgroundColor = "#6c757d"; // Gray background
          resultColor = "#fff"; // White text
      }
      
      const homeLogoSrc = getTeamLogo(homeTeam.team);
      const awayLogoSrc = getTeamLogo(awayTeam.team);
      
      return `
      
        <span style="font-weight: bold; color: #777; min-width: 60px;">Match ${index + 1}</span>
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 15px;
          margin-bottom: 10px;
          background: #f8f9fa;
          border-radius: 8px;
          border: 1px solid #e9ecef;
          cursor: pointer;
          transition: all 0.2s ease;
        " 
        onclick="navigateToScoreboard('${match.id}')"
        onmouseenter="this.style.backgroundColor='#e9ecef'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 8px rgba(0,0,0,0.15)';"
        onmouseleave="this.style.backgroundColor='#f8f9fa'; this.style.transform='translateY(0)'; this.style.boxShadow='none';"
        >
          <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
            <img src="${homeLogoSrc}" alt="${homeTeam.team.displayName}" style="width: 24px; height: 24px; object-fit: contain;">
            <span style="font-size: 0.9rem; color: #333;">${homeTeam.team.abbreviation || homeTeam.team.shortDisplayName}</span>
          </div>
          
          <div style="text-align: center; padding: 0 15px;">
            <div style="
              font-weight: bold; 
              color: ${resultColor}; 
              background-color: ${backgroundColor};
              padding: 8px 12px;
              border-radius: 6px;
              margin-bottom: 2px;
              min-width: 80px;
              font-size: 0.9rem;
            ">${scoreDisplay}</div>
            <div style="font-size: 0.8rem; color: #777;">${statusText}</div>
          </div>
          
          <div style="display: flex; align-items: center; gap: 10px; flex: 1; justify-content: flex-end;">
            <span style="font-size: 0.9rem; color: #333;">${awayTeam.team.abbreviation || awayTeam.team.shortDisplayName}</span>
            <img src="${awayLogoSrc}" alt="${awayTeam.team.displayName}" style="width: 24px; height: 24px; object-fit: contain;">
          </div>
        </div>
      `;
    }).join('');

    matchesContainer.innerHTML = `
      <div style="text-align: left;">
        ${matchCards}
        <div style="text-align: center; margin-top: 15px; padding: 10px; background: #e7f3ff; border-radius: 6px; font-size: 0.9rem; color: #0066cc;">
          💡 Click on any match to view the scoreboard
        </div>
      </div>
    `;
    
  } catch (error) {
    console.error("Error loading team matches:", error);
    matchesContainer.innerHTML = `
      <div style="text-align: center; padding: 20px; color: #777;">
        <p>Error loading matches. Please try again.</p>
      </div>
    `;
  }
}

// Function to navigate to scoreboard
function navigateToScoreboard(gameId) {
  window.location.href = `scoreboard.html?gameId=${gameId}`;
}

async function fetchStandings() {
  try {
    const STANDINGS_URL = `https://cdn.espn.com/core/soccer/table?xhr=1&league=fifa.cwc`;
    const response = await fetch(STANDINGS_URL);
    const standingsText = await response.text();
    const newHash = hashString(standingsText);

    if (newHash === lastStandingsHash) {
      console.log("No changes detected in the standings.");
      return;
    }
    lastStandingsHash = newHash;

    const data = JSON.parse(standingsText);
    const allGroups = data.content.standings.groups || [];

    const container = document.getElementById("standingsContainer");
    if (!container) {
      console.error("Error: Element with ID 'standingsContainer' not found.");
      return;
    }

    // Update the header to reflect the current league - fixed to use correct league name
    const header = document.querySelector("#standings h2");
    if (header) {
      header.textContent = `Club World Cup Standings`;
    }

    renderGroupStandings(allGroups);

    // Save the current league to localStorage
    localStorage.setItem("currentCWCLeague", "fifa.cwc");
  } catch (error) {
    console.error(`Error fetching standings for league fifa.cwc:`, error);
  }
}

function renderGroupStandings(groups) {
  const container = document.getElementById("standingsContainer");
  if (!container) {
    console.error("Container with ID 'standingsContainer' not found.");
    return;
  }

  container.innerHTML = ""; // Clear previous content

  // Create main container with 8 groups layout
  const groupsWrapper = document.createElement("div");
  groupsWrapper.className = "groups-wrapper";

  groups.forEach((group, index) => {
    const groupBox = document.createElement("div");
    groupBox.className = "group-box";

    const groupTitle = document.createElement("h4");
    groupTitle.textContent = group.name || `Group ${String.fromCharCode(65 + index)}`; // A, B, C, etc.
    groupBox.appendChild(groupTitle);

    const table = document.createElement("table");
    table.className = "division-table";

    const isSmallScreen = window.innerWidth < 525;

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

    const standings = group.standings?.entries || [];

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

      const row = document.createElement("tr");

      // Check for note and apply custom background color if present
      let textColor = "white"; // Default text color
      if (entry.note) {
        const customColor = entry.note.color;
        row.style.backgroundColor = customColor;
        textColor = customColor === "#81D6AC" ? "black" : "white"; // Ensure text is readable
        legend.set(customColor, entry.note.description); // Add to legend
      }

      row.innerHTML = `
        <td class="team-name" style="color: ${textColor};">
          <img src="${team.logos[0]?.href}" alt="${team.displayName}" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle;">
          ${team.shortDisplayName}
        </td>
        <td style="color: ${textColor};">${gamesPlayed}</td>
        <td style="color: ${textColor};">${wins}-${draws}-${losses}</td>
        <td style="color: ${textColor};">${goalDifference}</td>
        ${!isSmallScreen ? `<td style="color: ${textColor};">${goalsFor}</td><td style="color: ${textColor};">${goalsAgainst}</td>` : ""}
        <td style="color: ${textColor};">${points}</td>
      `;
      
      // Add click event to show team matches popup
      row.style.cursor = "pointer";
      row.addEventListener("click", () => {
        showTeamMatchesPopup(team.id, team.displayName, team.logos?.[0]?.href);
      });

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    groupBox.appendChild(table);

    // Add legend below the table for this group
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

      groupBox.appendChild(legendContainer);
    }

    groupsWrapper.appendChild(groupBox);
  });

  container.appendChild(groupsWrapper);
}

// Removed league buttons functionality as per the change request

fetchStandings();
setInterval(fetchStandings, 2000);
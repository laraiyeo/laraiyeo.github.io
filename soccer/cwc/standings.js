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
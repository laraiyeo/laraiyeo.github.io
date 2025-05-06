const LEAGUES = {
  "Premier League": { code: "eng.1", logo: "23" },
  "La Liga": { code: "esp.1", logo: "15" },
  "Bundesliga": { code: "ger.1", logo: "10" },
  "Serie A": { code: "ita.1", logo: "12" },
  "Ligue 1": { code: "fra.1", logo: "9" },
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

async function fetchStandings() {
  try {
    const STANDINGS_URL = `https://cdn.espn.com/core/soccer/table?xhr=1&league=${currentLeague}`;
    const response = await fetch(STANDINGS_URL);
    const data = await response.json();

    const standings = data.content.standings.groups[0].standings.entries;

    const container = document.getElementById("standingsContainer");
    if (!container) {
      console.error("Error: Element with ID 'standingsContainer' not found.");
      return;
    }

    // Update the header to reflect the current league
    const header = document.querySelector("#standings h2");
    const currentLeagueName = Object.keys(LEAGUES).find(
      leagueName => LEAGUES[leagueName].code === currentLeague
    );
    if (header) {
      header.textContent = `${currentLeagueName} Standings`;
    }

    renderStandings(standings, "standingsContainer");

    // Save the current league to localStorage
    localStorage.setItem("currentLeague", currentLeague);
  } catch (error) {
    console.error(`Error fetching standings for league ${currentLeague}:`, error);
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

    const displayName = window.innerWidth <= 475 ? team.shortDisplayName : team.displayName;

    const row = document.createElement("tr");

    // Check for note and apply custom background color if present
    let textColor = "white"; // Default text color
    if (entry.note) {
      const customColor = NOTE_COLORS[entry.note.description] || entry.note.color;
      row.style.backgroundColor = customColor;

      // Determine text color based on background color
      if (["#81D6AC", "#ADD8E6", "#FFFF00"].includes(customColor)) {
        textColor = "black";
      }

      legend.set(customColor, entry.note.description); // Add to legend
    }

    row.innerHTML = `
      <td class="team-name" style="color: ${textColor};">
        <img src="${team.logos[0]?.href}" alt="${team.displayName}" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle;">
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

function setupLeagueButtons() {
  const leagueContainer = document.getElementById("leagueButtons");
  if (!leagueContainer) {
    console.error("Error: Element with ID 'leagueButtons' not found.");
    return;
  }

  leagueContainer.innerHTML = ""; // Clear any existing content

  for (const [leagueName, leagueData] of Object.entries(LEAGUES)) {
    const button = document.createElement("button");
    button.className = `league-button ${currentLeague === leagueData.code ? "active" : ""}`;
    button.innerHTML = `
      <span class="league-text">${leagueName}</span>
      <img class="league-logo" src="https://a.espncdn.com/i/leaguelogos/soccer/500/${leagueData.logo}.png" alt="${leagueName}" style="display: none;">
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

function updateLeagueButtonDisplay() {
  const isSmallScreen = window.innerWidth < 525;
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

window.addEventListener("resize", updateLeagueButtonDisplay);

setupLeagueButtons();
fetchStandings();

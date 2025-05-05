const STANDINGS_URL = "https://cdn.espn.com/core/mlb/standings?xhr=1";

let lastStandingsHash = null;

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

async function fetchStandings() {
  try {
    const res = await fetch(STANDINGS_URL);
    const text = await res.text();
    const newHash = hashString(text);

    if (newHash === lastStandingsHash) {
      return; // No changes, skip update
    }
    lastStandingsHash = newHash;

    const data = JSON.parse(text);
    const groups = data.content.standings.groups;

    const americanLeague = groups.find(group => group.name === "American League");
    const nationalLeague = groups.find(group => group.name === "National League");

    renderLeagueStandings(americanLeague, "americanLeagueStandings");
    renderLeagueStandings(nationalLeague, "nationalLeagueStandings");
  } catch (err) {
    console.error("Error fetching standings:", err);
  }
}

function renderLeagueStandings(league, containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container with ID '${containerId}' not found.`);
    return;
  }

  container.innerHTML = ""; // Clear previous content

  league.groups.forEach(division => {
    const divisionBox = document.createElement("div");
    divisionBox.className = "division-box";

    // Add division header
    const divisionTitle = document.createElement("h4");
    divisionTitle.textContent = division.name;
    divisionBox.appendChild(divisionTitle);

    // Add table for team stats
    const table = document.createElement("table");
    table.className = "division-table";

    // Add table headers
    const headers = `
      <thead>
        <tr>
          <th>Team</th>
          <th>W</th>
          <th>L</th>
          <th>PCT</th>
          <th>GB</th>
          <th>RS</th>
          <th>RA</th>
        </tr>
      </thead>
    `;
    table.innerHTML = headers;

    // Add table body
    const tbody = document.createElement("tbody");

    division.standings.entries
      .sort((a, b) => a.team.seed - b.team.seed) // Sort by seed
      .forEach(entry => {
        const row = document.createElement("tr");

        const isSmallScreen = window.innerWidth <= 475;
  
        const teamName = isSmallScreen ? entry.team.abbreviation + "<br>" + entry.team.shortDisplayName : entry.team.displayName;
        const teamAbbreviation = entry.team.abbreviation.toLowerCase();
        const teamSeed = entry.team.seed || "-";
        const logoUrl = `https://a.espncdn.com/i/teamlogos/mlb/500-dark/scoreboard/${teamAbbreviation}.png`;

        const wins = entry.stats.find(stat => stat.name === "wins")?.displayValue || "0";
        const losses = entry.stats.find(stat => stat.name === "losses")?.displayValue || "0";
        const winPercent = entry.stats.find(stat => stat.name === "winPercent")?.displayValue || "0.000";
        const gamesBehind = entry.stats.find(stat => stat.name === "gamesBehind")?.displayValue || "-";
        const pointsFor = entry.stats.find(stat => stat.name === "pointsFor")?.displayValue || "0";
        const pointsAgainst = entry.stats.find(stat => stat.name === "pointsAgainst")?.displayValue || "0";
        const homeRecord = entry.stats.find(stat => stat.name === "Home")?.displayValue || "0-0";
        const awayRecord = entry.stats.find(stat => stat.name === "Road")?.displayValue || "0-0";
        const lastTen = entry.stats.find(stat => stat.name === "Last Ten Games")?.displayValue || "0-0";
        const streak = entry.stats.find(stat => stat.name === "streak")?.displayValue || "N/A";

        row.innerHTML = `
          <td class="team-name" data-team-hover>
            <img src="${logoUrl}" alt="${teamName} logo" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle;">
            ${teamName} <span style="color: grey;">(${teamSeed})</span>
          </td>
          <td>${wins}</td>
          <td>${losses}</td>
          <td>${winPercent}</td>
          <td>${gamesBehind}</td>
          <td>${pointsFor}</td>
          <td>${pointsAgainst}</td>
        `;

        // Create hover card
        const hoverCard = document.createElement("div");
        hoverCard.className = "team-hover-card";
        hoverCard.innerHTML = `
          <img src="${logoUrl}" alt="${teamName} logo" style="width: 50px; height: 50px; margin-bottom: 8px;">
          <div style="font-weight: bold;">${teamName} <span style="color: grey;">(${teamSeed})</span></div>
          <br><div>Home: ${homeRecord} | Away: ${awayRecord}</div>
          <div>L10: ${lastTen} | 
            <span style="color: ${streak.startsWith("W") ? "green" : streak.startsWith("L") ? "red" : "grey"};">Streak: ${streak}</span>
          </div>
        `;

        // Append hover card to the body
        document.body.appendChild(hoverCard);

        // Add hover event listeners
        const teamNameCell = row.querySelector(".team-name");
        teamNameCell.addEventListener("mouseenter", () => {
          hoverCard.style.display = "block";
          const rect = teamNameCell.getBoundingClientRect();
          hoverCard.style.top = `${rect.top + window.scrollY-50}px`;
          hoverCard.style.left = `${rect.left + window.scrollX + teamNameCell.offsetWidth}px`;
        });

        teamNameCell.addEventListener("mouseleave", () => {
          hoverCard.style.display = "none";
        });

        tbody.appendChild(row);
      });

    table.appendChild(tbody);
    divisionBox.appendChild(table);
    container.appendChild(divisionBox);
  });
}

fetchStandings();
setInterval(fetchStandings, 2000); // Poll every 2 seconds

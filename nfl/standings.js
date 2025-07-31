const STANDINGS_URL = "https://cdn.espn.com/core/nfl/standings?xhr=1";

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
    const groups = data.content?.standings?.groups;

    if (!groups) {
      console.error("NFL standings data structure not found");
      return;
    }

    // Find AFC and NFC conferences
    const afc = groups.find(group => group.name === "American Football Conference");
    const nfc = groups.find(group => group.name === "National Football Conference");

    if (afc) {
      renderConferenceStandings(afc, "americanFootballConferenceStandings");
    }
    if (nfc) {
      renderConferenceStandings(nfc, "nationalFootballConferenceStandings");
    }
  } catch (err) {
    console.error("Error fetching standings:", err);
  }
}

function renderConferenceStandings(conference, containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container with ID '${containerId}' not found.`);
    return;
  }

  container.innerHTML = ""; // Clear previous content

  // Each conference has divisions (groups)
  conference.groups.forEach(division => {
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
          <th>T</th>
          <th>PCT</th>
          <th>PF</th>
          <th>PA</th>
          <th>DIFF</th>
        </tr>
      </thead>
    `;
    table.innerHTML = headers;

    // Add table body
    const tbody = document.createElement("tbody");

    division.standings.entries
      .sort((a, b) => {
        // Sort by wins (descending), then by win percentage (descending)
        const aWins = parseInt(a.stats.find(stat => stat.name === "wins")?.value || "0");
        const bWins = parseInt(b.stats.find(stat => stat.name === "wins")?.value || "0");
        if (aWins !== bWins) return bWins - aWins;
        
        const aWinPct = parseFloat(a.stats.find(stat => stat.name === "winPercent")?.value || "0");
        const bWinPct = parseFloat(b.stats.find(stat => stat.name === "winPercent")?.value || "0");
        return bWinPct - aWinPct;
      })
      .forEach((entry, index) => {
        const row = document.createElement("tr");

        const isSmallScreen = window.innerWidth <= 475;
  
        const teamName = isSmallScreen ? entry.team.abbreviation + "<br>" + entry.team.shortDisplayName : entry.team.displayName;
        const teamAbbreviation = entry.team.abbreviation.toLowerCase();
        const logoUrl = `https://a.espncdn.com/i/teamlogos/nfl/500-dark/${teamAbbreviation}.png`;

        const wins = entry.stats.find(stat => stat.name === "wins")?.displayValue || "0";
        const losses = entry.stats.find(stat => stat.name === "losses")?.displayValue || "0";
        const ties = entry.stats.find(stat => stat.name === "ties")?.displayValue || "0";
        const winPercent = entry.stats.find(stat => stat.name === "winPercent")?.displayValue || "0.000";
        const pointsFor = entry.stats.find(stat => stat.name === "pointsFor")?.displayValue || "0";
        const pointsAgainst = entry.stats.find(stat => stat.name === "pointsAgainst")?.displayValue || "0";
        const differential = entry.stats.find(stat => stat.name === "differential")?.displayValue || "0";
        const homeRecord = entry.stats.find(stat => stat.name === "Home")?.displayValue || "0-0";
        const awayRecord = entry.stats.find(stat => stat.name === "Road")?.displayValue || "0-0";
        const divRecord = entry.stats.find(stat => stat.name === "vs. Div.")?.displayValue || "0-0";
        const confRecord = entry.stats.find(stat => stat.name === "vs. Conf.")?.displayValue || "0-0";
        const streak = entry.stats.find(stat => stat.name === "streak")?.displayValue || "N/A";

        row.innerHTML = `
          <td class="team-name" data-team-hover>
            <img src="${logoUrl}" alt="${teamName} logo" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle;" onerror="this.src='../assets/nfl.png';">
            ${teamName}
          </td>
          <td>${wins}</td>
          <td>${losses}</td>
          <td>${ties}</td>
          <td>${winPercent}</td>
          <td>${pointsFor}</td>
          <td>${pointsAgainst}</td>
          <td style="color: ${parseInt(differential) > 0 ? 'green' : parseInt(differential) < 0 ? 'red' : 'white'};">${differential}</td>
        `;

        // Create hover card
        const hoverCard = document.createElement("div");
        hoverCard.className = "team-hover-card";
        hoverCard.innerHTML = `
          <img src="${logoUrl}" alt="${teamName} logo" style="width: 50px; height: 50px; margin-bottom: 8px;" onerror="this.src='../assets/nfl.png';">
          <div style="font-weight: bold;">${teamName}</div>
          <br><div>Home: ${homeRecord} | Away: ${awayRecord}</div>
          <div>Division: ${divRecord} | Conference: ${confRecord}</div>
          <div>
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

        // Add click handler to navigate to team page
        teamNameCell.style.cursor = 'pointer';
        teamNameCell.addEventListener('click', () => {
          window.location.href = `team-page.html?teamId=${entry.team.id}`;
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

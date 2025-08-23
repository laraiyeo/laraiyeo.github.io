const STANDINGS_URL = "https://cdn.espn.com/core/wnba/standings?xhr=1";

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

    // Get all standings entries from data.content.standings.standings.entries
    const allEntries =
      data.content &&
      data.content.standings &&
      data.content.standings.standings &&
      Array.isArray(data.content.standings.standings.entries)
        ? data.content.standings.standings.entries
        : [];

    // Get conference order from tier2Nav.subNavMenu.navigation.items
    let eastOrder = [];
    let westOrder = [];
    const tier2Nav = data.content.tier2Nav;
    if (
      tier2Nav &&
      tier2Nav.subNavMenu &&
      tier2Nav.subNavMenu.navigation &&
      Array.isArray(tier2Nav.subNavMenu.navigation.items)
    ) {
      let east = false, west = false;
      for (const item of tier2Nav.subNavMenu.navigation.items) {
        if (item.links && item.links[0]) {
          const link = item.links[0];
          if (link.text === "Eastern Conference") {
            east = true;
            west = false;
            continue;
          }
          if (link.text === "Western Conference") {
            west = true;
            east = false;
            continue;
          }
          if (link.rel && link.rel.includes("team") && link.attributes && link.attributes.teamAbbrev) {
            if (east) eastOrder.push(link.attributes.teamAbbrev);
            if (west) westOrder.push(link.attributes.teamAbbrev);
          }
        }
      }
    }

    // Fallback to default order if not found
    if (eastOrder.length === 0) eastOrder = ["ATL", "CHI", "CON", "IND", "NY", "WSH"];
    if (westOrder.length === 0) westOrder = ["DAL", "GS", "LV", "LA", "MIN", "PHX", "SEA"];

    // Eastern Conference: filter by eastOrder
    const easternConference = {
      name: "Eastern Conference",
      standings: {
        entries: eastOrder
          .map(abbr => allEntries.find(e => e.team.abbreviation === abbr))
          .filter(Boolean)
      }
    };

    // Western Conference: filter by westOrder
    const westernConference = {
      name: "Western Conference",
      standings: {
        entries: westOrder
          .map(abbr => allEntries.find(e => e.team.abbreviation === abbr))
          .filter(Boolean)
      }
    };

    renderLeagueStandings(easternConference, "easternConferenceStandings");
    renderLeagueStandings(westernConference, "westernConferenceStandings");
  } catch (err) {
    console.error("Error fetching standings:", err);
  }
}

function renderLeagueStandings(conference, containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container with ID '${containerId}' not found.`);
    return;
  }

  container.innerHTML = ""; // Clear previous content

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
        <th>PPG</th>
        <th>OPP PPG</th>
      </tr>
    </thead>
  `;
  table.innerHTML = headers;

  // Add table body
  const tbody = document.createElement("tbody");

  conference.standings.entries
    .sort((a, b) => a.team.seed - b.team.seed) // Sort by seed
    .forEach(entry => {
      const row = document.createElement("tr");

      const isSmallScreen = window.innerWidth <= 475;

      const teamName = isSmallScreen 
        ? `${entry.team.abbreviation}<br>${entry.team.shortDisplayName === "Timberwolves" ? "T. Wolves" : entry.team.shortDisplayName === "Trail Blazers" ? "T. Blazers" : entry.team.shortDisplayName}` 
        : entry.team.displayName;
      const teamAbbreviation = entry.team.abbreviation.toLowerCase();
      const teamSeed = entry.team.seed || "-";
      const clincher = entry.team.clincher || null;
      const clincherColor = clincher && ["z", "y", "x", "xp"].includes(clincher) ? "green" : clincher === "e" ? "red" : "grey";
      const logoUrl = `https://a.espncdn.com/i/teamlogos/wnba/500-dark/${teamAbbreviation}.png`;

      const wins = entry.stats.find(stat => stat.name === "wins")?.displayValue || "0";
      const losses = entry.stats.find(stat => stat.name === "losses")?.displayValue || "0";
      const winPercent = entry.stats.find(stat => stat.name === "winPercent")?.displayValue || "0.000";
      const gamesBehind = entry.stats.find(stat => stat.name === "gamesBehind")?.displayValue || "-";
      const avgPointsFor = entry.stats.find(stat => stat.name === "avgPointsFor")?.displayValue || "0.0";
      const avgPointsAgainst = entry.stats.find(stat => stat.name === "avgPointsAgainst")?.displayValue || "0.0";
      const homeRecord = entry.stats.find(stat => stat.name === "Home")?.displayValue || "0-0";
      const awayRecord = entry.stats.find(stat => stat.name === "Road")?.displayValue || "0-0";
      const lastTen = entry.stats.find(stat => stat.name === "Last Ten Games")?.displayValue || "0-0";
      const streak = entry.stats.find(stat => stat.name === "streak")?.displayValue || "N/A";

      row.innerHTML = `
        <td class="team-name" data-team-hover>
          <img src="${logoUrl}" alt="${teamName} logo" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle;">
          ${teamName} <span style="color: grey;">${isSmallScreen ? "<br>" : ""} (${teamSeed}) ${clincher ? `<span style="color: ${clincherColor};"> - ${clincher || ""}</span>` : ""}</span>
        </td>
        <td>${wins}</td>
        <td>${losses}</td>
        <td>${winPercent}</td>
        <td>${gamesBehind}</td>
        <td>${avgPointsFor}</td>
        <td>${avgPointsAgainst}</td>
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
        hoverCard.style.top = `${rect.top + window.scrollY - 85}px`;
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
  container.appendChild(table);
}

fetchStandings();
setInterval(fetchStandings, 2000); // Poll every 2 seconds

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

const STANDINGS_URL = `https://cdn.espn.com/core/${getLeagueIdentifier()}/standings?xhr=1`;

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
    if (isSummerLeague()) {
      await fetchSummerLeagueStandings();
    } else {
      await fetchRegularStandings();
    }
  } catch (err) {
    console.error("Error fetching standings:", err);
  }
}

async function fetchRegularStandings() {
  const res = await fetch(STANDINGS_URL);
  const text = await res.text();
  const newHash = hashString(text);

  if (newHash === lastStandingsHash) {
    return; // No changes, skip update
  }
  lastStandingsHash = newHash;

  const data = JSON.parse(text);
  const groups = data.content.standings.groups;

  const easternConference = groups.find(group => group.name === "Eastern Conference");
  const westernConference = groups.find(group => group.name === "Western Conference");

  // Restore original titles and show western conference for regular season
  const easternTitle = document.querySelector("#easternConference h3");
  const westernConferenceDiv = document.getElementById("westernConference");
  
  if (easternTitle) {
    easternTitle.textContent = "Eastern Conference";
  }
  
  if (westernConferenceDiv) {
    westernConferenceDiv.style.display = "block";
  }

  renderLeagueStandings(easternConference, "easternConferenceStandings");
  renderLeagueStandings(westernConference, "westernConferenceStandings");
}

async function fetchSummerLeagueStandings() {
  const SUMMER_LEAGUE_STANDINGS_URL = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba-summer-las-vegas/seasons/2025/types/2/groups/1/standings/0?lang=en&region=us";
  
  const res = await fetch(SUMMER_LEAGUE_STANDINGS_URL);
  const data = await res.json();
  
  const standingsData = data.standings || [];
  
  // Fetch team details for each team
  const teamsWithDetails = await Promise.all(
    standingsData.map(async (teamStanding) => {
      const teamRef = teamStanding.team.$ref.replace('http://', 'https://');
      const teamRes = await fetch(teamRef);
      const teamData = await teamRes.json();
      
      const record = teamStanding.records[0];
      const stats = record.stats.reduce((acc, stat) => {
        acc[stat.name] = stat;
        return acc;
      }, {});
      
      return {
        team: teamData,
        record: record,
        stats: stats,
        seed: stats.playoffSeed?.value || 0
      };
    })
  );
  
  // Sort by seed
  teamsWithDetails.sort((a, b) => a.seed - b.seed);
  
  // Update titles and hide western conference for summer league
  const easternTitle = document.querySelector("#easternConference h3");
  const westernConference = document.getElementById("westernConference");
  
  if (easternTitle) {
    easternTitle.textContent = "Summer League Standings";
  }
  
  if (westernConference) {
    westernConference.style.display = "none";
  }
  
  // Render as a single standings table
  renderSummerLeagueStandings(teamsWithDetails, "easternConferenceStandings");
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
      const logoUrl = `https://a.espncdn.com/i/teamlogos/nba/500-dark/scoreboard/${teamAbbreviation}.png`;

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

function renderSummerLeagueStandings(teams, containerId) {
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
        <th>PF</th>
        <th>PA</th>
        <th>DIFF</th>
      </tr>
    </thead>
  `;
  table.innerHTML = headers;

  // Add table body
  const tbody = document.createElement("tbody");

  teams.forEach(teamData => {
    const row = document.createElement("tr");
    const team = teamData.team;
    const stats = teamData.stats;

    const isSmallScreen = window.innerWidth <= 475;
    const teamName = isSmallScreen 
      ? `${team.abbreviation}<br>${team.shortDisplayName}` 
      : team.displayName;
    
    const teamAbbreviation = team.abbreviation.toLowerCase();
    const teamSeed = teamData.seed;
    const logoUrl = `https://a.espncdn.com/i/teamlogos/nba/500-dark/scoreboard/${teamAbbreviation}.png`;

    const wins = stats.wins?.displayValue || "0";
    const losses = stats.losses?.displayValue || "0";
    const winPercent = stats.winPercent?.displayValue || "0.000";
    const pointsFor = stats.pointsFor?.displayValue || "0";
    const pointsAgainst = stats.pointsAgainst?.displayValue || "0";
    const pointDifferential = stats.pointDifferential?.displayValue || "0";
    const streak = stats.streak?.displayValue || "N/A";

    row.innerHTML = `
      <td class="team-name">
        <img src="${logoUrl}" alt="${teamName} logo" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle;">
        ${teamName} <span style="color: grey;">${isSmallScreen ? "<br>" : ""} (${teamSeed})</span>
      </td>
      <td>${wins}</td>
      <td>${losses}</td>
      <td>${winPercent}</td>
      <td>${pointsFor}</td>
      <td>${pointsAgainst}</td>
      <td>${pointDifferential}</td>
    `;

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

fetchStandings();
setInterval(fetchStandings, 2000); // Poll every 2 seconds

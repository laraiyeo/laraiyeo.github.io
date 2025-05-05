const STANDINGS_URL = "https://corsproxy.io/?url=https://api-web.nhle.com/v1/standings/now";

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
    const standings = data.standings;

    const easternConference = standings.filter(team => team.conferenceName === "Eastern");
    const westernConference = standings.filter(team => team.conferenceName === "Western");

    renderConferenceStandings(easternConference, "easternConferenceStandings");
    renderConferenceStandings(westernConference, "westernConferenceStandings");
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

  const divisions = [...new Set(conference.map(team => team.divisionName))];

  divisions.forEach(divisionName => {
    const divisionBox = document.createElement("div");
    divisionBox.className = "division-box";

    const divisionTitle = document.createElement("h4");
    divisionTitle.textContent = divisionName;
    divisionBox.appendChild(divisionTitle);

    const table = document.createElement("table");
    table.className = "division-table";

    const headers = `
      <thead>
        <tr>
          <th>Team</th>
          <th>W</th>
          <th>L</th>
          <th>OTL</th>
          <th>PTS</th>
          <th>GF</th>
          <th>GA</th>
        </tr>
      </thead>
    `;
    table.innerHTML = headers;

    const tbody = document.createElement("tbody");

    conference
      .filter(team => team.divisionName === divisionName)
      .sort((a, b) => a.divisionSequence - b.divisionSequence)
      .forEach(team => {
        const row = document.createElement("tr");

        const isSmallScreen = window.innerWidth <= 475;

        const teamName = isSmallScreen ? team.teamAbbrev.default + "<br>" + team.teamCommonName.default : team.teamName.default;

        const teamSeed = team.conferenceSequence || "-";
        const clinchIndicator = team.clinchIndicator || null;
        const clinchColor = clinchIndicator && ["p", "y", "x", "z"].includes(clinchIndicator) ? "green" : clinchIndicator === "e" ? "red" : "grey";

        const awayWins = (team.wins ?? 0) - (team.homeWins ?? 0);
        const awayLosses = (team.losses ?? 0) - (team.homeLosses ?? 0);
        const awayOtLosses = (team.otLosses ?? 0) - (team.homeOtLosses ?? 0);        


        row.innerHTML = `
          <td class="team-name" data-team-hover>
            <img src="${team.teamLogo}" alt="${team.teamName.default} logo" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle;">
            ${teamName} <span style="color: grey;">${isSmallScreen ? "<br>" : ""}(${teamSeed}) -  <span style="color: ${clinchColor};">${clinchIndicator || ""}</span>
          </td>
          <td>${team.wins}</td>
          <td>${team.losses}</td>
          <td>${team.otLosses}</td>
          <td>${team.points}</td>
          <td>${team.goalFor}</td>
          <td>${team.goalAgainst}</td>
        `;

        const hoverCard = document.createElement("div");
        hoverCard.className = "team-hover-card";
        hoverCard.innerHTML = `
          <img src="${team.teamLogo}" alt="${team.teamName.default} logo" style="width: 50px; height: 50px; margin-bottom: 8px;">
          <div style="font-weight: bold;">${team.teamName.default} <span style="color: grey;">(${teamSeed})</span></div>
          <br><div>Home: ${team.homeWins}-${team.homeLosses}-${team.homeOtLosses} | Away: ${awayWins}-${awayLosses}-${awayOtLosses}</div>
          <br><div>L10: ${team.l10Wins}-${team.l10Losses}-${team.l10OtLosses} | 
            <span style="color: ${team.streakCode === "W" ? "green" : "red"};">Streak: ${team.streakCode}${team.streakCount}</span>
          </div>
        `;

        document.body.appendChild(hoverCard);

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

        tbody.appendChild(row);
      });

    table.appendChild(tbody);
    divisionBox.appendChild(table);
    container.appendChild(divisionBox);
  });
}

fetchStandings();
setInterval(fetchStandings, 2000); // Poll every 2 seconds

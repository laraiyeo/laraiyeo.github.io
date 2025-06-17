const LEAGUES = {
  "Club World Cup": { code: "fifa.cwc", logo: "19" },
};

let currentCWCLeague = localStorage.getItem("currentCWCLeague") || "fifa.cwc"; // Default to Club World Cup

function getTuesdayRange() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysToLastSunday = dayOfWeek; // Days since the last Sunday
  const lastSunday = new Date(now);
  lastSunday.setDate(now.getDate() - daysToLastSunday);

  const nextSaturday = new Date(lastSunday);
  nextSaturday.setDate(lastSunday.getDate() + 6);

  const formatDate = date =>
    date.getFullYear() +
    String(date.getMonth() + 1).padStart(2, "0") +
    String(date.getDate()).padStart(2, "0");

  return `${formatDate(lastSunday)}-${formatDate(nextSaturday)}`;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

let lastScheduleHash = null;

async function fetchAndDisplayTeams() {
  try {
    const TEAMS_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.cwc/teams`;
    const tuesdayRange = getTuesdayRange();
    const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.cwc/scoreboard?dates=${tuesdayRange}`;

    const teamsResponse = await fetch(TEAMS_API_URL);
    const teamsData = await teamsResponse.json();
    const teams = teamsData.sports[0].leagues[0].teams.map(teamData => teamData.team);

    const scoreboardResponse = await fetch(SCOREBOARD_API_URL);
    const scoreboardText = await scoreboardResponse.text();
    const newHash = hashString(scoreboardText);

    if (newHash === lastScheduleHash) {
      console.log("No changes detected in the schedule.");
      return;
    }
    lastScheduleHash = newHash;

    const scoreboardData = JSON.parse(scoreboardText);
    const games = scoreboardData.events || [];

    const container = document.getElementById("teamsContainer");
    if (!container) {
      console.error("Error: Element with ID 'teamsContainer' not found.");
      return;
    }

    // Update the header to reflect the current league - fixed to use correct league name
    const header = document.querySelector("#scoreboard h2");
    if (header) {
      header.textContent = `All Teams - Club World Cup`;
    }

    container.innerHTML = ""; // Clear any existing content

    for (const team of teams) {
      // Skip teams with Round of and América in their displayName
      if (team.displayName.includes("Round of") || team.displayName.includes("América")) {
        continue;
      }


      const logoUrl = ["367", "2950"].includes(team.id)
        ? team.logos?.find(logo => logo.rel.includes("default"))?.href || ""
        : team.logos?.find(logo => logo.rel.includes("dark"))?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`;
      const teamGames = games.filter(game =>
        game.competitions[0].competitors.some(competitor => competitor.team.id === team.id)
      );

      const displayName = team.shortDisplayName || team.displayName;

      const gameCardHtml = teamGames.length > 0
        ? await buildGameCard(teamGames[0], team) // Use the first game for now
        : buildNoGameCard(team);

      const teamCard = document.createElement("div");
      teamCard.className = "team-card";
      teamCard.style.backgroundColor = ["2950", "3243", "435", "929"].includes(team.id) ? `#${team.alternateColor}` : `#${team.color}`;
      nameColorChange = ["ffffff", "ffee00", "ffff00", "81f733", "ffef32", "FCEE33", "ffff91", "1c31ce", "ffd700"].includes(team.color) ? "black" : "white";

      teamCard.innerHTML = `
        <div class="team-header">
          <img src="${logoUrl}" alt="${team.displayName}" class="team-logo">
          <h2 class="team-name" style="color: ${nameColorChange};">${displayName}</h2>
        </div>
        <div class="team-games">${gameCardHtml}</div>
      `;

      // Add OBS link copying functionality
      teamCard.addEventListener("click", async () => {
        const url = `https://laraiyeo.github.io/soccer/cwc/team.html?team=${encodeURIComponent(team.id)}`;
        try {
          await navigator.clipboard.writeText(url);
          alert(`OBS link copied for ${team.displayName}: ${url}`);
        } catch (err) {
          console.error("Failed to copy OBS link:", err);
        }
      });

      container.appendChild(teamCard);
    }

    // Save the current league to localStorage
    localStorage.setItem("currentCWCLeague", "fifa.cwc");
  } catch (error) {
    console.error("Error fetching CWC teams or games:", error);
  }
}

function buildNoGameCard(team) {
    const logoUrl = ["367", "2950"].includes(team.id)
    ? team.logos?.find(logo => logo.rel.includes("default"))?.href || ""
    : team.logos?.find(logo => logo.rel.includes("dark"))?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`;
    
  return `
    <div class="game-card no-game-card">
      <img src="${logoUrl}" alt="${team.displayName} logo" class="card-team-logo">
      <div class="no-game-text">No game scheduled <br> this week</div>
    </div>
  `;
}

function buildGameCard(game, team) {
    const header = game.season.slug;
    const formatted = header
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home");
    const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away");

    const homeAgg = homeTeam?.aggregateScore ?? 0;
    const awayAgg = awayTeam?.aggregateScore ?? 0;

    const isAgg = homeAgg > 0 || awayAgg > 0;
  
    function getOrdinalSuffix(num) {
        if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
        switch (num % 10) {
          case 1: return `${num}st`;
          case 2: return `${num}nd`;
          case 3: return `${num}rd`;
          default: return `${num}th`;
        }
    }

    const leagueName = "Club World Cup"; // Direct assignment instead of lookup
  
    const formatShortDisplayName = (name) => {
      if (name === "Bournemouth") return "B'Mouth";
      if (name === "Real Sociedad") return "Sociedad";
      if (name === "Southampton") return "S'Ampton";
      if (name === "Real Madrid") return "R. Madrid";
      if (name === "Nottm Forest") return "N. Forest";
      if (name === "Man United") return "Man Utd";
      if (name === "Las Palmas") return "L. Palmas";
      return name;
    };
  
    const getTeamLogo = (team) => {
      if (["367", "111"].includes(team.id)) {
        return `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${team.id}.png`;
      } else if (team.id === "436") {
        return `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`;
      }
      return team.logo;
    };
  
    const homeShootoutScore = homeTeam.shootoutScore;
    const awayShootoutScore = awayTeam.shootoutScore;

    const awayIsWinner = (awayShootoutScore || awayTeam.score) > (homeShootoutScore || homeTeam.score);
    const homeIsWinner = (homeShootoutScore || homeTeam.score) > (awayShootoutScore || awayTeam.score);
  
  const gameDate = new Date(game.date);

  const hour = gameDate.toLocaleString("en-US", {
    hour: "numeric",
    hour12: true,
  });
  const ampm = hour.includes("AM") ? "AM" : "PM";
  const hourOnly = hour.replace(/ AM| PM/, ""); // remove space and AM/PM

  const datePart = gameDate.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const minutes = gameDate.getMinutes();
  const time = minutes === 0
    ? `${hourOnly} ${ampm}`
    : `${hourOnly}:${minutes.toString().padStart(2, '0')} ${ampm}`;

  const date = `${datePart}, ${time}`;

  
    const startTime = new Date(game.date).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  
    if (game.status.type.state === "pre") {
      // Scheduled game card
      return `
        <div class="game-card">
          <div style="font-size: 0.8rem; color: grey; text-align: center;">${leagueName} - ${formatted}</div>
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <div style="text-align: center; display: flex; flex-direction: column; align-items: center;">
              <img src="${getTeamLogo(homeTeam.team)}" alt="${homeTeam.team.displayName}" style="width: 60px; height: 60px; margin-bottom: 6px;">
              <div style="font-weight: bold;">${formatShortDisplayName(homeTeam.team.shortDisplayName)}</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.3rem; font-weight: bold; ${isAgg ? "margin-top:15px; margin-bottom:5px" : "margin-top: 20px; margin-bottom: 18px"};">Scheduled</div>
              ${isAgg ? `<div style="font-size: 0.75rem; color: grey;">Agg: ${homeAgg} - ${awayAgg}</div>` : ""}
              <div style="font-size: 0.75rem; color: grey; margin-top: ${isAgg ? "15px; margin-bottom: 7.5px;" : "25px"};">${date}</div>
            </div>
            <div style="text-align: center; display: flex; flex-direction: column; align-items: center;">
              <img src="${getTeamLogo(awayTeam.team)}" alt="${awayTeam.team.displayName}" style="width: 60px; height: 60px; margin-bottom: 6px;">
              <div style="font-weight: bold;">${formatShortDisplayName(awayTeam.team.shortDisplayName)}</div>
            </div>
          </div>
        </div>
      `;
    } else if (game.status.type.state === "post") {
      // Finished game card
      return `
        <div class="game-card">
          <div style="font-size: 0.8rem; color: grey; text-align: center;">${leagueName} - ${formatted}</div>
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <div style="text-align: center;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <img src="${getTeamLogo(homeTeam.team)}" alt="${homeTeam.team.displayName}" style="width: 60px; height: 60px;">
                <span style="font-size: 2.3rem; ${awayShootoutScore > 0 ? "margin-left: -10px;": "" } ${homeIsWinner ? "font-weight: bold;" : ""}">${homeTeam.score}${homeShootoutScore > 0 ? `<sup style="font-size: 0.5em;">(${homeShootoutScore})</sup>` : ""}</span>
              </div>
              <div style="margin-top: 6px; ${homeIsWinner ? "font-weight: bold;" : ""}">${formatShortDisplayName(homeTeam.team.shortDisplayName)}</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.3rem; font-weight: bold; ${isAgg ? "margin-top:15px; margin-bottom:5px" : "margin-top: 20px; margin-bottom: 18px"};">Final</div>
              ${isAgg ? `<div style="font-size: 0.75rem; color: grey;">Agg: ${homeAgg} - ${awayAgg}</div>` : ""}
              <div style="font-size: 0.75rem; color: grey; margin-top: ${isAgg ? "15px; margin-bottom: 7.5px;" : "25px"};">${date}</div>
            </div>
            <div style="text-align: center;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 2.3rem; ${awayIsWinner ? "font-weight: bold;" : ""}">${awayTeam.score}${awayShootoutScore > 0 ? `<sup style="font-size: 0.5em; margin-right:-10px;">(${awayShootoutScore})</sup>` : ""}</span>
                <img src="${getTeamLogo(awayTeam.team)}" alt="${awayTeam.team.displayName}" style="width: 60px; height: 60px;">
              </div>
              <div style="margin-top: 6px; ${awayIsWinner ? "font-weight: bold;" : ""}">${formatShortDisplayName(awayTeam.team.shortDisplayName)}</div>
            </div>
          </div>
        </div>
      `;
    } else {
      // Live game card
      return `
        <div class="game-card">
          <div style="font-size: 0.8rem; color: grey; text-align: center;">${leagueName} - ${formatted}</div>
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <div style="text-align: center;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <img src="${getTeamLogo(homeTeam.team)}" alt="${homeTeam.team.displayName}" style="width: 60px; height: 60px;">
                <span style="font-size: 2.3rem; ${homeIsWinner ? "font-weight: bold;" : ""}">${homeTeam.score}</span>
              </div>
              <div style="margin-top: 6px; ${homeIsWinner ? "font-weight: bold;" : ""}">${formatShortDisplayName(homeTeam.team.shortDisplayName)}</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.1rem; font-weight: bold; margin-bottom: -10px; margin-top: 15px;">${game.status.type.shortDetail}</div>
              <div style="font-size: 0.75rem; color: grey; margin-top: 15px; margin-bottom: 10px;">${game.status.type.description}</div>
              ${isAgg ? `<div style="font-size: 0.75rem; color: grey;">Agg: ${homeAgg} - ${awayAgg}</div>` : ""}
            </div>
            <div style="text-align: center;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 2.3rem; ${awayIsWinner ? "font-weight: bold;" : ""}">${awayTeam.score}</span>
                <img src="${getTeamLogo(awayTeam.team)}" alt="${awayTeam.team.displayName}" style="width: 60px; height: 60px;">
              </div>
              <div style="margin-top: 6px; ${awayIsWinner ? "font-weight: bold;" : ""}">${formatShortDisplayName(awayTeam.team.shortDisplayName)}</div>
            </div>
          </div>
        </div>
      `;
    }
  }

// Ensure the default league is loaded when the page is opened
window.addEventListener("DOMContentLoaded", () => {
  fetchAndDisplayTeams();
});

fetchAndDisplayTeams();
setInterval(fetchAndDisplayTeams, 2000);
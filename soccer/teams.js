const LEAGUES = {
  "Premier League": { code: "eng.1", logo: "23" },
  "La Liga": { code: "esp.1", logo: "15" },
  "Bundesliga": { code: "ger.1", logo: "10" },
  "Serie A": { code: "ita.1", logo: "12" },
  "Ligue 1": { code: "fra.1", logo: "9" },
};

let currentLeague = localStorage.getItem("currentLeague") || "eng.1"; // Default to Premier League if not set

function getTuesdayRange() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToLastTuesday = (dayOfWeek + 5) % 7; // Days since the last Tuesday
  const lastTuesday = new Date(now);
  lastTuesday.setDate(now.getDate() - daysToLastTuesday);

  const nextMonday = new Date(lastTuesday);
  nextMonday.setDate(lastTuesday.getDate() + 6);

  const formatDate = date =>
    date.getFullYear() +
    String(date.getMonth() + 1).padStart(2, "0") +
    String(date.getDate()).padStart(2, "0");

  return `${formatDate(lastTuesday)}-${formatDate(nextMonday)}`;
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
    const TEAMS_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/teams`;
    const tuesdayRange = getTuesdayRange();
    const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/scoreboard?dates=${tuesdayRange}`;

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

    // Update the header to reflect the current league
    const header = document.querySelector("#scoreboard h2");
    const currentLeagueName = Object.keys(LEAGUES).find(
      leagueName => LEAGUES[leagueName].code === currentLeague
    );
    if (header) {
      header.textContent = `All Teams - ${currentLeagueName}`;
    }

    container.innerHTML = ""; // Clear any existing content

    for (const team of teams) {
      const logoUrl = ["367", "2950"].includes(team.id)
        ? team.logos?.find(logo => logo.rel.includes("default"))?.href || ""
        : team.logos?.find(logo => logo.rel.includes("dark"))?.href || "";
      const teamGames = games.filter(game =>
        game.competitions[0].competitors.some(competitor => competitor.team.id === team.id)
      );

      const displayName = ["110", "6418", "598"].includes(team.id)
        ? team.shortDisplayName
        : team.displayName;
        
      const gameCardHtml = teamGames.length > 0
        ? await buildGameCard(teamGames[0], team) // Use the first game for now
        : buildNoGameCard(team);

      const teamCard = document.createElement("div");
      teamCard.className = "team-card";
      teamCard.style.backgroundColor = ["2950", "3243"].includes(team.id) ? `#${team.alternateColor}` : `#${team.color}`;
      nameColorChange = ["ffffff", "ffee00", "ffff00", "81f733"].includes(team.color) ? "black" : "white";

      teamCard.innerHTML = `
        <div class="team-header">
          <img src="${logoUrl}" alt="${team.displayName}" class="team-logo">
          <h2 class="team-name" style="color: ${nameColorChange};">${displayName}</h2>
        </div>
        <div class="team-games">${gameCardHtml}</div>
      `;

      // Add OBS link copying functionality
      teamCard.addEventListener("click", async () => {
        const url = `https://laraiyeo.github.io/soccer/team.html?team=${encodeURIComponent(team.id)}`;
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
    localStorage.setItem("currentLeague", currentLeague);
  } catch (error) {
    console.error("Error fetching soccer teams or games:", error);
  }
}

function buildNoGameCard(team) {
  const logoUrl = ["367", "2950"].includes(team.id)
  ? team.logos?.find(logo => logo.rel.includes("default"))?.href || ""
  : team.logos?.find(logo => logo.rel.includes("dark"))?.href || "";
  
return `
  <div class="game-card no-game-card">
    <img src="${logoUrl}" alt="${team.displayName} logo" class="card-team-logo">
    <div class="no-game-text">No game scheduled <br> this week</div>
  </div>
`;
}

function buildGameCard(game, team) {
  const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home");
  const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away");

  const leagueName = Object.keys(LEAGUES).find(
    leagueName => LEAGUES[leagueName].code === currentLeague
  );

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
    }
    return team.logo;
  };

  const awayIsWinner = awayTeam.score > homeTeam.score;
  const homeIsWinner = homeTeam.score > awayTeam.score;

  function getOrdinalSuffix(num) {
    if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
    switch (num % 10) {
      case 1: return `${num}st`;
      case 2: return `${num}nd`;
      case 3: return `${num}rd`;
      default: return `${num}th`;
    }
  }

  const record = game.competitions[0].competitors.map(c => c.homeAway === "home" ? c.records[0].summary : c.records[0].summary)[0];
  const numbers = record.split("-").map(Number);
  const total = numbers.reduce((sum, num) => sum + num, 0);

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

    const newTotal = total + 1;
    
    return `
      <div class="game-card">
        <div style="font-size: 0.8rem; color: grey; text-align: center;">${leagueName}, Round ${newTotal}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div style="text-align: center; display: flex; flex-direction: column; align-items: center;">
            <img src="${getTeamLogo(homeTeam.team)}" alt="${homeTeam.team.displayName}" style="width: 60px; height: 60px; margin-bottom: 6px;">
            <div style="font-weight: bold;">${formatShortDisplayName(homeTeam.team.shortDisplayName)}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.3rem; font-weight: bold; margin-top: 20px; margin-bottom: 18px;">Scheduled</div>
            <div style="font-size: 0.75rem; color: grey; margin-top: 25px;">${date}</div>
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
        <div style="font-size: 0.8rem; color: grey; text-align: center;">${leagueName}, Round ${total}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${getTeamLogo(homeTeam.team)}" alt="${homeTeam.team.displayName}" style="width: 60px; height: 60px;">
              <span style="font-size: 2.3rem; ${homeIsWinner ? "font-weight: bold;" : ""}">${homeTeam.score}</span>
            </div>
            <div style="margin-top: 6px; ${homeIsWinner ? "font-weight: bold;" : ""}">${formatShortDisplayName(homeTeam.team.shortDisplayName)}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.1rem; font-weight: bold; margin-top: 20px; margin-bottom: 18px;">Final</div>
            <div style="font-size: 0.75rem; color: grey; margin-top: 25px;">${date}</div>
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
  } else {
    // Live game card
    const newTotal = total + 1;

    return `
        <div class="game-card">
          <div style="font-size: 0.8rem; color: grey; text-align: center;">${leagueName}, Round ${newTotal}</div>
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <div style="text-align: center;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <img src="${getTeamLogo(homeTeam.team)}" alt="${homeTeam.team.displayName}" style="width: 60px; height: 60px;">
                <span style="font-size: 2.3rem; ${homeIsWinner ? "font-weight: bold;" : ""}">${homeTeam.score}</span>
              </div>
              <div style="margin-top: 6px; ${homeIsWinner ? "font-weight: bold;" : ""}">${formatShortDisplayName(homeTeam.team.shortDisplayName)}</div>
            </div>
            <div style="text-align: center;">
              <div style="f margin-bottom: 20px;">${game.status.displayClock}</div>
              <div style="font-size: 0.75rem; color: grey; margin-top: 10px;">${game.status.type.description}</div>
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
      <img class="league-logo" src="https://a.espncdn.com/i/leaguelogos/soccer/500-dark/${leagueData.logo}.png" alt="${leagueName}" style="display: none;">
    `;
    button.addEventListener("click", () => {
      currentLeague = leagueData.code;

      // Save the current league to localStorage
      localStorage.setItem("currentLeague", currentLeague);

      // Update active state
      document.querySelectorAll(".league-button").forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");

      fetchAndDisplayTeams();
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

// Ensure the default league is loaded when the page is opened
window.addEventListener("DOMContentLoaded", () => {
  fetchAndDisplayTeams();
});

setupLeagueButtons();
fetchAndDisplayTeams();
setInterval(fetchAndDisplayTeams, 2000);

const LEAGUES = {
  "Premier League": { code: "eng.1", logo: "23" },
  "La Liga": { code: "esp.1", logo: "15" },
  "Bundesliga": { code: "ger.1", logo: "10" },
  "Serie A": { code: "ita.1", logo: "12" },
  "Ligue 1": { code: "fra.1", logo: "9" },
  "MLS": { code: "usa.1", logo: "19" },
  "Saudi PL": { code: "ksa.1", logo: "2488" }
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

function setupMobileScrolling(container) {
  // Remove any existing mobile styles first
  const existingStyle = document.getElementById("mobile-scroll-style");
  if (existingStyle) {
    existingStyle.remove();
  }

  // Add horizontal scroll styling for mobile devices
  if (window.innerWidth < 768) {
    // Hide scrollbar for webkit browsers and add mobile-specific styles
    const style = document.createElement("style");
    style.textContent = `
      .league-buttons::-webkit-scrollbar {
        display: none;
      }
      @media (max-width: 767px) {
        .league-buttons {
          overflow-x: auto !important;
          overflow-y: hidden !important;
          justify-content: flex-start !important;
          scroll-behavior: smooth;
          padding: 0 10px;
          -webkit-overflow-scrolling: touch;
          min-height: 50px;
        }
        .league-button {
          flex-shrink: 0 !important;
          white-space: nowrap;
        }
      }
    `;
    style.id = "mobile-scroll-style";
    document.head.appendChild(style);
    
    // Apply container styles directly
    container.style.scrollbarWidth = "none"; // Firefox
    container.style.msOverflowStyle = "none"; // IE/Edge
  }
}

function setupLeagueButtons() {
  const leagueContainer = document.getElementById("leagueButtons");
  if (!leagueContainer) {
    console.error("Error: Element with ID 'leagueButtons' not found.");
    return;
  }

  leagueContainer.innerHTML = ""; // Clear any existing content
  
  // Add horizontal scroll styling for mobile
  setupMobileScrolling(leagueContainer);

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

      fetchAndDisplayAllGames();
    });

    leagueContainer.appendChild(button);
  }

  updateLeagueButtonDisplay(); // Adjust button display based on screen size
}

function updateLeagueButtonDisplay() {
  const isSmallScreen = window.innerWidth < 525;
  const leagueContainer = document.getElementById("leagueButtons");
  
  // Update mobile scrolling styles
  if (leagueContainer) {
    setupMobileScrolling(leagueContainer);
  }
  
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

function buildGameCard(game) {
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

  const isMLS = currentLeague === "usa.1";

  const startTime = new Date(game.date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const card = document.createElement("div");
  card.className = "game-card";

  if (game.status.type.state === "pre") {
    // Scheduled game card
    const newTotal = total + 1;
    
    card.innerHTML = `
      ${isMLS ? '' : `<div style="font-size: 0.8rem; color: grey; text-align: center;">${leagueName}, Round ${newTotal}</div>`}
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <div style="text-align: center; display: flex; flex-direction: column; align-items: center;">
          <img src="${getTeamLogo(homeTeam.team)}" alt="${homeTeam.team.displayName}" style="width: 60px; height: 60px; margin-bottom: 6px;" onerror="this.onerror=null; this.src='soccer-ball-png-24.png';">
          <div style="font-weight: bold;">${formatShortDisplayName(homeTeam.team.shortDisplayName)}</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 1.3rem; font-weight: bold; margin-top: 20px; margin-bottom: 18px;">Scheduled</div>
          <div style="font-size: 0.75rem; color: grey; margin-top: 25px;">${date}</div>
        </div>
        <div style="text-align: center; display: flex; flex-direction: column; align-items: center;">
          <img src="${getTeamLogo(awayTeam.team)}" alt="${awayTeam.team.displayName}" style="width: 60px; height: 60px; margin-bottom: 6px;" onerror="this.onerror=null; this.src='soccer-ball-png-24.png';">
          <div style="font-weight: bold;">${formatShortDisplayName(awayTeam.team.shortDisplayName)}</div>
        </div>
      </div>
    `;
  } else if (game.status.type.state === "post") {
    // Finished game card
    card.innerHTML = `
      ${isMLS ? '' : `<div style="font-size: 0.8rem; color: grey; text-align: center;">${leagueName}, Round ${total}</div>`}
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${getTeamLogo(homeTeam.team)}" alt="${homeTeam.team.displayName}" style="width: 60px; height: 60px;" onerror="this.onerror=null; this.src='soccer-ball-png-24.png';">
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
            <img src="${getTeamLogo(awayTeam.team)}" alt="${awayTeam.team.displayName}" style="width: 60px; height: 60px;" onerror="this.onerror=null; this.src='soccer-ball-png-24.png';">
          </div>
          <div style="margin-top: 6px; ${awayIsWinner ? "font-weight: bold;" : ""}">${formatShortDisplayName(awayTeam.team.shortDisplayName)}</div>
        </div>
      </div>
    `;
  } else {
    // Live game card
    const newTotal = total + 1;

    card.innerHTML = `
      ${isMLS ? '' : `<div style="font-size: 0.8rem; color: grey; text-align: center;">${leagueName}, Round ${newTotal}</div>`}
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${getTeamLogo(homeTeam.team)}" alt="${homeTeam.team.displayName}" style="width: 60px; height: 60px;" onerror="this.onerror=null; this.src='soccer-ball-png-24.png';">
            <span style="font-size: 2.3rem; ${homeIsWinner ? "font-weight: bold;" : ""}">${homeTeam.score}</span>
          </div>
          <div style="margin-top: 6px; ${homeIsWinner ? "font-weight: bold;" : ""}">${formatShortDisplayName(homeTeam.team.shortDisplayName)}</div>
        </div>
        <div style="text-align: center;">
          <div style="margin-bottom: 20px;">${game.status.displayClock}</div>
          <div style="font-size: 0.75rem; color: grey; margin-top: 10px;">${game.status.type.description}</div>
        </div>
        <div style="text-align: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 2.3rem; ${awayIsWinner ? "font-weight: bold;" : ""}">${awayTeam.score}</span>
            <img src="${getTeamLogo(awayTeam.team)}" alt="${awayTeam.team.displayName}" style="width: 60px; height: 60px;" onerror="this.onerror=null; this.src='soccer-ball-png-24.png';">
          </div>
          <div style="margin-top: 6px; ${awayIsWinner ? "font-weight: bold;" : ""}">${formatShortDisplayName(awayTeam.team.shortDisplayName)}</div>
        </div>
      </div>
    `;
  }
  
  // Add click handler to navigate to respective page
  card.addEventListener('click', () => {
    window.location.href = `scoreboard.html?gameId=${game.id}`;
  });
  
  card.style.cursor = 'pointer';
  
  return card;
}

async function displayGames(games, sectionId, containerId, noGamesId) {
  const section = document.getElementById(sectionId);
  const container = document.getElementById(containerId);
  const noGamesDiv = document.getElementById(noGamesId);

  if (games.length === 0) {
    container.style.display = "none";
    noGamesDiv.style.display = "flex";
    section.style.display = "block";
    return;
  }

  container.style.display = "flex";
  noGamesDiv.style.display = "none";
  section.style.display = "block";

  // Clear existing content
  container.innerHTML = '';
  
  for (const game of games) {
    const gameCard = buildGameCard(game);
    container.appendChild(gameCard);
  }
}

async function fetchAndDisplayAllGames() {
  try {
    const tuesdayRange = getTuesdayRange();
    const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/scoreboard?dates=${tuesdayRange}`;

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

    // Update the header to reflect the current league
    const header = document.querySelector("#scoreboard h2");
    const currentLeagueName = Object.keys(LEAGUES).find(
      leagueName => LEAGUES[leagueName].code === currentLeague
    );
    if (header) {
      header.textContent = `All Games - ${currentLeagueName}`;
    }

    // Remove duplicates
    const seenGameIds = new Set();
    const uniqueGames = games.filter(game => {
      if (seenGameIds.has(game.id)) {
        return false;
      }
      seenGameIds.add(game.id);
      return true;
    });

    // Sort by date first, then by time
    const sortGamesByTimeAndDate = (games) => {
      return games.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        
        // First sort by date
        const dayA = dateA.getFullYear() * 10000 + (dateA.getMonth() + 1) * 100 + dateA.getDate();
        const dayB = dateB.getFullYear() * 10000 + (dateB.getMonth() + 1) * 100 + dateB.getDate();
        
        if (dayA !== dayB) {
          return dayA - dayB;
        }
        
        // If dates are equal, sort by time (hour and minute)
        const timeA = dateA.getHours() * 60 + dateA.getMinutes();
        const timeB = dateB.getHours() * 60 + dateB.getMinutes();
        
        return timeA - timeB;
      });
    };

    // Separate games by status and sort each group
    const liveGames = sortGamesByTimeAndDate(
      uniqueGames.filter(game => game.status.type.state === "in")
    );
    
    const scheduledGames = sortGamesByTimeAndDate(
      uniqueGames.filter(game => game.status.type.state === "pre")
    );
    
    const finishedGames = sortGamesByTimeAndDate(
      uniqueGames.filter(game => game.status.type.state === "post")
    );

    await displayGames(liveGames, 'live-section', 'liveGamesContainer', 'no-live-games');
    await displayGames(scheduledGames, 'scheduled-section', 'scheduledGamesContainer', 'no-scheduled-games');
    await displayGames(finishedGames, 'finished-section', 'finishedGamesContainer', 'no-finished-games');
  } catch (error) {
    console.error("Error fetching soccer games:", error);
  }
}

window.addEventListener("resize", updateLeagueButtonDisplay);

// Initialize page
document.addEventListener("DOMContentLoaded", function() {
  setupLeagueButtons();
  fetchAndDisplayAllGames();
  setInterval(fetchAndDisplayAllGames, 6000); // Refresh every 6 seconds
});
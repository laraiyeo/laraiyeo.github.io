const TEAMS_API_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams";

function getAdjustedDateForNBA() {
  const now = new Date();
  const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  if (estNow.getHours() < 2) {
    estNow.setDate(estNow.getDate() - 1);
  }
  const adjustedDate = estNow.getFullYear() +
                       String(estNow.getMonth() + 1).padStart(2, "0") +
                       String(estNow.getDate()).padStart(2, "0");
  return adjustedDate;
}

function adjustTeamShortName(shortName) {
  if (shortName === "Timberwolves") return "T. Wolves";
  if (shortName === "Trail Blazers") return "T. Blazers";
  return shortName;
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

async function buildGameCard(game, team) {
  const logoUrl = team.logos?.find(logo =>
        logo.rel.includes(
          ["19", "20"].includes(team.id) ? 'dark' : 'default'
        )
      )?.href || `https://a.espncdn.com/i/teamlogos/nfl/500/${team.abbreviation}.png`;


  function getOrdinalSuffix(num) {
    if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
    switch (num % 10) {
      case 1: return `${num}st`;
      case 2: return `${num}nd`;
      case 3: return `${num}rd`;
      default: return `${num}th`;
    }
  }

  const currentPeriod = game?.competitions[0]?.status?.period
    ? `${getOrdinalSuffix(game.competitions[0].status.period)} Quarter`
    : "Unknown Period";

  if (game && game.status.type.description === "Scheduled") {
    const startTime = new Date(game.date).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

    const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home")?.team || {};
    const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away")?.team || {};
    const slug = game.season?.slug || "regular-season";

    const homeTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "home")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "away")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "away")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamShortName = adjustTeamShortName(awayTeam.shortDisplayName || "Unknown");
    const homeTeamShortName = adjustTeamShortName(homeTeam.shortDisplayName || "Unknown");

    return `
      <div class="game-card scheduled-game-card">
        <div class="game-headline">${headline}</div>
        <div class="game-content">
          <div class="team away-team">
            <img src="${`https://a.espncdn.com/i/teamlogos/nfl/500-dark/${awayTeam?.abbreviation}.png` || ""}" alt="${awayTeam.displayName || "Unknown"}" class="card-team-logo">
            <div class="card-team-name">${awayTeamShortName}</div>
            <div class="card-team-record">${awayTeamRecord}</div>
          </div>
          <div class="game-info">
            <div class="game-status">Scheduled</div>
            <div class="game-time">${startTime}</div>
          </div>
          <div class="team home-team">
            <img src="${`https://a.espncdn.com/i/teamlogos/nfl/500-dark/${homeTeam?.abbreviation}.png` || ""}" alt="${homeTeam.displayName || "Unknown"}" class="card-team-logo">
            <div class="card-team-name">${homeTeamShortName}</div>
            <div class="card-team-record">${homeTeamRecord}</div>
          </div>
        </div>
      </div>
    `;
  } else if (game && game.status.type.description === "Final") {
    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

    const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home")?.team;
    const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away")?.team;
    const homeTeamScore = game.competitions[0].competitors.find(c => c.homeAway === "home")?.score || "0";
    const awayTeamScore = game.competitions[0].competitors.find(c => c.homeAway === "away")?.score || "0";
    const slug = game.season?.slug || "regular-season";

    const homeTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "home")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "away")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "away")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamShortName = adjustTeamShortName(awayTeam?.shortDisplayName || "Unknown");
    const homeTeamShortName = adjustTeamShortName(homeTeam?.shortDisplayName || "Unknown");

    return `
      <div class="game-card final-game-card">
        <div class="game-headline">${headline}</div>
        <div class="game-content">
          <div class="team away-team">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${`https://a.espncdn.com/i/teamlogos/nfl/500-dark/${awayTeam?.abbreviation}.png` || ""}" alt="${awayTeam?.displayName || "Unknown"}" class="card-team-logo">
              <span class="card-team-score">${awayTeamScore}</span>
            </div>
            <div class="card-team-name">${awayTeamShortName}</div>
            <div class="card-team-record">${awayTeamRecord}</div>
          </div>
          <div class="game-info">
            <div class="line"></div>
            <div class="game-status">Final</div>
          </div>
          <div class="team home-team">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="card-team-score">${homeTeamScore}</span>
              <img src="${`https://a.espncdn.com/i/teamlogos/nfl/500-dark/${homeTeam?.abbreviation}.png` || ""}" alt="${homeTeam?.displayName || "Unknown"}" class="card-team-logo">
            </div>
            <div class="card-team-name">${homeTeamShortName}</div>
            <div class="card-team-record">${homeTeamRecord}</div>
          </div>
        </div>
      </div>
    `;
  } else if (game && (game.status.type.description === "In Progress" || game.status.type.description === "Halftime" || game.status.type.description === "End of Period")) {
    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

    const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home")?.team;
    const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away")?.team;
    const homeTeamScore = game.competitions[0].competitors.find(c => c.homeAway === "home")?.score || "0";
    const awayTeamScore = game.competitions[0].competitors.find(c => c.homeAway === "away")?.score || "0";
    const slug = game.season?.slug || "regular-season";

    const homeTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "home")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "away")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "away")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamShortName = adjustTeamShortName(awayTeam?.shortDisplayName || "Unknown");
    const homeTeamShortName = adjustTeamShortName(homeTeam?.shortDisplayName || "Unknown");

    const clockTime = game?.competitions[0]?.status?.displayClock;
    const isHalftime = game?.competitions[0]?.status?.type?.description === "Halftime";
    const isEndOfPeriod = game?.competitions[0]?.status?.type?.description === "End of Period";
    const periodDescription = isHalftime
      ? "Halftime"
      : isEndOfPeriod
      ? `End of ${currentPeriod}`
      : currentPeriod;
    const possession = game?.competitions[0]?.situation?.possession;
    const text = game?.competitions[0]?.situation?.possessionText || "";
    const distance = game?.competitions[0]?.situation?.distance || "N/A";
    const yardLine = game?.competitions[0]?.situation?.yardLine || "N/A";
    const kickoff = game?.competitions[0]?.situation?.shortDownDistanceText === "1st & 10" && distance === 10 && (yardLine === 65 || yardLine === 35) ? "Kickoff" : game?.competitions[0]?.situation?.shortDownDistanceText || "";

    return `
      <div class="game-card in-progress-game-card">
        <div class="game-headline">${headline}</div>
        <div class="game-content">
          <div class="team away-team">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${`https://a.espncdn.com/i/teamlogos/nfl/500-dark/${awayTeam?.abbreviation}.png` || ""}" alt="${awayTeam?.displayName || "Unknown"}" class="card-team-logo">
              <span class="card-team-score">${awayTeamScore}</span>
            </div>
            <div class="card-team-name">${awayTeamShortName}</div>
            <div class="card-team-record">${awayTeamRecord}</div>
          </div>
          <div class="game-info">
            <div class="game-period" style="margin-top: ${isHalftime ? "-50px" : "-10px"}">${periodDescription}</div>
            <div class="line" style="margin-top: ${isHalftime ? "5px" : "35px"}"></div>
            ${isHalftime || isEndOfPeriod ? "" : `<div class="game-status">${clockTime}</div>`}
            <div class="game-status" style="margin-top: 0px; font-size: 0.9rem;">${kickoff}</div>
            <div class="game-period" style="color: white; margin-top: -15px;">${text ? (possession === homeTeam.id ? `${text} ▶` : `◀ ${text}`) : ""}</div>
          </div>
          <div class="team home-team">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="card-team-score">${homeTeamScore}</span>
              <img src="${`https://a.espncdn.com/i/teamlogos/nfl/500-dark/${homeTeam?.abbreviation}.png` || ""}" alt="${homeTeam?.displayName || "Unknown"}" class="card-team-logo">
            </div>
            <div class="card-team-name">${homeTeamShortName}</div>
            <div class="card-team-record">${homeTeamRecord}</div>
          </div>
        </div>
      </div>
    `;
  } else {
    return `
      <div class="game-card no-game-card">
        <img src="${logoUrl}" alt="${team?.displayName || "Unknown"} logo" class="card-team-logo">
        <div class="no-game-text">No game scheduled <br> for today</div>
      </div>
    `;
  }
}

async function fetchAndDisplayTeams() {
  try {
    const adjustedDate = getAdjustedDateForNBA();
    const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${adjustedDate}`;

    const response = await fetch(TEAMS_API_URL);
    const data = await response.json();

    const teams = data.sports[0].leagues[0].teams.map(teamData => teamData.team);

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

    container.innerHTML = ""; // Clear any existing content

    for (const team of teams) {
      if (team.abbreviation === "TOY") {
        ""
      } else {
      const logoUrl = team.logos?.find(logo =>
        logo.rel.includes(
          ["19", "20"].includes(team.id) ? 'dark' : 'default'
        )
      )?.href || `https://a.espncdn.com/i/teamlogos/nfl/500/${team.abbreviation}.png`;

      const teamCard = document.createElement("div");
      teamCard.className = "team-card";
      teamCard.style.backgroundColor = `#${team.color}`;

      const teamGames = games.filter(game =>
        game.competitions[0].competitors.some(competitor => competitor.team.id === team.id)
      );

      const gameCardHtml = teamGames.length > 0
        ? await buildGameCard(teamGames[0], team)
        : await buildGameCard(null, team);

      teamCard.innerHTML = `
        <div class="team-header">
          <img src="${logoUrl}" alt="${team.displayName}" class="team-logo">
          <h2 class="team-name">${team.displayName}</h2>
        </div>
        <div class="team-games">${gameCardHtml}</div>
      `;

      // Add OBS link copying functionality
      teamCard.addEventListener("click", async () => {
        const url = `https://laraiyeo.github.io/nfl/team.html?team=${encodeURIComponent(team.abbreviation)}`;
        try {
          await navigator.clipboard.writeText(url);
          alert(`OBS link copied for ${team.displayName}: ${url}`);
        } catch (err) {
          console.error("Failed to copy OBS link:", err);
        }
      });

      container.appendChild(teamCard);
    }
  }
  } catch (error) {
    console.error("Error fetching NFL teams or games:", error);
  }
}

fetchAndDisplayTeams();
setInterval(fetchAndDisplayTeams, 2000);

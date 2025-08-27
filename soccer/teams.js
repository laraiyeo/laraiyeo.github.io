const LEAGUES = {
  "Premier League": { code: "eng.1", logo: "23" },
  "La Liga": { code: "esp.1", logo: "15" },
  "Bundesliga": { code: "ger.1", logo: "10" },
  "Serie A": { code: "ita.1", logo: "12" },
  "Ligue 1": { code: "fra.1", logo: "9" },
  "MLS": { code: "usa.1", logo: "19" },
  "Saudi PL": { code: "ksa.1", logo: "2488" }
};

// Competition configurations for domestic cups and other tournaments
const LEAGUE_COMPETITIONS = {
  "eng.1": [
    { code: "eng.fa", name: "FA Cup", logo: "40" },
    { code: "eng.league_cup", name: "EFL Cup", logo: "41" }
  ],
  "esp.1": [
    { code: "esp.copa_del_rey", name: "Copa del Rey", logo: "80" },
    { code: "esp.super_cup", name: "Spanish Supercopa", logo: "431" }
  ],
  "ger.1": [
    { code: "ger.dfb_pokal", name: "DFB Pokal", logo: "2061" },
    { code: "ger.super_cup", name: "German Super Cup", logo: "2315" }
  ],
  "ita.1": [
    { code: "ita.coppa_italia", name: "Coppa Italia", logo: "2192" },
    { code: "ita.super_cup", name: "Italian Supercoppa", logo: "2316" }
  ],
  "fra.1": [
    { code: "fra.coupe_de_france", name: "Coupe de France", logo: "182" },
    { code: "fra.league_cup", name: "Trophee des Champions", logo: "2345" }
  ],
  "usa.1": [
    { code: "usa.open", name: "US Open Cup", logo: "69" }
  ],
  "ksa.1": [
    { code: "ksa.kings.cup", name: "Saudi King's Cup", logo: "2490" }
  ]
};

// Helper function to get competition name from league code
function getCompetitionName(leagueCode) {
  // Check if it's the main league
  const mainLeague = Object.values(LEAGUES).find(league => league.code === leagueCode);
  if (mainLeague) {
    return Object.keys(LEAGUES).find(key => LEAGUES[key].code === leagueCode);
  }
  
  // Check domestic competitions
  for (const [mainLeagueCode, competitions] of Object.entries(LEAGUE_COMPETITIONS)) {
    const competition = competitions.find(comp => comp.code === leagueCode);
    if (competition) {
      return competition.name;
    }
  }
  
  return "Unknown Competition";
}

// Helper function to determine if a match is from a domestic cup (not main league)
function isDomesticCup(leagueCode) {
  // Check if this is NOT the main league
  const isMainLeague = Object.values(LEAGUES).some(league => league.code === leagueCode);
  return !isMainLeague;
}

// Helper function to fetch games from all competitions (main league + domestic cups)
// Fetch all competitions in parallel for better performance
async function fetchGamesFromAllCompetitions(tuesdayRange) {
  const allGames = [];
  
  // Get competitions for current league
  const competitions = LEAGUE_COMPETITIONS[currentLeague] || [];
  const allCompetitionsToCheck = [
    ...competitions, // Domestic cups FIRST (prioritized)
    { code: currentLeague, name: "League" } // Main league LAST
  ];
  
  console.log(`Fetching games from ${allCompetitionsToCheck.length} competitions in parallel:`, allCompetitionsToCheck.map(c => c.code));
  
  // Create all fetch promises in parallel
  const fetchPromises = allCompetitionsToCheck.map(async (competition) => {
    try {
      console.log(`Starting fetch for ${competition.code}...`);
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${competition.code}/scoreboard?dates=${tuesdayRange}`);
      
      if (response.ok) {
        const data = await response.json();
        const competitionGames = data.events || [];
        
        // Add competition information to each game
        competitionGames.forEach(game => {
          game.competitionCode = competition.code;
          game.competitionName = getCompetitionName(competition.code);
          game.isDomesticCup = isDomesticCup(competition.code);
          game.priority = isDomesticCup(competition.code) ? 1 : 2; // Competition = 1, League = 2
          // Add leagues data for round information
          game.leaguesData = data.leagues[0];
        });
        
        console.log(`Found ${competitionGames.length} games in ${competition.code}`);
        return competitionGames;
      } else {
        console.log(`Failed to fetch from ${competition.code}: ${response.status}`);
        return [];
      }
    } catch (error) {
      console.log(`Error fetching from ${competition.code}:`, error.message);
      return [];
    }
  });
  
  // Wait for all API calls to complete
  const allResults = await Promise.all(fetchPromises);
  
  // Combine all results
  allResults.forEach(games => {
    allGames.push(...games);
  });

  // Log breakdown of games by type
  const competitionGames = allGames.filter(game => game.isDomesticCup);
  const leagueGames = allGames.filter(game => !game.isDomesticCup);

  console.log(`Total games found across all competitions: ${allGames.length}`);
  console.log(`- League games: ${leagueGames.length}`);
  console.log(`- Competition games: ${competitionGames.length}`);

  if (competitionGames.length > 0) {
    const competitions = [...new Set(competitionGames.map(g => g.competitionName))];
    console.log(`- Competitions found: ${competitions.join(', ')}`);
  }

  return allGames;
}

// Helper function to select the best game to display for a team
// Priority: 1. Current/upcoming games (live > upcoming), 2. Most recent if all are finished
function selectBestGameForTeam(teamGames) {
  if (teamGames.length === 0) return null;
  
  const now = new Date();
  
  // Separate games by type and status
  const competitionGames = teamGames.filter(game => game.isDomesticCup);
  const leagueGames = teamGames.filter(game => !game.isDomesticCup);
  
  console.log(`Team has ${competitionGames.length} competition games and ${leagueGames.length} league games`);
  
  // Get current/upcoming games (live or future)
  const activeCompetitionGames = competitionGames.filter(game => 
    game.status.type.state === "in" || game.status.type.state === "pre"
  );
  
  const activeLeagueGames = leagueGames.filter(game => 
    game.status.type.state === "in" || game.status.type.state === "pre"
  );
  
  // Combine all active games and sort by priority and timing
  const allActiveGames = [...activeCompetitionGames, ...activeLeagueGames];
  
  if (allActiveGames.length > 0) {
    // Sort by: 1. Live games first, 2. Earliest upcoming games, 3. Prefer competitions only if same day
    const sortedActiveGames = allActiveGames.sort((a, b) => {
      // Live games always come first
      if (a.status.type.state === "in" && b.status.type.state !== "in") return -1;
      if (b.status.type.state === "in" && a.status.type.state !== "in") return 1;
      
      // For upcoming games, sort by date first (earliest first)
      const dateComparison = new Date(a.date) - new Date(b.date);
      
      // If dates are very close (same day), prefer competitions over league matches
      const timeDiff = Math.abs(new Date(a.date) - new Date(b.date));
      const sameDayThreshold = 24 * 60 * 60 * 1000; // 24 hours
      
      if (timeDiff < sameDayThreshold) {
        if (a.isDomesticCup && !b.isDomesticCup) return -1;
        if (b.isDomesticCup && !a.isDomesticCup) return 1;
      }
      
      // Otherwise, sort by date (earliest first)
      return dateComparison;
    });
    
    console.log(`Showing active game: ${sortedActiveGames[0].competitionName} (${sortedActiveGames[0].status.type.state}) on ${new Date(sortedActiveGames[0].date).toLocaleDateString()}`);
    return sortedActiveGames[0];
  }
  
  // If no active games, show the most recent finished game
  // Prefer competitions if they happened more recently than league games
  const allFinishedGames = teamGames.filter(game => game.status.type.state === "post");
  
  if (allFinishedGames.length > 0) {
    const sortedFinishedGames = allFinishedGames.sort((a, b) => {
      // Sort by most recent first
      const dateComparison = new Date(b.date) - new Date(a.date);
      
      // If dates are very close (same day), prefer competitions
      const timeDiff = Math.abs(new Date(a.date) - new Date(b.date));
      const sameDayThreshold = 24 * 60 * 60 * 1000; // 24 hours
      
      if (timeDiff < sameDayThreshold) {
        if (a.isDomesticCup && !b.isDomesticCup) return -1;
        if (b.isDomesticCup && !a.isDomesticCup) return 1;
      }
      
      return dateComparison;
    });
    
    console.log(`Showing most recent finished game: ${sortedFinishedGames[0].competitionName}`);
    return sortedFinishedGames[0];
  }
  
  // Fallback: return the first available game
  console.log(`Fallback: showing first available game`);
  return teamGames[0];
}

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
// Simple cache to avoid refetching the same league data
const dataCache = new Map();
const CACHE_DURATION = 30000; // 30 seconds

async function fetchAndDisplayTeams() {
  try {
    // Include competition information in cache key
    const competitions = LEAGUE_COMPETITIONS[currentLeague] || [];
    const allCompetitionsToCheck = [
      ...competitions, // Domestic cups FIRST (prioritized)
      { code: currentLeague, name: "League" } // Main league LAST
    ];
    const competitionCodes = allCompetitionsToCheck.map(c => c.code).sort().join(',');

    const cacheKey = `${currentLeague}-${competitionCodes}-${getTuesdayRange()}`;
    const now = Date.now();

    // Check cache first
    if (dataCache.has(cacheKey)) {
      const cached = dataCache.get(cacheKey);
      if (now - cached.timestamp < CACHE_DURATION) {
        console.log("Using cached data for", currentLeague, "with competitions:", cached.competitions || competitionCodes);
        await displayTeamsData(cached.teams, cached.games);
        return;
      } else {
        dataCache.delete(cacheKey); // Remove expired cache
      }
    }

    const TEAMS_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentLeague}/teams`;
    const tuesdayRange = getTuesdayRange();

    // Start both API calls in parallel for better performance
    console.log("Starting parallel fetch of teams and games data...");
    const [teamsResponse, games] = await Promise.all([
      fetch(TEAMS_API_URL),
      fetchGamesFromAllCompetitions(tuesdayRange)
    ]);

    const teamsData = await teamsResponse.json();
    const teams = teamsData.sports[0].leagues[0].teams.map(teamData => teamData.team);

    console.log(`Fetched ${teams.length} teams and ${games.length} games`);

    // Cache the results with competition information
    dataCache.set(cacheKey, {
      teams,
      games,
      competitions: competitionCodes,
      timestamp: now
    });

    await displayTeamsData(teams, games);
  } catch (error) {
    console.error("Error fetching teams:", error);
    const container = document.getElementById("teamsContainer");
    if (container) {
      container.innerHTML = '<div style="text-align: center; padding: 20px; color: red;">Error loading teams. Please try again.</div>';
    }
  }
}

async function displayTeamsData(teams, games) {
  try {
    // Calculate comprehensive hash for change detection
    // Include competition information to detect changes in domestic cups
    const competitions = LEAGUE_COMPETITIONS[currentLeague] || [];
    const allCompetitionsToCheck = [
      ...competitions, // Domestic cups FIRST (prioritized)
      { code: currentLeague, name: "League" } // Main league LAST
    ];

    // Create detailed hash that includes:
    // - Current league
    // - All competitions that were checked
    // - Competition games count
    // - League games count
    // - All game IDs with their competition codes
    const competitionGames = games.filter(game => game.isDomesticCup);
    const leagueGames = games.filter(game => !game.isDomesticCup);

    const competitionCodes = allCompetitionsToCheck.map(c => c.code).sort().join(',');
    const competitionGameIds = competitionGames.map(g => `${g.competitionCode}:${g.id}`).sort().join(',');
    const leagueGameIds = leagueGames.map(g => g.id).sort().join(',');

    const hashInput = `${currentLeague}|${competitionCodes}|${competitionGames.length}|${leagueGames.length}|${competitionGameIds}|${leagueGameIds}`;
    const newHash = hashString(hashInput);

    if (newHash === lastScheduleHash) {
      console.log("No changes detected in the schedule.");
      return;
    }

    console.log(`Schedule changed - updating display`);
    console.log(`Competitions checked: ${competitionCodes}`);
    console.log(`Competition games: ${competitionGames.length}, League games: ${leagueGames.length}`);

    // Log details about competition games for debugging
    if (competitionGames.length > 0) {
      console.log(`Competition games found:`, competitionGames.map(g => `${g.competitionName}: ${g.competitions[0].competitors[0].team.displayName} vs ${g.competitions[0].competitors[1].team.displayName} (${new Date(g.date).toLocaleDateString()})`));
    }

    lastScheduleHash = newHash;

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
      const logoUrl = ["367", "2950", "92"].includes(team.id)
        ? team.logos?.find(logo => logo.rel.includes("default"))?.href || ""
        : team.logos?.find(logo => logo.rel.includes("dark"))?.href || "soccer-ball-png-24.png";
      const teamGames = games.filter(game =>
        game.competitions[0].competitors.some(competitor => competitor.team.id === team.id)
      );

      const displayName = ["110", "6418", "598"].includes(team.id)
        ? team.shortDisplayName
        : team.displayName;
        
      const gameCardHtml = teamGames.length > 0
        ? await buildGameCard(selectBestGameForTeam(teamGames), team) // Use the best game selection logic
        : buildNoGameCard(team);

      const teamCard = document.createElement("div");
      teamCard.className = "team-card";
      teamCard.style.backgroundColor = ["2950", "3243", "21964", "929"].includes(team.id) ? `#${team.alternateColor}` : `#${team.color}`;
      nameColorChange = ["ffffff", "ffee00", "ffff00", "81f733", "f7f316", "eef209", "ece83a", "1c31ce", "ffd700"].includes(team.color) ? "black" : "white";

      teamCard.innerHTML = `
        <div class="team-header">
          <img src="${logoUrl}" alt="${team.displayName}" class="team-logo">
          <h2 class="team-name" style="color: ${nameColorChange};">${displayName}</h2>
        </div>
        <div class="team-games">${gameCardHtml}</div>
      `;

      // Add OBS link copying functionality
      teamCard.addEventListener("click", async () => {
        const currentStyles = loadSavedStyles();
        const params = new URLSearchParams();
        params.set('team', team.id);
        params.set('bgColor', currentStyles.backgroundColor);
        params.set('bgOpacity', currentStyles.backgroundOpacity);
        params.set('textColor', currentStyles.textColor);

        const url = `https://laraiyeo.github.io/soccer/team.html?${params.toString()}`;
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
  const logoUrl = ["367", "2950", "92"].includes(team.id)
  ? team.logos?.find(logo => logo.rel.includes("dark"))?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`
  : team.logos?.find(logo => logo.rel.includes("dark"))?.href || "soccer-ball-png-24.png";

return `
  <div class="game-card no-game-card">
    <img src="${logoUrl}" alt="${team.displayName} logo" class="card-team-logo">
    <div class="no-game-text">No game scheduled <br> this week</div>
  </div>
`;
}

function buildGameCard(game, team, data) {
  const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home");
  const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away");

  const leagueName = game.isDomesticCup ? game.competitionName : Object.keys(LEAGUES).find(
    leagueName => LEAGUES[leagueName].code === currentLeague
  );

  // Get round information from the game object - for domestic cups, use round data if available
  const round = game.isDomesticCup 
    ? (game.leaguesData?.season?.type?.name || "")
    : "";

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
    return team.logo || "soccer-ball-png-24.png";
  };

  const homeShootoutScore = homeTeam.shootoutScore;
  const awayShootoutScore = awayTeam.shootoutScore;

  const awayIsWinner = (awayShootoutScore || awayTeam.score) > (homeShootoutScore || homeTeam.score);
  const homeIsWinner = (homeShootoutScore || homeTeam.score) > (awayShootoutScore || awayTeam.score);

  function getOrdinalSuffix(num) {
    if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
    switch (num % 10) {
      case 1: return `${num}st`;
      case 2: return `${num}nd`;
      case 3: return `${num}rd`;
      default: return `${num}th`;
    }
  }


  const record = game?.competitions?.[0]?.competitors?.find(c => c.homeAway === "home")?.records?.[0]?.summary || "No record available";
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

  if (game.status.type.state === "pre") {
    // Scheduled game card
    const newTotal = total + 1;
    
    return `
      <div class="game-card">
        ${isMLS ? "" : game.isDomesticCup ? `<div style="font-size: 0.8rem; color: grey; text-align: center;">${game.competitionName}, ${round}</div>` : `<div style="font-size: 0.8rem; color: grey; text-align: center;">${leagueName}, Round ${newTotal}</div>`}
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
        ${isMLS ? "" : game.isDomesticCup ? `<div style="font-size: 0.8rem; color: grey; text-align: center;">${game.competitionName}, ${round}</div>` : `<div style="font-size: 0.8rem; color: grey; text-align: center;">${leagueName}, Round ${total}</div>`}
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${getTeamLogo(homeTeam.team)}" alt="${homeTeam.team.displayName}" style="width: 60px; height: 60px;">
              <span style="font-size: 2.3rem; ${awayShootoutScore > 0 ? "margin-left: -10px;": "" } ${homeIsWinner ? "font-weight: bold;" : ""}">${homeTeam.score}${homeShootoutScore > 0 ? `<sup style="font-size: 0.5em;">(${homeShootoutScore})</sup>` : ""}</span>
            </div>
            <div style="margin-top: 6px; ${homeIsWinner ? "font-weight: bold;" : ""}">${formatShortDisplayName(homeTeam.team.shortDisplayName)}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.1rem; font-weight: bold; margin-top: 20px; margin-bottom: 18px;">Final</div>
            <div style="font-size: 0.75rem; color: grey; margin-top: 25px;">${date}</div>
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
    const newTotal = total + 1;
    return `
        <div class="game-card">
          ${isMLS ? "" : game.isDomesticCup ? `<div style="font-size: 0.8rem; color: grey; text-align: center;">${game.competitionName}, ${round}</div>` : `<div style="font-size: 0.8rem; color: grey; text-align: center;">${leagueName}, Round ${newTotal}</div>`}
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <div style="text-align: center;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <img src="${getTeamLogo(homeTeam.team)}" alt="${homeTeam.team.displayName}" style="width: 60px; height: 60px;">
                <span style="font-size: 2.3rem; ${awayShootoutScore > 0 ? "margin-left: -10px;": "" } ${homeIsWinner ? "font-weight: bold;" : ""}">${homeTeam.score}${homeShootoutScore > 0 ? `<sup style="font-size: 0.5em;">(${homeShootoutScore})</sup>` : ""}</span>
              </div>
              <div style="margin-top: 6px; ${homeIsWinner ? "font-weight: bold;" : ""}">${formatShortDisplayName(homeTeam.team.shortDisplayName)}</div>
            </div>
            <div style="text-align: center;">
              <div style="f margin-bottom: 20px;">${game.status.displayClock}</div>
              <div style="font-size: 0.75rem; color: grey; margin-top: 10px;">${game.status.type.description}</div>
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
  }
}


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
    button.addEventListener("click", async () => {
      // Prevent multiple clicks during loading
      if (button.disabled) return;
      
      currentLeague = leagueData.code;

      // Clear cache when switching leagues to ensure fresh competition data
      dataCache.clear();
      console.log(`Switched to league ${currentLeague}, cleared cache`);

      // Save the current league to localStorage
      localStorage.setItem("currentLeague", currentLeague);

      // Update active state
      document.querySelectorAll(".league-button").forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");

      // Show loading state
      const container = document.getElementById("teamsContainer");
      if (container) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: white;">Loading teams...</div>';
      }

      // Disable all buttons during loading to prevent race conditions
      document.querySelectorAll(".league-button").forEach(btn => btn.disabled = true);

      try {
        await fetchAndDisplayTeams();
      } finally {
        // Re-enable buttons after loading
        document.querySelectorAll(".league-button").forEach(btn => btn.disabled = false);
      }
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

// Ensure the default league is loaded when the page is opened
window.addEventListener("DOMContentLoaded", () => {
  fetchAndDisplayTeams();
});

setupLeagueButtons();
fetchAndDisplayTeams();
setInterval(fetchAndDisplayTeams, 6000);

// Game Card Customization functionality
// Convert hex color to rgba with opacity
function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

const defaultStyles = {
  backgroundColor: '#000000',
  backgroundOpacity: 100,
  textColor: '#ffffff'
};

// Load saved styles or use defaults
function loadSavedStyles() {
  // Check for URL parameters first
  const urlParams = new URLSearchParams(window.location.search);
  const urlBgColor = urlParams.get('bgColor');
  const urlBgOpacity = urlParams.get('bgOpacity');
  const urlTextColor = urlParams.get('textColor');

  if (urlBgColor || urlBgOpacity || urlTextColor) {
    return {
      backgroundColor: urlBgColor || defaultStyles.backgroundColor,
      backgroundOpacity: urlBgOpacity !== null ? parseInt(urlBgOpacity) : defaultStyles.backgroundOpacity,
      textColor: urlTextColor || defaultStyles.textColor
    };
  }

  const saved = localStorage.getItem('soccer-game-card-styles');
  return saved ? JSON.parse(saved) : defaultStyles;
}

// Check if we're in URL parameter mode (styles locked by OBS link)
function isUrlParameterMode() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has('bgColor') || urlParams.has('bgOpacity') || urlParams.has('textColor');
}

// Save styles to localStorage (only if not in URL parameter mode)
function saveStyles(styles) {
  if (!isUrlParameterMode()) {
    localStorage.setItem('soccer-game-card-styles', JSON.stringify(styles));
  }
}

// Apply styles to all game cards
function applyStylesToCards(styles) {
  const gameCards = document.querySelectorAll('.game-card');
  gameCards.forEach(card => {
    const opacity = styles.backgroundOpacity / 100;
    const bgColor = hexToRgba(styles.backgroundColor, opacity);
    card.style.backgroundColor = bgColor;
    card.style.color = styles.textColor;
  });
}

// Validate hex color
function isValidHex(hex) {
  return /^#[0-9A-F]{6}$/i.test(hex);
}

// Update preview colors
function updatePreviews(styles) {
  const bgPreview = document.getElementById('bg-preview');
  const textPreview = document.getElementById('text-preview');
  if (bgPreview) bgPreview.style.backgroundColor = styles.backgroundColor;
  if (textPreview) textPreview.style.backgroundColor = styles.textColor;
}

// Set up customization controls
function initializeCustomization() {
  const currentStyles = loadSavedStyles();
  const urlMode = isUrlParameterMode();
  
  // Get control elements
  const bgColorPicker = document.getElementById('bg-color-picker');
  const bgColorHex = document.getElementById('bg-color-hex');
  const bgOpacitySlider = document.getElementById('bg-opacity-slider');
  const bgOpacityInput = document.getElementById('bg-opacity-input');
  const textColorPicker = document.getElementById('text-color-picker');
  const textColorHex = document.getElementById('text-color-hex');
  const resetButton = document.getElementById('reset-styles');

  // If in URL parameter mode, disable all controls and show message
  if (urlMode) {
    const panel = document.getElementById('customization-panel') || document.querySelector('.customization-panel');
    if (panel) {
      panel.style.opacity = '0.6';
      panel.style.pointerEvents = 'none';
      const message = document.createElement('div');
      message.style.cssText = 'background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin-bottom: 10px; border-radius: 4px; color: #856404; font-weight: bold; text-align: center;';
      message.textContent = '🔒 Styles are locked by OBS link parameters. Controls are disabled.';
      panel.insertBefore(message, panel.firstChild);
    }
  }

  // Set initial values (with null checks)
  if (bgColorPicker) bgColorPicker.value = currentStyles.backgroundColor;
  if (bgColorHex) bgColorHex.value = currentStyles.backgroundColor;
  if (bgOpacitySlider) bgOpacitySlider.value = currentStyles.backgroundOpacity;
  if (bgOpacityInput) bgOpacityInput.value = currentStyles.backgroundOpacity;
  if (textColorPicker) textColorPicker.value = currentStyles.textColor;
  if (textColorHex) textColorHex.value = currentStyles.textColor;

  updatePreviews(currentStyles);
  applyStylesToCards(currentStyles);

  // Background color picker change
  if (bgColorPicker) {
    bgColorPicker.addEventListener('change', (e) => {
      if (urlMode) return;
      const color = e.target.value;
      if (bgColorHex) bgColorHex.value = color;
      currentStyles.backgroundColor = color;
      updatePreviews(currentStyles);
      applyStylesToCards(currentStyles);
      saveStyles(currentStyles);
    });
  }

  // Background color hex input change
  if (bgColorHex) {
    bgColorHex.addEventListener('input', (e) => {
      if (urlMode) return;
      const color = e.target.value;
      if (isValidHex(color)) {
        if (bgColorPicker) bgColorPicker.value = color;
        currentStyles.backgroundColor = color;
        updatePreviews(currentStyles);
        applyStylesToCards(currentStyles);
        saveStyles(currentStyles);
      }
    });
  }

  // Background opacity slider change
  if (bgOpacitySlider) {
    bgOpacitySlider.addEventListener('input', (e) => {
      if (urlMode) return;
      const opacity = parseInt(e.target.value);
      if (bgOpacityInput) bgOpacityInput.value = opacity;
      currentStyles.backgroundOpacity = opacity;
      applyStylesToCards(currentStyles);
      saveStyles(currentStyles);
    });
  }

  // Background opacity input change
  if (bgOpacityInput) {
    bgOpacityInput.addEventListener('input', (e) => {
      if (urlMode) return;
      const opacity = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
      if (bgOpacitySlider) bgOpacitySlider.value = opacity;
      e.target.value = opacity;
      currentStyles.backgroundOpacity = opacity;
      applyStylesToCards(currentStyles);
      saveStyles(currentStyles);
    });
  }

  // Text color picker change
  if (textColorPicker) {
    textColorPicker.addEventListener('change', (e) => {
      if (urlMode) return;
      const color = e.target.value;
      if (textColorHex) textColorHex.value = color;
      currentStyles.textColor = color;
      updatePreviews(currentStyles);
      applyStylesToCards(currentStyles);
      saveStyles(currentStyles);
    });
  }

  // Text color hex input change
  if (textColorHex) {
    textColorHex.addEventListener('input', (e) => {
      if (urlMode) return;
      const color = e.target.value;
      if (isValidHex(color)) {
        if (textColorPicker) textColorPicker.value = color;
        currentStyles.textColor = color;
        updatePreviews(currentStyles);
        applyStylesToCards(currentStyles);
        saveStyles(currentStyles);
      }
    });
  }

  // Reset button
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      if (urlMode) return;
      // Reset to defaults
      if (bgColorPicker) bgColorPicker.value = defaultStyles.backgroundColor;
      if (bgColorHex) bgColorHex.value = defaultStyles.backgroundColor;
      if (bgOpacitySlider) bgOpacitySlider.value = defaultStyles.backgroundOpacity;
      if (bgOpacityInput) bgOpacityInput.value = defaultStyles.backgroundOpacity;
      if (textColorPicker) textColorPicker.value = defaultStyles.textColor;
      if (textColorHex) textColorHex.value = defaultStyles.textColor;

      // Update current styles - use explicit assignment for immediate reactivity
      currentStyles.backgroundColor = defaultStyles.backgroundColor;
      currentStyles.backgroundOpacity = defaultStyles.backgroundOpacity;
      currentStyles.textColor = defaultStyles.textColor;
      
      updatePreviews(currentStyles);
      applyStylesToCards(currentStyles);
      saveStyles(currentStyles);
    });
  }

  // Re-apply styles periodically to catch any dynamically created cards
  setInterval(() => {
    const currentStyles = loadSavedStyles();
    applyStylesToCards(currentStyles);
  }, 5000);
}

// Initialize customization after DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeCustomization);
} else {
  initializeCustomization();
}

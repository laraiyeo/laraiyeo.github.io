const LEAGUES = {
  "Champions League": { code: "uefa.champions", logo: "2" },
  "Europa League": { code: "uefa.europa", logo: "2310" },
  "Europa Conference League": { code: "uefa.europa.conf", logo: "20296" },
};

let currentUefaLeague = localStorage.getItem("currentUefaLeague") || "uefa.champions";

function ordinalSuffix(n) {
  if (n > 3 && n < 21) return n + "th";
  switch (n % 10) {
    case 1: return n + "st";
    case 2: return n + "nd";
    case 3: return n + "rd";
    default: return n + "th";
  }
}

async function fetchPlayoffTeams() {
  try {
    const currentYear = new Date().getFullYear();
    const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${currentYear}0101`;

    const calendarResponse = await fetch(CALENDAR_API_URL);
    const calendarData = await calendarResponse.json();

    const stages = ["Knockout Round Playoffs", "Rd of 16", "Quarterfinals", "Semifinals", "Final"];
    const stageDates = stages.map(stage => {
      const entry = calendarData.leagues?.[0]?.calendar?.[0]?.entries.find(e => e.label === stage);
      if (!entry) {
        console.error(`Error: Stage '${stage}' not found in calendar.`);
        return null;
      }
      return {
        stage,
        dates: `${entry.startDate.split("T")[0].replace(/-/g, "")}-${entry.endDate.split("T")[0].replace(/-/g, "")}`,
      };
    }).filter(Boolean);

    const teamAppearances = new Map();

    for (const { stage, dates } of stageDates) {
      const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${dates}`;
      const scoreboardResponse = await fetch(SCOREBOARD_API_URL);
      const scoreboardData = await scoreboardResponse.json();

      const events = scoreboardData.events || [];
      for (const event of events) {
        const competition = event.competitions?.[0];
        if (!competition) continue;

        const leg = competition.leg?.value || 1; // Default to Leg 1 if no leg info
        const series = competition.series;
        const isFinal = stage === "Final" && !series; // Handle Final stage separately

        const homeTeam = competition.competitors.find(c => c.order === 0)?.team;
        const awayTeam = competition.competitors.find(c => c.order === 1)?.team;
        if (!homeTeam || !awayTeam) continue;

        [homeTeam, awayTeam].forEach(team => {
          if (!teamAppearances.has(team.id)) {
            teamAppearances.set(team.id, {
              id: team.id,
              name: team.displayName,
              shortName: team.shortDisplayName,
              logo: `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${team.id}.png`, // Fallback to dynamic logo URL
              count: 0,
              matches: [],
            });
          }
        });

        const homeScore = competition.competitors.find(c => c.id === homeTeam.id)?.score || "-";
        const awayScore = competition.competitors.find(c => c.id === awayTeam.id)?.score || "-";

        // Add match details to both teams
        teamAppearances.get(homeTeam.id).matches.push({
          stage: `${stage} ${isFinal ? "" : `- Leg ${leg}`}`,
          homeTeam,
          awayTeam,
          homeScore,
          awayScore,
          date: new Date(competition.date).toLocaleDateString(),
          competition // Include the competition object
        });

        teamAppearances.get(awayTeam.id).matches.push({
          stage: `${stage} ${isFinal ? "" : `- Leg ${leg}`}`,
          homeTeam,
          awayTeam,
          homeScore,
          awayScore,
          date: new Date(competition.date).toLocaleDateString(),
          competition // Include the competition object
        });
      }
    }

    // Adjust appearance count to reflect unique stages
    teamAppearances.forEach(team => {
      const uniqueStages = new Set(team.matches.map(match => match.stage.split(" - ")[0]));
      team.count = uniqueStages.size;
    });

    // Fetch and assign ranks to teams
    await assignTeamRanks(teamAppearances);

    const teams = Array.from(teamAppearances.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    displayTeams(teams, teamAppearances);
  } catch (error) {
    console.error("Error fetching playoff teams:", error);
  }
}

async function assignTeamRanks(teamAppearances) {
  try {
    const STANDINGS_URL = `https://cdn.espn.com/core/soccer/table?xhr=1&league=${currentUefaLeague}`;
    const response = await fetch(STANDINGS_URL);
    const data = await response.json();

    const standings = data.content.standings.groups[0].standings.entries;

    standings.forEach(entry => {
      const teamId = entry.team.id;
      if (teamAppearances.has(teamId)) {
        // Retrieve rank from note.rank or fallback to team.rank
        const rank = entry.note?.rank || entry.team.rank || null;
        teamAppearances.get(teamId).rank = rank;
      }
    });
  } catch (error) {
    console.error("Error fetching team ranks:", error);
  }
}

function displayTeams(teams, teamAppearances) {
  const container = document.getElementById("playoffContainer");
  if (!container) {
    console.error("Error: Element with ID 'playoffContainer' not found.");
    return;
  }

  container.innerHTML = ""; // Clear previous content

  // Sort teams by stage priority for all appearances (1-5)
  const stagePriority = ["Final", "Semifinals", "Quarterfinals", "Rd of 16", "Knockout Round Playoffs"];
  teams.sort((a, b) => {
    const aStage = a.matches[0].stage.split(" - ")[0];
    const bStage = b.matches[0].stage.split(" - ")[0];
    const aStagePriority = stagePriority.indexOf(aStage);
    const bStagePriority = stagePriority.indexOf(bStage);

    if (a.count === b.count) {
      return aStagePriority - bStagePriority || a.name.localeCompare(b.name);
    }
    return b.count - a.count;
  });

  const isSmallScreen = window.innerWidth <= 525; // Check if the screen size is less than or equal to 525px

  teams.forEach(team => {
    // Skip teams with "Winner" in their display name
    if (team.name.includes("Winner")) {
      return;
    }

    // Create a container for the team
    const teamContainer = document.createElement("div");
    teamContainer.className = "team-container";

    // Set width based on screen size and number of appearances
    if (isSmallScreen) {
      teamContainer.style.width = "100%";
    } else if (team.count === 1) {
      teamContainer.style.width = "21.5%";
    } else if (team.count === 2) {
      teamContainer.style.width = "47.25%";
    } else {
      teamContainer.style.width = "100%";
    }

    // Team card
    const teamCard = document.createElement("div");
    teamCard.className = "team-item";
    teamCard.innerHTML = `
      <img src="${team.logo}" alt="${team.name}" class="team-logo">
      <span class="team-name">${team.shortName} - ${ordinalSuffix(team.rank !== null ? team.rank : "N/A")} Seed</span>
    `;
    teamContainer.appendChild(teamCard);

    // Game cards row container
    const gameCardsRow = document.createElement("div");
    gameCardsRow.className = "game-cards-row";

    // Group matches by stage
    const matchesByStage = team.matches.reduce((acc, match) => {
      const stage = match.stage.split(" - ")[0]; // Extract the base stage name
      if (!acc[stage]) acc[stage] = [];
      acc[stage].push(match);
      return acc;
    }, {});

    // Sort and display matches by stage
    Object.keys(matchesByStage).forEach(stage => {
      // Create a column for the stage
      const stageColumn = document.createElement("div");
      stageColumn.className = "stage-column";

      // Calculate aggregate score for the stage
      const aggregateScore = matchesByStage[stage].reduce(
        (acc, match) => {
          const competition = match.competition; // Access the competition object from the match
          if (competition?.leg?.value === 2 && competition.series?.competitors) {
            const teamCompetitor = competition.series.competitors.find(c => c.id === team.id);
            const opponentCompetitor = competition.series.competitors.find(c => c.id !== team.id);

            // Ensure teamCompetitor and opponentCompetitor exist before accessing their properties
            if (teamCompetitor && opponentCompetitor) {
              // Assign aggregate scores based on team ID
              acc.team = teamCompetitor.aggregateScore || 0;
              acc.opponent = opponentCompetitor.aggregateScore || 0;
            }
          }
          return acc;
        },
        { team: 0, opponent: 0 }
      );

      // Format aggregate score
      const teamAggregateDisplay = aggregateScore.team;
      const opponentAggregateDisplay = aggregateScore.opponent;

      // Add a stage header with aggregate score
      const stageHeader = document.createElement("div");
      stageHeader.className = "stage-header";
      const stageDisplayName = stage === "Knockout Round Playoffs" ? "KO Round" : stage;
      const headerHomeScoreColor = teamAggregateDisplay >= opponentAggregateDisplay ? "white" : "grey";
      const headerAwayScoreColor = opponentAggregateDisplay >= teamAggregateDisplay ? "white" : "grey";
      stageHeader.innerHTML = `
        ${stageDisplayName} - 
        <span style="color: ${headerHomeScoreColor};">${teamAggregateDisplay}</span> : 
        <span style="color: ${headerAwayScoreColor};">${opponentAggregateDisplay}</span>
      `;
      stageColumn.appendChild(stageHeader);
      
      // Sort matches by leg order (e.g., "Leg 1", "Leg 2")
      matchesByStage[stage]
        .sort((a, b) => {
          const legA = parseInt(a.stage.match(/Leg (\d+)/)?.[1] || 1, 10);
          const legB = parseInt(b.stage.match(/Leg (\d+)/)?.[1] || 1, 10);
          return legA - legB;
        })
        .forEach(match => {
          const homeTeamLogo = `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${match.homeTeam.id}.png`;
          const awayTeamLogo = `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${match.awayTeam.id}.png`;

          // Determine game state suffix
          const gameStateSuffix = match.competition.status.type.state === "post"
            ? " - Finished"
            : match.competition.status.type.state === "pre"
            ? " - Scheduled"
            : "";

          const gameCard = document.createElement("div");
          gameCard.className = "game-card";

          // Add click event for finished games
          if (match.competition.status.type.state === "post") {
            gameCard.style.cursor = "pointer";
            gameCard.addEventListener("click", () => {
              window.location.href = `scoreboard.html?gameId=${match.competition.id}`;
            });
          }

          const homeScoreColor = match.homeScore >= match.awayScore ? "white" : "grey";
          const awayScoreColor = match.awayScore >= match.homeScore ? "white" : "grey";

          gameCard.innerHTML = `
            <div class="game-stage">${match.stage}</div>
            <div class="game-time">${match.date}${gameStateSuffix}</div>
            <div class="matchup">
              <div class="team">
                <img src="${homeTeamLogo}" alt="${match.homeTeam.name}" class="card-team-logo">
                <div class="card-team-score" style="color: ${homeScoreColor};">${match.homeScore}</div>
              </div>
              <div class="team">
                <img src="${awayTeamLogo}" alt="${match.awayTeam.name}" class="card-team-logo">
                <div class="card-team-score" style="color: ${awayScoreColor};">${match.awayScore}</div>
              </div>
            </div>
          `;
          stageColumn.appendChild(gameCard);
        });

      // Append the stage column to the game cards row
      gameCardsRow.appendChild(stageColumn);
    });

    // Append the game cards row to the team container
    teamContainer.appendChild(gameCardsRow);

    // Append the team container to the main container
    container.appendChild(teamContainer);
  });
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
    button.className = `league-button ${currentUefaLeague === leagueData.code ? "active" : ""}`;
    button.innerHTML = `
      <span class="league-text">${leagueName}</span>
      <img class="league-logo" src="https://a.espncdn.com/i/leaguelogos/soccer/500-dark/${leagueData.logo}.png" alt="${leagueName}" style="display: none;">
    `;
    button.addEventListener("click", () => {
      currentUefaLeague = leagueData.code;
      localStorage.setItem("currentUefaLeague", currentUefaLeague);
      document.querySelectorAll(".league-button").forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");
      fetchPlayoffTeams();
    });

    leagueContainer.appendChild(button);
  }

  updateLeagueButtonDisplay();
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

function setupNavbarToggle() {
  const toggle = document.querySelector(".nav-toggle");
  const dropdownMenu = document.querySelector(".dropdown-menu");

  if (toggle && dropdownMenu) {
    toggle.addEventListener("click", () => {
      dropdownMenu.classList.toggle("active");
    });
  }
}

window.addEventListener("resize", updateLeagueButtonDisplay);

setupLeagueButtons();
setupNavbarToggle();
fetchPlayoffTeams();

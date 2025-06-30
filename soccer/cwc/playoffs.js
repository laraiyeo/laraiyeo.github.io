const LEAGUES = {
  "Club World Cup": { code: "fifa.cwc", logo: "19" },
};

let currentCWCLeague = localStorage.getItem("currentCWCLeague") || "fifa.cwc";
let lastPlayoffHash = null;

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
    const STANDINGS_URL = `https://cdn.espn.com/core/soccer/table?xhr=1&league=fifa.cwc`;
    const response = await fetch(STANDINGS_URL);
    const data = await response.json();
    return data.content.standings.groups || [];
  } catch (error) {
    console.error("Error fetching standings:", error);
    return [];
  }
}

function getMatchDateUTC(matchNumber) {
  // Convert the schedule dates to UTC format for API searching
  const matchDates = {
    // Round of 16
    49: "2025-06-28", // Winners of Group A vs. Runners of Group B
    50: "2025-06-28", // Winners of Group C vs. Runners of Group D
    51: "2025-06-29", // Winners of Group B vs. Runners of Group A
    52: "2025-06-29", // Winners of Group D vs. Runners of Group C
    53: "2025-06-30", // Winners of Group E vs. Runners of Group F
    54: "2025-06-30", // Winners of Group G vs. Runners of Group H
    55: "2025-07-01", // Winners of Group H vs. Runners of Group G
    56: "2025-07-01", // Winners of Group F vs. Runners of Group E
    // Quarterfinals
    57: "2025-07-04", // Winners of Match 53 vs. Winners of Match 54
    58: "2025-07-04", // Winners of Match 49 vs. Winners of Match 50
    59: "2025-07-05", // Winners of Match 51 vs. Winners of Match 52
    60: "2025-07-05", // Winners of Match 55 vs. Winners of Match 56
    // Semifinals
    61: "2025-07-08", // Winners of Match 57 vs. Winners of Match 58
    62: "2025-07-09", // Winners of Match 59 vs. Winners of Match 60
    // Final
    63: "2025-07-13"  // Winners of Match 61 vs. Winners of Match 62
  };
  
  return matchDates[matchNumber];
}

function getExpectedMatchup(matchNumber) {
  // Define expected matchups based on the schedule
  const matchups = {
    // Round of 16 - Left Conference (Groups A-D)
    49: { conference: "left", description: "Winners of Group A vs. Runners of Group B" },
    50: { conference: "left", description: "Winners of Group C vs. Runners of Group D" },
    51: { conference: "left", description: "Winners of Group B vs. Runners of Group A" },
    52: { conference: "left", description: "Winners of Group D vs. Runners of Group C" },
    // Round of 16 - Right Conference (Groups E-H)
    53: { conference: "right", description: "Winners of Group E vs. Runners of Group F" },
    54: { conference: "right", description: "Winners of Group G vs. Runners of Group H" },
    55: { conference: "right", description: "Winners of Group H vs. Runners of Group G" },
    56: { conference: "right", description: "Winners of Group F vs. Runners of Group E" },
    // Quarterfinals
    57: { conference: "left", description: "Winners of Match 53 vs. Winners of Match 54" },
    58: { conference: "left", description: "Winners of Match 49 vs. Winners of Match 50" },
    59: { conference: "right", description: "Winners of Match 51 vs. Winners of Match 52" },
    60: { conference: "right", description: "Winners of Match 55 vs. Winners of Match 56" },
    // Semifinals
    61: { conference: "left", description: "Winners of Match 57 vs. Winners of Match 58" },
    62: { conference: "right", description: "Winners of Match 59 vs. Winners of Match 60" },
    // Final
    63: { conference: "finals", description: "Winners of Match 61 vs. Winners of Match 62" }
  };
  
  return matchups[matchNumber];
}

function getTeamRank(teamId, standings) {
  for (const group of standings) {
    const entries = group.standings?.entries || [];
    const teamEntry = entries.find(entry => entry.team.id === teamId);
    if (teamEntry) {
      const rank = teamEntry.note?.rank || entries.indexOf(teamEntry) + 1;
      const groupLetter = group.name?.slice(-1); // Get last character (assumes format "Group A")
      return { rank, group: groupLetter };
    }
  }
  return { rank: null, group: null };
}

function getTeamRecord(teamId, games) {
  const wins = games.filter(game => {
    const competition = game.competitions[0];
    const team = competition.competitors.find(c => c.team.id === teamId);
    const opponent = competition.competitors.find(c => c.team.id !== teamId);
    
    if (competition.status.type.state !== "post") return false;
    
    const teamScore = parseInt(team.score || 0);
    const opponentScore = parseInt(opponent.score || 0);
    
    return teamScore > opponentScore;
  }).length;

  return wins.toString();
}

function getTeamScore(teamId, game) {
  const competition = game.competitions[0];
  const team = competition.competitors.find(c => c.team.id === teamId);
  return parseInt(team?.score || 0);
}

function getBracketLogo(team) {
  if (!team || !team.id || team.shortDisplayName?.toLowerCase() === "tbd") {
    return "../soccer-ball-png-24.png";
  }
  
  // Always return the soccer ball icon as fallback for any team without proper logo
  const logoUrl = `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`;
  
  // Create an image element to test if the logo exists
  const img = new Image();
  img.onerror = function() {
    // If the logo fails to load, this will be handled by the img tag's onerror in HTML
  };
  
  return logoUrl;
}

function generateTBAMatchups(standings) {
  // Get actual team names from standings for TBA matchups
  const getTeamByRankAndGroup = (rank, group) => {
    const groupData = standings.find(g => g.name?.slice(-1) === group);
    if (!groupData) return `${rank}${group}`;
    
    const entries = groupData.standings?.entries || [];
    const teamEntry = entries.find(entry => {
      const teamRank = entry.note?.rank || entries.indexOf(entry) + 1;
      return teamRank === rank;
    });
    
    return teamEntry ? teamEntry.team.shortDisplayName : `${rank}${group}`;
  };

  const tbaMatchups = {
    left: {
      "Round of 16": [
        { home: getTeamByRankAndGroup(1, 'A'), away: getTeamByRankAndGroup(2, 'B') }, // Match 49
        { home: getTeamByRankAndGroup(1, 'C'), away: getTeamByRankAndGroup(2, 'D') }, // Match 50
        { home: getTeamByRankAndGroup(1, 'E'), away: getTeamByRankAndGroup(2, 'F') }, // Match 53
        { home: getTeamByRankAndGroup(1, 'G'), away: getTeamByRankAndGroup(2, 'H') }  // Match 54
      ],
      "Quarterfinals": [
        { home: "Winner Match 49", away: "Winner Match 50" }, // Match 58
        { home: "Winner Match 53", away: "Winner Match 54" }  // Match 57
      ],
      "Semifinals": [
        { home: "Winner QF Left 1", away: "Winner QF Left 2" } // Match 61
      ]
    },
    right: {
      "Round of 16": [
        { home: getTeamByRankAndGroup(1, 'B'), away: getTeamByRankAndGroup(2, 'A') }, // Match 51
        { home: getTeamByRankAndGroup(1, 'D'), away: getTeamByRankAndGroup(2, 'C') }, // Match 52
        { home: getTeamByRankAndGroup(1, 'H'), away: getTeamByRankAndGroup(2, 'G') }, // Match 55
        { home: getTeamByRankAndGroup(1, 'F'), away: getTeamByRankAndGroup(2, 'E') }  // Match 56
      ],
      "Quarterfinals": [
        { home: "Winner Match 51", away: "Winner Match 52" }, // Match 59
        { home: "Winner Match 55", away: "Winner Match 56" }  // Match 60
      ],
      "Semifinals": [
        { home: "Winner QF Right 1", away: "Winner QF Right 2" } // Match 62
      ]
    },
    finals: [
      { home: "Winner Left SF", away: "Winner Right SF" } // Match 63
    ]
  };

  return tbaMatchups;
}

function groupGamesByConferenceAndRound(games, standings) {
  const rounds = {
    left: {
      "Round of 16": [],
      "Quarterfinals": [],
      "Semifinals": []
    },
    right: {
      "Round of 16": [],
      "Quarterfinals": [],
      "Semifinals": []
    },
    finals: []
  };

  // First, organize games by match number
  const gamesByMatch = {};

  games.forEach(game => {
    const competition = game.competitions?.[0];
    if (!competition) return;

    // Get team names directly from competition competitors like live.js does
    const homeTeam = competition.competitors.find(c => c.homeAway === "home")?.team;
    const awayTeam = competition.competitors.find(c => c.homeAway === "away")?.team;
    
    if (!homeTeam || !awayTeam) return;

    // Add ranking information from standings
    const homeRankInfo = getTeamRank(homeTeam.id, standings);
    const awayRankInfo = getTeamRank(awayTeam.id, standings);
    
    homeTeam.rank = homeRankInfo.rank;
    homeTeam.groupLetter = homeRankInfo.group;
    awayTeam.rank = awayRankInfo.rank;
    awayTeam.groupLetter = awayRankInfo.group;

    // Parse game date and time more carefully for timezone conversion
    const gameDate = new Date(game.date);
    const gameUTCDate = gameDate.toISOString().split('T')[0];
    const gameUTCHour = gameDate.getUTCHours();
    
    // Convert to ET to determine the actual game date in ET timezone
    const gameET = new Date(gameDate.getTime() - (5 * 60 * 60 * 1000));
    const gameETDate = gameET.toISOString().split('T')[0];
    
    let matchNumber = null;
    
    // Use ET date for matching since the schedule is in ET
    if (gameETDate === "2025-06-28") {
      matchNumber = gameUTCHour < 20 ? 49 : 50;
    } else if (gameETDate === "2025-06-29") {
      matchNumber = gameUTCHour < 20 ? 51 : 52;
    } else if (gameETDate === "2025-06-30") {
      matchNumber = (gameUTCDate === "2025-06-30" || gameUTCHour < 23) ? 53 : 54;
    } else if (gameETDate === "2025-07-01") {
      if (gameUTCDate === "2025-07-01") {
        matchNumber = gameUTCHour < 23 ? 55 : 56;
      } else if (gameUTCDate === "2025-07-02" && gameUTCHour === 1) {
        matchNumber = 56;
      }
    } else if (gameETDate === "2025-07-04") {
      if (gameUTCDate === "2025-07-04") {
        matchNumber = gameUTCHour < 23 ? 57 : 58;
      } else if (gameUTCDate === "2025-07-05" && gameUTCHour === 1) {
        matchNumber = 58;
      }
    } else if (gameETDate === "2025-07-05") {
      matchNumber = gameUTCHour < 20 ? 59 : 60;
    } else if (gameETDate === "2025-07-08") {
      matchNumber = 61;
    } else if (gameETDate === "2025-07-09") {
      matchNumber = 62;
    } else if (gameETDate === "2025-07-13") {
      matchNumber = 63;
    }

    if (!matchNumber) return;

    if (!gamesByMatch[matchNumber]) {
      gamesByMatch[matchNumber] = [];
    }
    gamesByMatch[matchNumber].push(game);
  });

  // Now organize by specific match numbers for each side
  // Left side: Matches 49, 50, 53, 54
  const leftRoundOf16Matches = [49, 50, 53, 54];
  leftRoundOf16Matches.forEach(matchNum => {
    if (gamesByMatch[matchNum]) {
      rounds.left["Round of 16"].push(...gamesByMatch[matchNum]);
    }
  });

  // Right side: Matches 51, 52, 55, 56  
  const rightRoundOf16Matches = [51, 52, 55, 56];
  rightRoundOf16Matches.forEach(matchNum => {
    if (gamesByMatch[matchNum]) {
      rounds.right["Round of 16"].push(...gamesByMatch[matchNum]);
    }
  });

  // Quarterfinals organization (unchanged)
  if (gamesByMatch[58]) rounds.left["Quarterfinals"].push(...gamesByMatch[58]);
  if (gamesByMatch[57]) rounds.left["Quarterfinals"].push(...gamesByMatch[57]);
  if (gamesByMatch[59]) rounds.right["Quarterfinals"].push(...gamesByMatch[59]);
  if (gamesByMatch[60]) rounds.right["Quarterfinals"].push(...gamesByMatch[60]);

  // Semifinals organization (unchanged)
  if (gamesByMatch[61]) rounds.left["Semifinals"].push(...gamesByMatch[61]);
  if (gamesByMatch[62]) rounds.right["Semifinals"].push(...gamesByMatch[62]);

  // Finals (unchanged)
  if (gamesByMatch[63]) rounds.finals.push(...gamesByMatch[63]);

  return rounds;
}

async function fetchAndUpdateBracket() {
  try {
    // Fetch games from a broader date range to ensure we get all knockout games
    const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.cwc/scoreboard?dates=20250626-20250715`;

    const response = await fetch(SCOREBOARD_API_URL);
    const text = await response.text();
    const newHash = hashString(text);

    if (newHash === lastPlayoffHash) {
      return;
    }

    lastPlayoffHash = newHash;
    const data = JSON.parse(text);
    const games = data.events || [];

    console.log("Fetched games:", games.length); // Debug log

    const bracketContainer = document.getElementById("bracketContainer");
    if (!bracketContainer) {
      console.error("Bracket container not found.");
      return;
    }
    
    const standings = await fetchStandings();
    console.log("Fetched standings:", standings.length); // Debug log
    
    const tempContainer = document.createElement("div");
    tempContainer.className = "bracket-container";
    await renderBracket(games, standings, tempContainer);

    if (bracketContainer.innerHTML !== tempContainer.innerHTML) {
      bracketContainer.innerHTML = tempContainer.innerHTML;
    }
  } catch (error) {
    console.error("Error fetching bracket data:", error);
  }
}

function groupGamesByMatchup(games, standings) {
  const matchups = {};
  
  games.forEach(game => {
    const competition = game.competitions?.[0];
    if (!competition) return;

    // Get team names directly from competition competitors like live.js does
    const homeTeam = competition.competitors.find(c => c.homeAway === "home")?.team;
    const awayTeam = competition.competitors.find(c => c.homeAway === "away")?.team;

    if (!homeTeam || !awayTeam) {
      console.warn("Missing team data for game:", game);
      return;
    }

    // Add ranking information from standings
    const homeRankInfo = getTeamRank(homeTeam.id, standings);
    const awayRankInfo = getTeamRank(awayTeam.id, standings);
    
    homeTeam.rank = homeRankInfo.rank;
    homeTeam.groupLetter = homeRankInfo.group;
    awayTeam.rank = awayRankInfo.rank;
    awayTeam.groupLetter = awayRankInfo.group;

    // Create unique matchup key
    const matchupKey = [homeTeam.id, awayTeam.id].sort().join("-");

    if (!matchups[matchupKey]) {
      matchups[matchupKey] = { homeTeam, awayTeam, games: [] };
    }
    matchups[matchupKey].games.push(game);
  });

  return Object.values(matchups);
}

async function renderBracket(games, standings, container) {
  if (!container) {
    container = document.getElementById("bracketContainer");
    if (!container) {
      console.error("Bracket container not found.");
      return;
    }
  }
  container.innerHTML = "";
  container.className = "bracket-container";

  const rounds = groupGamesByConferenceAndRound(games, standings);
  const tbaMatchups = generateTBAMatchups(standings);

  // Check if mobile layout is needed
  const isMobile = window.innerWidth < 525;

  const renderRoundColumn = (roundGames, roundName, conferenceClass, conferenceName) => {
    const roundDiv = document.createElement("div");
    roundDiv.className = `bracket-round ${conferenceClass}`;

    // Only add round title for desktop
    if (!isMobile) {
      const roundTitle = document.createElement("h3");
      roundTitle.className = "round-title";
      roundTitle.textContent = roundName;
      roundDiv.appendChild(roundTitle);
    }

    const matchups = roundGames.length > 0 ? groupGamesByMatchup(roundGames, standings) : [];
    const tbaData = tbaMatchups[conferenceName] ? tbaMatchups[conferenceName][roundName] || [] : tbaMatchups[roundName] || [];

    // Show TBA cards for empty rounds
    if (matchups.length === 0 && tbaData.length > 0) {
      tbaData.forEach((matchup, index) => {
        const tbaCard = document.createElement("div");
        tbaCard.className = "bracket-row tba-card";

        // Adjusted spacing for proper positioning (desktop only)
        if (!isMobile) {
          if (roundName === "Quarterfinals") {
            tbaCard.style.marginTop = index === 0 ? "80px" : "120px";
          } else if (roundName === "Semifinals") {
            tbaCard.style.marginTop = "140px";
          } else if (roundName === "Final") {
            tbaCard.style.marginTop = "180px";
          }
        }

        if (roundName === "Final") {
          if (isMobile) {
            tbaCard.innerHTML = `
              <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                <div style="font-size: 14px; font-weight: bold; text-align: center;">CWC FINAL</div>
                <div style="display: flex; justify-content: space-around; width: 100%;">
                  <div style="text-align: center;">
                    <img src="../soccer-ball-png-24.png" alt="TBD" style="width: 30px; height: 30px;" onerror="this.src='../soccer-ball-png-24.png'">
                    <div style="font-size: 12px; margin-top: 5px;">TBD</div>
                  </div>
                  <div style="text-align: center;">
                    <img src="../soccer-ball-png-24.png" alt="TBD" style="width: 30px; height: 30px;" onerror="this.src='../soccer-ball-png-24.png'">
                    <div style="font-size: 12px; margin-top: 5px;">TBD</div>
                  </div>
                </div>
              </div>
            `;
          } else {
            tbaCard.innerHTML = `
              <div class="finals-title">CLUB WORLD CUP FINAL</div>
              <div class="finals-matchup">
                <div class="team-column">
                  <div class="record">-</div>
                  <div class="team-line">
                    <span class="abbrev">${matchup.home}</span>
                  </div>
                </div>
                <div class="vs">vs</div>
                <div class="team-column">
                  <div class="record">-</div>
                  <div class="team-line">
                    <span class="abbrev">${matchup.away}</span>
                  </div>
                </div>
              </div>
            `;
          }
        } else {
          if (isMobile) {
            tbaCard.innerHTML = `
              <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                <img src="../soccer-ball-png-24.png" alt="TBD" style="width: 30px; height: 30px;" onerror="this.src='../soccer-ball-png-24.png'">
                <div style="text-align: center; font-size: 12px;">TBD vs TBD</div>
              </div>
            `;
          } else {
            tbaCard.innerHTML = `
              <div class="series-info">${roundName} - Match ${index + 1}</div>
              <div class="team-row">
                <img src="../soccer-ball-png-24.png" alt="TBD" class="team-logo-small" onerror="this.src='../soccer-ball-png-24.png'">
                <span class="team-name">${matchup.home}</span>
                <span class="team-record">-</span>
              </div>
              <div class="team-row">
                <img src="../soccer-ball-png-24.png" alt="TBD" class="team-logo-small" onerror="this.src='../soccer-ball-png-24.png'">
                <span class="team-name">${matchup.away}</span>
                <span class="team-record">-</span>
              </div>
            `;
          }
        }

        roundDiv.appendChild(tbaCard);
      });
    } else {
      // Show actual matchups
      matchups.forEach((matchup, index) => {
        let { homeTeam, awayTeam, games: matchupGames } = matchup;

        const homeRecord = getTeamRecord(homeTeam.id, matchupGames);
        const awayRecord = getTeamRecord(awayTeam.id, matchupGames);

        const mostRecentGame = matchupGames.sort((a, b) => new Date(b.date) - new Date(a.date))[0];

        // For quarterfinals, control team positioning based on match structure
        if (roundName === "Quarterfinals") {
          // Identify which teams should be on left vs right based on bracket flow
          const gameDate = new Date(mostRecentGame.date);
          const gameETDate = new Date(gameDate.getTime() - (5 * 60 * 60 * 1000)).toISOString().split('T')[0];
          const gameUTCDate = gameDate.toISOString().split('T')[0]; // Add this line to define gameUTCDate
          
          // For match 59 (July 5th): Winner of 51 on left, Winner of 52 on right
          if (gameETDate === "2025-07-05") {
            // Don't swap teams for match 59 - keep original order from API
            // homeTeam should be winner of match 51, awayTeam should be winner of match 52
          } else if (gameETDate === "2025-07-04") {
            // For match 57 and 58 on July 4th - need to determine which is which
            // Check if this is match 57 (Winners of Match 53 vs Winners of Match 54)
            // We can identify this by checking team rankings or other identifiers
            // For match 57, force swap so Match 54 winner is on top
            const gameHour = new Date(mostRecentGame.date).getUTCHours();
            if (gameHour >= 23 || gameUTCDate === "2025-07-05") {
              // This is likely match 57 (later game) - force swap
              [awayTeam, homeTeam] = [awayTeam, homeTeam];
            } else {
              // This is likely match 58 (earlier game) - use rank-based sorting
              if (homeTeam.rank > awayTeam.rank) {
                [awayTeam, homeTeam] = [awayTeam, homeTeam];
              }
            }
          } else {
            // For other quarterfinal matches, ensure the team with the lower rank is on top
            if (homeTeam.rank > awayTeam.rank) {
              [homeTeam, awayTeam] = [awayTeam, homeTeam];
            }
          }
        } else {
          // For all other rounds, ensure the team with the lower rank (higher seed) is on top
          if (homeTeam.rank > awayTeam.rank) {
            [homeTeam, awayTeam] = [awayTeam, homeTeam];
          }
        }

        const homeScore = getTeamScore(homeTeam.id, mostRecentGame);
        const awayScore = getTeamScore(awayTeam.id, mostRecentGame);

        const homeAbbrev = homeTeam.shortDisplayName || "TBD";
        const awayAbbrev = awayTeam.shortDisplayName || "TBD";

        const homeLogo = getBracketLogo(homeTeam);
        const awayLogo = getBracketLogo(awayTeam);

        const homeWins = parseInt(homeRecord);
        const awayWins = parseInt(awayRecord);

        const homeIsWinner = homeWins > awayWins;
        const awayIsWinner = awayWins > homeWins;
        const tied = homeWins === awayWins;

        const gameStatus = mostRecentGame?.competitions?.[0]?.status?.type?.state || "pre";

        let seriesInfo = "";
        if (gameStatus === "post") {
          if (homeIsWinner) {
            seriesInfo = `${homeAbbrev} advances`;
          } else if (awayIsWinner) {
            seriesInfo = `${awayAbbrev} advances`;
          } else {
            seriesInfo = `Match completed`;
          }
        } else if (gameStatus === "in") {
          seriesInfo = `Match in progress`;
        } else {
          seriesInfo = `Match scheduled`;
        }

        const matchupRow = document.createElement("div");
        matchupRow.className = "bracket-row";
        
        // Add game ID as data attribute for event delegation
        if (mostRecentGame && mostRecentGame.id && (gameStatus === "post" || gameStatus === "in")) {
          matchupRow.dataset.gameId = mostRecentGame.id;
          matchupRow.style.cursor = "pointer";
        }

        // Adjusted spacing for proper positioning (desktop only)
        if (!isMobile) {
          if (roundName === "Quarterfinals") {
            matchupRow.style.marginTop = index === 0 ? "80px" : "210px";
          } else if (roundName === "Semifinals") {
            matchupRow.style.marginTop = "260px";
          } else if (roundName === "Round of 16") {
            matchupRow.style.marginTop = index === 2 ? "50px" : "10px";
          }
        }

        if (roundName === "Final") {
          if (isMobile) {
            // Mobile finals layout
            matchupRow.innerHTML = `
              <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                <div style="font-size: 14px; font-weight: bold; text-align: center; color: black;">CWC FINAL</div>
                <div style="display: flex; justify-content: space-around; width: 100%;">
                  <div style="text-align: center;">
                    <img src="${homeLogo}" alt="${homeAbbrev}" style="width: 30px; height: 30px;" onerror="this.src='../soccer-ball-png-24.png'">
                    <div style="font-size: 12px; margin-top: 5px; font-weight: bold; color: ${homeScore > awayScore ? '#43a047' : '#333'};">${homeTeam.abbreviation}</div>
                    <div style="font-size: 16px; font-weight: bold; color: ${homeScore > awayScore ? '#43a047' : '#333'};">${homeScore}</div>
                  </div>
                  <div style="text-align: center;">
                    <img src="${awayLogo}" alt="${awayAbbrev}" style="width: 30px; height: 30px;" onerror="this.src='../soccer-ball-png-24.png'">
                    <div style="font-size: 12px; margin-top: 5px; font-weight: bold; color: ${awayScore > homeScore ? '#43a047' : '#333'};">${awayTeam.abbreviation}</div>
                    <div style="font-size: 16px; font-weight: bold; color: ${awayScore > homeScore ? '#43a047' : '#333'};">${awayScore}</div>
                  </div>
                </div>
              </div>
            `;

            // Add glow for winner (mobile)
            let winnerId = null;
            if (homeScore > awayScore) {
              winnerId = homeTeam.id;
            } else if (awayScore > homeScore) {
              winnerId = awayTeam.id;
            }

            if (winnerId) {
              const { r, g, b } = getTeamColorRGB(winnerId === homeTeam.id ? homeTeam : awayTeam);
              matchupRow.style.boxShadow = `0 0 8px rgba(${r}, ${g}, ${b}, 0.8)`;
            }
          } else {
            // Desktop finals layout
            matchupRow.className = "bracket-row finals";
            matchupRow.innerHTML = `
              <div class="finals-title">CLUB WORLD CUP FINAL</div>
              <div class="series-info">${seriesInfo}</div>
              <div class="finals-matchup">
                <img src="${homeLogo}" alt="${homeAbbrev}" style="width: 40px; height: 40px; margin-right: -10px;" onerror="this.src='../soccer-ball-png-24.png'">
                <div class="team-column">
                  <div class="record" style="${tied ? "" : homeIsWinner ? "" : "color: grey;"}">${homeScore}</div>
                  <div class="team-line">
                    <span class="abbrev" style="${tied ? "" : homeIsWinner ? "" : "color: grey;"}">${homeAbbrev}</span>
                  </div>
                </div>
                <div class="vs">vs</div>
                <div class="team-column">
                  <div class="record" style="${tied ? "" : awayIsWinner ? "" : "color: grey;"}">${awayScore}</div>
                  <div class="team-line">
                    <span class="abbrev" style="${tied ? "" : awayIsWinner ? "" : "color: grey;"}">${awayAbbrev}</span>
                  </div>
                </div>
                <img src="${awayLogo}" alt="${awayAbbrev}" style="width: 40px; height: 40px; margin-left: -10px;" onerror="this.src='../soccer-ball-png-24.png'">
              </div>
            `;
          }
          
          // Add click event for Finals games before the return
          if (gameStatus === "post" || gameStatus === "in") {
            matchupRow.style.cursor = "pointer";
            matchupRow.addEventListener("click", () => {
              console.log(`Navigating to Finals scoreboard for game ID: ${mostRecentGame.id}`);
              window.location.href = `scoreboard.html?gameId=${mostRecentGame.id}`;
            });
          }
          
          roundDiv.appendChild(matchupRow);
          return;
        }

        // Add winning team box shadow with team color using RGB like NBA bracket
        if (homeIsWinner && gameStatus === "post") {
          const { r, g, b } = getTeamColorRGB(homeTeam);
          matchupRow.style.boxShadow = `0 0 8px rgba(${r}, ${g}, ${b}, 0.8)`;
        } else if (awayIsWinner && gameStatus === "post") {
          const { r, g, b } = getTeamColorRGB(awayTeam);
          matchupRow.style.boxShadow = `0 0 8px rgba(${r}, ${g}, ${b}, 0.8)`;
        }

        if (isMobile) {
          // Mobile layout for non-finals
          matchupRow.innerHTML = `
            <div style="display: flex; justify-content: space-around; align-items: center; width: 100%; gap: 20px;">
              <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                <img src="${homeLogo}" alt="${homeAbbrev}" style="width: 30px; height: 30px;" onerror="this.src='../soccer-ball-png-24.png'">
                <div style="text-align: center; font-size: 12px; color: #000; font-weight: bold; ${homeIsWinner ? 'color: #43a047;' : ''}">${homeTeam.abbreviation}</div>
                <div style="text-align: center; font-size: 16px; font-weight: bold; color: ${homeScore > awayScore ? '#43a047' : '#333'};">${homeScore}</div>
              </div>
              <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                <img src="${awayLogo}" alt="${awayAbbrev}" style="width: 30px; height: 30px;" onerror="this.src='../soccer-ball-png-24.png'">
                <div style="text-align: center; font-size: 12px; color: #000; font-weight: bold; ${awayIsWinner ? 'color: #43a047;' : ''}">${awayTeam.abbreviation}</div>
                <div style="text-align: center; font-size: 16px; font-weight: bold; color: ${awayScore > homeScore ? '#43a047' : '#333'};">${awayScore}</div>
              </div>
            </div>
          `;
        } else {
          // Desktop layout for non-finals
          const homeStyle = gameStatus === 'post' ? (tied ? "" : homeIsWinner ? "" : "color: grey;") : "";
          const awayStyle = gameStatus === 'post' ? (tied ? "" : awayIsWinner ? "" : "color: grey;") : "";
          const recordHomeStyle = tied ? "" : homeIsWinner ? "" : "color: grey;";
          const recordAwayStyle = tied ? "" : awayIsWinner ? "" : "color: grey;";
          
          matchupRow.innerHTML = `
            <div class="series-info">${seriesInfo}</div>
            <div class="team-row">
              <img src="${homeLogo}" alt="${homeAbbrev}" class="team-logo-small" onerror="this.src='../soccer-ball-png-24.png'">
              <span class="team-name" style="${homeStyle}">${homeAbbrev}</span>
              <span class="team-record" style="${recordHomeStyle}">${homeScore}</span>
            </div>
            <div class="team-row">
              <img src="${awayLogo}" alt="${awayAbbrev}" class="team-logo-small" onerror="this.src='../soccer-ball-png-24.png'">
              <span class="team-name" style="${awayStyle}">${awayAbbrev}</span>
              <span class="team-record" style="${recordAwayStyle}">${awayScore}</span>
            </div>
          `;
        }

        // Add click event for completed or live games (non-Finals) AFTER innerHTML is set
        if (gameStatus === "post" || gameStatus === "in") {
          matchupRow.style.cursor = "pointer";
          matchupRow.addEventListener("click", () => {
            console.log(`Navigating to scoreboard for game ID: ${mostRecentGame.id}`);
            window.location.href = `scoreboard.html?gameId=${mostRecentGame.id}`;
          });
        }

        roundDiv.appendChild(matchupRow);
      });
    }

    return roundDiv;
  };

  if (isMobile) {
    // Mobile layout: 4-2-1-1-2-4 column arrangement
    const mobileContainer = document.createElement("div");
    mobileContainer.className = "mobile-bracket-container";
    
    const leftR16Games = rounds.left["Round of 16"];
    const rightR16Games = rounds.right["Round of 16"];
    
    // Group games by matchup
    const leftR16Matchups = leftR16Games.length > 0 ? groupGamesByMatchup(leftR16Games, standings) : [];
    const rightR16Matchups = rightR16Games.length > 0 ? groupGamesByMatchup(rightR16Games, standings) : [];
    const leftQFMatchups = rounds.left["Quarterfinals"].length > 0 ? groupGamesByMatchup(rounds.left["Quarterfinals"], standings) : [];
    const rightQFMatchups = rounds.right["Quarterfinals"].length > 0 ? groupGamesByMatchup(rounds.right["Quarterfinals"], standings) : [];
    
    // Column 1: 4 Left R16 games
    const leftR16Column = document.createElement("div");
    leftR16Column.className = "mobile-row r16-row";
    
    for (let i = 0; i < 4; i++) {
      if (leftR16Matchups[i]) {
        const gameColumn = renderRoundColumn([leftR16Matchups[i].games[0]], "Round of 16", "mobile-r16", "left");
        leftR16Column.appendChild(gameColumn);
      } else {
        const tbaColumn = renderRoundColumn([], "Round of 16", "mobile-r16", "left");
        leftR16Column.appendChild(tbaColumn);
      }
    }
    
    // Column 2: 2 Left QF games
    const leftQFColumn = document.createElement("div");
    leftQFColumn.className = "mobile-row qf-row";
    
    for (let i = 0; i < 2; i++) {
      if (leftQFMatchups[i]) {
        const gameColumn = renderRoundColumn([leftQFMatchups[i].games[0]], "Quarterfinals", "mobile-qf", "left");
        leftQFColumn.appendChild(gameColumn);
      } else {
        const tbaColumn = renderRoundColumn([], "Quarterfinals", "mobile-qf", "left");
        leftQFColumn.appendChild(tbaColumn);
      }
    }
    
    // Column 3: 1 Left SF game
    const leftSFColumn = document.createElement("div");
    leftSFColumn.className = "mobile-column";
    
    const leftSF = renderRoundColumn(rounds.left["Semifinals"], "Semifinals", "mobile-sf", "left");
    leftSFColumn.appendChild(leftSF);
    
    // Column 4: 1 Final game (center)
    const finalsColumn = document.createElement("div");
    finalsColumn.className = "mobile-column";
    
    const finals = renderRoundColumn(rounds.finals, "Final", "mobile-finals", "finals");
    finalsColumn.appendChild(finals);
    
    // Column 5: 1 Right SF game
    const rightSFColumn = document.createElement("div");
    rightSFColumn.className = "mobile-column";
    
    const rightSF = renderRoundColumn(rounds.right["Semifinals"], "Semifinals", "mobile-sf", "right");
    rightSFColumn.appendChild(rightSF);
    
    // Column 6: 2 Right QF games
    const rightQFColumn = document.createElement("div");
    rightQFColumn.className = "mobile-row qf-row";
    
    for (let i = 0; i < 2; i++) {
      if (rightQFMatchups[i]) {
        const gameColumn = renderRoundColumn([rightQFMatchups[i].games[0]], "Quarterfinals", "mobile-qf", "right");
        rightQFColumn.appendChild(gameColumn);
      } else {
        const tbaColumn = renderRoundColumn([], "Quarterfinals", "mobile-qf", "right");
        rightQFColumn.appendChild(tbaColumn);
      }
    }
    
    // Column 7: 4 Right R16 games
    const rightR16Column = document.createElement("div");
    rightR16Column.className = "mobile-row r16-row";
    
    for (let i = 0; i < 4; i++) {
      if (rightR16Matchups[i]) {
        const gameColumn = renderRoundColumn([rightR16Matchups[i].games[0]], "Round of 16", "mobile-r16", "right");
        rightR16Column.appendChild(gameColumn);
      } else {
        const tbaColumn = renderRoundColumn([], "Round of 16", "mobile-r16", "right");
        rightR16Column.appendChild(tbaColumn);
      }
    }
    
    // Append all columns to container in order: 4-2-1-1-2-4
    mobileContainer.appendChild(leftR16Column);
    mobileContainer.appendChild(leftQFColumn);
    mobileContainer.appendChild(leftSFColumn);
    mobileContainer.appendChild(finalsColumn);
    mobileContainer.appendChild(rightSFColumn);
    mobileContainer.appendChild(rightQFColumn);
    mobileContainer.appendChild(rightR16Column);
    
    container.appendChild(mobileContainer);
  } else {
    // Desktop layout (existing code)
    const renderConferenceRounds = (conferenceRounds, conferenceClass, conferenceTitle, conferenceName) => {
      const conferenceDiv = document.createElement("div");
      conferenceDiv.className = `conference ${conferenceClass}`;

      const roundsContainer = document.createElement("div");
      roundsContainer.className = "rounds-container";

      // Add rounds in the order that matches NBA layout
      if (conferenceClass === "left-conference") {
        // Left side: Round of 16, Quarterfinals, Semifinals (left to right)
        roundsContainer.appendChild(renderRoundColumn(conferenceRounds["Round of 16"], "Round of 16", conferenceClass, conferenceName));
        roundsContainer.appendChild(renderRoundColumn(conferenceRounds["Quarterfinals"], "Quarterfinals", conferenceClass, conferenceName));
        roundsContainer.appendChild(renderRoundColumn(conferenceRounds["Semifinals"], "Semifinals", conferenceClass, conferenceName));
      } else {
        // Right side: Semifinals, Quarterfinals, Round of 16 (left to right)
        roundsContainer.appendChild(renderRoundColumn(conferenceRounds["Semifinals"], "Semifinals", conferenceClass, conferenceName));
        roundsContainer.appendChild(renderRoundColumn(conferenceRounds["Quarterfinals"], "Quarterfinals", conferenceClass, conferenceName));
        roundsContainer.appendChild(renderRoundColumn(conferenceRounds["Round of 16"], "Round of 16", conferenceClass, conferenceName));
      }

      conferenceDiv.appendChild(roundsContainer);
      return conferenceDiv;
    };

    // Create left conference (Groups A, B, C, D) - without the title
    const leftConference = renderConferenceRounds(rounds.left, "left-conference", "", "left");
    
    // Create finals column
    const finalsDiv = document.createElement("div");
    finalsDiv.className = "conference finals-conference";
    const finalsColumn = renderRoundColumn(rounds.finals, "Final", "finals", "finals");
    finalsDiv.appendChild(finalsColumn);

    // Create right conference (Groups E, F, G, H) - without the title
    const rightConference = renderConferenceRounds(rounds.right, "right-conference", "", "right");

    // Append in NBA-style order: Left Conference, Finals, Right Conference
    container.appendChild(leftConference);
    container.appendChild(finalsDiv);
    container.appendChild(rightConference);
  }
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

// Add event delegation for bracket clicks
function setupBracketClickHandlers() {
  const bracketContainer = document.getElementById("bracketContainer");
  if (bracketContainer) {
    bracketContainer.addEventListener("click", (e) => {
      // Find the closest bracket-row element
      const matchupRow = e.target.closest(".bracket-row");
      if (matchupRow && matchupRow.dataset.gameId) {
        console.log(`Navigating to scoreboard for game ID: ${matchupRow.dataset.gameId}`);
        window.location.href = `scoreboard.html?gameId=${matchupRow.dataset.gameId}`;
      }
    });
  }
}

setupNavbarToggle();
setupBracketClickHandlers();
fetchAndUpdateBracket();
setInterval(fetchAndUpdateBracket, 2000);

function getTeamColor(team) {
  if (!team || !team.color) return "#00c800"; // Default green fallback
  
  // Use alternate color for specific teams like in teams.js
  if (["2950", "3243", "435", "929"].includes(team.id)) {
    return `#${team.alternateColor}`;
  }
  return `#${team.color}`;
}

function getTeamColorRGB(team) {
  const color = getTeamColor(team).replace('#', '');
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  return { r, g, b };
}
const LEAGUES = {
  "Champions League": { code: "uefa.champions", logo: "2" },
  "Europa League": { code: "uefa.europa", logo: "2310" },
  "Europa Conference League": { code: "uefa.europa.conf", logo: "20296" },
};

let currentUefaLeague = localStorage.getItem("currentUefaLeague") || "uefa.champions";
let lastBracketHash = null;
let showingKnockoutView = true; // Track which view is currently shown

// Add caching variables
let cachedStandings = null;
let cachedQuarterfinals = null;
let cachedSemifinals = null;
let cachedFinals = null;
let cachedRoundOf16 = null;
let lastStandingsCache = 0;
let lastMatchupsCache = 0;
const CACHE_DURATION = 30000; // 30 seconds cache

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
    // Use cache if available and recent
    const now = Date.now();
    if (cachedStandings && (now - lastStandingsCache) < CACHE_DURATION) {
      return cachedStandings;
    }

    const STANDINGS_URL = `https://cdn.espn.com/core/soccer/table?xhr=1&league=${currentUefaLeague}`;
    const response = await fetch(STANDINGS_URL);
    const data = await response.json();
    
    cachedStandings = data.content.standings.groups[0].standings.entries || [];
    lastStandingsCache = now;
    return cachedStandings;
  } catch (error) {
    console.error("Error fetching standings:", error);
    return cachedStandings || [];
  }
}

function getTeamRank(teamId, standings) {
  const teamEntry = standings.find(entry => entry.team.id === teamId);
  return teamEntry?.note?.rank || teamEntry?.team.rank || null;
}

async function fetchKnockoutPlayoffs() {
  try {
    // Ensure we have a valid league set
    if (!currentUefaLeague || !Object.values(LEAGUES).some(league => league.code === currentUefaLeague)) {
      currentUefaLeague = "uefa.champions";
      localStorage.setItem("currentUefaLeague", currentUefaLeague);
    }

    const currentYear = new Date().getFullYear();
    const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${currentYear}0101`;

    const calendarResponse = await fetch(CALENDAR_API_URL);
    const calendarText = await calendarResponse.text();
    const newHash = hashString(calendarText);

    if (newHash === lastBracketHash) {
      console.log("No changes detected in knockout data.");
      return;
    }
    lastBracketHash = newHash;

    const calendarData = JSON.parse(calendarText);

    // Find the Knockout Round Playoffs stage
    const knockoutStage = calendarData.leagues?.[0]?.calendar?.[0]?.entries.find(e => 
      e.label === "Knockout Round Playoffs"
    );

    if (!knockoutStage) {
      console.log("Knockout Round Playoffs not found in calendar.");
      return;
    }

    const dates = `${knockoutStage.startDate.split("T")[0].replace(/-/g, "")}-${knockoutStage.endDate.split("T")[0].replace(/-/g, "")}`;
    const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${dates}`;
    
    const scoreboardResponse = await fetch(SCOREBOARD_API_URL);
    const scoreboardData = await scoreboardResponse.json();
    const events = scoreboardData.events || [];

    // Get standings for team rankings
    const standings = await fetchStandings();

    // Group matches by pairing
    const pairings = groupMatchesByPairing(events, standings);
    
    renderKnockoutBracket(pairings);

  } catch (error) {
    console.error("Error fetching knockout playoffs:", error);
  }
}

function groupMatchesByPairing(events, standings) {
  const matchups = {};

  events.forEach(event => {
    const competition = event.competitions?.[0];
    if (!competition) return;

    const homeTeam = competition.competitors.find(c => c.homeAway === "home")?.team;
    const awayTeam = competition.competitors.find(c => c.homeAway === "away")?.team;
    
    if (!homeTeam || !awayTeam) return;

    // Get team rankings
    const homeRank = getTeamRank(homeTeam.id, standings);
    const awayRank = getTeamRank(awayTeam.id, standings);

    homeTeam.rank = homeRank;
    awayTeam.rank = awayRank;

    // Create unique matchup key based on team IDs
    const matchupKey = [homeTeam.id, awayTeam.id].sort().join("-");

    if (!matchups[matchupKey]) {
      const sortedTeams = [homeTeam, awayTeam].sort((a, b) => a.id.localeCompare(b.id));
      matchups[matchupKey] = {
        homeTeam: sortedTeams[0],
        awayTeam: sortedTeams[1],
        matches: [],
        aggregateHome: 0,
        aggregateAway: 0
      };
    }

    const homeScore = parseInt(competition.competitors.find(c => c.homeAway === "home")?.score || 0);
    const awayScore = parseInt(competition.competitors.find(c => c.homeAway === "away")?.score || 0);
    const homeShootoutScore = parseInt(competition.competitors.find(c => c.homeAway === "home")?.shootoutScore || 0);
    const awayShootoutScore = parseInt(competition.competitors.find(c => c.homeAway === "away")?.shootoutScore || 0);

    matchups[matchupKey].matches.push({
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      homeShootoutScore,
      awayShootoutScore,
      leg: competition.leg?.value || 1,
      status: competition.status.type.state,
      gameId: event.id,
      date: new Date(event.date).toLocaleDateString()
    });

    // Update aggregate scores correctly - add scores for each specific team
    if (competition.status.type.state === "post") {
      // Find which team in the matchup corresponds to home/away in this specific game
      const matchupHomeTeam = matchups[matchupKey].homeTeam;
      const matchupAwayTeam = matchups[matchupKey].awayTeam;
      
      if (homeTeam.id === matchupHomeTeam.id) {
        // Current game's home team is matchup's home team
        matchups[matchupKey].aggregateHome += homeScore;
        matchups[matchupKey].aggregateAway += awayScore;
      } else {
        // Current game's home team is matchup's away team
        matchups[matchupKey].aggregateHome += awayScore;
        matchups[matchupKey].aggregateAway += homeScore;
      }
    }
  });

  // Convert to array and determine pairings based on rankings
  const matchupArray = Object.values(matchups);
  
  // Sort and assign to pairings based on ranking patterns
  const pairings = {
    "Pairing I": [],
    "Pairing II": [],
    "Pairing III": [],
    "Pairing IV": []
  };

  matchupArray.forEach(matchup => {
    const ranks = [matchup.homeTeam.rank, matchup.awayTeam.rank].sort((a, b) => a - b);
    
    // Assign based on typical UEFA playoff pairings - each pairing can have 2 matchups
    if ((ranks[0] >= 9 && ranks[0] <= 10) && (ranks[1] >= 23 && ranks[1] <= 24)) {
      pairings["Pairing I"].push(matchup);
    } else if ((ranks[0] >= 11 && ranks[0] <= 12) && (ranks[1] >= 21 && ranks[1] <= 22)) {
      pairings["Pairing II"].push(matchup);
    } else if ((ranks[0] >= 13 && ranks[0] <= 14) && (ranks[1] >= 19 && ranks[1] <= 20)) {
      pairings["Pairing III"].push(matchup);
    } else if ((ranks[0] >= 15 && ranks[0] <= 16) && (ranks[1] >= 17 && ranks[1] <= 18)) {
      pairings["Pairing IV"].push(matchup);
    }
  });

  return pairings;
}

async function fetchRoundOf16Matchups() {
  try {
    // Use cache if available and recent
    const now = Date.now();
    if (cachedRoundOf16 && (now - lastMatchupsCache) < CACHE_DURATION) {
      return cachedRoundOf16;
    }

    const currentYear = new Date().getFullYear();
    const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${currentYear}0101`;

    const calendarResponse = await fetch(CALENDAR_API_URL);
    const calendarData = await calendarResponse.json();

    // Find the Round of 16 stage - try multiple possible labels
    let roundOf16Stage = calendarData.leagues?.[0]?.calendar?.[0]?.entries.find(e => 
      e.label === "Round of 16" || 
      e.label === "1/8-Finals" || 
      e.label === "Rd of 16" ||
      e.label === "Round of 16 Finals" ||
      e.label === "Knockout Stage Round of 16" ||
      e.label.toLowerCase().includes("round of 16") ||
      e.label.toLowerCase().includes("1/8")
    );

    if (!roundOf16Stage) {
      cachedRoundOf16 = [];
      return [];
    }

    const dates = `${roundOf16Stage.startDate.split("T")[0].replace(/-/g, "")}-${roundOf16Stage.endDate.split("T")[0].replace(/-/g, "")}`;
    const ROUND_OF_16_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${dates}`;
    
    const response = await fetch(ROUND_OF_16_API_URL);
    const data = await response.json();
    const events = data.events || [];
    
    cachedRoundOf16 = groupRoundOf16ByMatchup(events);
    return cachedRoundOf16;
  } catch (error) {
    console.error("Error fetching Round of 16 matchups:", error);
    return cachedRoundOf16 || [];
  }
}

function groupRoundOf16ByMatchup(events) {
  const matchups = {};

  events.forEach(event => {
    const competition = event.competitions?.[0];
    if (!competition) return;

    const homeTeam = competition.competitors.find(c => c.homeAway === "home")?.team;
    const awayTeam = competition.competitors.find(c => c.homeAway === "away")?.team;
    
    if (!homeTeam || !awayTeam) return;

    // Create unique matchup key based on team IDs
    const matchupKey = [homeTeam.id, awayTeam.id].sort().join("-");

    if (!matchups[matchupKey]) {
      const sortedTeams = [homeTeam, awayTeam].sort((a, b) => a.id.localeCompare(b.id));
      matchups[matchupKey] = {
        homeTeam: sortedTeams[0],
        awayTeam: sortedTeams[1],
        matches: [],
        aggregateHome: 0,
        aggregateAway: 0
      };
    }

    const homeScore = parseInt(competition.competitors.find(c => c.homeAway === "home")?.score || 0);
    const awayScore = parseInt(competition.competitors.find(c => c.homeAway === "away")?.score || 0);
    const homeShootoutScore = parseInt(competition.competitors.find(c => c.homeAway === "home")?.shootoutScore || 0);
    const awayShootoutScore = parseInt(competition.competitors.find(c => c.homeAway === "away")?.shootoutScore || 0);

    matchups[matchupKey].matches.push({
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      homeShootoutScore,
      awayShootoutScore,
      leg: competition.leg?.value || 1,
      status: competition.status.type.state,
      gameId: event.id,
      date: new Date(event.date).toLocaleDateString()
    });

    // Update aggregate scores correctly - add scores for each specific team
    if (competition.status.type.state === "post") {
      // Find which team in the matchup corresponds to home/away in this specific game
      const matchupHomeTeam = matchups[matchupKey].homeTeam;
      const matchupAwayTeam = matchups[matchupKey].awayTeam;
      
      if (homeTeam.id === matchupHomeTeam.id) {
        // Current game's home team is matchup's home team
        matchups[matchupKey].aggregateHome += homeScore;
        matchups[matchupKey].aggregateAway += awayScore;
      } else {
        // Current game's home team is matchup's away team
        matchups[matchupKey].aggregateHome += awayScore;
        matchups[matchupKey].aggregateAway += homeScore;
      }
    }
  });

  return Object.values(matchups);
}

function renderRoundOf16Card(knockoutMatchup, matchIndex, roundOf16Matchups) {
  // Find the R16 matchup that corresponds to this knockout matchup
  const roundOf16Matchup = findMatchingRoundOf16(knockoutMatchup, roundOf16Matchups);
  
  if (!roundOf16Matchup) {
    return `
      <div class="team-matchup tba-matchup">
        <div class="team-info">
          <div class="team-names">
            <span class="team-name">Round of 16</span>
          </div>
        </div>
        <div class="match-score">TBD vs TBD</div>
        <div class="match-status">Match ${matchIndex + 1} - Awaiting Teams</div>
      </div>
    `;
  }

  // Always keep home/away order for bracket display
  const homeTeam = roundOf16Matchup.homeTeam;
  const awayTeam = roundOf16Matchup.awayTeam;
  const homeScore = roundOf16Matchup.aggregateHome;
  const awayScore = roundOf16Matchup.aggregateAway;

  // Use getWinnerInfo to properly determine winner including shootouts
  const { winner, loser, winnerScore, loserScore, isTie, homeShootoutScore, awayShootoutScore } = getWinnerInfo(roundOf16Matchup, homeScore, awayScore);
  
  // Determine winner/loser IDs for coloring
  let winnerId = null, loserId = null;
  if (!isTie) {
    winnerId = winner.id;
    loserId = loser.id;
  }

  // Format score display with shootout if applicable
  const homeScoreDisplay = homeShootoutScore > 0 ? `${homeScore}<sup>(${homeShootoutScore})</sup>` : homeScore;
  const awayScoreDisplay = awayShootoutScore > 0 ? `${awayScore}<sup>(${awayShootoutScore})</sup>` : awayScore;

  // Get winner color for glow
  let winnerColor = "#43a047"; // default green
  if (winnerId) {
    const winnerTeam = homeTeam.id === winnerId ? homeTeam : awayTeam;
    winnerColor = (winnerTeam.color && winnerTeam.color.length === 6 ? "#" + winnerTeam.color : "#43a047");
  }

  const homeTeamLogo = `https://a.espncdn.com/i/teamlogos/soccer/500/${homeTeam.id}.png`;
  const awayTeamLogo = `https://a.espncdn.com/i/teamlogos/soccer/500/${awayTeam.id}.png`;

  // Winner in green, loser in grey, add glow for winner (smaller for playoffs)
  return `
    <div class="team-matchup round-16-card" style="cursor: pointer;${winnerId ? `box-shadow: 0 0 8px 2px ${winnerColor};` : ''}" data-r16-matchup='${JSON.stringify(roundOf16Matchup)}'>
      <div class="team-info">
        <div class="team-logos">
          <img src="${homeTeamLogo}" alt="${homeTeam.shortDisplayName}" class="team-logo" onerror="this.src='../soccer-ball-png-24.png'">
          <img src="${awayTeamLogo}" alt="${awayTeam.shortDisplayName}" class="team-logo" onerror="this.src='../soccer-ball-png-24.png'">
        </div>
        <div class="team-names">
          <span class="team-name">
            <span style="${homeTeam.id === winnerId ? 'color:#43a047;font-weight:bold;' : (homeTeam.id === loserId ? '' : '')}">${homeTeam.shortDisplayName}</span> vs 
            <span style="${awayTeam.id === winnerId ? 'color:#43a047;font-weight:bold;' : (awayTeam.id === loserId ? '' : '')}">${awayTeam.shortDisplayName}</span>
          </span>
          <div class="team-seeds">
            <span class="team-seed">Round of 16</span>
          </div>
        </div>
      </div>
      <div class="match-score">
        <span style="${homeTeam.id === winnerId ? 'color:#43a047;font-weight:bold;' : ''}">${homeScoreDisplay}</span> : 
        <span style="${awayTeam.id === winnerId ? 'color:#43a047;font-weight:bold;' : ''}">${awayScoreDisplay}</span>
      </div>
    </div>
  `;
}

function findMatchingRoundOf16(knockoutMatchup, roundOf16Matchups) {
  if (!knockoutMatchup || !roundOf16Matchups || roundOf16Matchups.length === 0) {
    return null;
  }

  // Get the teams from the knockout matchup
  const koTeams = [knockoutMatchup.homeTeam.id, knockoutMatchup.awayTeam.id];

  // Find R16 matchup that contains either team from the knockout matchup
  return roundOf16Matchups.find(r16Matchup => {
    const r16Teams = [r16Matchup.homeTeam.id, r16Matchup.awayTeam.id];
    return koTeams.some(koTeamId => r16Teams.includes(koTeamId));
  });
}

function getWinnerInfo(matchup, aggregateHome, aggregateAway) {
  // Returns {winner: teamObj, loser: teamObj, winnerScore, loserScore, isTie, homeShootoutScore, awayShootoutScore}
  
  // Check if there's a deciding match with shootout scores (use the most recent finished match)
  let homeShootoutScore = 0;
  let awayShootoutScore = 0;
  
  // Find the most recent match with shootout scores
  const finishedMatches = matchup.matches.filter(match => match.status === "post");
  const matchWithShootout = finishedMatches.find(match => match.homeShootoutScore > 0 || match.awayShootoutScore > 0);
  
  if (matchWithShootout) {
    // Map shootout scores to matchup teams (since match teams might be reversed)
    if (matchWithShootout.homeTeam.id === matchup.homeTeam.id) {
      homeShootoutScore = matchWithShootout.homeShootoutScore;
      awayShootoutScore = matchWithShootout.awayShootoutScore;
    } else {
      homeShootoutScore = matchWithShootout.awayShootoutScore;
      awayShootoutScore = matchWithShootout.homeShootoutScore;
    }
  }
  
  // If aggregate scores are tied, use shootout to determine winner
  if (aggregateHome === aggregateAway && (homeShootoutScore > 0 || awayShootoutScore > 0)) {
    if (homeShootoutScore > awayShootoutScore) {
      return { 
        winner: matchup.homeTeam, 
        loser: matchup.awayTeam, 
        winnerScore: aggregateHome, 
        loserScore: aggregateAway, 
        isTie: false,
        homeShootoutScore,
        awayShootoutScore
      };
    } else if (awayShootoutScore > homeShootoutScore) {
      return { 
        winner: matchup.awayTeam, 
        loser: matchup.homeTeam, 
        winnerScore: aggregateAway, 
        loserScore: aggregateHome, 
        isTie: false,
        homeShootoutScore,
        awayShootoutScore
      };
    }
  }
  
  // Regular aggregate score comparison
  if (aggregateHome > aggregateAway) {
    return { 
      winner: matchup.homeTeam, 
      loser: matchup.awayTeam, 
      winnerScore: aggregateHome, 
      loserScore: aggregateAway, 
      isTie: false,
      homeShootoutScore,
      awayShootoutScore
    };
  } else if (aggregateAway > aggregateHome) {
    return { 
      winner: matchup.awayTeam, 
      loser: matchup.homeTeam, 
      winnerScore: aggregateAway, 
      loserScore: aggregateHome, 
      isTie: false,
      homeShootoutScore,
      awayShootoutScore
    };
  } else {
    return { 
      winner: matchup.homeTeam, 
      loser: matchup.awayTeam, 
      winnerScore: aggregateHome, 
      loserScore: aggregateAway, 
      isTie: true,
      homeShootoutScore,
      awayShootoutScore
    };
  }
}

function renderAggregateCard(matchup, matchTitle, aggregateHome, aggregateAway) {
  // Determine the winner and reorder teams so winner is first
  let firstTeam, secondTeam, firstScore, secondScore, firstIsWinner;
  const { winner, loser, winnerScore, loserScore, isTie, homeShootoutScore, awayShootoutScore } = getWinnerInfo(matchup, aggregateHome, aggregateAway);
  
  if (!isTie) {
    firstTeam = winner;
    secondTeam = loser;
    firstScore = winnerScore;
    secondScore = loserScore;
    firstIsWinner = true;
  } else {
    firstTeam = matchup.homeTeam;
    secondTeam = matchup.awayTeam;
    firstScore = aggregateHome;
    secondScore = aggregateAway;
    firstIsWinner = false;
  }
  
  // Determine which shootout score belongs to which team being displayed
  let firstShootoutScore = 0;
  let secondShootoutScore = 0;
  
  if (homeShootoutScore > 0 || awayShootoutScore > 0) {
    if (firstTeam.id === matchup.homeTeam.id) {
      firstShootoutScore = homeShootoutScore;
      secondShootoutScore = awayShootoutScore;
    } else {
      firstShootoutScore = awayShootoutScore;
      secondShootoutScore = homeShootoutScore;
    }
  }
  
  // Format score display with shootout if applicable
  const firstScoreDisplay = firstShootoutScore > 0 ? `${firstScore}<sup>(${firstShootoutScore})</sup>` : firstScore;
  const secondScoreDisplay = secondShootoutScore > 0 ? `${secondScore}<sup>(${secondShootoutScore})</sup>` : secondScore;
  
  // Winner color for glow (smaller for playoffs)
  let winnerColor = "#43a047";
  if (!isTie && firstTeam.color && firstTeam.color.length === 6) {
    winnerColor = "#" + firstTeam.color;
  }
  const firstTeamLogo = `https://a.espncdn.com/i/teamlogos/soccer/500/${firstTeam.id}.png`;
  const secondTeamLogo = `https://a.espncdn.com/i/teamlogos/soccer/500/${secondTeam.id}.png`;
  const isCompleted = matchup.matches.every(match => match.status === "post");
  const statusText = isCompleted ? "Completed" : "In Progress";
  // Winner in green (CWC style)
  return `
    <div class="team-matchup aggregate-card" style="cursor: pointer;${firstIsWinner && !isTie ? `box-shadow: 0 0 8px 2px ${winnerColor};` : ''}">
      <div class="team-info">
        <div class="team-logos">
          <img src="${firstTeamLogo}" alt="${firstTeam.shortDisplayName}" class="team-logo" onerror="this.src='../soccer-ball-png-24.png'">
          <img src="${secondTeamLogo}" alt="${secondTeam.shortDisplayName}" class="team-logo" onerror="this.src='../soccer-ball-png-24.png'">
        </div>
        <div class="team-names">
          <span class="team-name">
            <span style="${firstIsWinner && !isTie ? 'color:#43a047;font-weight:bold;' : ''}">${firstTeam.shortDisplayName}</span> vs 
            <span style="${!firstIsWinner && !isTie ? 'color:#43a047;font-weight:bold;' : ''}">${secondTeam.shortDisplayName}</span>
          </span>
          <div class="team-seeds">
            <span class="team-seed">KO Round</span>
          </div>
        </div>
      </div>
      <div class="match-score">
        <span style="${firstIsWinner && !isTie ? 'color:#43a047;font-weight:bold;' : ''}">${firstScoreDisplay}</span> : 
        <span style="${!firstIsWinner && !isTie ? 'color:#43a047;font-weight:bold;' : ''}">${secondScoreDisplay}</span>
      </div>
    </div>
  `;
}

function showLegsPopup(matchup) {
  // Create modal overlay
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `;

  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';
  modalContent.style.cssText = `
    background: white;
    border-radius: 10px;
    padding: 20px;
    max-width: 500px;
    width: 90%;
    position: relative;
  `;

  // Sort matches by leg
  const sortedMatches = matchup.matches.sort((a, b) => a.leg - b.leg);

  // Create close button
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '×';
  closeButton.style.cssText = `
    position: absolute;
    top: 10px;
    right: 15px;
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #333;
  `;
  closeButton.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  // Create header
  const header = document.createElement('h3');
  header.textContent = `${matchup.homeTeam.shortDisplayName} vs ${matchup.awayTeam.shortDisplayName}`;
  header.style.cssText = `
    color: #333;
    text-align: center;
    margin-bottom: 20px;
  `;

  // Create legs container
  const legsContainer = document.createElement('div');
  legsContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 15px;
  `;

  // Add leg cards
  [1, 2].forEach(legNumber => {
    const match = sortedMatches.find(m => m.leg === legNumber);
    const legCard = document.createElement('div');

    if (match) {
      const homeTeamLogo = `https://a.espncdn.com/i/teamlogos/soccer/500/${match.homeTeam.id}.png`;
      const awayTeamLogo = `https://a.espncdn.com/i/teamlogos/soccer/500/${match.awayTeam.id}.png`;

      const isClickable = match.status === "post" || match.status === "in";
      const statusText = match.status === "post" ? "Finished" :
                        match.status === "in" ? "In Progress" :
                        match.status === "pre" ? "Scheduled" : "";

      legCard.style.cssText = `
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 15px;
        ${isClickable ? 'cursor: pointer; background-color: #f8f9fa;' : 'background-color: #f5f5f5;'
      }transition: background-color 0.2s ease;
      `;

      if (isClickable) {
        legCard.addEventListener('mouseenter', () => {
          legCard.style.backgroundColor = '#e9ecef';
        });
        legCard.addEventListener('mouseleave', () => {
          legCard.style.backgroundColor = '#f8f9fa';
        });
        legCard.addEventListener('click', () => {
          document.body.removeChild(modal);
          window.location.href = `scoreboard.html?gameId=${match.gameId}`;
        });
      }

      // Winner logic for this leg (only if finished)
      let homeIsWinner = false, awayIsWinner = false;
      if (match.status === "post") {
        // Consider both regular score and shootout score for winner determination
        if (match.homeScore > match.awayScore) {
          homeIsWinner = true;
        } else if (match.awayScore > match.homeScore) {
          awayIsWinner = true;
        } else if (match.homeShootoutScore > match.awayShootoutScore) {
          homeIsWinner = true;
        } else if (match.awayShootoutScore > match.homeShootoutScore) {
          awayIsWinner = true;
        }
      }

      // Format score display with shootout
      const homeScoreDisplay = match.homeShootoutScore > 0 ? `${match.homeScore}<sup>(${match.homeShootoutScore})</sup>` : match.homeScore;
      const awayScoreDisplay = match.awayShootoutScore > 0 ? `${match.awayScore}<sup>(${match.awayShootoutScore})</sup>` : match.awayScore;

      legCard.innerHTML = `
  <div style="position: relative; display: flex; justify-content: space-between; align-items: center;">
    <!-- Home Team -->
    <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
      <img src="${homeTeamLogo}" alt="${match.homeTeam.shortDisplayName}" style="width: 30px; height: 30px;" onerror="this.src='../soccer-ball-png-24.png'">
      <span style="font-weight: bold; color: ${homeIsWinner ? '#43a047' : '#333'};">${match.homeTeam.shortDisplayName}</span>
    </div>
    <div style="
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      font-size: 1.2rem;
      font-weight: bold;
      display: flex;
      gap: 4px;
    ">
      <span style="color: ${homeIsWinner ? '#43a047' : '#333'};">${homeScoreDisplay}</span>
      <span style="color: #222;">:</span>
      <span style="color: ${awayIsWinner ? '#43a047' : '#333'};">${awayScoreDisplay}</span>
    </div>

    <!-- Away Team -->
    <div style="display: flex; align-items: center; gap: 10px; flex: 1; justify-content: flex-end;">
      <span style="font-weight: bold; color: ${awayIsWinner ? '#43a047' : '#333'};">${match.awayTeam.shortDisplayName}</span>
      <img src="${awayTeamLogo}" alt="${match.awayTeam.shortDisplayName}" style="width: 30px; height: 30px;" onerror="this.src='../soccer-ball-png-24.png'">
    </div>
  </div>

  <div style="text-align: center; margin-top: 10px; color: #333; font-size: 0.9rem;">
    Leg ${legNumber} - ${statusText}${match.date ? ` (${match.date})` : ''}
  </div>
`;

    } else {
      legCard.style.cssText = `
        border: 2px dashed #ccc;
        border-radius: 8px;
        padding: 15px;
        background-color: #f9f9f9;
        text-align: center;
        color: #333;
      `;
      legCard.innerHTML = `
        <div style="font-size: 1.1rem;">Leg ${legNumber}</div>
        <div style="margin-top: 5px;">Not Scheduled</div>
      `;
    }

    legsContainer.appendChild(legCard);
  });

  // Winner/loser logic for aggregate using the updated getWinnerInfo function
  const { winner, loser, winnerScore, loserScore, isTie, homeShootoutScore, awayShootoutScore } = getWinnerInfo(matchup, matchup.aggregateHome, matchup.aggregateAway);
  
  // Format aggregate score display with shootout
  const homeAggregateDisplay = homeShootoutScore > 0 ? `${matchup.aggregateHome}<sup>(${homeShootoutScore})</sup>` : matchup.aggregateHome;
  const awayAggregateDisplay = awayShootoutScore > 0 ? `${matchup.aggregateAway}<sup>(${awayShootoutScore})</sup>` : matchup.aggregateAway;

  // Add aggregate score (no green color)
  const aggregateDiv = document.createElement('div');
  aggregateDiv.style.cssText = `
    text-align: center;
    margin-top: 20px;
    padding: 15px;
    background-color: #e3f2fd;
    border-radius: 8px;
    font-size: 1.1rem;
    font-weight: bold;
    color: #1976d2;
  `;
  aggregateDiv.innerHTML = `
    Aggregate Score: ${homeAggregateDisplay} : ${awayAggregateDisplay}
  `;

  // Assemble modal
  modalContent.appendChild(closeButton);
  modalContent.appendChild(header);
  modalContent.appendChild(legsContainer);
  modalContent.appendChild(aggregateDiv);
  modal.appendChild(modalContent);

  // Add to page
  document.body.appendChild(modal);

  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

function setupLeagueButtons() {
  const leagueContainer = document.getElementById("leagueButtons");
  if (!leagueContainer) {
    console.error("Error: Element with ID 'leagueButtons' not found.");
    return;
  }

  leagueContainer.innerHTML = "";

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
      
      // Clear cache when switching leagues
      clearCache();
      fetchKnockoutPlayoffs();
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

window.addEventListener("DOMContentLoaded", () => {
  // Reset to default if coming from another page
  if (!currentUefaLeague || !Object.values(LEAGUES).some(league => league.code === currentUefaLeague)) {
    currentUefaLeague = "uefa.champions";
    localStorage.setItem("currentUefaLeague", currentUefaLeague);
  }

  setupLeagueButtons();
  setupNavbarToggle();
  fetchKnockoutPlayoffs();
  
  // Reduce interval frequency to avoid too many requests
  setInterval(fetchKnockoutPlayoffs, 10000); // Changed from 2000 to 10000ms
});

async function renderKnockoutBracket(pairings) {
  const container = document.getElementById("bracketContainer");
  if (!container) {
    console.error("Bracket container not found.");
    return;
  }

  container.innerHTML = "";
  
  // Update the header to reflect the current league (remove toggle button)
  const header = document.querySelector("#bracket h2");
  if (header) {
    const leagueName = Object.keys(LEAGUES).find(key => LEAGUES[key].code === currentUefaLeague);
    header.innerHTML = `${leagueName || "UEFA"} Tournament`;
  }

  // Create bracket section
  const bracketSection = document.createElement("div");
  bracketSection.className = "bracket-section";
  bracketSection.innerHTML = `<h3 style="color: #333; text-align: center; margin-bottom: 10px; margin-top:-15px;">Finals Bracket</h3>`;
  
  const bracketContainer = document.createElement("div");
  bracketContainer.className = "bracket-container";
  
  // Render the finals bracket
  await renderFinalsBracket(pairings, bracketContainer);
  bracketSection.appendChild(bracketContainer);

  // Create pairings section
  const pairingsSection = document.createElement("div");
  pairingsSection.className = "pairings-section";
  pairingsSection.innerHTML = `<h3 style="color: #333; text-align: center; margin: 40px 0 20px 0;">Knockout Playoffs</h3>`;

  // Fetch Round of 16 matchups for pairings section (will use cache)
  const roundOf16Matchups = await fetchRoundOf16Matchups();

  const pairingContainer = document.createElement("div");
  pairingContainer.className = "pairing-section";

  Object.entries(pairings).forEach(([pairingName, matchups], pairingIndex) => {
    const pairingRow = document.createElement("div");
    pairingRow.className = "pairing-row";

    if (matchups.length === 0) {
      // Show TBA pairing
      pairingRow.innerHTML = `
        <div class="pairing-left">
          <div class="team-matchup tba-matchup">
            <div class="team-info">
              <div class="team-names">
                <span class="team-name">TBD vs TBD</span>
              </div>
            </div>
            <div class="match-score">Agg: - : -</div>
          </div>
          <div class="team-matchup tba-matchup">
            <div class="team-info">
              <div class="team-names">
                <span class="team-name">TBD vs TBD</span>
              </div>
            </div>
            <div class="match-score">Agg: - : -</div>
          </div>
        </div>
        <div class="vs-section">
          <div class="pairing-title">${pairingName}</div>
        </div>
        <div class="pairing-right">
          <div class="team-matchup tba-matchup">
            <div class="team-info">
              <div class="team-names">
                <span class="team-name">Round of 16</span>
              </div>
            </div>
            <div class="match-score">TBD vs TBD</div>
          </div>
          <div class="team-matchup tba-matchup">
            <div class="team-info">
              <div class="team-names">
                <span class="team-name">Round of 16</span>
              </div>
            </div>
            <div class="match-score">TBD vs TBD</div>
          </div>
        </div>
      `;
    } else {
      // Show actual matchups - up to 2 matchups per pairing
      let leftColumn = '';
      let rightColumn = '';

      matchups.forEach((matchup, index) => {
        // Calculate aggregate scores
        const aggregateHome = matchup.aggregateHome;
        const aggregateAway = matchup.aggregateAway;

        leftColumn += renderAggregateCard(matchup, `Match ${index + 1}`, aggregateHome, aggregateAway);
        rightColumn += renderRoundOf16Card(matchup, index + 1, roundOf16Matchups);
      });

      // Fill remaining slots with TBD if less than 2 matchups
      const remainingSlots = 2 - matchups.length;
      for (let i = 0; i < remainingSlots; i++) {
        const matchIndex = matchups.length + i + 1;
        leftColumn += `
          <div class="team-matchup tba-matchup">
            <div class="team-info">
              <div class="team-names">
                <span class="team-name">TBD vs TBD</span>
              </div>
            </div>
            <div class="match-score">Agg: - : -</div>
            <div class="match-status">Match ${matchIndex} - Scheduled</div>
          </div>
        `;
        rightColumn += `
          <div class="team-matchup tba-matchup">
            <div class="team-info">
              <div class="team-names">
                <span class="team-name">Round of 16</span>
              </div>
            </div>
            <div class="match-score">TBD vs TBD</div>
            <div class="match-status">Match ${matchIndex} - Awaiting Teams</div>
          </div>
        `;
      }

      pairingRow.innerHTML = `
        <div class="pairing-left">
          ${leftColumn}
        </div>
        <div class="vs-section">
          <div class="pairing-title">${pairingName}</div>
        </div>
        <div class="pairing-right">
          ${rightColumn}
        </div>
      `;

      // Add click events for aggregate cards to show popup
      const aggregateCards = pairingRow.querySelectorAll('.pairing-left .team-matchup:not(.tba-matchup)');
      aggregateCards.forEach((card, cardIndex) => {
        if (matchups[cardIndex]) {
          card.style.cursor = "pointer";
          card.addEventListener("click", () => {
            showLegsPopup(matchups[cardIndex]);
          });
        }
      });

      // Add click events for Round of 16 cards to show popup
      const roundOf16Cards = pairingRow.querySelectorAll('.pairing-right .team-matchup:not(.tba-matchup)');
      roundOf16Cards.forEach(card => {
        const matchupData = card.getAttribute('data-r16-matchup');
        if (matchupData) {
          try {
            const r16Matchup = JSON.parse(matchupData);
            card.addEventListener("click", () => {
              showLegsPopup(r16Matchup);
            });
          } catch (e) {
            console.warn("Failed to parse R16 matchup data:", e);
          }
        }
      });
    }

    pairingContainer.appendChild(pairingRow);
  });

  pairingsSection.appendChild(pairingContainer);

  // Append both sections to the main container
  container.appendChild(bracketSection);
  container.appendChild(pairingsSection);
}

function abbreviateFinalsTeamName(team) {
  if (!team || !team.shortDisplayName) return "TBD";
  const name = team.shortDisplayName.trim();
  if (name.length <= 5) return name;
  const words = name.split(" ");
  if (words.length > 1) {
    let base = words[1];
    if (base.length > 6) base = base.slice(0, 5) + ".";
    return base;
  }
}

async function renderFinalsBracket(knockoutPairings, container) {
  if (!container) {
    console.error("Bracket container not found.");
    return;
  }

  // Fetch quarterfinals, semifinals, and finals data
  const quarterfinalsMatchups = await fetchQuarterfinalsMatchups();
  const semifinalsMatchups = await fetchSemifinalsMatchups();
  const finalsMatchups = await fetchFinalsMatchups();

  const renderRoundColumn = (roundMatchups, roundName, conferenceClass) => {
    const roundDiv = document.createElement("div");
    roundDiv.className = `bracket-round ${conferenceClass}`;

    // Check if mobile layout is needed
    const isMobile = window.innerWidth < 525;

    // Only add round title for desktop
    if (!isMobile) {
      const roundTitle = document.createElement("h3");
      roundTitle.className = "round-title";
      roundTitle.textContent = roundName;
      roundTitle.style.color = "#333";
      roundDiv.appendChild(roundTitle);
    }

    if (roundMatchups.length === 0) {
      // Show TBA matchups based on knockout pairings
      const tbaMatchups = generateTBAFinalsMatchups(knockoutPairings, roundName);
      
      tbaMatchups.forEach((matchup, index) => {
        const tbaCard = document.createElement("div");
        tbaCard.className = "bracket-row tba-card";

        // Add spacing for semifinals and finals (desktop only)
        if (!isMobile) {
          if (roundName === "Semifinals") {
            tbaCard.style.marginTop = index === 0 ? "80px" : "120px";
          } else if (roundName === "Finals") {
            tbaCard.className = "bracket-row finals";
            tbaCard.style.marginTop = "75px";
            tbaCard.innerHTML = `
              <div class="finals-title">${Object.keys(LEAGUES).find(key => LEAGUES[key].code === currentUefaLeague)?.replace(' League', '').toUpperCase() || "UEFA"} FINAL</div>
              <div class="finals-matchup">
                <div class="team-column">
                  <div class="record">-</div>
                  <div class="team-line">
                    <span class="abbrev">${matchup.team1}</span>
                  </div>
                </div>
                <div class="vs">vs</div>
                <div class="team-column">
                  <div class="record">-</div>
                  <div class="team-line">
                    <span class="abbrev">${matchup.team2}</span>
                  </div>
                </div>
              </div>
            `;
            roundDiv.appendChild(tbaCard);
            return;
          }

          tbaCard.innerHTML = `
            <div class="series-info">${roundName}</div>
            <div class="team-row">
              <img src="../soccer-ball-png-24.png" alt="TBD" class="team-logo-small" onerror="this.src='../soccer-ball-png-24.png'">
              <span class="team-name">${matchup.team1}</span>
              <span class="team-record">-</span>
            </div>
            <div class="team-row">
              <img src="../soccer-ball-png-24.png" alt="TBD" class="team-logo-small" onerror="this.src='../soccer-ball-png-24.png'">
              <span class="team-name">${matchup.team2}</span>
              <span class="team-record">-</span>
            </div>
          `;
        } else {
          // Mobile TBA cards - simplified
          if (roundName === "Finals") {
            tbaCard.innerHTML = `
              <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                <img src="../soccer-ball-png-24.png" alt="TBD" style="width: 40px; height: 40px;" onerror="this.src='../soccer-ball-png-24.png'">
                <div style="text-align: center; font-size: 14px;">TBD</div>
              </div>
            `;
          } else {
            tbaCard.innerHTML = `
              <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                <img src="../soccer-ball-png-24.png" alt="TBD" style="width: 40px; height: 40px;" onerror="this.src='../soccer-ball-png-24.png'">
                <div style="text-align: center; font-size: 14px;">- : -</div>
              </div>
            `;
          }
        }

        roundDiv.appendChild(tbaCard);
      });
    } else {
      // Show actual matchups
      roundMatchups.forEach((matchup, index) => {
        const matchupRow = document.createElement("div");
        matchupRow.className = "bracket-row";
        matchupRow.style.cursor = "pointer";

        // Add spacing for semifinals and finals (desktop only)
        if (!isMobile) {
          if (roundName === "Semifinals") {
            matchupRow.style.marginTop = index === 0 ? "80px" : "120px";
          } else if (roundName === "Finals") {
            matchupRow.className = "bracket-row finals";
          }
        }

        const aggregateHome = matchup.aggregateHome || 0;
        const aggregateAway = matchup.aggregateAway || 0;
        
        // Use getWinnerInfo to properly determine winner including shootouts
        const { winner, loser, winnerScore, loserScore, isTie, homeShootoutScore, awayShootoutScore } = getWinnerInfo(matchup, aggregateHome, aggregateAway);
        
        // For finals, use homeTeam (left) and awayTeam (right) directly without reordering by score
        let firstTeam, secondTeam, firstScore, secondScore, firstIsWinner = false;
        let firstShootoutScore = 0, secondShootoutScore = 0;
        
        if (roundName === "Finals") {
          // Use positioned teams directly - don't reorder by score
          firstTeam = matchup.homeTeam;  // Left team
          secondTeam = matchup.awayTeam; // Right team
          firstScore = aggregateHome;
          secondScore = aggregateAway;
          // Determine shootout scores for display
          firstShootoutScore = homeShootoutScore;
          secondShootoutScore = awayShootoutScore;
          // Check if first team is winner (considering shootouts)
          firstIsWinner = !isTie && winner.id === firstTeam.id;
        } else {
          // For other rounds, reorder by winner as before but use getWinnerInfo result
          if (!isTie) {
            firstTeam = winner;
            secondTeam = loser;
            firstScore = winnerScore;
            secondScore = loserScore;
            firstIsWinner = true;
            // Determine shootout scores for display based on team ordering
            if (firstTeam.id === matchup.homeTeam.id) {
              firstShootoutScore = homeShootoutScore;
              secondShootoutScore = awayShootoutScore;
            } else {
              firstShootoutScore = awayShootoutScore;
              secondShootoutScore = homeShootoutScore;
            }
          } else {
            firstTeam = matchup.homeTeam;
            secondTeam = matchup.awayTeam;
            firstScore = aggregateHome;
            secondScore = aggregateAway;
            firstIsWinner = false;
            firstShootoutScore = homeShootoutScore;
            secondShootoutScore = awayShootoutScore;
          }
        }
        
        // Format score display with shootout if applicable
        const firstScoreDisplay = firstShootoutScore > 0 ? `${firstScore}<sup>(${firstShootoutScore})</sup>` : firstScore;
        const secondScoreDisplay = secondShootoutScore > 0 ? `${secondScore}<sup>(${secondShootoutScore})</sup>` : secondScore;
        // Winner color for glow (bigger for bracket)
        let winnerColor = "#43a047";
        if (roundName === "Finals") {
          // For finals, determine actual winner regardless of positioning (using getWinnerInfo result)
          const actualWinner = !isTie ? winner : null;
          if (actualWinner && actualWinner.color) {
            let color = actualWinner.color;
            if (color.toLowerCase() === "ffffff" || color.toLowerCase() === "#ffffff") {
              color = actualWinner.alternateColor;
            }
            winnerColor = (color && color.length === 6 ? "#" + color : "#43a047");
          }
        } else {
          // For other rounds, use existing logic
          if (firstIsWinner && firstTeam.color) {
            let color = firstTeam.color;
            if (color.toLowerCase() === "ffffff" || color.toLowerCase() === "#ffffff") {
              color = firstTeam.alternateColor;
            }
            winnerColor = (color && color.length === 6 ? "#" + color : "#43a047");
          }
        }

        const firstTeamLogo = `https://a.espncdn.com/i/teamlogos/soccer/500/${firstTeam.id}.png`;
        const secondTeamLogo = `https://a.espncdn.com/i/teamlogos/soccer/500/${secondTeam.id}.png`;
        const isCompleted = matchup.matches.every(match => match.status === "post");
        const statusText = isCompleted ? "Completed" : "In Progress";

        if (isMobile) {
          // Mobile layout - simplified cards with only logos and scores
          if (roundName === "Finals") {
            // Apply same abbreviation logic as desktop
            const firstAbbrev = abbreviateFinalsTeamName(firstTeam) || (firstTeam?.displayName || "TBD");
            const secondAbbrev = abbreviateFinalsTeamName(secondTeam) || (secondTeam?.displayName || "TBD");
            
            // Finals mobile: show both teams with scores under each
            matchupRow.innerHTML = `
              <div style="display: flex; flex-direction: column; align-items: center; width: 100%; gap: 10px;">
                <div style="font-size: 14px; font-weight: bold; color: #333; text-align: center;">FINAL</div>
                <div style="display: flex; justify-content: space-around; align-items: center; width: 100%;">
                  <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                    <img src="${firstTeamLogo}" alt="${firstTeam.shortDisplayName}" style="width: 30px; height: 30px;" onerror="this.src='../soccer-ball-png-24.png'">
                    <div style="text-align: center; font-size: 12px; color: #000; font-weight: bold;">${firstAbbrev}</div>
                    <div style="text-align: center; font-size: 18px; font-weight: bold; color: ${firstIsWinner ? '#43a047' : '#333'};">${firstScoreDisplay}</div>
                  </div>
                  <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                    <img src="${secondTeamLogo}" alt="${secondTeam.shortDisplayName}" style="width: 30px; height: 30px;" onerror="this.src='../soccer-ball-png-24.png'">
                    <div style="text-align: center; font-size: 12px; color: #000; font-weight: bold;">${secondAbbrev}</div>
                    <div style="text-align: center; font-size: 18px; font-weight: bold; color: ${!isTie && !firstIsWinner ? '#43a047' : '#333'};">${secondScoreDisplay}</div>
                  </div>
                </div>
              </div>
            `;
            
            // Determine winnerId for mobile glow (only for finals)  
            let winnerId = null;
            if (!isTie) {
              winnerId = winner.id;
            }
            
            // Add glow for winner (mobile - only finals)
            if (winnerId) {
              matchupRow.style.boxShadow = `0 0 16px 4px ${winnerColor}`;
            }

            // Finals: clicking goes directly to scoreboard, no popup (mobile)
            const finalsMatch = (matchup.matches && matchup.matches.length > 0) ? matchup.matches[0] : null;
            if (finalsMatch) {
              matchupRow.onclick = () => {
                window.location.href = `scoreboard.html?gameId=${finalsMatch.gameId}`;
              };
            }
          } else {
            // QF/SF mobile: two logos with respective scores under each (reduced gap)
            matchupRow.innerHTML = `
              <div style="display: flex; justify-content: center; align-items: center; width: 100%; gap: 30px;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                  <img src="${firstTeamLogo}" alt="${firstTeam.shortDisplayName}" style="width: 30px; height: 30px;" onerror="this.src='../soccer-ball-png-24.png'">
                  <div style="text-align: center; font-size: 12px; color: #000; font-weight: bold;">${firstTeam.shortDisplayName}</div>
                  <div style="text-align: center; font-size: 18px; font-weight: bold; color: ${firstIsWinner ? '#43a047' : '#333'};">${firstScoreDisplay}</div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                  <img src="${secondTeamLogo}" alt="${secondTeam.shortDisplayName}" style="width: 30px; height: 30px;" onerror="this.src='../soccer-ball-png-24.png'">
                  <div style="text-align: center; font-size: 12px; color: #000; font-weight: bold;">${secondTeam.shortDisplayName}</div>
                  <div style="text-align: center; font-size: 18px; font-weight: bold; color: ${!isTie && !firstIsWinner ? '#43a047' : '#333'};">${secondScoreDisplay}</div>
                </div>
              </div>
            `;

            // Add click event to show legs popup (mobile QF/SF)
            matchupRow.addEventListener("click", () => {
              showLegsPopup(matchup);
            });
          }
        } else {
          // Desktop layout (existing code)
          if (roundName === "Finals") {
            // Finals: abbreviate names, style winner green, loser grey, and click goes to scoreboard
            const firstAbbrev = abbreviateFinalsTeamName(firstTeam) || (firstTeam?.displayName || "TBD");
            const secondAbbrev = abbreviateFinalsTeamName(secondTeam) || (secondTeam?.displayName || "TBD");
            const leagueName = Object.keys(LEAGUES).find(key => LEAGUES[key].code === currentUefaLeague);

            // Determine winner/loser for styling (using getWinnerInfo result)
            let winnerId = null, loserId = null;
            if (!isTie) {
              winnerId = winner.id;
              loserId = loser.id;
            }

            // Find the finals match (should be only one)
            const finalsMatch = (matchup.matches && matchup.matches.length > 0) ? matchup.matches[0] : null;
            let scoreboardGameId = finalsMatch ? finalsMatch.gameId : null;

            matchupRow.innerHTML = `
              <div class="finals-title">${leagueName?.replace(' League', '').toUpperCase() || "UEFA"} FINAL</div>
              <div class="series-info">${statusText}</div>
              <div class="finals-matchup">
                <img src="${firstTeamLogo}" alt="${firstAbbrev}" style="width: 40px; height: 40px; margin-right: -10px;" onerror="this.src='../soccer-ball-png-24.png'">
                <div class="team-column">
                  <div class="record" style="${firstTeam.id === winnerId ? 'font-weight:bold;' : (firstTeam.id === loserId ? 'color:#888;' : '')}">${firstScoreDisplay}</div>
                  <div class="team-line">
                    <span class="abbrev" style="${firstTeam.id === winnerId ? 'font-weight:bold;' : (firstTeam.id === loserId ? 'color:#888;' : '')}">${firstAbbrev}</span>
                  </div>
                </div>
                <div class="vs">vs</div>
                <div class="team-column">
                  <div class="record" style="${secondTeam.id === winnerId ? 'font-weight:bold;' : (secondTeam.id === loserId ? 'color:#888;' : '')}">${secondScoreDisplay}</div>
                  <div class="team-line">
                    <span class="abbrev" style="${secondTeam.id === winnerId ? 'font-weight:bold;' : (secondTeam.id === loserId ? 'color:#888;' : '')}">${secondAbbrev}</span>
                  </div>
                </div>
                <img src="${secondTeamLogo}" alt="${secondAbbrev}" style="width: 40px; height: 40px; margin-left: -10px;" onerror="this.src='../soccer-ball-png-24.png'">
              </div>
            `;
            // Add glow for winner
            if (winnerId) {
              matchupRow.style.boxShadow = `0 0 16px 4px ${winnerColor}`;
            }
            // Finals: clicking goes directly to scoreboard, no popup
            matchupRow.onclick = () => {
              if (scoreboardGameId) {
                window.location.href = `scoreboard.html?gameId=${scoreboardGameId}`;
              }
            };
          } else {
            // Winner/loser color for semifinals and quarterfinals (using getWinnerInfo result)
            let winnerId = null, loserId = null;
            if (!isTie) {
              winnerId = winner.id;
              loserId = loser.id;
            }
            matchupRow.innerHTML = `
              <div class="series-info">${statusText}</div>
              <div class="team-row">
                <img src="${firstTeamLogo}" alt="${firstTeam.shortDisplayName}" class="team-logo-small" onerror="this.src='../soccer-ball-png-24.png'">
                <span class="team-name" style="${firstTeam.id === winnerId ? 'color:#43a047;font-weight:bold;' : (firstTeam.id === loserId ? '' : '')}">${firstTeam.shortDisplayName}</span>
                <span class="team-record" style="${firstTeam.id === winnerId ? 'color:#43a047;font-weight:bold;' : (firstTeam.id === loserId ? '' : '')}">${firstScoreDisplay}</span>
              </div>
              <div class="team-row">
                <img src="${secondTeamLogo}" alt="${secondTeam.shortDisplayName}" class="team-logo-small" onerror="this.src='../soccer-ball-png-24.png'">
                <span class="team-name" style="${secondTeam.id === winnerId ? 'color:#43a047;font-weight:bold;' : (secondTeam.id === loserId ? '' : '')}">${secondTeam.shortDisplayName}</span>
                <span class="team-record" style="${secondTeam.id === winnerId ? 'color:#43a047;font-weight:bold;' : (secondTeam.id === loserId ? '' : '')}">${secondScoreDisplay}</span>
              </div>
            `;
            // Add glow for winner (desktop)
            if (winnerId) {
              matchupRow.style.boxShadow = `0 0 16px 4px ${winnerColor}`;
            }
            // Add click event to show legs popup
            matchupRow.addEventListener("click", () => {
              showLegsPopup(matchup);
            });
          }
        }
        roundDiv.appendChild(matchupRow);
      });
    }
    return roundDiv;
  };

  // Create the bracket structure with mobile-responsive layout
  const renderConferenceRounds = (conferenceRounds, conferenceClass, conferenceName) => {
    const conferenceDiv = document.createElement("div");
    conferenceDiv.className = `conference ${conferenceClass}`;

    const roundsContainer = document.createElement("div");
    roundsContainer.className = "rounds-container";

    // Add rounds in the order that matches CWC layout
    if (conferenceClass === "left-conference") {
      // Left side: Quarterfinals, Semifinals (left to right)
      roundsContainer.appendChild(renderRoundColumn(conferenceRounds["Quarterfinals"], "Quarterfinals", conferenceClass));
      roundsContainer.appendChild(renderRoundColumn(conferenceRounds["Semifinals"], "Semifinals", conferenceClass));
    } else {
      // Right side: Semifinals, Quarterfinals (left to right)
      roundsContainer.appendChild(renderRoundColumn(conferenceRounds["Semifinals"], "Semifinals", conferenceClass));
      roundsContainer.appendChild(renderRoundColumn(conferenceRounds["Quarterfinals"], "Quarterfinals", conferenceClass));
    }

    conferenceDiv.appendChild(roundsContainer);
    return conferenceDiv;
  };

  // Split the rounds correctly based on bracket flow and maintain positioning
  const leftRounds = {
    "Quarterfinals": [],
    "Semifinals": []
  };

  const rightRounds = {
    "Quarterfinals": [],
    "Semifinals": []
  };

  // Organize quarterfinals and maintain their bracket positions
  if (semifinalsMatchups.length >= 2) {
    const leftSF = semifinalsMatchups[0];  // Top semifinal (left side)
    const rightSF = semifinalsMatchups[1]; // Bottom semifinal (right side)
    
    // Store semifinals in positional order
    leftRounds["Semifinals"] = [leftSF];
    rightRounds["Semifinals"] = [rightSF];
    
    // Find QF matches that feed into each semifinal and maintain top/bottom positioning
    quarterfinalsMatchups.forEach(qfMatch => {
      const feedsIntoLeftSF = leftSF && (
        (qfMatch.homeTeam.id === leftSF.homeTeam.id || qfMatch.homeTeam.id === leftSF.awayTeam.id) ||
        (qfMatch.awayTeam.id === leftSF.homeTeam.id || qfMatch.awayTeam.id === leftSF.awayTeam.id)
      );
      
      const feedsIntoRightSF = rightSF && (
        (qfMatch.homeTeam.id === rightSF.homeTeam.id || qfMatch.homeTeam.id === rightSF.awayTeam.id) ||
        (qfMatch.awayTeam.id === rightSF.homeTeam.id || qfMatch.awayTeam.id === rightSF.awayTeam.id)
      );
      
      if (feedsIntoLeftSF) {
        leftRounds["Quarterfinals"].push(qfMatch);
      } else if (feedsIntoRightSF) {
        rightRounds["Quarterfinals"].push(qfMatch);
      } else {
        // Fallback: distribute evenly if no clear connection
        if (leftRounds["Quarterfinals"].length <= rightRounds["Quarterfinals"].length) {
          leftRounds["Quarterfinals"].push(qfMatch);
        } else {
          rightRounds["Quarterfinals"].push(qfMatch);
        }
      }
    });
  } else {
    // No semifinals data available, split evenly as fallback
    leftRounds["Quarterfinals"] = quarterfinalsMatchups.slice(0, 2);
    rightRounds["Quarterfinals"] = quarterfinalsMatchups.slice(2, 4);
    leftRounds["Semifinals"] = semifinalsMatchups.slice(0, 1);
    rightRounds["Semifinals"] = semifinalsMatchups.slice(1, 2);
  }

  // Check if mobile layout is needed
  const isMobile = window.innerWidth < 525;

  if (isMobile) {
    // Mobile layout: 2-1-1-1-2 vertical arrangement
    const mobileContainer = document.createElement("div");
    mobileContainer.className = "mobile-bracket-container";
    
    // Row 1: First 2 Quarterfinals (top)
    const topQFRow = document.createElement("div");
    topQFRow.className = "mobile-row qf-row";
    
    if (leftRounds["Quarterfinals"][0]) {
      const qf1 = renderRoundColumn([leftRounds["Quarterfinals"][0]], "Quarterfinals", "mobile-quarterfinals");
      topQFRow.appendChild(qf1);
    }
    if (rightRounds["Quarterfinals"][0]) {
      const qf2 = renderRoundColumn([rightRounds["Quarterfinals"][0]], "Quarterfinals", "mobile-quarterfinals");
      topQFRow.appendChild(qf2);
    }
    
    // Row 2: Left Semifinal (centered)
    const leftSFRow = document.createElement("div");
    leftSFRow.className = "mobile-row sf-row";
    
    if (leftRounds["Semifinals"][0]) {
      const leftSF = renderRoundColumn(leftRounds["Semifinals"], "Semifinals", "mobile-semifinals");
      leftSFRow.appendChild(leftSF);
    }
    
    // Row 3: Finals (centered) - Use EXACT same positioning logic as desktop
    const finalsRow = document.createElement("div");
    finalsRow.className = "mobile-row finals-row";
    
    let finalsColumn;
    if (finalsMatchups.length > 0) {
      const finalsMatch = finalsMatchups[0];
      const leftSF = leftRounds["Semifinals"][0];
      const rightSF = rightRounds["Semifinals"][0];
      
      console.log("Mobile Finals positioning debug:", {
        finalsTeams: [finalsMatch.homeTeam.shortDisplayName, finalsMatch.awayTeam.shortDisplayName],
        leftSFTeams: leftSF ? [leftSF.homeTeam.shortDisplayName, leftSF.awayTeam.shortDisplayName] : null,
        rightSFTeams: rightSF ? [rightSF.homeTeam.shortDisplayName, rightSF.awayTeam.shortDisplayName] : null
      });
      
      // Determine which team came from which semifinal - EXACT same logic as desktop
      let leftTeam = finalsMatch.homeTeam;
      let rightTeam = finalsMatch.awayTeam;
      let leftScore = finalsMatch.aggregateHome;
      let rightScore = finalsMatch.aggregateAway;
      
      if (leftSF && rightSF) {
        // Check which team came from which semifinal
        const homeFromLeftSF = leftSF.homeTeam.id === finalsMatch.homeTeam.id || leftSF.awayTeam.id === finalsMatch.homeTeam.id;
        const awayFromLeftSF = leftSF.homeTeam.id === finalsMatch.awayTeam.id || leftSF.awayTeam.id === finalsMatch.awayTeam.id;
        const homeFromRightSF = rightSF.homeTeam.id === finalsMatch.homeTeam.id || rightSF.awayTeam.id === finalsMatch.homeTeam.id;
        const awayFromRightSF = rightSF.homeTeam.id === finalsMatch.awayTeam.id || rightSF.awayTeam.id === finalsMatch.awayTeam.id;
        
        console.log("Mobile Team source analysis:", {
          homeFromLeftSF, awayFromLeftSF, homeFromRightSF, awayFromRightSF
        });
        
        // Force correct positioning: left SF winner on left, right SF winner on right
        if (homeFromLeftSF && awayFromRightSF) {
          // Home came from left, away from right - this is correct, keep as is
          console.log("Mobile: Keeping original order - home from left, away from right");
        } else if (homeFromRightSF && awayFromLeftSF) {
          // Home came from right, away from left - swap them
          console.log("Mobile: Swapping order - home from right, away from left");
          leftTeam = finalsMatch.awayTeam;
          rightTeam = finalsMatch.homeTeam;
          leftScore = finalsMatch.aggregateAway;
          rightScore = finalsMatch.aggregateHome;
        } else if (homeFromLeftSF && !awayFromRightSF && !awayFromLeftSF) {
          // Only home team source is clear (from left), assume away is from right
          console.log("Mobile: Home from left, assuming away from right");
        } else if (homeFromRightSF && !awayFromLeftSF && !awayFromRightSF) {
          // Only home team source is clear (from right), assume away is from left
          console.log("Mobile: Home from right, assuming away from left - swapping");
          leftTeam = finalsMatch.awayTeam;
          rightTeam = finalsMatch.homeTeam;
          leftScore = finalsMatch.aggregateAway;
          rightScore = finalsMatch.aggregateHome;
        } else {
          console.log("Mobile: Could not determine clear source - keeping original order");
        }
      }
      
      // Create a modified finals matchup with correct positioning
      const positionedFinalsMatch = {
        ...finalsMatch,
        homeTeam: leftTeam,
        awayTeam: rightTeam,
        aggregateHome: leftScore,
        aggregateAway: rightScore
      };
      
      console.log("Mobile Final positioning result:", {
        leftTeam: leftTeam.shortDisplayName,
        rightTeam: rightTeam.shortDisplayName,
        leftScore,
        rightScore
      });
      
      finalsColumn = renderRoundColumn([positionedFinalsMatch], "Finals", "mobile-finals");
    } else {
      finalsColumn = renderRoundColumn(finalsMatchups, "Finals", "mobile-finals");
    }
    
    finalsRow.appendChild(finalsColumn);
    
    // Row 4: Right Semifinal (centered)
    const rightSFRow = document.createElement("div");
    rightSFRow.className = "mobile-row sf-row";
    
    if (rightRounds["Semifinals"][0]) {
      const rightSF = renderRoundColumn(rightRounds["Semifinals"], "Semifinals", "mobile-semifinals");
      rightSFRow.appendChild(rightSF);
    }
    
    // Row 5: Last 2 Quarterfinals (bottom)
    const bottomQFRow = document.createElement("div");
    bottomQFRow.className = "mobile-row qf-row";
    
    if (leftRounds["Quarterfinals"][1]) {
      const qf3 = renderRoundColumn([leftRounds["Quarterfinals"][1]], "Quarterfinals", "mobile-quarterfinals");
      bottomQFRow.appendChild(qf3);
    }
    if (rightRounds["Quarterfinals"][1]) {
      const qf4 = renderRoundColumn([rightRounds["Quarterfinals"][1]], "Quarterfinals", "mobile-quarterfinals");
      bottomQFRow.appendChild(qf4);
    }
    
    // Append all rows to container
    mobileContainer.appendChild(topQFRow);
    mobileContainer.appendChild(leftSFRow);
    mobileContainer.appendChild(finalsRow);
    mobileContainer.appendChild(rightSFRow);
    mobileContainer.appendChild(bottomQFRow);
    
    container.appendChild(mobileContainer);
  } else {
    // Desktop layout: horizontal (existing layout)
    // Create the final bracket structure
    const leftConference = renderConferenceRounds(leftRounds, "left-conference", "left");
    const finalsDiv = document.createElement("div");
    finalsDiv.className = "conference finals-conference";
    
    // For finals, determine left/right positioning based on which semifinal teams came from
    let finalsColumn;
    if (finalsMatchups.length > 0) {
      const finalsMatch = finalsMatchups[0];
      const leftSF = leftRounds["Semifinals"][0];
      const rightSF = rightRounds["Semifinals"][0];
      
      // Determine which team came from which semifinal
      let leftTeam = finalsMatch.homeTeam;
      let rightTeam = finalsMatch.awayTeam;
      let leftScore = finalsMatch.aggregateHome;
      let rightScore = finalsMatch.aggregateAway;
      
      if (leftSF && rightSF) {
        // Check which team came from which semifinal
        const homeFromLeftSF = leftSF.homeTeam.id === finalsMatch.homeTeam.id || leftSF.awayTeam.id === finalsMatch.homeTeam.id;
        const awayFromLeftSF = leftSF.homeTeam.id === finalsMatch.awayTeam.id || leftSF.awayTeam.id === finalsMatch.awayTeam.id;
        const homeFromRightSF = rightSF.homeTeam.id === finalsMatch.homeTeam.id || rightSF.awayTeam.id === finalsMatch.homeTeam.id;
        const awayFromRightSF = rightSF.homeTeam.id === finalsMatch.awayTeam.id || rightSF.awayTeam.id === finalsMatch.awayTeam.id;
        
        // Force correct positioning: left SF winner on left, right SF winner on right
        if (homeFromLeftSF && awayFromRightSF) {
          // Home came from left, away from right - this is correct, keep as is
        } else if (homeFromRightSF && awayFromLeftSF) {
          // Home came from right, away from left - swap them
          leftTeam = finalsMatch.awayTeam;
          rightTeam = finalsMatch.homeTeam;
          leftScore = finalsMatch.aggregateAway;
          rightScore = finalsMatch.aggregateHome;
        } else if (homeFromLeftSF && !awayFromRightSF && !awayFromLeftSF) {
          // Only home team source is clear (from left), assume away is from right
        } else if (homeFromRightSF && !awayFromLeftSF && !awayFromRightSF) {
          // Only home team source is clear (from right), assume away is from left
          leftTeam = finalsMatch.awayTeam;
          rightTeam = finalsMatch.homeTeam;
          leftScore = finalsMatch.aggregateAway;
          rightScore = finalsMatch.aggregateHome;
        }
      }
      
      // Create a modified finals matchup with correct positioning
      const positionedFinalsMatch = {
        ...finalsMatch,
        homeTeam: leftTeam,
        awayTeam: rightTeam,
        aggregateHome: leftScore,
        aggregateAway: rightScore
      };
      
      finalsColumn = renderRoundColumn([positionedFinalsMatch], "Finals", "finals");
    } else {
      finalsColumn = renderRoundColumn(finalsMatchups, "Finals", "finals");
    }
    
    finalsDiv.appendChild(finalsColumn);
    const rightConference = renderConferenceRounds(rightRounds, "right-conference", "right");

    // Append in CWC-style order: Left Conference, Finals, Right Conference
    container.appendChild(leftConference);
    container.appendChild(finalsDiv);
    container.appendChild(rightConference);
  }
}

function generateTBAFinalsMatchups(knockoutPairings, roundName) {
  if (roundName === "Quarterfinals") {
    return [
      { team1: "TBD", team2: "TBD" },
      { team1: "TBD", team2: "TBD" },
    ];
  } else if (roundName === "Semifinals") {
    return [
      { team1: "TBD", team2: "TBD" },
    ];
  } else if (roundName === "Finals") {
    return [
      { team1: "TBD", team2: "TBD" }
    ];
  }
  return [];
}

async function fetchQuarterfinalsMatchups() {
  try {
    // Use cache if available and recent
    const now = Date.now();
    if (cachedQuarterfinals && (now - lastMatchupsCache) < CACHE_DURATION) {
      return cachedQuarterfinals;
    }

    const currentYear = new Date().getFullYear();
    const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${currentYear}0101`;

    const calendarResponse = await fetch(CALENDAR_API_URL);
    const calendarData = await calendarResponse.json();

    const quarterfinalsStage = calendarData.leagues?.[0]?.calendar?.[0]?.entries.find(e => 
      e.label === "Quarterfinals" || e.label === "Quarter-finals" || e.label.toLowerCase().includes("quarter")
    );

    if (!quarterfinalsStage) {
      cachedQuarterfinals = [];
      return [];
    }

    const dates = `${quarterfinalsStage.startDate.split("T")[0].replace(/-/g, "")}-${quarterfinalsStage.endDate.split("T")[0].replace(/-/g, "")}`;
    const API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${dates}`;
    
    const response = await fetch(API_URL);
    const data = await response.json();
    const events = data.events || [];
    
    cachedQuarterfinals = groupRoundOf16ByMatchup(events);
    lastMatchupsCache = now;
    return cachedQuarterfinals;
  } catch (error) {
    console.error("Error fetching Quarterfinals matchups:", error);
    return cachedQuarterfinals || [];
  }
}

async function fetchSemifinalsMatchups() {
  try {
    // Use cache if available and recent
    const now = Date.now();
    if (cachedSemifinals && (now - lastMatchupsCache) < CACHE_DURATION) {
      return cachedSemifinals;
    }

    const currentYear = new Date().getFullYear();
    const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${currentYear}0101`;

    const calendarResponse = await fetch(CALENDAR_API_URL);
    const calendarData = await calendarResponse.json();

    const semifinalsStage = calendarData.leagues?.[0]?.calendar?.[0]?.entries.find(e => 
      e.label === "Semifinals" || e.label === "Semi-finals" || e.label.toLowerCase().includes("semi")
    );

    if (!semifinalsStage) {
      cachedSemifinals = [];
      return [];
    }

    const dates = `${semifinalsStage.startDate.split("T")[0].replace(/-/g, "")}-${semifinalsStage.endDate.split("T")[0].replace(/-/g, "")}`;
    const API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${dates}`;
    
    const response = await fetch(API_URL);
    const data = await response.json();
    const events = data.events || [];
    
    cachedSemifinals = groupRoundOf16ByMatchup(events);
    return cachedSemifinals;
  } catch (error) {
    console.error("Error fetching Semifinals matchups:", error);
    return cachedSemifinals || [];
  }
}

async function fetchFinalsMatchups() {
  try {
    // Use cache if available and recent
    const now = Date.now();
    if (cachedFinals && (now - lastMatchupsCache) < CACHE_DURATION) {
      return cachedFinals;
    }

    const currentYear = new Date().getFullYear();
    const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${currentYear}0101`;

    const calendarResponse = await fetch(CALENDAR_API_URL);
    const calendarData = await calendarResponse.json();

    const finalsStage = calendarData.leagues?.[0]?.calendar?.[0]?.entries.find(e => 
      e.label === "Final"
    );

    if (!finalsStage) {
      cachedFinals = [];
      return [];
    }

    const dates = `${finalsStage.startDate.split("T")[0].replace(/-/g, "")}-${finalsStage.endDate.split("T")[0].replace(/-/g, "")}`;
    const API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${dates}`;
    
    const response = await fetch(API_URL);
    const data = await response.json();
    const events = data.events || [];
    
    cachedFinals = groupRoundOf16ByMatchup(events);
    return cachedFinals;
  } catch (error) {
    console.error("Error fetching Finals matchups:", error);
    return cachedFinals || [];
  }
}

// Clear cache when league changes
function clearCache() {
  cachedStandings = null;
  cachedQuarterfinals = null;
  cachedSemifinals = null;
  cachedFinals = null;
  cachedRoundOf16 = null;
  lastStandingsCache = 0;
  lastMatchupsCache = 0;
}
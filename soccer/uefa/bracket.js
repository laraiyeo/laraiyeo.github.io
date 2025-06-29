const LEAGUES = {
  "Champions League": { code: "uefa.champions", logo: "2" },
  "Europa League": { code: "uefa.europa", logo: "2310" },
  "Europa Conference League": { code: "uefa.europa.conf", logo: "20296" },
};

let currentUefaLeague = localStorage.getItem("currentUefaLeague") || "uefa.champions";
let lastBracketHash = null;
let showingKnockoutView = true; // Track which view is currently shown

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
    const STANDINGS_URL = `https://cdn.espn.com/core/soccer/table?xhr=1&league=${currentUefaLeague}`;
    const response = await fetch(STANDINGS_URL);
    const data = await response.json();
    return data.content.standings.groups[0].standings.entries || [];
  } catch (error) {
    console.error("Error fetching standings:", error);
    return [];
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

    matchups[matchupKey].matches.push({
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
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
    const currentYear = new Date().getFullYear();
    const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${currentYear}0101`;

    const calendarResponse = await fetch(CALENDAR_API_URL);
    const calendarData = await calendarResponse.json();

    // Debug: Log all available calendar entries to see what's actually there
    console.log("Available calendar entries:", calendarData.leagues?.[0]?.calendar?.[0]?.entries?.map(e => e.label));

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
      console.log("Round of 16 not found in calendar. Available entries:", 
        calendarData.leagues?.[0]?.calendar?.[0]?.entries?.map(e => e.label));
      return [];
    }

    const dates = `${roundOf16Stage.startDate.split("T")[0].replace(/-/g, "")}-${roundOf16Stage.endDate.split("T")[0].replace(/-/g, "")}`;
    const ROUND_OF_16_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${dates}`;
    
    const response = await fetch(ROUND_OF_16_API_URL);
    const data = await response.json();
    const events = data.events || [];
    
    // Group Round of 16 matches by matchup like knockout playoffs
    return groupRoundOf16ByMatchup(events);
  } catch (error) {
    console.error("Error fetching Round of 16 matchups:", error);
    return [];
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

    matchups[matchupKey].matches.push({
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
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

  // Determine winner/loser by aggregate, for coloring
  let winnerId = null, loserId = null;
  if (homeScore > awayScore) {
    winnerId = homeTeam.id;
    loserId = awayTeam.id;
  } else if (awayScore > homeScore) {
    winnerId = awayTeam.id;
    loserId = homeTeam.id;
  }

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
        <span style="${homeTeam.id === winnerId ? 'color:#43a047;font-weight:bold;' : ''}">${homeScore}</span> : 
        <span style="${awayTeam.id === winnerId ? 'color:#43a047;font-weight:bold;' : ''}">${awayScore}</span>
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
  // Returns {winner: teamObj, loser: teamObj, winnerScore, loserScore, isTie}
  if (aggregateHome > aggregateAway) {
    return { winner: matchup.homeTeam, loser: matchup.awayTeam, winnerScore: aggregateHome, loserScore: aggregateAway, isTie: false };
  } else if (aggregateAway > aggregateHome) {
    return { winner: matchup.awayTeam, loser: matchup.homeTeam, winnerScore: aggregateAway, loserScore: aggregateHome, isTie: false };
  } else {
    return { winner: matchup.homeTeam, loser: matchup.awayTeam, winnerScore: aggregateHome, loserScore: aggregateAway, isTie: true };
  }
}

function renderAggregateCard(matchup, matchTitle, aggregateHome, aggregateAway) {
  // Determine the winner and reorder teams so winner is first
  let firstTeam, secondTeam, firstScore, secondScore, firstIsWinner;
  const { winner, loser, winnerScore, loserScore, isTie } = getWinnerInfo(matchup, aggregateHome, aggregateAway);
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
        <span style="${firstIsWinner && !isTie ? 'color:#43a047;font-weight:bold;' : ''}">${firstScore}</span> : 
        <span style="${!firstIsWinner && !isTie ? 'color:#43a047;font-weight:bold;' : ''}">${secondScore}</span>
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
        if (match.homeScore > match.awayScore) homeIsWinner = true;
        else if (match.awayScore > match.homeScore) awayIsWinner = true;
      }

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
      <span style="color: ${homeIsWinner ? '#43a047' : '#333'};">${match.homeScore}</span>
      <span style="color: #222;">:</span>
      <span style="color: ${awayIsWinner ? '#43a047' : '#333'};">${match.awayScore}</span>
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

  // Winner/loser logic for aggregate (for display only, not for coloring)
  const aggHome = matchup.aggregateHome;
  const aggAway = matchup.aggregateAway;
  let winner = null, loser = null, winnerScore = aggHome, loserScore = aggAway, isTie = false;
  if (aggHome > aggAway) {
    winner = matchup.homeTeam;
    loser = matchup.awayTeam;
    winnerScore = aggHome;
    loserScore = aggAway;
    isTie = false;
  } else if (aggAway > aggHome) {
    winner = matchup.awayTeam;
    loser = matchup.homeTeam;
    winnerScore = aggAway;
    loserScore = aggHome;
    isTie = false;
  } else {
    winner = matchup.homeTeam;
    loser = matchup.awayTeam;
    winnerScore = aggHome;
    loserScore = aggAway;
    isTie = true;
  }

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
    Aggregate Score: ${winnerScore} : ${loserScore}
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
  setInterval(fetchKnockoutPlayoffs, 2000);
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

  // Fetch Round of 16 matchups for pairings section
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
        let firstTeam, secondTeam, firstScore, secondScore, firstIsWinner = false;
        if (aggregateHome > aggregateAway) {
          firstTeam = matchup.homeTeam;
          secondTeam = matchup.awayTeam;
          firstScore = aggregateHome;
          secondScore = aggregateAway;
          firstIsWinner = true;
        } else if (aggregateAway > aggregateHome) {
          firstTeam = matchup.awayTeam;
          secondTeam = matchup.homeTeam;
          firstScore = aggregateAway;
          secondScore = aggregateHome;
          firstIsWinner = true;
        } else {
          firstTeam = matchup.homeTeam;
          secondTeam = matchup.awayTeam;
          firstScore = aggregateHome;
          secondScore = aggregateAway;
          firstIsWinner = false;
        }
        // Winner color for glow (bigger for bracket)
        let winnerColor = "#43a047";
        if (firstIsWinner && firstTeam.color) {
          let color = firstTeam.color;
          if (color.toLowerCase() === "ffffff" || color.toLowerCase() === "#ffffff") {
            color = firstTeam.alternateColor;
          }
          winnerColor = (color && color.length === 6 ? "#" + color : "#43a047");
        }
        const firstTeamLogo = `https://a.espncdn.com/i/teamlogos/soccer/500/${firstTeam.id}.png`;
        const secondTeamLogo = `https://a.espncdn.com/i/teamlogos/soccer/500/${secondTeam.id}.png`;
        const isCompleted = matchup.matches.every(match => match.status === "post");
        const statusText = isCompleted ? "Completed" : "In Progress";

        if (isMobile) {
          // Mobile layout - simplified cards with only logos and scores
          if (roundName === "Finals") {
            // Finals mobile: show both teams with scores under each
            matchupRow.innerHTML = `
              <div style="display: flex; justify-content: space-around; align-items: center; width: 100%;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                  <img src="${firstTeamLogo}" alt="${firstTeam.shortDisplayName}" style="width: 30px; height: 30px;" onerror="this.src='../soccer-ball-png-24.png'">
                  <div style="text-align: center; font-size: 12px; color: #000; font-weight: bold;">${firstTeam.shortDisplayName}</div>
                  <div style="text-align: center; font-size: 18px; font-weight: bold; color: ${firstScore > secondScore ? '#43a047' : '#333'};">${firstScore}</div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                  <img src="${secondTeamLogo}" alt="${secondTeam.shortDisplayName}" style="width: 30px; height: 30px;" onerror="this.src='../soccer-ball-png-24.png'">
                  <div style="text-align: center; font-size: 12px; color: #000; font-weight: bold;">${secondTeam.shortDisplayName}</div>
                  <div style="text-align: center; font-size: 18px; font-weight: bold; color: ${secondScore > firstScore ? '#43a047' : '#333'};">${secondScore}</div>
                </div>
              </div>
            `;
            
            // Determine winnerId for mobile glow (only for finals)
            let winnerId = null;
            if (firstScore > secondScore) {
              winnerId = firstTeam.id;
            } else if (secondScore > firstScore) {
              winnerId = secondTeam.id;
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
                  <div style="text-align: center; font-size: 18px; font-weight: bold; color: ${firstScore > secondScore ? '#43a047' : '#333'};">${firstScore}</div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                  <img src="${secondTeamLogo}" alt="${secondTeam.shortDisplayName}" style="width: 30px; height: 30px;" onerror="this.src='../soccer-ball-png-24.png'">
                  <div style="text-align: center; font-size: 12px; color: #000; font-weight: bold;">${secondTeam.shortDisplayName}</div>
                  <div style="text-align: center; font-size: 18px; font-weight: bold; color: ${secondScore > firstScore ? '#43a047' : '#333'};">${secondScore}</div>
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

            // Determine winner/loser for styling
            let winnerId = null, loserId = null;
            if (firstScore > secondScore) {
              winnerId = firstTeam.id;
              loserId = secondTeam.id;
            } else if (secondScore > firstScore) {
              winnerId = secondTeam.id;
              loserId = firstTeam.id;
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
                  <div class="record" style="${firstTeam.id === winnerId ? 'font-weight:bold;' : (firstTeam.id === loserId ? 'color:#888;' : '')}">${firstScore}</div>
                  <div class="team-line">
                    <span class="abbrev" style="${firstTeam.id === winnerId ? 'font-weight:bold;' : (firstTeam.id === loserId ? 'color:#888;' : '')}">${firstAbbrev}</span>
                  </div>
                </div>
                <div class="vs">vs</div>
                <div class="team-column">
                  <div class="record" style="${secondTeam.id === winnerId ? 'font-weight:bold;' : (secondTeam.id === loserId ? 'color:#888;' : '')}">${secondScore}</div>
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
            // Winner/loser color for semifinals and quarterfinals
            let winnerId = null, loserId = null;
            if (firstScore > secondScore) {
              winnerId = firstTeam.id;
              loserId = secondTeam.id;
            } else if (secondScore > firstScore) {
              winnerId = secondTeam.id;
              loserId = firstTeam.id;
            }
            matchupRow.innerHTML = `
              <div class="series-info">${statusText}</div>
              <div class="team-row">
                <img src="${firstTeamLogo}" alt="${firstTeam.shortDisplayName}" class="team-logo-small" onerror="this.src='../soccer-ball-png-24.png'">
                <span class="team-name" style="${firstTeam.id === winnerId ? 'color:#43a047;font-weight:bold;' : (firstTeam.id === loserId ? '' : '')}">${firstTeam.shortDisplayName}</span>
                <span class="team-record" style="${firstTeam.id === winnerId ? 'color:#43a047;font-weight:bold;' : (firstTeam.id === loserId ? '' : '')}">${firstScore}</span>
              </div>
              <div class="team-row">
                <img src="${secondTeamLogo}" alt="${secondTeam.shortDisplayName}" class="team-logo-small" onerror="this.src='../soccer-ball-png-24.png'">
                <span class="team-name" style="${secondTeam.id === winnerId ? 'color:#43a047;font-weight:bold;' : (secondTeam.id === loserId ? '' : '')}">${secondTeam.shortDisplayName}</span>
                <span class="team-record" style="${secondTeam.id === winnerId ? 'color:#43a047;font-weight:bold;' : (secondTeam.id === loserId ? '' : '')}">${secondScore}</span>
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

  // Split the rounds correctly like CWC
  const leftRounds = {
    "Quarterfinals": quarterfinalsMatchups.slice(0, 2), // First 2 QF matches
    "Semifinals": semifinalsMatchups.slice(0, 1) // First SF match
  };

  const rightRounds = {
    "Quarterfinals": quarterfinalsMatchups.slice(2, 4), // Last 2 QF matches  
    "Semifinals": semifinalsMatchups.slice(1, 2) // Second SF match
  };

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
    
    // Row 3: Finals (centered)
    const finalsRow = document.createElement("div");
    finalsRow.className = "mobile-row finals-row";
    
    const finalsColumn = renderRoundColumn(finalsMatchups, "Finals", "mobile-finals");
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
    // Create left conference
    const leftConference = renderConferenceRounds(leftRounds, "left-conference", "left");
    
    // Create finals column
    const finalsDiv = document.createElement("div");
    finalsDiv.className = "conference finals-conference";
    const finalsColumn = renderRoundColumn(finalsMatchups, "Finals", "finals");
    finalsDiv.appendChild(finalsColumn);

    // Create right conference
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
    const currentYear = new Date().getFullYear();
    const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${currentYear}0101`;

    const calendarResponse = await fetch(CALENDAR_API_URL);
    const calendarData = await calendarResponse.json();

    const quarterfinalsStage = calendarData.leagues?.[0]?.calendar?.[0]?.entries.find(e => 
      e.label === "Quarterfinals" || e.label === "Quarter-finals" || e.label.toLowerCase().includes("quarter")
    );

    if (!quarterfinalsStage) {
      return [];
    }

    const dates = `${quarterfinalsStage.startDate.split("T")[0].replace(/-/g, "")}-${quarterfinalsStage.endDate.split("T")[0].replace(/-/g, "")}`;
    const API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${dates}`;
    
    const response = await fetch(API_URL);
    const data = await response.json();
    const events = data.events || [];
    
    return groupRoundOf16ByMatchup(events);
  } catch (error) {
    console.error("Error fetching Quarterfinals matchups:", error);
    return [];
  }
}

async function fetchSemifinalsMatchups() {
  try {
    const currentYear = new Date().getFullYear();
    const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${currentYear}0101`;

    const calendarResponse = await fetch(CALENDAR_API_URL);
    const calendarData = await calendarResponse.json();

    const semifinalsStage = calendarData.leagues?.[0]?.calendar?.[0]?.entries.find(e => 
      e.label === "Semifinals" || e.label === "Semi-finals" || e.label.toLowerCase().includes("semi")
    );

    if (!semifinalsStage) {
      return [];
    }

    const dates = `${semifinalsStage.startDate.split("T")[0].replace(/-/g, "")}-${semifinalsStage.endDate.split("T")[0].replace(/-/g, "")}`;
    const API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${dates}`;
    
    const response = await fetch(API_URL);
    const data = await response.json();
    const events = data.events || [];
    
    return groupRoundOf16ByMatchup(events);
  } catch (error) {
    console.error("Error fetching Semifinals matchups:", error);
    return [];
  }
}

async function fetchFinalsMatchups() {
  try {
    const currentYear = new Date().getFullYear();
    const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${currentYear}0101`;

    const calendarResponse = await fetch(CALENDAR_API_URL);
    const calendarData = await calendarResponse.json();

    const finalsStage = calendarData.leagues?.[0]?.calendar?.[0]?.entries.find(e => 
      e.label === "Final"
    );

    if (!finalsStage) {
      return [];
    }

    const dates = `${finalsStage.startDate.split("T")[0].replace(/-/g, "")}-${finalsStage.endDate.split("T")[0].replace(/-/g, "")}`;
    const API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/${currentUefaLeague}/scoreboard?dates=${dates}`;
    
    const response = await fetch(API_URL);
    const data = await response.json();
    const events = data.events || [];
    
    return groupRoundOf16ByMatchup(events);
  } catch (error) {
    console.error("Error fetching Finals matchups:", error);
    return [];
  }
}
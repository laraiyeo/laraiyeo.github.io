const currentYear = new Date().getFullYear();
const PLAYOFFS_API_URL = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${currentYear}0418-${currentYear}0620`;

let lastBracketHash = null;

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

async function fetchAndUpdateBracket() {
  try {
    const response = await fetch(PLAYOFFS_API_URL);
    const text = await response.text();
    const newHash = hashString(text);

    if (newHash === lastBracketHash) {
      // No changes, skip update
      return;
    }

    lastBracketHash = newHash;
    const data = JSON.parse(text);
    const games = data.events.filter(game => game.season.slug === "post-season");

    // Use a temporary container to compare HTML and avoid jitter
    const bracketContainer = document.getElementById("bracketContainer");
    if (!bracketContainer) {
      console.error("Bracket container not found.");
      return;
    }
    const tempContainer = document.createElement("div");
    tempContainer.className = "bracket-container";
    await renderBracket(games, tempContainer);

    if (bracketContainer.innerHTML !== tempContainer.innerHTML) {
      bracketContainer.innerHTML = tempContainer.innerHTML;
    }
  } catch (error) {
    console.error("Error fetching bracket data:", error);
  }
}

setInterval(fetchAndUpdateBracket, 2000); // Update every 2 seconds

async function fetchPlayoffData() {
  try {
    const response = await fetch(PLAYOFFS_API_URL);
    const data = await response.json();
    return data.events.filter(game => game.season.slug === "post-season"); // Only include post-season games
  } catch (error) {
    console.error("Error fetching playoff data:", error);
    return [];
  }
}

function normalizeTeamName(name) {
  if (!name) return "";
  return name
    .split("/")
    .map(n => n.trim())
    .sort()
    .join("/")
    .toLowerCase();
}

function isSlashTeam(name) {
  return name && name.includes("/");
}

function getBracketLogo(team) {
  // Use icon.png for teams with a slash in the name, otherwise use ESPN logo
  if (isSlashTeam(team.shortDisplayName)) {
    return "icon.png";
  }
  return `https://a.espncdn.com/i/teamlogos/nba/500/${team.abbreviation}.png`;
}

function groupGamesByMatchup(games, standings) {
  const matchups = {};
  games.forEach(game => {
    const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home")?.team;
    const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away")?.team;

    if (!homeTeam || !awayTeam) {
      console.warn("Missing team data for game:", game);
      return; // Skip this game if either team is missing
    }

    // Retrieve seed and short name for home and away teams
    const homeSeed = getTeamSeed(homeTeam.id, standings);
    const awaySeed = getTeamSeed(awayTeam.id, standings);
    const homeShortName = homeTeam.shortDisplayName || "Unknown";
    const awayShortName = awayTeam.shortDisplayName || "Unknown";

    // Assign seed and short name to the team objects
    homeTeam.seed = homeSeed;
    awayTeam.seed = awaySeed;
    homeTeam.shortName = homeShortName;
    awayTeam.shortName = awayShortName;

    // Use normalized names for matchups with "/" (e.g., Celtics/Knicks)
    const homeKey = normalizeTeamName(homeTeam.shortDisplayName);
    const awayKey = normalizeTeamName(awayTeam.shortDisplayName);
    const matchupKey = [homeKey, awayKey].sort().join("-"); // Unique key for each matchup, handles "/" cases

    if (!matchups[matchupKey]) {
      matchups[matchupKey] = { homeTeam, awayTeam, games: [] };
    }
    matchups[matchupKey].games.push(game);
  });

  // Sort matchups by the custom seed order: 1st, 4th, 3rd, 2nd, and prioritize Thunder matchups
  const customSeedOrder = [6, 4, 3, 2];
  return Object.values(matchups).sort((a, b) => {
    const aSeed = Math.min(a.homeTeam.seed, a.awayTeam.seed);
    const bSeed = Math.min(b.homeTeam.seed, b.awayTeam.seed);

    const aIndex = customSeedOrder.indexOf(aSeed);
    const bIndex = customSeedOrder.indexOf(bSeed);

    return aIndex - bIndex;
  });
}

function groupGamesByConferenceAndRound(games) {
  const rounds = {
    east: {
      "1st Round": [],
      "Semifinals": [],
      "Finals": []
    },
    west: {
      "1st Round": [],
      "Semifinals": [],
      "Finals": []
    },
    finals: []
  };

  games.forEach(game => {
    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

    if (headline.includes("East 1st Round")) {
      rounds.east["1st Round"].push(game);
    } else if (headline.includes("East Semifinals")) {
      rounds.east["Semifinals"].push(game);
    } else if (headline.includes("East Finals")) {
      rounds.east["Finals"].push(game);
    } else if (headline.includes("West 1st Round")) {
      rounds.west["1st Round"].push(game);
    } else if (headline.includes("West Semifinals")) {
      rounds.west["Semifinals"].push(game);
    } else if (headline.includes("West Finals")) {
      rounds.west["Finals"].push(game);
    } else if (headline.includes("NBA Finals")) {
      rounds.finals.push(game);
    }
  });

  return rounds;
}

function groupGamesByRound(games) {
  const rounds = {
    4: [], // 1st Round
    3: [], // Semifinals
    2: [], // Finals
    1: []  // NBA Finals
  };

  games.forEach(game => {
    const roundType = game.season.type; // Use type to determine the round
    if (rounds[roundType]) {
      rounds[roundType].push(game);
    }
  });

  return rounds;
}

function groupGamesByRoundUsingHeadline(games) {
  const rounds = {
    "1st Round": [],
    "Semifinals": [],
    "Finals": [],
    "NBA Finals": []
  };

  games.forEach(game => {
    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

    if (headline.includes("1st Round")) {
      rounds["1st Round"].push(game);
    } else if (headline.includes("Semifinals")) {
      rounds["Semifinals"].push(game);
    } else if (headline.includes("Finals") && !headline.includes("NBA Finals")) {
      rounds["Finals"].push(game);
    } else if (headline.includes("NBA Finals")) {
      rounds["NBA Finals"].push(game);
    }
  });

  return rounds;
}

function getTeamSeed(teamId, standings) {
  const conference = standings.find(group =>
    group.standings.entries.some(entry => entry.team.id === teamId)
  );
  const teamEntry = conference?.standings.entries.find(entry => entry.team.id === teamId);
  return teamEntry?.team.seed || "-";
}

function getTeamRoundRecord(teamId, games, currentRound, opposingTeamId) {
  const relevantGames = games.filter(game => {
    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";
    return headline.includes(currentRound) &&
           game.competitions[0].competitors.some(c => c.team.id === teamId);
  });

  if (relevantGames.length === 0) return "0-0";

  // Find the most recent game for the team in the current round
  const mostRecentGame = relevantGames.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  const team = mostRecentGame.competitions[0].competitors.find(c => c.team.id === teamId);
  const opposingTeam = mostRecentGame.competitions[0].competitors.find(c => c.team.id === opposingTeamId);

  let record = team?.record || "0-0";

  // If the record starts with "0", calculate it as the opposite of the opposing team's record
  if (record.startsWith("0") && opposingTeam?.record) {
    const [opposingWins, opposingLosses] = opposingTeam.record.split("-").map(Number);
    record = `${opposingLosses}-${opposingWins}`;
  }

  return record;
}

function groupGamesByConferenceAndSeed(games) {
  const conferences = {
    east: [],
    west: []
  };

  games.forEach(game => {
    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

    if (headline.includes("East")) {
      conferences.east.push(game);
    } else if (headline.includes("West")) {
      conferences.west.push(game);
    }
  });

  const sortBySeed = (games) => {
    const matchups = groupGamesByMatchup(games);
    return matchups.sort((a, b) => {
      const aSeedDiff = Math.abs(a.homeTeam.seed - a.awayTeam.seed);
      const bSeedDiff = Math.abs(b.homeTeam.seed - b.awayTeam.seed);
      return aSeedDiff - bSeedDiff;
    });
  };

  return {
    east: sortBySeed(conferences.east),
    west: sortBySeed(conferences.west)
  };
}

async function renderBracket(games, container) {
  // If no container is passed, use the default
  if (!container) {
    container = document.getElementById("bracketContainer");
    if (!container) {
      console.error("Bracket container not found.");
      return;
    }
    container.innerHTML = ""; // Clear existing content
    container.className = "bracket-container";
  }

  const standingsResponse = await fetch("https://cdn.espn.com/core/nba/standings?xhr=1");
  const standingsData = await standingsResponse.json();
  const standings = standingsData.content.standings.groups;

  const rounds = groupGamesByConferenceAndRound(games);

  const renderRoundColumn = (roundGames, roundName, conferenceClass) => {
    const roundDiv = document.createElement("div");
    roundDiv.className = `bracket-round ${conferenceClass}`;

    const roundTitle = document.createElement("h3");
    roundTitle.className = "round-title";
    roundTitle.textContent = roundName;
    roundDiv.appendChild(roundTitle);

    if (roundGames.length === 0 && ["Semifinals", "Finals", "NBA Finals"].includes(roundName)) {
      const tbaCardCount = roundName === "Semifinals" ? 2 : 1; // Show 2 cards for Semifinals, 1 for others

      for (let i = 0; i < tbaCardCount; i++) {
        const tbaCard = document.createElement("div");
        tbaCard.className = "bracket-row tba-card";
        tbaCard.style.textAlign = "center";
        tbaCard.style.padding = "20px";
        tbaCard.style.border = "2px dashed #ccc";
        tbaCard.style.borderRadius = "10px";
        tbaCard.style.backgroundColor = "#f9f9f9";

        // Adjust spacing for Semifinals and other rounds
        if (roundName === "Semifinals") {
          tbaCard.style.marginTop = i === 0 ? "50px" : "150px"; // Top and bottom spacing for two cards
        } else if (roundName === "Finals") {
          tbaCard.style.marginTop = "180px";
        }

        if (roundName === "NBA Finals") {
          tbaCard.innerHTML = `
            <div style="font-size: 1.5em; font-weight: bold; margin-bottom: 5px;">CHAMPIONSHIP</div>
            <div style="font-size: 1.2em; margin-bottom: 5px;">${roundName}</div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div class="matchup-container">
                <div class="team-column" style="margin: 0 30px;">
                  <div class="record" style="font-weight: bold; font-size: 2rem;">-</div>
                  <div class="team-line">
                    <span class="abbrev">TBD</span>
                  </div>
                </div>
                <div class="vs">vs</div>
                <div class="team-column">
                  <div class="record" style="font-weight: bold; font-size: 2rem;">-</div>
                  <div class="team-line">
                    <span class="abbrev">TBD</span>
                  </div>
                </div>
              </div>
            </div>
          `;
        } else {
          tbaCard.innerHTML = `
            <div class="series-info">Conf. ${roundName}</div>
            <div class="team-row">
              <span class="team-name">TBD</span>
              <span class="team-record">-</span>
            </div>
            <div class="team-row">
              <span class="team-name">TBD</span>
              <span class="team-record">-</span>
            </div>
          `;
        }

        roundDiv.appendChild(tbaCard);
      }
      return roundDiv;
    }

    const matchups = groupGamesByMatchup(roundGames, standings);

    matchups.forEach((matchup, index) => {
      let { homeTeam, awayTeam, games } = matchup;

      // Ensure the team with the higher seed is on top
      if (homeTeam.seed > awayTeam.seed) {
        [homeTeam, awayTeam] = [awayTeam, homeTeam];
      }

      const homeSeed = homeTeam ? homeTeam.seed : "-";
      const awaySeed = awayTeam ? awayTeam.seed : "-";

      const homeRecord = homeTeam ? getTeamRoundRecord(homeTeam.id, games, roundName, awayTeam?.id).split(`-`)[0] : "0";
      const awayRecord = awayTeam ? getTeamRoundRecord(awayTeam.id, games, roundName, homeTeam?.id).split(`-`)[0] : "0";

      const homeAbbrev = homeTeam ? homeTeam.abbreviation : "TBD";
      const awayAbbrev = awayTeam ? awayTeam.abbreviation : "TBD";

      // Use icon.png for slash teams
      const homeLogo = getBracketLogo(homeTeam);
      const awayLogo = getBracketLogo(awayTeam);

      const homeIsWinner = parseInt(homeRecord) > parseInt(awayRecord);
      const awayIsWinner = parseInt(awayRecord) > parseInt(homeRecord);
      const tied = parseInt(homeRecord) === parseInt(awayRecord);
      const homeWins = parseInt(homeRecord);
      const awayWins = parseInt(awayRecord);

      let seriesInfo = "";
      if (homeWins === 4 || awayWins === 4) {
        const winner = homeWins === 4 ? homeTeam.abbreviation : awayTeam.abbreviation;
        const loserWins = homeWins === 4 ? awayWins : homeWins;
        seriesInfo = `${winner} wins series ${Math.max(homeWins, awayWins)} - ${loserWins}`;
      } else if (homeWins !== awayWins) {
        const leader = homeWins > awayWins ? homeTeam.abbreviation : awayTeam.abbreviation;
        const leaderWins = Math.max(homeWins, awayWins);
        const trailingWins = Math.min(homeWins, awayWins);
        seriesInfo = `${leader} leads ${leaderWins} - ${trailingWins}`;
      } else {
        seriesInfo = `Series tied ${homeWins} - ${awayWins}`;
      }

      const homeName = homeTeam ? homeTeam.shortDisplayName : "TBD";
      const awayName = awayTeam ? awayTeam.shortDisplayName : "TBD";

      const inProgress = (homeWins < 4 && awayWins < 4);

      const matchupRow = document.createElement("div");
      matchupRow.className = "bracket-row";

      // Add proportional spacing for semifinal cards
      if (roundName === "Semifinals") {
        matchupRow.style.marginTop = index === 0 ? "60px" : "160px"; // Adjust spacing for top and bottom cards
      } else if (roundName === "Finals") {
        matchupRow.style.marginTop = "190px"; // Adjust spacing for top and bottom cards
      } else if (roundName === "1st Round") {
        matchupRow.style.marginTop = index === 2 ? "50px" : "10px"; // Adjust spacing for top and bottom cards
      } else if (roundName === "NBA Finals") {
        matchupRow.style.marginLeft = "-25px";
        matchupRow.style.padding = "20px";
        matchupRow.style.width = "270px";
        matchupRow.style.border = "2px solid #ccc";
        matchupRow.style.borderRadius = "10px";
        matchupRow.style.backgroundColor = "#f9f9f9";
        matchupRow.style.textAlign = "center";
      }

      // Change box shadow to winning team's color if a team gets 4 wins
      if (homeWins === 4) {
        matchupRow.style.boxShadow = `0 0px 8px rgba(${parseInt(homeTeam.color.slice(0, 2), 16)}, ${parseInt(homeTeam.color.slice(2, 4), 16)}, ${parseInt(homeTeam.color.slice(4, 6), 16)}, 0.8)`;
      } else if (awayWins === 4) {
        matchupRow.style.boxShadow = `0 0px 8px rgba(${parseInt(awayTeam.color.slice(0, 2), 16)}, ${parseInt(awayTeam.color.slice(2, 4), 16)}, ${parseInt(awayTeam.color.slice(4, 6), 16)}, 0.8)`;
      }

      if (roundName === "NBA Finals") {
        matchupRow.innerHTML = `
          <div style="font-size: 1.5em; font-weight: bold; margin-bottom: 5px;">CHAMPIONSHIP</div>
          <div style="font-size: 1.2em; margin-bottom: 5px;">${seriesInfo}</div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div class="matchup-container">
            <img src="${homeLogo}" alt="${homeAbbrev}" style="width: 40px; height: 40px; margin-right: -10px;">
            <div class="team-column">
                <div class="record" style="font-weight: bold; font-size: 2rem; ${tied ? "" : homeIsWinner ? "" : "color: grey;"}">${homeRecord}</div>
                <div class="team-line">
                <span class="seed" style="color: grey; font-size: 0.9rem;">${homeSeed}</span>
                <span class="abbrev" style="${inProgress ? "" : tied ? "" : homeIsWinner ? "" : "color: grey;"}">${homeAbbrev}</span>
                </div>
            </div>
            <div class="vs">vs</div>
            <div class="team-column">
                <div class="record" style="font-weight: bold; font-size: 2rem; ${tied ? "" : awayIsWinner ? "" : "color: grey;"}">${awayRecord}</div>
                <div class="team-line">
                <span class="seed" style="color: grey; font-size: 0.9rem;">${awaySeed}</span>
                <span class="abbrev" style="${inProgress ? "" : tied ? "" : awayIsWinner ? "" : "color: grey;"}">${awayAbbrev}</span>
                </div>
            </div>
            <img src="${awayLogo}" alt="${awayAbbrev}" style="width: 40px; height: 40px; margin-left: -10px;">
            </div>
          </div>
        `;
      } else {
        matchupRow.innerHTML = `
        <div class="series-info">
          ${seriesInfo}
        </div>
        <div class="team-row">
          <img src="${homeLogo}" alt="${homeAbbrev}" style="width: 20px; height: 20px; margin-right: 5px;">
          <span class="team-seed" style="color: grey;">${homeSeed}</span>
          <span class="team-name" style="${inProgress ? "" : tied ? "" : homeIsWinner ? "" : "color: grey;"}">${homeName}</span>
          <span class="team-record" style="${tied ? "" : homeIsWinner ? "" : "color: grey;"}">${homeRecord}</span>
        </div>
        <div class="team-row">
          <img src="${awayLogo}" alt="${awayAbbrev}" style="width: 20px; height: 20px; margin-right: 5px;">
          <span class="team-seed" style="color: grey;">${awaySeed}</span>
          <span class="team-name" style="${inProgress ? "" : tied ? "" : awayIsWinner ? "" : "color: grey;"}">${awayName}</span>
          <span class="team-record" style="${tied ? "" : awayIsWinner ? "" : "color: grey;"}">${awayRecord}</span>
        </div>
      `;
      }

      roundDiv.appendChild(matchupRow);
    });

    return roundDiv;
  };

  const renderConferenceRounds = (conferenceRounds, conferenceClass) => {
    return [
      renderRoundColumn(conferenceRounds["1st Round"], "1st Round", conferenceClass),
      renderRoundColumn(conferenceRounds["Semifinals"], "Semifinals", conferenceClass),
      renderRoundColumn(conferenceRounds["Finals"], "Finals", conferenceClass)
    ];
  };

  const eastRounds = renderConferenceRounds(rounds.east, "east");
  const westRounds = renderConferenceRounds(rounds.west, "west");
  const finalsDiv = renderRoundColumn(rounds.finals, "NBA Finals", "finals");

  // Append rounds in the correct horizontal order
  container.appendChild(westRounds[0]); // West 1st Round
  container.appendChild(westRounds[1]); // West Semifinals
  container.appendChild(westRounds[2]); // West Finals
  container.appendChild(finalsDiv);     // NBA Finals
  container.appendChild(eastRounds[2]); // East Finals
  container.appendChild(eastRounds[1]); // East Semifinals
  container.appendChild(eastRounds[0]); // East 1st Round
}

function getRoundTitle(roundType) {
  switch (parseInt(roundType, 10)) {
    case 4: return "1st Round";
    case 3: return "Semifinals";
    case 2: return "Finals";
    case 1: return "NBA Finals";
    default: return "Unknown Round";
  }
}

async function initializeBracket() {
  const games = await fetchPlayoffData();
  renderBracket(games);
}

initializeBracket();
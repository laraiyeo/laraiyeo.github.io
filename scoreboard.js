const BASE_URL = "https://statsapi.mlb.com";

const teamAbbrMap = {
  "Arizona Diamondbacks": "ari_d", "Atlanta Braves": "atl_l", "Baltimore Orioles": "bal_l", "Boston Red Sox": "bos_d",
  "Chicago White Sox": "cws_d", "Chicago Cubs": "chc_d", "Cincinnati Reds": "cin_d", "Cleveland Guardians": "cle_l",
  "Colorado Rockies": "col_d", "Detroit Tigers": "det_d", "Houston Astros": "hou_d", "Kansas City Royals": "kc_d",
  "Los Angeles Angels": "laa_d", "Los Angeles Dodgers": "lad_l", "Miami Marlins": "mia_d", "Milwaukee Brewers": "mil_d",
  "Minnesota Twins": "min_d", "New York Yankees": "nyy_d", "New York Mets": "nym_d", "Athletics": "oak_l",
  "Philadelphia Phillies": "phi_l", "Pittsburgh Pirates": "pit_d", "San Diego Padres": "sd_d", "San Francisco Giants": "sf_d",
  "Seattle Mariners": "sea_d", "St. Louis Cardinals": "stl_d", "Tampa Bay Rays": "tb_d", "Texas Rangers": "tex_d",
  "Toronto Blue Jays": "tor_l", "Washington Nationals": "wsh_d"
};

async function getLogoUrl(teamName) {
  const abbr = teamAbbrMap[teamName];
  if (!abbr) return "";
  const darkUrl = `https://raw.githubusercontent.com/MLBAMGames/mlb_teams_logo_svg/main/dark/${abbr}.svg`;
  const lightUrl = `https://raw.githubusercontent.com/MLBAMGames/mlb_teams_logo_svg/main/light/${abbr}.svg`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(darkUrl);
    img.onerror = () => resolve(lightUrl);
    img.src = darkUrl;
  });
}

function getQueryParam(param) {
  return new URLSearchParams(window.location.search).get(param);
}

function ordinalSuffix(n) {
  if (n > 3 && n < 21) return n + "th";
  switch (n % 10) {
    case 1: return n + "st";
    case 2: return n + "nd";
    case 3: return n + "rd";
    default: return n + "th";
  }
}

function renderBases(runners) {
  return `
    <div class="diamond">
      <div class="base second ${runners.second ? "occupied" : ""}"></div>
      <div class="base third ${runners.third ? "occupied" : ""}"></div>
      <div class="base first ${runners.first ? "occupied" : ""}"></div>
    </div>
  `;
}

function renderCount(balls, strikes, outs) {
  return `
    <div class="count-display">
      Balls: ${balls} | Strikes: ${strikes} <br>Outs: ${"🔴".repeat(outs)}${"⚪".repeat(3 - outs)}
    </div>
  `;
}

async function renderTopScoreboard(away, home, awayTeamData, homeTeamData, state, count, runners) {
  const awayLogo = await getLogoUrl(away.team.name);
  const homeLogo = await getLogoUrl(home.team.name);
  const inningText = `${state.isTopInning ? "Top" : "Bottom"} ${ordinalSuffix(state.inning)}`;

  const awayRecord = awayTeamData.record?.leagueRecord;
  const homeRecord = homeTeamData.record?.leagueRecord;

  document.getElementById("topScoreboard").innerHTML = `
    <div class="team-block">
      <div class="team-score">${away.teamStats.batting.runs}</div>
      <img class="team-logo" src="${awayLogo}" alt="${awayTeamData.teamName}">
      <div class="team-abbr">${awayTeamData.teamName}</div>
      <div class="team-record">${awayRecord ? `${awayRecord.wins}-${awayRecord.losses}` : "Record unavailable"}</div>
    </div>

    <div class="inning-center">
      <div class="inning-status">${inningText}</div>
      ${renderBases(runners)}
      ${renderCount(count.balls, count.strikes, count.outs)}
    </div>

    <div class="team-block">
      <div class="team-score">${home.teamStats.batting.runs}</div>
      <img class="team-logo" src="${homeLogo}" alt="${homeTeamData.teamName}">
      <div class="team-abbr">${homeTeamData.teamName}</div>
      <div class="team-record">${homeRecord ? `${homeRecord.wins}-${homeRecord.losses}` : "Record unavailable"}</div>
    </div>
  `;
}

function renderLinescoreTable(linescore, awayName, homeName) {
  const table = document.getElementById("linescoreTable");

  // Determine the innings to display based on screen size
  const isSmallScreen = window.innerWidth <= 475;
  const currentInning = linescore.currentInning || 1;
  const innings = isSmallScreen
    ? Array.from({ length: 3 }, (_, i) => linescore.innings[currentInning - 3 + i] || { num: currentInning - 2 + i, away: {}, home: {} })
    : Array.from({ length: 9 }, (_, i) => linescore.innings[i] || { num: i + 1, away: {}, home: {} });

  // Generate inning headers
  const inningHeaders = innings.map(inning => `<th>${inning.num}</th>`).join("");

  // Generate away team scores
  const awayScores = innings.map(inning => `<td>${inning.away?.runs ?? "-"}</td>`).join("");

  // Generate home team scores
  const homeScores = innings.map(inning => `<td>${inning.home?.runs ?? "-"}</td>`).join("");

  // Render the linescore table
  table.innerHTML = `
    <table>
      <thead>
        <tr>
          <th></th>
          ${inningHeaders}
          <th></th> <!-- Break between innings and totals -->
          <th>R</th>
          <th>H</th>
          <th>E</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${awayName}</td>
          ${awayScores}
          <td></td> <!-- Break between innings and totals -->
          <td>${linescore.teams.away.runs}</td>
          <td>${linescore.teams.away.hits}</td>
          <td>${linescore.teams.away.errors}</td>
        </tr>
        <tr>
          <td>${homeName}</td>
          ${homeScores}
          <td></td> <!-- Break between innings and totals -->
          <td>${linescore.teams.home.runs}</td>
          <td>${linescore.teams.home.hits}</td>
          <td>${linescore.teams.home.errors}</td>
        </tr>
      </tbody>
    </table>
  `;
}

async function renderPlayerStats(title, headers, players, isPitching = false, battingOrder = [], teamType = "") {
  // Adjust headers for small screens
  const isSmallScreen = window.innerWidth <= 475;
  const filteredHeaders = isSmallScreen
    ? headers.filter(h => (isPitching ? ["IP", "BB", "K"].includes(h.label) : ["AB", "R", "H"].includes(h.label)))
    : headers;

  const cols = filteredHeaders.map(h => `<th>${h.label}</th>`).join("");
  const rows = players.map(p => {
    const isSubbedOut = !isPitching && !battingOrder.includes(p.person.id);
    const rowClass = isSubbedOut ? "subbed-out" : "";

    // Handle position abbreviation
    const position = isPitching
      ? "" // Remove position for pitchers
      : `<span style="color: rgb(97, 97, 97);">${p.position.abbreviation}</span>`; // Style position for batters

    const name = `<td>${p.person.fullName} ${position}</td>`;
    const stats = filteredHeaders.map(h => {
      let value;
      if (h.key === "era" || h.key === "avg") {
        value = p.seasonStats?.[isPitching ? "pitching" : "batting"]?.[h.key];
      } else {
        value = p.stats?.[isPitching ? "pitching" : "batting"]?.[h.key];
      }
      return `<td>${value ?? "-"}</td>`;
    }).join("");

    return `<tr class="${rowClass}">${name}${stats}</tr>`;
  }).join("");

  return `
    <div class="stat-section">
      <h3>${title}</h3>
      <table>
        <thead><tr><th>Player</th>${cols}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

let lastScoreboardHash = null;

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

async function fetchAndUpdateScoreboard(gamePk) {
  try {
    const res = await fetch(`${BASE_URL}/api/v1.1/game/${gamePk}/feed/live`);
    const text = await res.text();
    const newHash = hashString(text);

    if (newHash === lastScoreboardHash) {
      return; // No changes, skip update
    }
    lastScoreboardHash = newHash;

    const data = JSON.parse(text);
    const { boxscore } = data.liveData;
    const { linescore } = data.liveData;
    const currentPlay = data.liveData.plays.currentPlay;
    const baseState = linescore.offense || {};
    const count = currentPlay.count;

    const away = boxscore.teams.away;
    const home = boxscore.teams.home;

    const awayTeamData = data.gameData.teams.away;
    const homeTeamData = data.gameData.teams.home;

    // Fetch small team logos
    const awayLogo = await getLogoUrl(away.team.name);
    const homeLogo = await getLogoUrl(home.team.name);

    await renderTopScoreboard(
      away,
      home,
      awayTeamData,
      homeTeamData,
      currentPlay.about,
      count,
      {
        first: !!baseState.first,
        second: !!baseState.second,
        third: !!baseState.third
      }
    );

    renderLinescoreTable(linescore, awayTeamData.abbreviation, homeTeamData.abbreviation);

    const playerStatsDiv = document.getElementById("playerStats");

    // Filter out pitchers from batters
    const awayBatters = away.batters
      .map(id => away.players[`ID${id}`])
      .filter(player => player && player.position.abbreviation !== "P");
    const homeBatters = home.batters
      .map(id => home.players[`ID${id}`])
      .filter(player => player && player.position.abbreviation !== "P");

    const awayPitchers = away.pitchers.map(id => away.players[`ID${id}`]).filter(Boolean);
    const homePitchers = home.pitchers.map(id => home.players[`ID${id}`]).filter(Boolean);

    playerStatsDiv.innerHTML = `
    <div class="stat-section">
      <h3><img src="${awayLogo}" alt="Away Team Logo" class="small-team-logo"> ${awayTeamData.teamName} Hitting</h3>
      ${await renderPlayerStats("", [
        { label: "AB", key: "atBats" },
        { label: "R", key: "runs" },
        { label: "H", key: "hits" },
        { label: "RBI", key: "rbi" },
        { label: "HR", key: "homeRuns" },
        { label: "BB", key: "baseOnBalls" },
        { label: "K", key: "strikeOuts" },
        { label: "AVG", key: "avg" }
      ], awayBatters, false, away.battingOrder)}

      <h3><img src="${awayLogo}" alt="Away Team Logo" class="small-team-logo"> ${awayTeamData.teamName} Pitching</h3>
      ${await renderPlayerStats("", [
        { label: "IP", key: "inningsPitched" },
        { label: "H", key: "hits" },
        { label: "R", key: "runs" },
        { label: "ER", key: "earnedRuns" },
        { label: "BB", key: "baseOnBalls" },
        { label: "HR", key: "homeRuns" },
        { label: "K", key: "strikeOuts" },
        { label: "ERA", key: "era" }
      ], awayPitchers, true)}
      <br><br><br><br>
      <h3><img src="${homeLogo}" alt="Home Team Logo" class="small-team-logo"> ${homeTeamData.teamName} Hitting</h3>
      ${await renderPlayerStats("", [
        { label: "AB", key: "atBats" },
        { label: "R", key: "runs" },
        { label: "H", key: "hits" },
        { label: "RBI", key: "rbi" },
        { label: "HR", key: "homeRuns" },
        { label: "BB", key: "baseOnBalls" },
        { label: "K", key: "strikeOuts" },
        { label: "AVG", key: "avg" }
      ], homeBatters, false, home.battingOrder)}

      <h3><img src="${homeLogo}" alt="Home Team Logo" class="small-team-logo"> ${homeTeamData.teamName} Pitching</h3>
      ${await renderPlayerStats("", [
        { label: "IP", key: "inningsPitched" },
        { label: "H", key: "hits" },
        { label: "R", key: "runs" },
        { label: "ER", key: "earnedRuns" },
        { label: "BB", key: "baseOnBalls" },
        { label: "HR", key: "homeRuns" },
        { label: "K", key: "strikeOuts" },
        { label: "ERA", key: "era" }
      ], homePitchers, true)}
    </div>
    `;
  } catch (error) {
    console.error("Failed to load scoreboard:", error);
    document.getElementById("scoreboardContainer").innerHTML = "<p>Error loading game data.</p>";
  }
}

function startScoreboardUpdates(gamePk) {
  fetchAndUpdateScoreboard(gamePk);
  setInterval(() => fetchAndUpdateScoreboard(gamePk), 2000); // Poll every 2 seconds
}

const gamePk = getQueryParam("gamePk");
if (gamePk) {
  startScoreboardUpdates(gamePk);
} else {
  document.getElementById("scoreboardContainer").innerHTML = "<p>No game selected.</p>";
}

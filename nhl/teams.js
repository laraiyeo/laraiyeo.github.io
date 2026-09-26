const teamColors = {
  24: "#F47A38",
  53: "#8C2633",
  6: "#FFB81C",
  7: "#002654",
  20: "#C8102E",
  12: "#CC0000",
  16: "#CF0A2C",
  21: "#6F263D",
  29: "#041E42",
  25: "#006847",
  17: "#CE1126",
  22: "#041E42",
  13: "#041E42",
  26: "#111111",
  30: "#154734",
  8: "#AF1E2D",
  18: "#FFB81C",
  1: "#CE1126",
  2: "#00539B",
  3: "#0038A8",
  9: "#C8102E",
  4: "#F74902",
  5: "#FCB514",
  28: "#006D75",
  55: "#001628",
  19: "#002F87",
  14: "#002868",
  10: "#00205B",
  23: "#00205B",
  54: "#B4975A",
  15: "#041E42",
  52: "#041E42",
};

const teamData = {
  data: [
    {
      id: 32,
      franchiseId: 27,
      fullName: "Quebec Nordiques",
      leagueId: 133,
      rawTricode: "QUE",
      triCode: "QUE",
    },
    {
      id: 8,
      franchiseId: 1,
      fullName: "Montréal Canadiens",
      leagueId: 133,
      rawTricode: "MTL",
      triCode: "MTL",
    },
    {
      id: 58,
      franchiseId: 5,
      fullName: "Toronto St. Patricks",
      leagueId: 133,
      rawTricode: "TSP",
      triCode: "TSP",
    },
    {
      id: 7,
      franchiseId: 19,
      fullName: "Buffalo Sabres",
      leagueId: 133,
      rawTricode: "BUF",
      triCode: "BUF",
    },
    {
      id: 46,
      franchiseId: 13,
      fullName: "Oakland Seals",
      leagueId: 133,
      rawTricode: "OAK",
      triCode: "OAK",
    },
    {
      id: 48,
      franchiseId: 23,
      fullName: "Kansas City Scouts",
      leagueId: 133,
      rawTricode: "KCS",
      triCode: "KCS",
    },
    {
      id: 36,
      franchiseId: 3,
      fullName: "Ottawa Senators (1917)",
      leagueId: 133,
      rawTricode: "SEN",
      triCode: "SEN",
    },
    {
      id: 70,
      franchiseId: null,
      fullName: "To be determined",
      leagueId: 133,
      rawTricode: "TBD",
      triCode: "TBD",
    },
    {
      id: 11,
      franchiseId: 35,
      fullName: "Atlanta Thrashers",
      leagueId: 133,
      rawTricode: "ATL",
      triCode: "ATL",
    },
    {
      id: 45,
      franchiseId: 3,
      fullName: "St. Louis Eagles",
      leagueId: 133,
      rawTricode: "SLE",
      triCode: "SLE",
    },
    {
      id: 33,
      franchiseId: 28,
      fullName: "Winnipeg Jets (1979)",
      leagueId: 133,
      rawTricode: "WIN",
      triCode: "WIN",
    },
    {
      id: 28,
      franchiseId: 29,
      fullName: "San Jose Sharks",
      leagueId: 133,
      rawTricode: "SJS",
      triCode: "SJS",
    },
    {
      id: 42,
      franchiseId: 4,
      fullName: "Quebec Bulldogs",
      leagueId: 133,
      rawTricode: "QBD",
      triCode: "QBD",
    },
    {
      id: 53,
      franchiseId: 28,
      fullName: "Arizona Coyotes",
      leagueId: 133,
      rawTricode: "ARI",
      triCode: "ARI",
    },
    {
      id: 13,
      franchiseId: 33,
      fullName: "Florida Panthers",
      leagueId: 133,
      rawTricode: "FLA",
      triCode: "FLA",
    },
    {
      id: 12,
      franchiseId: 26,
      fullName: "Carolina Hurricanes",
      leagueId: 133,
      rawTricode: "CAR",
      triCode: "CAR",
    },
    {
      id: 52,
      franchiseId: 35,
      fullName: "Winnipeg Jets",
      leagueId: 133,
      rawTricode: "WPG",
      triCode: "WPG",
    },
    {
      id: 18,
      franchiseId: 34,
      fullName: "Nashville Predators",
      leagueId: 133,
      rawTricode: "NSH",
      triCode: "NSH",
    },
    {
      id: 27,
      franchiseId: 28,
      fullName: "Phoenix Coyotes",
      leagueId: 133,
      rawTricode: "PHX",
      triCode: "PHX",
    },
    {
      id: 41,
      franchiseId: 2,
      fullName: "Montreal Wanderers",
      leagueId: 133,
      rawTricode: "MWN",
      triCode: "MWN",
    },
    {
      id: 39,
      franchiseId: 9,
      fullName: "Philadelphia Quakers",
      leagueId: 133,
      rawTricode: "QUA",
      triCode: "QUA",
    },
    {
      id: 37,
      franchiseId: 4,
      fullName: "Hamilton Tigers",
      leagueId: 133,
      rawTricode: "HAM",
      triCode: "HAM",
    },
    {
      id: 40,
      franchiseId: 12,
      fullName: "Detroit Cougars",
      leagueId: 133,
      rawTricode: "DCG",
      triCode: "DCG",
    },
    {
      id: 35,
      franchiseId: 23,
      fullName: "Colorado Rockies",
      leagueId: 133,
      rawTricode: "CLR",
      triCode: "CLR",
    },
    {
      id: 38,
      franchiseId: 9,
      fullName: "Pittsburgh Pirates",
      leagueId: 133,
      rawTricode: "PIR",
      triCode: "PIR",
    },
    {
      id: 34,
      franchiseId: 26,
      fullName: "Hartford Whalers",
      leagueId: 133,
      rawTricode: "HFD",
      triCode: "HFD",
    },
    {
      id: 1,
      franchiseId: 23,
      fullName: "New Jersey Devils",
      leagueId: 133,
      rawTricode: "NJD",
      triCode: "NJD",
    },
    {
      id: 9,
      franchiseId: 30,
      fullName: "Ottawa Senators",
      leagueId: 133,
      rawTricode: "OTT",
      triCode: "OTT",
    },
    {
      id: 21,
      franchiseId: 27,
      fullName: "Colorado Avalanche",
      leagueId: 133,
      rawTricode: "COL",
      triCode: "COL",
    },
    {
      id: 44,
      franchiseId: 8,
      fullName: "New York Americans",
      leagueId: 133,
      rawTricode: "NYA",
      triCode: "NYA",
    },
    {
      id: 15,
      franchiseId: 24,
      fullName: "Washington Capitals",
      leagueId: 133,
      rawTricode: "WSH",
      triCode: "WSH",
    },
    {
      id: 31,
      franchiseId: 15,
      fullName: "Minnesota North Stars",
      leagueId: 133,
      rawTricode: "MNS",
      triCode: "MNS",
    },
    {
      id: 99,
      franchiseId: null,
      fullName: "NHL",
      leagueId: 133,
      rawTricode: "NHL",
      triCode: "NHL",
    },
    {
      id: 43,
      franchiseId: 7,
      fullName: "Montreal Maroons",
      leagueId: 133,
      rawTricode: "MMR",
      triCode: "MMR",
    },
    {
      id: 49,
      franchiseId: 13,
      fullName: "Cleveland Barons",
      leagueId: 133,
      rawTricode: "CLE",
      triCode: "CLE",
    },
    {
      id: 51,
      franchiseId: 8,
      fullName: "Brooklyn Americans",
      leagueId: 133,
      rawTricode: "BRK",
      triCode: "BRK",
    },
    {
      id: 50,
      franchiseId: 12,
      fullName: "Detroit Falcons",
      leagueId: 133,
      rawTricode: "DFL",
      triCode: "DFL",
    },
    {
      id: 56,
      franchiseId: 13,
      fullName: "California Golden Seals",
      leagueId: 133,
      rawTricode: "CGS",
      triCode: "CGS",
    },
    {
      id: 47,
      franchiseId: 21,
      fullName: "Atlanta Flames",
      leagueId: 133,
      rawTricode: "AFM",
      triCode: "AFM",
    },
    {
      id: 57,
      franchiseId: 5,
      fullName: "Toronto Arenas",
      leagueId: 133,
      rawTricode: "TAN",
      triCode: "TAN",
    },
    {
      id: 19,
      franchiseId: 18,
      fullName: "St. Louis Blues",
      leagueId: 133,
      rawTricode: "STL",
      triCode: "STL",
    },
    {
      id: 17,
      franchiseId: 12,
      fullName: "Detroit Red Wings",
      leagueId: 133,
      rawTricode: "DET",
      triCode: "DET",
    },
    {
      id: 3,
      franchiseId: 10,
      fullName: "New York Rangers",
      leagueId: 133,
      rawTricode: "NYR",
      triCode: "NYR",
    },
    {
      id: 24,
      franchiseId: 32,
      fullName: "Anaheim Ducks",
      leagueId: 133,
      rawTricode: "ANA",
      triCode: "ANA",
    },
    {
      id: 16,
      franchiseId: 11,
      fullName: "Chicago Blackhawks",
      leagueId: 133,
      rawTricode: "CHI",
      triCode: "CHI",
    },
    {
      id: 55,
      franchiseId: 39,
      fullName: "Seattle Kraken",
      leagueId: 133,
      rawTricode: "SEA",
      triCode: "SEA",
    },
    {
      id: 5,
      franchiseId: 17,
      fullName: "Pittsburgh Penguins",
      leagueId: 133,
      rawTricode: "PIT",
      triCode: "PIT",
    },
    {
      id: 6,
      franchiseId: 6,
      fullName: "Boston Bruins",
      leagueId: 133,
      rawTricode: "BOS",
      triCode: "BOS",
    },
    {
      id: 25,
      franchiseId: 15,
      fullName: "Dallas Stars",
      leagueId: 133,
      rawTricode: "DAL",
      triCode: "DAL",
    },
    {
      id: 14,
      franchiseId: 31,
      fullName: "Tampa Bay Lightning",
      leagueId: 133,
      rawTricode: "TBL",
      triCode: "TBL",
    },
    {
      id: 4,
      franchiseId: 16,
      fullName: "Philadelphia Flyers",
      leagueId: 133,
      rawTricode: "PHI",
      triCode: "PHI",
    },
    {
      id: 30,
      franchiseId: 37,
      fullName: "Minnesota Wild",
      leagueId: 133,
      rawTricode: "MIN",
      triCode: "MIN",
    },
    {
      id: 29,
      franchiseId: 36,
      fullName: "Columbus Blue Jackets",
      leagueId: 133,
      rawTricode: "CBJ",
      triCode: "CBJ",
    },
    {
      id: 2,
      franchiseId: 22,
      fullName: "New York Islanders",
      leagueId: 133,
      rawTricode: "NYI",
      triCode: "NYI",
    },
    {
      id: 23,
      franchiseId: 20,
      fullName: "Vancouver Canucks",
      leagueId: 133,
      rawTricode: "VAN",
      triCode: "VAN",
    },
    {
      id: 26,
      franchiseId: 14,
      fullName: "Los Angeles Kings",
      leagueId: 133,
      rawTricode: "LAK",
      triCode: "LAK",
    },
    {
      id: 68,
      franchiseId: 40,
      fullName: "Utah Mammoth",
      leagueId: 133,
      rawTricode: "UTA",
      triCode: "UTA",
    },
    {
      id: 59,
      franchiseId: 40,
      fullName: "Utah Hockey Club",
      leagueId: 133,
      rawTricode: "UTA",
      triCode: "UTA",
    },
    {
      id: 10,
      franchiseId: 5,
      fullName: "Toronto Maple Leafs",
      leagueId: 133,
      rawTricode: "TOR",
      triCode: "TOR",
    },
    {
      id: 22,
      franchiseId: 25,
      fullName: "Edmonton Oilers",
      leagueId: 133,
      rawTricode: "EDM",
      triCode: "EDM",
    },
    {
      id: 54,
      franchiseId: 38,
      fullName: "Vegas Golden Knights",
      leagueId: 133,
      rawTricode: "VGK",
      triCode: "VGK",
    },
    {
      id: 20,
      franchiseId: 21,
      fullName: "Calgary Flames",
      leagueId: 133,
      rawTricode: "CGY",
      triCode: "CGY",
    },
  ],
  total: 62,
};

async function getLogoUrl(triCode) {
  return `https://assets.nhle.com/logos/nhl/svg/${triCode}_dark.svg`;
}

// Convert hex color to rgba with opacity
function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Darken a hex color for gradient transitions
function darkenColor(hex, amount) {
  amount = amount || 35;
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// Build team-color gradient CSS string
function getTeamGradientStr(leftColor, rightColor, customBgColor, opacity) {
  const alpha = opacity / 100;
  const darkerLeft = darkenColor(leftColor);
  const darkerRight = darkenColor(rightColor);
  const leftRgba = hexToRgba(leftColor, alpha);
  const darkerLeftRgba = hexToRgba(darkerLeft, alpha);
  const darkerRightRgba = hexToRgba(darkerRight, alpha);
  const rightRgba = hexToRgba(rightColor, alpha);
  return `linear-gradient(to right, ${leftRgba}, ${darkerLeftRgba}, ${customBgColor}, ${darkerRightRgba}, ${rightRgba})`;
}

// Get gradient style + data attrs as inline string
function getGradientStyleAttrs(awayColor, homeColor) {
  var styles =
    typeof window !== "undefined" && window.getCustomStyles
      ? window.getCustomStyles()
      : {
          backgroundColor: "#000000",
          backgroundOpacity: 100,
          textColor: "#ffffff",
        };
  var gradient = getTeamGradientStr(
    awayColor,
    homeColor,
    styles.backgroundColor,
    styles.backgroundOpacity,
  );
  return (
    'style="background:' +
    gradient +
    ";color:" +
    styles.textColor +
    ';" data-away-color="' +
    awayColor +
    '" data-home-color="' +
    homeColor +
    '"'
  );
}

function getAdjustedDateForNHL() {
  const now = new Date();
  const estNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  if (estNow.getHours() < 2) {
    estNow.setDate(estNow.getDate() - 1);
  }
  const adjustedDate =
    estNow.getFullYear() +
    "-" +
    String(estNow.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(estNow.getDate()).padStart(2, "0");

  return adjustedDate.split("-").join(""); // Return in YYYYMMDD format
}

function wrapTeamName(name) {
  const words = name.split(" ");
  if (words.length > 1) {
    return `${words[0][0]}. ${words.slice(1).join(" ")}`;
  }
  return name;
}

async function buildGameCard(game) {
  const {
    id: gameId,
    awayTeam,
    homeTeam,
    gameState,
    startTimeUTC,
    seriesStatus,
    clock,
    periodDescriptor,
    period,
  } = game;
  const awayLogo = await getLogoUrl(awayTeam.abbrev);
  const homeLogo = await getLogoUrl(homeTeam.abbrev);

  const startTime = new Date(startTimeUTC).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const seriesInfo = seriesStatus?.seriesTitle
    ? `${seriesStatus.seriesTitle} - Game ${seriesStatus.gameNumberOfSeries || "N/A"}`
    : "";

  const awayRecord = awayTeam.record || "";
  const homeRecord = homeTeam.record || "";

  function getOrdinalSuffix(num) {
    if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
    switch (num % 10) {
      case 1:
        return `${num}st`;
      case 2:
        return `${num}nd`;
      case 3:
        return `${num}rd`;
      default:
        return `${num}th`;
    }
  }

  const awayIsWinner = awayTeam.score > homeTeam.score;
  const homeIsWinner = homeTeam.score > awayTeam.score;

  let gameSeriesInfo = "";

  const currentPeriod = periodDescriptor
    ? periodDescriptor.periodType === "OT"
      ? "OT"
      : `${getOrdinalSuffix(periodDescriptor.number)} Period`
    : "";

  const timeRemaining = clock?.timeRemaining || "00:00";

  if (["PRE", "FUT"].includes(gameState)) {
    // Scheduled game card
    return `
      <div class="game-card" ${getGradientStyleAttrs(teamColors[awayTeam.id] || "#000000", teamColors[homeTeam.id] || "#000000")}>
        <div style="font-size: 0.8rem; color: grey; text-align: center;">${seriesInfo}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 4px; flex-direction: column;">
              <span style="font-size: 0.9rem;">${awayRecord}</span>
              <img src="${awayLogo}" alt="${awayTeam.name}" style="width: 60px; height: 40px;">
            </div>
            <div style="margin-top: 6px; font-weight: bold;">${wrapTeamName(awayTeam.name)}</div>
          </div>
          <div style="font-size: 1.1rem; font-weight: bold;">${startTime}</div>
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 4px; flex-direction: column;">
              <span style="font-size: 0.9rem;">${homeRecord}</span>
              <img src="${homeLogo}" alt="${homeTeam.name}" style="width: 60px; height: 40px;">
            </div>
            <div style="margin-top: 6px; font-weight: bold;">${wrapTeamName(homeTeam.name)}</div>
          </div>
        </div>
      </div>
    `;
  } else if (["FINAL", "OFF"].includes(gameState)) {
    // Finished game card
    return `
      <div class="game-card" ${getGradientStyleAttrs(teamColors[awayTeam.id] || "#000000", teamColors[homeTeam.id] || "#000000")}>
        <div style="font-size: 0.8rem; color: grey; text-align: center;">${seriesInfo}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${awayLogo}" alt="${awayTeam.name}" style="width: 60px; height: 40px;">
              <span style="font-size: 2.3rem; ${awayIsWinner ? "font-weight: bold;" : ""}">${awayTeam.score}</span>
            </div>
            <div style="margin-top: 6px; ${awayIsWinner ? "font-weight: bold;" : ""}">${wrapTeamName(awayTeam.name)}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.1rem; font-weight: bold;">${periodDescriptor?.periodType === "OT" ? "Final/OT" : "Final"}</div>
            <div style="font-size: 0.9rem; color: grey; margin-top: 8px;">${gameSeriesInfo}</div>
          </div>
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 2.3rem; ${homeIsWinner ? "font-weight: bold;" : ""}">${homeTeam.score}</span>
              <img src="${homeLogo}" alt="${homeTeam.name}" style="width: 60px; height: 40px;">
            </div>
            <div style="margin-top: 6px; ${homeIsWinner ? "font-weight: bold;" : ""}">${wrapTeamName(homeTeam.name)}</div>
          </div>
        </div>
      </div>
    `;
  } else {
    // Game in progress card
    return `
      <div class="game-card" ${getGradientStyleAttrs(teamColors[awayTeam.id] || "#000000", teamColors[homeTeam.id] || "#000000")}>
        <div style="font-size: 0.8rem; color: grey; text-align: center;">${seriesInfo}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${awayLogo}" alt="${awayTeam.name}" style="width: 60px; height: 40px;">
              <span style="font-size: 2.3rem; ${awayIsWinner ? "font-weight: bold;" : ""}">${awayTeam.score}</span>
            </div>
            <div style="margin-top: 6px; ${awayIsWinner ? "font-weight: bold;" : ""}">${wrapTeamName(awayTeam.name)}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.3rem; font-weight: bold; margin-top: 12px;">${timeRemaining}</div>
            <div style="font-size: 0.8rem; color: grey; margin-top: 8px;">${currentPeriod}</div>
            <div style="font-size: 0.6rem; color: grey; margin-top: 4px;">${gameSeriesInfo}</div>
          </div>
          <div style="text-align: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 2.3rem; ${homeIsWinner ? "font-weight: bold;" : ""}">${homeTeam.score}</span>
              <img src="${homeLogo}" alt="${homeTeam.name}" style="width: 60px; height: 40px;">
            </div>
            <div style="margin-top: 6px; ${homeIsWinner ? "font-weight: bold;" : ""}">${wrapTeamName(homeTeam.name)}</div>
          </div>
        </div>
      </div>
    `;
  }
}

let lastScheduleHash = null;

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return hash;
}

let updateInterval;

async function fetchGames() {
  const today = getAdjustedDateForNHL();
  const url = `https://sportsheart-hockey.up.railway.app/nhl/scoreboard/${today}`;

  try {
    const res = await fetch(url);
    const text = await res.text();
    const newHash = hashString(text);

    if (newHash === lastScheduleHash) {
      // No structural changes — just re-render to update clock.timeRemaining
      return;
    }
    lastScheduleHash = newHash;

    const gamesData = JSON.parse(text);
    const games = gamesData?.games || [];

    // Check if all games are finished
    const allGamesFinished =
      games.length > 0 &&
      games.every((game) => ["FINAL", "OFF"].includes(game.gameState));

    const teams = teamData?.data?.filter((team) => teamColors[team.id]) || [];

    const container = document.getElementById("gamesContainer");

    if (!container) {
      console.error("Error: Element with ID 'gamesContainer' not found.");
      return;
    }

    container.innerHTML = ""; // Clear previous content

    // Sort teams alphabetically by full name
    const sortedTeams = teams.sort((a, b) =>
      a.fullName.localeCompare(b.fullName),
    );

    for (const team of sortedTeams) {
      const teamCard = document.createElement("div");
      teamCard.className = "team-section";
      teamCard.style.backgroundColor = teamColors[team.id] || "#000";

      const logoUrl = await getLogoUrl(team.triCode);
      teamCard.innerHTML = `
        <div class="team-header">
          <img src="${logoUrl}" alt="${team.fullName}" class="team-logo">
          <h2>${team.fullName}</h2>
        </div>
        <div class="team-games"></div>
      `;

      // Fetch and display games for the team
      const teamGamesContainer = teamCard.querySelector(".team-games");
      const teamGames = games.filter(
        (game) => game.awayTeam.id === team.id || game.homeTeam.id === team.id,
      );

      if (teamGames.length > 0) {
        for (const game of teamGames) {
          const gameCardHtml = await buildGameCard(game);
          const gameCard = document.createElement("div");
          gameCard.innerHTML = gameCardHtml;
          gameCard.setAttribute("data-game-id", game.id); // Add game ID for dynamic updates
          teamGamesContainer.appendChild(gameCard);
        }
      } else {
        // No game scheduled card
        const teamColorHex = teamColors[team.id] || "#000000";
        const noGameCard = document.createElement("div");
        noGameCard.className = "game-card no-game-card";
        noGameCard.setAttribute("data-away-color", "#000000");
        noGameCard.setAttribute("data-home-color", teamColorHex);
        var noGameStyles =
          typeof window !== "undefined" && window.getCustomStyles
            ? window.getCustomStyles()
            : {
                backgroundColor: "#000000",
                backgroundOpacity: 100,
                textColor: "#ffffff",
              };
        var noGameGradient = getTeamGradientStr(
          "#000000",
          teamColorHex,
          noGameStyles.backgroundColor,
          noGameStyles.backgroundOpacity,
        );
        noGameCard.style.setProperty("background", noGameGradient, "important");
        noGameCard.style.setProperty(
          "color",
          noGameStyles.textColor,
          "important",
        );
        noGameCard.style.display = "flex";
        noGameCard.style.alignItems = "center";
        noGameCard.style.gap = "35px";
        noGameCard.style.padding = "20px";

        noGameCard.innerHTML = `
          <img src="${logoUrl}" alt="${team.fullName} logo" style="width: 80px; height: 70px;">
          <div style="font-weight: bold; font-size: 1.2rem;">No game scheduled <br> for today</div>
        `;

        teamGamesContainer.appendChild(noGameCard);
      }

      container.appendChild(teamCard);

      // Add OBS link copying functionality
      teamCard.addEventListener("click", async () => {
        const currentStyles = loadSavedStyles();
        const styleParams = new URLSearchParams({
          team: team.triCode,
          bgColor: currentStyles.backgroundColor,
          bgOpacity: currentStyles.backgroundOpacity,
          textColor: currentStyles.textColor,
        });
        const url = `https://sportsheart.ca/nhl/team.html?${styleParams.toString()}`;
        try {
          await navigator.clipboard.writeText(url);
          alert(`OBS link copied for ${team.fullName}: ${url}`);
        } catch (err) {
          console.error("Failed to copy OBS link:", err);
        }
      });
    }

    // Return true if all games are finished
    return allGamesFinished;
  } catch (err) {
    console.error("Error fetching games:", err);
    return true; // Stop fetching on error
  }
}

const updateGames = async () => {
  const allFinished = await fetchGames();
  if (allFinished && updateInterval) {
    clearInterval(updateInterval);
    console.log("All games are finished. Stopped fetching updates.");
  }
};

updateGames(); // Initial fetch
updateInterval = setInterval(updateGames, 10000);

// Game Card Customization functionality
const defaultStyles = {
  backgroundColor: "#000000",
  backgroundOpacity: 100,
  textColor: "#ffffff",
};

// Load saved styles or use defaults
function loadSavedStyles() {
  // Check for URL parameters first
  const urlParams = new URLSearchParams(window.location.search);
  const urlBgColor = urlParams.get("bgColor");
  const urlBgOpacity = urlParams.get("bgOpacity");
  const urlTextColor = urlParams.get("textColor");

  if (urlBgColor || urlBgOpacity || urlTextColor) {
    return {
      backgroundColor: urlBgColor || defaultStyles.backgroundColor,
      backgroundOpacity:
        urlBgOpacity !== null
          ? parseInt(urlBgOpacity)
          : defaultStyles.backgroundOpacity,
      textColor: urlTextColor || defaultStyles.textColor,
    };
  }

  const saved = localStorage.getItem("nhl-game-card-styles");
  return saved ? JSON.parse(saved) : defaultStyles;
}

// Check if we're in URL parameter mode (styles locked by OBS link)
function isUrlParameterMode() {
  const urlParams = new URLSearchParams(window.location.search);
  return (
    urlParams.has("bgColor") ||
    urlParams.has("bgOpacity") ||
    urlParams.has("textColor")
  );
}

// Save styles to localStorage (only if not in URL parameter mode)
function saveStyles(styles) {
  if (!isUrlParameterMode()) {
    localStorage.setItem("nhl-game-card-styles", JSON.stringify(styles));
  }
}

// Apply styles to all game cards
function applyStylesToCards(styles) {
  const gameCards = document.querySelectorAll(".game-card");
  gameCards.forEach((card) => {
    const awayColor = card.getAttribute("data-away-color") || "#000000";
    const homeColor = card.getAttribute("data-home-color") || "#000000";
    const gradient = getTeamGradientStr(
      awayColor,
      homeColor,
      styles.backgroundColor,
      styles.backgroundOpacity,
    );
    card.style.setProperty("background", gradient, "important");
    card.style.setProperty("color", styles.textColor, "important");
  });
}

// Validate hex color
function isValidHex(hex) {
  return /^#[0-9A-F]{6}$/i.test(hex);
}

// Update preview colors
function updatePreviews(styles) {
  document.getElementById("bg-preview").style.backgroundColor =
    styles.backgroundColor;
  document.getElementById("text-preview").style.backgroundColor =
    styles.textColor;
}

// Set up customization controls
function initializeCustomization() {
  const currentStyles = loadSavedStyles();
  const urlMode = isUrlParameterMode();

  // Get control elements
  const bgColorPicker = document.getElementById("bg-color-picker");
  const bgColorHex = document.getElementById("bg-color-hex");
  const bgOpacitySlider = document.getElementById("bg-opacity-slider");
  const bgOpacityInput = document.getElementById("bg-opacity-input");
  const textColorPicker = document.getElementById("text-color-picker");
  const textColorHex = document.getElementById("text-color-hex");
  const resetButton = document.getElementById("reset-styles");

  // If in URL parameter mode, disable all controls and show message
  if (urlMode) {
    const panel =
      document.getElementById("customization-panel") ||
      document.querySelector(".customization-panel");
    if (panel) {
      panel.style.opacity = "0.6";
      panel.style.pointerEvents = "none";
      const message = document.createElement("div");
      message.style.cssText =
        "background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin-bottom: 10px; border-radius: 4px; color: #856404; font-weight: bold; text-align: center;";
      message.textContent =
        "🔒 Styles are locked by OBS link parameters. Controls are disabled.";
      panel.insertBefore(message, panel.firstChild);
    }
  }

  // Set initial values
  bgColorPicker.value = currentStyles.backgroundColor;
  bgColorHex.value = currentStyles.backgroundColor;
  bgOpacitySlider.value = currentStyles.backgroundOpacity;
  bgOpacityInput.value = currentStyles.backgroundOpacity;
  textColorPicker.value = currentStyles.textColor;
  textColorHex.value = currentStyles.textColor;

  updatePreviews(currentStyles);
  applyStylesToCards(currentStyles);

  // Background color picker change
  bgColorPicker.addEventListener("change", (e) => {
    if (urlMode) return;
    const color = e.target.value;
    bgColorHex.value = color;
    currentStyles.backgroundColor = color;
    updatePreviews(currentStyles);
    applyStylesToCards(currentStyles);
    saveStyles(currentStyles);
  });

  // Background color hex input change
  bgColorHex.addEventListener("input", (e) => {
    if (urlMode) return;
    const color = e.target.value;
    if (isValidHex(color)) {
      bgColorPicker.value = color;
      currentStyles.backgroundColor = color;
      updatePreviews(currentStyles);
      applyStylesToCards(currentStyles);
      saveStyles(currentStyles);
    }
  });

  // Background opacity slider change
  bgOpacitySlider.addEventListener("input", (e) => {
    if (urlMode) return;
    const opacity = parseInt(e.target.value);
    bgOpacityInput.value = opacity;
    currentStyles.backgroundOpacity = opacity;
    applyStylesToCards(currentStyles);
    saveStyles(currentStyles);
  });

  // Background opacity input change
  bgOpacityInput.addEventListener("input", (e) => {
    if (urlMode) return;
    const opacity = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
    bgOpacitySlider.value = opacity;
    e.target.value = opacity;
    currentStyles.backgroundOpacity = opacity;
    applyStylesToCards(currentStyles);
    saveStyles(currentStyles);
  });

  // Text color picker change
  textColorPicker.addEventListener("change", (e) => {
    if (urlMode) return;
    const color = e.target.value;
    textColorHex.value = color;
    currentStyles.textColor = color;
    updatePreviews(currentStyles);
    applyStylesToCards(currentStyles);
    saveStyles(currentStyles);
  });

  // Text color hex input change
  textColorHex.addEventListener("input", (e) => {
    if (urlMode) return;
    const color = e.target.value;
    if (isValidHex(color)) {
      textColorPicker.value = color;
      currentStyles.textColor = color;
      updatePreviews(currentStyles);
      applyStylesToCards(currentStyles);
      saveStyles(currentStyles);
    }
  });

  // Reset button
  resetButton.addEventListener("click", () => {
    if (urlMode) return;
    // Reset to defaults
    bgColorPicker.value = defaultStyles.backgroundColor;
    bgColorHex.value = defaultStyles.backgroundColor;
    bgOpacitySlider.value = defaultStyles.backgroundOpacity;
    bgOpacityInput.value = defaultStyles.backgroundOpacity;
    textColorPicker.value = defaultStyles.textColor;
    textColorHex.value = defaultStyles.textColor;

    // Update current styles - use explicit assignment for immediate reactivity
    currentStyles.backgroundColor = defaultStyles.backgroundColor;
    currentStyles.backgroundOpacity = defaultStyles.backgroundOpacity;
    currentStyles.textColor = defaultStyles.textColor;

    updatePreviews(currentStyles);
    applyStylesToCards(currentStyles);
    saveStyles(currentStyles);
  });

  // Re-apply styles periodically to catch any dynamically created cards
  setInterval(() => {
    const currentStyles = loadSavedStyles();
    applyStylesToCards(currentStyles);
  }, 5000);
}

// Initialize customization after DOM is loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeCustomization);
} else {
  initializeCustomization();
}

// Make functions available globally for the team.html page
window.getCustomStyles = loadSavedStyles;
window.applyCustomStyles = applyStylesToCards;

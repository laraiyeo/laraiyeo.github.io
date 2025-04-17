const BASE_URL = "https://statsapi.mlb.com";
const SCHEDULE_URL = `${BASE_URL}/api/v1/schedule/games/?sportId=1`;

// Team name to abbreviation for logo
const teamAbbrMap = {
    "Arizona Diamondbacks": "ari_l",
    "Atlanta Braves": "atl_l",
    "Baltimore Orioles": "bal_l",
    "Boston Red Sox": "bos_l",
    "Chicago White Sox": "cws_l",
    "Chicago Cubs": "chc_l",
    "Cincinnati Reds": "cin_l",
    "Cleveland Guardians": "cle_l",
    "Colorado Rockies": "col_l",
    "Detroit Tigers": "det_l",
    "Houston Astros": "hou_l",
    "Kansas City Royals": "kc_l",
    "Los Angeles Angels": "laa_l",
    "Los Angeles Dodgers": "lad_l",
    "Miami Marlins": "mia_l",
    "Milwaukee Brewers": "mil_l",
    "Minnesota Twins": "min_l",
    "New York Yankees": "nyy_l",
    "New York Mets": "nym_l",
    "Athletics": "oak_l",
    "Philadelphia Phillies": "phi_l",
    "Pittsburgh Pirates": "pit_l",
    "San Diego Padres": "sd_l",
    "San Francisco Giants": "sf_l",
    "Seattle Mariners": "sea_l",
    "St. Louis Cardinals": "stl_l",
    "Tampa Bay Rays": "tb_l",
    "Texas Rangers": "tex_l",
    "Toronto Blue Jays": "tor_l",
    "Washington Nationals": "wsh_l"
};

function getOrdinalSuffix(num) {
    if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
    switch (num % 10) {
        case 1: return `${num}st`;
        case 2: return `${num}nd`;
        case 3: return `${num}rd`;
        default: return `${num}th`;
    }
}

function getLogoUrl(teamName) {
    const abbr = teamAbbrMap[teamName];
    if (!abbr) return ""; // fallback
    return `https://raw.githubusercontent.com/MLBAMGames/mlb_teams_logo_svg/main/light/${abbr}.svg`;
}

async function fetchLiveGame() {
    try {
        const res = await fetch(SCHEDULE_URL);
        const data = await res.json();
        const games = data.dates?.[0]?.games || [];

        const liveGames = games.filter(game => game.status.detailedState === "In Progress");

        const container = document.getElementById("gamesContainer");
        container.innerHTML = ""; // Clear previous games

        if (liveGames.length === 0) {
            container.innerHTML = "<p>No live games right now.</p>";
            return;
        }

        for (const game of liveGames) {
            const { gamePk, gameDate, teams, status } = game;
            const away = teams.away;
            const home = teams.home;

            const awayLogo = getLogoUrl(away.team.name);
            const homeLogo = getLogoUrl(home.team.name);

            const gameDiv = document.createElement("div");
            gameDiv.className = "game-block";
            gameDiv.innerHTML = `
                <div class="matchup">
                    <div class="team-column">
                        <img src="${awayLogo}" alt="${away.team.name}" class="team-logo">
                        <div class="team-score" id="awayScore-${gamePk}">${away.score}</div>
                    </div>
                    <div class="team-column">
                        <img src="${homeLogo}" alt="${home.team.name}" class="team-logo">
                        <div class="team-score" id="homeScore-${gamePk}">${home.score}</div>
                    </div>
                </div>
                <div class="state" id="state-${gamePk}">${status.detailedState} - ${new Date(gameDate).toLocaleTimeString()}</div>
                <div class="inningInfo" id="inningInfo-${gamePk}"></div>
                <div class="count" id="count-${gamePk}"></div>
            `;

            container.appendChild(gameDiv);

            // Bold the leading team
            const awayScoreEl = gameDiv.querySelector(`#awayScore-${gamePk}`);
            const homeScoreEl = gameDiv.querySelector(`#homeScore-${gamePk}`);
            awayScoreEl.style.fontWeight = "normal";
            homeScoreEl.style.fontWeight = "normal";

            if (away.score > home.score) {
                awayScoreEl.style.fontWeight = "bold";
            } else if (home.score > away.score) {
                homeScoreEl.style.fontWeight = "bold";
            }

            fetchGameDetails(gamePk);
        }
    } catch (err) {
        console.error("Error fetching game:", err);
    }
}

async function fetchGameDetails(gamePk) {
    try {
        const res = await fetch(`${BASE_URL}/api/v1.1/game/${gamePk}/feed/live`);
        const data = await res.json();

        const play = data.liveData?.plays?.currentPlay;
        if (!play) return;

        const { halfInning, isTopInning, inning } = play.about;
        const { balls, strikes, outs } = play.count;

        document.getElementById(`inningInfo-${gamePk}`).textContent =
            `Inning: ${isTopInning ? "Top" : "Bottom"} ${getOrdinalSuffix(inning)}`;

        document.getElementById(`count-${gamePk}`).textContent =
            `Balls: ${balls} • Strikes: ${strikes} • Outs: ${outs}`;
    } catch (err) {
        console.error(`Error fetching details for game ${gamePk}:`, err);
    }
}

fetchLiveGame();
setInterval(fetchLiveGame, 5000);

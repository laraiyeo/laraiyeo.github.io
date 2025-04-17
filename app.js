const BASE_URL = "https://statsapi.mlb.com";
const SCHEDULE_URL = `${BASE_URL}/api/v1/schedule/games/?sportId=1`;

async function fetchLiveGame() {
    try {
        const res = await fetch(SCHEDULE_URL);
        const data = await res.json();
        const games = data.dates?.[0]?.games || [];

        // Filter only games in progress
        const liveGame = games.find(game => game.status.detailedState === "In Progress");

        if (!liveGame) {
            document.getElementById("matchup").textContent = "No live games right now.";
            document.getElementById("state").textContent = "";
            document.getElementById("inningInfo").textContent = "";
            document.getElementById("count").textContent = "";
            return;
        }

        const { gamePk, gameDate, teams, status } = liveGame;
        const away = teams.away;
        const home = teams.home;
        const awaynameEl = document.getElementById("awayTeamName");
        const homenameEl = document.getElementById("homeTeamName");
        const awayScoreEl = document.getElementById("awayScore");
        const homeScoreEl = document.getElementById("homeScore");

        awaynameEl.textContent = away.team.name
        awayScoreEl.textContent = away.score;

        homenameEl.textContent = home.team.name
        homeScoreEl.textContent = home.score;

        document.getElementById("state").textContent = `${status.detailedState} - ${new Date(gameDate).toLocaleTimeString()}`;

        awaynameEl.style.fontWeight = "normal";
        awayScoreEl.style.fontWeight = "normal";
        homenameEl.style.fontWeight = "normal";
        homeScoreEl.style.fontWeight = "normal";

        if (away.score > home.score) {
            awayScoreEl.style.fontWeight = "bold";
            awaynameEl.style.fontWeight = "bold";
        } else if (home.score > away.score) {
            homeScoreEl.style.fontWeight = "bold";
            homenameEl.style.fontWeight = "bold";
        }

        fetchGameDetails(gamePk);
    } catch (err) {
        console.error("Error fetching game:", err);
        document.getElementById("matchup").textContent = "Error loading game.";
        document.getElementById("state").textContent = "";
        document.getElementById("inningInfo").textContent = "";
        document.getElementById("count").textContent = "";
    }
}


async function fetchGameDetails(gamePk) {
    try {
        const res = await fetch(`${BASE_URL}/api/v1.1/game/${gamePk}/feed/live`);
        const data = await res.json();

        const play = data.liveData?.plays?.currentPlay;
        if (!play) return;

        const { awayScore, homeScore } = play.result;
        const { halfInning, inning, isTopInning } = play.about;
        const { balls, strikes, outs } = play.count;

        document.getElementById("inningInfo").textContent = `Inning: ${isTopInning ? "Top" : "Bot"} ${inning}th`;
        document.getElementById("count").textContent = `Balls: ${balls} • Strikes: ${strikes} • Outs: ${outs}`;
    } catch (err) {
        console.error("Error fetching play info:", err);
    }
}

// Run initially, then refresh every 5 seconds
fetchLiveGame();
setInterval(fetchLiveGame, 5000);
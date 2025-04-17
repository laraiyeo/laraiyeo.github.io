const BASE_URL = "https://statsapi.mlb.com";
const SCHEDULE_URL = `${BASE_URL}/api/v1/schedule/games/?sportID=1`;

async function fetchLiveGame() {
    try {
        const res = await fetch(SCHEDULE_URL);
        const data = await res.json();
        const game = data.dates?.[0]?.games || [];

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

        document.getElementById("matchup").textContent = `${away.team.name} ${away.score} vs ${home.score} ${home.team.name}`;
        document.getElementById("state").textContent = `${status.detailedState} - ${new Date(gameDate).toLocaleTimeString()}`;

        fetchGameDetails(gamePk);
    } catch (err) {
        console.error("Error fetching game:", err)
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

        document.getElementById("inningInfo").textContent = `Inning: ${inning} (${isTopInning ? "Top" : "Bottom"})`;
        document.getElementById("count").textContent = `Balls: ${balls} • Strikes: ${strikes} • Outs: ${outs}`;
    } catch (err) {
        console.error("Error fetching play info:", err);
    }
}

// Run initially, then refresh every 5 seconds
fetchLiveGame();
setInterval(fetchLiveGame, 5000);
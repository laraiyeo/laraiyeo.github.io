const BASE_URL = "https://statsapi.mlb.com";
const SCHEDULE_URL = `${BASE_URL}/api/v1/schedule/games/?sportId=1`;

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

            const gameDiv = document.createElement("div");
            gameDiv.className = "game-block";
            gameDiv.innerHTML = `
                <div class="matchup">
                    <div class="team-column">
                        <div class="team-name" id="awayTeamName-${gamePk}">${away.team.name}</div>
                        <div class="team-score" id="awayScore-${gamePk}">${away.score}</div>
                    </div>
                    <div class="team-column">
                        <div class="team-name" id="homeTeamName-${gamePk}">${home.team.name}</div>
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

            // Fetch detailed game info for inning & counts
            fetchGameDetails(gamePk);
        }
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

        document.getElementById("inningInfo").textContent = `Inning: ${isTopInning ? "Top" : "Bot"} ${inning}th`;
        document.getElementById("count").textContent = `Balls: ${balls} • Strikes: ${strikes} • Outs: ${outs}`;
    } catch (err) {
        console.error("Error fetching play info:", err);
    }
}

// Run initially, then refresh every 5 seconds
fetchLiveGame();
setInterval(fetchLiveGame, 5000);
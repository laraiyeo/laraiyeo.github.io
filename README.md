# ⚾🏒🏀⚽ Live Tracker

Welcome to **Live Sports Tracker**, a free, web-based scoreboard designed for real-time **MLB, NHL, NBA, WNBA and Soccer** updates and seamless OBS integration.

🔗 **Live Tracker Site**: [https://laraiyeo.github.io/index.html](https://laraiyeo.github.io/index.html)  
💻 **Source Code**: [GitHub Repository](https://github.com/laraiyeo/laraiyeo.github.io)  
📊 **Data Source**: [statsapi.mlb.com](http://statsapi.mlb.com/api/v1/schedule/games/?sportId=1), [api.nhle.com](https://api-web.nhle.com/v1/schedule/now), [site.api.espn.com](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard)

---

## 🧩 Features

- **Live Game Dashboard**  
  Real-time display of active MLB, NHL, NBA, WNBA and Soccer games with:
  - Inning progress for MLB (TOP and BOT with inning number), Period/Quarter progress for NHL, NBA, and WNBA (Time remaining in period/quarter and specifc period/quarter number), and Half progress for Soccer (Current match time as well as current half)
  - Base runners logic for MLB (Bases light up when runner is present)
  - Visual balls/strikes/outs tracker for MLB

  **Scoreboard**
  - Visual scoreboard for MLB with inning progress, team scores, base runners, current outs, current play description and player stats. It will also grey out any player who is benched
  - Visual scoreboard for NHL, NBA and WNBA with Period/Quarter progress, team scores, time remaining in period/quarter, play description and player stats. There will be a 🟢 beside players who are currently on the ice/court
  - Visual scoreboard for Soccer with half progress, team scores, current match time, play description, a visual football pitch with real team lineups as well as a substitute section that shows subs and will display when they come on the pitch

- **Game Schedules & Results**  
  - See all scheduled games for the day with start times
  - View completed games and final scores
  - View scheduled and completed games for the week specifically for soccer

- **Team Tracker**  
  - All 30 teams shown at once for MLB and NBA, all 13 teams shown at once for WNBA and all 32 teams shown at once for NHL
  - Includes all teams from Premier League, La Liga, Bundesliga, Serie A and Ligue 1. For UEFA, it includes teams currently in Champions League, Europa League and Europa Conference League
  - See each team’s game status
  - Click on a team logo to get a unique URL for OBS

- **Standings**
  - View current league standings side by side for both conferences with divisions
  - Hover over a teams name to show a small card that displays home, away and last 10 games record as well as the teams current W/L streak (Not available for soccer)
  - For soccer, view league standings for all the different leagues with visual colors that indicate specific things with a legend underneath the table.

- **OBS Integration Ready**  
  - Each view is browser-source friendly
  - Easily embed into OBS scenes—no downloads or setup required

- **Open Source & Customizable**  
  - Built entirely in HTML/CSS/JS
  - Data from MLB’s official StatsAPI, NHL's official API, and ESPN'S API
  - Free to clone, fork, or contribute

- **Soccer Specific**
  - When going to the soccer page from the main page, you will see 5 extra buttons under the navbar. These are for the leagues. Click on one and you will be seeing only league specific data for Live, Scheduled, Finished, Teams, and Standings.
  - There's no need to be re-clicking the league button when going to a new page through the navbar as it saves the league you're on to your local storage
  - In the navbar of the soccer page, you will see UEFA and CWC. Clicking on it will take you to the UEFA or CWC Live Tracker page
  - Just like the other sports, you can click on a live game to see the scoreboard of that game. Hover over a players circle or name and you will see their current game stats.

- **UEFA Specific**
  - Just like soccer, UEFA has league buttons at the top
  - There is a Playoffs section in the navbar. Clicking on it will show you the all the teams in the selected league and their past rounds and matches. You can click on any of the match game cards to be taken to the respective scoreboard of that game
  - The UEFA scoreboard works the same as the soccer scoreboard

- **Club World Cup Specific**
  - In the standings page, it shows all 8 groups in the Club World Cup along with a legend to indicate which teams are moving on to the round of 16
  - Just like in NBA, the Club World Cup section features a Bracket page so you can see the current bracket as well as what teams have advanced
---

## 🖥️ How to Use in OBS

1. Go to the Teams page in the respective sport tracker page through the navbar
2. Click the team container of the team you want to integrate into obs
3. **Open OBS Studio**
4. Click the ➕ under *Sources*, and choose **Browser**
5. Name it (e.g. `MLB Tracker`, `NHL Tracker`, `NBA Tracker`, `WNBA Tracker` or `Soccer Tracker`) and paste the URL (do not change the width and height)  
6. Click **OK**
7. When the card is showing properly in obs, you can shrink or enlarge the card from the profile screen

---

## 💥 New Features

- (4/24/2025) When a game is live, you can click on the game card in the live page and you will see a live scoreboard of that specific game. Same with finished games. If you click a game block on the finished tab, you will see the final scoreboard of that specific game.
- (4/29/2025) Previously known as MLB Live Tracker but with the new integration of an NHL tracker, it is now known as Live Sports Tracker
- **(5/02/2025) Added fully functional NBA tracker**
- (5/03/2025) Added standings page for all sports that shows current team standings in their respective division and conference
- **(5/08/2025) Added fully function Soccer and UEFA tracker**
- (5/12/2025) Added playoff bracket page to NBA. Coming soon to NHL and MLB.
- **(5/27/2025) Added fully functional WNBA tracker**
- **(06/14/2025) Added fully functional Club World Cup tracker**

---

## #️⃣ Current known issues

- There are some issues with the code, as it is now, some teams might generate 2 or even 3 empty game containers. I'm not sure why and I also don't really know how to fix the issue. For now, if this happens, just click on the teams tab again and it should show the teams properly
- I've also had to change the fetch rate to 2 seconds as it was consuming too much data with a fetch rate of 1 second.
- On the scoreboard page, if the user is on a phone screen and they turn it landscape, it will show the regular phone view (max 3 innings) in landscape until the next fetch. Vice versa for landscape to portrait.
- For NHL scoreboard, at times it may show undefined for play-by-play. This is an issue from the api directly as it doesn't update some things immediately.
- For Soccer, UEFA, and CWC, the top scoreboard score and time as well as the play description might not update in real time. This is a problem caused by ESPN's api
- NBA bracket page style on mobile is not proper

---

## 🙌 Feedback & Contributions Welcome!

Have ideas or improvements? Open a pull request or open an issue.  
Thanks for checking out the MLB Live Tracker!

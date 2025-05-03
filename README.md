# ⚾🏒🏀 Live Tracker

Welcome to **Live Sports Tracker**, a free, web-based scoreboard designed for real-time MLB, NHL and NBA updates and seamless OBS integration.

🔗 **Live Tracker Site**: [https://laraiyeo.github.io/index.html](https://laraiyeo.github.io/index.html)  
💻 **Source Code**: [GitHub Repository](https://github.com/laraiyeo/laraiyeo.github.io)  
📊 **Data Source**: [statsapi.mlb.com](http://statsapi.mlb.com/api/v1/schedule/games/?sportId=1), [api.nhle.com](https://api-web.nhle.com/v1/schedule/now), [site.api.espn.com](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard)

---

## 🧩 Features

- **Live Game Dashboard**  
  Real-time display of active MLB and NHL games with:
  - Inning progress for MLB (TOP and BOT with inning number) and Period/Quarter progress for NHL and NBA (Time remaining in period/quarter and specifc period/quarter number)
  - Base runners logic for MLB (Bases light up when runner is present)
  - Visual balls/strikes/outs tracker for MLB

- **Game Schedules & Results**  
  - See all scheduled games for the day with start times
  - View completed games and final scores

- **Team Tracker**  
  - All 30 teams shown at once for MLB and NBA and all 32 teams shown at once for NHL
  - See each team’s game status
  - Click on a team logo to get a unique URL for OBS

- **OBS Integration Ready**  
  - Each view is browser-source friendly
  - Easily embed into OBS scenes—no downloads or setup required

- **Open Source & Customizable**  
  - Built entirely in HTML/CSS/JS
  - Data from MLB’s official StatsAPI, NHL's official API, and ESPN'S API
  - Free to clone, fork, or contribute

---

## 🖥️ How to Use in OBS

1. Go to **https://laraiyeo.github.io/teams.html**
2. Click the team container of the team you want to integrate into obs
3. **Open OBS Studio**
4. Click the ➕ under *Sources*, and choose **Browser**
5. Name it (e.g. `MLB Tracker` or `NHL Tracker`) and paste the URL (do not change the width and height)  
6. Click **OK**
7. When the card is showing properly in obs, you can shrink or enlarge the card from the profile screen

---

## 💥 New Features

- (4/24/2025) When a game is live, you can click on the game card in the live page and you will see a live scoreboard of that specific game. Same with finished games. If you click a game block on the finished tab, you will see the final scoreboard of that specific game.
- (4/29/2025) Previously known as MLB Live Tracker but with the new integration of an NHL tracker, it is now known as Live Sports Tracker
- (5/02/2025) Added fully functional NBA tracker
- (5/03/2025) Added standings page for all sports that shows current team standings in their respective division and conference
---

## #️⃣ Current known issues

- There are some issues with the code, as it is now, some teams might generate 2 or even 3 empty game containers. I'm not sure why and I also don't really know how to fix the issue. For now, if this happens, just click on the teams tab again and it should show the teams properly
- I've also had to change the fetch rate to 2 seconds as it was consuming too much data with a fetch rate of 1 second.
- On the scoreboard page, if the user is on a phone screen and they turn it landscape, it will show the regular phone view (max 3 innings) in landscape until the next fetch. Vice versa for landscape to portrait.
- For NHL scoreboard, at times it may show undefined for play-by-play. This is an issue from the api directly as it doesn't update some things immediately.

---

## 🙌 Feedback & Contributions Welcome!

Have ideas or improvements? Open a pull request or open an issue.  
Thanks for checking out the MLB Live Tracker!

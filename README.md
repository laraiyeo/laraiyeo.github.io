# ⚾ MLB Live Tracker

Welcome to **MLB Live Tracker**, a free, web-based scoreboard designed for real-time MLB updates and seamless OBS integration.

🔗 **Live Tracker Site**: [https://laraiyeo.github.io/index.html](https://laraiyeo.github.io/index.html)  
💻 **Source Code**: [GitHub Repository](https://github.com/laraiyeo/laraiyeo.github.io)  
📊 **Data Source**: [statsapi.mlb.com](http://statsapi.mlb.com/api/v1/schedule/games/?sportId=1)

---

## 🧩 Features

- **Live Game Dashboard**  
  Real-time display of active MLB games with:
  - Inning progress (TOP and BOT with inning number)
  - Base runners logic (Bases light up when runner is present)
  - Visual balls/strikes/outs tracker

- **Game Schedules & Results**  
  - See all scheduled games for the day with start times
  - View completed games and final scores

- **Team Tracker**  
  - All 30 teams shown at once
  - See each team’s game status
  - Click on a team logo to get a unique URL for OBS

- **OBS Integration Ready**  
  - Each view is browser-source friendly
  - Easily embed into OBS scenes—no downloads or setup required

- **Open Source & Customizable**  
  - Built entirely in HTML/CSS/JS
  - Data from MLB’s official StatsAPI
  - Free to clone, fork, or contribute

---

## 🖥️ How to Use in OBS

1. Go to **https://laraiyeo.github.io/teams.html**
2. In the team containers (the bigger box), click the logo of the team you want to integrate into obs
1. **Open OBS Studio**
2. Click the ➕ under *Sources*, and choose **Browser**
3. Name it (e.g. `MLB Tracker`) and paste the URL (do not change the width and height)  
5. Click **OK**
6. When the card is showing properly in obs, you can shrink or enlarge the card from the profile screen

---

## 💥 New Features

- (4/24/2025) When a game is live, you can click on the game card in the live page and you will see a live scoreboard of that specific game. Same with finished games. If you click a game block on the finished tab, you will see the final scoreboard of that specific game.

---

## #️⃣ Current known issues

- There are some issues with the code, as it is now, some teams might generate 2 or even 3 empty game containers. I'm not sure why and I also don't really know how to fix the issue. For now, if this happens, just click on the teams tab again and it should show the teams properly
- I've also had to change the fetch rate to 2 seconds as it was consuming too much data with a fetch rate of 1 second.
- On the scoreboard page, if the user is on a phone screen and they turn it landscape, it will show the regular phone view (max 3 innings) in landscape until the next fetch. Vice versa for landscape to portrait.

---

## 🙌 Feedback & Contributions Welcome!

Have ideas or improvements? Open a pull request or open an issue.  
Thanks for checking out the MLB Live Tracker!

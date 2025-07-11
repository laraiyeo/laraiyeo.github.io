# ⚾🏒🏀⚽🏎️ Live Tracker

Welcome to **Live Sports Tracker**, a free, web-based scoreboard designed for real-time **MLB, NHL, NBA, WNBA, Soccer and F1** updates and seamless OBS integration.

🔗 **Live Tracker Site**: [https://laraiyeo.github.io/index.html](https://laraiyeo.github.io/index.html)  
💻 **Source Code**: [GitHub Repository](https://github.com/laraiyeo/laraiyeo.github.io)  
📊 **Data Source**: [statsapi.mlb.com](http://statsapi.mlb.com/api/v1/schedule/games/?sportId=1), [api.nhle.com](https://api-web.nhle.com/v1/schedule/now), [site.api.espn.com](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard), [sports.core.api.espn.com](https://sports.core.api.espn.com/v2/sports/racing/leagues/f1)

---

## 🧩 Features

- **Live Game Dashboard**  
  Real-time display of active MLB, NHL, NBA, WNBA, Soccer and F1 races with:
  - Inning progress for MLB (TOP and BOT with inning number), Period/Quarter progress for NHL, NBA, and WNBA (Time remaining in period/quarter and specifc period/quarter number), Half progress for Soccer (Current match time as well as current half), and Session progress for F1 (Practice, Qualifying, Sprint, Race with real-time lap information)
  - Base runners logic for MLB (Bases light up when runner is present)
  - Visual balls/strikes/outs tracker for MLB

  **Scoreboard with Live Streaming**
  - Visual scoreboard for MLB with inning progress, team scores, base runners, current outs, current play description and player stats. It will also grey out any player who is benched. **Now includes embedded live game streams during active games**
  - Visual scoreboard for NHL, NBA and WNBA with Period/Quarter progress, team scores, time remaining in period/quarter, play description and player stats. There will be a 🟢 beside players who are currently on the ice/court
  - Visual scoreboard for Soccer with half progress, team scores, current match time, play description, a visual football pitch with real team lineups as well as a substitute section that shows subs and will display when they come on the pitch
  - Visual race information for F1 with session details, lap counts, fastest lap times, and real-time race positions with detailed driver and constructor information. Features embedded live race streams during active race weekends

- **Live Streaming Integration**
  - **Automatic stream detection** for in-progress games across all sports
  - **Multiple stream source testing** with automatic failover for optimal viewing experience
  - **Smart stream embedding** that only appears during active games/races
  - **Cross-origin stream support** with advanced iframe handling

- **Game Schedules & Results**  
  - See all scheduled games for the day with start times
  - View completed games and final scores
  - View scheduled and completed games for the week specifically for soccer
  - For F1: View upcoming race weekends with Grand Prix schedules and race times in your local timezone
  - For F1: Browse completed races with race winners, podium finishers, and championship points earned

- **Team Tracker**  
  - All 30 teams shown at once for MLB and NBA, all 13 teams shown at once for WNBA and all 32 teams shown at once for NHL
  - Includes all teams from Premier League, La Liga, Bundesliga, Serie A and Ligue 1. For UEFA, it includes teams currently in Champions League, Europa League and Europa Conference League
  - See each team's game status
  - Click on a team logo to get a unique URL for OBS
  - For F1: All 10 constructor teams displayed with official 2025 car liveries, team colors, driver lineups, championship positions, and detailed statistics including points, wins, and gap to championship leader. Full OBS integration with individual team overlays for streaming.

- **Advanced Team Search**
  - Search for any team across all sports leagues with intelligent autocomplete
  - Filter matches by custom date ranges (supports multi-year searches)
  - View comprehensive match history with pagination for large result sets
  - Click on any search result to view detailed scoreboard for that specific game
  - Bookmark and share search results with URL parameters
  - Mobile-optimized with team abbreviations for compact viewing

- **Standings**
  - View current league standings side by side for both conferences with divisions
  - Hover over a teams name to show a small card that displays home, away and last 10 games record as well as the teams current W/L streak (Not available for soccer)
  - For soccer, view league standings for all the different leagues with visual colors that indicate specific things with a legend underneath the table.
  - For F1: Toggle between Driver Championships and Constructor Championships with real-time points, wins, poles, and championship gaps. Driver standings include full names, team affiliations, car numbers, and detailed season statistics

- **OBS Integration Ready**  
  - Each view is browser-source friendly
  - Easily embed into OBS scenes—no downloads or setup required
  - **F1 Constructor team cards now fully OBS compatible** with 2x scaling for optimal stream visibility
  - **Individual team overlays** showing race cards during active race weekends and constructor standings during off-season
  - **Auto-refreshing data** every 2 seconds for real-time updates

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
  - Features a comprehensive Bracket page showing the complete tournament structure from group stage to finals
  - Interactive bracket navigation allows you to click on any match to view detailed scoreboards
  - Real-time bracket updates as teams advance through each round
  - Mobile-responsive bracket layout adapts to different screen sizes
  - The UEFA scoreboard works the same as the soccer scoreboard

- **Club World Cup Specific**
  - In the standings page, it shows all 8 groups in the Club World Cup along with a legend to indicate which teams are moving on to the round of 16
  - Just like in NBA, the Club World Cup section features a Bracket page so you can see the current bracket as well as what teams have advanced

- **F1 Specific**
  - Comprehensive constructor team pages showing all 10 F1 teams with official 2025 car designs and team liveries
  - Interactive team cards featuring high-resolution car images, official team logos, current driver lineups, and championship standings
  - Real-time championship standings with toggle between Driver and Constructor championships
  - Each constructor card displays current championship position, total points, race wins, and points behind championship leader
  - **Live race weekend streaming** embedded directly in race information pages during active sessions
  - **OBS-ready team overlays** accessible by clicking any constructor team card for unique streaming URLs
  - **Dynamic content switching** between race cards (during active weekends) and constructor standings (during off-season)
  - Scheduled races page showing upcoming Grand Prix weekends with country flags, race names, and precise timing in user's local timezone
  - Race results page displaying completed races with winners, constructor teams, podium information, and race dates
  - Click on any race (scheduled or completed) to view detailed race information and statistics
  - Constructor team colors and branding maintained throughout for authentic F1 experience

---

## 🖥️ How to Use in OBS

1. Go to the Teams page in the respective sport tracker page through the navbar
2. Click the team container of the team you want to integrate into obs
3. **Open OBS Studio**
4. Click the ➕ under *Sources*, and choose **Browser**
5. Name it (e.g. `MLB Tracker`, `NHL Tracker`, `NBA Tracker`, `WNBA Tracker`, `Soccer Tracker` or  `F1 Tracker`) and paste the URL (do not change the width and height)  
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
- **(06/28/2024) Added comprehensive team search functionality across all sports with multi-year date range support**
- (06/28/2024) Added UEFA bracket page with complete tournament visualization
- **(07/02/2025) Added comprehensive F1 tracking with constructor teams, driver/constructor championships, race schedules, and race results**
- **(07/04/2025) Integrated live streaming capabilities for MLB and F1 with automatic stream detection and controls**
- (07/04/2025) Full F1 OBS integration with individual constructor team overlays and dynamic content switching
- (07/112025) Added support for NBA Summer League

---

## #️⃣ Current known issues

- There are some issues with the code, as it is now, some teams might generate 2 or even 3 empty game containers. I'm not sure why and I also don't really know how to fix the issue. For now, if this happens, just click on the teams tab again and it should show the teams properly
- I've also had to change the fetch rate to 2 seconds as it was consuming too much data with a fetch rate of 1 second.
- On the scoreboard page, if the user is on a phone screen and they turn it landscape, it will show the regular phone view (max 3 innings) in landscape until the next fetch. Vice versa for landscape to portrait.
- For NHL scoreboard, at times it may show undefined for play-by-play. This is an issue from the api directly as it doesn't update some things immediately.
- For Soccer, UEFA, and CWC, the top scoreboard score and time as well as the play description might not update in real time. This is a problem caused by ESPN's api
- Bracket page style on mobile is not proper for all sports except UEFA
- NHL search page might not function at times as nhle api has rate limits that blocks requests if done too quickly
- For F1, some race information may experience delays due to ESPN's F1 API update frequency during live race sessions
- Live streaming may occasionally fail to load due to external stream source availability
- F1 OBS overlays may show brief loading states when switching between race cards and constructor standings
- For streaming, you most definitely need a strong pop-up and ad blocker as the stream where the video comes from has an ad script embedded in it (I have made multiple attempts to try and remove it to no avail).

---

## 🙌 Feedback & Contributions Welcome!

Have ideas or improvements? Open a pull request or open an issue.  
Thanks for checking out the MLB Live Tracker!

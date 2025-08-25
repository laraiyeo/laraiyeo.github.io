# ⚾🏒🏀🏈⚽🏎️ Live Tracker

Welcome to **Live Sports Tracker**, a free, web-based scoreboard designed for real-time **MLB, NHL, NBA, NFL, WNBA, Soccer and F1** updates and seamless OBS integration.

🔗 **Live Tracker Site**: [https://laraiyeo.github.io/index.html](https://laraiyeo.github.io/index.html)  
💻 **Source Code**: [GitHub Repository](https://github.com/laraiyeo/laraiyeo.github.io)  
📊 **Data Source**: [statsapi.mlb.com](http://statsapi.mlb.com/api/v1/schedule/games/?sportId=1), [api.nhle.com](https://api-web.nhle.com/v1/schedule/now), [site.api.espn.com](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard), [site.api.espn.com NFL](https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard), [sports.core.api.espn.com](https://sports.core.api.espn.com/v2/sports/racing/leagues/f1)

---

## 🧩 Features

- **Live Game Dashboard**  
  Real-time display of active MLB, NHL, NBA, NFL, WNBA, Soccer and F1 races with:
  - Inning progress for MLB (TOP and BOT with inning number), Period/Quarter progress for NHL, NBA, NFL, and WNBA (Time remaining in period/quarter and specifc period/quarter number), Half progress for Soccer (Current match time as well as current half), and Session progress for F1 (Practice, Qualifying, Sprint, Race with real-time lap information)
  - Base runners logic for MLB (Bases light up when runner is present)
  - Visual balls/strikes/outs tracker for MLB

- **All-in-One (AIO) Dashboard**
  - **Unified Game View**: Comprehensive single-page display showing Live, Scheduled, and Finished games simultaneously for all sports (MLB, NHL, NBA, NFL, WNBA, Soccer)
  - **Smart Date Filtering**: Only displays games for the current date using proper timezone adjustment (EST-based with 2 AM cutoff for early morning games)
  - **Consistent Card Styling**: All sports use their respective teams.js styling for uniform visual presentation
  - **Intelligent Sorting**: 
    - Live games: Sorted by start time for priority viewing
    - Scheduled games: Sorted by game time for chronological order
    - Finished games: Sorted by date (most recent first)
  - **Direct Navigation**: Click any game card to navigate directly to the specific game's scoreboard page with game ID parameter
  - **Real-time Updates**: Auto-refreshes every 2 seconds to keep game statuses current

  **Scoreboard with Live Streaming & Play-by-Play**
  - Visual scoreboard for MLB with inning progress, team scores, base runners, current outs, current play description and player stats. It will also grey out any player who is benched. **Now includes embedded live game streams during active games**
  - Visual scoreboard for NHL, NBA, NFL and WNBA with Period/Quarter progress, team scores, time remaining in period/quarter, play description and player stats. There will be a 🟢 beside players who are currently on the ice/court/field
  - **Enhanced Play-by-Play System** for MLB, NFL, NBA, and WNBA featuring:
    - **Interactive expandable plays** with detailed player information and statistics
    - **Smart play categorization**: Non-expandable plays (timeouts, challenges) vs expandable plays (shots, fouls, substitutions)
    - **Dynamic team colors** applied to scoring plays and play borders based on official team colors
    - **Player headshots and statistics** with current game stats and team abbreviations
    - **Content slider interface** allowing seamless switching between player statistics and play-by-play data
    - **Stream visibility control** - streams automatically hide when viewing play-by-play and show when viewing stats
    - **Sport-specific features**:
      - **NBA/WNBA**: Mini basketball court visualization showing exact shot locations with team-colored markers
      - **NBA/WNBA**: Real-time coordinate mapping using ESPN's 0-50 scale system for accurate shot positioning
      - **NBA/WNBA**: Special substitution handling with "Enter" labels and appropriate player information display
      - **MLB**: Enhanced inning-by-inning play tracking with base runner context and detailed pitch statistics
      - **NFL**: Quarter-by-quarter play progression with drive information and location
  - Visual scoreboard for Soccer with half progress, team scores, current match time, play description, a visual football pitch with real team lineups as well as a substitute section that shows subs and will display when they come on the pitch
  - Visual race information for F1 with session details, lap counts, fastest lap times, and real-time race positions with detailed driver and constructor information. Features embedded live race streams during active race weekends

- **Live Streaming Integration**
  - Automatic stream detection for in-progress games across all sports
  - Multiple stream source testing with automatic failover for optimal viewing experience
  - Smart stream embedding that only appears during active games/races (not scheduled or completed games)
  - Cross-origin stream support with advanced iframe handling
  - Stream visibility management - automatically hides during play-by-play viewing and shows during stats viewing
  - Enhanced stream control with fullscreen support
  - Dynamic stream positioning to prevent overlap with game statistics and content areas

- **Game Schedules & Results**  
  - See all scheduled games for the day with start times
  - View completed games and final scores
  - View scheduled and completed games for the week specifically for soccer
  - For F1: View upcoming race weekends with Grand Prix schedules and race times in your local timezone
  - For F1: Browse completed races with race winners, podium finishers, and championship points earned

- **Team Tracker**  
  - All 30 teams shown at once for MLB and NBA, all 13 teams shown at once for WNBA, all 32 teams shown at once for NHL and NFL
  - Includes all teams from Premier League, La Liga, Bundesliga, Serie A, Ligue 1, MLS and Saudi Pro League. For UEFA, it includes teams currently in Champions League, Europa League and Europa Conference League
  - See each team's game status
  - Click on a team logo to get a unique URL for OBS
  - For F1: All 10 constructor teams displayed with official 2025 car liveries, team colors, driver lineups, championship positions, and detailed statistics including points, wins, and gap to championship leader. Full OBS integration with individual team overlays for streaming.

- **Comprehensive Team Search & Dashboard**
  - Universal Team Search: Dedicated search pages for all sports (MLB, NHL, NBA, NFL, WNBA, Soccer) allowing users to find any team across leagues
  - Individual Team Pages: Complete team dashboards accessible through search results with comprehensive team information
  - Current Game Display: Shows today's game if scheduled, or next upcoming game with proper date adjustment logic for each sport
  - Recent Match History: Paginated view of completed games with customizable date range selection and win/loss indicators
  - Upcoming Schedule: Next 5 scheduled games with dates, opponents, and venue information
  - Team Statistics: Real-time season stats including sport-specific metrics (offensive/pitching for MLB, goals/assists for NHL, passing/rushing/receiving for NFL, etc.)
  - Current Standings: Team's position in division/conference with record, win percentage, and relevant league standings
  - Complete Player Roster: Searchable, paginated roster with player positions and jersey numbers for all sports
  - Detailed Player Statistics: Click any player to view comprehensive stats with **league rankings for each statistic**
    - Player Performance Rankings: Each player stat shows their ranking among all league players (e.g., "#15 in NFL" for passing yards)
    - Smart Position Detection: 
      - MLB: Automatically displays hitting stats for position players and pitching stats for pitchers
      - NFL: Shows position-specific stats (passing for QBs, rushing for RBs, receiving for WRs/TEs, defensive stats for defenders)
      - Soccer: Only allows for comparison of goalie vs goalie and field vs field
      - NHL: Shows goaltending stats for goalies and skater stats for forwards/defensemen
      - NBA/WNBA: Displays comprehensive basketball statistics for all positions
    - Position-Specific Comparisons: Players can only be compared with compatible positions (goalies vs goalies, pitchers vs pitchers, quarterbacks vs quarterbacks, etc.)
    - Quality Filtering: Rankings only include players with meaningful playing time
    - Advanced Metrics: Sport-specific advanced statistics (OPS/WHIP for MLB, passer rating for NFL QBs, +/- for NHL, PER for NBA, etc.)
  - League-Wide Player Search & Comparison: 
    - Cross-Team Player Search: Search through complete rosters of all teams within each sport with real-time filtering
    - Advanced Player Comparison: Side-by-side statistical comparison of any two compatible players with comprehensive season stats
    - Interactive Comparison Interface: Individual clear buttons for each player allowing selective removal and replacement
    - Smart UX Design: Prevents clearing both players simultaneously to maintain valid comparison states
    - Position-Aware Filtering: Automatically filters search results to show only compatible positions for fair comparisons
    - Responsive Player Display: Optimized for mobile screens (≤525px) with abbreviated display in comparison view
  - **Game Log Feature**: 
    - Date-specific player performance tracking across all sports (MLB, NBA, WNBA, NHL, NFL, Soccer, UEFA)
    - Interactive date picker to view player stats from any specific game
    - Smart game detection that finds team games for selected dates
    - Handles different game states: completed games with full stats, scheduled games with opponent info, and no-game scenarios
    - Direct links to detailed scoreboard pages from game log entries
    - Team-branded styling with sport-specific loading animations
    - **Clipboard Export Functionality**: One-click copying of game log cards as high-quality images for easy sharing
      - Professional game log cards featuring player headshots, team logos, and comprehensive game statistics
      - Optimized image rendering with proper aspect ratios and clean circular player photos
      - Smart element exclusion (removes UI elements like clipboard icons and interactive text during capture)
      - Cross-origin image handling with automatic base64 conversion for external assets
      - Modern Clipboard API integration with user feedback notifications
      - Compatible across all sports with sport-specific styling and branding

- **Standings**
  - View current league standings side by side for both conferences with divisions
  - For NFL: Displays AFC and NFC conferences with their respective divisions (North, South, East, West) matching the official NFL structure
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
  - **Enhanced Domestic Competition Coverage**: 
    - **Multi-Competition Game Tracking**: Live games, team cards, and player statistics include matches from domestic cup competitions alongside main league games
    - **Comprehensive Competition Support**: Covers major domestic tournaments including FA Cup, Copa del Rey, DFB Pokal, Coppa Italia, Coupe de France, US Open Cup, Saudi King's Cup and more
    - **Intelligent Competition Detection**: Automatically fetches and displays games from all relevant competitions for each league (e.g., Premier League teams also show FA Cup and EFL Cup matches)
    - **Visual Competition Indicators**: Domestic cup matches display with distinct competition headers and team-colored styling to differentiate from league games
    - **Historical Match Coverage**: Player game logs and team statistics include comprehensive coverage of domestic competition matches across all seasons
    - **Cross-Season Player Tracking**: Game logs properly handle players who changed teams, showing accurate jersey numbers, positions, and team affiliations for each specific season/competition

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

- **Fantasy Soccer System**
  - **Multi-League Fantasy Management**: Create and manage fantasy teams across 7 major soccer leagues (Premier League, La Liga, Bundesliga, Serie A, Ligue 1, MLS, Saudi Pro League)
  - **Interactive Soccer Pitch Visualization**: 
    - Dynamic 3D soccer field that scales with team size (500px to 580px height)
    - Proportional field elements (penalty boxes, goal areas, center circle, penalty spot circles) that scale with pitch size
    - Real-time formation display showing player positions (GK, DEF, MID, FWD) with jersey-style indicators
    - Position-based player slot arrangement with automatic spacing and line positioning
    - Formation constraints enforcement (1-2 GK, 2-6 DEF/MID/FWD, 11 total players maximum)
  - **Advanced Player Management**:
    - **Smart Player Search**: Real-time filtering across entire league rosters with position-specific filtering
    - **Drag-and-Drop Interface**: Intuitive player placement with visual feedback and position validation
    - **Position-Aware Slot Assignment**: Players automatically assigned to appropriate position slots with conflict resolution
    - **League-Isolated Caching**: Each league maintains separate player cache to prevent cross-league data contamination
    - **Comprehensive API Caching**: 30-minute cache expiration for all player data, stats, news, and game information to eliminate redundant API calls
  - **Fantasy Points Calculation System**:
    - **Position-Dependent Scoring**: Different point values for goals based on player position (GK: 10pts, DEF: 6pts, MID: 5pts, FWD: 4pts)
    - **Comprehensive Stat Tracking**: Points for playing time, assists (3pts), clean sheets (4pts DEF/GK, 1pt MID), saves, penalty saves/misses
    - **Defensive Contributions**: Points for tackles, interceptions, clearances, and blocked shots with position-specific multipliers
    - **Real-Time Total Display**: Dynamic total fantasy points calculation with visual highlighting
    - **Detailed Points Breakdown**: Expandable section explaining the complete scoring system
  - **Team Code System**:
    - **Efficient Team Codes**: Revolutionary short-format team codes
    - **Format**: `league-playerid.position.slot-playerid.position.slot` (e.g., `usa.1-149945.fwd1-45843.fwd2`)
    - **Smart Import/Export**: One-click team sharing with automatic format detection and position mapping
    - **Slot Conflict Resolution**: Automatic fallback slot assignment when imported players conflict with existing positions
  - **League-Specific Features**:
    - **Persistent League Memory**: System remembers last selected league across sessions using localStorage
    - **League-Isolated Teams**: Each league maintains separate fantasy team with independent player selections
    - **Real-Time League Switching**: Instant league changes with proper data isolation and cache management
    - **League-Specific News**: Automatically loads relevant news for players on your team
  - **Advanced UI/UX**:
    - **Mobile-First Approach**: Vertical layout stacking on mobile with proper pitch scaling and touch-friendly controls
    - **Loading States**: Comprehensive loading indicators for player searches, team imports, and data fetching
    - **Error Handling**: Robust error management with user-friendly messages and graceful fallbacks
    - **Clear Team Functionality**: One-click team clearing with confirmation and proper state reset
  - **Game Integration**:
    - **Live Game Navigation**: Click any game card to jump directly to detailed scoreboard with team context
    - **Player Performance Tracking**: Integration with live game stats and historical performance data
    - **Event Log Integration**: Connect fantasy selections with real-world player performance and game events

- **NFL Specific**
  - Comprehensive NFL coverage with all 32 teams across both AFC and NFC conferences
  - Real-time game tracking with quarter-by-quarter progression and time remaining display
  - **Live streaming integration** for in-progress games with automatic stream detection and embedded video players
  - Complete standings structure matching official NFL format with AFC/NFC conferences and their respective divisions (North, South, East, West)
  - Detailed player box scores featuring position-specific statistics:
    - **Passing statistics** for quarterbacks (completions, attempts, yards, touchdowns, interceptions)
    - **Rushing statistics** for running backs and ball carriers (attempts, yards, touchdowns, longest rush)
    - **Receiving statistics** for wide receivers and tight ends (receptions, yards, touchdowns, longest reception)
    - **Defensive statistics** for all defensive players (tackles, assists, sacks, interceptions)
  - Smart responsive design with mobile optimization showing only the most critical statistics (first 3 columns) on small screens
  - Automatic fumbles category filtering to focus on essential performance metrics
  - Team dashboard pages with comprehensive roster management, player statistics, and league rankings
  - Player comparison system supporting position-specific matchups (QB vs QB, RB vs RB, etc.)
  - Advanced NFL metrics including passer rating, yards per attempt, completion percentage, and other football-specific analytics
  - Real-time play-by-play descriptions with team-colored backgrounds for enhanced visual context

- **NCAAF (College Football) Specific**
  - **Comprehensive College Football Coverage**: Full NCAA Division I FBS tracking with all major conferences and teams
  - **Live Game Tracking**: Real-time college football games with quarter-by-quarter progression, time remaining, and down/distance information
  - **Advanced Play-by-Play System**: Interactive expandable plays with detailed player information and college-specific statistics
  - **Team Dashboard Integration**: Complete college team pages with roster management, player statistics, and conference standings
  - **College-Specific Features**:
    - **Conference-Based Standings**: Proper college football conference structure with division alignment where applicable
    - **Student-Athlete Statistics**: Position-specific stats tailored for college football including academic year indicators
    - **Recruiting Class Integration**: Support for roster changes due to transfers and recruiting cycles
    - **Bowl Game Tracking**: Enhanced coverage during bowl season and College Football Playoff games
  - **Live Streaming Support**: Embedded streams for nationally televised college football games during active contests
  - **Mobile-Optimized Interface**: Responsive design optimized for college football's unique scheduling patterns and game formats
  - **OBS Integration Ready**: College team cards compatible with streaming software for game day broadcasts
  - **Historical Game Data**: Complete season tracking with game logs, player performance history, and team statistics
  - **Player Comparison System**: College-specific player comparisons with position-aware filtering and academic context

---

## 🖥️ How to Use in OBS

1. Go to the Teams page in the respective sport tracker page through the navbar
2. Click the team container of the team you want to integrate into obs
3. **Open OBS Studio**
4. Click the ➕ under *Sources*, and choose **Browser**
5. Name it (e.g. `MLB Tracker`, `NHL Tracker`, `NBA Tracker`, `NFL Tracker`, `WNBA Tracker`, `Soccer Tracker` or  `F1 Tracker`) and paste the URL (change width and height to 800)  
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
- (06/28/2024) Added UEFA bracket page with complete tournament visualization
- **(07/02/2025) Added comprehensive F1 tracking with constructor teams, driver/constructor championships, race schedules, and race results**
- **(07/04/2025) Integrated live streaming capabilities for MLB and F1 with automatic stream detection and controls**
- (07/04/2025) Full F1 OBS integration with individual constructor team overlays and dynamic content switching
- (07/112025) Added support for NBA Summer League
- **(07/29/2025) Added comprehensive team dashboard pages to all available sports (except F1) with detailed player statistics, rankings and comparison of player stats**
- **(07/31/2025) Added fully functional NFL tracker with complete standings structure (AFC/NFC conferences), live streaming integration, and position-specific player statistics**
- (08/01/2025) Added gamelog feature for players which lets you check any players log for the current season
- (08/02/2025) Added clipboard function to game logs that allows you to copy any game log card
- **(08/09/2025) Major Play-by-Play Enhancement** - Added comprehensive interactive play-by-play systems for MLB, NFL, NBA, and WNBA
- **(08/19/2025) Added fully functional Fantasy League to soccer accross all leagues (Except UEFA and CWC)**
- **(08/19/2025) Game Card Customization System** - Added comprehensive styling controls for all sports with background color picker, opacity slider (0-100%), text color picker, and reset functionality. Features URL parameter locking for OBS streaming where customized styles are locked via URL parameters to prevent changes during live streams.
- **(08/19/2025) All-in-One (AIO) Dashboard Implementation** - Revolutionary unified game view across all sports showing Live, Scheduled, and Finished games on a single page with smart date filtering, responsive design, and direct scoreboard navigation. Features consistent styling and real-time updates every 2 seconds. 
- **(08/23/2025) Added fully functional NCAAF (College Football) tracker** - Complete NCAA Division I FBS coverage with live game tracking, advanced play-by-play system, team dashboards, conference-based standings, and OBS integration. Includes college-specific features like student-athlete statistics, recruiting class support, and bowl game tracking. 
- **(08/25/2025) Soccer Domestic Competition Integration** - Enhanced soccer coverage with comprehensive domestic cup competition support including FA Cup, Copa del Rey, DFB Pokal, Coppa Italia, Coupe de France, and more. Features multi-competition game tracking, visual competition indicators, and cross-season player tracking with accurate historical data for players who changed teams.

---

## #️⃣ Current known issues

- On the scoreboard page, if the user is on a phone screen and they turn it landscape, it will show the regular phone view (max 3 innings) in landscape until the next fetch. Vice versa for landscape to portrait.
- For NHL scoreboard, at times it may show undefined for play-by-play. This is an issue from the api directly as it doesn't update some things immediately.
- For Soccer, UEFA, and CWC, the top scoreboard score and time as well as the play description might not update in real time. This is a problem caused by ESPN's api
- For F1, some race information may experience delays due to ESPN's F1 API update frequency during live race sessions
- Live streaming may occasionally fail to load due to external stream source availability
- F1 OBS overlays may show brief loading states when switching between race cards and constructor standings
- For streaming, you most definitely need a strong pop-up and ad blocker as the stream where the video comes from has an ad script embedded in it (I have made multiple attempts to try and remove it to no avail).
- Last matches for all sports are currently facing issues when you try and search too far back
- For NBA, WNBA, NFL, and NHL, the players headshots on the copied game card are squished a little if you click copy twice. On the first copy, they are normal
- For player game log search, you can go back for as many years the player is active, however, if a player was traded during the season, it only shows game log for the team they were traded to. UEFA searches also don't allow for different leagues (Eg. game log for Harry Kane on March 11, 2021 won't show as Tottenham were in Europa that season)
- Mini Basketball Court Issues for NBA and WNBA play-by-play:
  - Mobile court styling: The basketball court visualization on mobile screens may not display with proper proportions and element positioning
  - Shot marker positioning: Some shot location dots may appear slightly off-center or outside court boundaries for certain play coordinates
  - Coordinate mapping inconsistencies: Occasional misalignment between ESPN's coordinate system and visual court positioning, particularly for corner shots and free throw attempts
  - Mobile landscape orientation: Court elements may not scale properly when switching between portrait and landscape modes on mobile devices
---

## 🙌 Feedback & Contributions Welcome!

Have ideas or improvements? Open a pull request or open an issue.  
Thanks for checking out the MLB Live Tracker!

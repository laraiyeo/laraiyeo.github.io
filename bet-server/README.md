# NBA Data Fetcher Server

A Node.js server that fetches and caches NBA data from ESPN API with intelligent scheduling based on game states.

## Features

- **Scoreboard Data**: Automatically fetches scoreboard data with dynamic polling

  - Every 2 seconds when games are live
  - Every 2 seconds starting 5 minutes before first game
  - Every 30 minutes otherwise

- **Game Summary**: Fetches detailed game summaries for specific matches

  - Same intelligent polling as scoreboard
  - Separate intervals for each active game

- **Rosters & Game Logs**: Combined endpoint for all team rosters and player game logs
  - Fetched daily at 2:00 AM PST
  - Automatically updated when games start
  - Includes rosters and game logs for all teams playing that day
  - Filters out injured players
  - Shows recent games (last 5), event stats, and season averages for each player

## API Endpoints

### `GET /`

Returns API information and current status

### `GET /api/scoreboard`

Returns NBA scoreboard data with all games

### `GET /api/summary/:eventId`

Returns detailed summary for a specific game

- Replace `:eventId` with the ESPN event ID (e.g., `401809839`)

### `GET /api/rosters`

Returns roster and game log data for all teams playing today

- Automatically fetches data for all teams from the current scoreboard
- Includes player information (name, position, jersey, headshot)
- Shows last 5 games for each player with stats
- Displays season averages and betting odds
- Excludes injured players

### `GET /api/betslip`

Returns detailed betslip data with full bet information and results

**Query Parameters:**

- `gameId` (required): Single or comma-separated game IDs (e.g., `401836803` or `401836803,401839023`)
- `moneyline`: Team abbreviation to bet on (e.g., `BOS`, `DET`)
- `total`: Over/Under total points (e.g., `o220.5`, `u215.5`)
- `spread`: Team with spread (e.g., `BOS-1.5`, `DET+3.5`)
- `p1`, `p2`, etc.: Player IDs (e.g., `p1=4432166`)
- `p1_pts`, `p1_reb`, etc.: Player prop bets (e.g., `p1_pts=o29.5`, `p1_reb=10+`)

**Response includes:**

- Events array with all bet results (won/in progress/false)
- Team data with logos and scores
- Player data with stats and headshots
- Metadata with payload size and bet counts

**Example:**

```
/api/betslip?gameId=401836803&moneyline=BOS&total=o220.5&p1=4432166&p1_pts=o29.5
```

### `GET /api/betslip/notification`

Returns minimal betslip data optimized for push notifications (only won bets)

**Same query parameters as `/api/betslip`**

**Response includes:**

- `wonBets`: Array of only won bets (when game is completed)
- `wonCount`: Number of won bets
- `hasLiveGames`: Boolean indicating if any games are still live
- `timestamp`: Current time
- `payloadSize`: Size in bytes/KB (optimized to be under 4KB)

**Use case:** Poll this endpoint every 30 seconds during live games. Trigger push notification when `wonCount > 0` and game is completed.

### `GET /health`

Health check endpoint for monitoring

## Local Development

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file (optional):

```bash
cp .env.example .env
```

3. Start the development server:

```bash
npm run dev
```

4. Start the production server:

```bash
npm start
```

The server will start on `http://localhost:3000`

## Deployment to Railway

### Method 1: GitHub Integration (Recommended)

1. Push your code to GitHub:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main
```

2. Go to [Railway](https://railway.app) and sign in

3. Click "New Project" → "Deploy from GitHub repo"

4. Select your repository

5. Railway will automatically detect the configuration and deploy

6. Your API will be live at the provided Railway URL

### Method 2: Railway CLI

1. Install Railway CLI:

```bash
npm i -g @railway/cli
```

2. Login to Railway:

```bash
railway login
```

3. Initialize project:

```bash
railway init
```

4. Deploy:

```bash
railway up
```

5. Get your deployment URL:

```bash
railway domain
```

## Environment Variables

- `PORT`: Optional (provided automatically by Railway or your host).
- `SUPABASE_URL`: Your Supabase project URL (e.g. https://your-project.supabase.co).
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role (admin) key. Required for server admin operations.

Create a `.env` file in the `bet-server` folder for local development. Example:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PORT=3000
```

Warning: Keep the service role key secret. Do not commit `.env` to source control.

## Data Fetching Schedule

### Scoreboard

- **Live Games**: Every 2 seconds when at least one game status is "in"
- **Pre-Game**: Every 2 seconds starting 5 minutes before first game
- **Idle**: Every 30 minutes when no games are imminent

### Summary (per event)

- **Live Game**: Every 2 seconds when game status is "in"
- **Pre-Game**: Every 2 seconds starting 5 minutes before game
- **No polling otherwise** (data cached and served on request)

### Roster & Game Logs

- **Daily**: 2:00 AM PST every day
- **Game Start**: When each game begins
- **On Demand**: When endpoint is called and no cache exists

## Monitoring

Check the logs in Railway dashboard to see:

- When data is being fetched
- Current polling intervals
- Game status changes
- Any errors

Example log output:

```
[Scoreboard] Fetching data...
[Scheduler] Live games detected. Switching to 2-second interval.
[Summary Scheduler] Starting fast polling for event 401809839
[Cron] Running daily roster/gamelog update at 2:00 AM PST
```

## Testing Endpoints

Once deployed, test your endpoints:

```bash
# Get scoreboard
curl https://laraiyeogithubio-production-f5af.up.railway.app/api/scoreboard

# Get game summary
curl https://laraiyeogithubio-production-f5af.up.railway.app/api/summary/401809839

# Get rosters
curl https://laraiyeogithubio-production-f5af.up.railway.app/api/rosters

# Get betslip with multiple bets
curl "https://laraiyeogithubio-production-f5af.up.railway.app/api/betslip?gameId=401836803&moneyline=BOS&total=o220.5&p1=4432166&p1_pts=o29.5"

# Get notification-optimized betslip (only won bets)
curl "https://laraiyeogithubio-production-f5af.up.railway.app/api/betslip/notification?gameId=401836803&moneyline=BOS&total=o220.5&p1=4432166&p1_pts=o29.5"

# Check health
curl https://laraiyeogithubio-production-f5af.up.railway.app/health
```

## Push Notification Strategy

### Payload Size Limits

- **FCM (Firebase Cloud Messaging)**: 4KB (4096 bytes)
- **APNs (Apple Push Notification)**: 4KB (4096 bytes)
- **Recommended**: Keep under 3KB to account for overhead

### Implementation Strategy

1. **Full Betslip Endpoint** (`/api/betslip`)

   - Use for displaying detailed bet information in your app
   - Returns all bets with complete data
   - Includes payload size metadata

2. **Notification Endpoint** (`/api/betslip/notification`)
   - Use for push notifications only
   - Returns only won bets when game completes
   - Optimized payload size (typically < 1KB)
   - Poll every 30 seconds during live games
   - Trigger notification when `wonCount > 0`

### Example Flow

```javascript
// Poll during live games
setInterval(async () => {
  const response = await fetch(
    "https://laraiyeogithubio-production-f5af.up.railway.app/api/betslip/notification?gameId=...&..."
  );
  const data = await response.json();

  if (data.wonCount > 0 && !data.hasLiveGames) {
    // All games completed, send push notification
    sendPushNotification({
      title: `🎉 ${data.wonCount} Bet${data.wonCount > 1 ? "s" : ""} Won!`,
      body: data.wonBets.map((bet) => bet.result).join(", "),
      data: data.wonBets,
    });
  }
}, 30000); // Poll every 30 seconds
```

## Architecture

- **Express.js**: Web server framework
- **Axios**: HTTP client for API requests
- **node-cron**: Scheduled tasks (daily updates)
- **In-memory caching**: Fast data retrieval without repeated API calls
- **Dynamic scheduling**: Adjusts fetch frequency based on game states

## Notes

- All times are handled in PST for cron jobs
- Data is cached in memory (resets on server restart)
- Parallel gamelog fetching for better performance
- Graceful shutdown handling for Railway deployments

## License

MIT

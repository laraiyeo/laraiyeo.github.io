# Deployment Status

## 🚀 Deployment Info

- **Platform**: Railway
- **URL**: https://laraiyeogithubio-production-f5af.up.railway.app
- **Status**: ✅ Production Ready
- **Version**: 1.0.0
- **Last Updated**: December 16, 2025

## 📋 API Endpoints

### Base URL

```
https://laraiyeogithubio-production-f5af.up.railway.app
```

### Available Endpoints

1. **Root** - `GET /`
   - Returns API information and current status
2. **Scoreboard** - `GET /api/scoreboard`
   - Returns all NBA games with live updates
3. **Summary** - `GET /api/summary/:eventId`
   - Returns detailed game summary for specific game
4. **Rosters** - `GET /api/rosters`
   - Returns all team rosters with player stats and betting odds
5. **Betslip** - `GET /api/betslip`
   - Returns detailed bet tracking with full results
   - Supports: moneyline, totals, spreads, player props
   - Multi-game support via comma-separated gameId
6. **Betslip Notification** - `GET /api/betslip/notification`
   - Returns minimal payload (only won bets) for push notifications
   - Optimized to be under 4KB for FCM/APNs
7. **Health** - `GET /health`
   - Health check endpoint

## 🔄 Auto-Update Logic

### Scoreboard Updates

- **Live Games**: Every 2 seconds when any game is in progress
- **Pre-Game**: Every 2 seconds starting 5 minutes before first game
- **Idle**: Every 30 minutes when no games are active or imminent

### Summary Updates

- **Live Game**: Every 2 seconds per game when status is "in"
- **Pre-Game**: Every 2 seconds starting 5 minutes before game
- **Cached**: Data served from cache when not actively updating

### Roster Updates

- **Daily**: 2:00 AM PST via cron job
- **Game Start**: Automatically when each game begins
- **On Demand**: When endpoint is called and cache is empty

## 📊 Data Sources

### Primary API

- **Custom API**: https://laraiyeogithubio-production-f5af.up.railway.app
- Used for summary data in betslip endpoints

### Fallback API

- **ESPN API**: site.api.espn.com
- Used when custom API is unavailable
- Used for scoreboard, rosters, gamelogs

## 🔧 Configuration

### Environment Variables

```
PORT=3000 (provided by Railway)
```

### Cron Jobs

```
0 2 * * * - Daily roster update at 2:00 AM PST
*/1 * * * * - Check for game starts every minute
```

### Caching Strategy

- In-memory caching for fast response times
- Scoreboard data cached and auto-updated
- Summary data cached per game
- Roster data cached globally

## 📦 Deployment Files

### Core Files

- ✅ `server.js` - Main application (1477 lines)
- ✅ `package.json` - Dependencies and scripts
- ✅ `Dockerfile` - Container configuration
- ✅ `railway.json` - Railway deployment settings
- ✅ `.env.example` - Environment template
- ✅ `.gitignore` - Git ignore patterns
- ✅ `README.md` - Comprehensive documentation

### Dependencies

```json
{
  "axios": "^1.6.2",
  "cors": "^2.8.5",
  "dotenv": "^16.3.1",
  "express": "^4.18.2",
  "node-cron": "^3.0.3"
}
```

## 🎯 Key Features

### Betting System

- ✅ Moneyline bets (team winner)
- ✅ Total points (over/under)
- ✅ Spread betting (point handicap)
- ✅ Player props (points, rebounds, assists, blocks, steals, turnovers)
- ✅ Player milestones (e.g., 30+ points, 10+ rebounds)
- ✅ Multi-game parlays (multiple games in one betslip)

### Won Status Logic

- `true` - Bet won and game completed
- `false` - Bet lost
- `"in progress"` - Bet winning but game not completed

### Push Notification Support

- Full endpoint with all bet details and payload size metadata
- Minimal notification endpoint returning only won bets
- Payload optimization to stay under 4KB FCM/APNs limit
- Strategy: Poll notification endpoint every 30 seconds during live games

## 🧪 Testing

### Quick Tests

```bash
# Test root endpoint
curl https://laraiyeogithubio-production-f5af.up.railway.app/

# Test health
curl https://laraiyeogithubio-production-f5af.up.railway.app/health

# Test scoreboard
curl https://laraiyeogithubio-production-f5af.up.railway.app/api/scoreboard
```

### Example Betslip

```bash
# Single game with multiple bets
curl "https://laraiyeogithubio-production-f5af.up.railway.app/api/betslip?gameId=401836803&moneyline=BOS&total=o220.5&spread=BOS-1.5&p1=4432166&p1_pts=o29.5&p1_reb=10+&p1_ast=o5.5"

# Multi-game parlay
curl "https://laraiyeogithubio-production-f5af.up.railway.app/api/betslip?gameId=401836803,401839023&moneyline=DET&p1=4432166&p1_pts=o29.5"

# Notification endpoint (minimal)
curl "https://laraiyeogithubio-production-f5af.up.railway.app/api/betslip/notification?gameId=401836803&moneyline=BOS&total=o220.5"
```

## 📝 Monitoring

### Railway Dashboard

Monitor the following in your Railway deployment:

- Real-time logs showing fetch cycles
- CPU and memory usage
- Request metrics
- Error tracking

### Log Patterns

```
[Scoreboard] Fetching data...
[Scheduler] Live games detected. Switching to 2-second interval.
[Summary Scheduler] Starting fast polling for event 401836803
[Betslip] Using data from laraiyeo.github for game 401836803
[Cron] Running daily roster/gamelog update at 2:00 AM PST
```

## ✅ Production Checklist

- [x] Server code complete and tested
- [x] All endpoints functional
- [x] Intelligent scheduling implemented
- [x] Cron jobs configured
- [x] Custom API integration with ESPN fallback
- [x] Betslip tracking with won status logic
- [x] Push notification optimization
- [x] Payload size calculation
- [x] Railway configuration files
- [x] Dockerfile optimized
- [x] Documentation complete
- [x] .gitignore configured
- [x] Health check endpoint
- [x] CORS enabled
- [x] Graceful shutdown handling
- [x] Error handling and logging
- [x] Multi-game support
- [x] Team logo retrieval
- [x] Player data extraction
- [x] Spread betting support

## 🚦 Status

**All systems operational and ready for production use!**

The server will:

1. ✅ Auto-start on Railway deployment
2. ✅ Fetch initial scoreboard data on startup
3. ✅ Begin intelligent polling based on game states
4. ✅ Update rosters daily at 2:00 AM PST
5. ✅ Update rosters when games start
6. ✅ Handle multi-game betslips
7. ✅ Provide push notification-optimized data
8. ✅ Fallback to ESPN if custom API fails

## 📞 Next Steps

1. **Monitor Logs**: Check Railway dashboard for any errors
2. **Test Endpoints**: Verify all endpoints return expected data
3. **Set Up Monitoring**: Configure alerts for downtime
4. **Implement Client**: Build frontend/mobile app to consume API
5. **Push Notifications**: Implement polling strategy for notifications
6. **Performance Tuning**: Monitor and optimize based on usage patterns

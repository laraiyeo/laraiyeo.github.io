# Sports Tracker Backend

Optimized backend server for the Sports Tracker mobile app that significantly reduces data consumption and implements push notifications for favorite team updates.

## Features

- **Delta Updates**: Only sends changed data to minimize bandwidth usage
- **Intelligent Caching**: Redis-based caching with ETags and conditional requests
- **Background Jobs**: Automated data fetching and notification processing
- **Push Notifications**: Real-time alerts for game events
- **Multi-Sport Support**: MLB, NFL, NBA, NHL, F1, and Soccer
- **Rate Limiting**: API protection and fair usage enforcement
- **Health Monitoring**: Built-in health checks and monitoring

## Data Optimization Benefits

### Before (Current Implementation)
- **~2-5MB per fetch** - Full game data, team metadata, standings
- **Multiple API calls** - Separate requests per team/sport
- **No caching** - Fresh requests every time
- **No delta updates** - Always full dataset
- **Client-side polling** - Mobile app handles all fetching

### After (With Backend)
- **~50-200KB per fetch** - Delta updates and optimized payloads
- **Single API call** - Aggregated data for all favorites
- **Smart caching** - Redis caching with conditional headers
- **Delta responses** - Only changed data sent
- **Server-side optimization** - Heavy lifting moved to backend

**Result: 90-95% reduction in data transfer**

## Architecture

```
Mobile App → Backend API → Sports APIs (ESPN, MLB, etc.)
           ↓
         Redis Cache
           ↓
    Background Jobs → Push Notifications
```

## Setup

### Prerequisites

- Node.js 16+ 
- Redis server
- npm or yarn

### Installation

1. **Run setup script:**
   ```bash
   # On Linux/macOS
   chmod +x setup.sh
   ./setup.sh
   
   # On Windows
   setup.bat
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Start Redis:**
   ```bash
   redis-server
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

### Manual Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```

3. **Generate VAPID keys for push notifications:**
   ```bash
   npx web-push generate-vapid-keys
   ```

4. **Update .env with VAPID keys and other settings**

5. **Start Redis and the server:**
   ```bash
   redis-server --daemonize yes
   npm start
   ```

## API Endpoints

### Favorites Management

- `GET /api/favorites/teams/:userId` - Get user's favorite teams
- `POST /api/favorites/teams/:userId` - Update favorite teams
- `GET /api/favorites/games/:userId` - Get optimized games data
- `GET /api/favorites/summary/:userId` - Get quick summary

### Push Notifications

- `POST /api/notifications/subscribe/:userId` - Subscribe to notifications
- `PUT /api/notifications/preferences/:userId` - Update preferences
- `DELETE /api/notifications/unsubscribe/:userId` - Unsubscribe
- `GET /api/notifications/vapid-public-key` - Get VAPID public key

### System

- `GET /health` - Health check

## Delta Update System

The backend implements a sophisticated delta update system:

### Game State Changes
- **Score updates** - Only changed scores sent
- **Status changes** - Game start/end notifications
- **Minimal payloads** - Essential data only

### Request Flow
1. Client sends `lastUpdate` timestamp
2. Backend compares with current data
3. Returns delta or "no changes" response
4. Client applies delta to cached data

### Example Delta Response
```json
{
  "hasChanges": true,
  "deltaType": "delta",
  "changes": {
    "updated": [
      {
        "id": "game123",
        "changes": {
          "homeScore": { "from": 3, "to": 4 },
          "status": { "from": "In Progress", "to": "Final" }
        }
      }
    ]
  },
  "changesSummary": {
    "updated": 1,
    "added": 0,
    "removed": 0
  }
}
```

## Background Jobs

Automated processes running on schedule:

- **Live Games (30s)** - Fetch live game updates
- **Upcoming Games (5m)** - Update upcoming schedules
- **Notifications (1m)** - Process and send notifications
- **Cache Cleanup (1h)** - Remove stale cache entries
- **User Summaries (2m)** - Generate user overview data

## Notification System

### Setup
1. Client requests VAPID public key
2. Client generates push subscription
3. Client sends subscription to backend
4. Backend stores subscription with preferences

### Notification Types
- **Game Start** - When favorite team's game begins
- **Score Update** - When score changes (configurable)
- **Game End** - When game finishes with final score
- **News** - Important team news (optional)

### Preferences
Users can configure:
- Which types of notifications to receive
- Quiet hours
- Sport-specific preferences

## Performance Optimizations

### Caching Strategy
- **Redis caching** with TTL-based expiration
- **ETag support** for conditional requests
- **In-memory caching** for frequently accessed data
- **Background pre-fetching** for popular data

### Request Optimization
- **Request deduplication** - Prevent duplicate API calls
- **Timeout handling** - Graceful failure with cached fallbacks
- **Compression** - gzip compression for responses
- **Rate limiting** - Protect against abuse

### Data Minimization
- **Field selection** - Only necessary fields sent
- **Payload optimization** - Remove heavy unused data
- **Batch processing** - Group related requests
- **Smart polling** - Reduce frequency for inactive games

## Mobile App Integration

### Service Layer
The mobile app includes optimized services:

- `BackendApiService.js` - HTTP client with caching
- `OptimizedFavoritesService.js` - High-level favorites management

### Usage in FavoritesScreen
Replace the heavy `fetchFavoriteGames` function:

```javascript
// Before: Heavy implementation with multiple API calls
await fetchFavoriteGames(true); // 2-5MB download

// After: Optimized backend integration
const response = await OptimizedFavoritesService.getFavoriteGames();
// 50-200KB download with delta updates
```

## Monitoring & Health

### Health Check
```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-10-03T...",
  "uptime": 3600
}
```

### Cache Statistics
Access via service methods for debugging:
- Request cache hit rates
- Background job status
- Redis connection health

## Production Deployment

### Environment Variables
```bash
NODE_ENV=production
PORT=3001
REDIS_URL=redis://your-redis-server
JWT_SECRET=your-secure-secret
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
```

### Process Management
Use PM2 for production:
```bash
npm install -g pm2
pm2 start server.js --name sports-tracker-backend
pm2 startup
pm2 save
```

### Reverse Proxy
Use nginx for production:
```nginx
location /api/ {
    proxy_pass http://localhost:3001/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_cache_valid 200 30s;
}
```

## Security

- **Helmet.js** - Security headers
- **Rate limiting** - Prevent abuse
- **Input validation** - Sanitize requests
- **CORS configuration** - Restrict origins
- **JWT tokens** - User authentication (optional)

## Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new features
4. Submit pull request

## License

MIT License - see LICENSE file for details
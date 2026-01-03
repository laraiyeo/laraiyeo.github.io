# Bet Server API Documentation

## Base URL

- **Production**: `https://laraiyeogithubio-production-f5af.up.railway.app`
- **Local**: `http://localhost:3000`

---

## Core Endpoints

### 1. Root Endpoint

**`GET /`**

Returns server status and available endpoints.

**Response:**

```json
{
  "message": "NBA Data Fetcher API",
  "version": "1.0.0",
  "endpoints": { ... },
  "status": {
    "isAnyGameLive": boolean,
    "nextGameStart": string | null,
    "cachedEvents": number,
    "cachedRosters": string,
    "pollingMode": "slow" | "moderate" | "fast"
  }
}
```

---

### 2. Scoreboard Endpoint

**`GET /api/scoreboard/:sport`**

Fetches live scoreboard data for a specific sport.

**Parameters:**

- `sport` (path) - Sport identifier: `nba`, `nhl`, `nfl`, `uefa`
- `dates` (query, optional) - Date filter in format `YYYYMMDD`

**Example:**

```
GET /api/scoreboard/nba
GET /api/scoreboard/nfl?dates=20250102
```

**Response:**

```json
{
  "events": [
    {
      "id": "401810322",
      "name": "New York Knicks vs San Antonio Spurs",
      "shortName": "NY vs SA",
      "date": "2026-01-01T00:00Z",
      "competitions": [
        {
          "competitors": [
            {
              "homeAway": "home",
              "team": {
                "id": "24",
                "abbreviation": "SA",
                "displayName": "San Antonio Spurs"
              },
              "score": "134",
              "linescores": { "1": 36, "2": 27, "3": 30, "4": 41 }
            }
          ],
          "status": {
            "type": {
              "completed": true,
              "state": "post",
              "detail": "Final"
            }
          }
        }
      ]
    }
  ]
}
```

---

### 3. Summary Endpoint

**`GET /api/summary/:sport/:eventId`**

Fetches detailed game summary with box scores, player stats, and SGO odds.

**Parameters:**

- `sport` (path) - Sport identifier: `nba`, `nhl`, `nfl`, `uefa`
- `eventId` (path) - Event ID (e.g., `401810322`)

**Example:**

```
GET /api/summary/nba/401810322
```

**Response:**

```json
{
  "header": {
    "competitions": [
      {
        "competitors": [ ... ],
        "status": { ... }
      }
    ]
  },
  "boxscore": {
    "teams": [
      {
        "team": { ... },
        "statistics": [ ... ]
      }
    ],
    "players": [
      {
        "team": { ... },
        "statistics": [
          {
            "athletes": [
              {
                "athlete": {
                  "id": "5104157",
                  "displayName": "Victor Wembanyama"
                },
                "stats": ["31", "13", "1", "0", "1", "2"]
              }
            ],
            "labels": ["PTS", "REB", "AST", "STL", "BLK", "3PM"]
          }
        ]
      }
    ]
  },
  "pickcenter": {
    "all": [ /* SGO odds markets */ ]
  },
  "firstGoal": { ... },
  "lastGoal": { ... }
}
```

**⚠️ MIGRATION NOTE:**

- **Old Format**: `/api/summary/:eventId` (sport inferred from scoreboard cache)
- **New Format**: `/api/summary/:sport/:eventId` (explicit sport parameter)
- Old format still supported for backward compatibility

---

### 4. Odds Endpoint

**`GET /api/odds/:sport`**

Returns SportGameOdds cached data for a sport. Cache refreshes daily at 2 AM PST.

**Parameters:**

- `sport` (path) - Sport identifier: `nba`, `nhl`, `nfl`, `uefa`

**Example:**

```
GET /api/odds/nba
```

**Response:**

```json
{
  "lastFetched": "2026-01-02T10:00:00.000Z",
  "events": [
    {
      "id": "sgo_event_123",
      "status": "live",
      "startTime": "2026-01-02T19:00:00Z",
      "teams": {
        "home": {
          "name": "Los Angeles Lakers",
          "abbr": "LAL"
        },
        "away": {
          "name": "Boston Celtics",
          "abbr": "BOS"
        }
      },
      "odds": {
        "teams": {
          "home": { "moneyline": -150, "spread": -3.5 },
          "away": { "moneyline": +130, "spread": +3.5 }
        },
        "all": [
          /* All SGO markets */
        ]
      }
    }
  ]
}
```

**Cache Behavior:**

- Fresh cache (< 2 hours): Returns immediately
- Stale cache: Returns cached + triggers background refresh
- No cache: Returns 503, triggers background fetch

---

### 5. Rosters Endpoint

**`GET /api/rosters/:sport`**

Fetches team rosters with player odds attached from SGO cache.

**Parameters:**

- `sport` (path) - Sport identifier: `nba`, `nhl`, `nfl`, `uefa`

**Example:**

```
GET /api/rosters/nba
```

**Response:**

```json
{
  "teamId1": {
    "roster": [
      {
        "athlete": {
          "id": "4432166",
          "displayName": "Jayson Tatum",
          "position": { "abbreviation": "F" }
        },
        "odds": {
          /* SGO player props */
        }
      }
    ]
  }
}
```

---

### 6. Athlete Endpoint

**`GET /api/athlete/:sport/:id`**

Returns detailed athlete information with gamelog and odds breakdown.

**Parameters:**

- `sport` (path) - Sport identifier: `nba`, `nhl`, `nfl`, `uefa`
- `id` (path) - Athlete ID

**Example:**

```
GET /api/athlete/nba/5104157
```

**Response:**

```json
{
  "athlete": {
    "id": "5104157",
    "displayName": "Victor Wembanyama",
    "team": { ... }
  },
  "gamelog": {
    "recentGames": [ /* Last 10 games */ ],
    "seasonAverages": {
      "PTS": 26.5,
      "REB": 10.2,
      "AST": 3.5
    }
  },
  "odds": {
    "PTS": { "line": 26.5, "over": -110, "under": -110 },
    "REB": { "line": 10.5, "over": -105, "under": -115 }
  }
}
```

---

### 7. Betslip Generation Endpoint

**`GET /api/betslip`**

Generates betslip response from query parameters. Evaluates bets against live data.

**Query Parameters:**

#### Game-Level Bets

- `gameId` - Event ID(s), comma-separated for parlays
- `moneyline` - Team abbreviation (e.g., `NY`)
- `spread` - Team + line (e.g., `NY-4.5`)
- `total` - Total points with o/u notation (e.g., `o237.5`, `237.5+`, `237.5-`)
- `homePoints` - Home team points (e.g., `120.5+`, `o120.5`)
- `awayPoints` - Away team points (e.g., `u116.5`, `116.5-`)

#### Quarter Bets (NBA/NFL)

- `moneyline1Q`, `moneyline2Q`, `moneyline3Q`, `moneyline4Q` - Quarter moneyline
- `spread1Q`, `spread2Q`, `spread3Q`, `spread4Q` - Quarter spread (e.g., `NY-1.5`)
- `total1Q`, `total2Q`, `total3Q`, `total4Q` - Quarter total (e.g., `62.5+`, `o60.5`)
- `homePoints1Q`-`4Q`, `awayPoints1Q`-`4Q` - Quarter team points

#### Half Bets (All Sports)

- `moneyline1H`, `moneyline2H` - Half moneyline
- `spread1H`, `spread2H` - Half spread
- `total1H`, `total2H` - Half total
- `homePoints1H`, `homePoints2H` - Half team points
- `awayPoints1H`, `awayPoints2H` - Half team points

#### Period Bets (NHL)

- `moneyline1P`, `moneyline2P`, `moneyline3P` - Period moneyline
- `spread1P`, `spread2P`, `spread3P` - Period spread
- `total1P`, `total2P`, `total3P` - Period total

#### UEFA-Specific Bets

- `bothScore` - Both teams to score (yes/no)
- `totalCorner` - Total corner kicks (e.g., `o9.5`)
- `totalCards` - Total cards (e.g., `3.5+`)
- `cornerSpread` - Corner kick spread (e.g., `TOT-1.5`)
- `cardSpread` - Cards spread (e.g., `TOT-0.5`)

#### Player Props

- `p1`, `p2`, etc. - Player ID
- `p1_pts`, `p1_reb`, `p1_ast` - Basic stats (e.g., `26.5+`, `o10.5`)
- `p1_pra`, `p1_pa`, `p1_pr`, `p1_ra` - Combo stats
- `p1_3pm`, `p1_stl`, `p1_blk` - Advanced stats
- `p1_1qpts`, `p1_1qast`, `p1_1qreb` - Quarter stats
- `p1_firstbasket`, `p1_firstgoal`, `p1_firsttouchdown` - Milestone (yes/no)
- `p1_lastgoal`, `p1_lasttouchdown` - Last scoring event (yes/no)
- `p1_2dbl`, `p1_3dbl` - Double/triple-double (yes/no)

**NFL Player Props:**

- `p1_pyds`, `p1_patt`, `p1_pcmp`, `p1_pint`, `p1_plng`, `p1_ptd` - Passing
- `p1_ryds`, `p1_ratt`, `p1_rlng` - Rushing
- `p1_recyds`, `p1_rrec`, `p1_reclong` - Receiving
- `p1_pryds`, `p1_rryds` - Combo yards
- `p1_tds`, `p1_touchdowns` - Touchdowns
- `p1_kxp`, `p1_kfg`, `p1_kpts` - Kicking
- `p1_dsac` - Defense (sacks)

**NHL Player Props:**

- `p1_hgl`, `p1_goals` - Goals
- `p1_ast`, `p1_ga` - Assists / Goals+Assists
- `p1_ppp` - Power-play points
- `p1_sht`, `p1_bs` - Shots / Blocked shots
- `p1_gsv` - Goalie saves

**UEFA Player Props:**

- `p1_ugl`, `p1_goals` - Goals
- `p1_cards`, `p1_redcards` - Cards
- `p1_yc`, `p1_rc`, `p1_card` - Yellow/red cards

**Over/Under Notation:**

- `o237.5` or `237.5+` = Over 237.5
- `u237.5` or `237.5-` = Under 237.5

**Example:**

```
GET /api/betslip?gameId=401810322_nba&moneyline=NY&spread=NY-4.5&total=237.5+&homePoints=120.5+&awayPoints=u116.5&p1=5104157&p1_pts=26.5+&p1_reb=o5.5&p1_firstbasket=yes
```

**Response:**

```json
{
  "events": [
    {
      "eventId": "401810322",
      "status": {
        "shortDetail": "Final",
        "completed": true,
        "state": "post",
        "date": "2026-01-01T00:00Z",
        "game": {
          "homeTeam": "SA",
          "awayTeam": "NY",
          "homeScore": "134",
          "awayScore": "132"
        }
      },
      "bets": {
        "moneyline": {
          "team": "NY",
          "current": { "score": "132-134", "lead": "SA" },
          "won": false
        },
        "totalPoints": {
          "bet": "237.5 ",
          "line": 237.5,
          "type": "over",
          "current": 266,
          "won": true
        },
        "spread": {
          "team": "NY",
          "line": -4.5,
          "lineDisplay": "-4.5",
          "current": { "score": "132-134", "adjustedScore": "-4.5" },
          "won": false
        },
        "homePoints": {
          "bet": "120.5",
          "line": 120.5,
          "current": 134,
          "type": "over",
          "won": true
        },
        "awayPoints": {
          "bet": "u116.5",
          "line": 116.5,
          "current": 132,
          "type": "under",
          "won": false
        },
        "Q1_ML": {
          "bet": "NY",
          "current": "36-45",
          "won": true
        },
        "Q1_T": {
          "bet": "62.5",
          "line": 62.5,
          "type": "over",
          "current": 81,
          "won": true
        },
        "H1_T": {
          "bet": "o122.5",
          "line": 122.5,
          "type": "over",
          "current": 136,
          "won": true
        },
        "players": [
          {
            "id": "5104157",
            "name": "Victor Wembanyama",
            "color": "000000",
            "overUnder": {
              "REB": {
                "bet": 5.5,
                "type": "over",
                "current": 13,
                "won": true
              }
            },
            "milestones": {
              "PTS": {
                "bet": "26.5 ",
                "threshold": 26.5,
                "current": 31,
                "won": true
              },
              "FIRSTBASKET": {
                "bet": "yes",
                "current": 1,
                "won": true
              }
            }
          }
        ]
      }
    }
  ],
  "metadata": {
    "payloadSize": {
      "bytes": 3504,
      "kb": 3.42,
      "withinPushLimit": true,
      "recommendedForPush": false
    },
    "totalBets": 20,
    "gamesCount": 1
  }
}
```

**Bet Status Values:**

- `true` - Bet won
- `false` - Bet lost
- `"pending"` - Game hasn't started
- `"in progress"` - Bet is currently live and could win/lose

**In-Progress Logic (NEW):**

- **Quarters/Periods**: Shows "in progress" only if that specific quarter/period is currently active (based on linescore)
- **Halves**: Shows "in progress" if any constituent quarter/period is active
- **Examples**:
  - Q1 bet shows "in progress" only during Q1 (when Q2/Q3/Q4 linescore is empty)
  - Q2 bet shows "in progress" only during Q2 (when Q3/Q4 linescore is empty)
  - H1 bet shows "in progress" during Q1 or Q2
  - H2 bet shows "in progress" during Q3 or Q4 (until game ends)

---

## Authentication Endpoints

### 8. Sign Up

**`POST /api/auth/signup`**

Creates new user account.

**Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "username": "johndoe" // optional
}
```

**Response:**

```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "johndoe"
  }
}
```

---

### 9. Login

**`POST /api/auth/login`**

Authenticates user and returns JWT token.

**Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response:**

```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "credits": 1000,
    "is_pro": false
  }
}
```

---

### 10. Verify Token

**`POST /api/auth/verify`**

Verifies JWT token validity.

**Headers:**

```
Authorization: Bearer eyJhbGc...
```

**Response:**

```json
{
  "valid": true,
  "user": { ... }
}
```

---

## Betslip Management Endpoints

### 11. Create Betslip

**`POST /api/betslips`**

Creates a new betslip record in database.

**Headers:**

```
Authorization: Bearer eyJhbGc...
```

**Body:**

```json
{
  "gameIds": ["401810322_nba"],
  "legs": [
    {
      "type": "moneyline",
      "value": "NY",
      "odds": -150
    },
    {
      "type": "player_prop",
      "playerId": "5104157",
      "stat": "PTS",
      "line": 26.5,
      "direction": "over"
    }
  ],
  "betslip_url": "http://localhost:3000/api/betslip?gameId=...",
  "wager": 10,
  "potential_payout": 25.5
}
```

**Response:**

```json
{
  "id": "betslip_uuid",
  "user_id": "user_uuid",
  "status": "pending",
  "created_at": "2026-01-02T10:00:00Z",
  ...
}
```

---

### 12. List Betslips

**`GET /api/betslips`**

Returns user's betslips with optional filtering.

**Headers:**

```
Authorization: Bearer eyJhbGc...
```

**Query Parameters:**

- `status` (optional) - Filter by status: `pending`, `won`, `lost`
- `limit` (optional) - Max results (default: 50)

**Response:**

```json
{
  "betslips": [
    {
      "id": "uuid",
      "status": "pending",
      "legs": [ ... ],
      "wager": 10,
      "created_at": "2026-01-02T10:00:00Z"
    }
  ]
}
```

---

### 13. Get Betslip by ID

**`GET /api/betslips/:id`**

Fetches single betslip by ID.

**Headers:**

```
Authorization: Bearer eyJhbGc...
```

**Response:**

```json
{
  "id": "uuid",
  "user_id": "user_uuid",
  "status": "won",
  "legs": [ ... ],
  "wager": 10,
  "payout": 25.50,
  "settled_at": "2026-01-02T12:00:00Z"
}
```

---

### 14. Watch Betslip

**`POST /api/betslips/:id/watch`**

Adds betslip to realtime watcher for automatic settlement.

**Headers:**

```
Authorization: Bearer eyJhbGc...
```

**Response:**

```json
{
  "watching": true,
  "betslip_id": "uuid"
}
```

---

### 15. Unwatch Betslip

**`DELETE /api/betslips/:id/watch`**

Removes betslip from realtime watcher.

**Headers:**

```
Authorization: Bearer eyJhbGc...
```

**Response:**

```json
{
  "watching": false
}
```

---

## Daily Rewards Endpoints

### 16. Get Daily State

**`GET /api/daily/state`**

Returns current daily reward state for authenticated user.

**Headers:**

```
Authorization: Bearer eyJhbGc...
```

**Response:**

```json
{
  "day": 3,
  "claimed": true,
  "claimedAt": "2026-01-02T08:00:00Z",
  "nextAvailableAt": "2026-01-03T08:00:00Z"
}
```

---

### 17. Claim Daily Reward

**`POST /api/daily/claim`**

Claims current day's reward if eligible.

**Headers:**

```
Authorization: Bearer eyJhbGc...
```

**Response:**

```json
{
  "success": true,
  "day": 3,
  "reward": 50,
  "newCredits": 1050,
  "nextAvailableAt": "2026-01-03T08:00:00Z"
}
```

---

### 18. Dismiss Daily Modal

**`POST /api/daily/dismiss`**

Dismisses daily modal for 24 hours without claiming.

**Headers:**

```
Authorization: Bearer eyJhbGc...
```

**Response:**

```json
{
  "success": true,
  "nextAvailableAt": "2026-01-03T10:00:00Z"
}
```

---

## Notification Endpoints

### 19. Register Push Token

**`POST /api/profile/push-token`**

Registers Expo push notification token for user.

**Headers:**

```
Authorization: Bearer eyJhbGc...
```

**Body:**

```json
{
  "pushToken": "ExponentPushToken[...]"
}
```

**Response:**

```json
{
  "success": true
}
```

---

### 20. Test Push Notification

**`POST /api/debug/push-test`**

Sends test push notification to authenticated user.

**Headers:**

```
Authorization: Bearer eyJhbGc...
```

**Response:**

```json
{
  "success": true,
  "sent": 1
}
```

---

## Admin Endpoints

### 21. Grant Pro Access

**`POST /api/admin/pro`**

Grants pro access to user (admin only).

**Headers:**

```
Authorization: Bearer eyJhbGc...
```

**Body:**

```json
{
  "userId": "user_uuid"
}
```

---

### 22. Redeem Promo Code

**`POST /api/promo/redeem`**

Redeems promotional code for credits.

**Headers:**

```
Authorization: Bearer eyJhbGc...
```

**Body:**

```json
{
  "code": "PROMO2026"
}
```

**Response:**

```json
{
  "success": true,
  "credits_added": 500,
  "new_balance": 1500
}
```

---

## Health & Status

### 23. Health Check

**`GET /health`**

Server health check endpoint.

**Response:**

```json
{
  "ok": true,
  "uptime": 123456,
  "timestamp": "2026-01-02T10:00:00Z"
}
```

---

## Background Jobs

### Automated Tasks

1. **SGO Odds Refresh**

   - **Schedule**: Daily at 2:00 AM PST
   - **Function**: `scheduleSGOOddsPolling()`
   - **Sports**: NBA, NHL, NFL, UEFA
   - **Cache Duration**: Until next 2 AM run

2. **Roster Refresh**

   - **Schedule**: Daily at 2:00 AM PST (after odds)
   - **Function**: `fetchRostersForSport()`
   - **Attaches**: SGO odds to player data

3. **Betslip Auto-Cleanup**

   - **Schedule**: 24 hours after betslip creation
   - **Function**: `scheduleClearBetslip()`
   - **Action**: Clears betslip data from database

4. **Realtime Betslip Watcher**
   - **Trigger**: On betslip INSERT via Supabase realtime
   - **Fallback**: 5-second polling if realtime unavailable
   - **Function**: `seedPendingWatchers()` (loads last 7 days on startup)
   - **Settlement**: Automatic when game completes

---

## Migration Guide

### Old → New Endpoint Format

| Old Format                          | New Format                         | Status                      |
| ----------------------------------- | ---------------------------------- | --------------------------- |
| `/api/summary/:eventId`             | `/api/summary/:sport/:eventId`     | ⚠️ Deprecated (still works) |
| `/api/betslip` (singular POST)      | `/api/betslips` (plural POST)      | ✅ Both work (forwarded)    |
| `/api/betslip/:id/watch` (singular) | `/api/betslips/:id/watch` (plural) | ✅ Both work (forwarded)    |

### Required App Changes

1. **Update Summary Calls:**

   ```javascript
   // OLD
   fetch(`${API_URL}/api/summary/${eventId}`);

   // NEW (required for reliability)
   fetch(`${API_URL}/api/summary/${sport}/${eventId}`);
   ```

2. **Update Betslip Creation:**

   ```javascript
   // OLD (still works but deprecated)
   fetch(`${API_URL}/api/betslip`, {
     method: "POST",
     body: JSON.stringify(betslipData),
   });

   // NEW (recommended)
   fetch(`${API_URL}/api/betslips`, {
     method: "POST",
     body: JSON.stringify(betslipData),
   });
   ```

3. **Update Watch/Unwatch:**
   ```javascript
   // Use plural form for consistency
   fetch(`${API_URL}/api/betslips/${id}/watch`, { method: "POST" });
   fetch(`${API_URL}/api/betslips/${id}/watch`, { method: "DELETE" });
   ```

---

## Error Responses

All endpoints return errors in consistent format:

**4xx Client Errors:**

```json
{
  "error": "Invalid gameId parameter"
}
```

**5xx Server Errors:**

```json
{
  "error": "Failed to fetch summary data"
}
```

**503 Cache Not Ready:**

```json
{
  "error": "Odds cache not ready yet",
  "retryAfterSeconds": 30
}
```

---

## Rate Limiting

No explicit rate limiting currently implemented. Consider implementing if abuse occurs.

---

## Notes

- All timestamps are in ISO 8601 format
- All money values are in credits (virtual currency)
- Push notifications require Expo client
- Realtime updates via Supabase subscriptions
- In-progress bet detection now uses granular linescore analysis (quarters/periods/halves)

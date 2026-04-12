# NHL Server

NHL proxy/cache microservice modeled after baseball-server.

## Run locally

```bash
cd nhl-server
npm install
npm start
```

## Endpoints

- GET / -> basic info
- GET /health -> cache status

Folder-based routes from your attached URL sets:

- GET /nhl/player/:id
  - Uses player_id folder URLs (landing, game-log, edge)
- GET /nhl/team/:id
  - Uses team_id folder URLs (club-stats, schedule-season, roster)
- GET /nhl/game/:id
  - Uses game_id folder URLs (landing, right-rail, boxscore, play-by-play, shifts)
- GET /nhl/scoreboard/:date
  - Uses scoreboard_date folder URL pattern
- GET /nhl/standings
  - Uses standings folder URL
- GET /nhl/search
  - Uses search folder URL; optional query: ?q=<term>
- GET /nhl/player-stats
- GET /nhl/player-stats/:id
  - Uses player-stats folder URL ids 1..20
- GET /nhl/team-stats
- GET /nhl/team-stats/:id
  - Uses team-stats folder URL ids 1..5

## Notes

- Responses are cached in-memory for 30 minutes.
- Response shape includes source: cache|origin and upstream url.

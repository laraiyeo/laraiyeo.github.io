# Baseball Server

Quick dev & test instructions for the `baseball-server` microservice.

Prereqs

- Node.js 18+ (or compatible)

Install & run locally

```bash
cd baseball-server
npm install
npm start
```

Endpoints

- `GET /` — basic info
- `GET /health` — health + cache metadata
- `GET /leagues` — cached fetch of `v1/leagues?sportId=51` (TTL 30m)
- `GET /proxy/<path>` — generic cached proxy to the MLB API (head: `https://statsapi.mlb.com/api/`)
- `POST /bb/notifications/register-device` — registers a subscriber + Expo push token for MLB notifications
- `GET /bb/notifications/favorites/{subscriberId}` — returns current MLB favorite team IDs for a subscriber
- `POST /bb/notifications/favorites/{subscriberId}` — toggles a favorite team (`teamId`, `teamName`, `enabled`)

New WBC endpoints

- `GET /wbc/teams` — cached fetch of `v1/teams?leagueIds=159,160&fields=...` (TTL 30m). This warms on startup and refreshes every 30 minutes.
- `GET /wbc/standings/{code}` — cached fetch of standings by division for the provided `leagueId` (use the numeric `code` in the path) (TTL 30m). If the fetched body contains `{ records: [] }` the endpoint responds with `{ "message": "No standings found" }`. Each requested `leagueId` will be refreshed every 30 minutes after its first fetch.
- `GET /wbc/players` — cached fetch of `v1/sports/51/players?fields=people,id,fullName,currentTeam,id,primaryPosition,name,abbreviation` (TTL 30m). Refreshes every 30 minutes after first request.
- `GET /wbc/search` — combines `/wbc/players` and `/wbc/teams` into a single payload. Teams are trimmed to `{ id, name, abbreviation, divisionName }`. Cached for 12 hours (TTL).
- `GET /wbc/teamSchedule/{code}` — fetches schedule for `teamId={code}` for 2025, merges sources, and returns `{ dates: [{ date, games: [...] }] }`. Cached 30 minutes and refreshed periodically.
- `GET /wbc/teamRoster/{code}` — fetches the 40-man roster for `teamId={code}` with fields `roster,person,id,fullName,jerseyNumber,position,name,abbreviation,status,description`. Cached 30 minutes and refreshed periodically.
- `GET /wbc/teamCoaches/{code}` — fetches coaches for `teamId={code}` and returns an array of `{ fullName, jerseyNumber, job }`. Cached 30 minutes and refreshed periodically.
- `GET /wbc/stats` — fetches team stats for seasons 2025 and 2026 (groups `hitting` and `pitching`), combines per-team results and returns an array of teams with `stats.hitting` and `stats.pitching` containing per-season filtered stats and rank. Only selected stat fields are included and keys are humanized.

Notes

- The server warms the `/leagues` cache on startup and refreshes it every 30 minutes.
- MLB sports-favs notifications poll MLB schedule every 5s only during the active window:
  - starts 30 minutes before first game of the MLB day
  - MLB day uses America/Los_Angeles and rolls at 2:00 AM PT
  - stops once all games for that date are final/postponed/cancelled
- Notification payloads include `sport: "mlb"` and `gamePk` for deep-linking to GameDetails.
- For Railway, the included `Procfile` declares the `web` process.

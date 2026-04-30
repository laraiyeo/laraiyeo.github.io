# f1-server

Lightweight proxy/cache server for the openf1 API used by live-sports-tracker. Ready to deploy on Railway/Heroku.

Endpoints:

- `GET /drivers` — forwards query params to `/v1/drivers`, but returns a deduplicated list (one entry per driver) and only includes entries that have `team_name`.
- `GET /proxy/*` — generic proxy to the API (cached)
- `GET /health` — health + cache info
- `GET /` — basic info

Run locally:

```bash
npm install
npm start
```

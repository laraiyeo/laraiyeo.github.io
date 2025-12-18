# Bet Server (consolidated)

This repository contains the consolidated `bet-server` entrypoint `server.js` which uses the Supabase admin HTTP client (service_role) and inlined push/watch/auth logic.

## Required environment variables

- `SUPABASE_URL` — your Supabase project URL (https://xyz.supabase.co)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase `service_role` key (keep secret)
- `JWT_SECRET` — secret used to sign auth JWTs (keep secret)
- `PORT` — optional, default 3000

Do NOT commit these values to source control. Use Railway/host env var settings or local `.env` (for local testing only).

## Install

From `bet-server` directory:

```bash
npm install
```

## Run locally

```bash
# development with live reload (nodemon)
npm run dev

# or production
npm start
```

Make sure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `JWT_SECRET` are exported in your shell or present in `.env`.

## Test endpoints

- Health:

```bash
curl http://localhost:3000/health
```

- Signup / Login (returns server JWT):

```bash
curl -X POST http://localhost:3000/api/auth/signup -H "Content-Type: application/json" -d '{"username":"alice","password":"secret"}'

curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"username":"alice","password":"secret"}'
```

- Upsert Expo push token (use token returned by Expo client). Replace `<JWT>` and `<TOKEN>`:

```bash
curl -X POST http://localhost:3000/api/profile/push-token \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"pushToken":"<TOKEN>","platform":"ios"}'
```

- Place a bet (example):

```bash
curl -X POST http://localhost:3000/api/betslips \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"betslipData": {"bets": []}, "totalStake": 10, "potentialPayout": 18}'
```

## Deployment (Railway / similar)

1. Add the project to Railway.
2. Set environment variables in the Railway project settings: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`.
3. Set start command to `npm start` (or use Railway default).

## Notes

- The server uses Expo push tokens — tokens are issued only by real devices or proper dev clients. Expo Go may not consistently return push tokens.
- Watchers are in-memory and will be lost on server restart; they are intended as ephemeral background jobs.
- Backups of previous modular files are stored in `bet-server/backups/backup-20251218T000000/`.

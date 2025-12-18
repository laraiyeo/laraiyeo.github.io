Quick guide — easiest approach and how to test push notifications

Summary (recommended, easiest):

- Use the existing `bet-server` API to place bets (POST `/api/betslips`). The server now starts an in-memory watcher for each placed bet and will send notifications using `bet-server/services/pushNotifications.js`.
- This avoids any Supabase trigger/Edge Function complexity: the client calls your server, server writes DB and starts watcher.

Step 1 — Ensure user has Expo push token

- On the client (Expo), obtain the push token and save it to your users table using your existing client API or server endpoint. The `sendPushNotification` function reads `users.push_token`.
- Example client call (JS):

```js
// after you get the expoPushToken from Notifications.getExpoPushTokenAsync()
await fetch("https://YOUR_SERVER/api/profile/push-token", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ pushToken: expoPushToken }),
});
```

Step 2 — Place a bet via server API

- Easiest: have the client call your server's place-bet endpoint instead of inserting directly into Supabase. The server does credit checks, inserts into `betslips`, and auto-starts the watcher.

Example (client):

```js
await fetch("https://YOUR_SERVER/api/betslips", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ betslipData, totalStake, potentialPayout }),
});
```

Step 3 — Run server and verify

- Start `bet-server` locally:

```bash
cd bet-server
npm install
node server.js
```

- Place a test bet from your client or via curl (see below). The server logs will show watcher start and polling activity.

Manual curl to place a bet (example):

```bash
curl -X POST https://YOUR_SERVER/api/betslips \
  -H "Authorization: Bearer <JWT_OR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "betslipData": { "bets": [ { "gameId": "401452000", "description": "LAL", "team": "LAL", "odds": "+150" } ] }, "totalStake": 1, "potentialPayout": 2.5 }'
```

Step 4 — Test notifications
Option A — Real-device test

1. Make sure the Expo app on your phone is built and the device has registered a push token and it's saved in `users.push_token`.
2. Place the bet using the server API. When the watcher detects a pick/ticket win or loss it will call the push helper which sends the push and inserts a row in `push_notifications` table.
3. Watch server logs and your device for the notification.

Option B — Trigger a test notification via script

- Use the provided script to send a test push to a user by id:

```bash
cd bet-server
node scripts/send_test_notification.js <USER_ID> "Test Title" "Test Body"
```

This calls the same `sendPushNotification` helper used by the watcher.

Option C — Simulate watcher behavior

- Start a watcher for an existing betslip manually:

```bash
curl -X POST https://YOUR_SERVER/api/betslips/<BETSLIP_ID>/watch \
  -H "Authorization: Bearer <JWT_OR_TOKEN>"
```

- Stop watcher:

```bash
curl -X DELETE https://YOUR_SERVER/api/betslips/<BETSLIP_ID>/watch \
  -H "Authorization: Bearer <JWT_OR_TOKEN>"
```

Option D — Remote device testing (ngrok)

- If your device can't reach localhost, run ngrok to expose your server and update `YOUR_SERVER` with the ngrok URL:

```bash
npm i -g ngrok
ngrok http 3000
```

- Use the ngrok URL in the client and in the curl commands above.

Debug tips

- Check `push_notifications` rows in DB to confirm server recorded sends.
- Check server logs for watcher polling messages and send errors.
- If you see "Invalid Expo push token" in logs, verify token format (must start with `ExpoPushToken[...]`).

Supabase integration notes (optional)

- If you must insert bets directly into Supabase and still want the watcher started automatically, simplest options are:
  1. Keep using the server: make client call server API instead of inserting directly in Supabase (recommended).
  2. Use Supabase Realtime or an external process to listen for inserts and POST to your server's `/api/betslips/:id/watch` endpoint.
  3. (Advanced) Create a Postgres trigger that writes to a small relay table or emits `pg_notify`; run a tiny worker that LISTENs for notifications and calls your server. This avoids HTTP from the DB and keeps logic outside Postgres.

If you want, I can add an Edge Function + a simple Supabase trigger example next.

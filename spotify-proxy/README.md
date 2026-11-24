# spotify-proxy

A tiny Express service that lets the **Song Tournament** page read Spotify's
public catalogue **without any visitor signing in**.

## Why it exists

Spotify's Web API needs an access token for every call. There are two ways to get
one:

| Flow | Needs | Can a browser use it? |
| --- | --- | --- |
| **PKCE** (what the page used before) | each visitor logs into Spotify | yes — no secret |
| **Client Credentials** (this service) | a client **secret** | no — a secret can't be shipped to a browser |

Client Credentials authenticates the *app*, not a user, so it needs the secret.
This service holds the secret, fetches an app-only token, and exposes plain GET
endpoints the page can call anonymously.

**Good side effect:** because there is no per-user token, the development-mode
allowlist no longer applies — visitors never see `403 Forbidden`, and nobody has
to be added to *Users Management*.

**Not involved in playback.** The Spotify embed is an `<iframe>` that uses the
*viewer's* Spotify cookies. This proxy never touches it, so it cannot change
whether someone hears a preview or a full track.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness + whether credentials are configured. |
| `GET` | `/search?q=&type=artist\|track&limit=&offset=&market=` | Artist/track search. |
| `GET` | `/artists/:id/albums?include_groups=&limit=&offset=&market=` | An artist's albums. |
| `GET` | `/albums/:id/tracks?limit=&offset=&market=` | Tracks on an album. |

Responses are Spotify's own JSON, passed through unchanged, so the page's
existing parsing works as-is.

### Notes

- `limit` is clamped server-side: `/search` **10**, artist albums **10**, album
  tracks **50**. Spotify silently lowered these caps and returns `400 Invalid
  limit` above them, so the client can't exceed them even by mistake.
- `market` defaults to `DEFAULT_MARKET` (`GB`). With Client Credentials there is
  no user, so a market must be supplied to resolve track availability.
- The token is cached in memory and refreshed 30 s before expiry; a burst of
  cold-start requests shares one token fetch.
- Responses are cached in memory for `CACHE_TTL_MS` (default 10 min), which keeps
  repeat tournament builds from costing upstream quota.
- Errors are relayed with Spotify's status code and message, so the page can
  still explain an allowlist/quota/limit problem if one ever appears.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `SPOTIFY_CLIENT_ID` | **yes** | From your Spotify app. |
| `SPOTIFY_CLIENT_SECRET` | **yes** | From your Spotify app → Settings → *View client secret*. |
| `PORT` | no | Injected by Railway. Defaults to `3000`. |
| `DEFAULT_MARKET` | no | ISO country code for availability. Defaults to `GB`. |
| `ALLOWED_ORIGINS` | no | Comma-separated CORS allowlist. Defaults to `*`. |
| `PROXY_TOKEN` | no | If set, callers must send `x-proxy-token`. Discourages scrapers; not real security (the value is visible in page source). |
| `CACHE_TTL_MS` | no | Response cache lifetime. Defaults to `600000`. |
| `RATE_LIMIT_PER_MIN` | no | Requests per IP per minute. Defaults to `240`. |

## Running locally

```bash
cd spotify-proxy
npm install
SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy npm start
```

Then check it:

```bash
curl localhost:3000/health
curl "localhost:3000/search?q=radiohead&type=artist&limit=5"
```

## Deploying to Railway

1. Create a **new service** in your Railway project and point it at this repo,
   with **Root Directory** set to `spotify-proxy`. Railway will use the
   `Dockerfile`.
2. Add the variables `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` (and
   optionally `DEFAULT_MARKET`, `ALLOWED_ORIGINS`).
3. Deploy, then open `https://<your-service>.up.railway.app/health` and confirm
   `"configured": true`.
4. Put that URL in the page's `js/config.js` as `API_BASE`.

> **Keep the secret server-side.** `SPOTIFY_CLIENT_SECRET` must only ever exist in
> Railway's variables. Do not put it in `config.js`, in any file the browser
> loads, or in the repo. If a secret is ever committed, rotate it in the Spotify
> dashboard.

## Costs and limits

Client Credentials calls count against the app's rate limit, not a per-user
development quota, so the login-free mode is materially less fragile than the
PKCE mode. The in-memory cache and a 240 req/min per-IP ceiling keep a small
service comfortably within that; a single Railway instance is plenty.

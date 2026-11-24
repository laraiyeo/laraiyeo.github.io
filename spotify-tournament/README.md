# 🎵 Song Tournament

Build a knockout bracket — or a Champions League style group stage — out of your
favourite artists, listen to each head-to-head, pick a winner, and crown a
champion.

Two formats, sharing the same one-match-at-a-time flow:

- **Knockout bracket** — pure single elimination with byes. **2–16 artists.**
- **Group + Knockout** — a round-robin group stage split into **2, 4 or 8
groups**, then a knockout. The artist count must divide evenly, 2+ per group.

**Songs per artist scale with the field size** (about 48 songs in total, so 6
artists get 8 songs each, 12 artists get 4 each). A flat "10 songs each" would
mean 160 songs for a 16-artist bracket.

Both formats give you:

- Live artist search against the Spotify catalog, plus a **similar** shortcut
  and a **Genre** box for branching out
- **Top N** or **N random** songs per artist, with a **featured** toggle, and an
  album picker to restrict where random songs come from
- Undo, live progress bars, and a standings table (group mode), plus a full
  bracket/knockout view
- Every matchup embeds the official Spotify player so you can actually **listen**,
  and each card is **tinted with a gradient pulled from its album art**

---

## Two ways to run it

There are two independent layers here, and it helps to keep them apart:

| Layer | What it needs | Set up by |
| --- | --- | --- |
| **Song data** — artist search, albums, tracks | an access token | you (nothing, or your visitors logging in) |
| **Playback** — the Spotify player in each card | *the viewer's own Spotify session* | nothing you can configure |

### Playback is not something this page controls

Each card contains Spotify's **own embed**, which is an `<iframe>` pointing at
`open.spotify.com/embed/track/…`. It receives **only a track ID** — never a token —
and decides what to play from the viewer's Spotify login *cookies in that browser*:

- Browser signed in to Spotify → **full track**
- Browser not signed in → Spotify's **official 30-second preview**

So whether you see the preview or the full song is nothing to do with signing in
on this page, and nothing in the code can change it. **To see the preview embed,
open the page in a private/incognito window.**

### Song data: pick one mode

| Mode | Login for visitors | How |
| --- | --- | --- |
| **Public** (recommended) | **none** | Deploy `spotify-proxy/` and set `API_BASE` in `js/config.js`. |
| **Direct** | everyone logs in | Leave `API_BASE` empty; each visitor authorises via PKCE. |

The page picks the mode automatically from `API_BASE`. The two sections below
cover each in turn.

---

## Public mode (no login) — recommended

Spotify's Web API needs a token for every call. A token can be obtained either by
**each visitor logging in** (PKCE) or by authenticating **the app itself**
(Client Credentials). The catch with Client Credentials is that it requires a
client **secret**, and a secret can never be shipped to a browser.

The `spotify-proxy/` service solves that: it holds the secret server-side,
fetches an app-only token, and exposes plain GET endpoints the page calls
anonymously. Visitors just open the page and play.

It also **removes the `403 Forbidden` allowlist problem entirely**, because there
is no per-user token any more.

```bash
cd spotify-proxy
npm install
SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy npm start
```

Then set the URL in `js/config.js`:

```js
API_BASE: "https://your-service.up.railway.app",
```

See **[`spotify-proxy/README.md`](../spotify-proxy/README.md)** for the full
deployment guide, environment variables, and endpoint list.

> Never put `SPOTIFY_CLIENT_SECRET` in `config.js` or anywhere the browser loads.
> It belongs only in the server's environment variables.

---

## Direct mode (everyone logs in)

Use this when you have **no backend deployed** — it is the original flow, and
still fully supported (leave `API_BASE` as `""`).

This page then calls the Spotify Web API straight from the browser using the
**Authorization Code with PKCE** flow. No client secret, no backend — but every
visitor needs **their own free Spotify app** and must be added to its allowlist,
because Spotify requires a registered Client ID for every request and refuses
accounts that aren't listed.

> **Direct mode's trade-off:** it requires a login that the public mode doesn't,
> and the login buys nothing for playback (see above). That is exactly why public
> mode exists. Note also that the app **owner needs an active Premium
> subscription** for a development-mode app to function at all.

### 1. Create a Spotify app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   and log in.
2. Click **Create app**.
3. Give it any name/description. For **Redirect URI**, paste the URI shown on the
   page under *"In your Spotify app settings, add this exact Redirect URI"*
   (see below).
4. In **APIs used**, tick **Web API**.
5. Save, then open the app and copy the **Client ID**.

### 2. Get the exact Redirect URI

Open the page and copy the value shown in the **Redirect URI** box. It is simply
`origin + pathname`, for example:

| How you're serving it | Redirect URI to register |
| --- | --- |
| Local dev server | `http://127.0.0.1:8770/spotify-tournament/index.html` |
| Deployed on your site | `https://sportsheart.ca/spotify-tournament/index.html` |

> **It must match character-for-character** — same scheme, host, path, and no
> trailing slash unless the box shows one. You can register several Redirect URIs
> on the same app, so add both your local and production URL.
>
> Redirect URIs that use a loopback IP (`http://127.0.0.1:...`) are exempt from
> Spotify's general ban on `http://`, so local development works without HTTPS.

### 3. Connect

Paste the Client ID into the field on the page, click **Save Client ID**, then
**Connect to Spotify**. You'll be sent to Spotify to approve access and bounced
straight back, still logged in.

> **Do I actually need to log in?** Only in **direct mode**, because Spotify will
> not serve catalog data without a token and a user login is one way to get one.
> In **public mode** the token comes from the proxy's server-side secret and there
> is no login at all. Either way this has **no effect on playback**, which always
defers to the viewer's own Spotify session.

Your Client ID is remembered in `localStorage`, so you only do this once per
browser. Alternatively, hardcode it in `js/config.js` (`CLIENT_ID`) to skip the
paste step for everyone using your deployment.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `403 Forbidden` on **every** request — *"Spotify refused this request (403)"* | Your app is in development mode and the Spotify account you're signed in as isn't on its allowlist. **This is not about Premium.** An account can log in fine and still be refused, because Spotify returns 403 for any token belonging to a user who isn't allowlisted. Fix: Developer Dashboard → your app → **Settings** → **Users Management** → *Add new user*, using the **Spotify email** of the account you're logging in with, then reconnect. Development mode allows a small number of accounts (5 at the time of writing). |
| Premium account works but other accounts get 403 | Expected. The premium account is almost certainly the app **owner** (owners are implicitly allowed); every other account has to be added to Users Management individually. |
| App stopped working entirely, owner is Premium | In development mode the app **owner** must hold an active Premium subscription — if it lapses, the whole app stops working for everyone until they resubscribe. |
| `403 Forbidden` on one specific endpoint | That endpoint has been deprecated. This is what happened to `/artists/{id}/top-tracks` and `/artists/{id}/related-artists` (and to the batch `/tracks`, `/albums`, `/artists` endpoints, plus the `popularity`, `followers` and `genres` fields); the page no longer uses them. |
| `429 Too Many Requests` (a plain 429) | An ordinary rate limit — a short-term burst limit that clears on its own. The page **honours Spotify's `Retry-After`** rather than guessing, then retries automatically. Just wait; nothing to change. |
| `429` with `"reason": "QUOTA_EXCEEDED"` | **Not a rate limit.** This is the shared *daily* allowance for a **development mode** app, tracked against the app owner's developer account. It does **not** clear in a few seconds — waiting will not help, and retrying cannot succeed. See [Hitting the daily quota](#hitting-the-daily-quota) below. |
| `INVALID_CLIENT: Invalid redirect URI` | The Redirect URI in the Dashboard doesn't match the box on the page *exactly*. Re-copy it. |
| `Couldn't build — skipped <artist> (no songs found)` | That artist had no playable tracks matching your filters (e.g. everything was a feature and you disabled features). The message names the artists so you know which ones to change. |
| Embed shows *"Page not available"* | That particular track isn't embeddable by Spotify. Nothing to fix — the other songs still work. |
| Button says **Connect to Spotify** even though you're logged in | Your session expired or was cleared. Log in again. |

> **Testing with more than a couple of accounts?** Development mode's limits are
> the wall here, not the code. Adding several real accounts means adding each one
> to Users Management, and they all share one daily quota. Extended quota mode
> removes both limits but is only open to registered organisations — not
> individuals — so it isn't an option for a personal project.

---

  the environment instead.

---

## Hitting the daily quota

Two different things are both reported as `429`, and they need opposite
responses. Spotify's own docs are explicit that the quota system is *"different
from rate limits"*:

| | Rate limit | Quota |
| --- | --- | --- |
| Meaning | Too many requests too fast | Daily allowance for the app is gone |
| Body | `"error": {"status": 429}` | `"error": {"status": 429, "reason": "QUOTA_EXCEEDED"}` |
| Clears | In seconds, per `Retry-After` | On Spotify's schedule — **not** in seconds |
| Response | Retry with backoff | Retrying is pointless |

Retrying a quota error is not merely useless — it is counterproductive, because
the retried requests still count against the allowance. So the page fails those
immediately instead.

**There is no way around the quota by asking differently.** It is counted against
the developer account that owns the app, and it is shared by *all* users of that
app — so adding accounts, or logging in per-visitor, does not add headroom. It
also is not a licensing restriction you can code past: only **extended quota
mode** changes it, and since May 2025 that is open to registered organisations
only (with 250k+ monthly users among the criteria), not individuals.

### What actually helps

The real lever is doing fewer upstream requests. In rough order of effect:

1. **Use *Top N* instead of *N random*.** Top mode pages `/search` (roughly one
   request per 10 candidates). Random mode lists albums and *then* fetches tracks
   per album, so it costs several times more for the same number of songs.
2. **Pick fewer albums in random mode.** Choosing albums for an artist skips the
   discography scan entirely. `RANDOM.ALBUM_PAGE_SIZE`, `MAX_ALBUM_PAGES` and
   `MAX_ALBUM_FETCHES` in `js/config.js` cap the scan.
3. **Use fewer artists.** Cost is close to linear in artist count, and
   songs-per-artist is already scaled to the field size (`SONGS_TARGET_TOTAL`).
4. **Leave the proxy's response cache on.** It defaults to 10 minutes
   (`CACHE_TTL_MS`), so re-running a bracket for the same artists costs nothing
   upstream. Lowering the TTL trades quota for freshness — don't, if you are
   quota-constrained. Bumping `CACHE_MAX_ENTRIES` (default 500) helps if your
   working set is larger than that.
5. **Don't leave a second consumer running against the same app.** Anything else
   using this client id — including the *direct* mode path, where each visitor
   mints their own token for the *same* app — shares the same daily pool.

If you are developing and burn the quota while iterating, the practical move is a
**second Spotify app** (its own client id and secret) as a scratch app. That is
the only way to get a genuinely independent allowance, since the quota follows
the app rather than the caller.

> **Note on the default credentials.** `spotify-proxy/server.js` currently falls
> back to a hard-coded client id and secret when the environment variables are
> unset, so the repo contains live credentials. That is convenient locally but
> worth rotating before sharing the repo — and the fallback should ideally be
> removed so a misconfigured deployment fails loudly instead of quietly using
> someone's app.

### How the code behaves now

- A **quota** response fails immediately, with the message explaining that waiting
  will not help. It is deliberately *not* retried: retrying cannot succeed, and
  previously it burned four escalating backoffs **per artist** before reporting
  anything.
- A **rate limit** is retried, waiting exactly as long as `Retry-After` asks
  rather than using exponential backoff, which for a long window meant retrying
  for far longer than needed.
- The proxy forwards `Retry-After` and Spotify's `reason` through to the page, so
  the two cases are distinguishable in the UI instead of collapsing into one
  unhelpful "too many requests".

---

## Running it

The page must be served over `http://` or `https://` — **not** opened as a
`file://` path — because Spotify requires a real origin for the redirect.

Any static server works. For example, from the repository root:

```bash
python -m http.server 8770
```

Then open <http://127.0.0.1:8770/spotify-tournament/index.html>.
`py -m http.server 8770`, `npx serve`, or `npx http-server -p 8770` all work too.

---

## How to play

1. **Connect** to Spotify (above).
2. **Choose the format** — knockout bracket or Group + Knockout. The artist
   requirement and song count update to match.
3. **Choose how songs are picked** — top N or N random — and whether featured
   songs are allowed. *Top N* reconstructs the artist's best-known tracks from
   catalog search results; *N random* samples across their albums, singles and
   compilations.
4. **Pick your artists** — search by name, hit **similar** on a result to branch
   out, or use the **Genre** box. 2–16 for a bracket; for Group + Knockout the
   count must divide evenly between the groups.
5. Hit **Build**. Songs are fetched, de-duplicated across artists, and arranged
   into rounds.
6. Each matchup shows two songs side by side with Spotify players embedded.
   Listen, then hit **Pick this song →**.
7. Keep going until the **champion** screen. From there you can run the same songs
   again (fresh draw), step back one pick, or start over with new artists.

### Choosing how much of each song plays

The setup screen has a **Listening length** option:

| Setting | Behaviour |
| --- | --- |
| **30-second clip** | Pauses and rewinds after 30 seconds, so every song gets the same short listen. |
| **Full song** | No auto-stop. |

This is implemented with Spotify's embed **iFrame API**, which exposes playback
position and lets the page pause and seek. Three things worth knowing:

- **It cannot request Spotify's official 30-second preview.** Spotify removed
preview URLs from the Web API for new applications (announced 2024-11-27): a
`GET /v1/tracks/{id}` for a newly-created app no longer returns `preview_url`.
The embed has no preview flag either, and it picks the audio from the listener's
entitlement — **if you are signed in to Spotify you get the real track in both
modes.** So the 30-second clip does not switch to Spotify's preview audio; it
cuts the real track off after 30 seconds. That is the only lever the API exposes.
- It can only ever **shorten** playback, never extend it. If Spotify would only
give you a 30-second preview, no setting changes that. For a **full song**, your
browser has to be signed in to Spotify, with a Premium account for full tracks —
that's an embed limitation, not something this page can override.
- Clip mode is enforced by watching the position, with a wall-clock timer as a
backup for when the embed reports position rarely. Spotify reports position in
**milliseconds** (its own docs divide by 1000), so the limit is compared in
milliseconds too. Mixing the two units is the kind of bug that stops a song the
instant it starts.
- **Only one song plays at a time.** Every mounted player shares a registry, and
when one transitions from paused to playing the others are paused. This matters
most when the page *isn't* logged in: Spotify's embeds will happily play two
30-second previews over the top of each other, because the embed only pauses
its neighbours when a signed-in session tells it to. The page watches the
`playback_update` event itself, so it works either way. Only the transition into
playing triggers it (the event also fires on every position tick and when
buffering), so it never fights the clip-mode timer.

### Controls

| Control | What it does |
| --- | --- |
| **Undo pick** | Steps back one match at a time, all the way to the start. Perfect, exact undo — no re-deriving state. Available on the champion screen too. |
| **New tournament** | Returns to setup, keeping your artists so you can change the format or mode. |
| **Full bracket / Knockout bracket** | Expandable bracket strip showing every round, with winners highlighted and losers struck through. In a group stage it sits **above the group tables** and appears as soon as the knockout starts. The pairing you're playing right now is highlighted in **yellow**. |
| **Shuffle matchups** | On: random draw. Off: strongest songs are seeded apart and receive the byes (bracket), or a deterministic group draw. |
| **Group tables** | League only — wins, losses and points per song, with the qualifying places highlighted. The two songs currently head-to-head are marked in yellow. |
| **Number of groups** | League only — 2, 4 or 8. Options your artist count can't support are disabled. |
| **Choose albums** | Random mode only — restrict which albums the random picks come from, per artist. See above. |
| **Open in Spotify ↗** | Under every player. Not every track is embeddable (and some play only a clip), so this always gets you the full song. |
| **Listening length** | **30-second clip** or **Full song**. See above. |

### The podium

The champion screen shows a **3D podium**: 2nd on the left, **1st in the middle**
and tallest, 3rd on the right, each with its album cover floating above a pillar.
The covers bob gently and lean back into the page (pure CSS — `perspective` plus
`rotateX`), and the whole animation is disabled for anyone with
`prefers-reduced-motion` set.

Because a knockout bracket has **two** beaten semi-finalists, the third-place
pillar lists the second one beneath it as a joint third rather than inventing a
play-off.

---

## The group stage (Champions League style)

Pick the **Group + Knockout** format, choose how many artists you want, and how
many **groups** to split them into (**2, 4 or 8**).

The group options are labelled with what they need, so the requirement is visible
before you have picked anything:

| Option | Needs |
| --- | --- |
| 2 groups | **4+ artists**, and a multiple of 2 |
| 4 groups | **8+ artists**, and a multiple of 4 |
| 8 groups | **16+ artists**, and a multiple of 8 |

**Groups divide the artists, they don't fix the artist count.** A group needs at
least **2 artists**, because a song is always drawn against a song by a
*different* artist — a one-artist group would have nothing to play. So the artist
count must be a **multiple of the group count**:

| Artists | 2 groups | 4 groups | 8 groups |
| --- | --- | --- | --- |
| 4 | 2 per group ✅ | ❌ needs 8+ | ❌ needs 16+ |
| 6 | 3 per group ✅ | ❌ needs 8+ | ❌ needs 16+ |
| 8 | 4 per group ✅ | 2 per group ✅ | ❌ needs 16+ |
| 12 | 6 per group ✅ | 3 per group ✅ | ❌ needs 16+ |
| 16 | 8 per group ✅ | 4 per group ✅ | 2 per group ✅ |
| 5 or 7 | ❌ odd — no even split exists | ❌ | ❌ |

The setup screen disables group counts your current selection can't support and
tells you exactly how many artists are needed. **Build is disabled outright for an
odd or otherwise ungroupable count** (5, 7, 9…), with the reason stated — nothing
is silently rounded down to a single giant group.

**Phase 1 — group stage.** Each group runs its own round-robin: every song plays
against songs from the other artists in its group, with no repeat pairings. Win =
3 points, no draws. Tables sort on points, then wins, then fewest losses.

**Phase 2 — knockout.** The top finishers from every group advance (4 each by
default, trimmed automatically so the bracket stays a power of two). Seeds cross
the groups so no two songs from the same group meet in the first knockout round.
The bracket scales: 8 qualifiers give QF → SF → Final, 16 give R16 → QF → SF →
Final, and so on.

> **Heads up on length.** More groups means more matches, because each group runs
> its own round-robin. 8 artists in 2 groups is **55** matches; 16 artists in 8
> groups is well over 200. The setup screen shows the exact counts before you
> start.

---

## Choosing which albums "random songs" come from

With **N random songs** selected, a **3b. Choose albums** panel appears in setup:

1. Add your artists
2. Click **Load albums for my artists**
3. Tick the albums to draw from

Each artist is handled **independently** — tick albums for one artist and leave
another alone, and the first draws only from your picks while the second still
uses its whole discography. Leave everything unticked to draw from the full
discography as before. Untick with **Clear all album choices**.

This is why the panel loads on demand rather than automatically: listing the full
discography of a prolific artist takes several paginated requests per artist.

---

## About the knockout bracket (the "too many songs" problem)

Songs per artist now **scale down as the field grows** (a total of about 48), so
the old blow-up — 10 artists × 10 songs = 100 songs — no longer happens: that same
field is now 10 artists × 5 songs = 50. Even so, 50 isn't a power of two.
The engine pads the field to the next power of two (**64**) and hands the
excess slots out as **byes** using standard bracket seeding, so:

- Top seeds get the byes and skip round one
- Strong songs can't meet until the later rounds
- Every song except the champion loses exactly one match, so an N-song
  tournament is always exactly **N − 1** decisions

Want something shorter still? Use fewer artists, or switch to
**Group + Knockout**.

---

## Known limitations

Worth knowing before you file a bug — these are Spotify platform constraints, not
bugs in this page:

- **Do I need to log in?** Yes. Spotify requires an access token for every Web API
  call, and a token can only be minted from your own Client ID — there is no
  anonymous or public path. Logging in also tells the page which **market** you're
  in (e.g. Canada), so songs are resolved against your country.
- **"Similar artists" is relevance, not Spotify's similarity graph — and the
  genre box exists because of that.** Spotify retired every endpoint that
  answered "who sounds like X": `/artists/{id}/related-artists` returns
  **`403 Forbidden`**, `/recommendations` is **gone (404)**, and the artist
  **`genres` field is deprecated and now always returns `[]`** (verified across
  Radiohead, Taylor Swift, Metallica and others). So the **similar** chip falls
  back to relevance: it searches the artist's own name and keeps the head of the
  result list, which is where Spotify puts the adjacent artists (Radiohead →
  R.E.M., Muse, Thom Yorke). It discards karaoke/tribute/sped-up entries and
  anyone already in the field, and caps the list at 6 because relevance degrades
  into literal name matches further down.
- **The Genre box only accepts Spotify's own genre vocabulary.** The `genre:`
  search filter still works, but only for simplified names: `genre:"indie rock"`
  returns 100 artists, `genre:"pop"` and `genre:"hip hop"` work, while the
  compound values Spotify used to publish in `genres` — `"alternative rock"`,
  `"art rock"`, `"prog rock"`, `"grunge"` — now return **zero results**. Since
  the page can no longer read an artist's genres, the user supplies the genre
  directly. A miss produces an explanatory message rather than an empty list.
- **There are no "top tracks" anymore.** Spotify's `/artists/{id}/top-tracks`
  endpoint is deprecated and returns **`403 Forbidden`**, and the track
  **`popularity` field is deprecated too** (it is not returned at all now).
  "Top N songs" is therefore a reconstruction: search the catalog for the
  artist's tracks, keep only tracks they are genuinely credited on, and preserve
  Spotify's relevance order. It is a reasonable approximation rather than an
  official chart, and it is inherently less meaningful than a real popularity
  ranking — the ranking step no longer exists to apply.
- **`/search` is capped at 10 results and `/artists/{id}/albums` at 10 albums.**
  Spotify silently lowered the search `limit` cap from 50 to 10, so asking for
  more returns `400 Invalid limit`. "Top 10 songs" therefore pages through search
  offsets 10 at a time (`SEARCH_LIMIT` / `TOP_SEARCH_PAGES` in `js/config.js`),
  stopping as soon as it has enough usable songs. Random mode pages albums the
  same way (`RANDOM.ALBUM_PAGE_SIZE`). Both caps bite silently — the numbers in
  the docs are the only warning you get, which is what caused an earlier
  `Invalid limit` failure here.
- **Audio previews are unreliable.** Spotify gutted most 30-second `preview_url`
  values in late 2024, which is why this page uses the **official embed player**
  instead of raw audio files. The embed plays whatever Spotify makes available
  (often a clip, occasionally nothing for obscure tracks) and requires no login
  and no Premium. If an embed shows *"Page not available"*, that specific track
  isn't embeddable.
- **Playback is a widget, not a native mini-player.** Full-length playback would
  require the Web Playback SDK plus a Premium account, and the SDK needs a
  different scope set — deliberately out of scope here.
- **"Featured" detection** is based on whether the artist is `artists[0]` on the
  track. That matches Spotify's own convention for "main artist" and is what the
  *Allow featured* toggle uses. Note that Spotify's search `artist:` filter
  matches per-artist appearances rather than just the main artist, so every result
  is additionally filtered by artist **id** to make sure you never get a
  different artist who happens to share a name.
- **A brand-new app is in development mode**, which caps usage (a handful of
  allowlisted users and a shared request quota per developer account). If you hit
  `429 QUOTA_EXCEEDED` rather than a short-lived rate limit, that's the cause —
  moving to extended quota mode requires a company application Spotify accepts.
- **Getting 10 songs out of an artist takes several search requests.** The only
  supported way to rank an artist's tracks is to search for them, and Spotify
  caps `/search` at 10 results per request. Those results are fuzzy, so a page is
  usually a mix of real songs, features and same-named artists. The page therefore
  walks through result offsets (up to `TOP_SEARCH_PAGES`) and filters each page to
  the artist's own ID, stopping as soon as it has enough. If an artist is
  unusually feature-heavy or obscure you may still get fewer than 10, and the
  build message will name them. Switching the **featured** toggle on widens the
  pool and usually fills the quota.
- **Card tinting needs CORS on the image CDN.** The gradient comes from sampling
  the album art on a canvas, which only works because `i.scdn.co` sends
  `Access-Control-Allow-Origin`. If that ever changes, extraction fails silently
  and cards simply keep their flat background — nothing breaks, the colour just
  goes away. Greyscale art falls back to a single colour plus a darker shade of
  it, so the gradient always has some depth.
- **The bracket layout depends on one geometric rule.** Matches live in their own
  `space-around` flex column, separate from the round heading. Because each round
  halves the match count, `space-around` places match *i* at `(2i+1)/2n` of the
  height — exactly halfway between its two feeders, and identical across every
  round. This only holds while all rounds share a height and all matches share a
  height; adding a `gap` to that column breaks it.
- **Not every track is embeddable.** The player is a Spotify widget, so some
  tracks show *"Page not available"* and many play only a short clip. Each card
  carries an **Open in Spotify** link as a guaranteed fallback.
- **Players are mounted through the embed iFrame API**, loaded lazily from
  `open.spotify.com/embed/iframe-api/v1` on the first playback. `createController`
  replaces the host element with the player iframe, so an empty host afterwards is
  expected. If the script fails to load (or doesn't call back), the page falls
  back to a plain `<iframe>` — playback still works, it just can't auto-stop.
  Each matchup **destroys** the previous controllers before rendering, otherwise
  old players keep running behind the new cards.
- **Rate limits are real.** Requests are queued (4 at a time) and `429`s are
  retried automatically using Spotify's `Retry-After` header. Random mode also
  caps how many albums it scans per artist. With a large field in random mode expect
  roughly 10–30 seconds.

---

## Files

```
spotify-tournament/
├── index.html      # Markup for all three screens (setup / tournament / champion)
├── style.css       # Self-contained dark theme
├── js/
│   ├── config.js   # Client ID, scopes, sizes, league shape, embed theme, caps
│   ├── auth.js     # PKCE login, redirect handling, token refresh  → window.STAuth
│   ├── api.js      # Rate-limited Spotify client                → window.STSpotify
│   ├── bracket.js  # Knockout: seeding, byes, undo, champion    → window.STBracket
│   ├── league.js   # League: groups, table, knockout, champion  → window.STLeague
│   ├── colors.js   # Album-art dominant colour extraction       → window.STColors
│   ├── player.js   # Embed playback via the iFrame API (clips)  → window.STPlayer
│   └── app.js      # Screen wiring and DOM rendering
└── README.md
```

The page is fully self-contained: it loads no shared site scripts, so changes
here can't affect the rest of the site.

---

*Song data and playback are provided by Spotify. This is an unofficial fan tool
and is not affiliated with, endorsed by, or sponsored by Spotify.*

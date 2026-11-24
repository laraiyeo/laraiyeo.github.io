/* ─── Spotify Song Tournament — configuration ───────────────────────────────
 *
 * ── Two ways to run this page ──────────────────────────────────────────────
 *
 * 1. PUBLIC (recommended, no login for visitors)
 *    Deploy the `spotify-proxy/` service and put its URL in API_BASE below.
 *    The proxy holds a client secret server-side and uses an app-only token,
 *    so nobody has to sign in to anything — and the development-mode allowlist
 *    (the cause of `403 Forbidden`) no longer applies.
 *
 * 2. DIRECT (no backend; falls back automatically when API_BASE is empty)
 *    Every visitor signs in with their own Spotify account via PKCE. No secret
 *    is involved, which is the only reason a user login was ever needed. Each
 *    account must be on the app's allowlist, and must be signed in to Spotify
 *    anyway for the player to do anything useful.
 *
 * ── What this setting never affects ────────────────────────────────────────
 * Playback. The Spotify embed is an <iframe> that uses the VIEWER'S Spotify
 * cookies, so it is entirely independent of how the page got its data. A
 * browser signed into Spotify plays full tracks; one that isn't hears the
 * official 30-second preview. No token on this page changes that.
 * ────────────────────────────────────────────────────────────────────────── */
window.STConfig = {
  /* URL of the deployed spotify-proxy service, e.g.
   *   API_BASE: "https://spotify-proxy-production.up.railway.app"
   * Leave as "" to require each visitor to log in with PKCE instead. */
  API_BASE: "http://localhost:3000/",

  /* Only used in DIRECT mode (API_BASE empty). Paste your Spotify app's Client
   * ID, or set it from the page UI — it is then remembered in localStorage
   * under `st_client_id`. Create a free app at
   * https://developer.spotify.com/dashboard and add the exact "Redirect URI"
   * shown on the page to that app's allowlist. */
  CLIENT_ID: "6900da01aa7a4e48b5666961473bcefc",

  /* Direct mode only. These two are all we need for search + user market. */
  SCOPES: "user-read-private user-read-email",

  /* Tournament shape. MAX_ARTISTS is the hard ceiling for the bracket format. */
  MAX_ARTISTS: 16,
  SONGS_PER_ARTIST: 10,

  /* Songs-per-artist scales with how many artists you add, so the field stays a
   * sensible size: 48 / artistCount, clamped between MIN and MAX. With the
   * default 6 artists that is 8 songs each (48 total). */
  SONGS_TARGET_TOTAL: 48,
  SONGS_MIN_PER_ARTIST: 2,
  SONGS_MAX_PER_ARTIST: 10,

  /* Spotify lowered the /search limit cap to 10 (it used to be 50), so "top
   * songs" mode pages through result offsets at this size instead. */
  SEARCH_LIMIT: 10,
  /* Depth of the search paging. `artist:"Name"` search results are fuzzy and a
   * chunk of any page is features or same-named artists, so we need several
   * pages to reliably surface 10 real songs. This is a ceiling, not a target —
   * paging stops as soon as enough songs are collected. */
  TOP_SEARCH_PAGES: 10, // up to 100 candidates scanned per artist

  /* League format (Group + Knockout). The artists are split into 2, 4 or 8
   * groups (chosen on the setup screen); each group runs its own round-robin
   * where every song plays songs by the OTHER artists in that group, so a group
   * needs at least 2 artists — and the artist count must divide evenly by the
   * group count.
   *
   * The top QUALIFY_PER_GROUP from every group then enter a single-elimination
   * knockout.
   *
   * These values are only DEFAULTS/fallbacks: the artist count is taken from the
   * songs actually fetched, the group count comes from the setup screen, and the
   * songs per artist scale with the artist count. */
  LEAGUE: {
    ARTISTS: 8, // fallback artist count if it can't be derived
    GROUPS: 2, // fallback group count
    SONGS_PER_ARTIST: 4, // floor for the league; scales up for smaller fields
    QUALIFY_PER_GROUP: 4, // capped so the knockout stays a power of two
  },

  /* Spotify embed theme: "0" = dark, "1" = light */
  EMBED_THEME: "0",

  /* Listening length.
   *   "preview" = pause and rewind after PLAY_SECONDS, so every song gets the
   *               same short listen.
   *   "full"    = no auto-stop.
   *
   * Note this only SHORTENS whatever Spotify's own player is already doing. It
   * cannot request the official 30-second preview: Spotify removed preview URLs
   * from the Web API for new apps (announced 2024-11-27), and the embed has no
   * preview flag. A listener signed in to Spotify hears the real track in both
   * modes — this setting only decides whether we cut it off at 30 seconds. */
  PLAY_LENGTH: "preview",

  /* Seconds a "preview" plays for, when that mode is selected. */
  PLAY_SECONDS: 30,
  /* How hard to work while sampling "random songs".
   * These caps keep us well inside Spotify's rate limits. */
  RANDOM: {
    /* Spotify caps /artists/{id}/albums at 10 items per request — asking for
     * more returns 400 "Invalid limit", so we page through 10 at a time. */
    ALBUM_PAGE_SIZE: 10,
    MAX_ALBUM_PAGES: 3, // pages (of 10 albums) to scan per artist
    MAX_ALBUM_FETCHES: 6, // album track lookups per artist
  },

  /* Album picker: how many pages of albums to list per artist when the user
   * browses their discography. 8 pages x 10 = up to 80 albums per artist, which
   * covers even very prolific artists without hammering the rate limit. */
  ALBUM_LIST_MAX_PAGES: 8,
};

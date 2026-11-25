/* ─── Song Tournament — configuration ───────────────────────────────────────
 *
 * The page reads Apple Music catalogue data through the `spotify-proxy`
 * service. That service holds the Apple Developer private key server-side and
 * signs a JWT for every catalogue call, so this page needs no credentials of
 * its own and visitors never log in to anything.
 *
 * Playback. Each track's 30-second preview comes from Apple's own CDN and is
 * played with a plain <audio> element. Nothing here affects that.
 * ────────────────────────────────────────────────────────────────────────── */
window.STConfig = {
  /* URL of the Apple Music catalogue proxy, e.g.
   *   API_BASE: "https://your-service.up.railway.app"
   * The proxy holds the Apple developer credentials server-side, so this page
   * needs no keys of its own. */
  API_BASE: "https://sportsheart-music.up.railway.app/",

  /* Tournament shape. MAX_ARTISTS is the hard ceiling for the bracket format. */
  MAX_ARTISTS: 16,
  /* Fixed songs-per-artist: knockout brackets use this value, Group + Knockout
   * uses LEAGUE.SONGS_PER_ARTIST below. */
  SONGS_PER_ARTIST: 10,

  /* Songs-per-artist scales with how many artists you add, so the field stays a
   * sensible size: 48 / artistCount, clamped between MIN and MAX. With the
   * default 6 artists that is 8 songs each (48 total). */
  SONGS_TARGET_TOTAL: 48,
  SONGS_MIN_PER_ARTIST: 2,
  SONGS_MAX_PER_ARTIST: 10,

  /* Page size for the search-based "top songs" fallback. */
  SEARCH_LIMIT: 10,
  /* Depth of the search paging. Results are fuzzy and a chunk of any page is
   * features or same-named artists, so we need several pages to reliably surface
   * 10 real songs. This is a ceiling, not a target — paging stops as soon as
   * enough songs are collected. */
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
    SONGS_PER_ARTIST: 8, // fixed for group + knockout: each song plays many matches
    QUALIFY_PER_GROUP: 4, // capped so the knockout stays a power of two
  },

  /* Listening length.
   *   "preview" = stop and rewind after PLAY_SECONDS, so every song gets the
   *               same short listen.
   *   "full"    = play the whole preview.
   *
   * Apple supplies one ~30-second preview per track, so "full" means the entire
   * preview rather than the entire song. */
  PLAY_LENGTH: "preview",

  /* Seconds a "preview" plays for, when that mode is selected. */
  PLAY_SECONDS: 30,
  /* How hard to work while sampling "random songs". */
  RANDOM: {
    /* Albums are fetched a page at a time. */
    ALBUM_PAGE_SIZE: 25,
    MAX_ALBUM_PAGES: 3, // pages of albums to scan per artist
    MAX_ALBUM_FETCHES: 6, // album track lookups per artist
    /* Singles are skipped when scanning an artist's discography. A single
     * carries one or two tracks, so a track lookup spent on it returns a
     * fraction of what a full album yields — dropping them makes each of the
     * MAX_ALBUM_FETCHES requests count for far more. Artists with no albums
     * fall back to a scan that includes singles, so nothing is lost. The album
     * picker still lists singles so they can be chosen explicitly. */
    INCLUDE_SINGLES: false,
  },

  /* Album picker: how many pages of albums to list per artist when the user
   * browses their discography. */
  ALBUM_LIST_MAX_PAGES: 8,
};

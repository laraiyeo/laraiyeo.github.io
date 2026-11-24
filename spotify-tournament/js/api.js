/* ─── Spotify Web API wrapper ───────────────────────────────────────────────
 * Everything funnels through one queue so we never fire hundreds of parallel
 * requests at Spotify (which would earn a 429). Concurrency is capped and 429s
 * are retried using the Retry-After header.
 *
 *   STSpotify.searchArtists(q, limit)
 *   STSpotify.searchTracks(q, limit, offset)
 *   STSpotify.getMe()
 *   STSpotify.getArtistAlbums(artistId, includeGroups, offset, limit)
 *   STSpotify.getAlbumTracks(albumId)
 * ────────────────────────────────────────────────────────────────────────── */
(function (global) {
  "use strict";

  var BASE = "https://api.spotify.com/v1";
  var MAX_CONCURRENCY = 4;
  var MAX_RETRIES = 4;

  var queue = [];
  var active = 0;

  /* When a proxy base is configured, every catalog request goes there instead of
   * to Spotify directly. The proxy holds a client secret and uses an app-only
   * token, so visitors need no Spotify login at all. This is the normal mode.
   *
   * With no proxy configured the page falls back to talking to Spotify directly
   * with the visitor's own PKCE token — the original behaviour, still fully
   * supported for local development without a deployed backend. */
  function proxyBase() {
    var cfg = global.STConfig || {};
    var v = cfg.API_BASE;
    return typeof v === "string" && v.trim() ? v.trim().replace(/\/+$/, "") : "";
  }

  function isPublic() {
    return !!proxyBase();
  }

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function pump() {
    while (active < MAX_CONCURRENCY && queue.length) {
      run(queue.shift());
    }
  }

  function run(job) {
    active++;
    attempt(job)
      .then(job.resolve, job.reject)
      .then(function () {
        active--;
        pump();
      });
  }

  /* Turn a non-OK response into an Error with a helpful message. `viaProxy`
   * changes the 401/403 advice, because the causes differ completely between
   * the two modes. */
  function httpError(res, body, viaProxy) {
    var detail =
      body && body.error && body.error.message ? body.error.message : null;
    var reason = errorReason(body);
    var msg;

    if (res.status === 403) {
      /* Direct mode: almost always the development-mode allowlist, which
       * refuses every call from an account that isn't listed. Proxy mode
       * shouldn't be able to produce this — there is no user token — so treat
       * it as a server-side problem. */
      msg = viaProxy
        ? "The song service was refused by Spotify (403). " +
          (detail || "Check the proxy service's credentials and logs.")
        : "Spotify refused this request (403). This app is in development " +
          "mode, so the Spotify account you are signed in as must be on its " +
          "allowlist.";
    } else if (res.status === 401) {
      msg = viaProxy
        ? "The song service is not authorised (401). " +
          (detail || "Its Spotify credentials are probably missing or wrong.")
        : "Your Spotify session expired — please log in again.";
    } else if (reason === "QUOTA_EXCEEDED") {
      /* Distinct from a rate limit: this does not clear in a few seconds. */
      msg =
        "Spotify's quota for this app is used up — this is a daily limit, not " +
        "a brief rate limit, so waiting a few seconds won't help. Try again " +
        "after Spotify's reset, use fewer artists, or request extended quota " +
        "mode for the app.";
    } else if (res.status === 429) {
      var secs = retryAfterMs(res, body) / 1000;
      msg =
        "Spotify is rate limiting the app (429)." +
        (secs > 0
          ? " It asked for a " + Math.ceil(secs) + "s wait — retrying now."
          : " Please wait a moment and try again.");
    } else {
      msg = detail || "Spotify API error " + res.status;
    }

    var err = new Error(msg);
    err.status = res.status;
    if (detail) err.detail = detail;
    err.retryAfterMs = retryAfterMs(res, body);
    err.quotaExceeded = reason === "QUOTA_EXCEEDED";
    return err;
  }

  /* Read the machine-readable parts of an error envelope. The proxy mirrors
   * Spotify's own `reason`: "QUOTA_EXCEEDED" means the daily development-mode
   * allowance is gone, which is a wall rather than a pause. */
  function errorReason(body) {
    return body && body.error && body.error.reason
      ? String(body.error.reason)
      : body && body.reason
        ? String(body.reason)
        : null;
  }

  function retryAfterMs(res, body) {
    var fromBody =
      body && body.error && body.error.retryAfter
        ? Number(body.error.retryAfter)
        : 0;
    var fromHeader = res ? Number(res.headers.get("Retry-After")) : 0;
    var secs = fromBody || fromHeader || 0;
    return secs > 0 ? secs * 1000 : 0;
  }

  /* One request, in whichever mode is configured. Proxy requests carry no
   * credentials at all — that is the whole point of the proxy. */
  function send(path) {
    var proxy = proxyBase();
    if (proxy) {
      return fetch(proxy + path).then(function (res) {
        return res
          .json()
          .catch(function () {
            return null;
          })
          .then(function (body) {
            if (body && (res.ok || ((body.artists || body.tracks) && body.error === undefined))) {
              return body;
            }
            /* A proxy that returns JSON but a non-OK status (or an error
             * envelope with a 200) is still a failure. */
            if (!res.ok) throw httpError(res, body, true);
            return body;
          });
      });
    }
    return global.STAuth.getAccessToken().then(function (token) {
      if (!token) throw new Error("Not connected to Spotify.");
      return fetch(BASE + path, {
        headers: { Authorization: "Bearer " + token },
      }).then(function (res) {
        return res
          .json()
          .catch(function () {
            return null;
          })
          .then(function (body) {
            if (!res.ok) throw httpError(res, body, false);
            return body;
          });
      });
    });
  }

  function attempt(job) {
    var tries = 0;

    function once() {
      return send(job.path).catch(function (err) {
        /* A quota wall is not a rate limit. Retrying burns time and can never
         * succeed, so fail immediately and let the UI explain it. Without this
         * an exhausted daily quota produced four escalating retries per request
         * (across every artist in the build) before surfacing anything. */
        if (err.quotaExceeded) throw err;
        /* Otherwise honour Spotify's own Retry-After when it gives one — it
         * knows the window length; our backoff was only guessing. Falls back to
         * exponential backoff when the header is missing. */
        if (err.status === 429 && tries < MAX_RETRIES) {
          tries++;
          var wait = err.retryAfterMs || Math.pow(2, tries) * 1000;
          return sleep(wait).then(once);
        }
        /* A dead user session should be cleared so the UI can prompt again. */
        if (err.status === 401 && !proxyBase()) global.STAuth.clearTokens();
        throw err;
      });
    }

    return once();
  }

  function get(path) {
    return new Promise(function (resolve, reject) {
      queue.push({ path: path, resolve: resolve, reject: reject });
      pump();
    });
  }

  function q(params) {
    var parts = [];
    Object.keys(params).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === "") return;
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
    });
    return parts.length ? "?" + parts.join("&") : "";
  }

  function searchArtists(query, limit) {
    return get("/search" + q({ q: query, type: "artist", limit: limit || 10 }));
  }

  /* Artists matching one or more genres, via the `genre:` search filter. This
   * is the supported route to "similar artists": GET /artists/{id}/related-artists
   * and GET /recommendations are both marked deprecated, and the `genre` filter
   * is explicitly still listed among the available search filters. */
  function searchArtistsByGenre(genres, limit) {
    var list = [].concat(genres || []).filter(Boolean).slice(0, 2);
    if (!list.length) return Promise.resolve({ artists: { items: [] } });
    var query = list
      .map(function (g) {
        /* Spotify's genre values contain spaces; quote them so multi-word genres
         * like "prog rock" still match. */
        return 'genre:"' + String(g).replace(/"/g, "") + '"';
      })
      .join(" ");
    return get("/search" + q({ q: query, type: "artist", limit: limit || 10 }));
  }

  /* A single artist's full record (followers, genres, image). */
  function getArtist(artistId) {
    return get("/artists/" + artistId);
  }

  /* Track search. `q` may be a bare name or a field filter such as
   * artist:"Radiohead".
   * NOTE: Spotify lowered the /search limit cap to 10 — asking for 50 returns
   * 400 "Invalid limit". Callers page through results with `offset` instead.
   * This replaces the deprecated /artists/{id}/top-tracks endpoint, which now
   * 403s for new apps. */
  function searchTracks(query, limit, offset) {
    return get(
      "/search" +
        q({ q: query, type: "track", limit: limit || 10, offset: offset || 0 }),
    );
  }

  function getMe() {
    /* Client Credentials has no user, so /me is meaningless in public mode and
     * Spotify would reject it. Callers must not treat its absence as an error. */
    if (isPublic()) return Promise.resolve(null);
    return get("/me");
  }

  /* Spotify caps this endpoint at 10 items per request; anything higher is a
   * 400 "Invalid limit". Market is omitted deliberately — the access token
   * already carries the user's market. */
  function getArtistAlbums(artistId, includeGroups, offset, limit) {
    return get(
      "/artists/" +
        artistId +
        "/albums" +
        q({
          include_groups: includeGroups,
          limit: limit || 10,
          offset: offset || 0,
        }),
    );
  }

  function getAlbumTracks(albumId) {
    return get("/albums/" + albumId + "/tracks" + q({ limit: 50 }));
  }

  /* Single album (metadata only — used for the release year, so the album picker
   * can show something more useful than a bare name). */
  function getAlbum(albumId) {
    return get("/albums/" + albumId);
  }

  /* Every album for an artist, paged. Spotify caps this endpoint at 10 items
   * per request, so a prolific artist needs several calls; they are serialised
   * through the same queue as everything else, which keeps us inside the rate
   * limit. Stops early once a page comes back short. */
  function getAllArtistAlbums(artistId, includeGroups, maxPages) {
    var pageSize = 10;
    var cap = maxPages || 8;
    var all = [];

    function page(i) {
      if (i >= cap) return Promise.resolve(all);
      return getArtistAlbums(artistId, includeGroups, i * pageSize, pageSize)
        .then(function (res) {
          var items = (res && res.items) || [];
          all = all.concat(items);
          if (items.length < pageSize) return all;
          return page(i + 1);
        })
        .catch(function () {
          /* A failed later page shouldn't lose what we already have. */
          return all;
        });
    }

    return page(0);
  }

  global.STSpotify = {
    searchArtists: searchArtists,
    searchArtistsByGenre: searchArtistsByGenre,
    searchTracks: searchTracks,
    getMe: getMe,
    getArtist: getArtist,
    getArtistAlbums: getArtistAlbums,
    getAllArtistAlbums: getAllArtistAlbums,
    getAlbum: getAlbum,
    getAlbumTracks: getAlbumTracks,
    get: get,
    /* True when a proxy is configured, i.e. no visitor login is needed. */
    isPublic: isPublic,
    /* The configured proxy base, or "" in direct mode. Handy for diagnostics. */
    proxyBase: proxyBase,
  };
})(window);

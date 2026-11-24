/* ─── Spotify catalogue proxy ───────────────────────────────────────────────
 * Lets the Song Tournament page read Spotify's public catalogue WITHOUT every
 * visitor signing in.
 *
 * Why this exists
 * ---------------
 * Spotify's Client Credentials flow authenticates the *app* rather than a user,
 * so it needs a client secret — and a secret can never be shipped to a browser.
 * A user login (PKCE) was therefore the only way the page could get a token.
 * This server holds the secret, fetches an app-only token, and exposes three
 * plain GET endpoints the page can call with no credentials at all.
 *
 * Endpoints (all read-only, all public catalogue data):
 *   GET /health
 *   GET /search?q=&type=artist|track&limit=&offset=&market=
 *   GET /artists/:id?market=
 *   GET /artists/:id/albums?include_groups=&limit=&offset=&market=
 *   GET /albums/:id/tracks?limit=&offset=&market=
 *
 * Design notes
 * ------------
 * - The access token is cached in memory and refreshed just before it expires.
 * - Responses are cached briefly: a tournament build fires a burst of identical
 *   requests as users re-run brackets, and each one would otherwise cost quota.
 * - Limit caps are clamped server-side. Spotify silently lowered /search's cap to
 *   10 and returns 400 "Invalid limit" above it, so the client must not be able
 *   to ask for more even by accident or by tampering.
 * - Playback is NOT handled here. The embed player is a separate iframe that uses
 *   the *viewer's* Spotify cookies, so this proxy never sees or touches it.
 * ────────────────────────────────────────────────────────────────────────── */
"use strict";

var express = require("express");
var cors = require("cors");
var rateLimit = require("express-rate-limit");

var PORT = process.env.PORT || 3000;
var CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "6900da01aa7a4e48b5666961473bcefc";
var CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "18f4b814e7934b28be2898478039dbc5";

/* Optional shared secret. If set, callers must send x-proxy-token. This is NOT
 * security — the value is visible in the page source. It only discourages
 * casual scraping of the endpoint. Leave unset for a fully public API. */
var PROXY_TOKEN = process.env.PROXY_TOKEN || "";

/* Client Credentials has no user, so there is no market on the token. Spotify
 * then needs to be told which market to resolve availability against. */
var DEFAULT_MARKET = process.env.DEFAULT_MARKET || "US";

var CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 10 * 60 * 1000);
var CACHE_MAX_ENTRIES = Number(process.env.CACHE_MAX_ENTRIES || 500);

var ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map(function (s) {
    return s.trim();
  })
  .filter(Boolean);

/* Spotify's own caps. Exceeding them is a 400, so clamp rather than trust. */
var MAX_LIMIT = { search: 10, albums: 10, tracks: 50 };

var SPOTIFY_API = process.env.SPOTIFY_API_BASE || "https://api.spotify.com/v1";
var TOKEN_URL =
  process.env.SPOTIFY_TOKEN_URL || "https://accounts.spotify.com/api/token";

/* ── App-only token, cached ─────────────────────────────────────────────── */
var tokenCache = { value: null, expiresAt: 0 };
var inflightToken = null;

function fetchToken() {
  var basic = Buffer.from(CLIENT_ID + ":" + CLIENT_SECRET).toString("base64");
  return fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: "Basic " + basic,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  }).then(function (res) {
    return res
      .json()
      .catch(function () {
        return null;
      })
      .then(function (body) {
        if (!res.ok || !body || !body.access_token) {
          var err = new Error(
            (body && (body.error_description || body.error)) ||
              "Spotify rejected the token request (HTTP " + res.status + ")",
          );
          err.status = res.status;
          throw err;
        }
        tokenCache = {
          value: body.access_token,
          /* Treat the token as dead 30s early so a request never races expiry. */
          expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000 - 30000,
        };
        return tokenCache.value;
      });
  });
}

function getToken() {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) {
    return Promise.resolve(tokenCache.value);
  }
  /* Collapse a burst of cold-start requests into one token fetch. */
  if (inflightToken) return inflightToken;
  inflightToken = fetchToken();
  return inflightToken.then(
    function (t) {
      inflightToken = null;
      return t;
    },
    function (e) {
      inflightToken = null;
      throw e;
    },
  );
}

/* ── Response cache ────────────────────────────────────────────────────── */
var cache = new Map();

function cacheGet(key) {
  var hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  hit.at = Date.now(); // refresh recency for eviction
  return hit.value;
}

function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    var oldestKey = null;
    var oldestAt = Infinity;
    cache.forEach(function (v, k) {
      if (v.at < oldestAt) {
        oldestAt = v.at;
        oldestKey = k;
      }
    });
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { value: value, expiresAt: Date.now() + CACHE_TTL_MS, at: Date.now() });
}

/* ── Upstream call ─────────────────────────────────────────────────────── */
function callSpotify(url) {
  return getToken().then(function (token) {
    return fetch(url, { headers: { Authorization: "Bearer " + token } });
  });
}

function fetchUpstream(path, params) {
  var url = new URL(SPOTIFY_API + path);
  Object.keys(params).forEach(function (k) {
    var v = params[k];
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  var key = url.toString();

  var cached = cacheGet(key);
  if (cached) return Promise.resolve(cached);

  return callSpotify(url)
    .then(function (res) {
      /* A 401 almost always means the cached token went stale early — drop it
       * and try exactly once more. */
      if (res.status !== 401) return res;
      tokenCache = { value: null, expiresAt: 0 };
      return callSpotify(url);
    })
    .then(function (res) {
      return res
        .json()
        .catch(function () {
          return null;
        })
        .then(function (body) {
          if (res.ok) {
            cacheSet(key, body);
            return body;
          }
          /* Spotify distinguishes two very different 429s, and they need
           * opposite advice:
           *   reason "QUOTA_EXCEEDED" -> the daily development-mode allowance is
           *     gone. It will NOT clear in a few seconds, so telling the caller
           *     to "try again shortly" sends them into a retry loop against a
           *     wall. Only a new quota day (or a different client id) fixes it.
           *   anything else -> an ordinary rate limit that clears on its own.
           * Carry the reason through so the client can say which one it is. */
          var reason =
            body && body.error && body.error.reason
              ? String(body.error.reason)
              : null;
          var detail =
            body && body.error && body.error.message
              ? body.error.message
              : null;
          var err = new Error(detail || "Spotify error " + res.status);
          err.status = res.status;
          err.reason = reason;
          /* Spotify tells us how long to wait. Dropping it forced the client to
           * guess with exponential backoff, which for a long window means
           * retrying for far longer than necessary. */
          var retryAfter = res.headers.get("retry-after");
          if (retryAfter) err.retryAfter = Number(retryAfter) || null;
          throw err;
        });
    });
}

/* ── Validation helpers ────────────────────────────────────────────────── */
/* Spotify IDs are base62 and fixed-length. Rejecting anything else stops a
 * crafted id from walking out of the intended path. */
function validId(id) {
  return typeof id === "string" && /^[A-Za-z0-9]{1,64}$/.test(id);
}

function clampInt(value, fallback, min, max) {
  var n = parseInt(value, 10);
  if (isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

var ALLOWED_GROUPS = {
  album: true,
  single: true,
  compilation: true,
  appears_on: true,
};

/* ── App ───────────────────────────────────────────────────────────────── */
var app = express();
app.set("trust proxy", 1);

app.use(
  cors({
    origin: ALLOWED_ORIGINS.indexOf("*") !== -1 ? true : ALLOWED_ORIGINS,
  }),
);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_LIMIT_PER_MIN || 240),
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

/* Tiny in-process response cache means most repeat calls never leave the box,
 * so a generous per-minute allowance is plenty for real use. */
app.disable("x-powered-by");

function requireToken(req, res, next) {
  if (!PROXY_TOKEN) return next();
  if (req.get("x-proxy-token") === PROXY_TOKEN) return next();
  res.status(401).json({ error: { status: 401, message: "Bad or missing proxy token." } });
}

function fail(res, err) {
  var status = err && err.status ? err.status : 502;
  /* Pass Spotify's own 4xx through so the page can explain it, but never leak a
   * 5xx body we didn't write ourselves. */
  var message;
  if (status === 429 && err && err.reason === "QUOTA_EXCEEDED") {
    message =
      "Spotify's daily development-mode quota is used up. It resets on " +
      "Spotify's own schedule — waiting a few seconds will not help. Use " +
      "fewer artists, or move the app to extended quota mode.";
  } else if (status === 429) {
    message = "Spotify is rate limiting this service. Try again shortly.";
  } else {
    message = (err && err.message) || "Upstream request failed.";
  }
  var body = { error: { status: status, message: message } };
  /* Surface the machine-readable bits the client needs to react correctly. */
  if (err && err.reason) {
    body.error.reason = err.reason;
    /* Top-level too, so it is findable without knowing the error envelope. */
    body.reason = err.reason;
  }
  if (err && err.retryAfter) {
    body.error.retryAfter = err.retryAfter;
    res.set("Retry-After", String(err.retryAfter));
  }
  res.status(status).json(body);
}

app.get("/health", function (req, res) {
  res.json({
    ok: !!CLIENT_ID && !!CLIENT_SECRET,
    service: "spotify-proxy",
    configured: !!CLIENT_ID && !!CLIENT_SECRET,
    tokenHeld: !!tokenCache.value && Date.now() < tokenCache.expiresAt,
    cacheEntries: cache.size,
    defaultMarket: DEFAULT_MARKET,
    gated: !!PROXY_TOKEN,
  });
});

app.get("/search", requireToken, function (req, res) {
  var type = req.query.type === "artist" ? "artist" : "track";
  var q = String(req.query.q || "").trim();
  if (!q) {
    return res
      .status(400)
      .json({ error: { status: 400, message: "Missing q parameter." } });
  }
  fetchUpstream("/search", {
    q: q,
    type: type,
    limit: clampInt(req.query.limit, 10, 1, MAX_LIMIT.search),
    offset: clampInt(req.query.offset, 0, 0, 1000),
    market: req.query.market || DEFAULT_MARKET,
  }).then(
    function (body) {
      res.json(body);
    },
    function (err) {
      fail(res, err);
    },
  );
});

app.get("/artists/:id", requireToken, function (req, res) {
  if (!validId(req.params.id)) {
    return res
      .status(400)
      .json({ error: { status: 400, message: "Invalid artist id." } });
  }
  fetchUpstream("/artists/" + req.params.id, {
    market: req.query.market || DEFAULT_MARKET,
  }).then(
    function (body) {
      res.json(body);
    },
    function (err) {
      fail(res, err);
    },
  );
});

app.get("/artists/:id/albums", requireToken, function (req, res) {
  if (!validId(req.params.id)) {
    return res
      .status(400)
      .json({ error: { status: 400, message: "Invalid artist id." } });
  }
  var groups = String(req.query.include_groups || "album,single,compilation")
    .split(",")
    .map(function (g) {
      return g.trim();
    })
    .filter(function (g) {
      return ALLOWED_GROUPS[g];
    });
  if (!groups.length) groups = ["album"];

  fetchUpstream("/artists/" + req.params.id + "/albums", {
    include_groups: groups.join(","),
    limit: clampInt(req.query.limit, 10, 1, MAX_LIMIT.albums),
    offset: clampInt(req.query.offset, 0, 0, 1000),
    market: req.query.market || DEFAULT_MARKET,
  }).then(
    function (body) {
      res.json(body);
    },
    function (err) {
      fail(res, err);
    },
  );
});

app.get("/albums/:id/tracks", requireToken, function (req, res) {
  if (!validId(req.params.id)) {
    return res
      .status(400)
      .json({ error: { status: 400, message: "Invalid album id." } });
  }
  fetchUpstream("/albums/" + req.params.id + "/tracks", {
    limit: clampInt(req.query.limit, 50, 1, MAX_LIMIT.tracks),
    offset: clampInt(req.query.offset, 0, 0, 1000),
    market: req.query.market || DEFAULT_MARKET,
  }).then(
    function (body) {
      res.json(body);
    },
    function (err) {
      fail(res, err);
    },
  );
});

/* Anything else is a genuine 404, not a proxy pass-through. */
app.use(function (req, res) {
  res.status(404).json({ error: { status: 404, message: "Unknown endpoint." } });
});

app.listen(PORT, function () {
  console.log("spotify-proxy listening on port " + PORT);
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.warn(
      "WARNING: SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are not set — " +
        "every request will fail. Set them in the Railway service variables.",
    );
  } else {
    console.log("Credentials present. Default market: " + DEFAULT_MARKET);
  }
});

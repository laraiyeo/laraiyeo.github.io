/* ─── StreamFree shared streaming service ────────────────────────────────────
 * Replaces the retired streamed.pk API with strmfree / streamfree.top.
 *
 *   GET /api/v1/streams?category=<cat>   → { count, streams: [...] }
 *   GET /api/v1/sources/<stream_key>     → { stream_key, sources: [...] }
 *   GET /api/v1/categories               → { categories: [...] }
 *
 * Every stream carries a ready-to-embed `iframe` plus `additional_sources`
 * ({ quality, url, live }). Responses are cached per category so we don't
 * hammer their server on every page load (their docs ask for this).
 *
 * Usage:
 *   const { sources, match } = await StreamService.findMatchStreams({
 *     homeTeamName: "Boston Bruins",
 *     awayTeamName: "Detroit Red Wings",
 *     category: "hockey",           // or sport: "nhl"
 *   });
 *   // sources → { "Main": { url, label, quality, live }, "FHD": {...} }
 * ────────────────────────────────────────────────────────────────────────── */
(function (global) {
  "use strict";

  var API_BASE = "https://streamfree.top/api/v1";
  var CACHE_TTL_MS = 90 * 1000;
  var MATCH_THRESHOLD = 0.6;

  // streamed.pk used "football" for soccer; StreamFree uses "soccer" for
  // soccer and "football" for NFL/NCAAF. Keep the mapping explicit.
  var CATEGORY_BY_SPORT = {
    mlb: "baseball",
    wbc: "baseball",
    nfl: "football",
    ncaaf: "football",
    nhl: "hockey",
    nba: "basketball",
    wnba: "basketball",
    soccer: "soccer",
    f1: "racing",
  };

  var cache = Object.create(null); // category -> { ts, streams }
  var inflight = Object.create(null); // category -> Promise

  function normalizeTeamName(teamName) {
    return String(teamName || "")
      .toLowerCase()
      .replace(/[áéíóúüñçßëïöäåø]/g, function (c) {
        return (
          {
            á: "a",
            é: "e",
            í: "i",
            ó: "o",
            ú: "u",
            ü: "u",
            ñ: "n",
            ç: "c",
            ß: "ss",
            ë: "e",
            ï: "i",
            ö: "o",
            ä: "a",
            å: "a",
            ø: "o",
          }[c] || c
        );
      })
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function getCategoryForSport(sport) {
    return CATEGORY_BY_SPORT[String(sport || "").toLowerCase()] || "";
  }

  // ─── Fetch (cached + de-duplicated) ───────────────────────────────────────
  function getStreamsForCategory(category) {
    var cat = String(category || "").toLowerCase();
    if (!cat) return Promise.resolve([]);

    var hit = cache[cat];
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      return Promise.resolve(hit.streams);
    }
    if (inflight[cat]) return inflight[cat];

    var p = fetch(API_BASE + "/streams?category=" + encodeURIComponent(cat))
      .then(function (res) {
        if (!res.ok) throw new Error("StreamFree API status " + res.status);
        return res.json();
      })
      .then(function (data) {
        var streams = Array.isArray(data && data.streams) ? data.streams : [];
        cache[cat] = { ts: Date.now(), streams: streams };
        return streams;
      })
      .catch(function (err) {
        console.error("[StreamService] fetch failed for " + cat + ":", err);
        return [];
      })
      .then(function (streams) {
        delete inflight[cat];
        return streams;
      });

    inflight[cat] = p;
    return p;
  }

  // ─── Matching ─────────────────────────────────────────────────────────────
  // Scores how well `targetNorm` (the name we're looking for) is represented in
  // `teamNorm` (the name the API gave us). Checked in both directions so short
  // names like NHL's "Bruins" still match "boston-bruins".
  function teamMatchScore(teamNorm, targetNorm) {
    if (!teamNorm || !targetNorm) return 0;
    if (teamNorm === targetNorm) return 1;

    var forward = (function () {
      var parts = targetNorm.split("-").filter(function (w) {
        return w.length > 2;
      });
      if (!parts.length) return 0;
      var hits = 0;
      parts.forEach(function (p) {
        if (teamNorm.indexOf(p) !== -1) hits += 1;
      });
      return hits / parts.length;
    })();

    var reverse = (function () {
      var parts = teamNorm.split("-").filter(function (w) {
        return w.length > 2;
      });
      if (!parts.length) return 0;
      var hits = 0;
      parts.forEach(function (p) {
        if (targetNorm.indexOf(p) !== -1) hits += 1;
      });
      return hits / parts.length;
    })();

    return Math.max(forward, reverse);
  }

  // Both sides must match reasonably well — prevents "New York Mets" matching
  // a "New York Yankees" stream just because the city lines up.
  function pairScore(a, b, homeNorm, awayNorm) {
    var s1 = teamMatchScore(a, homeNorm);
    var s2 = teamMatchScore(b, awayNorm);
    if (s1 < 0.5 || s2 < 0.5) return 0;
    return (s1 + s2) / 2;
  }

  function scoreStream(stream, homeNorm, awayNorm) {
    var t1 = normalizeTeamName(stream && stream.team1 && stream.team1.name);
    var t2 = normalizeTeamName(stream && stream.team2 && stream.team2.name);
    var nameNorm = normalizeTeamName(stream && stream.name);

    var best = 0;
    if (t1 && t2) {
      best = Math.max(
        pairScore(t1, t2, homeNorm, awayNorm),
        pairScore(t2, t1, homeNorm, awayNorm),
      );
    }
    if (best < MATCH_THRESHOLD && nameNorm) {
      var sh = teamMatchScore(nameNorm, homeNorm);
      var sa = teamMatchScore(nameNorm, awayNorm);
      if (sh >= 0.5 && sa >= 0.5) best = Math.max(best, (sh + sa) / 2);
    }
    return best;
  }

  // ─── Source list ──────────────────────────────────────────────────────────
  // Returns an object map so existing `Object.keys(availableStreams)` UIs keep
  // working. Keys are human labels ("Main", "FHD", "FHD 2", …).
  function buildSources(stream) {
    var out = {};
    if (!stream) return out;

    function add(url, label, quality, live) {
      if (!url) return;
      var base = String(label || "Stream");
      var key = base;
      var n = 2;
      while (out[key]) {
        key = base + " " + n;
        n += 1;
      }
      out[key] = {
        url: url,
        embedUrl: url,
        label: key,
        quality: quality || "",
        live: live !== false,
        source: "streamfree",
      };
    }

    // The main iframe is always playable — it starts on its own once live.
    add(stream.iframe, "Main", "", true);

    (stream.additional_sources || []).forEach(function (s) {
      if (s && s.live !== false) add(s.url, s.quality, s.quality, true);
    });

    return out;
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  function findMatchStreams(options) {
    var opts = options || {};
    var category = opts.category || getCategoryForSport(opts.sport);
    if (!category) return Promise.resolve({ sources: {}, match: null });

    return getStreamsForCategory(category).then(function (streams) {
      if (!streams.length) return { sources: {}, match: null };

      var homeNorm = normalizeTeamName(opts.homeTeamName);
      var awayNorm = normalizeTeamName(opts.awayTeamName);
      if (!homeNorm || !awayNorm) return { sources: {}, match: null };

      var best = null;
      var bestScore = 0;
      for (var i = 0; i < streams.length; i += 1) {
        var sc = scoreStream(streams[i], homeNorm, awayNorm);
        if (sc > bestScore) {
          bestScore = sc;
          best = streams[i];
          if (sc >= 1) break;
        }
      }

      if (!best || bestScore < MATCH_THRESHOLD) {
        return { sources: {}, match: null };
      }
      return { sources: buildSources(best), match: best };
    });
  }

  // For 24/7 channels (e.g. F1) where there are no team names to match on.
  function findStreamByName(options) {
    var opts = options || {};
    var category = opts.category || getCategoryForSport(opts.sport);
    var needle = String(opts.nameIncludes || "").toLowerCase();
    if (!category) return Promise.resolve({ sources: {}, match: null });

    return getStreamsForCategory(category).then(function (streams) {
      var found = null;
      for (var i = 0; i < streams.length; i += 1) {
        var nm = String((streams[i] && streams[i].name) || "").toLowerCase();
        if (nm.indexOf(needle) !== -1) {
          found = streams[i];
          break;
        }
      }
      if (!found) return { sources: {}, match: null };
      return { sources: buildSources(found), match: found };
    });
  }

  function clearCache() {
    cache = Object.create(null);
    inflight = Object.create(null);
  }

  global.StreamService = {
    API_BASE: API_BASE,
    CATEGORY_BY_SPORT: CATEGORY_BY_SPORT,
    normalizeTeamName: normalizeTeamName,
    getCategoryForSport: getCategoryForSport,
    getStreamsForCategory: getStreamsForCategory,
    findMatchStreams: findMatchStreams,
    findStreamByName: findStreamByName,
    buildSources: buildSources,
    clearCache: clearCache,
  };
})(typeof window !== "undefined" ? window : globalThis);

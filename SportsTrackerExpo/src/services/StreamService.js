/* ─── StreamFree shared streaming service (Expo / React Native) ──────────────
 * Replaces the retired streamed.pk API with strmfree / streamfree.top.
 *
 *   GET /api/v1/streams?category=<cat>   → { count, streams: [...] }
 *   GET /api/v1/sources/<stream_key>     → { stream_key, sources: [...] }
 *   GET /api/v1/categories               → { categories: [...] }
 *
 * Every stream carries a ready-to-embed `iframe` plus `additional_sources`
 * ({ quality, url, live }). Responses are cached per category so we don't
 * hammer their server on every screen mount (their docs ask for this).
 *
 * Usage:
 *   const { sources, match } = await StreamService.findMatchStreams({
 *     homeTeamName: "Boston Bruins",
 *     awayTeamName: "Detroit Red Wings",
 *     category: "hockey",           // or sport: "nhl"
 *   });
 *   // sources → { "Main": { url, label, quality, live }, "FHD": {...} }
 * ────────────────────────────────────────────────────────────────────────── */

const API_BASE = "https://streamfree.top/api/v1";
const CACHE_TTL_MS = 90 * 1000;
const MATCH_THRESHOLD = 0.6;

// streamed.pk used "football" for soccer; StreamFree uses "soccer" for soccer
// and "football" for NFL/NCAAF. Keep the mapping explicit.
export const CATEGORY_BY_SPORT = {
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

const cache = new Map(); // category -> { ts, streams }
const inflight = new Map(); // category -> Promise

export function normalizeTeamName(teamName) {
  return String(teamName || "")
    .toLowerCase()
    .replace(/[áéíóúüñçßëïöäåø]/g, (c) => {
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

export function getCategoryForSport(sport) {
  return CATEGORY_BY_SPORT[String(sport || "").toLowerCase()] || "";
}

// ─── Fetch (cached + de-duplicated) ─────────────────────────────────────────
export async function getStreamsForCategory(category) {
  const cat = String(category || "").toLowerCase();
  if (!cat) return [];

  const hit = cache.get(cat);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.streams;
  if (inflight.has(cat)) return inflight.get(cat);

  const promise = (async () => {
    try {
      const res = await fetch(
        `${API_BASE}/streams?category=${encodeURIComponent(cat)}`,
      );
      if (!res.ok) throw new Error(`StreamFree API status ${res.status}`);
      const data = await res.json();
      const streams = Array.isArray(data?.streams) ? data.streams : [];
      cache.set(cat, { ts: Date.now(), streams });
      return streams;
    } catch (err) {
      console.warn(`[StreamService] fetch failed for ${cat}:`, err);
      return [];
    } finally {
      inflight.delete(cat);
    }
  })();

  inflight.set(cat, promise);
  return promise;
}

// ─── Matching ───────────────────────────────────────────────────────────────
// Scores how well `targetNorm` (the name we're looking for) is represented in
// `teamNorm` (the name the API gave us). Checked in both directions so short
// names like NHL's "Bruins" still match "boston-bruins".
function teamMatchScore(teamNorm, targetNorm) {
  if (!teamNorm || !targetNorm) return 0;
  if (teamNorm === targetNorm) return 1;

  const forward = (() => {
    const parts = targetNorm.split("-").filter((w) => w.length > 2);
    if (!parts.length) return 0;
    let hits = 0;
    parts.forEach((p) => {
      if (teamNorm.includes(p)) hits += 1;
    });
    return hits / parts.length;
  })();

  const reverse = (() => {
    const parts = teamNorm.split("-").filter((w) => w.length > 2);
    if (!parts.length) return 0;
    let hits = 0;
    parts.forEach((p) => {
      if (targetNorm.includes(p)) hits += 1;
    });
    return hits / parts.length;
  })();

  return Math.max(forward, reverse);
}

// Both sides must match reasonably well — prevents "New York Mets" matching a
// "New York Yankees" stream just because the city lines up.
function pairScore(a, b, homeNorm, awayNorm) {
  const s1 = teamMatchScore(a, homeNorm);
  const s2 = teamMatchScore(b, awayNorm);
  if (s1 < 0.5 || s2 < 0.5) return 0;
  return (s1 + s2) / 2;
}

function scoreStream(stream, homeNorm, awayNorm) {
  const t1 = normalizeTeamName(stream?.team1?.name);
  const t2 = normalizeTeamName(stream?.team2?.name);
  const nameNorm = normalizeTeamName(stream?.name);

  let best = 0;
  if (t1 && t2) {
    best = Math.max(
      pairScore(t1, t2, homeNorm, awayNorm),
      pairScore(t2, t1, homeNorm, awayNorm),
    );
  }
  if (best < MATCH_THRESHOLD && nameNorm) {
    const sh = teamMatchScore(nameNorm, homeNorm);
    const sa = teamMatchScore(nameNorm, awayNorm);
    if (sh >= 0.5 && sa >= 0.5) best = Math.max(best, (sh + sa) / 2);
  }
  return best;
}

// ─── Source list ────────────────────────────────────────────────────────────
// Returns an object map so existing `Object.keys(availableStreams)` UIs keep
// working. Keys are human labels ("Main", "FHD", "FHD 2", …).
export function buildSources(stream) {
  const out = {};
  if (!stream) return out;

  const add = (url, label, quality, live) => {
    if (!url) return;
    const base = String(label || "Stream");
    let key = base;
    let n = 2;
    while (out[key]) {
      key = `${base} ${n}`;
      n += 1;
    }
    out[key] = {
      url,
      embedUrl: url,
      label: key,
      quality: quality || "",
      live: live !== false,
      source: "streamfree",
    };
  };

  // The main iframe is always playable — it starts on its own once live.
  add(stream.iframe, "Main", "", true);

  (stream.additional_sources || []).forEach((s) => {
    if (s && s.live !== false) add(s.url, s.quality, s.quality, true);
  });

  return out;
}

// ─── Public API ─────────────────────────────────────────────────────────────
export async function findMatchStreams(options = {}) {
  const category = options.category || getCategoryForSport(options.sport);
  if (!category) return { sources: {}, match: null };

  const streams = await getStreamsForCategory(category);
  if (!streams.length) return { sources: {}, match: null };

  const homeNorm = normalizeTeamName(options.homeTeamName);
  const awayNorm = normalizeTeamName(options.awayTeamName);
  if (!homeNorm || !awayNorm) return { sources: {}, match: null };

  let best = null;
  let bestScore = 0;
  for (const stream of streams) {
    const sc = scoreStream(stream, homeNorm, awayNorm);
    if (sc > bestScore) {
      bestScore = sc;
      best = stream;
      if (sc >= 1) break;
    }
  }

  if (!best || bestScore < MATCH_THRESHOLD) {
    return { sources: {}, match: null };
  }
  return { sources: buildSources(best), match: best };
}

// For 24/7 channels (e.g. F1) where there are no team names to match on.
export async function findStreamByName(options = {}) {
  const category = options.category || getCategoryForSport(options.sport);
  const needle = String(options.nameIncludes || "").toLowerCase();
  if (!category) return { sources: {}, match: null };

  const streams = await getStreamsForCategory(category);
  const found = streams.find((s) =>
    String(s?.name || "")
      .toLowerCase()
      .includes(needle),
  );
  if (!found) return { sources: {}, match: null };
  return { sources: buildSources(found), match: found };
}

export function clearCache() {
  cache.clear();
  inflight.clear();
}

export default {
  API_BASE,
  CATEGORY_BY_SPORT,
  normalizeTeamName,
  getCategoryForSport,
  getStreamsForCategory,
  findMatchStreams,
  findStreamByName,
  buildSources,
  clearCache,
};

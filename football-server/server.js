"use strict";

// Load `.env` when present so process.env contains local variables during dev
try {
  require("dotenv").config();
} catch (e) {}

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const compression = require("compression");
const http2 = require("http2");
const jwt = require("jsonwebtoken");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(compression());
app.use(express.json());

// In-memory store for push-to-start tokens (app bundle id -> Set(token))
const pushToStartTokens = new Map();
// Optional persisted mapping files (for simple persistence; replace with Redis/DB in production)
const path = require("path");
const { group } = require("console");
const PUSH_TOKENS_FILE = path.join(__dirname, "push_to_start_tokens.json");
const FIXTURE_TOKENS_FILE = path.join(__dirname, "fixture_push_tokens.json");
const ACTIVITY_TOKENS_FILE = path.join(__dirname, "activity_push_tokens.json");
const FIXTURE_ASSETS_FILE = path.join(__dirname, "fixture_assets.json");

// Supabase-backed store (preferred). Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
let supabase = null;
const SUPABASE_URL = process.env.SUPABASE_URL || null;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  } catch (e) {
    console.warn(e?.message || e);
    supabase = null;
  }
}

function loadJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw || "{}");
  } catch (e) {
    console.warn(`loadJsonFile(${filePath}) failed:`, e?.message || e);
    return {};
  }
}

function saveJsonFile(filePath, obj) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
  } catch (e) {
    console.warn(`saveJsonFile(${filePath}) failed:`, e?.message || e);
  }
}

// load persisted push tokens into memory on startup (file fallback only)
(function initPushTokenStore() {
  try {
    const raw = loadJsonFile(PUSH_TOKENS_FILE);
    for (const [bundleId, tokens] of Object.entries(raw || {})) {
      pushToStartTokens.set(
        bundleId,
        new Set(Array.isArray(tokens) ? tokens : []),
      );
    }
  } catch (e) {
    console.warn("initPushTokenStore failed", e?.message || e);
  }
})();

// fixture -> Set(tokens) mapping persisted separately (file fallback only)
const fixturePushTokens = new Map();
(function initFixtureTokenStore() {
  try {
    const raw = loadJsonFile(FIXTURE_TOKENS_FILE);
    for (const [fixtureId, tokens] of Object.entries(raw || {})) {
      fixturePushTokens.set(
        fixtureId,
        new Set(Array.isArray(tokens) ? tokens : []),
      );
    }
  } catch (e) {
    console.warn("initFixtureTokenStore failed", e?.message || e);
  }
})();

// activity instance tokens (device tokens returned by LiveActivity.instance.getPushToken())
const activityPushTokens = new Map();
(function initActivityTokenStore() {
  try {
    const raw = loadJsonFile(ACTIVITY_TOKENS_FILE);
    for (const [fixtureId, tokens] of Object.entries(raw || {})) {
      activityPushTokens.set(
        fixtureId,
        new Set(Array.isArray(tokens) ? tokens : []),
      );
    }
  } catch (e) {
    console.warn("initActivityTokenStore failed", e?.message || e);
  }
})();

// persisted fixture assets (logoName references saved by the app on registration)
const fixtureAssets = new Map();
(function initFixtureAssets() {
  try {
    const raw = loadJsonFile(FIXTURE_ASSETS_FILE);
    if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw)) fixtureAssets.set(String(k), v);
    }
  } catch (e) {}
})();

async function persistFixtureAssets() {
  if (supabase) return; // keep file fallback only; supabase persistence could be added later
  try {
    const obj = {};
    for (const [k, v] of fixtureAssets) obj[k] = v;
    saveJsonFile(FIXTURE_ASSETS_FILE, obj);
  } catch (e) {}
}

async function setFixtureAssets(fixtureId, assets) {
  try {
    const key = String(fixtureId);
    const prev = fixtureAssets.get(key) || {};
    const merged = Object.assign({}, prev, assets || {});
    fixtureAssets.set(key, merged);
    await persistFixtureAssets();
    return merged;
  } catch (e) {
    return null;
  }
}

function getFixtureAssets(fixtureId) {
  if (!fixtureId) return null;
  return fixtureAssets.get(String(fixtureId)) || null;
}

// Persistence helpers: prefer Supabase when configured, otherwise use file maps
async function persistPushTokens() {
  if (supabase) return; // Supabase persists directly
  const obj = {};
  for (const [k, set] of pushToStartTokens.entries()) obj[k] = Array.from(set);
  saveJsonFile(PUSH_TOKENS_FILE, obj);
}

async function persistFixtureTokens() {
  if (supabase) return;
  const obj = {};
  for (const [k, set] of fixturePushTokens.entries()) obj[k] = Array.from(set);
  saveJsonFile(FIXTURE_TOKENS_FILE, obj);
}

async function persistActivityTokens() {
  if (supabase) return;
  try {
    const obj = {};
    for (const [k, set] of activityPushTokens.entries())
      obj[k] = Array.from(set);
    saveJsonFile(ACTIVITY_TOKENS_FILE, obj);
  } catch (e) {
    console.warn("persistActivityTokens failed", e?.message || e);
  }
}

// Activity token helpers (tokens returned by LiveActivity.instance.getPushToken())
async function addActivityToken(fixtureId, token) {
  if (!fixtureId || !token) return false;
  if (supabase) {
    try {
      // Robust fallback for environments without the expected unique constraint:
      // 1) remove any existing rows that reference this token (avoid duplicates)
      // 2) insert a fresh activity-type row for this fixture
      try {
        await supabase.from("live_activity_tokens").delete().eq("token", token);
      } catch (e) {
        // non-fatal
      }
      const { error } = await supabase.from("live_activity_tokens").insert([
        {
          type: "activity",
          bundle_id: null,
          token,
          fixture_id: String(fixtureId),
        },
      ]);
      if (error) {
        console.warn(
          "[live-activity] supabase insert activity token error:",
          error?.message || error,
        );
      } else {
      }
      return true;
    } catch (e) {
      console.warn("supabase upsert activity token failed", e?.message || e);
    }
  }
  let s = activityPushTokens.get(String(fixtureId));
  if (!s) {
    s = new Set();
    activityPushTokens.set(String(fixtureId), s);
  }
  s.add(token);
  await persistActivityTokens();
  return true;
}

async function getActivityTokensForFixture(fixtureId) {
  if (!fixtureId) return [];
  if (supabase) {
    try {
      // only return activity-type tokens for updates/ends
      const { data, error } = await supabase
        .from("live_activity_tokens")
        .select("token, type, fixture_id, bundle_id")
        .eq("fixture_id", String(fixtureId))
        .eq("type", "activity");
      if (error) {
        console.warn(
          "[live-activity] supabase select activity tokens error:",
          error?.message || error,
        );
        throw error;
      }
      return (data || []).map((r) => r.token).filter(Boolean);
    } catch (e) {
      console.warn("supabase select activity tokens failed", e?.message || e);
    }
  }
  return Array.from(activityPushTokens.get(String(fixtureId)) ?? []);
}

async function removeActivityToken(token) {
  if (!token) return false;
  if (supabase) {
    try {
      // remove only activity-type rows (avoid clobbering fixture/bundle tokens with same token string)
      await supabase
        .from("live_activity_tokens")
        .delete()
        .eq("token", token)
        .eq("type", "activity");
      return true;
    } catch (e) {
      console.warn("supabase delete activity token failed", e?.message || e);
    }
  }
  let removed = false;
  for (const [fixtureId, set] of activityPushTokens.entries()) {
    if (set.has(token)) {
      set.delete(token);
      removed = true;
      if (set.size === 0) activityPushTokens.delete(fixtureId);
    }
  }
  if (removed) await persistActivityTokens();
  return removed;
}

// Supabase-backed token helpers
async function addPushToStartToken(bundleId, token) {
  if (!bundleId || !token) return false;
  if (supabase) {
    try {
      // Robust approach: remove any existing rows with this token, then insert bundle row
      try {
        await supabase.from("live_activity_tokens").delete().eq("token", token);
      } catch (e) {}
      const { error } = await supabase
        .from("live_activity_tokens")
        .insert([
          { type: "bundle", bundle_id: bundleId, token, fixture_id: null },
        ]);
      if (error) {
        console.warn(
          "[live-activity] supabase insert bundle token error:",
          error?.message || error,
        );
      } else {
      }
      return true;
    } catch (e) {
      console.warn("supabase upsert bundle token failed:", e?.message || e);
    }
  }
  let s = pushToStartTokens.get(bundleId);
  if (!s) {
    s = new Set();
    pushToStartTokens.set(bundleId, s);
  }
  s.add(token);
  await persistPushTokens();
  return true;
}

async function removePushToStartToken(token) {
  let removed = false;
  if (supabase) {
    try {
      // only remove bundle-type push-to-start tokens
      await supabase
        .from("live_activity_tokens")
        .delete()
        .eq("token", token)
        .eq("type", "bundle");
      return true;
    } catch (e) {
      console.warn("supabase delete token failed:", e?.message || e);
    }
  }
  for (const [bundleId, set] of pushToStartTokens.entries()) {
    if (set.has(token)) {
      set.delete(token);
      removed = true;
      if (set.size === 0) pushToStartTokens.delete(bundleId);
    }
  }
  if (removed) await persistPushTokens();
  return removed;
}

async function addFixturePushToken(fixtureId, token) {
  if (!fixtureId || !token) return false;
  if (supabase) {
    try {
      // upsert fixture-level token (type='fixture')
      await supabase.from("live_activity_tokens").upsert(
        {
          type: "fixture",
          bundle_id: null,
          token,
          fixture_id: String(fixtureId),
        },
        { onConflict: ["type", "fixture_id", "token"] },
      );
      return true;
    } catch (e) {
      console.warn("supabase upsert fixture token failed:", e?.message || e);
    }
  }
  let s = fixturePushTokens.get(String(fixtureId));
  if (!s) {
    s = new Set();
    fixturePushTokens.set(String(fixtureId), s);
  }
  s.add(token);
  await persistFixtureTokens();
  return true;
}

async function getTokensForBundle(bundleId) {
  if (supabase) {
    try {
      // only return bundle-type tokens
      const { data, error } = await supabase
        .from("live_activity_tokens")
        .select("token")
        .eq("bundle_id", bundleId)
        .eq("type", "bundle");
      if (error) throw error;
      return (data || []).map((r) => r.token).filter(Boolean);
    } catch (e) {
      console.warn("supabase select bundle tokens failed:", e?.message || e);
    }
  }
  return Array.from(pushToStartTokens.get(bundleId) ?? []);
}

async function getTokensForFixture(fixtureId) {
  if (supabase) {
    try {
      // only return fixture-type tokens (not activity tokens)
      const { data, error } = await supabase
        .from("live_activity_tokens")
        .select("token")
        .eq("fixture_id", String(fixtureId))
        .eq("type", "fixture");
      if (error) throw error;
      return (data || []).map((r) => r.token).filter(Boolean);
    } catch (e) {
      console.warn("supabase select fixture tokens failed:", e?.message || e);
    }
  }
  return Array.from(fixturePushTokens.get(String(fixtureId)) ?? []);
}

// Optional: URL of an APNs relay or provider that accepts POST { token, payload }
// If provided, server will forward APNs payloads to that URL. Otherwise the
// prepared APNs payload will be returned in the response for manual sending.
const APNS_PROVIDER_URL = process.env.APNS_PROVIDER_URL || null;
const APNS_PROVIDER_AUTH = process.env.APNS_PROVIDER_AUTH || null; // optional auth header value

// Apple / APNs config (set these in your env or Railway variables)
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || null;
const APPLE_KEY_ID = process.env.APPLE_KEY_ID || null;
const APPLE_BUNDLE_ID =
  process.env.APPLE_BUNDLE_ID || process.env.APPLE_BUNDLE || null;
// Either set APPLE_PRIVATE_KEY (escaped newlines) or APPLE_PRIVATE_KEY_PATH to a .p8 file
const APPLE_PRIVATE_KEY = process.env.APPLE_PRIVATE_KEY || null;
const APPLE_PRIVATE_KEY_PATH = process.env.APPLE_PRIVATE_KEY_PATH || null;

// monitors for live activities keyed by fixtureId (or instance id)
const liveActivityMonitors = new Map();

const PORT = process.env.PORT || 3000;

// Simple in-memory metrics for push activity (exportable via an endpoint)
const pushMetrics = {
  attempts: 0,
  successes: 0,
  failures: 0,
  retries: 0,
};

// ─── API credentials (prefer env vars so tokens aren't baked in) ──────────────
const SM_TOKEN = process.env.SM_TOKEN || null;
const SM_BASE = "https://api.sportmonks.com/v3/football";
const SAP_BASE = "https://v1.football.sportsapipro.com";
const SAP_KEY = process.env.SAP_KEY || null;

// ─── TTL constants ────────────────────────────────────────────────────────────
const TTL_20S = 20 * 1000;
const TTL_30S = 30 * 1000;
const TTL_5M = 5 * 60 * 1000;
const TTL_1M = 1 * 60 * 1000;
const TTL_15M = 15 * 60 * 1000;
const TTL_1H = 60 * 60 * 1000;
const TTL_12H = 12 * TTL_1H;
const TTL_2H = 2 * TTL_1H;
const TTL_24H = 24 * TTL_1H;

// ─── Cache stores ─────────────────────────────────────────────────────────────
// key -> { data, fetchedAt }
const cache = new Map();

// key -> intervalId  (used for SAP standings / league meta auto-refresh)
const refreshIntervals = new Map();

// key -> { intervalId: number | null, lastRequest: number }  (fixture-date activity polling)
const fixtureActivity = new Map();

// key -> { intervalId: number | null, lastRequest: number }  (game activity polling)
const gameActivity = new Map();

// League metadata built on startup: Map<leagueId, { seasonId, stageId }>
let leagueMeta = null;

// ─── SportsApiPro competition IDs to warm on startup ─────────────────────────
const SAP_COMPETITION_IDS = [7, 11, 25, 17, 35, 104];

// Optional aliases: SportsApiPro team name -> SportMonks team name.
// Keys and values are compared through normalizeName(), so accents/casing/punctuation
// differences are handled automatically.
const SAP_TO_SM_TEAM_NAME_MAP = Object.freeze({
  "athletic bilbao": "athletic club",
  "celta vigo": "celta de vigo",
  "olympique de marseille": "olympique marseille",
  "los angeles galaxy": "la galaxy",
  "san jose earthquakes": "sj earthquakes",
});

// ─────────────────────────────────────────────────────────────────────────────
// Low-level helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchUrl(url, headers = {}) {
  const response = await axios.get(url, { timeout: 30000, headers });
  return response.data;
}

function cacheSet(key, data) {
  cache.set(key, { data, fetchedAt: Date.now() });
}

function cacheValid(key, ttlMs) {
  const e = cache.get(key);
  return e != null && Date.now() - e.fetchedAt < ttlMs;
}

async function fetchAndCache(key, url, headers = {}) {
  const data = await fetchUrl(url, headers);
  cacheSet(key, data);
  return data;
}

function setCacheControl(res, ttlMs) {
  res.set(
    "Cache-Control",
    `public, max-age=${Math.max(0, Math.floor(ttlMs / 1000))}`,
  );
}

function getPstDateString() {
  // Fixed PST offset (UTC-8) as requested.
  const pstNow = new Date(Date.now() - 8 * 60 * 60 * 1000);
  return pstNow.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Startup warm-up
// ─────────────────────────────────────────────────────────────────────────────

// 1) SportsApiPro competition standings — TTL 24h, auto-refresh
async function warmSapStandings() {
  await Promise.allSettled(
    SAP_COMPETITION_IDS.map(async (compId) => {
      const key = `sap:standings:${compId}`;
      const url = `${SAP_BASE}/standings?competitions=${compId}`;
      try {
        await fetchAndCache(key, url, { "x-api-key": SAP_KEY });
        // auto-refresh every 24 h
        const id = setInterval(
          () =>
            fetchAndCache(key, url, { "x-api-key": SAP_KEY }).catch((e) =>
              console.error(`[auto-refresh] ${key}:`, e.message),
            ),
          TTL_24H,
        );
        refreshIntervals.set(key, id);
      } catch (err) {
        console.warn(`[startup] SAP standings ${compId} failed:`, err.message);
      }
    }),
  );
}

// 2) All SportMonks leagues with currentSeason.stages — TTL 24h, auto-refresh
async function warmLeagueMeta() {
  try {
    const leagues = await fetchAllLeaguePages();
    buildLeagueMeta(leagues);
    cacheSet("sm:leagues:all", leagues);

    // auto-refresh every 24 h
    const id = setInterval(async () => {
      try {
        const fresh = await fetchAllLeaguePages();
        buildLeagueMeta(fresh);
        cacheSet("sm:leagues:all", fresh);
      } catch (e) {
        console.error("[auto-refresh] league meta:", e.message);
      }
    }, TTL_24H);
    refreshIntervals.set("sm:leagues:all", id);
  } catch (err) {
    console.warn("[startup] League meta failed:", err.message);
  }
}

async function fetchAllLeaguePages() {
  let page = 1;
  let allLeagues = [];

  while (true) {
    const url = `${SM_BASE}/leagues?api_token=${SM_TOKEN}&include=currentSeason.stages&per_page=250&page=${page}`;
    const response = await fetchUrl(url);
    if (!response?.data || !Array.isArray(response.data)) break;
    allLeagues = allLeagues.concat(response.data);
    if (!response.pagination?.has_more) break;
    page++;
  }

  return allLeagues;
}

function buildLeagueMeta(leagues) {
  leagueMeta = new Map();
  for (const league of leagues || []) {
    const seasonId = league.currentseason?.id ?? null;
    let stageId = null;
    const stages = league.currentseason?.stages;
    if (Array.isArray(stages)) {
      const s1 = stages.find((s) => s.sort_order === 1);
      if (s1) stageId = s1.id;
    }
    leagueMeta.set(league.id, { seasonId, stageId });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture / game state helpers
// ─────────────────────────────────────────────────────────────────────────────

const FINISHED_STATES = new Set([
  "FT",
  "AET",
  "FT_PEN",
  "POSTP",
  "CANC",
  "ABAN",
  "WO",
  "WALKOVER",
  "CUT",
  "AWA",
  "POST",
  "POSTPONED",
  "CANCELLED",
]);
const FUTURE_STATES = new Set(["NS", "TBA", "DELAYED"]);

function stateCode(fixture) {
  return (
    fixture?.state?.state ||
    fixture?.state?.short_name ||
    fixture?.state?.developer_name ||
    ""
  ).toUpperCase();
}

function isFinished(fixture) {
  return FINISHED_STATES.has(stateCode(fixture));
}
function isScheduled(fixture) {
  return FUTURE_STATES.has(stateCode(fixture));
}
function isLive(fixture) {
  const c = stateCode(fixture);
  return c !== "" && !FINISHED_STATES.has(c) && !FUTURE_STATES.has(c);
}

function shortNameOf(fixture) {
  return String(fixture?.state?.short_name || "").toUpperCase();
}

const LIVE_SHORT_NAMES = new Set([
  "1ST",
  "HT",
  "2ND",
  "BRK",
  "BREAK",
  "INPLAY_ET",
  "INPLAY_PEN",
  "ET",
  "PEN",
]);

function isLiveByShortName(fixture) {
  return LIVE_SHORT_NAMES.has(shortNameOf(fixture));
}

function isFinishedByShortName(fixture) {
  const sn = shortNameOf(fixture);
  return sn === "FT" || FINISHED_STATES.has(stateCode(fixture));
}

function startTimeMsOf(fixture) {
  if (fixture?.starting_at_timestamp)
    return fixture.starting_at_timestamp * 1000;
  if (fixture?.starting_at)
    return new Date(fixture.starting_at + " UTC").getTime();
  return null;
}

// TTL for the /fixture date-list endpoint (evaluates over all fixtures on that day)
function fixtureDateTtlInfo(fixtures) {
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    return { ttl: TTL_2H, fast: false, mode: "scheduled_empty" };
  }

  if (fixtures.some((f) => isLiveByShortName(f))) {
    return { ttl: TTL_20S, fast: true, mode: "live" };
  }

  const now = Date.now();
  let nearestStart = null;
  const considered = [];
  let excludedFinished = 0;
  for (const f of fixtures) {
    if (isFinishedByShortName(f)) continue;
    const t = startTimeMsOf(f);
    // Include any non-finished fixtures with a start time (even if that
    // start time is already in the past). This allows the code below to
    // detect a nearestStart that has just passed but which upstream hasn't
    // yet marked as live, enabling the `post_start_pending` fast-poll mode.
    if (t != null) {
      considered.push({ id: f.id ?? "?", ts: t });
      if (nearestStart == null || t < nearestStart) nearestStart = t;
    }
  }

  // Diagnostic: log what fixtures were considered and how nearestStart was chosen
  try {
    const consideredSummary = considered
      .map((c) => `${c.id}:${new Date(c.ts).toISOString()}`)
      .join(", ");
    // count finished entries explicitly
    excludedFinished = fixtures.filter((f) => isFinishedByShortName(f)).length;
    if (nearestStart != null) {
      const diff = nearestStart - now;
    } else {
    }
  } catch (e) {
    console.error(
      "[fixture-poll.debug] failed to summarize fixtures",
      e && e.message,
    );
  }

  if (nearestStart != null) {
    const diff = nearestStart - now;
    // If the nearest start time is in the past (kick-off passed) but the
    // fixture list hasn't yet been marked live by the upstream API, treat
    // this as a post-start pending window and poll quickly so updates arrive.
    if (diff <= 0)
      return { ttl: TTL_20S, fast: true, mode: "post_start_pending" };
    if (diff <= TTL_15M)
      return { ttl: TTL_1M, fast: true, mode: "scheduled_very_soon" };
    if (diff <= TTL_1H)
      return { ttl: TTL_5M, fast: true, mode: "scheduled_soon" };
    return { ttl: TTL_2H, fast: false, mode: "scheduled_far" };
  }

  return { ttl: TTL_12H, fast: false, mode: "finished" };
}

// TTL for a single game fixture (/game endpoint)
function gameTtlInfo(fixture) {
  if (!fixture) return { ttl: TTL_2H, fast: false, mode: "scheduled" };

  if (isLiveByShortName(fixture)) {
    return { ttl: TTL_20S, fast: true, mode: "live" };
  }

  if (isFinishedByShortName(fixture)) {
    return { ttl: TTL_12H, fast: false, mode: "finished" };
  }

  const tStart = startTimeMsOf(fixture);
  if (tStart != null) {
    const now = Date.now();
    const diff = tStart - now;

    // Future game: far away -> 2h cache
    if (diff > TTL_1H) {
      return { ttl: TTL_2H, fast: false, mode: "scheduled_far" };
    }

    // Within one hour: start active polling at intervals depending on proximity
    if (diff > TTL_15M) {
      // Between 15m and 1h -> poll every 5 minutes
      return { ttl: TTL_5M, fast: true, mode: "scheduled_soon" };
    }

    if (diff > 0) {
      // Between 0 and 15m -> poll every 1 minute
      return { ttl: TTL_1M, fast: true, mode: "scheduled_very_soon" };
    }

    // Kick-off time passed but state is not yet in live/finished buckets.
    return { ttl: TTL_20S, fast: true, mode: "post_start_pending" };
  }

  return { ttl: TTL_2H, fast: false, mode: "scheduled" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture-date activity-based polling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensures the fixture-date endpoint is polled every 20 s while any game is live
 * AND requests have been seen within the last 60 s.
 */
function ensureFixtureDatePolling(cacheKey, url, latestData) {
  const info = fixtureDateTtlInfo(latestData?.data);
  if (!info.fast) return;
  const initialTtl = info.ttl;
  // Store interval id so we don't create duplicate pollers. Unlike game
  // polling, fixture-date polling should run regardless of external request
  // activity while `info.fast` indicates we should poll.
  let act = fixtureActivity.get(cacheKey);
  if (!act) {
    act = { intervalId: null };
    fixtureActivity.set(cacheKey, act);
  }

  if (act.intervalId != null) return;

  // Log games' start times and the polling rule being used
  try {
    const games = Array.isArray(latestData?.data) ? latestData.data : [];
    const starts = games
      .map((f) => {
        const ts = startTimeMsOf(f);
        return `${f.id ?? "?"}:${ts != null ? new Date(ts).toISOString() : "null"}`;
      })
      .join(", ");
  } catch (e) {
    console.error(
      `[fixture-poll] ${cacheKey}: failed to log starts:`,
      e.message,
    );
  }

  act.intervalId = setInterval(async () => {
    try {
      const freshData = await fetchUrl(url);
      cacheSet(cacheKey, freshData);

      const {
        fast: stillFast,
        ttl: newTtl,
        mode,
      } = fixtureDateTtlInfo(freshData?.data);
      if (!stillFast) {
        clearInterval(act.intervalId);
        act.intervalId = null;
        return;
      }

      if (newTtl !== initialTtl) {
        // Restart polling with the new interval
        clearInterval(act.intervalId);
        act.intervalId = null;
        ensureFixtureDatePolling(cacheKey, url, freshData);
        return;
      }
    } catch (e) {
      console.error(`[fixture-poll] ${cacheKey}:`, e.message);
    }
  }, initialTtl);
}

// ─────────────────────────────────────────────────────────────────────────────
// Game activity-based polling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensures the game endpoint is polled every 20 s while short_name is live window
 * AND requests have been seen within the last 60 s.  Stops automatically on
 * inactivity, game-end, or leaving the fast-poll window.
 */
function ensureGamePolling(cacheKey, fixtureUrl, fixture) {
  const info = gameTtlInfo(fixture);
  if (!info.fast) return; // game is finished or scheduled far away — no polling needed
  const initialTtl = info.ttl;

  // Record this request as activity
  let act = gameActivity.get(cacheKey);
  if (!act) {
    act = { intervalId: null, lastRequest: Date.now() };
    gameActivity.set(cacheKey, act);
  }
  act.lastRequest = Date.now();

  if (act.intervalId != null) return; // already polling

  act.intervalId = setInterval(async () => {
    // Stop if no request seen for 60 s
    if (Date.now() - act.lastRequest > 60_000) {
      clearInterval(act.intervalId);
      act.intervalId = null;
      return;
    }

    try {
      const fixtureData = await fetchUrl(fixtureUrl);
      cacheSet(cacheKey, fixtureData);

      const {
        fast: stillFast,
        ttl: newTtl,
        mode,
      } = gameTtlInfo(fixtureData?.data);
      if (!stillFast) {
        clearInterval(act.intervalId);
        act.intervalId = null;
        return;
      }

      if (newTtl !== initialTtl) {
        clearInterval(act.intervalId);
        act.intervalId = null;
        ensureGamePolling(cacheKey, fixtureUrl, fixtureData?.data);
        return;
      }
    } catch (e) {
      console.error(`[game-poll] ${cacheKey}:`, e.message);
    }
  }, initialTtl);
}

/**
 * Lightweight polling variant for the light game endpoint — polls every 5s
 * while the game is in a fast (live) window. Behavior mirrors ensureGamePolling
 * but uses a fixed 5 second interval to provide higher-frequency updates.
 */
function ensureGamePollingLight(cacheKey, fixtureUrl, fixture) {
  const info = gameTtlInfo(fixture);
  if (!info.fast) return;
  const initialTtl = info.ttl;

  let act = gameActivity.get(cacheKey);
  if (!act) {
    act = { intervalId: null, lastRequest: Date.now() };
    gameActivity.set(cacheKey, act);
  }
  act.lastRequest = Date.now();

  if (act.intervalId != null) return;

  act.intervalId = setInterval(async () => {
    if (Date.now() - act.lastRequest > 60_000) {
      clearInterval(act.intervalId);
      act.intervalId = null;
      return;
    }

    try {
      const fixtureData = await fetchUrl(fixtureUrl);
      cacheSet(cacheKey, fixtureData);

      const { fast: stillFast, ttl: newTtl } = gameTtlInfo(fixtureData?.data);
      if (!stillFast) {
        clearInterval(act.intervalId);
        act.intervalId = null;
        return;
      }

      if (newTtl !== initialTtl) {
        clearInterval(act.intervalId);
        act.intervalId = null;
        ensureGamePollingLight(cacheKey, fixtureUrl, fixtureData?.data);
        return;
      }
    } catch (e) {
      console.error(`[game-poll-light] ${cacheKey}:`, e.message);
    }
  }, 5000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// Transforms combined league data (standings/teams/leagueInfo/stageStats) per a–d.txt specs.
function transformLeagueResponse(combined) {
  const colorMap = buildSapColorMap();

  // ── a.txt: standings grouped by stage ──────────────────────────────────────
  const standingRows = Array.isArray(combined.standings?.data)
    ? combined.standings.data
    : [];
  const stageMap = new Map();
  for (const entry of standingRows) {
    const sid = entry.stage?.id ?? entry.stage_id ?? "__unknown__";
    if (!stageMap.has(sid)) {
      const st = entry.stage;
      stageMap.set(sid, {
        stage: st
          ? {
              name: st.name ?? null,
              sort_order: st.sort_order ?? null,
              starting_at: st.starting_at ?? null,
              ending_at: st.ending_at ?? null,
            }
          : null,
        entries: [],
      });
    }
    const p = entry.participant;
    const colors = p
      ? findSapColors(p.name, colorMap)
      : { colorPrimary: null, colorSecondary: null };
    stageMap.get(sid).entries.push({
      id: entry.id ?? null,
      league_id: entry.league_id ?? null,
      season_id: entry.season_id ?? null,
      result: entry.result ?? null,
      points: entry.points ?? null,
      rule: entry.rule
        ? {
            model_type: entry.rule.model_type ?? null,
            type: entry.rule.type?.name ?? null,
          }
        : null,
      participant: p
        ? {
            id: p.id ?? null,
            name: p.name ?? null,
            short_code: p.short_code ?? null,
            image_path: p.image_path ?? null,
            colorPrimary: colors.colorPrimary,
            colorSecondary: colors.colorSecondary,
          }
        : null,
      details: Array.isArray(entry.details)
        ? entry.details.map((d) => ({
            value: d.value ?? null,
            type: d.type
              ? {
                  name: d.type.name ?? null,
                  stat_group: d.type.stat_group ?? null,
                }
              : null,
          }))
        : [],
      form: Array.isArray(entry.form)
        ? entry.form.map((f) => ({
            fixture_id: f.fixture_id ?? null,
            form: f.form ?? null,
          }))
        : [],
      group: entry?.group?.name ?? null,
    });
  }
  const standings = Array.from(stageMap.values());

  // ── b.txt: teams in season ─────────────────────────────────────────────────
  const teamsRaw = Array.isArray(combined.teamsInSeason?.data)
    ? combined.teamsInSeason.data
    : [];
  const teamsInSeason = teamsRaw.map((t) => {
    const teamColors = findSapColors(t.name, colorMap);
    return {
      id: t.id ?? null,
      name: t.name ?? null,
      short_code: t.short_code ?? null,
      image_path: t.image_path ?? null,
      colorPrimary: teamColors.colorPrimary,
      colorSecondary: teamColors.colorSecondary,
      sidelined: Array.isArray(t.sidelined)
        ? t.sidelined.map((sl) => ({
            player_id: sl.player_id ?? null,
            start_date: sl.start_date ?? null,
            end_date: sl.end_date ?? null,
            games_missed: sl.games_missed ?? null,
            player: sl.player
              ? {
                  id: sl.player.id ?? null,
                  firstname: sl.player.firstname ?? null,
                  lastname: sl.player.lastname ?? null,
                  name: sl.player.name ?? null,
                  display_name: sl.player.display_name ?? null,
                  image_path: sl.player.image_path ?? null,
                }
              : null,
            type: sl.type ? { name: sl.type.name ?? null } : null,
          }))
        : [],
      statistics: Array.isArray(t.statistics)
        ? t.statistics.map((s) => ({
            details: Array.isArray(s.details)
              ? s.details.map((d) => ({
                  value: d.value ?? null,
                  type: d.type
                    ? {
                        name: d.type.name ?? null,
                        stat_group: d.type.stat_group ?? null,
                      }
                    : null,
                }))
              : [],
          }))
        : [],
      players: Array.isArray(t.players)
        ? t.players.map((pl) => ({
            id: pl.player_id ?? null,
            captain: pl.captain ?? null,
            jersey_number: pl.jersey_number ?? null,
            player: pl.player
              ? {
                  id: pl.player.id ?? null,
                  firstname: pl.player.firstname ?? null,
                  lastname: pl.player.lastname ?? null,
                  name: pl.player.name ?? null,
                  display_name: pl.player.display_name ?? null,
                  image_path: pl.player.image_path ?? null,
                }
              : null,
            detailedposition: pl.detailedposition
              ? { name: pl.detailedposition.name ?? null }
              : null,
            position: pl.position ? { name: pl.position.name ?? null } : null,
          }))
        : [],
    };
  });

  // ── c.txt: league info ─────────────────────────────────────────────────────
  const li = combined.leagueInfo?.data;
  const leagueInfo = li
    ? {
        id: li.id ?? null,
        name: li.name ?? null,
        short_code: li.short_code ?? null,
        image_path: li.image_path ?? null,
        last_played_at: li.last_played_at ?? null,
        currentseason: li.currentseason
          ? {
              id: li.currentseason.id ?? null,
              name: li.currentseason.name ?? null,
              starting_at: li.currentseason.starting_at ?? null,
              ending_at: li.currentseason.ending_at ?? null,
            }
          : null,
        country: li.country
          ? {
              name: li.country.name ?? null,
              image_path: li.country.image_path ?? null,
            }
          : null,
        latest: Array.isArray(li.latest)
          ? li.latest.map((f) => ({
              id: f.id ?? null,
              starting_at: f.starting_at ?? null,
              round: f.round ? { name: f.round.name ?? null } : null,
              aggregate: f.aggregate
                ? {
                    name: f.aggregate.name ?? null,
                    result: f.aggregate.result ?? null,
                  }
                : null,
              scores: Array.isArray(f.scores)
                ? f.scores
                    .filter((s) => s.description === "CURRENT")
                    .map((s) => ({
                      score: s.score
                        ? {
                            goals: s.score.goals ?? null,
                            participant: s.score.participant ?? null,
                          }
                        : null,
                    }))
                : [],
              participants: Array.isArray(f.participants)
                ? f.participants.map((p) => {
                    const colors = findSapColors(p.name, colorMap);
                    return {
                      id: p.id ?? null,
                      name: p.name ?? null,
                      short_code: p.short_code ?? null,
                      image_path: p.image_path ?? null,
                      colorPrimary: colors.colorPrimary,
                      colorSecondary: colors.colorSecondary,
                      meta: p.meta
                        ? {
                            location: p.meta.location ?? null,
                            winner: p.meta.winner ?? null,
                          }
                        : null,
                    };
                  })
                : [],
              venue: f.venue ? { name: f.venue.name ?? null } : null,
            }))
          : [],
        upcoming: Array.isArray(li.upcoming)
          ? li.upcoming.map((f) => ({
              id: f.id ?? null,
              starting_at: f.starting_at ?? null,
              round: f.round ? { name: f.round.name ?? null } : null,
              aggregate: f.aggregate
                ? {
                    name: f.aggregate.name ?? null,
                    result: f.aggregate.result ?? null,
                  }
                : null,
              participants: Array.isArray(f.participants)
                ? f.participants.map((p) => {
                    const colors = findSapColors(p.name, colorMap);
                    return {
                      id: p.id ?? null,
                      name: p.name ?? null,
                      short_code: p.short_code ?? null,
                      image_path: p.image_path ?? null,
                      colorPrimary: colors.colorPrimary,
                      colorSecondary: colors.colorSecondary,
                      meta: p.meta
                        ? { location: p.meta.location ?? null }
                        : null,
                    };
                  })
                : [],
              venue: f.venue ? { name: f.venue.name ?? null } : null,
            }))
          : [],
      }
    : null;

  // ── d.txt: stage stats ─────────────────────────────────────────────────────
  const stageStats = Array.isArray(combined.stageStats?.data)
    ? combined.stageStats.data.map((s) => ({
        relation_id: s.relation_id ?? null,
        value: s.value ?? null,
        type: s.type
          ? { name: s.type.name ?? null, stat_group: s.type.stat_group ?? null }
          : null,
      }))
    : null;

  const teamOfTheWeek = transformTeamOfTheWeekResponse(combined.teamOfTheWeek);

  return { standings, teamsInSeason, leagueInfo, stageStats, teamOfTheWeek };
}

// Transforms raw SM team-of-the-week response per 1.txt spec.
function transformTeamOfTheWeekResponse(raw) {
  const rows = Array.isArray(raw?.data) ? raw.data : [];

  return rows.map((item) => ({
    fixture_id: item.fixture_id ?? null,
    rating: item.rating ?? null,
    formation_position: item.formation_position ?? null,
    formation: item.formation ?? null,
    player: item.player
      ? {
          id: item.player.id ?? null,
          firstname: item.player.firstname ?? null,
          lastname: item.player.lastname ?? null,
          name: item.player.name ?? null,
          display_name: item.player.display_name ?? null,
          image_path: item.player.image_path ?? null,
          country: item.player.country
            ? {
                name: item.player.country.name ?? null,
                image_path: item.player.country.image_path ?? null,
              }
            : null,
        }
      : null,
    team: item.team
      ? {
          id: item.team.id ?? null,
          name: item.team.name ?? null,
          image_path: item.team.image_path ?? null,
        }
      : null,
    round: item.round
      ? {
          name: item.round.name ?? null,
        }
      : null,
  }));
}

// Transforms raw SM team-rankings response per 1.txt spec.
function transformTeamRankingsResponse(raw) {
  const rows = Array.isArray(raw?.data) ? raw.data : [];

  return rows.map((item) => ({
    team_id: item.team_id ?? null,
    current_rank: item.current_rank ?? null,
    scaled_score: item.scaled_score ?? null,
    team: item.team
      ? {
          id: item.team.id ?? null,
          name: item.team.name ?? null,
          short_code: item.team.short_code ?? null,
          image_path: item.team.image_path ?? null,
          activeseasons: Array.isArray(item.team.activeseasons)
            ? item.team.activeseasons.map((as) => ({
                league: as?.league
                  ? {
                      id: as.league.id ?? null,
                      name: as.league.name ?? null,
                      image_path: as.league.image_path ?? null,
                      type: as.league.type ?? null,
                      sub_type: as.league.sub_type ?? null,
                    }
                  : null,
              }))
            : [],
        }
      : null,
  }));
}

// GET /football/rank
// Fetches team rankings for today's PST date and returns transformed rows per 1.txt.
app.get("/football/rank", async (_req, res) => {
  const pstDate = getPstDateString();
  const cacheKey = `rank:${pstDate}`;

  if (cacheValid(cacheKey, TTL_1H)) {
    setCacheControl(res, TTL_1H);
    return res.json({
      source: "cache",
      date: pstDate,
      data: transformTeamRankingsResponse(cache.get(cacheKey).data),
    });
  }

  try {
    const url =
      `${SM_BASE}/team-rankings/date/${pstDate}?api_token=${SM_TOKEN}` +
      `&per_page=50&include=team;team.activeseasons.league`;

    const raw = await fetchUrl(url);
    cacheSet(cacheKey, raw);

    setCacheControl(res, TTL_1H);
    res.json({
      source: "origin",
      date: pstDate,
      data: transformTeamRankingsResponse(raw),
    });
  } catch (err) {
    res.status(502).json({
      error: "Failed to fetch team rankings",
      details: err.message,
    });
  }
});

// GET /football/league/:leagueId
// Fetches 5 SportMonks endpoints in parallel: standings, teams, league info, stage stats, team of the week.
app.get("/football/league/:leagueId", async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isInteger(leagueId) || leagueId <= 0) {
    return res.status(400).json({ error: "Invalid leagueId" });
  }

  if (!leagueMeta) {
    return res
      .status(503)
      .json({ error: "Server is still initializing — try again shortly" });
  }

  const meta = leagueMeta.get(leagueId);
  if (!meta) {
    return res
      .status(404)
      .json({ error: `League ${leagueId} not found in metadata` });
  }

  const { seasonId, stageId } = meta;
  const cacheKey = `league:${leagueId}`;

  if (cacheValid(cacheKey, TTL_1H)) {
    setCacheControl(res, TTL_1H);
    return res.json({
      source: "cache",
      data: transformLeagueResponse(cache.get(cacheKey).data),
    });
  }

  try {
    const [standings, teamsInSeason, leagueInfo, stageStats, teamOfTheWeek] =
      await Promise.all([
        fetchUrl(
          `${SM_BASE}/standings/seasons/${seasonId}?api_token=${SM_TOKEN}` +
            `&include=rule.type;stage;participant;details.type;form;league;group`,
        ),
        fetchUrl(
          `${SM_BASE}/teams/seasons/${seasonId}?api_token=${SM_TOKEN}` +
            `&include=sidelined.player;sidelined.type;statistics.details.type;players.player;players.detailedPosition;players.position` +
            `&filters=teamstatisticSeasons:${seasonId}`,
        ),
        fetchUrl(
          `${SM_BASE}/leagues/${leagueId}?api_token=${SM_TOKEN}` +
            `&include=currentSeason;country;latest.round;latest.aggregate;latest.scores;latest.participants;latest.venue;upcoming.round;upcoming.aggregate;upcoming.participants;upcoming.venue&timezone=America/Toronto`,
        ),
        stageId
          ? fetchUrl(
              `${SM_BASE}/statistics/stages/${stageId}?api_token=${SM_TOKEN}` +
                `&include=type;participant`,
            )
          : Promise.resolve(null),
        fetchUrl(
          `${SM_BASE}/team-of-the-week/leagues/${leagueId}/latest?api_token=${SM_TOKEN}` +
            `&include=player.country;team;round`,
        ),
      ]);

    const combined = {
      standings,
      teamsInSeason,
      leagueInfo,
      stageStats,
      teamOfTheWeek,
    };
    cacheSet(cacheKey, combined);

    setCacheControl(res, TTL_1H);
    res.json({ source: "origin", data: transformLeagueResponse(combined) });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch league data", details: err.message });
  }
});

// Transforms combined team data per a–d.txt specs.
function transformTeamResponse(combined) {
  const colorMap = buildSapColorMap();

  // ── a.txt: schedule — stages → rounds → fixtures ─────────────────────────
  const schedule = Array.isArray(combined.scheduleData?.data)
    ? combined.scheduleData.data.map((stage) => ({
        id: stage.id ?? null,
        league_id: stage.league_id ?? null,
        season_id: stage.season_id ?? null,
        name: stage.name ?? null,
        starting_at: stage.starting_at ?? null,
        ending_at: stage.ending_at ?? null,
        rounds: Array.isArray(stage.rounds)
          ? stage.rounds.map((round) => ({
              id: round.id ?? null,
              name: round.name ?? null,
              fixtures: Array.isArray(round.fixtures)
                ? round.fixtures.map((f) => ({
                    id: f.id ?? null,
                    starting_at: f.starting_at ?? null,
                    participants: Array.isArray(f.participants)
                      ? f.participants.map((p) => {
                          const colors = findSapColors(p.name, colorMap);
                          return {
                            id: p.id ?? null,
                            name: p.name ?? null,
                            short_code: p.short_code ?? null,
                            image_path: p.image_path ?? null,
                            colorPrimary: colors.colorPrimary,
                            colorSecondary: colors.colorSecondary,
                            meta: p.meta
                              ? {
                                  location: p.meta.location ?? null,
                                  winner: p.meta.winner ?? null,
                                  position: p.meta.position ?? null,
                                }
                              : null,
                          };
                        })
                      : [],
                    scores: Array.isArray(f.scores)
                      ? f.scores
                          .filter((s) => s.description === "CURRENT")
                          .map((s) => ({
                            score: s.score
                              ? {
                                  goals: s.score.goals ?? null,
                                  participant: s.score.participant ?? null,
                                }
                              : null,
                          }))
                      : [],
                  }))
                : [],
            }))
          : [],
        aggregates: Array.isArray(stage.aggregates)
          ? stage.aggregates.map((aggregate) => ({
              id: aggregate.id ?? null,
              name: aggregate.name ?? null,
              fixtures: Array.isArray(aggregate.fixtures)
                ? aggregate.fixtures.map((f) => ({
                    id: f.id ?? null,
                    starting_at: f.starting_at ?? null,
                    leg: f.leg ?? null,
                    participants: Array.isArray(f.participants)
                      ? f.participants.map((p) => {
                          const colors = findSapColors(p.name, colorMap);
                          return {
                            id: p.id ?? null,
                            name: p.name ?? null,
                            short_code: p.short_code ?? null,
                            image_path: p.image_path ?? null,
                            colorPrimary: colors.colorPrimary,
                            colorSecondary: colors.colorSecondary,
                            meta: p.meta
                              ? {
                                  location: p.meta.location ?? null,
                                  winner: p.meta.winner ?? null,
                                  position: p.meta.position ?? null,
                                }
                              : null,
                          };
                        })
                      : [],
                    scores: Array.isArray(f.scores)
                      ? f.scores
                          .filter((s) => s.description === "CURRENT")
                          .map((s) => ({
                            score: s.score
                              ? {
                                  goals: s.score.goals ?? null,
                                  participant: s.score.participant ?? null,
                                }
                              : null,
                          }))
                      : [],
                  }))
                : [],
            }))
          : [],
        fixtures: Array.isArray(stage.fixtures)
          ? stage.fixtures.map((f) => ({
              id: f.id ?? null,
              starting_at: f.starting_at ?? null,
              leg: f.leg ?? null,
              participants: Array.isArray(f.participants)
                ? f.participants.map((p) => {
                    const colors = findSapColors(p.name, colorMap);
                    return {
                      id: p.id ?? null,
                      name: p.name ?? null,
                      short_code: p.short_code ?? null,
                      image_path: p.image_path ?? null,
                      colorPrimary: colors.colorPrimary,
                      colorSecondary: colors.colorSecondary,
                      meta: p.meta
                        ? {
                            location: p.meta.location ?? null,
                            winner: p.meta.winner ?? null,
                            position: p.meta.position ?? null,
                          }
                        : null,
                    };
                  })
                : [],
              scores: Array.isArray(f.scores)
                ? f.scores
                    .filter((s) => s.description === "CURRENT")
                    .map((s) => ({
                      score: s.score
                        ? {
                            goals: s.score.goals ?? null,
                            participant: s.score.participant ?? null,
                          }
                        : null,
                    }))
                : [],
            }))
          : [],
      }))
    : [];

  // ── b.txt: squad ──────────────────────────────────────────────────────────
  const squad = Array.isArray(combined.squadData?.data)
    ? combined.squadData.data.map((sq) => ({
        player_id: sq.player_id ?? null,
        start: sq.start ?? null,
        end: sq.end ?? null,
        captain: sq.captain ?? null,
        jersey_number: sq.jersey_number ?? null,
        player: sq.player
          ? {
              firstname: sq.player.firstname ?? null,
              lastname: sq.player.lastname ?? null,
              name: sq.player.name ?? null,
              display_name: sq.player.display_name ?? null,
              image_path: sq.player.image_path ?? null,
              date_of_birth: sq.player.date_of_birth ?? null,
              detailedposition: sq.player.detailedposition?.name ?? null,
              position: sq.player.position?.name ?? null,
              country: sq.player.country
                ? {
                    name: sq.player.country.name ?? null,
                    image_path: sq.player.country.image_path ?? null,
                  }
                : null,
              statistics: Array.isArray(sq.player.statistics)
                ? sq.player.statistics.flatMap((s) =>
                    Array.isArray(s.details)
                      ? s.details.map((d) => ({
                          value: d.value ?? null,
                          type: d.type
                            ? {
                                name: d.type.name ?? null,
                                stat_group: d.type.stat_group ?? null,
                              }
                            : null,
                        }))
                      : [],
                  )
                : [],
            }
          : null,
      }))
    : [];

  // ── c.txt: team info ──────────────────────────────────────────────────────
  const t = combined.teamInfo?.data;
  const teamInfo = t
    ? {
        id: t.id ?? null,
        name: t.name ?? null,
        short_code: t.short_code ?? null,
        image_path: t.image_path ?? null,
        founded: t.founded ?? null,
        last_played_at: t.last_played_at ?? null,
        country: t.country
          ? {
              name: t.country.name ?? null,
              image_path: t.country.image_path ?? null,
            }
          : null,
        coaches: Array.isArray(t.coaches)
          ? t.coaches.map((c) => ({
              coach_id: c.coach_id ?? null,
              active: c.active ?? null,
              start: c.start ?? null,
              end: c.end ?? null,
              coach: c.coach
                ? {
                    firstname: c.coach.firstname ?? null,
                    lastname: c.coach.lastname ?? null,
                    name: c.coach.name ?? null,
                    display_name: c.coach.display_name ?? null,
                    image_path: c.coach.image_path ?? null,
                    date_of_birth: c.coach.date_of_birth ?? null,
                  }
                : null,
            }))
          : [],
        trophies: Array.isArray(t.trophies)
          ? t.trophies
              .filter((tr) => tr.season != null)
              .map((tr) => ({
                trophy: tr.trophy ? { name: tr.trophy.name ?? null } : null,
                season: tr.season ? { name: tr.season.name ?? null } : null,
                league: tr.league
                  ? {
                      id: tr.league.id ?? null,
                      name: tr.league.name ?? null,
                      image_path: tr.league.image_path ?? null,
                      sub_type: tr.league.sub_type ?? null,
                    }
                  : null,
              }))
          : [],
        rivals: Array.isArray(t.rivals)
          ? t.rivals.map((r) => {
              const colors = findSapColors(r.name, colorMap);
              return {
                id: r.id ?? null,
                name: r.name ?? null,
                short_code: r.short_code ?? null,
                image_path: r.image_path ?? null,
                colorPrimary: colors.colorPrimary,
                colorSecondary: colors.colorSecondary,
              };
            })
          : [],
        sidelined: Array.isArray(t.sidelined)
          ? t.sidelined.map((sl) => ({
              player_id: sl.player_id ?? null,
              start_date: sl.start_date ?? null,
              end_date: sl.end_date ?? null,
              games_missed: sl.games_missed ?? null,
              player: sl.player
                ? {
                    firstname: sl.player.firstname ?? null,
                    lastname: sl.player.lastname ?? null,
                    display_name: sl.player.display_name ?? null,
                    image_path: sl.player.image_path ?? null,
                    date_of_birth: sl.player.date_of_birth ?? null,
                    country: sl.player.country
                      ? {
                          name: sl.player.country.name ?? null,
                          image_path: sl.player.country.image_path ?? null,
                        }
                      : null,
                    detailedposition: sl.player.detailedposition?.name ?? null,
                  }
                : null,
              type: sl.type ? { name: sl.type.name ?? null } : null,
            }))
          : [],
        activeseasons: Array.isArray(t.activeseasons)
          ? t.activeseasons.map((as) => ({
              id: as.id ?? null,
              league_id: as.league_id ?? null,
              name: as.name ?? null,
              league: as.league
                ? {
                    name: as.league.name ?? null,
                    image_path: as.league.image_path ?? null,
                    sub_type: as.league.sub_type ?? null,
                  }
                : null,
            }))
          : [],
        venue: t.venue
          ? {
              name: t.venue.name ?? null,
              address: t.venue.address ?? null,
              capacity: t.venue.capacity ?? null,
              image_path: t.venue.image_path ?? null,
              city_name: t.venue.city_name ?? null,
              surface: t.venue.surface ?? null,
            }
          : null,
        rankings: Array.isArray(t.rankings)
          ? t.rankings.map((r) => ({
              position: r.position ?? null,
              points: r.points ?? null,
              type: r.type ?? null,
            }))
          : [],
        statistics: Array.isArray(t.statistics)
          ? t.statistics.map((s) => ({
              season_id: s.season_id ?? null,
              details: Array.isArray(s.details)
                ? s.details.map((d) => ({
                    value: d.value ?? null,
                    type: d.type
                      ? {
                          name: d.type.name ?? null,
                          stat_group: d.type.stat_group ?? null,
                        }
                      : null,
                  }))
                : [],
            }))
          : [],
      }
    : null;

  // ── d.txt: transfers ──────────────────────────────────────────────────────
  const transfers = Array.isArray(combined.transfersData?.data)
    ? combined.transfersData.data.map((tr) => {
        const fromColors = tr.fromteam
          ? findSapColors(tr.fromteam.name, colorMap)
          : { colorPrimary: null, colorSecondary: null };
        const toColors = tr.toteam
          ? findSapColors(tr.toteam.name, colorMap)
          : { colorPrimary: null, colorSecondary: null };
        return {
          player_id: tr.player_id ?? null,
          date: tr.date ?? null,
          amount: tr.amount ?? null,
          fromteam: tr.fromteam
            ? {
                id: tr.fromteam.id ?? null,
                name: tr.fromteam.name ?? null,
                short_code: tr.fromteam.short_code ?? null,
                image_path: tr.fromteam.image_path ?? null,
                colorPrimary: fromColors.colorPrimary,
                colorSecondary: fromColors.colorSecondary,
              }
            : null,
          toteam: tr.toteam
            ? {
                id: tr.toteam.id ?? null,
                name: tr.toteam.name ?? null,
                short_code: tr.toteam.short_code ?? null,
                image_path: tr.toteam.image_path ?? null,
                colorPrimary: toColors.colorPrimary,
                colorSecondary: toColors.colorSecondary,
              }
            : null,
          player: tr.player
            ? {
                firstname: tr.player.firstname ?? null,
                lastname: tr.player.lastname ?? null,
                name: tr.player.name ?? null,
                display_name: tr.player.display_name ?? null,
                image_path: tr.player.image_path ?? null,
              }
            : null,
          type: tr.type ? { name: tr.type.name ?? null } : null,
          detailedposition: tr.detailedposition
            ? { name: tr.detailedposition.name ?? null }
            : null,
        };
      })
    : [];

  return { teamInfo, schedule, squad, transfers };
}

// GET /football/team/:teamId
// Phase 1: schedule (also yields the active season ID for downstream filters).
// Phase 2: team info (with stats filter) + squad + transfers — all in parallel.
app.get("/football/team/:teamId", async (req, res) => {
  const teamId = req.params.teamId;
  const cacheKey = `team:${teamId}`;

  if (cacheValid(cacheKey, TTL_1H)) {
    setCacheControl(res, TTL_1H);
    return res.json({
      source: "cache",
      data: transformTeamResponse(cache.get(cacheKey).data),
    });
  }

  try {
    // Phase 1: schedule — season_id embedded in each stage
    const scheduleData = await fetchUrl(
      `${SM_BASE}/schedules/teams/${teamId}?api_token=${SM_TOKEN}&timezone=America/Toronto`,
    );

    const activeSeasonId = scheduleData?.data?.[0]?.season_id ?? null;
    const statsFilter = activeSeasonId
      ? `&filters=teamstatisticSeasons:${activeSeasonId}`
      : "";
    const squadFilter = activeSeasonId
      ? `&filters=playerstatisticSeasons:${activeSeasonId}`
      : "";

    // Phase 2: team info (with season stats filter) + squad + transfers in parallel
    const [teamInfo, squadData, transfersData] = await Promise.all([
      fetchUrl(
        `${SM_BASE}/teams/${teamId}?api_token=${SM_TOKEN}` +
          `&include=rankings;country;coaches.coach;trophies.trophy;trophies.season;trophies.league;rivals;sidelined.player.country;sidelined.type;activeSeasons.league;venue;statistics.details.type` +
          statsFilter,
      ),
      fetchUrl(
        `${SM_BASE}/squads/teams/${teamId}?api_token=${SM_TOKEN}` +
          `&include=player.country;player.statistics.details.type;player.detailedPosition;player.position` +
          squadFilter,
      ),
      fetchUrl(
        `${SM_BASE}/transfers/teams/${teamId}?api_token=${SM_TOKEN}` +
          `&include=fromteam;toteam;player;type;detailedPosition&per_page=50`,
      ),
    ]);

    const combined = { teamInfo, scheduleData, squadData, transfersData };
    cacheSet(cacheKey, combined);

    setCacheControl(res, TTL_1H);
    res.json({ source: "origin", data: transformTeamResponse(combined) });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch team data", details: err.message });
  }
});

// Transforms raw SM player response into a slimmed structure with SAP colors on every team.
function transformPlayerResponse(raw) {
  const p = raw?.data;
  if (!p) return null;
  const colorMap = buildSapColorMap();

  // Slim a team sub-object, keeping only the requested fields, and append SAP colors.
  function slimTeam(t, fields) {
    if (!t) return null;
    const colors = findSapColors(t.name, colorMap);
    const out = {};
    for (const f of fields) out[f] = t[f] ?? null;
    out.colorPrimary = colors.colorPrimary;
    out.colorSecondary = colors.colorSecondary;
    return out;
  }

  return {
    id: p.id ?? null,
    firstname: p.firstname ?? null,
    lastname: p.lastname ?? null,
    name: p.name ?? null,
    display_name: p.display_name ?? null,
    image_path: p.image_path ?? null,
    height: p.height ?? null,
    weight: p.weight ?? null,
    date_of_birth: p.date_of_birth ?? null,
    country: p.country
      ? {
          name: p.country.name ?? null,
          image_path: p.country.image_path ?? null,
        }
      : null,
    teams: Array.isArray(p.teams)
      ? p.teams.map((t) => ({
          id: t.id ?? null,
          start: t.start ?? null,
          end: t.end ?? null,
          jersey_number: t.jersey_number ?? null,
          team: slimTeam(t.team, [
            "id",
            "name",
            "short_code",
            "image_path",
            "type",
          ]),
        }))
      : [],
    detailedposition: p.detailedposition
      ? { name: p.detailedposition.name ?? null }
      : null,
    metadata: Array.isArray(p.metadata)
      ? p.metadata.map((m) => ({
          values: m.values ?? null,
          type: m.type ? { name: m.type.name ?? null } : null,
        }))
      : [],
    trophies: Array.isArray(p.trophies)
      ? p.trophies
          .filter((t) => t.season != null)
          .map((t) => ({
            trophy: t.trophy ? { name: t.trophy.name ?? null } : null,
            season: t.season ? { name: t.season.name ?? null } : null,
            league: t.league
              ? {
                  id: t.league.id ?? null,
                  name: t.league.name ?? null,
                  image_path: t.league.image_path ?? null,
                }
              : null,
            team: slimTeam(t.team, ["id", "name", "image_path"]),
            teamCountry: t.team?.country
              ? {
                  name: t.team.country.name ?? null,
                }
              : null,
          }))
      : [],
    statistics: Array.isArray(p.statistics)
      ? p.statistics.map((s) => ({
          team_id: s.team_id ?? null,
          season_id: s.season_id ?? null,
          jersey_number: s.jersey_number ?? null,
          details: Array.isArray(s.details)
            ? s.details.map((d) => ({
                value: d.value ?? null,
                type: d.type ? { name: d.type.name ?? null } : null,
              }))
            : [],
          team: slimTeam(s.team, ["id", "name", "image_path"]),
          season: s.season
            ? {
                name: s.season.name ?? null,
                league: s.season.league
                  ? {
                      id: s.season.league.id ?? null,
                      name: s.season.league.name ?? null,
                      sub_type: s.season.league.sub_type ?? null,
                      image_path: s.season.league.image_path ?? null,
                    }
                  : null,
              }
            : null,
        }))
      : [],
    latest: Array.isArray(p.latest)
      ? p.latest
          .filter((l) => l.fixture != null)
          .map((l) => ({
            fixture_id: l.fixture_id ?? null,
            fixture: {
              id: l.fixture_id ?? null,
              starting_at: l.fixture.starting_at ?? null,
              result_info: l.fixture.result_info ?? null,
              participants: Array.isArray(l.fixture.participants)
                ? l.fixture.participants.map((pt) => {
                    const colors = findSapColors(pt.name, colorMap);
                    return {
                      id: pt.id ?? null,
                      name: pt.name ?? null,
                      image_path: pt.image_path ?? null,
                      colorPrimary: colors.colorPrimary,
                      colorSecondary: colors.colorSecondary,
                      meta: pt.meta
                        ? {
                            location: pt.meta.location ?? null,
                            winner: pt.meta.winner ?? null,
                          }
                        : null,
                    };
                  })
                : [],
              league: l.fixture.league
                ? { name: l.fixture.league.name ?? null }
                : null,
              details: Array.isArray(l.details)
                ? l.details.map((d) => ({
                    data: d.data ?? null,
                    type: d.type ? { name: d.type.name ?? null } : null,
                  }))
                : [],
            },
          }))
      : [],
    transfers: Array.isArray(p.transfers)
      ? p.transfers.map((t) => ({
          date: t.date ?? null,
          amount: t.amount ?? null,
          fromteam: slimTeam(t.fromteam, [
            "id",
            "name",
            "short_code",
            "image_path",
          ]),
          toteam: slimTeam(t.toteam, [
            "id",
            "name",
            "short_code",
            "image_path",
          ]),
          type: t.type ? { name: t.type.name ?? null } : null,
        }))
      : [],
  };
}

// GET /football/player/:playerId
app.get("/football/player/:playerId", async (req, res) => {
  const playerId = req.params.playerId;
  const cacheKey = `player:${playerId}`;

  if (cacheValid(cacheKey, TTL_1H)) {
    setCacheControl(res, TTL_1H);
    return res.json({
      source: "cache",
      data: transformPlayerResponse(cache.get(cacheKey).data),
    });
  }

  try {
    const data = await fetchUrl(
      `${SM_BASE}/players/${playerId}?api_token=${SM_TOKEN}` +
        `&include=country;teams.team;detailedPosition;metadata.type;trophies.trophy;trophies.season;trophies.league;trophies.team.country;statistics.details.type;statistics.team;statistics.season.league;latest.fixture.participants;latest.fixture.league;latest.details.type;transfers.type;transfers.fromTeam;transfers.toTeam&timezone=America/Toronto`,
    );

    cacheSet(cacheKey, data);
    setCacheControl(res, TTL_1H);
    res.json({ source: "origin", data: transformPlayerResponse(data) });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch player data", details: err.message });
  }
});

// Transforms raw SM coach response per a.txt spec.
function transformCoachResponse(raw) {
  const d = raw?.data;
  if (!d) return null;
  const colorMap = buildSapColorMap();

  return {
    id: d.id ?? null,
    firstname: d.firstname ?? null,
    lastname: d.lastname ?? null,
    name: d.name ?? null,
    display_name: d.display_name ?? null,
    image_path: d.image_path ?? null,
    date_of_birth: d.date_of_birth ?? null,
    country: d.country
      ? {
          name: d.country.name ?? null,
          image_path: d.country.image_path ?? null,
        }
      : null,
    statistics: Array.isArray(d.statistics)
      ? d.statistics.map((s) => ({
          team_id: s.team_id ?? null,
          season_id: s.season_id ?? null,
          season: s.season
            ? {
                name: s.season.name ?? null,
                league: s.season.league
                  ? {
                      id: s.season.league.id ?? null,
                      name: s.season.league.name ?? null,
                      image_path: s.season.league.image_path ?? null,
                    }
                  : null,
                details: Array.isArray(s.details)
                  ? s.details.map((det) => ({
                      value: det.value ?? null,
                      type: det.type
                        ? {
                            name: det.type.name ?? null,
                            stat_group: det.type.stat_group ?? null,
                          }
                        : null,
                    }))
                  : [],
              }
            : null,
        }))
      : [],
    trophies: Array.isArray(d.trophies)
      ? d.trophies
          .filter((tr) => tr.season != null)
          .map((tr) => ({
            trophy: tr.trophy ? { name: tr.trophy.name ?? null } : null,
            season: tr.season ? { name: tr.season.name ?? null } : null,
            league: tr.league
              ? {
                  id: tr.league.id ?? null,
                  name: tr.league.name ?? null,
                  image_path: tr.league.image_path ?? null,
                  sub_type: tr.league.sub_type ?? null,
                }
              : null,
          }))
      : [],
    teams: Array.isArray(d.teams)
      ? d.teams.map((t) => {
          const colors = t.team
            ? findSapColors(t.team.name, colorMap)
            : { colorPrimary: null, colorSecondary: null };
          return {
            team_id: t.team_id ?? null,
            start: t.start ?? null,
            end: t.end ?? null,
            team: t.team
              ? {
                  name: t.team.name ?? null,
                  short_code: t.team.short_code ?? null,
                  image_path: t.team.image_path ?? null,
                  colorPrimary: colors.colorPrimary,
                  colorSecondary: colors.colorSecondary,
                }
              : null,
          };
        })
      : [],
  };
}

// GET /football/coach/:coachId
app.get("/football/coach/:coachId", async (req, res) => {
  const coachId = req.params.coachId;
  const cacheKey = `coach:${coachId}`;

  if (cacheValid(cacheKey, TTL_1H)) {
    setCacheControl(res, TTL_1H);
    return res.json({
      source: "cache",
      data: transformCoachResponse(cache.get(cacheKey).data),
    });
  }

  try {
    const data = await fetchUrl(
      `${SM_BASE}/coaches/${coachId}?api_token=${SM_TOKEN}` +
        `&include=country;statistics.season.league;statistics.details.type;trophies.trophy;trophies.season;trophies.league;teams.team`,
    );

    cacheSet(cacheKey, data);
    setCacheControl(res, TTL_1H);
    res.json({ source: "origin", data: transformCoachResponse(data) });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch coach data", details: err.message });
  }
});

// Transforms raw SM referee response per b.txt spec.
function transformRefereeResponse(raw) {
  const d = raw?.data;
  if (!d) return null;

  return {
    id: d.id ?? null,
    firstname: d.firstname ?? null,
    lastname: d.lastname ?? null,
    name: d.name ?? null,
    display_name: d.display_name ?? null,
    image_path: d.image_path ?? null,
    country: d.country
      ? {
          name: d.country.name ?? null,
          image_path: d.country.image_path ?? null,
        }
      : null,
    statistics: Array.isArray(d.statistics)
      ? d.statistics.map((s) => ({
          season_id: s.season_id ?? null,
          season: s.season
            ? {
                name: s.season.name ?? null,
                league: s.season.league
                  ? {
                      id: s.season.league.id ?? null,
                      name: s.season.league.name ?? null,
                      image_path: s.season.league.image_path ?? null,
                    }
                  : null,
              }
            : null,
          details: Array.isArray(s.details)
            ? s.details.map((det) => ({
                value: det.value ?? null,
                type: det.type
                  ? {
                      name: det.type.name ?? null,
                      stat_group: det.type.stat_group ?? null,
                    }
                  : null,
              }))
            : [],
        }))
      : [],
  };
}

// GET /football/referee/:refereeId
app.get("/football/referee/:refereeId", async (req, res) => {
  const refereeId = req.params.refereeId;
  const cacheKey = `referee:${refereeId}`;

  if (cacheValid(cacheKey, TTL_1H)) {
    setCacheControl(res, TTL_1H);
    return res.json({
      source: "cache",
      data: transformRefereeResponse(cache.get(cacheKey).data),
    });
  }

  try {
    const data = await fetchUrl(
      `${SM_BASE}/referees/${refereeId}?api_token=${SM_TOKEN}` +
        `&include=country;statistics.season.league;statistics.details.type`,
    );

    cacheSet(cacheKey, data);
    setCacheControl(res, TTL_1H);
    res.json({ source: "origin", data: transformRefereeResponse(data) });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch referee data", details: err.message });
  }
});

// Builds a lookup map from the SAP standings cache: lowercased name -> colors.
// Both `name` and `longName` are indexed so either can match.
function buildSapColorMap() {
  const map = new Map();

  const indexName = (rawName, colors) => {
    if (!rawName) return;

    const rawLower = String(rawName).toLowerCase().trim();
    const normalized = normalizeName(rawName);

    if (rawLower) map.set(rawLower, colors);
    if (normalized) map.set(normalized, colors);

    const mappedSportMonksName = SAP_TO_SM_TEAM_NAME_MAP[normalized];
    if (mappedSportMonksName) {
      const mappedLower = String(mappedSportMonksName).toLowerCase().trim();
      const mappedNormalized = normalizeName(mappedSportMonksName);
      if (mappedLower) map.set(mappedLower, colors);
      if (mappedNormalized) map.set(mappedNormalized, colors);
    }
  };

  for (const compId of SAP_COMPETITION_IDS) {
    const entry = cache.get(`sap:standings:${compId}`);
    if (!entry?.data?.standings) continue;
    for (const stage of entry.data.standings) {
      if (!Array.isArray(stage.rows)) continue;
      for (const row of stage.rows) {
        const c = row.competitor;
        if (!c) continue;
        const colors = {
          colorPrimary: c.color ?? null,
          colorSecondary: c.awayColor ?? null,
        };
        indexName(c.name, colors);
        indexName(c.longName, colors);
      }
    }
  }
  return map;
}

// Strip common football suffixes so "Celtic FC" matches "Celtic", etc.
function normalizeName(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(
      /\b(fc|if|fk|ac|sk|sc|bk|cf|afc|rfc|utd|united|city|town|hotspur)\b/g,
      "",
    )
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Returns { colorPrimary, colorSecondary } for a participant name, trying
// progressively looser matching against the SAP color map.
function findSapColors(name, colorMap) {
  const empty = { colorPrimary: null, colorSecondary: null };
  if (!name || colorMap.size === 0) return empty;

  const lower = name.toLowerCase();
  const norm = normalizeName(name);

  // 1. Exact match
  if (colorMap.has(lower)) return colorMap.get(lower);

  // 1b. Normalized key match
  if (colorMap.has(norm)) return colorMap.get(norm);

  // 2. Normalized exact match
  for (const [key, colors] of colorMap) {
    if (normalizeName(key) === norm) return colors;
  }

  // 3. One raw string contains the other
  for (const [key, colors] of colorMap) {
    if (key.includes(lower) || lower.includes(key)) return colors;
  }

  // 4. One normalized string contains the other (must be ≥ 4 chars to avoid noise)
  if (norm.length >= 4) {
    for (const [key, colors] of colorMap) {
      const kn = normalizeName(key);
      if (kn.length >= 4 && (kn.includes(norm) || norm.includes(kn)))
        return colors;
    }
  }

  return empty;
}

// Transforms raw SM fixture-date response into a league-grouped structure.
// Raw data is kept in cache untouched so TTL helpers can still read state fields.
function transformFixtureDateResponse(raw) {
  const fixtures = Array.isArray(raw?.data) ? raw.data : [];
  const colorMap = buildSapColorMap();
  const leagueMap = new Map(); // leagueId -> { league meta + matches[] }

  for (const f of fixtures) {
    const leagueId = f.league_id;

    // Bootstrap league entry on first encounter
    if (!leagueMap.has(leagueId)) {
      const lg = f.league ?? {};
      leagueMap.set(leagueId, {
        id: lg.id ?? leagueId,
        name: lg.name ?? null,
        image_path: lg.image_path ?? null,
        country: lg.country
          ? {
              name: lg.country.name ?? null,
              image_path: lg.country.image_path ?? null,
            }
          : null,
        matches: [],
      });
    }

    const periods = Array.isArray(f.periods)
      ? f.periods.map((p) => ({
          id: p.id ?? null,
          ended: p.ended ?? null,
          ticking: p.ticking ?? null,
          description: p.description ?? null,
          time_added: p.time_added ?? null,
          minutes: p.minutes ?? null,
          seconds: p.seconds ?? null,
        }))
      : [];

    // Slim participants, enriched with SAP colors
    const participants = Array.isArray(f.participants)
      ? f.participants.map((p) => {
          const colors = findSapColors(p.name, colorMap);
          return {
            id: p.id,
            name: p.name ?? null,
            short_code: p.short_code ?? null,
            image_path: p.image_path ?? null,
            colorPrimary: colors.colorPrimary,
            colorSecondary: colors.colorSecondary,
            meta: p.meta
              ? {
                  location: p.meta.location ?? null,
                  position: p.meta.position ?? null,
                  winner: p.meta.winner ?? null,
                }
              : null,
          };
        })
      : [];

    // Only CURRENT score entries, return just the inner score object
    const scores = Array.isArray(f.scores)
      ? f.scores
          .filter((s) => s.description === "CURRENT")
          .map((s) => s.score ?? null)
          .filter(Boolean)
      : [];

    leagueMap.get(leagueId).matches.push({
      id: f.id,
      league_id: f.league_id,
      season_id: f.season_id,
      stage_id: f.stage_id,
      starting_at: f.starting_at ?? null,
      leg: f.leg ?? null,
      aggregate: f.aggregate
        ? {
            name: f.aggregate.name ?? null,
            result: f.aggregate.result ?? null,
          }
        : null,
      state: f.state
        ? {
            state: f.state.state ?? null,
            name: f.state.name ?? null,
            short_name: f.state.short_name ?? null,
          }
        : null,
      periods,
      participants,
      scores,
      venue: f.venue ? { name: f.venue.name ?? null } : null,
    });
  }

  // Convert map to array; preserve insertion order (matches API response order)
  const leagues = {};
  for (const [id, data] of leagueMap) {
    leagues[id] = data;
  }
  return leagues;
}

// GET /football/fixture/:date  (date = YYYYMMDD)
// Uses smart caching by game states/start times, and polls every 20 s while
// any game is live and requests are active.
app.get("/football/fixture/:date", async (req, res) => {
  const raw = req.params.date;
  if (!/^\d{8}$/.test(raw)) {
    return res.status(400).json({ error: "Date must be in YYYYMMDD format" });
  }

  const isoDate = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  const cacheKey = `fixture:date:${raw}`;
  const url =
    `${SM_BASE}/fixtures/date/${isoDate}?api_token=${SM_TOKEN}` +
    `&per_page=50&include=aggregate;state;periods;participants;scores;venue;league.country&timezone=America/Toronto`;

  // Serve from cache if still valid under the dynamic TTL
  const entry = cache.get(cacheKey);
  if (entry) {
    const { ttl } = fixtureDateTtlInfo(entry.data?.data);
    if (Date.now() - entry.fetchedAt < ttl) {
      ensureFixtureDatePolling(cacheKey, url, entry.data);
      setCacheControl(res, ttl);
      return res.json({
        source: "cache",
        data: transformFixtureDateResponse(entry.data),
      });
    }
  }

  try {
    const data = await fetchAndCache(cacheKey, url);
    const { ttl } = fixtureDateTtlInfo(data?.data);

    ensureFixtureDatePolling(cacheKey, url, data);

    setCacheControl(res, ttl);
    res.json({ source: "origin", data: transformFixtureDateResponse(data) });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch fixtures", details: err.message });
  }
});

// Transforms a single raw SM fixture (from /fixtures/:id) per a.txt spec.
function transformFixtureGameResponse(raw) {
  const f = raw?.data;
  if (!f) return null;
  const colorMap = buildSapColorMap();

  const participants = Array.isArray(f.participants)
    ? f.participants.map((p) => {
        const colors = findSapColors(p.name, colorMap);
        return {
          id: p.id ?? null,
          name: p.name ?? null,
          short_code: p.short_code ?? null,
          image_path: p.image_path ?? null,
          colorPrimary: colors.colorPrimary,
          colorSecondary: colors.colorSecondary,
          meta: p.meta
            ? {
                location: p.meta.location ?? null,
                winner: p.meta.winner ?? null,
                position: p.meta.position ?? null,
              }
            : null,
        };
      })
    : [];

  const periods = Array.isArray(f.periods)
    ? f.periods.map((p) => ({
        id: p.id ?? null,
        ended: p.ended ?? null,
        ticking: p.ticking ?? null,
        description: p.description ?? null,
        time_added: p.time_added ?? null,
        minutes: p.minutes ?? null,
        seconds: p.seconds ?? null,
      }))
    : [];

  const scores = Array.isArray(f.scores)
    ? f.scores.map((s) => ({
        score: s.score
          ? {
              goals: s.score.goals ?? null,
              participant: s.score.participant ?? null,
            }
          : null,
        description: s.description ?? null,
      }))
    : [];

  const league = f.league
    ? {
        id: f.league.id ?? null,
        name: f.league.name ?? null,
        image_path: f.league.image_path ?? null,
        country: f.league.country
          ? {
              name: f.league.country.name ?? null,
              image_path: f.league.country.image_path ?? null,
            }
          : null,
      }
    : null;

  const comments = Array.isArray(f.comments)
    ? f.comments.map((c) => ({
        comment: c.comment ?? null,
        minute: c.minute ?? null,
        extra_minute: c.extra_minute ?? null,
        is_goal: c.is_goal ?? null,
        is_important: c.is_important ?? null,
        order: c.order ?? null,
      }))
    : [];

  const formations = Array.isArray(f.formations)
    ? f.formations.map((fm) => ({
        participant_id: fm.participant_id ?? null,
        formation: fm.formation ?? null,
        location: fm.location ?? null,
      }))
    : [];

  const venue = f.venue
    ? {
        name: f.venue.name ?? null,
        capacity: f.venue.capacity ?? null,
        image_path: f.venue.image_path ?? null,
        city_name: f.venue.city_name ?? null,
        surface: f.venue.surface ?? null,
      }
    : null;

  const wr = f.weatherreport;
  const weatherreport = wr
    ? {
        temperature: wr.temperature
          ? { day: wr.temperature.day ?? null }
          : null,
        feelslike: wr.feels_like ? { day: wr.feels_like.day ?? null } : null,
        wind: wr.wind
          ? {
              speed: wr.wind.speed ?? null,
              direction: wr.wind.direction ?? null,
            }
          : null,
        humidity: wr.humidity ?? null,
        pressure: wr.pressure ?? null,
        clouds: wr.clouds ?? null,
        description: wr.description ?? null,
      }
    : null;

  const events = Array.isArray(f.events)
    ? f.events.map((e) => ({
        period_id: e.period_id ?? null,
        participant_id: e.participant_id ?? null,
        player_id: e.player_id ?? null,
        related_player_id: e.related_player_id ?? null,
        player_name: e.player_name ?? null,
        related_player_name: e.related_player_name ?? null,
        result: e.result ?? null,
        info: e.info ?? null,
        addition: e.addition ?? null,
        minute: e.minute ?? null,
        extra_minute: e.extra_minute ?? null,
        injured: e.injured ?? null,
        rescinded: e.rescinded ?? null,
      }))
    : [];

  const statistics = Array.isArray(f.statistics)
    ? f.statistics.map((s) => ({
        participant_id: s.participant_id ?? null,
        data: s.data ? { value: s.data.value ?? null } : null,
        location: s.location ?? null,
        type: s.type
          ? { name: s.type.name ?? null, stat_group: s.type.stat_group ?? null }
          : null,
      }))
    : [];

  const sidelined = Array.isArray(f.sidelined)
    ? f.sidelined.map((sl) => ({
        participant_id: sl.participant_id ?? null,
        player_id: sl.player_id ?? null,
        player: sl.player
          ? {
              firstname: sl.player.firstname ?? null,
              lastname: sl.player.lastname ?? null,
              name: sl.player.name ?? null,
              display_name: sl.player.display_name ?? null,
              image_path: sl.player.image_path ?? null,
            }
          : null,
        type: sl.type ? { name: sl.type.name ?? null } : null,
        sideline: sl.sideline ?? null,
      }))
    : [];

  const lineups = Array.isArray(f.lineups)
    ? f.lineups.map((l) => ({
        player_id: l.player_id ?? null,
        team_id: l.team_id ?? null,
        formation_field: l.formation_field ?? null,
        jersey_number: l.jersey_number ?? null,
        player: l.player
          ? {
              firstname: l.player.firstname ?? null,
              lastname: l.player.lastname ?? null,
              name: l.player.name ?? null,
              display_name: l.player.display_name ?? null,
              image_path: l.player.image_path ?? null,
              height: l.player.height ?? null,
              weight: l.player.weight ?? null,
              date_of_birth: l.player.date_of_birth ?? null,
            }
          : null,
        type: l.type ? { name: l.type.name ?? null } : null,
        position: l.position ? { name: l.position.name ?? null } : null,
        detailedposition: l.detailedposition
          ? { name: l.detailedposition.name ?? null }
          : null,
        details: Array.isArray(l.details)
          ? l.details.map((d) => ({
              data: d.data ? { value: d.data.value ?? null } : null,
              type: d.type
                ? {
                    name: d.type.name ?? null,
                    stat_group: d.type.stat_group ?? null,
                  }
                : null,
            }))
          : [],
      }))
    : [];

  const coaches = Array.isArray(f.coaches)
    ? f.coaches.map((c) => ({
        id: c.id ?? null,
        firstname: c.firstname ?? null,
        lastname: c.lastname ?? null,
        name: c.name ?? null,
        display_name: c.display_name ?? null,
        image_path: c.image_path ?? null,
        meta: c.meta
          ? {
              participant_id: c.meta.participant_id ?? null,
            }
          : null,
      }))
    : [];

  const referees = Array.isArray(f.referees)
    ? f.referees.map((r) => ({
        referee_id: r.referee_id ?? null,
        referee: r.referee
          ? {
              firstname: r.referee.firstname ?? null,
              lastname: r.referee.lastname ?? null,
              name: r.referee.name ?? null,
              display_name: r.referee.display_name ?? null,
              image_path: r.referee.image_path ?? null,
            }
          : null,
      }))
    : [];

  const ballcoordinates = Array.isArray(f.ballcoordinates)
    ? f.ballcoordinates.map((b) => ({
        id: b.id ?? null,
        period_id: b.period_id ?? null,
        timer: b.timer ?? null,
        x: b.x ?? null,
        y: b.y ?? null,
      }))
    : [];

  return {
    id: f.id ?? null,
    league_id: f.league_id ?? null,
    starting_at: f.starting_at ?? null,
    state: f.state
      ? {
          state: f.state.state ?? null,
          name: f.state.name ?? null,
          short_name: f.state.short_name ?? null,
        }
      : null,
    aggregate: f.aggregate
      ? { name: f.aggregate.name ?? null, result: f.aggregate.result ?? null }
      : null,
    round: f.round ? { name: f.round.name ?? null } : null,
    participants,
    periods,
    scores,
    league,
    comments,
    formations,
    venue,
    weatherreport,
    events,
    statistics,
    sidelined,
    lineups,
    coaches,
    referees,
    ballcoordinates,
  };
}

// Transforms raw SM head-to-head response per b.txt spec.
function transformH2hResponse(raw) {
  const fixtures = Array.isArray(raw?.data) ? raw.data : [];
  const colorMap = buildSapColorMap();

  return fixtures.map((f) => {
    const participants = Array.isArray(f.participants)
      ? f.participants.map((p) => {
          const colors = findSapColors(p.name, colorMap);
          return {
            id: p.id ?? null,
            name: p.name ?? null,
            short_code: p.short_code ?? null,
            image_path: p.image_path ?? null,
            colorPrimary: colors.colorPrimary,
            colorSecondary: colors.colorSecondary,
            meta: p.meta
              ? {
                  location: p.meta.location ?? null,
                  winner: p.meta.winner ?? null,
                  position: p.meta.position ?? null,
                }
              : null,
          };
        })
      : [];

    const scores = Array.isArray(f.scores)
      ? f.scores
          .filter((s) => s.description === "CURRENT")
          .map((s) => ({
            score: s.score
              ? {
                  goals: s.score.goals ?? null,
                  participant: s.score.participant ?? null,
                }
              : null,
          }))
      : [];

    return {
      id: f.id ?? null,
      starting_at: f.starting_at ?? null,
      league: f.league
        ? {
            name: f.league.name ?? null,
          }
        : null,
      season: f.season
        ? {
            name: f.season.name ?? null,
          }
        : null,
      participants,
      scores,
      venue: f.venue ? { name: f.venue.name ?? null } : null,
    };
  });
}

// Transforms raw SM match-facts response per 2.txt spec.
// Only include objects where natural_language is not null.
const MATCH_FACT_TYPE_NAME_MAP = Object.freeze({
  76115: "Total H2H Matches",
  76116: "Match Facts First to score wins streak",
  76085: "Match Facts Historic outcomes",
  76088: "Match Facts Win",
  76089: "Match Facts Loss",
  76090: "Match Facts Cleansheet",
  76091: "Match Facts Goals Conceded",
  76092: "Match Facts First to Score",
  76093: "Match Facts Last Win Information",
  76094: "Match Facts Win streak",
  76095: "Match Facts Loss streak",
  76096: "Match Facts Draw streak",
  76097: "Match Facts Unbeaten Streak",
  76098: "Match Facts Winless streak",
  76099: "Match Facts Was First to score Streak",
  76100: "Match Facts Was Not First to Score Streak",
  76101: "Match Facts Expected Goals on Target",
  76102: "Match Facts Goal timings",
  76103: "Match Facts Goal Line Streak",
  76104: "Match Facts Most Recent Match",
  76105: "Match Facts Draw",
  76106: "Match Facts Goal",
  76107: "Match Facts Corners",
  76108: "Match Facts Redcard",
  76109: "Match Facts Yellowcards",
  76110: "Match Facts Yellowred Cards",
  76114: "Match Fact Expected Goals",
  81170: "Match Fact Missing Key Players",
  81171: "Match Fact No Early Goal Streak",
  81172: "Match Fact No Late Goal Streak",
  81173: "Match Fact Rating",
  81174: "Match Fact Team Fatigue",
  81175: "Match Fact BTTS Streak",
  81177: "Match Fact Cards Count",
  81178: "Match Fact Cards Streak",
  81179: "Match Fact Cards Streak in Match",
  81180: "Match Fact Early Goal Streak",
  87860: "Match Fact Last 5 Win",
  87862: "Match Fact Last 5 Loss",
  87863: "Match Fact Last 5 Cleansheet",
  87864: "Match Fact Last 5 Goals",
  87865: "Match Fact Last 5 Goals Conceded",
  87866: "Match Fact Last 5 Corners",
  87867: "Match Fact Last 5 Redcards",
  87868: "Match Fact Last 5 Yellowcards",
  87869: "Match Fact Last 5 Yellow-red cards",
  87870: "Match Fact Last 5 shots total",
  87871: "Match Fact Last 5 Shots on Target",
  87872: "Match Fact Last 5 First to Score",
  87873: "Match Fact Last 10 Win",
  87874: "Match Fact Last 10 Draw",
  87875: "Match Fact Last 10 Loss",
  87876: "Match Fact Last 10 Cleansheet",
  87877: "Match Fact Last 10 Goals",
  87878: "Match Fact Last 10 Goals Conceded",
  87879: "Match Fact Last 10 Corners",
  87880: "Match Fact Last 10 Redcards",
  87881: "Match Fact Last 10 Yellowcards",
  87882: "Match Fact Last 10 Yellowred Cards",
  87883: "Match Fact Last 10 Shots Total",
  87884: "Match Fact Last 10 Shots on Target",
  87885: "Match Fact Last 10 First to Score",
  87886: "Match Fact Last 15 Win",
  87887: "Match Fact Last 15 Draw",
  87888: "Match Fact Last 15 Loss",
  87889: "Match Fact Last 15 Cleansheet",
  87890: "Match Fact Last 15 Goals",
  87891: "Match Fact Last 15 Goals Conceded",
  87892: "Match Fact Last 15 Corners",
  87893: "Match Fact Last 15 Redcards",
  87894: "Match Fact Last 15 Yellowcards",
  87895: "Match Fact Last 15 Yellowred Cards",
  87896: "Match Fact Last 15 Shots Total",
  87897: "Match Fact Last 15 Shots on Target",
  87898: "Match Fact Last 15 First to Score",
  87899: "Match Fact Last 25 Win",
  87900: "Match Fact Last 25 Draw",
  87901: "Match Fact Last 25 Loss",
  87902: "Match Fact Last 25 Cleansheet",
  87903: "Match Fact Last 25 Goals",
  87904: "Match Fact Last 25 Goals Conceded",
  87905: "Match Fact Last 25 Corners",
  87906: "Match Fact Last 25 Redcards",
  87907: "Match Fact Last 25 Yellowcards",
  87908: "Match Fact Last 25 Yellowred Cards",
  87909: "Match Fact Last 25 Shots Total",
  87910: "Match Fact Last 25 Shots on Target",
  87911: "Match Fact Last 25 First to Score",
  87912: "Match Fact Last 5 Goal Line",
  87913: "Match Fact Last 5 btts",
  87914: "Match Fact Last 5 Winning Margin",
  87915: "Match Fact Last 10 Goal Line",
  87916: "Match Fact Last 10 Btts",
  87917: "Match Fact Last 10 Winning Margin",
  87918: "Match Fact Last 15 Goal Line",
  87919: "Match Fact Last 15 Btts",
  87920: "Match Fact Last 15 Winning Margin",
  87921: "Match Fact Last 25 Goal Line",
  87922: "Match Fact Last 25 Btts",
  87923: "Match Fact Last 25 Winning Margin",
  87925: "Match Fact Last 10 Cards Count",
  87928: "Match Fact Last 5 Goal Timings",
  87929: "Match Fact Last 10 Goal Timings",
  87930: "Match Fact Last 15 Goal Timings",
  87931: "Match Fact Last 25 Goal Timings",
  87932: "Match Fact Last 10 Cards Count in Match",
  76086: "Match Facts Outcomes by goals",
  76087: "Match Facts Outcomes by Players Sent Off Field",
  81181: "Match Fact Late Goal Streak",
});

function transformMatchFactsResponse(raw) {
  const rows = Array.isArray(raw?.data) ? raw.data : [];

  return rows
    .filter((item) => item?.natural_language != null)
    .map((item) => ({
      type_id: item.type_id ?? null,
      name:
        MATCH_FACT_TYPE_NAME_MAP[item?.type_id] ??
        (item?.type_id != null ? String(item.type_id) : null),
      team: item.team ?? null,
      category: item.category ?? null,
      data: item.data ?? null,
      natural_language: item.natural_language ?? null,
    }));
}

// GET /football/game/h2h/:team1/:team2
// Fetches head-to-head history and caches for 12 h.
app.get("/football/game/h2h/:team1/:team2", async (req, res) => {
  const { team1, team2 } = req.params;
  const h2hCacheKey = `h2h:${team1}:${team2}`;

  const h2hUrl =
    `${SM_BASE}/fixtures/head-to-head/${team1}/${team2}?api_token=${SM_TOKEN}` +
    `&include=league;participants;scores;venue`;

  if (cacheValid(h2hCacheKey, TTL_12H)) {
    setCacheControl(res, TTL_12H);
    return res.json({
      source: "cache",
      data: {
        h2hData: transformH2hResponse(cache.get(h2hCacheKey).data),
      },
    });
  }

  try {
    const freshH2h = await fetchUrl(h2hUrl);
    cacheSet(h2hCacheKey, freshH2h);

    setCacheControl(res, TTL_12H);
    res.json({
      source: "origin",
      data: {
        h2hData: transformH2hResponse(freshH2h),
      },
    });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch H2H data", details: err.message });
  }
});

// GET /football/game/facts/:fixtureId
// Fetches match facts and caches for 12 h.
app.get("/football/game/facts/:fixtureId", async (req, res) => {
  const { fixtureId } = req.params;
  const matchFactsCacheKey = `matchfacts:${fixtureId}`;

  const matchFactsUrl =
    `${SM_BASE}/match-facts/${fixtureId}?api_token=${SM_TOKEN}` +
    `&filters=populate`;

  if (cacheValid(matchFactsCacheKey, TTL_12H)) {
    setCacheControl(res, TTL_12H);
    return res.json({
      source: "cache",
      data: {
        matchFacts: transformMatchFactsResponse(
          cache.get(matchFactsCacheKey).data,
        ),
      },
    });
  }

  try {
    const freshMatchFacts = await fetchUrl(matchFactsUrl);
    cacheSet(matchFactsCacheKey, freshMatchFacts);

    setCacheControl(res, TTL_12H);
    res.json({
      source: "origin",
      data: {
        matchFacts: transformMatchFactsResponse(freshMatchFacts),
      },
    });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch match facts", details: err.message });
  }
});

// GET /football/game/:fixtureId/:team1/:team2
//
// Returns detailed fixture data only.
// Fixture caching rules:
//   - short_name in [1st, HT, 2nd]  → 20 s + activity-based polling
//   - future game (> 1 h to kick-off) → 2 h
//   - future game (<= 1 h to kick-off) → 5 min
//   - finished (FT)                    → 12 h
// Activity-based polling stops after 60 s of no incoming requests and
// restarts on the next request.
app.get("/football/game/:fixtureId/:team1/:team2", async (req, res) => {
  const { fixtureId } = req.params;
  const fixtureCacheKey = `game:${fixtureId}`;

  const fixtureUrl =
    `${SM_BASE}/fixtures/${fixtureId}?api_token=${SM_TOKEN}` +
    `&include=state;aggregate;round;periods;participants;scores;league.country;comments;formations;venue;weatherReport;events;statistics.type;formations;sidelined.player;sidelined.type;sidelined.sideline;lineups.player;lineups.type;lineups.position;lineups.detailedPosition;coaches;referees.referee;lineups.details.type;ballCoordinates&timezone=America/Toronto`;

  // Update activity timestamp
  const act = gameActivity.get(fixtureCacheKey);
  if (act) act.lastRequest = Date.now();

  // Resolve fixture data (dynamic TTL)
  let fixtureData;
  const fixtureEntry = cache.get(fixtureCacheKey);
  if (fixtureEntry) {
    const { ttl, fast } = gameTtlInfo(fixtureEntry.data?.data);
    // For live-window games, every incoming request should revalidate against origin.
    // Cached data is only served directly for non-live modes.
    if (!fast && Date.now() - fixtureEntry.fetchedAt < ttl) {
      fixtureData = fixtureEntry.data;
    }
  }

  // If fixture is cached, respond immediately
  if (fixtureData) {
    const { ttl } = gameTtlInfo(fixtureData?.data);
    ensureGamePolling(fixtureCacheKey, fixtureUrl, fixtureData?.data);
    setCacheControl(res, ttl);
    return res.json({
      source: "cache",
      data: {
        fixtureData: transformFixtureGameResponse(fixtureData),
      },
    });
  }

  try {
    const freshFixture = await fetchUrl(fixtureUrl);

    cacheSet(fixtureCacheKey, freshFixture);

    const fixture = freshFixture?.data;
    const { ttl } = gameTtlInfo(fixture);

    ensureGamePolling(fixtureCacheKey, fixtureUrl, fixture);

    setCacheControl(res, ttl);
    res.json({
      source: "origin",
      data: {
        fixtureData: transformFixtureGameResponse(freshFixture),
      },
    });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch game data", details: err.message });
  }
});

// Lightweight game endpoint: reduced includes and 5s polling
app.get("/football/game/light/:fixtureId", async (req, res) => {
  const { fixtureId } = req.params;
  const fixtureCacheKey = `game:light:${fixtureId}`;

  const fixtureUrl =
    `${SM_BASE}/fixtures/${fixtureId}?api_token=${SM_TOKEN}` +
    `&include=state;aggregate;round;periods;participants;scores;events.participant&timezone=America/Toronto`;

  // Update activity timestamp
  const act = gameActivity.get(fixtureCacheKey);
  if (act) act.lastRequest = Date.now();

  // Resolve fixture data (dynamic TTL)
  let fixtureData;
  const fixtureEntry = cache.get(fixtureCacheKey);
  if (fixtureEntry) {
    const { ttl, fast } = gameTtlInfo(fixtureEntry.data?.data);
    if (!fast && Date.now() - fixtureEntry.fetchedAt < ttl) {
      fixtureData = fixtureEntry.data;
    }
  }

  if (fixtureData) {
    const { ttl } = gameTtlInfo(fixtureData?.data);
    ensureGamePollingLight(fixtureCacheKey, fixtureUrl, fixtureData?.data);
    setCacheControl(res, ttl);
    return res.json({
      source: "cache",
      data: {
        fixtureData: transformFixtureGameResponse(fixtureData),
      },
    });
  }

  try {
    const freshFixture = await fetchUrl(fixtureUrl);

    cacheSet(fixtureCacheKey, freshFixture);

    const fixture = freshFixture?.data;
    const { ttl } = gameTtlInfo(fixture);

    ensureGamePollingLight(fixtureCacheKey, fixtureUrl, fixture);

    setCacheControl(res, ttl);
    res.json({
      source: "origin",
      data: {
        fixtureData: transformFixtureGameResponse(freshFixture),
      },
    });
  } catch (err) {
    res
      .status(502)
      .json({
        error: "Failed to fetch game data (light)",
        details: err.message,
      });
  }
});

// GET /football/game/:fixtureId/live-activity
// Returns a minimal payload intended for Live Activity initialization on iOS.
app.get("/football/game/:fixtureId/live-activity", async (req, res) => {
  const { fixtureId } = req.params;

  try {
    let raw = null;
    let fixtureDateCacheKey = null;
    let fixtureDateEntry = null;

    // First, prefer the daily fixture caches (fixture:date:YYYYMMDD)
    for (const [k, v] of cache.entries()) {
      if (!k.startsWith("fixture:date:")) continue;
      try {
        const dayData = v?.data?.data;
        if (!dayData) continue;
        const fixtures = dayData?.fixtures || dayData?.data || [];
        const candidateList = Array.isArray(fixtures)
          ? fixtures
          : fixtures?.data || [];
        for (const f of candidateList) {
          if (String(f?.id) === String(fixtureId)) {
            raw = { data: f };
            fixtureDateCacheKey = k;
            fixtureDateEntry = v;
            break;
          }
        }
        if (raw) break;
      } catch (e) {
        continue;
      }
    }

    // If not found in fixture-date caches, try direct per-game cache as fallback
    if (!raw) {
      const fixtureCacheKey = `game:${fixtureId}`;
      const cachedEntry = cache.get(fixtureCacheKey);
      if (cachedEntry && cachedEntry.data) {
        raw = cachedEntry.data; // matches shape expected by transformFixtureGameResponse
      }
    }

    // If still not found, fetch from origin
    let fixtureUrl =
      `${SM_BASE}/fixtures/${fixtureId}?api_token=${SM_TOKEN}` +
      `&include=state;periods;participants;scores;league;venue&timezone=America/Toronto`;

    if (!raw) {
      const fresh = await fetchUrl(fixtureUrl);
      if (!fresh?.data)
        return res.status(404).json({ error: "Fixture not found" });
      raw = fresh;
      cacheSet(`game:${fixtureId}`, fresh);
    }

    const transformed = transformFixtureGameResponse(raw);

    // If we found this fixture inside a daily cache, ensure the fixture-date polling is active
    if (fixtureDateCacheKey && fixtureDateEntry) {
      // derive date part from cache key
      const parts = fixtureDateCacheKey.split(":");
      const datePart = parts[2];
      const isoDate = `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}`;
      const url =
        `${SM_BASE}/fixtures/date/${isoDate}?api_token=${SM_TOKEN}` +
        `&per_page=50&include=aggregate;state;periods;participants;scores;venue;league.country&timezone=America/Toronto`;
      ensureFixtureDatePolling(fixtureDateCacheKey, url, fixtureDateEntry.data);
    } else {
      // fallback: ensure game polling for individually fetched fixtures
      ensureGamePolling(`game:${fixtureId}`, fixtureUrl, raw?.data || raw);
    }

    // Build minimal payload per 1.txt spec
    const participants = (transformed?.participants || []).map((p) => ({
      name: p.name ?? null,
      short_code: p.short_code ?? null,
      image_path: p.image_path ?? null,
      meta: p.meta
        ? { location: p.meta.location ?? null, winner: p.meta.winner ?? null }
        : null,
    }));
    try {
      console.log("[LiveActivity][Server] participants image paths:");
      (transformed?.participants || []).forEach((p) => {
        console.log(" -", p.name, "=>", p.image_path);
      });
    } catch (e) {}

    const scores = (transformed?.scores || [])
      .filter((s) => String(s?.description || "").toUpperCase() === "CURRENT")
      .map((s) => ({
        score: {
          goals: s.score?.goals ?? null,
          participant: s.score?.participant ?? null,
        },
      }));

    // derive team colors (home / away) and a blended color for the activity
    try {
      const colorMap = buildSapColorMap();
      const homeParticipant =
        participants.find((p) => p.meta?.location === "home") ||
        participants[0] ||
        null;
      const awayParticipant =
        participants.find((p) => p.meta?.location === "away") ||
        participants[1] ||
        participants[0] ||
        null;

      const homeTeamColors = homeParticipant
        ? findSapColors(homeParticipant.name, colorMap)
        : { colorPrimary: null, colorSecondary: null };
      const awayTeamColors = awayParticipant
        ? findSapColors(awayParticipant.name, colorMap)
        : { colorPrimary: null, colorSecondary: null };

      const normHex = (h) => {
        if (!h) return null;
        const s = String(h).replace(/^#/, "").trim();
        if (s.length === 3)
          return s
            .split("")
            .map((c) => c + c)
            .join("");
        if (s.length === 6) return s;
        return null;
      };

      const blendHex = (ha, hb) => {
        const a = normHex(ha);
        const b = normHex(hb);
        if (!a && !b) return null;
        if (!a) return `#${b}`;
        if (!b) return `#${a}`;
        const r = Math.round(
          (parseInt(a.slice(0, 2), 16) + parseInt(b.slice(0, 2), 16)) / 2,
        )
          .toString(16)
          .padStart(2, "0");
        const g = Math.round(
          (parseInt(a.slice(2, 4), 16) + parseInt(b.slice(2, 4), 16)) / 2,
        )
          .toString(16)
          .padStart(2, "0");
        const bl = Math.round(
          (parseInt(a.slice(4, 6), 16) + parseInt(b.slice(4, 6), 16)) / 2,
        )
          .toString(16)
          .padStart(2, "0");
        return `#${r}${g}${bl}`;
      };

      const FALLBACK_COLOR = "#888888";

      const colorsObj = {
        home:
          homeTeamColors.colorPrimary ||
          homeTeamColors.colorSecondary ||
          FALLBACK_COLOR,
        away:
          awayTeamColors.colorPrimary ||
          awayTeamColors.colorSecondary ||
          FALLBACK_COLOR,
        blended:
          blendHex(
            homeTeamColors.colorPrimary || homeTeamColors.colorSecondary,
            awayTeamColors.colorPrimary || awayTeamColors.colorSecondary,
          ) || FALLBACK_COLOR,
      };

      // attach colors to payload below
      var payloadColors = colorsObj;
    } catch (e) {
      console.warn("[live-activity] failed to derive colors:", e?.message || e);
      var payloadColors = {
        home: "#888888",
        away: "#888888",
        blended: "#888888",
      };
    }

    const payload = {
      id: transformed?.id ?? fixtureId,
      startingAt: (function () {
        try {
          if (!transformed?.starting_at) return { time: null, ampm: null };

          const date = new Date(transformed.starting_at);
          if (isNaN(date.getTime())) return { time: null, ampm: null };

          const timeFull = date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });

          const parts = String(timeFull).split(" ");
          return {
            time: parts[0] || null,
            ampm: parts[1] || null,
          };
        } catch (e) {
          return { time: null, ampm: null };
        }
      })(),
      state: transformed?.state ?? null,
      periods: (transformed?.periods || []).map((p) => ({
        ticking: p.ticking ?? null,
        description: p.description ?? null,
        minutes: p.minutes ?? null,
        seconds: p.seconds ?? null,
      })),
      participants,
      scores,
      venue: { name: transformed?.venue?.name ?? null },
      league: transformed?.league || null,
      colors: payloadColors,
      fetchedAt: Date.now(),
    };

    const source = fixtureDateCacheKey ? "fixture-date-cache" : "cache";
    return res.json({ source, data: { activity: payload } });
  } catch (err) {
    res.status(502).json({
      error: "Failed to build live-activity payload",
      details: err.message,
    });
  }
});

// POST /live-activity/register-push-to-start
// Body: { bundleId, token }
// Stores the app-wide push-to-start token (returned by addPushToStartTokenListener in the app)
app.post("/live-activity/register-push-to-start", (req, res) => {
  try {
    const { bundleId, token, fixtureId, fixtures } = req.body || {};
    if (!bundleId || !token)
      return res.status(400).json({ error: "bundleId and token required" });
    addPushToStartToken(bundleId, token).catch(() => {});

    // Optionally register for specific fixture(s)
    if (fixtureId) addFixturePushToken(fixtureId, token).catch(() => {});
    if (Array.isArray(fixtures)) {
      for (const f of fixtures) addFixturePushToken(f, token).catch(() => {});
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

function loadApplePrivateKey() {
  // Prefer a file on disk when provided (safer for platforms like Railway)
  if (APPLE_PRIVATE_KEY_PATH) {
    try {
      const pk = fs.readFileSync(APPLE_PRIVATE_KEY_PATH, "utf8");
      return pk;
    } catch (e) {
      console.warn(
        "loadApplePrivateKey: cannot read APPLE_PRIVATE_KEY_PATH",
        e?.message || e,
      );
      // fallthrough to env var
    }
  }

  if (APPLE_PRIVATE_KEY) {
    const pk = APPLE_PRIVATE_KEY.replace(/\\n/g, "\n");
    return pk;
  }

  return null;
}

let APNS_TOPIC = APPLE_BUNDLE_ID
  ? `${APPLE_BUNDLE_ID}.push-type.liveactivity`
  : null;

function generateAPNsJWT() {
  const pk = loadApplePrivateKey();
  if (!pk || !APPLE_TEAM_ID || !APPLE_KEY_ID) return null;
  try {
    return jwt.sign({}, pk, {
      algorithm: "ES256",
      expiresIn: "1h",
      issuer: APPLE_TEAM_ID,
      header: { alg: "ES256", kid: APPLE_KEY_ID },
    });
  } catch (e) {
    console.error("[live-activity] generateAPNsJWT failed:", e?.message || e);
    return null;
  }
}

async function sendToAPNs(deviceToken, payload, opts = {}) {
  const jwtToken = generateAPNsJWT();
  if (!jwtToken)
    throw new Error(
      "APNs credentials not configured (APPLE_PRIVATE_KEY/KEY_ID/TEAM_ID missing)",
    );

  const maxAttempts = opts.maxAttempts ?? 3;
  let attempt = 0;
  let lastErr = null;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const client = http2.connect("https://api.push.apple.com");
      await new Promise((resolveRequest, rejectRequest) => {
        client.on("error", (err) => {
          try {
            client.close();
          } catch (e) {}
          rejectRequest(err);
        });

        const pathReq = `/3/device/${deviceToken}`;
        const req = client.request({
          ":method": "POST",
          ":path": pathReq,
          authorization: `bearer ${jwtToken}`,
          "apns-topic": APNS_TOPIC,
          "apns-push-type": "liveactivity",
          "content-type": "application/json",
        });

        let data = "";
        let status = null;

        req.on("response", (headers) => {
          status = headers[":status"];
        });
        req.setEncoding("utf8");
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => {
          try {
            client.close();
          } catch (e) {}
          // If status indicates invalid/unregistered token, remove it from local store
          try {
            const sts = Number(status) || 0;
            if ([400, 403, 404, 410].includes(sts)) {
              // attempt to remove any matching token rows (activity or bundle)
              try {
                removeActivityToken(deviceToken);
              } catch (e) {}
              try {
                removePushToStartToken(deviceToken);
              } catch (e) {}
            }
          } catch (e) {}
          resolveRequest({ status: Number(status) || 200, body: data });
        });
        req.on("error", (err) => {
          try {
            client.close();
          } catch (e) {}
          rejectRequest(err);
        });

        req.write(JSON.stringify(payload));
        req.end();
      });

      // success—return last successful response
      pushMetrics.attempts++;
      pushMetrics.successes++;
      if (attempt > 1) pushMetrics.retries += attempt - 1;
      return { status: 200 };
    } catch (e) {
      lastErr = e;
      pushMetrics.attempts++;
      pushMetrics.failures++;
      // determine if retryable: network errors or 5xx/429 are retryable
      const msg = String(e?.message || e || "").toLowerCase();
      const retryable =
        msg.includes("socket") ||
        msg.includes("ecx") ||
        msg.includes("timeout") ||
        msg.includes("429") ||
        msg.includes("503") ||
        msg.includes("500");
      if (!retryable || attempt >= maxAttempts) break;
      // exponential backoff
      await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
    }
  }

  throw lastErr || new Error("sendToAPNs failed");
}

// Enhanced forwardToProvider: prefer configured APNS_PROVIDER_URL, else send directly to APNs when possible
async function forwardToProvider(tokenOrTokens, payload) {
  const tokens = Array.isArray(tokenOrTokens) ? tokenOrTokens : [tokenOrTokens];
  const results = [];

  for (const token of tokens) {
    // First try configured provider (if any)
    if (APNS_PROVIDER_URL) {
      try {
        const headers = { "Content-Type": "application/json" };
        if (APNS_PROVIDER_AUTH) headers.Authorization = APNS_PROVIDER_AUTH;
        const resp = await axios.post(
          APNS_PROVIDER_URL,
          { token, payload },
          { headers, timeout: 15000 },
        );
        results.push({ token, forwarded: true, resp: resp.data });
        continue;
      } catch (e) {
        console.warn(
          "[live-activity] forwardToProvider failed",
          e?.message || e,
        );
        // fallthrough to direct attempt
      }
    }

    // Direct APNs send
    try {
      const apnsResp = await sendToAPNs(token, payload, { maxAttempts: 3 });
      results.push({ token, forwarded: false, apns: apnsResp });
    } catch (err) {
      console.error(
        "[live-activity] direct APNs send failed",
        err?.message || err,
      );
      results.push({ token, forwarded: false, error: String(err) });
    }
  }

  const out = results.length === 1 ? results[0] : results;
  return out;
}

async function fetchLiveActivityForFixture(fixtureId) {
  try {
    const url = `http://127.0.0.1:${PORT}/football/game/${fixtureId}/live-activity`;
    const resp = await axios.get(url, { timeout: 10000 });
    // expect { source, data: { activity } }
    try {
    } catch (e) {}
    return resp.data?.data?.activity ?? null;
  } catch (e) {
    return null;
  }
}

async function sendStartNoAlert(tokenOrTokens, name, props) {
  // NOTE: Deprecated start semantics — send a silent "update" instead so
  // the client-local Live Activity (started hidden) can transition to visible
  // without the server issuing a duplicate start event.
  const payload = {
    aps: {
      event: "update",
      "content-state": {
        name,
        props: typeof props === "string" ? props : JSON.stringify(props || {}),
      },
      timestamp: Math.floor(Date.now() / 1000),
    },
  };
  try {
  } catch (e) {}
  return forwardToProvider(tokenOrTokens, payload);
}

async function sendStartWithAlert(token, name, props, title, body) {
  // Replace start-with-alert with an update containing an alert so we don't
  // issue a remote start when the activity was created locally.
  return sendUpdateWithAlert(token, name, props, title, body);
}

async function sendUpdateWithAlert(token, name, props, title, body) {
  const payload = {
    aps: {
      event: "update",
      "content-state": {
        name,
        props: typeof props === "string" ? props : JSON.stringify(props || {}),
      },
      timestamp: Math.floor(Date.now() / 1000),
      alert: {
        title: title || "Update",
        body: body || "Event happened",
        sound: "default",
      },
      "interruption-level": "time-sensitive",
    },
  };
  try {
  } catch (e) {}
  return forwardToProvider(token, payload);
}

async function sendUpdateNoAlert(tokenOrTokens, name, props) {
  const payload = {
    aps: {
      event: "update",
      "content-state": {
        name,
        props: typeof props === "string" ? props : JSON.stringify(props || {}),
      },
      timestamp: Math.floor(Date.now() / 1000),
    },
  };
  try {
    logJson("[live-activity] sendUpdateNoAlert payload", {
      token: tokenOrTokens,
      name,
      props,
    });
  } catch (e) {}
  return forwardToProvider(tokenOrTokens, payload);
}

async function sendEnd(token, name, props) {
  const payload = {
    aps: {
      event: "end",
      "content-state": {
        name,
        props: typeof props === "string" ? props : JSON.stringify(props || {}),
      },
      timestamp: Math.floor(Date.now() / 1000),
      "attributes-type": "LiveActivityAttributes",
      attributes: {},
    },
  };
  try {
  } catch (e) {}
  return forwardToProvider(token, payload);
}

function startLiveActivityMonitor(opts) {
  // opts: { bundleId, deviceTokens (array), fixtureId, starting_at, name, props }
  const key = String(opts.fixtureId || `${opts.bundleId}:${Date.now()}`);
  if (liveActivityMonitors.has(key)) {
    console.log("[live-activity] monitor already exists", key);
    return liveActivityMonitors.get(key);
  }

  const monitor = {
    key,
    opts,
    intervalId: null,
    timers: [],
    lastScores: null,
    alertedStart: false,
    started: false,
  };

  async function pollOnce() {
    try {
      const activity = await fetchLiveActivityForFixture(opts.fixtureId);
      if (!activity) {
        console.log(
          "[live-activity] no activity for fixture",
          opts && opts.fixtureId,
        );
        return;
      }

      // normalize state: activity.state may be an object or a string
      const stateObj =
        activity && typeof activity.state === "object" ? activity.state : null;
      const stateShort =
        (stateObj && (stateObj.short_name || stateObj.state)) ||
        (typeof activity.state === "string" ? activity.state : null) ||
        null;

      // build full props from activity so the client UI updates with fresh data
      const participants = Array.isArray(activity.participants)
        ? activity.participants
        : [];
      // build score map keyed by 'home'/'away' (lowercase) and any numeric ids
      const scoreMap = {};
      for (const s of activity.scores || []) {
        const participantLabel = String(
          s?.score?.participant || "",
        ).toLowerCase();
        if (participantLabel)
          scoreMap[participantLabel] = s.score?.goals ?? null;
        if (s?.score?.participant_id)
          scoreMap[String(s.score.participant_id)] = s.score?.goals ?? null;
        if (s?.score?.participant_team_id)
          scoreMap[String(s.score.participant_team_id)] =
            s.score?.goals ?? null;
      }

      // pick home/away by meta.location when present, sensible fallbacks
      const home =
        participants.find((p) => p?.meta?.location === "home") ||
        participants[0] ||
        {};
      const away =
        participants.find((p) => p?.meta?.location === "away") ||
        participants[1] ||
        participants[0] ||
        {};

      // pick current period if present (prefer the ticking period, else
      // use the first non-ended period, else fall back to the last period)
      let currentPeriod = null;
      if (Array.isArray(activity.periods) && activity.periods.length > 0) {
        currentPeriod =
          activity.periods.find((p) => p?.ticking === true) ||
          activity.periods.find((p) => p?.ended !== true) ||
          activity.periods[activity.periods.length - 1] ||
          null;
      }
      const minuteVal =
        currentPeriod?.minutes ?? activity.minute ?? activity.elapsed ?? null;
      const secondsVal = currentPeriod?.seconds ?? null;
      const tickingVal = currentPeriod?.ticking === true;

      const leagueObj = activity.league
        ? {
            id: activity.league.id ?? null,
            name: activity.league.name ?? null,
            image_path: activity.league.image_path ?? null,
            country: activity.league.country
              ? {
                  name: activity.league.country.name ?? null,
                  image_path: activity.league.country.image_path ?? null,
                }
              : null,
          }
        : activity.competition
          ? {
              id: activity.competition.id ?? null,
              name: activity.competition.name ?? null,
              image_path: activity.competition.logo ?? null,
              country: null,
            }
          : null;

      // derive colors for home/away and blended (so updates always include colors)
      let propsColors = {
        home: "#888888",
        away: "#888888",
        blended: "#888888",
      };
      try {
        const colorMap = buildSapColorMap();
        const homeName = (home && (home.name || home.short_code)) || null;
        const awayName = (away && (away.name || away.short_code)) || null;
        const homeTeamColors = homeName
          ? findSapColors(homeName, colorMap)
          : {};
        const awayTeamColors = awayName
          ? findSapColors(awayName, colorMap)
          : {};
        const normHex = (h) => (h ? String(h).replace(/^#/, "") : null);
        const blendHex = (a, b) => {
          try {
            if (!a && !b) return null;
            if (!a) return `#${b}`;
            if (!b) return `#${a}`;
            const r = Math.round(
              (parseInt(a.slice(0, 2), 16) + parseInt(b.slice(0, 2), 16)) / 2,
            )
              .toString(16)
              .padStart(2, "0");
            const g = Math.round(
              (parseInt(a.slice(2, 4), 16) + parseInt(b.slice(2, 4), 16)) / 2,
            )
              .toString(16)
              .padStart(2, "0");
            const bl = Math.round(
              (parseInt(a.slice(4, 6), 16) + parseInt(b.slice(4, 6), 16)) / 2,
            )
              .toString(16)
              .padStart(2, "0");
            return `#${r}${g}${bl}`;
          } catch (e) {
            return null;
          }
        };
        const hp =
          homeTeamColors.colorPrimary || homeTeamColors.colorSecondary || null;
        const ap =
          awayTeamColors.colorPrimary || awayTeamColors.colorSecondary || null;
        propsColors = {
          home: hp || "#888888",
          away: ap || "#888888",
          blended: blendHex(normHex(hp), normHex(ap)) || "#888888",
        };
      } catch (e) {}

      // load any persisted fixture assets (logoName references) so updates always include them
      let persistedAssets = null;
      try {
        persistedAssets = await getFixtureAssets(opts.fixtureId);
      } catch (e) {
        persistedAssets = null;
      }

      const props = {
        home: {
          name: home.name || null,
          shortName: home.short_code || home.shortName || home.abbr || null,
          score:
            scoreMap["home"] ??
            scoreMap[String(home.id)] ??
            scoreMap[String(home.id_text)] ??
            scoreMap["Home"] ??
            home.score ??
            0,
          // include optional filename the app stored in App Group so widget can load local images
          logoName:
            (persistedAssets && persistedAssets.homeLogoName) ||
            (opts.props && opts.props.home && opts.props.home.logoName) ||
            null,
        },
        away: {
          name: away.name || null,
          shortName: away.short_code || away.shortName || away.abbr || null,
          score:
            scoreMap["away"] ??
            scoreMap[String(away.id)] ??
            scoreMap[String(away.id_text)] ??
            scoreMap["Away"] ??
            away.score ??
            0,
          logoName:
            (persistedAssets && persistedAssets.awayLogoName) ||
            (opts.props && opts.props.away && opts.props.away.logoName) ||
            null,
        },
        league: leagueObj,
        status: {
          short_name: stateShort || null,
          text: stateObj?.name || activity.state_text || null,
          minute: minuteVal,
          seconds: secondsVal,
          ticking: tickingVal,
        },
        venue: { name: activity.venue?.name || null },
        startingAt: (function () {
          try {
            if (!activity.starting_at) return { time: null, ampm: null };
            const date = new Date(activity.starting_at);
            if (isNaN(date.getTime())) return { time: null, ampm: null };
            const timeFull = date.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });
            const parts = String(timeFull).split(" ");
            const time = parts[0] || null;
            const ampm = parts[1] || (date.getHours() >= 12 ? "PM" : "AM");
            return { time, ampm };
          } catch (e) {
            return { time: null, ampm: null };
          }
        })(),
        // include derived colors so widget receives consistent color info
        colors: propsColors,
        // include any initial logo filenames provided by the app so updates preserve images
        // if the app didn't provide them, widget should fallback to stored URIs
        // (server should never send full file:// URIs)
      };
      try {
        logJson("[live-activity] built props", {
          fixtureId: opts.fixtureId,
          state: stateShort,
          home: { name: props.home.name, score: props.home.score },
          away: { name: props.away.name, score: props.away.score },
          minute: props.status?.minute ?? null,
          seconds: props.status?.seconds ?? null,
          ticking: props.status?.ticking ?? null,
          homeLogoName: props.home.logoName,
          awayLogoName: props.away.logoName,
          leagueLogoName: props.league || null,
          startingAt: props.startingAt,
          rawProps: props,
        });
      } catch (e) {
        console.error("[live-activity] logJson failed", e);
        try {
          console.log("[live-activity] built props fallback", {
            fixtureId: opts && opts.fixtureId,
            state: stateShort,
            home: { name: props.home.name, score: props.home.score },
            away: { name: props.away.name, score: props.away.score },
            minute: props.status?.minute ?? null,
            startingAt: props.startingAt,
          });
        } catch (ee) {
          console.error("[live-activity] fallback log failed", ee);
        }
      }

      // simple payload hash dedupe to avoid unnecessary APNs calls
      try {
        const hash = JSON.stringify({
          state: stateShort,
          minute: props.status?.minute ?? null,
          seconds: props.status?.seconds ?? null,
          scores: [props.home.score, props.away.score],
        });
        if (monitor.lastHash && monitor.lastHash === hash) {
          // nothing changed
          // but continue to allow ticking-driven periodic pushes (handled below)
        } else {
          monitor.lastHash = hash;
        }
      } catch (e) {}

      // periodic ticking updates: when the period is ticking send lightweight updates (rate-limited)
      try {
        const isTicking = props.status?.ticking === true;
        const TICK_INTERVAL_MS = 10 * 1000; // send every ~10s (safer rate)
        if (isTicking) {
          const activityTokens = opts.fixtureId
            ? await getActivityTokensForFixture(opts.fixtureId)
            : [];
          if (activityTokens && activityTokens.length > 0) {
            if (
              !monitor.lastTickPush ||
              Date.now() - monitor.lastTickPush >= TICK_INTERVAL_MS
            ) {
              try {
                // use silent, delta-only update to avoid overwriting client-owned
                // assets (logos/colors) and to avoid user alerts for ticking
                // send full props so Live Activity state is complete (Live Activity REPLACES state)
                await sendUpdateNoAlert(activityTokens, opts.name, props);
                monitor.lastTickPush = Date.now();
              } catch (e) {
                console.error("[live-activity] sendUpdateNoAlert failed", e);
              }
            }
          }
        }
      } catch (e) {}

      // detect first-half (1ST) -> send start-with-alert if not yet alerted
      if (!monitor.alertedStart && /1ST|FIRST/i.test(stateShort)) {
        monitor.alertedStart = true;
        // only send to activity instance tokens (do not fallback)
        const activityTokens = opts.fixtureId
          ? await getActivityTokensForFixture(opts.fixtureId)
          : [];
        if (activityTokens && activityTokens.length > 0) {
          monitor.started = true;
          try {
            if (
              !monitor.lastPushAt ||
              Date.now() - monitor.lastPushAt >= 5000
            ) {
              // send full props for start alert
              await sendStartWithAlert(
                activityTokens,
                opts.name,
                props,
                "Match started",
                `${activity.participants?.[0]?.name || "Home"} vs ${activity.participants?.[1]?.name || "Away"} kicked off`,
              );
              monitor.lastPushAt = Date.now();
            }
          } catch (e) {}
        }
      }

      // detect HT — use activity instance tokens (instance.getPushToken()) for updates
      if (/HT|HALF/i.test(stateShort) && monitor.lastState !== stateShort) {
        // only send to activity instance tokens (do not fallback)
        const activityTokens = opts.fixtureId
          ? await getActivityTokensForFixture(opts.fixtureId)
          : [];
        if (activityTokens && activityTokens.length > 0) {
          try {
            if (
              !monitor.lastPushAt ||
              Date.now() - monitor.lastPushAt >= 5000
            ) {
              // send full props for HT alert
              await sendUpdateWithAlert(
                activityTokens,
                opts.name,
                props,
                "Half Time",
                "Match is at half time",
              );
              monitor.lastPushAt = Date.now();
            }
          } catch (e) {}
        }
      }

      // detect score changes (goals)
      const newScores = {};
      for (const s of activity.scores || []) {
        const g = s.score?.goals ?? null;
        const p = String(s.score?.participant || "unknown");
        newScores[p] = g;
      }
      if (monitor.lastScores) {
        for (const p of Object.keys(newScores)) {
          const prev = monitor.lastScores[p] ?? null;
          const curr = newScores[p];
          if (prev != null && curr != null && curr > prev) {
            // goal for participant p — send to activity instance tokens
            const activityTokens = opts.fixtureId
              ? await getActivityTokensForFixture(opts.fixtureId)
              : [];
            if (activityTokens && activityTokens.length > 0) {
              try {
                if (
                  !monitor.lastPushAt ||
                  Date.now() - monitor.lastPushAt >= 5000
                ) {
                  // send full props for goal alert (includes colors/logoName)
                  await sendUpdateWithAlert(
                    activityTokens,
                    opts.name,
                    props,
                    "GOAL ⚽",
                    `Score changed: ${curr}`,
                  );
                  monitor.lastPushAt = Date.now();
                }
              } catch (e) {}
            }
          }
        }
      }
      monitor.lastScores = newScores;

      // detect end — send end to activity instance tokens (preferred)
      if (
        /FT|AET|FT_PEN|POSTP|CANC|ABAN|WALKOVER|POSTPONED|CANCELLED|CANCELL?ED/i.test(
          stateShort,
        )
      ) {
        const activityTokens = opts.fixtureId
          ? await getActivityTokensForFixture(opts.fixtureId)
          : [];
        if (activityTokens && activityTokens.length > 0) {
          try {
            if (
              !monitor.lastPushAt ||
              Date.now() - monitor.lastPushAt >= 2000
            ) {
              await sendEnd(activityTokens, opts.name, props);
              monitor.lastPushAt = Date.now();
            }
          } catch (e) {}
        }
        // stop monitor
        stop();
      }
      // update lastState after processing
      monitor.lastState = stateShort;
    } catch (e) {
      console.error("[live-activity] pollOnce error", e);
    }
  }

  // schedule polling (30s to reduce APNs pressure)
  monitor.intervalId = setInterval(pollOnce, 30 * 1000);
  console.log(
    "[live-activity] monitor scheduled",
    key,
    "intervalId",
    monitor.intervalId,
  );

  // schedule start-no-alert 30 minutes before starting_at if provided
  try {
    if (opts.starting_at) {
      const startMs = Date.parse(opts.starting_at);
      const when = startMs - 30 * 60 * 1000; // 30 min before
      const now = Date.now();
      if (when <= now) {
        // start now silently — only if activity tokens exist
        (async () => {
          try {
            const activityTokens = await getActivityTokensForFixture(
              opts.fixtureId,
            );
            if (activityTokens && activityTokens.length > 0) {
              monitor.started = true;
              const activityNow = await fetchLiveActivityForFixture(
                opts.fixtureId,
              );
              const activityStateObj =
                activityNow && typeof activityNow.state === "object"
                  ? activityNow.state
                  : null;
              const startProps = activityNow
                ? {
                    startingAt: activityNow.starting_at,
                    status: {
                      short_name:
                        activityStateObj?.short_name ||
                        activityStateObj?.state ||
                        activityNow.state ||
                        null,
                    },
                  }
                : opts.props || {};
              await sendStartNoAlert(activityTokens, opts.name, startProps);
            }
          } catch (e) {}
        })();
      } else {
        const t = setTimeout(async () => {
          try {
            const activityTokens = await getActivityTokensForFixture(
              opts.fixtureId,
            );
            if (activityTokens && activityTokens.length > 0) {
              monitor.started = true;
              const activityNow = await fetchLiveActivityForFixture(
                opts.fixtureId,
              );
              const activityStateObj =
                activityNow && typeof activityNow.state === "object"
                  ? activityNow.state
                  : null;
              const startProps = activityNow
                ? {
                    startingAt: activityNow.starting_at,
                    status: {
                      short_name:
                        activityStateObj?.short_name ||
                        activityStateObj?.state ||
                        activityNow.state ||
                        null,
                    },
                  }
                : opts.props || {};
              await sendStartNoAlert(activityTokens, opts.name, startProps);
            }
          } catch (e) {}
        }, when - now);
        monitor.timers.push(t);
      }

      // schedule end at start + 2.5 hours; if still live then delay for 30 minutes
      const endAt = startMs + Math.floor(2.5 * 60 * 60 * 1000);
      const endDelay = Math.max(0, endAt - Date.now());
      const endTimer = setTimeout(async () => {
        // check state and either end or reschedule 30m later
        const activity = await fetchLiveActivityForFixture(opts.fixtureId);
        const stateObj =
          activity && typeof activity.state === "object"
            ? activity.state
            : null;
        const state = (
          stateObj?.short_name ||
          stateObj?.state ||
          activity?.state ||
          ""
        )
          .toString()
          .toUpperCase();
        if (
          /FT|AET|FT_PEN|POSTP|CANC|ABAN|WALKOVER|POSTPONED|CANCELLED|CANCELL?ED/i.test(
            state,
          )
        ) {
          try {
            const activityTokens = await getActivityTokensForFixture(
              opts.fixtureId,
            );
            if (activityTokens && activityTokens.length > 0) {
              const activityNow = await fetchLiveActivityForFixture(
                opts.fixtureId,
              );
              const activityStateObj =
                activityNow && typeof activityNow.state === "object"
                  ? activityNow.state
                  : null;
              const endProps = activityNow
                ? {
                    status: {
                      short_name:
                        activityStateObj?.short_name ||
                        activityStateObj?.state ||
                        activityNow.state ||
                        null,
                    },
                  }
                : opts.props || {};
              await sendEnd(activityTokens, opts.name, endProps).catch(
                () => {},
              );
            }
          } catch (e) {}
        } else {
          // still live -> delay 30 minutes
          const t2 = setTimeout(
            async () => {
              try {
                const activityTokens2 = await getActivityTokensForFixture(
                  opts.fixtureId,
                );
                if (activityTokens2 && activityTokens2.length > 0)
                  await sendEnd(activityTokens2, opts.name, opts.props).catch(
                    () => {},
                  );
              } catch (e) {}
            },
            30 * 60 * 1000,
          );
          monitor.timers.push(t2);
        }
      }, endDelay);
      monitor.timers.push(endTimer);
    }
  } catch (e) {}

  function stop() {
    if (monitor.intervalId) clearInterval(monitor.intervalId);
    for (const t of monitor.timers) clearTimeout(t);
    liveActivityMonitors.delete(key);
  }

  monitor.stop = stop;
  liveActivityMonitors.set(key, monitor);
  // run an immediate poll to initialize lastScores
  pollOnce().catch((e) =>
    console.error("[live-activity] initial pollOnce failed", e),
  );
  return monitor;
}

// POST /live-activity/start
// Body: { bundleId, name, props, alert? }
// Uses stored push-to-start token for the app (bundleId) and builds the APNs start payload.
app.post("/live-activity/start", async (req, res) => {
  // Deprecated: starting Live Activities remotely conflicts with local-start image access
  // and can produce duplicate activities. Prefer the local-start + register-activity-token
  // flow where the app starts the activity (hidden) and the server sends updates/end.
  return res.status(410).json({
    ok: false,
    error:
      "/live-activity/start is deprecated. Start locally and register the activity token via /live-activity/register-activity-token",
  });
});

// POST /live-activity/update
// Body: { deviceToken, name, props, timestamp? }
// Sends an update event to a live activity instance (use instance push token returned by instance.getPushToken())
app.post("/live-activity/update", async (req, res) => {
  try {
    const { deviceToken, name, props, timestamp } = req.body || {};
    if (!deviceToken || !name)
      return res.status(400).json({ error: "deviceToken and name required" });

    const payload = {
      aps: {
        event: "update",
        "content-state": {
          name,
          props:
            typeof props === "string" ? props : JSON.stringify(props || {}),
        },
        timestamp: timestamp
          ? Math.floor(Number(timestamp))
          : Math.floor(Date.now() / 1000),
      },
    };

    const forwarded = await forwardToProvider(deviceToken, payload);
    if (forwarded)
      return res.json({ ok: true, forwarded: true, response: forwarded });
    return res.json({ ok: true, forwarded: false, deviceToken, payload });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /live-activity/register-for-fixture
// Body: { fixtureId, token }
// Allows apps to register a device's push-to-start token specifically for a fixture.
app.post("/live-activity/register-for-fixture", (req, res) => {
  try {
    const { fixtureId, token } = req.body || {};
    if (!fixtureId || !token)
      return res.status(400).json({ error: "fixtureId and token required" });
    addFixturePushToken(fixtureId, token)
      .then(() => res.json({ ok: true }))
      .catch((e) => res.status(500).json({ error: e?.message || String(e) }));
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// POST /live-activity/register-activity-token
// Body: { fixtureId, token }
// Apps should call this after starting a Live Activity locally and obtaining
// the instance push token via `instance.getPushToken()` so the server can
// send updates and end signals to the correct activity instances.
app.post("/live-activity/register-activity-token", (req, res) => {
  try {
    const { fixtureId, token, props: startProps } = req.body || {};
    if (!fixtureId || !token)
      return res.status(400).json({ error: "fixtureId and token required" });
    addActivityToken(fixtureId, token)
      .then(async () => {
        // persist any logoName references the app provided on registration
        try {
          const assetsToSet = {};
          if (startProps && startProps.home && startProps.home.logoName)
            assetsToSet.homeLogoName = startProps.home.logoName;
          if (startProps && startProps.away && startProps.away.logoName)
            assetsToSet.awayLogoName = startProps.away.logoName;
          if (startProps && startProps.league && startProps.league.logoName)
            assetsToSet.leagueLogoName = startProps.league.logoName;
          if (startProps && startProps.appGroupPath)
            assetsToSet.appGroupPath = startProps.appGroupPath;
          if (startProps && startProps.appGroupId)
            assetsToSet.appGroupId = startProps.appGroupId;
          if (startProps && startProps.startingAt)
            assetsToSet.startingAt = startProps.startingAt;
          if (Object.keys(assetsToSet).length > 0)
            await setFixtureAssets(fixtureId, assetsToSet);
        } catch (e) {}
        // start monitoring this fixture so server-driven updates will run
        // defer starting the monitor until we have initial props below
        // send an immediate full update to the newly-registered activity token so the UI appears promptly
        (async () => {
          try {
            const tokens = await getActivityTokensForFixture(fixtureId);
            if (tokens && tokens.length > 0) {
              const activity = await fetchLiveActivityForFixture(fixtureId);
              const participants = Array.isArray(activity?.participants)
                ? activity.participants
                : [];
              // Find home/away by meta.location when available, fallback to order
              const home =
                participants.find((p) => p?.meta?.location === "home") ||
                participants[1] ||
                participants[0] ||
                {};
              const away =
                participants.find((p) => p?.meta?.location === "away") ||
                participants[0] ||
                participants[1] ||
                {};

              // build safer props for immediate update (include seconds/ticking when available)
              const scoreMapNow = {};
              for (const s of activity?.scores || []) {
                const participantLabel = String(
                  s.score?.participant || "",
                ).toLowerCase();
                if (participantLabel)
                  scoreMapNow[participantLabel] = s.score?.goals ?? null;
                // also map any numeric ids if present
                if (s.score?.participant_id)
                  scoreMapNow[String(s.score.participant_id)] =
                    s.score?.goals ?? null;
                if (s.score?.participant_team_id)
                  scoreMapNow[String(s.score.participant_team_id)] =
                    s.score?.goals ?? null;
              }

              const currentPeriodNow =
                Array.isArray(activity?.periods) && activity.periods.length > 0
                  ? activity.periods[activity.periods.length - 1]
                  : null;
              const minuteNow =
                currentPeriodNow?.minutes ??
                activity?.minute ??
                activity?.elapsed ??
                null;
              const secondsNow = currentPeriodNow?.seconds ?? null;
              const tickingNow = currentPeriodNow?.ticking === true;

              const leagueNow = activity?.league
                ? {
                    id: activity.league.id ?? null,
                    name: activity.league.name ?? null,
                    image_path: activity.league.image_path ?? null,
                    country: activity.league.country
                      ? {
                          name: activity.league.country.name ?? null,
                          image_path:
                            activity.league.country.image_path ?? null,
                        }
                      : null,
                  }
                : activity?.competition
                  ? {
                      id: activity.competition.id ?? null,
                      name: activity.competition.name ?? null,
                      image_path: activity.competition.logo ?? null,
                      country: null,
                    }
                  : null;

              // Normalize state extraction: activity.state may be an object
              const stateObj =
                activity && typeof activity.state === "object"
                  ? activity.state
                  : null;
              const shortName =
                stateObj?.short_name ||
                stateObj?.state ||
                activity?.state ||
                null;
              const stateText = stateObj?.name || activity?.state_text || null;

              // derive colors for home/away and blended (so initial update includes colors)
              let propsColors = {
                home: "#888888",
                away: "#888888",
                blended: "#888888",
              };
              try {
                const colorMap = buildSapColorMap();
                const homeName =
                  (home && (home.name || home.short_code)) || null;
                const awayName =
                  (away && (away.name || away.short_code)) || null;
                const homeTeamColors = homeName
                  ? findSapColors(homeName, colorMap)
                  : {};
                const awayTeamColors = awayName
                  ? findSapColors(awayName, colorMap)
                  : {};
                const normHex = (h) => (h ? String(h).replace(/^#/, "") : null);
                const blendHex = (a, b) => {
                  try {
                    if (!a && !b) return null;
                    if (!a) return `#${b}`;
                    if (!b) return `#${a}`;
                    const r = Math.round(
                      (parseInt(a.slice(0, 2), 16) +
                        parseInt(b.slice(0, 2), 16)) /
                        2,
                    )
                      .toString(16)
                      .padStart(2, "0");
                    const g = Math.round(
                      (parseInt(a.slice(2, 4), 16) +
                        parseInt(b.slice(2, 4), 16)) /
                        2,
                    )
                      .toString(16)
                      .padStart(2, "0");
                    const bl = Math.round(
                      (parseInt(a.slice(4, 6), 16) +
                        parseInt(b.slice(4, 6), 16)) /
                        2,
                    )
                      .toString(16)
                      .padStart(2, "0");
                    return `#${r}${g}${bl}`;
                  } catch (e) {
                    return null;
                  }
                };
                const hp =
                  homeTeamColors.colorPrimary ||
                  homeTeamColors.colorSecondary ||
                  null;
                const ap =
                  awayTeamColors.colorPrimary ||
                  awayTeamColors.colorSecondary ||
                  null;
                propsColors = {
                  home: hp || "#888888",
                  away: ap || "#888888",
                  blended: blendHex(normHex(hp), normHex(ap)) || "#888888",
                };
              } catch (e) {}

              const props = {
                home: {
                  name: home.name || null,
                  shortName:
                    home.short_code || home.shortName || home.abbr || null,
                  score:
                    scoreMapNow["home"] ??
                    scoreMapNow[String(home.id)] ??
                    scoreMapNow[String(home.id_text)] ??
                    home.score ??
                    0,
                },
                away: {
                  name: away.name || null,
                  shortName:
                    away.short_code || away.shortName || away.abbr || null,
                  score:
                    scoreMapNow["away"] ??
                    scoreMapNow[String(away.id)] ??
                    scoreMapNow[String(away.id_text)] ??
                    away.score ??
                    0,
                },
                league: leagueNow,
                status: {
                  short_name: shortName,
                  text: stateText,
                  minute: minuteNow,
                  seconds: secondsNow,
                  ticking: tickingNow,
                },
                venue: { name: activity?.venue?.name || null },
                startingAt: (function () {
                  try {
                    if (!activity.starting_at)
                      return { time: null, ampm: null };
                    const date = new Date(activity.starting_at);
                    if (isNaN(date.getTime()))
                      return { time: null, ampm: null };
                    const timeFull = date.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    });
                    const parts = String(timeFull).split(" ");
                    const time = parts[0] || null;
                    const ampm =
                      parts[1] || (date.getHours() >= 12 ? "PM" : "AM");
                    return { time, ampm };
                  } catch (e) {
                    return { time: null, ampm: null };
                  }
                })(),
                // include derived colors so widget receives consistent color info
                colors: propsColors,
                // include app group path/id so widget can resolve local App Group files
                appGroupPath:
                  (persistedAssets && persistedAssets.appGroupPath) ||
                  (opts.props && opts.props.appGroupPath) ||
                  null,
                appGroupId:
                  (persistedAssets && persistedAssets.appGroupId) ||
                  (opts.props && opts.props.appGroupId) ||
                  null,
              };
              // prefer persisted/provided startingAt if available (override activity-based value)
              try {
                if (persistedAssets?.startingAt)
                  props.startingAt = persistedAssets.startingAt;
                else if (opts.props && opts.props.startingAt)
                  props.startingAt = opts.props.startingAt;
              } catch (e) {}
              // ensure immediate update includes persisted logoName and startingAt references (or the startProps if provided)
              try {
                const persisted = await getFixtureAssets(fixtureId);
                if (persisted?.homeLogoName)
                  props.home.logoName = persisted.homeLogoName;
                else if (
                  startProps &&
                  startProps.home &&
                  startProps.home.logoName
                )
                  props.home.logoName = startProps.home.logoName;
                if (persisted?.awayLogoName)
                  props.away.logoName = persisted.awayLogoName;
                else if (
                  startProps &&
                  startProps.away &&
                  startProps.away.logoName
                )
                  props.away.logoName = startProps.away.logoName;
                if (persisted?.leagueLogoName)
                  props.league.logoName = persisted.leagueLogoName;
                else if (
                  startProps &&
                  startProps.league &&
                  startProps.league.logoName
                )
                  props.league.logoName = startProps.league.logoName;
                if (persisted?.startingAt)
                  props.startingAt = persisted.startingAt;
                else if (startProps && startProps.startingAt)
                  props.startingAt = startProps.startingAt;
                if (persisted?.appGroupPath)
                  props.appGroupPath = persisted.appGroupPath;
                else if (startProps && startProps.appGroupPath)
                  props.appGroupPath = startProps.appGroupPath;
                if (persisted?.appGroupId)
                  props.appGroupId = persisted.appGroupId;
                else if (startProps && startProps.appGroupId)
                  props.appGroupId = startProps.appGroupId;
              } catch (e) {}
              // start monitoring this fixture now that we have initial props
              try {
                startLiveActivityMonitor({
                  fixtureId,
                  name: "FootballLiveActivity",
                  props,
                });
              } catch (e) {}
              try {
                // send a full props update (Live Activities replace state)
                await sendUpdateNoAlert(tokens, "FootballLiveActivity", props);
              } catch (e) {}
            }
          } catch (e) {}
        })();
        res.json({ ok: true });
      })
      .catch((e) => res.status(500).json({ error: e?.message || String(e) }));
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// GET /live-activity/metrics — return simple push metrics
app.get("/live-activity/metrics", (_req, res) => {
  res.json({ pushMetrics });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /football/cache-sap
// Returns a combined, deduplicated list of teams from all cached SAP standings,
// sorted alphabetically by team name.
app.get("/football/cache-sap", (_req, res) => {
  const seen = new Map(); // keyed by competitor id to deduplicate

  for (const compId of SAP_COMPETITION_IDS) {
    const entry = cache.get(`sap:standings:${compId}`);
    if (!entry?.data?.standings) continue;

    for (const stage of entry.data.standings) {
      if (!Array.isArray(stage.rows)) continue;
      for (const row of stage.rows) {
        const c = row.competitor;
        if (!c?.id || seen.has(c.id)) continue;
        seen.set(c.id, {
          teamName: c.name ?? null,
          teamLong: c.longName ?? null,
          teamAbbr: c.symbolicName ?? null,
          colorPrimary: c.color ?? null,
          colorSecondary: c.awayColor ?? null,
        });
      }
    }
  }

  const standings = Array.from(seen.values()).sort((a, b) =>
    (a.teamName ?? "").localeCompare(b.teamName ?? ""),
  );

  res.json({ standings });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache data helpers — leagues / teams / fixtures bulk endpoints
// ─────────────────────────────────────────────────────────────────────────────

// Fixture date window: end = yesterday in UTC-1, start = end − 100 days.
function getFixtureDateRange() {
  const utcMinus1Now = new Date(Date.now() - 60 * 60 * 1000);
  const end = new Date(utcMinus1Now);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 100);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

// Transform a league item per a.txt spec.
function transformCacheLeague(item) {
  return {
    id: item.id,
    name: item.name ?? null,
    image_path: item.image_path ?? null,
    sub_type: item.sub_type ?? null,
    currentseason: item.currentseason
      ? { id: item.currentseason.id, name: item.currentseason.name ?? null }
      : null,
  };
}

// Transform a team item per b.txt spec.
function transformCacheTeam(item) {
  const mapPlayer = (p) => ({
    player_id: p.player_id ?? null,
    player: p.player
      ? {
          firstname: p.player.firstname ?? null,
          lastname: p.player.lastname ?? null,
          name: p.player.name ?? null,
          display_name: p.player.display_name ?? null,
          image_path: p.player.image_path ?? null,
        }
      : null,
  });
  return {
    id: item.id,
    name: item.name ?? null,
    short_code: item.short_code ?? null,
    image_path: item.image_path ?? null,
    rankings: Array.isArray(item.rankings)
      ? item.rankings.map((r) => ({
          position: r.position ?? null,
          points: r.points ?? null,
          type: r.type ?? null,
        }))
      : [],
    activeseasons: Array.isArray(item.activeseasons)
      ? item.activeseasons.map((s) => ({
          league: s.league
            ? {
                id: s.league.id,
                name: s.league.name ?? null,
                sub_type: s.league.sub_type ?? null,
              }
            : null,
        }))
      : [],
    sidelined: Array.isArray(item.sidelined)
      ? item.sidelined.map(mapPlayer)
      : [],
    players: Array.isArray(item.players) ? item.players.map(mapPlayer) : [],
  };
}

// Builds a lowercased-name → team lookup from the teams cache.
function buildTeamsNameMap() {
  const map = new Map();
  for (const team of cache.get("cache:teams")?.data ?? []) {
    if (team.name) map.set(team.name.toLowerCase(), team);
  }
  return map;
}

// Resolve a team using the same progressive matching logic as findSapColors.
function findTeamByName(name, teamsNameMap) {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (teamsNameMap.has(lower)) return teamsNameMap.get(lower);
  const norm = normalizeName(name);
  for (const [key, team] of teamsNameMap) {
    if (normalizeName(key) === norm) return team;
  }
  for (const [key, team] of teamsNameMap) {
    if (key.includes(lower) || lower.includes(key)) return team;
  }
  if (norm.length >= 4) {
    for (const [key, team] of teamsNameMap) {
      const kn = normalizeName(key);
      if (kn.length >= 4 && (kn.includes(norm) || norm.includes(kn)))
        return team;
    }
  }
  return null;
}

// Transform a raw fixture per c.txt spec + team enrichment.
// Fixture name format: "Away Team vs Home Team" (left = away, right = home).
function transformCacheFixture(item, teamsNameMap, colorMap) {
  const name = item.name ?? "";
  const sepIdx = name.indexOf(" vs ");
  const awayName = sepIdx !== -1 ? name.slice(0, sepIdx).trim() : null;
  const homeName = sepIdx !== -1 ? name.slice(sepIdx + 4).trim() : null;

  const buildSide = (teamName) => {
    const team = findTeamByName(teamName, teamsNameMap);
    const colors = findSapColors(teamName ?? "", colorMap);
    return {
      id: team?.id ?? null,
      name: teamName ?? null,
      image_path: team?.image_path ?? null,
      colorPrimary: colors.colorPrimary,
      colorSecondary: colors.colorSecondary,
    };
  };

  return {
    fixture_id: item.id ?? null,
    league_id: item.league_id ?? null,
    name: item.name ?? null,
    starting_at: item.starting_at ?? null,
    homeTeam: buildSide(homeName),
    awayTeam: buildSide(awayName),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache data warm-up
// ─────────────────────────────────────────────────────────────────────────────

async function warmCacheLeagues() {
  try {
    let page = 1;
    let all = [];
    while (true) {
      const url = `${SM_BASE}/leagues?api_token=${SM_TOKEN}&include=currentSeason&page=${page}`;
      const resp = await fetchUrl(url);
      if (!resp?.data || !Array.isArray(resp.data)) break;
      all = all.concat(resp.data);
      if (!resp.pagination?.has_more) break;
      page++;
    }
    cacheSet("cache:leagues", all.map(transformCacheLeague));
  } catch (err) {
    console.warn("[startup] Cache leagues failed:", err.message);
  }
}

async function warmCacheTeams() {
  try {
    let page = 1;
    let all = [];
    while (true) {
      const url =
        `${SM_BASE}/teams?api_token=${SM_TOKEN}` +
        `&include=rankings;activeSeasons.league;sidelined.player;players.player` +
        `&per_page=50&page=${page}`;
      const resp = await fetchUrl(url);
      if (!resp?.data || !Array.isArray(resp.data)) break;
      all = all.concat(resp.data);
      if (!resp.pagination?.has_more) break;
      page++;
    }
    // Filter out gender-neutral placeholder teams (e.g. TBC) before caching
    const filtered = all.filter(
      (item) => (item.gender ?? "").toString().toLowerCase() !== "neutral",
    );
    const transformed = filtered.map(transformCacheTeam);
    cacheSet("cache:teams", transformed);
  } catch (err) {
    console.warn("[startup] Cache teams failed:", err.message);
  }
}

async function warmCacheFixturesFetch() {
  try {
    const { start, end } = getFixtureDateRange();
    let page = 1;
    let all = [];
    while (true) {
      const url = `${SM_BASE}/fixtures/between/${start}/${end}?api_token=${SM_TOKEN}&filters=populate&page=${page}&timezone=America/Toronto`;
      const resp = await fetchUrl(url);
      if (!resp?.data || !Array.isArray(resp.data)) break;
      all = all.concat(resp.data);
      if (!resp.pagination?.has_more) break;
      page++;
    }
    cacheSet("cache:fixtures:raw", all);
  } catch (err) {
    console.warn("[startup] Cache fixtures fetch failed:", err.message);
  }
}

function enrichCacheFixtures() {
  const rawEntry = cache.get("cache:fixtures:raw");
  if (!rawEntry?.data) return;
  const teamsNameMap = buildTeamsNameMap();
  const colorMap = buildSapColorMap();
  const enriched = rawEntry.data.map((f) =>
    transformCacheFixture(f, teamsNameMap, colorMap),
  );
  cacheSet("cache:fixtures", enriched);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /football/cache/leagues  —  all leagues (24 h TTL)
// ─────────────────────────────────────────────────────────────────────────────
app.get("/football/cache/leagues", (_req, res) => {
  const entry = cache.get("cache:leagues");
  if (!entry?.data) return res.status(503).json({ error: "Cache not ready" });
  setCacheControl(res, TTL_24H);
  res.json({ data: entry.data });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /football/cache/teams  —  all teams (24 h TTL)
// ─────────────────────────────────────────────────────────────────────────────
app.get("/football/cache/teams", (_req, res) => {
  const entry = cache.get("cache:teams");
  if (!entry?.data) return res.status(503).json({ error: "Cache not ready" });
  const colorMap = buildSapColorMap();
  const data = entry.data.map((t) => {
    const { colorPrimary } = findSapColors(t.name ?? "", colorMap);
    const { sidelined: _s, players: _p, ...rest } = t;
    return { ...rest, colorPrimary };
  });
  setCacheControl(res, TTL_24H);
  res.json({ data });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /football/cache/players  —  all players (squad + sidelined) from teams (24 h)
// ─────────────────────────────────────────────────────────────────────────────
app.get("/football/cache/players", (_req, res) => {
  const entry = cache.get("cache:teams");
  if (!entry?.data) return res.status(503).json({ error: "Cache not ready" });
  const colorMap = buildSapColorMap();
  const seen = new Set();
  const players = [];
  for (const team of entry.data) {
    const { colorPrimary } = findSapColors(team.name ?? "", colorMap);
    const addPlayer = (p) => {
      if (!p.player || seen.has(p.player_id)) return;
      seen.add(p.player_id);
      players.push({
        player_id: p.player_id,
        team_id: team.id,
        team_name: team.name,
        team_colorPrimary: colorPrimary,
        ...p.player,
      });
    };
    for (const p of team.players ?? []) addPlayer(p);
    for (const p of team.sidelined ?? []) addPlayer(p);
  }
  setCacheControl(res, TTL_24H);
  res.json({ data: players });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /football/cache/fixtures  —  enriched fixture window (24 h TTL)
// ─────────────────────────────────────────────────────────────────────────────
app.get("/football/cache/fixtures", (_req, res) => {
  const entry = cache.get("cache:fixtures");
  if (!entry?.data) return res.status(503).json({ error: "Cache not ready" });
  setCacheControl(res, TTL_24H);
  res.json({ data: entry.data });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /football/search  —  combined { leagues, teams, players, matches }
// ─────────────────────────────────────────────────────────────────────────────
app.get("/football/search", (_req, res) => {
  const leagues = cache.get("cache:leagues")?.data ?? [];
  const rawTeams = cache.get("cache:teams")?.data ?? [];
  const matches = cache.get("cache:fixtures")?.data ?? [];
  const colorMap = buildSapColorMap();

  // Teams: strip sidelined/players arrays, add colorPrimary
  const teams = rawTeams.map((t) => {
    const { colorPrimary } = findSapColors(t.name ?? "", colorMap);
    const { sidelined: _s, players: _p, ...rest } = t;
    return { ...rest, colorPrimary };
  });

  // Players: squad + sidelined, deduped, with team colorPrimary
  const seen = new Set();
  const players = [];
  for (const team of rawTeams) {
    const { colorPrimary } = findSapColors(team.name ?? "", colorMap);
    const addPlayer = (p) => {
      if (!p.player || seen.has(p.player_id)) return;
      seen.add(p.player_id);
      players.push({
        player_id: p.player_id,
        team_id: team.id,
        team_name: team.name,
        team_colorPrimary: colorPrimary,
        ...p.player,
      });
    };
    for (const p of team.players ?? []) addPlayer(p);
    for (const p of team.sidelined ?? []) addPlayer(p);
  }

  setCacheControl(res, TTL_24H);
  res.json({ leagues, teams, players, matches });
});

// Health & root
// ─────────────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  const entries = {};
  for (const [k, v] of cache.entries()) {
    entries[k] = { ageMs: Date.now() - v.fetchedAt };
  }
  res.json({ status: "ok", cachedKeys: cache.size, entries });
});

app.get("/", (_req, res) => {
  res.json({ message: "Football server running", port: PORT });
});

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
  // All independent fetches in parallel — SAP standings, league meta, and the
  // three bulk cache endpoints (1-3.txt) run simultaneously.
  await Promise.allSettled([
    warmSapStandings(),
    warmLeagueMeta(),
    warmCacheLeagues(),
    warmCacheTeams(),
    warmCacheFixturesFetch(),
  ]);
  // Enrich fixtures with team data + colors (requires phase above to complete).
  enrichCacheFixtures();

  // Auto-refresh bulk cache every 24 h.
  const id = setInterval(async () => {
    try {
      await Promise.allSettled([
        warmCacheLeagues(),
        warmCacheTeams(),
        warmCacheFixturesFetch(),
      ]);
      enrichCacheFixtures();
    } catch (e) {
      console.error("[auto-refresh] cache data:", e.message);
    }
  }, TTL_24H);
  refreshIntervals.set("cache:data", id);
}

app.listen(PORT, () => {
  init().catch((err) => console.error("[init] Fatal error:", err));
});

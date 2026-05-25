const express = require("express");
const axios = require("axios");
const cors = require("cors");
const compression = require("compression");
const msgpack = require("@msgpack/msgpack");

const app = express();
app.use(cors());
// enable gzip/deflate compression (and brotli when Node chooses)
app.use(compression());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Head URL for MLB stats API
const BASE_URL = "https://statsapi.mlb.com/api/";

// Cache store: { [key]: { data, fetchedAt } }
const cache = new Map();
const TTL_MS = 30 * 60 * 1000; // 30 minutes
// Map of refresh intervals for keys that should be kept refreshed
const refreshIntervals = new Map();
// track special modes for bracket polling
const bracketModes = new Map();

// ----------------------------------------------------------------------------
// sports-favs MLB notifications state
// ----------------------------------------------------------------------------
const mlbNotifSubscribers = new Map();
const mlbNotifState = {
  dateStr: null,
  suspendUntilMs: 0,
  doneForDate: false,
  gameStates: new Map(),
};

const MLB_NOTIF_POLL_MS = 5000;
const MLB_NOTIF_PRE_START_MS = 30 * 60 * 1000;
const MLB_NOTIF_IDLE_RETRY_MS = 5 * 60 * 1000;

function getDatePartsInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const out = {};
  for (const p of parts) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
  };
}

function toIsoDateFromParts({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getMlbNotifDatePst() {
  const now = new Date();
  const pst = getDatePartsInTimeZone(now, "America/Los_Angeles");
  const base = new Date(Date.UTC(pst.year, pst.month - 1, pst.day));
  if (pst.hour < 2) {
    base.setUTCDate(base.getUTCDate() - 1);
  }
  return toIsoDateFromParts({
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
  });
}

function getMlbScheduleNotifyPath(dateStr) {
  const fields =
    "dates,games,gamePk,gameDate,status,codedGameState,detailedState,teams,away,team,id,name,score,isWinner,home,scoringPlays,result,description,awayScore,homeScore,about,halfInning,inning";
  return `v1/schedule/games/?sportId=1&startDate=${encodeURIComponent(dateStr)}&endDate=${encodeURIComponent(dateStr)}&hydrate=hydrations,scoringplays&fields=${encodeURIComponent(fields)}`;
}

async function fetchMlbScheduleForNotifications(dateStr) {
  const path = getMlbScheduleNotifyPath(dateStr);
  const url = `${BASE_URL}${path}`;
  const res = await axios.get(url, { timeout: 10000 });
  return res.data || { dates: [] };
}

function flattenGames(payload) {
  const dates = Array.isArray(payload?.dates) ? payload.dates : [];
  return dates.flatMap((d) => (Array.isArray(d?.games) ? d.games : []));
}

function isGameStarted(game) {
  const code = String(game?.status?.codedGameState || "").toUpperCase();
  const detailed = String(game?.status?.detailedState || "").toLowerCase();
  if (detailed.includes("pre-game") || detailed.includes("scheduled"))
    return false;
  return !["P", "S"].includes(code);
}

function isGameFinished(game) {
  const code = String(game?.status?.codedGameState || "").toUpperCase();
  const detailed = String(game?.status?.detailedState || "").toLowerCase();
  if (["F", "O", "R", "D", "C"].includes(code)) return true;
  return (
    detailed.includes("final") ||
    detailed.includes("postponed") ||
    detailed.includes("cancelled") ||
    detailed.includes("completed")
  );
}

const TEAM_NAMES = {
  108: "Angels",
  109: "Diamondbacks",
  110: "Orioles",
  111: "Red Sox",
  112: "Cubs",
  113: "Reds",
  114: "Guardians",
  115: "Rockies",
  116: "Tigers",
  117: "Astros",
  118: "Royals",
  119: "Dodgers",
  120: "Nationals",
  121: "Mets",
  133: "Athletics",
  134: "Pirates",
  135: "Padres",
  136: "Mariners",
  137: "Giants",
  138: "Cardinals",
  139: "Rays",
  140: "Rangers",
  141: "Blue Jays",
  142: "Twins",
  143: "Phillies",
  144: "Braves",
  145: "White Sox",
  146: "Marlins",
  147: "Yankees",
  158: "Brewers",
};

function getTeamName(team) {
  const id = String(team?.id || "");
  return TEAM_NAMES[id] || team?.name || "Unknown Team";
}

function getTeamsForGame(game) {
  const away = game?.teams?.away?.team || {};
  const home = game?.teams?.home?.team || {};

  return {
    awayId: String(away.id || ""),
    homeId: String(home.id || ""),
    awayName: getTeamName(away),
    homeName: getTeamName(home),
  };
}

function getSubscribersForGame(game) {
  const { awayId, homeId } = getTeamsForGame(game);
  const out = [];
  for (const subscriber of mlbNotifSubscribers.values()) {
    if (!subscriber?.pushToken) continue;
    const favs = subscriber.favoriteTeamIds || new Set();
    if ((awayId && favs.has(awayId)) || (homeId && favs.has(homeId))) {
      out.push(subscriber);
    }
  }
  return out;
}

function normalizeExpoPushToken(rawToken) {
  const token = String(rawToken || "").trim();
  if (!token) return "";

  const wrappedMatch = token.match(/^ExponentPushToken\[(.+)\]$/i);
  if (wrappedMatch && wrappedMatch[1]) {
    return `ExponentPushToken[${wrappedMatch[1]}]`;
  }

  if (token.toLowerCase().startsWith("exponentpushtoken[")) {
    return token;
  }

  return `ExponentPushToken[${token}]`;
}

async function sendExpoPushNotifications(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return;
  const batches = [];
  for (let i = 0; i < messages.length; i += 100) {
    batches.push(messages.slice(i, i + 100));
  }

  for (const batch of batches) {
    try {
      // Log batch meta (count + message types)
      const types = [
        ...new Set((batch || []).map((m) => m?.data?.type || "unknown")),
      ];
      console.log(
        `[sports-favs] sending push batch size=${batch.length} types=${types.join(",")}`,
      );
      const resp = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(batch),
      });

      // Log response status for observability
      try {
        const bodyText = await resp.text();
        console.log(
          `[sports-favs] Expo push response status=${resp.status} body=${bodyText.slice(0, 200)}`,
        );
      } catch (e) {
        console.log(
          `[sports-favs] Expo push response status=${resp.status} (no body)`,
        );
      }
    } catch (e) {
      console.warn("[sports-favs] Expo push send failed:", e.message);
    }
  }
}

function buildScoringHash(play) {
  const result = play?.result || {};
  return [
    String(result.description || ""),
    String(result.awayScore ?? ""),
    String(result.homeScore ?? ""),
  ].join("|");
}

function ensureGameState(gamePk) {
  const key = String(gamePk || "");
  if (!mlbNotifState.gameStates.has(key)) {
    mlbNotifState.gameStates.set(key, {
      startedSent: false,
      scoringHashes: new Set(),
      finishedSent: false,
    });
  }
  return mlbNotifState.gameStates.get(key);
}

function ordinalSuffix(n) {
  const s = ["th", "st", "nd", "rd"],
    v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

async function processMlbNotificationsTick() {
  const now = Date.now();
  const dateStr = getMlbNotifDatePst();

  if (mlbNotifState.dateStr !== dateStr) {
    mlbNotifState.dateStr = dateStr;
    mlbNotifState.suspendUntilMs = 0;
    mlbNotifState.doneForDate = false;
    mlbNotifState.gameStates = new Map();
  }

  if (mlbNotifState.doneForDate) return;
  if (mlbNotifState.suspendUntilMs && now < mlbNotifState.suspendUntilMs)
    return;

  const payload = await fetchMlbScheduleForNotifications(dateStr);
  const games = flattenGames(payload);

  if (games.length === 0) {
    mlbNotifState.suspendUntilMs = now + MLB_NOTIF_IDLE_RETRY_MS;
    return;
  }

  const firstStartMs = games
    .map((g) => new Date(g?.gameDate || "").getTime())
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => a - b)[0];

  if (Number.isFinite(firstStartMs)) {
    const pollStart = firstStartMs - MLB_NOTIF_PRE_START_MS;
    const anyStarted = games.some((g) => isGameStarted(g));
    if (!anyStarted && now < pollStart) {
      mlbNotifState.suspendUntilMs = pollStart;
      return;
    }
  }

  const allFinished = games.every((g) => isGameFinished(g));

  const pushQueue = [];
  for (const game of games) {
    const gamePk = String(game?.gamePk || "");
    if (!gamePk) continue;

    const gameState = ensureGameState(gamePk);
    const subscribers = getSubscribersForGame(game);
    if (subscribers.length === 0) continue;

    const { awayName, homeName } = getTeamsForGame(game);

    if (isGameStarted(game) && !gameState.startedSent) {
      gameState.startedSent = true;
      for (const sub of subscribers) {
        pushQueue.push({
          to: sub.pushToken,
          sound: "default",
          title: `⚾ ${awayName} at ${homeName}`,
          body: "Game has started",
          data: {
            sport: "mlb",
            gamePk,
            type: "mlb_game_started",
          },
        });
      }
    }

    const scoringPlays = Array.isArray(game?.scoringPlays)
      ? game.scoringPlays
      : [];
    for (const play of scoringPlays) {
      const hash = buildScoringHash(play);
      if (!hash || gameState.scoringHashes.has(hash)) continue;
      gameState.scoringHashes.add(hash);

      const desc = String(play?.result?.description || "Scoring play")
        .split(".")[0]
        .trim();
      const inningText = `(${play?.about?.halfInning === "Top" ? "Top" : "Bot"} ${ordinalSuffix(play?.about?.inning || "?")})`;
      // Determine scoring team: top of inning -> away scored, bottom -> home scored
      const isTop = play?.about?.halfInning === "top";
      const awayScore = Number(
        play?.result?.awayScore ?? game?.teams?.away?.score ?? 0,
      );
      const homeScore = Number(
        play?.result?.homeScore ?? game?.teams?.home?.score ?? 0,
      );

      const awayScoreDisplay = isTop ? `[${awayScore}]` : `${awayScore}`;
      const homeScoreDisplay = !isTop ? `[${homeScore}]` : `${homeScore}`;

      const title = `⚾ ${awayName} ${awayScoreDisplay} - ${homeScoreDisplay} ${homeName}`;

      for (const sub of subscribers) {
        pushQueue.push({
          to: sub.pushToken,
          sound: "default",
          title,
          body: `${inningText} ${desc}`,
          data: {
            sport: "mlb",
            gamePk,
            type: "mlb_scoring_play",
          },
        });
      }
    }

    // Send finished-game notification (one per game)
    if (isGameFinished(game) && !gameState.finishedSent) {
      gameState.finishedSent = true;
      const awayFinal = String(game?.teams?.away?.score ?? "0");
      const homeFinal = String(game?.teams?.home?.score ?? "0");
      const awayWinner = game?.teams?.away?.isWinner;
      const homeWinner = game?.teams?.home?.isWinner;
      const finalTitle = `⚾ ${awayName} ${awayFinal} - ${homeFinal} ${homeName}`;
      const FinalText =
        awayWinner && homeWinner
          ? homeWinner
            ? `The ${homeName} Win the Game`
            : `The ${awayName} Win the Game`
          : "Game Ended";
      for (const sub of subscribers) {
        pushQueue.push({
          to: sub.pushToken,
          sound: "default",
          title: finalTitle,
          body: FinalText,
          data: {
            sport: "mlb",
            gamePk,
            type: "mlb_game_finished",
          },
        });
      }
    }
  }

  await sendExpoPushNotifications(pushQueue);

  if (allFinished) {
    mlbNotifState.doneForDate = true;
    mlbNotifState.suspendUntilMs = Number.MAX_SAFE_INTEGER;
  } else {
    mlbNotifState.suspendUntilMs = 0;
  }
}

function startMlbNotificationsLoop() {
  setInterval(async () => {
    try {
      await processMlbNotificationsTick();
    } catch (e) {
      console.warn("[sports-favs] notification tick failed:", e.message);
    }
  }, MLB_NOTIF_POLL_MS);
}

// Embedded explicit allowedTree literal to preserve selected starred fields
// NOTE: This is a static whitelist embedded to avoid runtime file reads.
const allowedTree = {
  gameData: {
    game: {
      pk: true,
      type: true,
    },
    datetime: { dateTime: true, dayNight: true },
    status: { codedGameState: true, detailedState: true },
    teams: {
      away: {
        id: true,
        name: true,
        abbreviation: true,
      },
      home: {
        id: true,
        name: true,
        abbreviation: true,
      },
    },
    players: {
      "*": {
        id: true,
        fullName: true,
        currentAge: true,
        height: true,
        batSide: { code: true },
        pitchHand: { code: true },
      },
    },
    venue: { name: true, fieldInfo: true },
    weather: { condition: true, temp: true, wind: true },
    gameInfo: { attendance: true, firstPitch: true, gameDurationMinutes: true },
    probablePitchers: { away: { id: true }, home: { id: true } },
  },
  liveData: {
    plays: {
      allPlays: {
        "*": {
          result: {
            type: true,
            event: true,
            description: true,
            awayScore: true,
            homeScore: true,
          },
          about: { isTopInning: true, inning: true, isScoringPlay: true },
          count: { balls: true, strikes: true, outs: true },
          matchup: {
            batter: { id: true },
            pitcher: { id: true },
            postOnFirst: true,
            postOnSecond: true,
            postOnThird: true,
            splits: { menOnBase: true },
          },
          playEvents: {
            "*": {
              details: {
                call: true,
                description: true,
                event: true,
                type: true,
              },
              count: { balls: true, strikes: true, outs: true },
              pitchData: {
                startSpeed: true,
                strikeZoneTop: true,
                strikeZoneBottom: true,
                coordinates: true,
                breaks: true,
                plateTime: true,
              },
              hitData: {
                launchSpeed: true,
                launchAngle: true,
                totalDistance: true,
              },
            },
          },
        },
      },
      currentPlay: {
        result: {
          type: true,
          event: true,
          description: true,
          awayScore: true,
          homeScore: true,
        },
        about: { isTopInning: true, inning: true, isScoringPlay: true },
        count: { balls: true, strikes: true, outs: true },
        matchup: {
          batter: { id: true },
          pitcher: { id: true },
          postOnFirst: true,
          postOnSecond: true,
          postOnThird: true,
          splits: { menOnBase: true },
        },
        playEvents: {
          "*": {
            details: { call: true, description: true, event: true, type: true },
            count: { balls: true, strikes: true, outs: true },
            pitchData: {
              startSpeed: true,
              endSpeed: true,
              strikeZoneTop: true,
              strikeZoneBottom: true,
              coordinates: true,
              breaks: true,
              plateTime: true,
            },
            hitData: {
              launchSpeed: true,
              launchAngle: true,
              totalDistance: true,
            },
          },
        },
      },
    },
    linescore: {
      currentInning: true,
      isTopInning: true,
      innings: { num: true, home: true, away: true },
      teams: true,
      offense: {
        "*": {
          id: true,
        },
      },
    },
    boxscore: {
      teams: {
        "*": {
          team: { id: true },
          teamStats: {
            "*": {
              runs: true,
              homeRuns: true,
              strikeOuts: true,
              baseOnBalls: true,
              hits: true,
              avg: true,
              atBats: true,
              obp: true,
              slg: true,
              ops: true,
              stolenBases: true,
              totalBases: true,
              rbi: true,
              era: true,
              whip: true,
              strikePercentage: true,
            },
          },
          players: {
            "*": {
              person: { id: true },
              jerseyNumber: true,
              position: { name: true, abbreviation: true },
              stats: {
                "*": {
                  summary: true,
                  runs: true,
                  homeRuns: true,
                  strikeOuts: true,
                  baseOnBalls: true,
                  hits: true,
                  atBats: true,
                  obp: true,
                  slg: true,
                  ops: true,
                  plateAppearances: true,
                  stolenBases: true,
                  totalBases: true,
                  leftOnBase: true,
                  rbi: true,
                  era: true,
                  whip: true,
                  numberOfPitches: true,
                  inningsPitched: true,
                  battersFaced: true,
                  balls: true,
                  strikes: true,
                  strikePercentage: true,
                  assists: true,
                  putOuts: true,
                },
              },
              seasonStats: {
                pitching: {
                  era: true,
                  wins: true,
                  losses: true,
                  inningsPitched: true,
                },
              },
              gameStatus: { isOnBench: true, isSubstitute: true },
              pitches: true,
            },
          },
          batters: true,
          pitchers: true,
          bench: true,
          bullpen: true,
          battingOrder: true,
        },
      },
      officials: {
        "*": {
          official: { fullName: true },
          officialType: true,
        },
      },
    },
  },
};

function pruneWithTree(obj, tree) {
  if (tree === true) return obj;
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  // Arrays: apply element tree (use '*' entry if present)
  if (Array.isArray(obj)) {
    const elementTree = (tree && tree["*"]) || tree;
    return obj
      .map((it) => pruneWithTree(it, elementTree === true ? true : elementTree))
      .filter((v) => v !== undefined);
  }

  const out = {};
  for (const k of Object.keys(obj)) {
    let childTree = undefined;
    if (tree && Object.prototype.hasOwnProperty.call(tree, k))
      childTree = tree[k];
    else if (tree && Object.prototype.hasOwnProperty.call(tree, "*"))
      childTree = tree["*"];
    if (childTree === undefined) continue;
    if (childTree === true) {
      out[k] = obj[k];
    } else {
      const pr = pruneWithTree(obj[k], childTree);
      if (pr !== undefined) out[k] = pr;
    }
  }
  return out;
}

// Helper for custom TTL/cache builders
async function getCachedCustom(key, ttlMs, builder) {
  const entry = cache.get(key);
  if (entry) {
    const age = Date.now() - entry.fetchedAt;
    if (age < ttlMs) {
      return { data: entry.data, fromCache: true };
    }
  }
  const data = await builder();
  cache.set(key, { data, fetchedAt: Date.now() });
  return { data, fromCache: false };
}

// helper to set Cache-Control and ETag-safe headers for cached responses
function setCachingHeaders(res, ttlMs) {
  // public caching for ttlMs seconds
  const secs = Math.max(0, Math.floor((ttlMs || TTL_MS) / 1000));
  res.setHeader("Cache-Control", `public, max-age=${secs}`);
}

async function fetchAndCache(key, url) {
  try {
    const res = await axios.get(url, { timeout: 10000 });
    const payload = res.data;
    cache.set(key, { data: payload, fetchedAt: Date.now() });
    console.log(`Fetched and cached ${key}`);
    return { data: payload, fromCache: false };
  } catch (err) {
    console.error(`Error fetching ${url}:`, err.message);
    throw err;
  }
}

async function getCached(key, url) {
  const entry = cache.get(key);
  if (entry) {
    const age = Date.now() - entry.fetchedAt;
    if (age < TTL_MS) {
      return { data: entry.data, fromCache: true };
    }
  }
  return await fetchAndCache(key, url);
}

// Specific endpoint required by the user
app.get("/leagues", async (req, res) => {
  const path = "v1/leagues?sportId=51";
  const url = `${BASE_URL}${path}`;
  const key = path;
  try {
    const { data, fromCache } = await getCached(key, url);
    setCachingHeaders(res, TTL_MS);
    setCachingHeaders(res, SEARCH_TTL_MS);
    res.json({ source: fromCache ? "cache" : "origin", data });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch leagues", details: err.message });
  }
});

// Generic proxy for future endpoints (caches per path+query)
app.get("/proxy/*", async (req, res) => {
  const path = req.params[0] || "";
  const qs = req.url.split("?")[1] || "";
  const fullPath = qs ? `${path}?${qs}` : path;
  const url = `${BASE_URL}${fullPath}`;
  const key = fullPath;
  try {
    const { data, fromCache } = await getCached(key, url);
    setCachingHeaders(res, TTL_MS);
    res.json({ source: fromCache ? "cache" : "origin", data });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch proxy", details: err.message });
  }
});

// Health-check
app.get("/health", (req, res) => {
  const entries = {};
  for (const [k, v] of cache.entries()) {
    entries[k] = { ageMs: Date.now() - v.fetchedAt };
  }
  res.json({ status: "ok", cachedKeys: Object.keys(entries).length, entries });
});

app.post("/bb/notifications/register-device", (req, res) => {
  const subscriberId = String(req.body?.subscriberId || "").trim();
  const pushToken = String(req.body?.pushToken || "").trim();
  const platform = String(req.body?.platform || "unknown").trim();

  if (!subscriberId) {
    return res.status(400).json({ error: "subscriberId is required" });
  }

  const existing = mlbNotifSubscribers.get(subscriberId) || {
    subscriberId,
    favoriteTeamIds: new Set(),
  };

  if (pushToken) existing.pushToken = pushToken;
  existing.platform = platform;
  existing.updatedAt = Date.now();
  mlbNotifSubscribers.set(subscriberId, existing);

  res.json({
    ok: true,
    subscriberId,
    hasPushToken: !!existing.pushToken,
    favoriteCount: existing.favoriteTeamIds.size,
  });
});

app.get("/bb/notifications/favorites/:subscriberId", (req, res) => {
  const subscriberId = String(req.params.subscriberId || "").trim();
  if (!subscriberId) {
    return res.status(400).json({ error: "subscriberId is required" });
  }

  const existing = mlbNotifSubscribers.get(subscriberId);
  if (!existing) {
    return res.json({ ok: true, subscriberId, favorites: [] });
  }

  return res.json({
    ok: true,
    subscriberId,
    favorites: [...existing.favoriteTeamIds],
  });
});

app.post("/bb/notifications/favorites/:subscriberId", (req, res) => {
  const subscriberId = String(req.params.subscriberId || "").trim();
  const teamId = String(req.body?.teamId || "").trim();
  const teamName = String(req.body?.teamName || "").trim();
  const enabled = !!req.body?.enabled;

  if (!subscriberId || !teamId) {
    return res
      .status(400)
      .json({ error: "subscriberId and teamId are required" });
  }

  const existing = mlbNotifSubscribers.get(subscriberId) || {
    subscriberId,
    favoriteTeamIds: new Set(),
  };

  if (enabled) {
    existing.favoriteTeamIds.add(teamId);
  } else {
    existing.favoriteTeamIds.delete(teamId);
  }

  if (teamName) {
    existing.lastTeamName = teamName;
  }
  existing.updatedAt = Date.now();
  mlbNotifSubscribers.set(subscriberId, existing);

  return res.json({
    ok: true,
    subscriberId,
    teamId,
    enabled,
    favorites: [...existing.favoriteTeamIds],
  });
});

app.get("/", (req, res) => {
  res.json({ message: "Baseball server running", baseUrl: BASE_URL });
});

// Manual test endpoint for sending notifications to a specific Expo push token.
// Pass the inner token value only, for example:
// POST /bb/notifications/test/wN30RqDxV2AJVoVlln96Rp/147/start
// The server will reconstruct it to ExponentPushToken[wN30RqDxV2AJVoVlln96Rp].
// Usage examples:
// POST /bb/notifications/test/:pushToken/:teamId/start
// POST /bb/notifications/test/:pushToken/:teamId/finish
// POST /bb/notifications/test/:pushToken/:teamId/score/:index?  (index is 1-based)
app.post(
  "/bb/notifications/test/:pushToken/:teamId/:action/:index?",
  async (req, res) => {
    try {
      const pushToken = String(req.params.pushToken || "").trim();
      const teamId = String(req.params.teamId || "").trim();
      const action = String(req.params.action || "")
        .trim()
        .toLowerCase();
      const idxRaw = req.params.index;

      const expoPushToken = normalizeExpoPushToken(pushToken);

      if (!expoPushToken)
        return res.status(400).json({ error: "pushToken is required" });
      if (!teamId) return res.status(400).json({ error: "teamId is required" });

      const dateStr = getMlbNotifDatePst();
      const payload = await fetchMlbScheduleForNotifications(dateStr);
      const games = flattenGames(payload);

      // find a game that includes the teamId as away or home
      const game = games.find((g) => {
        const { awayId, homeId } = getTeamsForGame(g);
        return (
          String(awayId) === String(teamId) || String(homeId) === String(teamId)
        );
      });

      if (!game) {
        return res.status(404).json({
          error: "No game found for that team on the notification date",
        });
      }

      const { awayName, homeName } = getTeamsForGame(game);
      const gamePk = String(game?.gamePk || "");

      const messages = [];

      if (action === "start") {
        messages.push({
          to: expoPushToken,
          sound: "default",
          title: `⚾ ${awayName} at ${homeName}`,
          body: "Game has started",
          data: { sport: "mlb", gamePk, type: "mlb_game_started" },
        });
      } else if (action === "finish" || action === "final") {
        const awayFinal = String(game?.teams?.away?.score ?? "0");
        const homeFinal = String(game?.teams?.home?.score ?? "0");
        const awayWinner = game?.teams?.away?.isWinner;
        const homeWinner = game?.teams?.home?.isWinner;
        const finalTitle = `⚾ ${awayName} ${awayFinal} - ${homeFinal} ${homeName}`;
        const FinalText =
          awayWinner && homeWinner
            ? homeWinner
              ? `The ${homeName} Win the Game`
              : `The ${awayName} Win the Game`
            : "Game Ended";
        messages.push({
          to: expoPushToken,
          sound: "default",
          title: finalTitle,
          body: FinalText,
          data: { sport: "mlb", gamePk, type: "mlb_game_finished" },
        });
      } else if (action === "score" || action === "scoring") {
        const scoringPlays = Array.isArray(game?.scoringPlays)
          ? game.scoringPlays
          : [];
        if (scoringPlays.length === 0) {
          messages.push({
            to: expoPushToken,
            sound: "default",
            title: `${awayName} at ${homeName}`,
            body: "No scoring plays available for this game",
            data: { sport: "mlb", gamePk, type: "mlb_scoring_play" },
          });
        } else {
          let index = null;
          if (idxRaw !== undefined) {
            const parsed = Number.parseInt(String(idxRaw), 10);
            if (Number.isFinite(parsed) && parsed > 0) index = parsed - 1;
          }
          if (index === null || index < 0) index = scoringPlays.length - 1;
          if (index >= scoringPlays.length) index = scoringPlays.length - 1;

          const play = scoringPlays[index];
          const desc = String(play?.result?.description || "Scoring play")
            .split(".")[0]
            .trim();
          const inningText = `(${play?.about?.halfInning === "Top" ? "Top" : "Bot"} ${ordinalSuffix(play?.about?.inning || "?")})`;
          const isTop =
            play?.about?.halfInning === "top" ||
            play?.about?.isTopInning === true;
          const awayScore = Number(
            play?.result?.awayScore ?? game?.teams?.away?.score ?? 0,
          );
          const homeScore = Number(
            play?.result?.homeScore ?? game?.teams?.home?.score ?? 0,
          );

          const awayScoreDisplay = isTop ? `[${awayScore}]` : `${awayScore}`;
          const homeScoreDisplay = !isTop ? `[${homeScore}]` : `${homeScore}`;
          const title = `⚾ ${awayName} ${awayScoreDisplay} - ${homeScoreDisplay} ${homeName}`;

          messages.push({
            to: expoPushToken,
            sound: "default",
            title,
            body: `${inningText} ${desc}`,
            data: { sport: "mlb", gamePk, type: "mlb_scoring_play" },
          });
        }
      } else {
        return res.status(400).json({ error: `Unknown action: ${action}` });
      }

      await sendExpoPushNotifications(messages);
      return res.json({ ok: true, sent: messages.length, messages });
    } catch (e) {
      console.error("Test notification error:", e?.message || e);
      return res.status(500).json({
        error: "Failed to send test notification",
        details: e?.message || String(e),
      });
    }
  },
);

// Warm cache for leagues on startup and refresh periodically
const LEAGUES_PATH = "v1/leagues?sportId=51";
async function warmLeagues() {
  const url = `${BASE_URL}${LEAGUES_PATH}`;
  try {
    await fetchAndCache(LEAGUES_PATH, url);
  } catch (err) {
    console.warn("Warm-up fetch failed:", err.message);
  }
}

// Teams
const TEAMS_PATH =
  "v1/teams?leagueIds=159,160&fields=teams,id,name,venue,name,abbreviation,locationName,league,id,name,division,id,name";
async function warmTeams() {
  const url = `${BASE_URL}${TEAMS_PATH}`;
  try {
    await fetchAndCache(TEAMS_PATH, url);
  } catch (err) {
    console.warn("Warm-up teams failed:", err.message);
  }
}

app.get("/wbc/teams", async (req, res) => {
  const path = TEAMS_PATH;
  const url = `${BASE_URL}${path}`;
  const key = path;
  try {
    const { data, fromCache } = await getCached(key, url);
    // ensure we have a refresh interval for teams
    if (!refreshIntervals.has(key)) {
      const id = setInterval(
        () => fetchAndCache(key, url).catch(() => {}),
        TTL_MS,
      );
      refreshIntervals.set(key, id);
    }
    setCachingHeaders(res, TTL_MS);
    res.json({ source: fromCache ? "cache" : "origin", data });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch teams", details: err.message });
  }
});

// Players
const PLAYERS_PATH =
  "v1/sports/51/players?fields=people,id,fullName,primaryNumber,currentTeam,id,primaryPosition,name,abbreviation";
async function warmPlayers() {
  const url = `${BASE_URL}${PLAYERS_PATH}`;
  try {
    await fetchAndCache(PLAYERS_PATH, url);
  } catch (err) {
    console.warn("Warm-up players failed:", err.message);
  }
}

app.get("/wbc/players", async (req, res) => {
  const path = PLAYERS_PATH;
  const url = `${BASE_URL}${path}`;
  const key = path;
  try {
    const { data, fromCache } = await getCached(key, url);
    // ensure we have a refresh interval for players
    if (!refreshIntervals.has(key)) {
      const id = setInterval(
        () => fetchAndCache(key, url).catch(() => {}),
        TTL_MS,
      );
      refreshIntervals.set(key, id);
    }
    setCachingHeaders(res, TTL_MS);
    res.json({ source: fromCache ? "cache" : "origin", data });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch players", details: err.message });
  }
});

// Team schedule - merge schedule data for a team for 2025
app.get("/wbc/teamSchedule/:code", async (req, res) => {
  const code = req.params.code;
  if (!code) return res.status(400).json({ error: "team code required" });

  const FIELDS =
    "dates,games,gamePk,gameType,gameDate,status,codedGameState,detailedState,teams,away,team,id,name,leagueRecord,wins,losses,score,home,team,id,name,leagueRecord,wins,losses,score,venue,name,seriesDescription,description";
  const path = `v1/schedule/games?teamId=${encodeURIComponent(code)}&sportId=51&startDate=2025-01-01&endDate=2025-12-31&fields=${encodeURIComponent(FIELDS)}`;
  const url = `${BASE_URL}${path}`;
  const key = `teamSchedule:${code}:2025`;

  try {
    // fetch both 2025 and 2026 schedules (each uses 30m TTL via existing getCached)
    const path2025 = `v1/schedule/games?teamId=${encodeURIComponent(code)}&sportId=51&startDate=2025-01-01&endDate=2025-12-31&fields=${encodeURIComponent(FIELDS)}`;
    const url2025 = `${BASE_URL}${path2025}`;
    const path2026 = `v1/schedule/games?teamId=${encodeURIComponent(code)}&sportId=51&startDate=2026-01-01&endDate=2026-12-31&fields=${encodeURIComponent(FIELDS)}`;
    const url2026 = `${BASE_URL}${path2026}`;

    const [
      { data: payload2025, fromCache: fromCache2025 },
      { data: payload2026, fromCache: fromCache2026 },
    ] = await Promise.all([
      getCached(path2025, url2025),
      getCached(path2026, url2026),
    ]);

    // payload.dates -> flatten games and dedupe by gamePk
    const gamesMap = new Map();
    const addPayloadDates = (payload) => {
      if (!payload || !Array.isArray(payload.dates)) return;
      for (const dateObj of payload.dates) {
        if (!Array.isArray(dateObj.games)) continue;
        for (const g of dateObj.games) {
          gamesMap.set(g.gamePk, g);
        }
      }
    };
    addPayloadDates(payload2025);
    addPayloadDates(payload2026);

    // Group by date (YYYY-MM-DD) and build dates array
    const byDate = new Map();
    for (const g of gamesMap.values()) {
      const dateOnly = (g.gameDate || "").split("T")[0] || "unknown";
      if (!byDate.has(dateOnly)) byDate.set(dateOnly, []);
      byDate.get(dateOnly).push(g);
    }

    const dates = Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, games]) => ({ date, games }));

    // cache merged schedule under our custom key for 30 minutes
    cache.set(key, { data: { dates }, fetchedAt: Date.now() });
    // set periodic refresh if not present - refresh both year sources
    if (!refreshIntervals.has(key)) {
      const id = setInterval(() => {
        fetchAndCache(path2025, url2025).catch(() => {});
        fetchAndCache(path2026, url2026).catch(() => {});
      }, TTL_MS);
      refreshIntervals.set(key, id);
    }

    // consider cached if both sources were cached
    const fromCache = fromCache2025 && fromCache2026;
    setCachingHeaders(res, TTL_MS);
    res.json({ source: fromCache ? "cache" : "origin", data: { dates } });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch team schedule", details: err.message });
  }
});

// Bracket endpoint with dynamic polling (30m default, 5s when live/near start)
app.get("/wbc/bracket", async (req, res) => {
  const path = `v1/schedule/games?sportId=51&startDate=2026-03-13&endDate=2026-03-17&fields=${encodeURIComponent(
    "dates,date,games,gamePk,gameType,gameDate,status,codedGameState,detailedState,teams,away,team,id,name,leagueRecord,wins,losses,score,isWinner,home,team,id,name,leagueRecord,wins,losses,score,isWinner,venue,name,dayNight,description,seriesDescription,description",
  )}`;
  const url = `${BASE_URL}${path}`;
  const key = path;

  function evaluateNeedsFastPolling(payload) {
    if (!payload || !Array.isArray(payload.dates)) return false;
    const now = new Date();
    let anyScheduledWithin5Min = false;
    for (const d of payload.dates) {
      if (!Array.isArray(d.games)) continue;
      for (const g of d.games) {
        const detailed = g?.status?.detailedState;
        // if any game is in a state other than Scheduled or Final -> fast
        if (detailed && detailed !== "Scheduled" && detailed !== "Final")
          return true;
        if (detailed === "Scheduled" && g.gameDate) {
          const gd = new Date(g.gameDate);
          const diff = gd - now;
          if (diff <= 5 * 60 * 1000 && diff >= 0) anyScheduledWithin5Min = true;
        }
      }
    }
    return anyScheduledWithin5Min;
  }

  async function bracketPollIteration() {
    try {
      const { data } = await fetchAndCache(key, url);
      const needFast = evaluateNeedsFastPolling(data);
      const currentMode = bracketModes.get(key) || "normal";
      const desired = needFast ? "fast" : "normal";
      if (currentMode !== desired) {
        // switch interval
        const id = refreshIntervals.get(key);
        if (id) clearInterval(id);
        bracketModes.set(key, desired);
        const intervalMs = needFast ? 5000 : TTL_MS;
        const newId = setInterval(
          () => bracketPollIteration().catch(() => {}),
          intervalMs,
        );
        refreshIntervals.set(key, newId);
      }
      return data;
    } catch (e) {
      // swallow - the interval will try again
      return null;
    }
  }

  try {
    const { data, fromCache } = await getCached(key, url);

    // ensure a polling interval exists for bracket that can switch modes
    if (!refreshIntervals.has(key)) {
      const needFast = evaluateNeedsFastPolling(data);
      bracketModes.set(key, needFast ? "fast" : "normal");
      const intervalMs = needFast ? 5000 : TTL_MS;
      const id = setInterval(
        () => bracketPollIteration().catch(() => {}),
        intervalMs,
      );
      refreshIntervals.set(key, id);
    }

    setCachingHeaders(res, TTL_MS);
    res.json({ source: fromCache ? "cache" : "origin", data });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch bracket", details: err.message });
  }
});

// Games endpoint: accepts `date=YYYYMMDD` or `date=YYYYMMDD-YYYYMMDD` (range)
app.get("/wbc/games", async (req, res) => {
  const raw = req.query.date || req.query.d || req.query.dates;
  if (!raw)
    return res
      .status(400)
      .json({ error: "date query required (YYYYMMDD or YYYYMMDD-YYYYMMDD)" });

  const toIso = (s) => {
    if (!s || typeof s !== "string" || s.length !== 8) return null;
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  };

  let path;
  try {
    if (raw.includes("-")) {
      const parts = raw.split("-");
      if (parts.length !== 2) throw new Error("invalid range");
      const start = toIso(parts[0]);
      const end = toIso(parts[1]);
      if (!start || !end) throw new Error("invalid date format");
      path = `v1/schedule/games?sportId=51&startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&hydrate=linescore&fields=${encodeURIComponent(
        "dates,date,games,linescore,currentInning,isTopInning,balls,strikes,outs,gamePk,gameType,gameDate,status,codedGameState,detailedState,teams,away,team,id,name,leagueRecord,wins,losses,score,isWinner,home,team,id,name,leagueRecord,wins,losses,score,isWinner,venue,name,dayNight,description,seriesDescription",
      )}`;
    } else {
      const iso = toIso(raw);
      if (!iso) throw new Error("invalid date format");
      path = `v1/schedule/games?sportId=51&date=${encodeURIComponent(iso)}&hydrate=linescore&fields=${encodeURIComponent(
        "dates,date,games,linescore,currentInning,isTopInning,balls,strikes,outs,gamePk,gameType,gameDate,status,codedGameState,detailedState,teams,away,team,id,name,leagueRecord,wins,losses,score,isWinner,home,team,id,name,leagueRecord,wins,losses,score,isWinner,venue,name,dayNight,description,seriesDescription",
      )}`;
    }
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const url = `${BASE_URL}${path}`;
  const key = path;

  function evaluateNeedsFastPolling(payload) {
    if (!payload || !Array.isArray(payload.dates)) return false;
    const now = new Date();
    let anyScheduledWithin5Min = false;
    for (const d of payload.dates) {
      if (!Array.isArray(d.games)) continue;
      for (const g of d.games) {
        const detailed = g?.status?.detailedState;
        if (detailed && detailed !== "Scheduled" && detailed !== "Final")
          return true;
        if (detailed === "Scheduled" && g.gameDate) {
          const gd = new Date(g.gameDate);
          const diff = gd - now;
          if (diff <= 5 * 60 * 1000 && diff >= 0) anyScheduledWithin5Min = true;
        }
      }
    }
    return anyScheduledWithin5Min;
  }

  async function gamesPollIteration() {
    try {
      const { data } = await fetchAndCache(key, url);
      const needFast = evaluateNeedsFastPolling(data);
      const currentMode = bracketModes.get(key) || "normal";
      const desired = needFast ? "fast" : "normal";
      if (currentMode !== desired) {
        const id = refreshIntervals.get(key);
        if (id) clearInterval(id);
        bracketModes.set(key, desired);
        const intervalMs = needFast ? 5000 : TTL_MS;
        const newId = setInterval(
          () => gamesPollIteration().catch(() => {}),
          intervalMs,
        );
        refreshIntervals.set(key, newId);
      }
      return data;
    } catch (e) {
      return null;
    }
  }

  try {
    const { data, fromCache } = await getCached(key, url);
    // Always evaluate so we can set an accurate Cache-Control TTL
    const needFast = evaluateNeedsFastPolling(data);

    if (!refreshIntervals.has(key)) {
      bracketModes.set(key, needFast ? "fast" : "normal");
      const intervalMs = needFast ? 5000 : TTL_MS;
      const id = setInterval(
        () => gamesPollIteration().catch(() => {}),
        intervalMs,
      );
      refreshIntervals.set(key, id);
    }

    // Short TTL for live games so clients re-fetch every 5 s
    setCachingHeaders(res, needFast ? 5000 : TTL_MS);
    res.json({ source: fromCache ? "cache" : "origin", data });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch games", details: err.message });
  }
});

// Team roster - 40Man
app.get("/wbc/teamRoster/:code", async (req, res) => {
  const code = req.params.code;
  if (!code) return res.status(400).json({ error: "team code required" });

  const FIELDS =
    "roster,person,id,fullName,jerseyNumber,position,name,abbreviation,status,description";
  const path = `v1/teams/${encodeURIComponent(code)}/roster?fields=${encodeURIComponent(FIELDS)}&rosterType=40Man`;
  const url = `${BASE_URL}${path}`;
  const key = `teamRoster:${code}:40Man`;

  try {
    let { data, fromCache } = await getCached(path, url);

    // If roster is empty on initial fetch, try again with season=2025
    const isEmptyRoster =
      !data || !Array.isArray(data.roster) || data.roster.length === 0;
    if (isEmptyRoster) {
      const pathSeason = `${path}&season=2025`;
      const urlSeason = `${BASE_URL}${pathSeason}`;
      try {
        const seasonRes = await getCached(pathSeason, urlSeason).catch(
          () => null,
        );
        if (
          seasonRes &&
          seasonRes.data &&
          Array.isArray(seasonRes.data.roster) &&
          seasonRes.data.roster.length > 0
        ) {
          data = seasonRes.data;
          fromCache = false;
          // update primary cache key so subsequent requests use this result
          cache.set(key, { data, fetchedAt: Date.now() });
        }
      } catch (e) {
        // ignore fallback error
      }
    }

    // set periodic refresh if not present
    if (!refreshIntervals.has(key)) {
      const id = setInterval(
        () => fetchAndCache(path, url).catch(() => {}),
        TTL_MS,
      );
      refreshIntervals.set(key, id);
    }

    res.json({ source: fromCache ? "cache" : "origin", data });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch team roster", details: err.message });
  }
});

// Team coaches
app.get("/wbc/teamCoaches/:code", async (req, res) => {
  const code = req.params.code;
  if (!code) return res.status(400).json({ error: "team code required" });

  const path = `v1/teams/${encodeURIComponent(code)}/coaches?fields=roster,person,fullName`;
  const url = `${BASE_URL}${path}`;
  const key = `teamCoaches:${code}`;

  try {
    const { data, fromCache } = await getCached(path, url);

    const coaches = Array.isArray(data?.roster)
      ? data.roster.map((r) => ({
          fullName: r?.person?.fullName ?? null,
          jerseyNumber: r?.jerseyNumber ?? null,
          job: r?.job ?? null,
        }))
      : [];

    if (!refreshIntervals.has(key)) {
      const id = setInterval(
        () => fetchAndCache(path, url).catch(() => {}),
        TTL_MS,
      );
      refreshIntervals.set(key, id);
    }

    res.json({ source: fromCache ? "cache" : "origin", data: { coaches } });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch team coaches", details: err.message });
  }
});

// Team leaders
app.get("/wbc/teamLeaders/:code", async (req, res) => {
  const code = req.params.code;
  if (!code) return res.status(400).json({ error: "team code required" });

  const LEADER_CATEGORIES =
    "homeRuns,hits,atBats,runs,stolenBases,avg,obp,slg,ops,totalBases,rbi,strikeOuts,baseOnBalls,era,inningsPitched,whip,numberOfPitches";
  const FIELDS =
    "teamLeaders,leaderCategory,leaders,rank,value,person,id,fullName,statGroup";
  const path = `v1/teams/${encodeURIComponent(code)}/leaders?leaderCategories=${encodeURIComponent(LEADER_CATEGORIES)}&limit=40&fields=${encodeURIComponent(FIELDS)}`;
  const url = `${BASE_URL}${path}`;
  const key = `teamLeaders:${code}`;

  // category filters
  const hittingCategories = new Set([
    "homeRuns",
    "hits",
    "atBats",
    "runs",
    "stolenBases",
    "avg",
    "battingAverage",
    "obp",
    "onBasePercentage",
    "slg",
    "sluggingPercentage",
    "ops",
    "onBasePlusSlugging",
    "totalBases",
    "rbi",
    "runsBattedIn",
  ]);
  const pitchingCategories = new Set([
    "strikeOuts",
    "strikeouts",
    "baseOnBalls",
    "walks",
    "hits",
    "earnedRunAverage",
    "era",
    "inningsPitched",
    "walksAndHitsPerInningPitched",
    "whip",
    "numberOfPitches",
  ]);

  function friendlyName(cat) {
    if (!cat || typeof cat !== "string") return cat;
    // insert spaces before capitals and numbers
    let s = cat
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Za-z])([0-9])/g, "$1 $2")
      .replace(/([0-9])([A-Za-z])/g, "$1 $2");
    // split camelCase/underscores/dashes
    s = s.replace(/[_-]/g, " ");
    // capitalize words
    return s
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  try {
    const { data, fromCache } = await getCached(path, url);

    const persons = new Map();

    const teamLeaders = data?.teamLeaders ?? [];
    for (const entry of teamLeaders) {
      const category = entry.leaderCategory;
      const statGroup = entry.statGroup;

      // determine filtering rules
      const inHitting = hittingCategories.has(category);
      const inPitching = pitchingCategories.has(category);
      // if category is in hitting only, require statGroup === 'hitting'
      // if in pitching only, require statGroup === 'pitching'
      // if in both or neither, don't filter by statGroup
      const requireHitting = inHitting && !inPitching;
      const requirePitching = inPitching && !inHitting;

      const leaders = Array.isArray(entry.leaders) ? entry.leaders : [];
      for (const l of leaders) {
        if (!l?.person) continue;
        // apply statGroup filter
        if (requireHitting && statGroup !== "hitting") continue;
        if (requirePitching && statGroup !== "pitching") continue;

        const pid = String(l.person.id);
        if (!persons.has(pid)) {
          persons.set(pid, {
            id: l.person.id,
            fullName: l.person.fullName,
            stats: {},
          });
        }
        const p = persons.get(pid);
        const keyName = friendlyName(category);
        p.stats[keyName] = { rank: l.rank, value: l.value };
      }
    }

    // periodic refresh
    if (!refreshIntervals.has(key)) {
      const id = setInterval(
        () => fetchAndCache(path, url).catch(() => {}),
        TTL_MS,
      );
      refreshIntervals.set(key, id);
    }

    const result = { persons: Array.from(persons.values()) };
    res.json({ source: fromCache ? "cache" : "origin", data: result });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch team leaders", details: err.message });
  }
});

// Global leaders
app.get("/wbc/leaders", async (req, res) => {
  const LEADER_CATEGORIES =
    "homeRuns,hits,atBats,runs,stolenBases,avg,obp,slg,ops,totalBases,rbi,strikeOuts,baseOnBalls,era,inningsPitched,whip,numberOfPitches";
  const path = `v1/stats/leaders?leaderCategories=${encodeURIComponent(
    LEADER_CATEGORIES,
  )}&sportIds=51&limit=10&statGroup=hitting,pitching&fields=${encodeURIComponent(
    "leagueLeaders,leaderCategory,leaders,rank,value,team,id,name,person,id,fullName",
  )}`;
  const url = `${BASE_URL}${path}`;
  const key = path;

  try {
    const { data, fromCache } = await getCached(key, url);

    // Normalize the returned leagueLeaders structure to a compact shape
    const raw = data ?? {};
    const leagueLeaders = Array.isArray(raw.leagueLeaders)
      ? raw.leagueLeaders.map((entry) => {
          const leaders = Array.isArray(entry.leaders)
            ? entry.leaders.map((l) => ({
                rank: l.rank ?? null,
                value: l.value ?? null,
                person: l.person
                  ? { id: l.person.id, fullName: l.person.fullName }
                  : null,
                team: l.team ? { id: l.team.id, name: l.team.name } : null,
              }))
            : [];
          return { leaderCategory: entry.leaderCategory, leaders };
        })
      : [];

    // periodic refresh
    if (!refreshIntervals.has(key)) {
      const id = setInterval(
        () => fetchAndCache(key, url).catch(() => {}),
        TTL_MS,
      );
      refreshIntervals.set(key, id);
    }

    res.json({
      source: fromCache ? "cache" : "origin",
      data: { leagueLeaders },
    });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch leaders", details: err.message });
  }
});

// Team stats (combined seasons 2025 & 2026)
app.get("/wbc/stats", async (req, res) => {
  try {
    const seasons = ["2025", "2026"];
    const paths = seasons.map((season) => ({
      season,
      path: `v1/teams/stats?sportIds=51&group=hitting,pitching&season=${season}`,
    }));

    const results = await Promise.all(
      paths.map((p) => getCached(p.path, `${BASE_URL}${p.path}`)),
    );

    // allowed stat keys to keep
    const allowed = new Set([
      "gamesPlayed",
      "runs",
      "doubles",
      "triples",
      "homeRuns",
      "strikeOuts",
      "baseOnBalls",
      "hits",
      "avg",
      "atBats",
      "obp",
      "slg",
      "ops",
      "stolenBases",
      "totalBases",
      "rbi",
      "era",
      "inningsPitched",
      "whip",
      "earnedRuns",
      "shutouts",
      "strikePercentage",
      "strikeoutsPer9Inn",
    ]);

    function friendlyName(cat) {
      if (!cat || typeof cat !== "string") return cat;
      let s = cat
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Za-z])([0-9])/g, "$1 $2")
        .replace(/([0-9])([A-Za-z])/g, "$1 $2");
      s = s.replace(/[_-]/g, " ");
      return s
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }

    const teamMap = new Map();

    for (let i = 0; i < results.length; i++) {
      const season = paths[i].season;
      const data = results[i].data;
      const statsArr = data?.stats ?? [];

      for (const statEntry of statsArr) {
        const groupNameRaw =
          statEntry?.group?.displayName || statEntry?.group || "unknown";
        const groupKey = String(groupNameRaw).toLowerCase(); // hitting or pitching
        const splits = statEntry?.splits ?? [];

        for (const split of splits) {
          const team = split.team;
          if (!team || !team.id) continue;
          const tid = String(team.id);
          if (!teamMap.has(tid)) {
            teamMap.set(tid, {
              id: team.id,
              name: team.name,
              stats: { hitting: {}, pitching: {} },
            });
          }
          const teamObj = teamMap.get(tid);

          // filter stat object
          const rawStat = split.stat || {};
          const filtered = {};
          for (const k of Object.keys(rawStat)) {
            if (allowed.has(k)) {
              filtered[friendlyName(k)] = rawStat[k];
            }
          }

          // include rank
          const out = { rank: split.rank ?? null, stat: filtered };

          // attach under team.stats[groupKey][season]
          if (!teamObj.stats[groupKey]) teamObj.stats[groupKey] = {};
          teamObj.stats[groupKey][season] = out;
        }
      }
    }

    // build array
    const teams = Array.from(teamMap.values());

    res.json({ source: "origin", data: { teams } });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch stats", details: err.message });
  }
});

// Single player endpoint: profile, season stats, and gameLog
app.get("/wbc/player/:code", async (req, res) => {
  const code = req.params.code;
  if (!code) return res.status(400).json({ error: "player code required" });

  const pPath = `v1/people/${encodeURIComponent(code)}`;
  const seasonPath = `v1/people/${encodeURIComponent(code)}/stats?stats=season&group=hitting,pitching&sportId=51`;
  const gameLogPath = `v1/people/${encodeURIComponent(code)}/stats?stats=gameLog&group=hitting,pitching&sportId=51&gameType=R&gameType=D&gameType=L&gameType=W&gameType=F&gameType=S`;

  try {
    const [pRes, seasonRes, gameLogRes] = await Promise.all([
      getCached(pPath, `${BASE_URL}${pPath}`),
      getCached(seasonPath, `${BASE_URL}${seasonPath}`),
      getCached(gameLogPath, `${BASE_URL}${gameLogPath}`),
    ]);

    const peopleData = pRes?.data?.people
      ? pRes.data.people[0]
      : pRes?.data || null;

    // Build profile with selected fields
    const profile = {};
    if (peopleData) {
      profile.id = peopleData.id ?? null;
      profile.fullName = peopleData.fullName ?? null;
      profile.firstName = peopleData.firstName ?? null;
      profile.lastName = peopleData.lastName ?? null;
      profile.birthDate = peopleData.birthDate ?? null;
      profile.currentAge = peopleData.currentAge ?? null;
      profile.birthCountry = peopleData.birthCountry ?? null;
      profile.height = peopleData.height ?? null;
      profile.weight = peopleData.weight ?? null;
      profile.primaryPosition = {
        name: peopleData.primaryPosition?.name ?? null,
        abbreviation: peopleData.primaryPosition?.abbreviation ?? null,
      };
      profile.batSide = {
        description: peopleData.batSide?.description ?? null,
      };
      profile.pitchHand = {
        description: peopleData.pitchHand?.description ?? null,
      };
      profile.pronunciation =
        peopleData.pronunciation ?? peopleData.pronounciation ?? null;
    }

    // Season stats: keep payload but move first split's team & league into profile (no links)
    const seasonPayload = seasonRes?.data ?? null;
    let seasonStats = seasonPayload?.stats ?? [];
    if (Array.isArray(seasonStats) && seasonStats.length > 0) {
      // allowed raw stat keys (keep only these)
      const allowedRaw = new Set([
        "gamesPlayed",
        "runs",
        "doubles",
        "triples",
        "homeRuns",
        "strikeOuts",
        "baseOnBalls",
        "hits",
        "avg",
        "atBats",
        "obp",
        "slg",
        "ops",
        "stolenBases",
        "totalBases",
        "rbi",
        // pitching extras
        "era",
        "inningsPitched",
        "earnedRuns",
        "whip",
        "shutouts",
        "strikePercentage",
        "strikeoutsPer9Inn",
      ]);

      const humanize = (k) => {
        const map = {
          gamesPlayed: "Games Played",
          runs: "Runs",
          doubles: "Doubles",
          triples: "Triples",
          homeRuns: "Home Runs",
          strikeOuts: "Strike Outs",
          baseOnBalls: "Base On Balls",
          hits: "Hits",
          avg: "Avg",
          atBats: "At Bats",
          obp: "Obp",
          slg: "Slg",
          ops: "Ops",
          stolenBases: "Stolen Bases",
          totalBases: "Total Bases",
          rbi: "Rbi",
          era: "Era",
          inningsPitched: "Innings Pitched",
          earnedRuns: "Earned Runs",
          whip: "Whip",
          shutouts: "Shutouts",
          strikePercentage: "Strike Percentage",
          strikeoutsPer9Inn: "Strikeouts Per 9 Inn",
        };
        return map[k] ?? k;
      };

      // extract team/league from first split if present
      for (const statBlock of seasonStats) {
        const splits = statBlock.splits || [];
        if (splits.length > 0) {
          const firstSplit = splits[0];
          if (firstSplit.team && !profile.team) {
            profile.team = {
              id: firstSplit.team.id ?? null,
              name: firstSplit.team.name ?? null,
            };
          }
          if (firstSplit.league && !profile.league) {
            profile.league = {
              id: firstSplit.league.id ?? null,
              name: firstSplit.league.name ?? null,
            };
          }
        }
      }

      // prune wrapper fields and keep only allowed/humanized stats in splits
      seasonStats = seasonStats.map((statBlock) => {
        const sb = JSON.parse(JSON.stringify(statBlock));
        if (sb.hasOwnProperty("type")) delete sb.type;
        if (sb.hasOwnProperty("exemptions")) delete sb.exemptions;

        if (Array.isArray(sb.splits)) {
          sb.splits = sb.splits.map((sp) => {
            // remove player and sport nested objects
            if (sp.player) delete sp.player;
            if (sp.sport) delete sp.sport;

            const rawStat = sp.stat || {};
            const filtered = {};
            for (const k of Object.keys(rawStat)) {
              if (!allowedRaw.has(k)) continue;
              const display = humanize(k);
              filtered[display] = rawStat[k];
            }
            sp.stat = filtered;

            // remove team/league wrappers if present
            if (sp.team) delete sp.team;
            if (sp.league) delete sp.league;

            return sp;
          });
        }
        return sb;
      });
    }

    // GameLog: keep stat + summary and present requested fields
    const gameLogPayload = gameLogRes?.data ?? null;
    let gameLogStats = [];
    if (Array.isArray(gameLogPayload?.stats)) {
      for (const block of gameLogPayload.stats) {
        const splits = Array.isArray(block.splits) ? block.splits : [];
        for (const sp of splits) {
          const item = {};
          item.season = sp.season ?? null;

          // Filter and humanize stats to the same allowed set as seasonStats
          const allowedRawGL = new Set([
            "gamesPlayed",
            "runs",
            "doubles",
            "triples",
            "homeRuns",
            "strikeOuts",
            "baseOnBalls",
            "hits",
            "avg",
            "atBats",
            "obp",
            "slg",
            "ops",
            "stolenBases",
            "totalBases",
            "rbi",
            "era",
            "inningsPitched",
            "earnedRuns",
            "whip",
            "shutouts",
            "strikePercentage",
            "strikeoutsPer9Inn",
          ]);

          const humanizeGL = (k) => {
            const map = {
              gamesPlayed: "Games Played",
              runs: "Runs",
              doubles: "Doubles",
              triples: "Triples",
              homeRuns: "Home Runs",
              strikeOuts: "Strike Outs",
              baseOnBalls: "Base On Balls",
              hits: "Hits",
              avg: "Avg",
              atBats: "At Bats",
              obp: "Obp",
              slg: "Slg",
              ops: "Ops",
              stolenBases: "Stolen Bases",
              totalBases: "Total Bases",
              rbi: "Rbi",
              era: "Era",
              inningsPitched: "Innings Pitched",
              earnedRuns: "Earned Runs",
              whip: "Whip",
              shutouts: "Shutouts",
              strikePercentage: "Strike Percentage",
              strikeoutsPer9Inn: "Strikeouts Per 9 Inn",
            };
            return map[k] ?? k;
          };

          const rawStat = sp.stat || {};
          const filtered = {};
          for (const k of Object.keys(rawStat)) {
            if (!allowedRawGL.has(k)) continue;
            filtered[humanizeGL(k)] = rawStat[k];
          }
          item.stat = filtered;
          if (rawStat && rawStat.summary) item.summary = rawStat.summary;

          if (sp.league)
            item.league = {
              id: sp.league.id ?? null,
              name: sp.league.name ?? null,
            };
          if (sp.opponent)
            item.opponent = {
              id: sp.opponent.id ?? null,
              name: sp.opponent.name ?? null,
            };
          item.date = sp.date ?? null;
          item.isHome = sp.isHome ?? null;
          item.isWin = sp.isWin ?? null;
          item.positionsPlayed = Array.isArray(sp.positionsPlayed)
            ? sp.positionsPlayed.map((p) => ({
                name: p?.name ?? null,
                abbreviation: p?.abbreviation ?? null,
              }))
            : [];
          item.gamePk = sp.game?.gamePk ?? null;
          gameLogStats.push(item);
        }
      }
    }

    const fromCacheAll =
      pRes.fromCache && seasonRes.fromCache && gameLogRes.fromCache;

    res.json({
      source: fromCacheAll ? "cache" : "origin",
      data: {
        profile,
        seasonStats,
        gameLog: gameLogStats,
      },
    });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch player data", details: err.message });
  }
});

// Player compare endpoint: /wbc/compare/:codes  e.g. /wbc/compare/831348-692922
app.get("/wbc/compare/:codes", async (req, res) => {
  const raw = req.params.codes || "";
  const parts = raw
    .split("-")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length !== 2) {
    return res
      .status(400)
      .json({ error: "Two player codes required, e.g. 831348-692922" });
  }
  const [codeA, codeB] = parts;

  const allowedRaw = new Set([
    "gamesPlayed",
    "runs",
    "doubles",
    "triples",
    "homeRuns",
    "strikeOuts",
    "baseOnBalls",
    "hits",
    "avg",
    "atBats",
    "obp",
    "slg",
    "ops",
    "stolenBases",
    "totalBases",
    "rbi",
    "era",
    "inningsPitched",
    "earnedRuns",
    "whip",
    "shutouts",
    "strikePercentage",
    "strikeoutsPer9Inn",
  ]);

  const humanize = (k) => {
    const map = {
      gamesPlayed: "Games Played",
      runs: "Runs",
      doubles: "Doubles",
      triples: "Triples",
      homeRuns: "Home Runs",
      strikeOuts: "Strike Outs",
      baseOnBalls: "Base On Balls",
      hits: "Hits",
      avg: "Avg",
      atBats: "At Bats",
      obp: "Obp",
      slg: "Slg",
      ops: "Ops",
      stolenBases: "Stolen Bases",
      totalBases: "Total Bases",
      rbi: "Rbi",
      era: "Era",
      inningsPitched: "Innings Pitched",
      earnedRuns: "Earned Runs",
      whip: "Whip",
      shutouts: "Shutouts",
      strikePercentage: "Strike Percentage",
      strikeoutsPer9Inn: "Strikeouts Per 9 Inn",
    };
    return map[k] ?? k;
  };

  async function fetchPlayerData(code) {
    const pPath = `v1/people/${encodeURIComponent(code)}`;
    const seasonPath = `v1/people/${encodeURIComponent(code)}/stats?stats=season&group=hitting,pitching&sportId=51`;
    const [pRes, seasonRes] = await Promise.all([
      getCached(pPath, `${BASE_URL}${pPath}`),
      getCached(seasonPath, `${BASE_URL}${seasonPath}`),
    ]);

    const peopleData = pRes?.data?.people
      ? pRes.data.people[0]
      : pRes?.data || null;

    const profile = {};
    if (peopleData) {
      profile.id = peopleData.id ?? null;
      profile.fullName = peopleData.fullName ?? null;
      profile.firstName = peopleData.firstName ?? null;
      profile.lastName = peopleData.lastName ?? null;
      profile.birthDate = peopleData.birthDate ?? null;
      profile.currentAge = peopleData.currentAge ?? null;
      profile.birthCountry = peopleData.birthCountry ?? null;
      profile.height = peopleData.height ?? null;
      profile.weight = peopleData.weight ?? null;
      profile.primaryPosition = {
        name: peopleData.primaryPosition?.name ?? null,
        abbreviation: peopleData.primaryPosition?.abbreviation ?? null,
      };
      profile.batSide = {
        description: peopleData.batSide?.description ?? null,
      };
      profile.pitchHand = {
        description: peopleData.pitchHand?.description ?? null,
      };
      profile.pronunciation =
        peopleData.pronunciation ?? peopleData.pronounciation ?? null;
    }

    let seasonStats = seasonRes?.data?.stats ?? [];
    if (Array.isArray(seasonStats) && seasonStats.length > 0) {
      for (const statBlock of seasonStats) {
        const splits = statBlock.splits || [];
        if (splits.length > 0) {
          const firstSplit = splits[0];
          if (firstSplit.team && !profile.team) {
            profile.team = {
              id: firstSplit.team.id ?? null,
              name: firstSplit.team.name ?? null,
            };
          }
          if (firstSplit.league && !profile.league) {
            profile.league = {
              id: firstSplit.league.id ?? null,
              name: firstSplit.league.name ?? null,
            };
          }
        }
      }

      seasonStats = seasonStats.map((statBlock) => {
        const sb = JSON.parse(JSON.stringify(statBlock));
        if (sb.hasOwnProperty("type")) delete sb.type;
        if (sb.hasOwnProperty("exemptions")) delete sb.exemptions;
        if (Array.isArray(sb.splits)) {
          sb.splits = sb.splits.map((sp) => {
            if (sp.player) delete sp.player;
            if (sp.sport) delete sp.sport;
            const rawStat = sp.stat || {};
            const filtered = {};
            for (const k of Object.keys(rawStat)) {
              if (!allowedRaw.has(k)) continue;
              filtered[humanize(k)] = rawStat[k];
            }
            sp.stat = filtered;
            if (sp.team) delete sp.team;
            if (sp.league) delete sp.league;
            return sp;
          });
        }
        return sb;
      });
    }

    // Determine primary stat group (first non-empty group found)
    let primaryGroup = null;
    for (const sb of seasonStats) {
      const gn = (sb?.group?.displayName || "").toLowerCase();
      if (gn && Array.isArray(sb.splits) && sb.splits.length > 0) {
        primaryGroup = gn;
        break;
      }
    }

    return {
      profile,
      seasonStats,
      primaryGroup,
      fromCache: pRes.fromCache && seasonRes.fromCache,
    };
  }

  try {
    const [playerA, playerB] = await Promise.all([
      fetchPlayerData(codeA),
      fetchPlayerData(codeB),
    ]);

    // If both have a determined group and they differ, reject comparison
    if (
      playerA.primaryGroup &&
      playerB.primaryGroup &&
      playerA.primaryGroup !== playerB.primaryGroup
    ) {
      return res.status(400).json({ error: "Positions are different" });
    }

    const fromCacheAll = playerA.fromCache && playerB.fromCache;

    res.json({
      source: fromCacheAll ? "cache" : "origin",
      data: {
        playerA: { profile: playerA.profile, seasonStats: playerA.seasonStats },
        playerB: { profile: playerB.profile, seasonStats: playerB.seasonStats },
      },
    });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch compare data", details: err.message });
  }
});

// Full team aggregation endpoint
app.get("/wbc/team/:code", async (req, res) => {
  const code = req.params.code;
  if (!code) return res.status(400).json({ error: "team code required" });

  try {
    // 1) Get teams and find the team object
    const { data: teamsPayload } = await getCached(
      TEAMS_PATH,
      `${BASE_URL}${TEAMS_PATH}`,
    );
    const teamsList = teamsPayload?.teams || [];
    const teamIdNum = Number(code);
    const teamObj = teamsList.find((t) => t && t.id === teamIdNum);
    if (!teamObj) return res.status(404).json({ error: "team not found" });

    const result = { team: teamObj };

    // 2) Fetch standings for the team's league id via our internal route
    const leagueId = teamObj?.league?.id;
    if (leagueId) {
      const standingsRes = await axios.get(
        `http://localhost:${PORT}/wbc/standings/${leagueId}`,
      );
      let standingsData = standingsRes.data?.data ?? standingsRes.data;

      // If we have records, attempt to reduce to the division and the single teamRecord for this team
      try {
        if (standingsData && Array.isArray(standingsData.records)) {
          const divId = teamObj?.division?.id;

          // First try to find the record for the team's division
          let matched = standingsData.records.find(
            (r) => r && r.division && r.division.id === divId,
          );

          // If not found by division id, try to find any record that includes the team
          if (!matched) {
            for (const r of standingsData.records) {
              if (!Array.isArray(r.teamRecords)) continue;
              const found = r.teamRecords.find(
                (tr) => tr && tr.team && Number(tr.team.id) === teamIdNum,
              );
              if (found) {
                matched = r;
                break;
              }
            }
          }

          if (matched) {
            // deep clone then filter teamRecords to only this team
            const recClone = JSON.parse(JSON.stringify(matched));
            recClone.teamRecords = Array.isArray(recClone.teamRecords)
              ? recClone.teamRecords.filter(
                  (tr) => Number(tr?.team?.id) === teamIdNum,
                )
              : [];
            standingsData = { records: [recClone] };
          } else {
            // fallback: keep original standingsData
          }
        }
      } catch (e) {
        // ignore transform errors and fall back to full standings
      }

      result.standings = standingsData;
    }

    // 3) Fetch combined stats and find this team's entry, also compute max/min per stat across teams
    const statsRes = await axios.get(`http://localhost:${PORT}/wbc/stats`);
    const statsTeams = statsRes.data?.data?.teams || [];

    // build maps for max/min per group/season/statKey
    const extremes = {}; // { [groupKey]: { [season]: { [statKey]: { min, max } } } }
    for (const t of statsTeams) {
      const tid = String(t.id);
      for (const groupKey of ["hitting", "pitching"]) {
        const groupObj = (t.stats && t.stats[groupKey]) || {};
        for (const season of Object.keys(groupObj)) {
          const entry = groupObj[season];
          const statObj = entry?.stat || {};
          for (const statKey of Object.keys(statObj)) {
            const raw = statObj[statKey];
            const n = Number(String(raw).replace(/[^0-9.+-eE]/g, ""));
            if (!Number.isFinite(n)) continue;
            extremes[groupKey] = extremes[groupKey] || {};
            extremes[groupKey][season] = extremes[groupKey][season] || {};
            const cur = extremes[groupKey][season][statKey];
            if (!cur) extremes[groupKey][season][statKey] = { min: n, max: n };
            else {
              if (n < cur.min) cur.min = n;
              if (n > cur.max) cur.max = n;
            }
          }
        }
      }
    }

    // find this team's stats and augment with extremes
    const thisTeamStats = statsTeams.find((t) => t.id === teamIdNum) || {
      stats: { hitting: {}, pitching: {} },
    };
    const augmentedStats = { hitting: {}, pitching: {} };
    for (const groupKey of ["hitting", "pitching"]) {
      const groupObj =
        (thisTeamStats.stats && thisTeamStats.stats[groupKey]) || {};
      for (const season of Object.keys(groupObj)) {
        const entry = groupObj[season];
        const statObj = entry?.stat || {};
        const outStats = {};
        for (const statKey of Object.keys(statObj)) {
          const raw = statObj[statKey];
          const n = Number(String(raw).replace(/[^0-9.+-eE]/g, ""));
          const ext =
            (extremes[groupKey] &&
              extremes[groupKey][season] &&
              extremes[groupKey][season][statKey]) ||
            null;
          outStats[statKey] = {
            teamValue: raw,
            max: ext ? ext.max : null,
            min: ext ? ext.min : null,
          };
        }
        augmentedStats[groupKey][season] = {
          rank: entry?.rank ?? null,
          stat: outStats,
        };
      }
    }
    result.stats = augmentedStats;

    // 4) Fetch schedule, leaders, roster, coaches from our internal routes
    const [scheduleRes, leadersRes, rosterRes, coachesRes] = await Promise.all([
      axios
        .get(`http://localhost:${PORT}/wbc/teamSchedule/${teamIdNum}`)
        .catch(() => null),
      axios
        .get(`http://localhost:${PORT}/wbc/teamLeaders/${teamIdNum}`)
        .catch(() => null),
      axios
        .get(`http://localhost:${PORT}/wbc/teamRoster/${teamIdNum}`)
        .catch(() => null),
      axios
        .get(`http://localhost:${PORT}/wbc/teamCoaches/${teamIdNum}`)
        .catch(() => null),
    ]);

    result.schedule = scheduleRes?.data?.data ?? null;
    const leadersPersons = leadersRes?.data?.data?.persons ?? [];
    const roster =
      rosterRes?.data?.data?.roster ?? rosterRes?.data?.roster ?? [];
    // merge leaders into roster by person.id (put leader stats on roster entries)
    const leaderMap = new Map(
      leadersPersons.map((p) => [String(p.id), p.stats || {}]),
    );
    const mergedRoster = (roster || []).map((r) => {
      const pid = String(r?.person?.id ?? "");
      const stats = leaderMap.get(pid) || {};
      const out = Object.assign({}, r, { stats, parentTeamId: teamIdNum });
      return out;
    });
    // attach merged roster and drop separate leaders array (roster now contains leader stats)
    result.roster = mergedRoster;
    result.coaches = coachesRes?.data?.data ?? null;

    res.json({ source: "origin", data: result });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to build team payload", details: err.message });
  }
});

// Search - combines players and trimmed teams (TTL 12 hours)
const SEARCH_KEY = "search:players_teams";
const SEARCH_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
app.get("/wbc/search", async (req, res) => {
  try {
    const { data, fromCache } = await getCachedCustom(
      SEARCH_KEY,
      SEARCH_TTL_MS,
      async () => {
        // Ensure we have fresh players and teams (these use their own 30m caching)
        const teamsUrl = `${BASE_URL}${TEAMS_PATH}`;
        const playersUrl = `${BASE_URL}${PLAYERS_PATH}`;
        const [{ data: teamsPayload }, { data: playersPayload }] =
          await Promise.all([
            getCached(TEAMS_PATH, teamsUrl),
            getCached(PLAYERS_PATH, playersUrl),
          ]);

        const teams = Array.isArray(teamsPayload?.teams)
          ? teamsPayload.teams.map((t) => ({
              id: t.id,
              name: t.name,
              abbreviation: t.abbreviation,
              divisionName: t.division?.name || null,
            }))
          : [];

        const players = playersPayload?.people ?? playersPayload ?? [];

        return { teams, players };
      },
    );

    // ensure periodic refresh for the combined search cache
    if (!refreshIntervals.has(SEARCH_KEY)) {
      const id = setInterval(
        () =>
          getCachedCustom(SEARCH_KEY, SEARCH_TTL_MS, async () => {
            const teamsUrl = `${BASE_URL}${TEAMS_PATH}`;
            const playersUrl = `${BASE_URL}${PLAYERS_PATH}`;
            const [{ data: teamsPayload }, { data: playersPayload }] =
              await Promise.all([
                getCached(TEAMS_PATH, teamsUrl),
                getCached(PLAYERS_PATH, playersUrl),
              ]);
            const teams = Array.isArray(teamsPayload?.teams)
              ? teamsPayload.teams.map((t) => ({
                  id: t.id,
                  name: t.name,
                  abbreviation: t.abbreviation,
                  divisionName: t.division?.name || null,
                }))
              : [];
            const players = playersPayload?.people ?? playersPayload ?? [];
            return { teams, players };
          }).catch(() => {}),
        SEARCH_TTL_MS,
      );
      refreshIntervals.set(SEARCH_KEY, id);
    }

    res.json({ source: fromCache ? "cache" : "origin", data });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to build search", details: err.message });
  }
});

// Standings - accepts path param /wbc/standings/:code where code is the leagueId number
app.get("/wbc/standings/:code", async (req, res) => {
  const code = req.params.code;
  if (!code) {
    return res.status(400).json({ error: "leagueId (path param) required" });
  }
  const fields =
    "records,teamRecords,team,id,name,streak,streakCode,clinchIndicator,divisionRank,leagueRank,gamesPlayed,leagueGamesBack,records,splitRecords,wins,losses,type,divisionRecords,wins,losses,division,id,name,runsAllowed,runsScored";
  const path = `v1/standings/byDivision?leagueId=${encodeURIComponent(code)}&fields=${encodeURIComponent(fields)}`;
  const url = `${BASE_URL}${path}`;
  const key = path;
  try {
    const { data, fromCache } = await getCached(key, url);
    // If the response body contains { records: [] } (empty), reply with message
    if (data && Array.isArray(data.records) && data.records.length === 0) {
      return res.json({ message: "No standings found" });
    }

    // Transform the standings payload according to rules:
    // - Each record.division may only have id; find its name by inspecting teamRecords' divisionRecords
    // - Remove teamRecords[].records.splitRecords
    // - For teamRecords[].records.divisionRecords keep only the entry for this record's division and remove the nested division object (show only wins/losses)
    // - Remove teamRecords[].records.leagueRecords
    // - For teamRecords[].records.expectedRecords keep only the first item
    const transformed = JSON.parse(JSON.stringify(data));
    if (Array.isArray(transformed.records)) {
      for (const rec of transformed.records) {
        const divId = rec?.division?.id;
        // find division name from any teamRecords' divisionRecords
        let divName = undefined;
        if (Array.isArray(rec.teamRecords)) {
          for (const tr of rec.teamRecords) {
            const divRecs = tr?.records?.divisionRecords;
            if (Array.isArray(divRecs)) {
              const match = divRecs.find(
                (d) => d?.division?.id === divId && d?.division?.name,
              );
              if (match && match.division && match.division.name) {
                divName = match.division.name;
                break;
              }
            }
          }
        }
        if (divId !== undefined) {
          rec.division = { id: divId, name: divName };
        }

        if (Array.isArray(rec.teamRecords)) {
          for (const tr of rec.teamRecords) {
            const r = tr.records || {};
            // remove splitRecords
            if (r.hasOwnProperty("splitRecords")) delete r.splitRecords;
            // keep only the division record for this division (without nested division object)
            if (Array.isArray(r.divisionRecords)) {
              const match = r.divisionRecords.find(
                (d) => d?.division?.id === divId,
              );
              if (match) {
                r.divisionRecords = { wins: match.wins, losses: match.losses };
              } else {
                r.divisionRecords = null;
              }
            }
            // remove leagueRecords
            if (r.hasOwnProperty("leagueRecords")) delete r.leagueRecords;
            // expectedRecords -> only first item
            if (Array.isArray(r.expectedRecords)) {
              r.expectedRecords =
                r.expectedRecords.length > 0 ? [r.expectedRecords[0]] : [];
            }
            tr.records = r;
          }
        }
      }
    }

    // set up periodic refresh for this league if not already
    if (!refreshIntervals.has(key)) {
      const id = setInterval(
        () => fetchAndCache(key, url).catch(() => {}),
        TTL_MS,
      );
      refreshIntervals.set(key, id);
    }

    res.json({ source: fromCache ? "cache" : "origin", data: transformed });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch standings", details: err.message });
  }
});

// Game feed - reduced payload
app.get("/wbc/gameFeed/:gamePk", async (req, res) => {
  const gamePk = req.params.gamePk;
  if (!gamePk) return res.status(400).json({ error: "gamePk required" });

  const path = `v1.1/game/${encodeURIComponent(gamePk)}/feed/live`;
  const url = `${BASE_URL}${path}`;
  const key = path;

  const wpPath = `v1/game/${encodeURIComponent(gamePk)}/winProbability?fields=homeTeamWinProbability,awayTeamWinProbability`;
  const wpUrl = `${BASE_URL}${wpPath}`;
  const wpKey = wpPath;

  function pickPlayer(p) {
    if (!p) return null;
    return {
      id: p.id ?? null,
      fullName: p.fullName ?? null,
      link: p.link ?? null,
      currentTeam: p.currentTeam
        ? { id: p.currentTeam.id ?? null, name: p.currentTeam.name ?? null }
        : null,
      position: p.position
        ? { code: p.position.code, name: p.position.name }
        : null,
    };
  }

  function reducePlay(play) {
    if (!play) return null;
    const out = {};
    out.about = play.about || null;
    out.result = play.result || null;
    out.matchup = play.matchup || null;
    out.count = play.count || null;
    if (Array.isArray(play.playEvents)) {
      out.playEvents = play.playEvents.map((pe) => ({
        result: pe.result || null,
        players: Array.isArray(pe.players)
          ? pe.players.map((pp) => ({
              id: pp?.player?.id ?? null,
              fullName: pp?.player?.fullName ?? null,
              type: pp?.player?.type ?? null,
            }))
          : [],
      }));
    }
    return out;
  }

  try {
    const [{ data, fromCache }, wpResult] = await Promise.all([
      getCached(key, url),
      getCached(wpKey, wpUrl).catch(() => ({ data: null, fromCache: false })),
    ]);
    const wpData = Array.isArray(wpResult?.data) ? wpResult.data : null;

    // reduce heavy payload
    const reduced = {};
    const raw = data || {};

    // Build per-batter pitch lists by scanning liveData.plays (allPlays and currentPlay).
    // We record an overall pitch order index and collect pitchData coordinates, type, description,
    // and strike zone top/bottom. Coordinates are compacted into single-line strings per pitch type.
    const pitchesByBatter = new Map();
    let globalPitchIndex = 0;

    function processPlayForPitches(play) {
      if (!play || !play.matchup) return;
      const batterId = String(play.matchup?.batter?.id || "");
      if (!batterId) return;
      // debug logging: play context
      try {
        const playIdx = play?.about?.playIndex ?? play?.about?.playId ?? "-";
        const desc =
          play?.result?.event || play?.result?.description || "(no event)";
      } catch (e) {
        // ignore logging errors
      }
      const events = Array.isArray(play.playEvents) ? play.playEvents : [];
      // use a batter-local array to compute per-batter order
      const existingArr = pitchesByBatter.get(batterId) || [];
      for (const pe of events) {
        if (!pe || !pe.isPitch || !pe.pitchData) continue;
        globalPitchIndex += 1;
        const pd = pe.pitchData || {};
        const coords = pd.coordinates || {};
        const pX = coords.pX ?? coords.x ?? null;
        const pZ = coords.pZ ?? coords.y ?? null;
        const typeDesc =
          (pe.details && (pe.details.type?.description || pe.details.type)) ||
          (pe.type ?? null) ||
          "unknown";
        const call = pe.details?.call?.code ?? null;
        const top =
          typeof pd.strikeZoneTop === "number" ? pd.strikeZoneTop : null;
        const bot =
          typeof pd.strikeZoneBottom === "number" ? pd.strikeZoneBottom : null;

        const orderLocal = existingArr.length + 1;
        const entry = {
          order: orderLocal,
          type: String(typeDesc),
          coords: `${pX !== null ? pX : ""},${pZ !== null ? pZ : ""},${call !== null ? call : ""}`,
          top,
          bot,
        };
        // debug log each found pitch (concise)
        try {
        } catch (e) {}

        existingArr.push(entry);
        pitchesByBatter.set(batterId, existingArr);
      }
    }

    // Process allPlays in order (support both `live` and `liveData` shapes)
    const allPlaysArr = Array.isArray(raw.live?.plays?.allPlays)
      ? raw.live.plays.allPlays
      : Array.isArray(raw.liveData?.plays?.allPlays)
        ? raw.liveData.plays.allPlays
        : [];
    const currentPlayExists =
      Boolean(raw.live?.plays?.currentPlay) ||
      Boolean(raw.liveData?.plays?.currentPlay);
    for (const p of allPlaysArr) processPlayForPitches(p);
    // Also include currentPlay if present (may include ongoing pitch events)
    if (raw.live?.plays?.currentPlay)
      processPlayForPitches(raw.live.plays.currentPlay);
    else if (raw.liveData?.plays?.currentPlay)
      processPlayForPitches(raw.liveData.plays.currentPlay);

    // summary log of collected pitches
    try {
      const sample = Array.from(pitchesByBatter.entries())
        .slice(0, 5)
        .map(([k, v]) => [k, v.length]);
    } catch (e) {}

    // Determine polling mode based on game status: Scheduled/Final => normal (30m), else fast (5s)
    try {
      const statusDetailed =
        raw.gameData?.status?.detailedState ||
        raw.gameData?.status?.status ||
        null;
      const needFast = !(
        statusDetailed === "Scheduled" || statusDetailed === "Final"
      );
      const currentMode = bracketModes.get(key) || "normal";
      const desired = needFast ? "fast" : "normal";
      if (!refreshIntervals.has(key) || currentMode !== desired) {
        const existing = refreshIntervals.get(key);
        if (existing) clearInterval(existing);
        bracketModes.set(key, desired);
        const intervalMs = needFast ? 5000 : TTL_MS;
        const id = setInterval(
          () => fetchAndCache(key, url).catch(() => {}),
          intervalMs,
        );
        refreshIntervals.set(key, id);
        // mirror same polling interval for win probability
        const existingWp = refreshIntervals.get(wpKey);
        if (existingWp) clearInterval(existingWp);
        const wpId = setInterval(
          () => fetchAndCache(wpKey, wpUrl).catch(() => {}),
          intervalMs,
        );
        refreshIntervals.set(wpKey, wpId);
      } else if (!refreshIntervals.has(wpKey)) {
        // ensure win probability has a polling interval even if main feed mode didn't change
        const intervalMs = needFast ? 5000 : TTL_MS;
        const wpId = setInterval(
          () => fetchAndCache(wpKey, wpUrl).catch(() => {}),
          intervalMs,
        );
        refreshIntervals.set(wpKey, wpId);
      }
    } catch (e) {
      // ignore polling setup errors
    }

    // Build compact win probability object
    let probabilityOut = null;
    if (wpData) {
      probabilityOut = {
        amount: wpData.length,
        home: wpData
          .map((e) => Math.round(e.homeTeamWinProbability * 10) / 10)
          .join(","),
        away: wpData
          .map((e) => Math.round(e.awayTeamWinProbability * 10) / 10)
          .join(","),
      };
    }

    reduced.gamePk = raw.gamePk ?? Number(gamePk);
    reduced.gameData = {
      gameDate:
        raw.gameData?.datetime?.dateTime ??
        raw.gameData?.game?.dateTime ??
        null,
      status: raw.gameData?.status || null,
      teams: {
        away: raw.gameData?.teams?.away
          ? {
              id: raw.gameData.teams.away.id,
              name: raw.gameData.teams.away.name,
            }
          : null,
        home: raw.gameData?.teams?.home
          ? {
              id: raw.gameData.teams.home.id,
              name: raw.gameData.teams.home.name,
            }
          : null,
      },
      venue: raw.gameData?.venue?.name ?? null,
    };

    // plays: allPlays (reduced) and currentPlay
    reduced.plays = {};
    if (Array.isArray(raw.live?.plays?.allPlays)) {
      reduced.plays.allPlays = raw.live.plays.allPlays
        .map((p) => reducePlay(p))
        .filter(Boolean);
    } else {
      reduced.plays.allPlays = [];
    }
    reduced.plays.currentPlay =
      reducePlay(raw.live?.plays?.currentPlay) || null;

    // linescore (support `live` or `liveData` top-level)
    const ls = raw.live?.linescore ?? raw.liveData?.linescore;
    if (ls) {
      reduced.linescore = {
        currentInning: ls.currentInning ?? null,
        inningState: ls.inningState ?? null,
        teams: {
          away: ls.teams?.away
            ? {
                runs: ls.teams.away.runs ?? null,
                hits: ls.teams.away.hits ?? null,
                errors: ls.teams.away.errors ?? null,
              }
            : null,
          home: ls.teams?.home
            ? {
                runs: ls.teams.home.runs ?? null,
                hits: ls.teams.home.hits ?? null,
                errors: ls.teams.home.errors ?? null,
              }
            : null,
        },
        innings: Array.isArray(ls.innings)
          ? ls.innings.map((inn) => ({
              num: inn.num ?? null,
              away: inn.away?.runs ?? null,
              home: inn.home?.runs ?? null,
            }))
          : [],
      };
    }

    // boxscore: teams -> players (reduced)
    if (raw.gameData?.boxscore) {
      const bs = raw.gameData.boxscore;
      reduced.boxscore = { teams: {} };
      for (const side of ["away", "home"]) {
        const teamObj = bs.teams?.[side];
        if (!teamObj) {
          reduced.boxscore.teams[side] = null;
          continue;
        }
        const players = [];
        const pMap = teamObj?.players || {};
        for (const pid of Object.keys(pMap)) {
          const p = pMap[pid];
          const personId = p?.person?.id ?? null;

          // compute compacted pitch data for this batter if available
          const batterPitches = pitchesByBatter.get(String(personId)) || [];
          const byType = {};
          let maxTop = null;
          let minBot = null;
          for (const e of batterPitches) {
            const typeKey = e.type || "unknown";
            if (!byType[typeKey]) byType[typeKey] = { coords: [] };
            // store as compact "order:pX,pZ" entries (order is per-batter)
            byType[typeKey].coords.push(`${e.order}:${e.coords}`);
            if (typeof e.top === "number") {
              maxTop = maxTop === null ? e.top : Math.max(maxTop, e.top);
            }
            if (typeof e.bot === "number") {
              minBot = minBot === null ? e.bot : Math.min(minBot, e.bot);
            }
          }
          // convert coords array into a single-line semicolon-separated string per type
          for (const k of Object.keys(byType)) {
            byType[k].coordinates = byType[k].coords.join(";");
            delete byType[k].coords;
          }

          const pitches = {
            byType: Object.keys(byType).length > 0 ? byType : null,
            strikeZone: { maxTop: maxTop, minBottom: minBot },
          };

          players.push({
            id: personId,
            fullName: p?.person?.fullName ?? null,
            jerseyNumber: p?.jerseyNumber ?? null,
            position: p?.position ?? null,
            stats: p?.stats || null,
            gameStatus: p?.gameStatus || null,
            pitches,
          });
        }
        reduced.boxscore.teams[side] = {
          team: teamObj.team
            ? { id: teamObj.team.id, name: teamObj.team.name }
            : null,
          players,
        };
      }
    }

    // players object (roster mapping) - reduced to id/fullName/position/team
    if (raw.gameData?.players) {
      reduced.players = {};
      for (const pid of Object.keys(raw.gameData.players)) {
        reduced.players[pid] = pickPlayer(raw.gameData.players[pid]);
      }
    }

    // officials (reduced)
    if (Array.isArray(raw.gameData?.officials)) {
      reduced.officials = raw.gameData.officials.map((o) => ({
        id: o?.official?.id ?? null,
        fullName: o?.official?.fullName ?? null,
        officialType: o?.officialType ?? null,
      }));
    }

    // topPerformers reduced
    if (
      Array.isArray(raw.live?.boxscore?.teams?.away?.topPerformers) ||
      Array.isArray(raw.live?.boxscore?.teams?.home?.topPerformers)
    ) {
      reduced.topPerformers = {
        away: Array.isArray(raw.live?.boxscore?.teams?.away?.topPerformers)
          ? raw.live.boxscore.teams.away.topPerformers.map((t) => ({
              person: {
                id: t?.person?.id ?? null,
                fullName: t?.person?.fullName ?? null,
              },
              position: t?.position ?? null,
              stats: t?.stats ?? null,
            }))
          : [],
        home: Array.isArray(raw.live?.boxscore?.teams?.home?.topPerformers)
          ? raw.live.boxscore.teams.home.topPerformers.map((t) => ({
              person: {
                id: t?.person?.id ?? null,
                fullName: t?.person?.fullName ?? null,
              },
              position: t?.position ?? null,
              stats: t?.stats ?? null,
            }))
          : [],
      };
    }

    const accept = String(req.headers["accept"] || "");
    const wantMsgpack =
      req.query.format === "msgpack" || accept.includes("application/msgpack");

    if (allowedTree) {
      const pruned = {};
      for (const k of Object.keys(allowedTree)) {
        const subtree = allowedTree[k] === true ? true : allowedTree[k];

        // 1) If the raw payload contains this top-level key, prune directly from raw
        if (raw && Object.prototype.hasOwnProperty.call(raw, k)) {
          pruned[k] = pruneWithTree(raw[k], subtree);
          continue;
        }

        // 2) Special handling: the live/game feed sometimes uses `live` at top-level
        // while our whitelist is authored as `liveData`. If allowedTree requests
        // `liveData`, try to pull from raw.live (or from reduced synthetic fields)
        if (k === "liveData") {
          // prefer raw.live if present
          if (raw && Object.prototype.hasOwnProperty.call(raw, "live")) {
            pruned[k] = pruneWithTree(raw.live, subtree);
            continue;
          }

          // Otherwise, build a small synthetic object from our reduced fields
          // so pruning can operate against the same structure (plays, linescore, boxscore)
          const synth = {};
          if (reduced.plays) synth.plays = reduced.plays;
          if (reduced.linescore) synth.linescore = reduced.linescore;
          if (reduced.boxscore) synth.boxscore = reduced.boxscore;
          // debug: inspect synthesized boxscore players and their pitches
          try {
            if (synth.boxscore && synth.boxscore.teams) {
              for (const s of ["home", "away"]) {
                const pls = synth.boxscore.teams[s]?.players;
                if (Array.isArray(pls) && pls.length > 0) {
                  const sample = pls[0];
                  // show a trimmed sample of the pitches if present
                  if (sample && sample.pitches && sample.pitches.byType) {
                    const tks = Object.keys(sample.pitches.byType).slice(0, 3);
                  }
                }
              }
            }
          } catch (e) {}
          if (Object.keys(synth).length > 0) {
            // Show the player tree expected by allowedTree (for debugging)
            try {
              const playerTree =
                subtree &&
                subtree.boxscore &&
                subtree.boxscore.teams &&
                subtree.boxscore.teams["*"] &&
                subtree.boxscore.teams["*"].players &&
                subtree.boxscore.teams["*"].players["*"];
            } catch (e) {}
            pruned[k] = pruneWithTree(synth, subtree);
            // debug: inspect pruned sample player
            try {
              const prPls = pruned[k].boxscore?.teams?.home?.players;
              if (Array.isArray(prPls) && prPls.length > 0) {
              }
            } catch (e) {}
            continue;
          }
        }

        // 3) Fall back: if reduced contains the requested top-level key, prune from reduced
        if (Object.prototype.hasOwnProperty.call(reduced, k)) {
          pruned[k] = pruneWithTree(reduced[k], subtree);
          continue;
        }
      }

      // quick check: log whether pruned contains any pitches under liveData.boxscore
      try {
        let foundPitches = false;
        if (
          pruned.liveData &&
          pruned.liveData.boxscore &&
          pruned.liveData.boxscore.teams
        ) {
          for (const s of ["home", "away"]) {
            const pls = pruned.liveData.boxscore.teams[s]?.players;
            if (Array.isArray(pls)) {
              for (const pl of pls) {
                if (pl && pl.pitches) {
                  foundPitches = true;
                  break;
                }
              }
            }
            if (foundPitches) break;
          }
        }
      } catch (e) {}

      setCachingHeaders(res, TTL_MS);
      // Attach a top-level `pitches` object derived from our computed pitchesByBatter
      try {
        const pitchesOut = {};
        for (const [bid, arr] of pitchesByBatter.entries()) {
          const byType = {};
          let maxTop = null;
          let minBottom = null;
          for (const e of arr) {
            const t = e.type || "unknown";
            if (!byType[t]) byType[t] = { coords: [] };
            // order is per-batter now
            byType[t].coords.push(`${e.order}:${e.coords}`);
            if (typeof e.top === "number") {
              maxTop = maxTop === null ? e.top : Math.max(maxTop, e.top);
            }
            if (typeof e.bot === "number") {
              minBottom =
                minBottom === null ? e.bot : Math.min(minBottom, e.bot);
            }
          }
          for (const k of Object.keys(byType)) {
            byType[k].coordinates = byType[k].coords.join(";");
            delete byType[k].coords;
          }
          pitchesOut[bid] = {
            byType: Object.keys(byType).length > 0 ? byType : null,
            strikeZone: { maxTop: maxTop, minBottom: minBottom },
          };
        }
        if (probabilityOut) pitchesOut.probability = probabilityOut;
        pruned.pitches = pitchesOut;
      } catch (e) {
        // ignore
      }

      if (wantMsgpack) {
        try {
          const encoded = msgpack.encode(pruned);
          res.setHeader("Content-Type", "application/msgpack");
          return res.send(Buffer.from(encoded));
        } catch (e) {
          // fall through to JSON fallback
        }
      }
      return res.json({ source: fromCache ? "cache" : "origin", data: pruned });
    }

    // Attach a top-level `pitches` object so clients can access computed pitches
    try {
      const pitchesOut = {};
      for (const [bid, arr] of pitchesByBatter.entries()) {
        const byType = {};
        let maxTop = null;
        let minBottom = null;
        for (const e of arr) {
          const t = e.type || "unknown";
          if (!byType[t]) byType[t] = { description: t, coords: [] };
          byType[t].coords.push(`${e.order}:${e.coords}`);
          if (typeof e.top === "number") {
            maxTop = maxTop === null ? e.top : Math.max(maxTop, e.top);
          }
          if (typeof e.bot === "number") {
            minBottom = minBottom === null ? e.bot : Math.min(minBottom, e.bot);
          }
        }
        for (const k of Object.keys(byType)) {
          byType[k].coordinates = byType[k].coords.join(";");
          delete byType[k].coords;
        }
        pitchesOut[bid] = {
          byType: Object.keys(byType).length > 0 ? byType : null,
          strikeZone: { maxTop: maxTop, minBottom: minBottom },
        };
      }
      if (probabilityOut) pitchesOut.probability = probabilityOut;
      reduced.pitches = pitchesOut;
    } catch (e) {}

    setCachingHeaders(res, TTL_MS);
    if (wantMsgpack) {
      try {
        const encoded = msgpack.encode(reduced);
        res.setHeader("Content-Type", "application/msgpack");
        return res.send(Buffer.from(encoded));
      } catch (e) {
        // fall back to JSON
      }
    }

    res.json({ source: fromCache ? "cache" : "origin", data: reduced });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch game feed", details: err.message });
  }
});

// =============================================================================
// ─── /bb/* (MLB regular-season) endpoints ─────────────────────────────────
// Same pattern as /wbc/* but targets sportId=1 and leagueIds=103,104 (AL/NL).
// =============================================================================

const BB_TEAMS_PATH =
  "v1/teams?leagueIds=103,104&fields=teams,id,name,venue,name,abbreviation,locationName,league,id,name,division,id,name";

async function warmBBTeams() {
  const url = `${BASE_URL}${BB_TEAMS_PATH}`;
  try {
    await fetchAndCache(BB_TEAMS_PATH, url);
  } catch (err) {
    console.warn("Warm-up bb teams failed:", err.message);
  }
}

app.get("/bb/teams", async (req, res) => {
  const path = BB_TEAMS_PATH;
  const url = `${BASE_URL}${path}`;
  const key = path;
  try {
    const { data, fromCache } = await getCached(key, url);
    if (!refreshIntervals.has(key)) {
      const id = setInterval(
        () => fetchAndCache(key, url).catch(() => {}),
        TTL_MS,
      );
      refreshIntervals.set(key, id);
    }
    setCachingHeaders(res, TTL_MS);
    res.json({ source: fromCache ? "cache" : "origin", data });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch MLB teams", details: err.message });
  }
});

// Team schedule – full current year
app.get("/bb/teamSchedule/:code", async (req, res) => {
  const code = req.params.code;
  if (!code) return res.status(400).json({ error: "team code required" });

  const FIELDS =
    "dates,games,gamePk,gameType,gameDate,status,codedGameState,detailedState,teams,away,team,id,name,leagueRecord,wins,losses,score,home,team,id,name,leagueRecord,wins,losses,score,venue,name,seriesDescription,description";
  const year = new Date().getFullYear();
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const path = `v1/schedule/games?teamId=${encodeURIComponent(code)}&sportId=1&startDate=${startDate}&endDate=${endDate}&fields=${encodeURIComponent(FIELDS)}`;
  const url = `${BASE_URL}${path}`;
  const key = `bb:teamSchedule:${code}:${year}`;

  try {
    const { data, fromCache } = await getCached(path, url);
    const gamesMap = new Map();
    if (data && Array.isArray(data.dates)) {
      for (const dateObj of data.dates) {
        if (!Array.isArray(dateObj.games)) continue;
        for (const g of dateObj.games) gamesMap.set(g.gamePk, g);
      }
    }
    const byDate = new Map();
    for (const g of gamesMap.values()) {
      const dateOnly = (g.gameDate || "").split("T")[0] || "unknown";
      if (!byDate.has(dateOnly)) byDate.set(dateOnly, []);
      byDate.get(dateOnly).push(g);
    }
    const dates = Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, games]) => ({ date, games }));
    cache.set(key, { data: { dates }, fetchedAt: Date.now() });
    if (!refreshIntervals.has(key)) {
      const id = setInterval(
        () => fetchAndCache(path, url).catch(() => {}),
        TTL_MS,
      );
      refreshIntervals.set(key, id);
    }
    setCachingHeaders(res, TTL_MS);
    res.json({ source: fromCache ? "cache" : "origin", data: { dates } });
  } catch (err) {
    res.status(502).json({
      error: "Failed to fetch MLB team schedule",
      details: err.message,
    });
  }
});

// Team roster – 40Man
app.get("/bb/teamRoster/:code", async (req, res) => {
  const code = req.params.code;
  if (!code) return res.status(400).json({ error: "team code required" });

  const FIELDS =
    "roster,person,id,fullName,jerseyNumber,position,name,abbreviation,status,description";
  const path = `v1/teams/${encodeURIComponent(code)}/roster?fields=${encodeURIComponent(FIELDS)}&rosterType=40Man`;
  const url = `${BASE_URL}${path}`;
  const key = `bb:teamRoster:${code}:40Man`;

  try {
    let { data, fromCache } = await getCached(path, url);
    const isEmptyRoster =
      !data || !Array.isArray(data.roster) || data.roster.length === 0;
    if (isEmptyRoster) {
      const yr = new Date().getFullYear();
      const pathSeason = `${path}&season=${yr}`;
      const urlSeason = `${BASE_URL}${pathSeason}`;
      try {
        const seasonRes = await getCached(pathSeason, urlSeason).catch(
          () => null,
        );
        if (
          seasonRes?.data &&
          Array.isArray(seasonRes.data.roster) &&
          seasonRes.data.roster.length > 0
        ) {
          data = seasonRes.data;
          fromCache = false;
          cache.set(key, { data, fetchedAt: Date.now() });
        }
      } catch (e) {
        /* ignore */
      }
    }
    if (!refreshIntervals.has(key)) {
      const id = setInterval(
        () => fetchAndCache(path, url).catch(() => {}),
        TTL_MS,
      );
      refreshIntervals.set(key, id);
    }
    res.json({ source: fromCache ? "cache" : "origin", data });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch MLB team roster", details: err.message });
  }
});

// Team coaches
app.get("/bb/teamCoaches/:code", async (req, res) => {
  const code = req.params.code;
  if (!code) return res.status(400).json({ error: "team code required" });

  const path = `v1/teams/${encodeURIComponent(code)}/coaches?fields=roster,person,fullName`;
  const url = `${BASE_URL}${path}`;
  const key = `bb:teamCoaches:${code}`;

  try {
    const { data, fromCache } = await getCached(path, url);
    const coaches = Array.isArray(data?.roster)
      ? data.roster.map((r) => ({
          fullName: r?.person?.fullName ?? null,
          jerseyNumber: r?.jerseyNumber ?? null,
          job: r?.job ?? null,
        }))
      : [];
    if (!refreshIntervals.has(key)) {
      const id = setInterval(
        () => fetchAndCache(path, url).catch(() => {}),
        TTL_MS,
      );
      refreshIntervals.set(key, id);
    }
    res.json({ source: fromCache ? "cache" : "origin", data: { coaches } });
  } catch (err) {
    res.status(502).json({
      error: "Failed to fetch MLB team coaches",
      details: err.message,
    });
  }
});

// Team leaders
app.get("/bb/teamLeaders/:code", async (req, res) => {
  const code = req.params.code;
  if (!code) return res.status(400).json({ error: "team code required" });

  const LEADER_CATEGORIES =
    "homeRuns,hits,atBats,runs,stolenBases,avg,obp,slg,ops,totalBases,rbi,strikeOuts,baseOnBalls,era,inningsPitched,whip,numberOfPitches";
  const FIELDS =
    "teamLeaders,leaderCategory,leaders,rank,value,person,id,fullName,statGroup";
  const path = `v1/teams/${encodeURIComponent(code)}/leaders?leaderCategories=${encodeURIComponent(LEADER_CATEGORIES)}&limit=40&fields=${encodeURIComponent(FIELDS)}`;
  const url = `${BASE_URL}${path}`;
  const key = `bb:teamLeaders:${code}`;

  const hittingCategories = new Set([
    "homeRuns",
    "hits",
    "atBats",
    "runs",
    "stolenBases",
    "avg",
    "battingAverage",
    "obp",
    "onBasePercentage",
    "slg",
    "sluggingPercentage",
    "ops",
    "onBasePlusSlugging",
    "totalBases",
    "rbi",
    "runsBattedIn",
  ]);
  const pitchingCategories = new Set([
    "strikeOuts",
    "strikeouts",
    "baseOnBalls",
    "walks",
    "hits",
    "earnedRunAverage",
    "era",
    "inningsPitched",
    "walksAndHitsPerInningPitched",
    "whip",
    "numberOfPitches",
  ]);

  function friendlyName(cat) {
    if (!cat || typeof cat !== "string") return cat;
    let s = cat
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Za-z])([0-9])/g, "$1 $2")
      .replace(/([0-9])([A-Za-z])/g, "$1 $2");
    s = s.replace(/[_-]/g, " ");
    return s
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  try {
    const { data, fromCache } = await getCached(path, url);
    const persons = new Map();
    const teamLeaders = data?.teamLeaders ?? [];
    for (const entry of teamLeaders) {
      const category = entry.leaderCategory;
      const statGroup = entry.statGroup;
      const inHitting = hittingCategories.has(category);
      const inPitching = pitchingCategories.has(category);
      const requireHitting = inHitting && !inPitching;
      const requirePitching = inPitching && !inHitting;
      const leaders = Array.isArray(entry.leaders) ? entry.leaders : [];
      for (const l of leaders) {
        if (!l?.person) continue;
        if (requireHitting && statGroup !== "hitting") continue;
        if (requirePitching && statGroup !== "pitching") continue;
        const pid = String(l.person.id);
        if (!persons.has(pid)) {
          persons.set(pid, {
            id: l.person.id,
            fullName: l.person.fullName,
            stats: {},
          });
        }
        const p = persons.get(pid);
        p.stats[friendlyName(category)] = { rank: l.rank, value: l.value };
      }
    }
    if (!refreshIntervals.has(key)) {
      const id = setInterval(
        () => fetchAndCache(path, url).catch(() => {}),
        TTL_MS,
      );
      refreshIntervals.set(key, id);
    }
    res.json({
      source: fromCache ? "cache" : "origin",
      data: { persons: Array.from(persons.values()) },
    });
  } catch (err) {
    res.status(502).json({
      error: "Failed to fetch MLB team leaders",
      details: err.message,
    });
  }
});

// MLB team stats (current year + prior year)
app.get("/bb/stats", async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const seasons = [String(year - 1), String(year)];
    const paths = seasons.map((season) => ({
      season,
      path: `v1/teams/stats?sportIds=1&group=hitting,pitching&season=${season}`,
    }));
    const results = await Promise.all(
      paths.map((p) => getCached(p.path, `${BASE_URL}${p.path}`)),
    );

    const allowed = new Set([
      "gamesPlayed",
      "runs",
      "doubles",
      "triples",
      "homeRuns",
      "strikeOuts",
      "baseOnBalls",
      "hits",
      "avg",
      "atBats",
      "obp",
      "slg",
      "ops",
      "stolenBases",
      "totalBases",
      "rbi",
      "era",
      "inningsPitched",
      "whip",
      "earnedRuns",
      "shutouts",
      "strikePercentage",
      "strikeoutsPer9Inn",
    ]);

    function bbFriendlyName(cat) {
      if (!cat || typeof cat !== "string") return cat;
      let s = cat
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Za-z])([0-9])/g, "$1 $2")
        .replace(/([0-9])([A-Za-z])/g, "$1 $2");
      s = s.replace(/[_-]/g, " ");
      return s
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }

    const teamMap = new Map();
    for (let i = 0; i < results.length; i++) {
      const season = paths[i].season;
      const data = results[i].data;
      const statsArr = data?.stats ?? [];
      for (const statEntry of statsArr) {
        const groupNameRaw =
          statEntry?.group?.displayName || statEntry?.group || "unknown";
        const groupKey = String(groupNameRaw).toLowerCase();
        const splits = statEntry?.splits ?? [];
        for (const split of splits) {
          const team = split.team;
          if (!team || !team.id) continue;
          const tid = String(team.id);
          if (!teamMap.has(tid)) {
            teamMap.set(tid, {
              id: team.id,
              name: team.name,
              stats: { hitting: {}, pitching: {} },
            });
          }
          const teamObj = teamMap.get(tid);
          const rawStat = split.stat || {};
          const filtered = {};
          for (const k of Object.keys(rawStat)) {
            if (allowed.has(k)) filtered[bbFriendlyName(k)] = rawStat[k];
          }
          const out = { rank: split.rank ?? null, stat: filtered };
          if (!teamObj.stats[groupKey]) teamObj.stats[groupKey] = {};
          teamObj.stats[groupKey][season] = out;
        }
      }
    }
    res.json({
      source: "origin",
      data: { teams: Array.from(teamMap.values()) },
    });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch MLB stats", details: err.message });
  }
});

// MLB standings
app.get("/bb/standings/:code", async (req, res) => {
  const code = req.params.code;
  if (!code)
    return res.status(400).json({ error: "leagueId (path param) required" });

  const fields =
    "records,teamRecords,team,id,name,streak,streakCode,clinchIndicator,divisionRank,leagueRank,gamesPlayed,leagueGamesBack,records,splitRecords,wins,losses,type,divisionRecords,wins,losses,division,id,name,runsAllowed,runsScored";
  const path = `v1/standings/byDivision?leagueId=${encodeURIComponent(code)}&fields=${encodeURIComponent(fields)}`;
  const url = `${BASE_URL}${path}`;
  const key = path;

  try {
    const { data, fromCache } = await getCached(key, url);
    if (data && Array.isArray(data.records) && data.records.length === 0) {
      return res.json({ message: "No standings found" });
    }
    const transformed = JSON.parse(JSON.stringify(data));
    if (Array.isArray(transformed.records)) {
      for (const rec of transformed.records) {
        const divId = rec?.division?.id;
        let divName = undefined;
        if (Array.isArray(rec.teamRecords)) {
          for (const tr of rec.teamRecords) {
            const divRecs = tr?.records?.divisionRecords;
            if (Array.isArray(divRecs)) {
              const match = divRecs.find(
                (d) => d?.division?.id === divId && d?.division?.name,
              );
              if (match?.division?.name) {
                divName = match.division.name;
                break;
              }
            }
          }
        }
        if (divId !== undefined) rec.division = { id: divId, name: divName };
        if (Array.isArray(rec.teamRecords)) {
          for (const tr of rec.teamRecords) {
            const r = tr.records || {};
            if (r.hasOwnProperty("splitRecords")) delete r.splitRecords;
            if (Array.isArray(r.divisionRecords)) {
              const match = r.divisionRecords.find(
                (d) => d?.division?.id === divId,
              );
              r.divisionRecords = match
                ? { wins: match.wins, losses: match.losses }
                : null;
            }
            if (r.hasOwnProperty("leagueRecords")) delete r.leagueRecords;
            if (Array.isArray(r.expectedRecords)) {
              r.expectedRecords =
                r.expectedRecords.length > 0 ? [r.expectedRecords[0]] : [];
            }
            tr.records = r;
          }
        }
      }
    }
    if (!refreshIntervals.has(key)) {
      const id = setInterval(
        () => fetchAndCache(key, url).catch(() => {}),
        TTL_MS,
      );
      refreshIntervals.set(key, id);
    }
    res.json({ source: fromCache ? "cache" : "origin", data: transformed });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch MLB standings", details: err.message });
  }
});

// Full MLB team aggregation endpoint
app.get("/bb/team/:code", async (req, res) => {
  const code = req.params.code;
  if (!code) return res.status(400).json({ error: "team code required" });

  try {
    const { data: teamsPayload } = await getCached(
      BB_TEAMS_PATH,
      `${BASE_URL}${BB_TEAMS_PATH}`,
    );
    const teamsList = teamsPayload?.teams || [];
    const teamIdNum = Number(code);
    const teamObj = teamsList.find((t) => t && t.id === teamIdNum);
    if (!teamObj) return res.status(404).json({ error: "team not found" });

    const result = { team: teamObj };

    // Standings
    const leagueId = teamObj?.league?.id;
    if (leagueId) {
      const standingsRes = await axios.get(
        `http://localhost:${PORT}/bb/standings/${leagueId}`,
      );
      let standingsData = standingsRes.data?.data ?? standingsRes.data;
      try {
        if (standingsData && Array.isArray(standingsData.records)) {
          const divId = teamObj?.division?.id;
          let matched = standingsData.records.find(
            (r) => r?.division?.id === divId,
          );
          if (!matched) {
            for (const r of standingsData.records) {
              if (!Array.isArray(r.teamRecords)) continue;
              const found = r.teamRecords.find(
                (tr) => tr?.team && Number(tr.team.id) === teamIdNum,
              );
              if (found) {
                matched = r;
                break;
              }
            }
          }
          if (matched) {
            const recClone = JSON.parse(JSON.stringify(matched));
            recClone.teamRecords = Array.isArray(recClone.teamRecords)
              ? recClone.teamRecords.filter(
                  (tr) => Number(tr?.team?.id) === teamIdNum,
                )
              : [];
            standingsData = { records: [recClone] };
          }
        }
      } catch (e) {
        /* ignore transform errors */
      }
      result.standings = standingsData;
    }

    // Stats with extremes for bar normalization
    const statsRes = await axios.get(`http://localhost:${PORT}/bb/stats`);
    const statsTeams = statsRes.data?.data?.teams || [];
    const extremes = {};
    for (const t of statsTeams) {
      for (const groupKey of ["hitting", "pitching"]) {
        const groupObj = (t.stats && t.stats[groupKey]) || {};
        for (const season of Object.keys(groupObj)) {
          const entry = groupObj[season];
          const statObj = entry?.stat || {};
          for (const statKey of Object.keys(statObj)) {
            const raw = statObj[statKey];
            const n = Number(String(raw).replace(/[^0-9.+-eE]/g, ""));
            if (!Number.isFinite(n)) continue;
            extremes[groupKey] = extremes[groupKey] || {};
            extremes[groupKey][season] = extremes[groupKey][season] || {};
            const cur = extremes[groupKey][season][statKey];
            if (!cur) extremes[groupKey][season][statKey] = { min: n, max: n };
            else {
              if (n < cur.min) cur.min = n;
              if (n > cur.max) cur.max = n;
            }
          }
        }
      }
    }
    const thisTeamStats = statsTeams.find((t) => t.id === teamIdNum) || {
      stats: { hitting: {}, pitching: {} },
    };
    const augmentedStats = { hitting: {}, pitching: {} };
    for (const groupKey of ["hitting", "pitching"]) {
      const groupObj =
        (thisTeamStats.stats && thisTeamStats.stats[groupKey]) || {};
      for (const season of Object.keys(groupObj)) {
        const entry = groupObj[season];
        const statObj = entry?.stat || {};
        const outStats = {};
        for (const statKey of Object.keys(statObj)) {
          const raw = statObj[statKey];
          const ext = extremes[groupKey]?.[season]?.[statKey] ?? null;
          outStats[statKey] = {
            teamValue: raw,
            max: ext ? ext.max : null,
            min: ext ? ext.min : null,
          };
        }
        augmentedStats[groupKey][season] = {
          rank: entry?.rank ?? null,
          stat: outStats,
        };
      }
    }
    result.stats = augmentedStats;

    // Schedule, leaders, roster, coaches
    const [scheduleRes, leadersRes, rosterRes, coachesRes] = await Promise.all([
      axios
        .get(`http://localhost:${PORT}/bb/teamSchedule/${teamIdNum}`)
        .catch(() => null),
      axios
        .get(`http://localhost:${PORT}/bb/teamLeaders/${teamIdNum}`)
        .catch(() => null),
      axios
        .get(`http://localhost:${PORT}/bb/teamRoster/${teamIdNum}`)
        .catch(() => null),
      axios
        .get(`http://localhost:${PORT}/bb/teamCoaches/${teamIdNum}`)
        .catch(() => null),
    ]);

    result.schedule = scheduleRes?.data?.data ?? null;
    const leadersPersons = leadersRes?.data?.data?.persons ?? [];
    const roster =
      rosterRes?.data?.data?.roster ?? rosterRes?.data?.roster ?? [];
    const leaderMap = new Map(
      leadersPersons.map((p) => [String(p.id), p.stats || {}]),
    );
    result.roster = (roster || []).map((r) => {
      const pid = String(r?.person?.id ?? "");
      return Object.assign({}, r, {
        stats: leaderMap.get(pid) || {},
        parentTeamId: teamIdNum,
      });
    });
    result.coaches = coachesRes?.data?.data ?? null;

    res.json({ source: "origin", data: result });
  } catch (err) {
    res.status(502).json({
      error: "Failed to build MLB team payload",
      details: err.message,
    });
  }
});

// Start server and warm cache
app.listen(PORT, async () => {
  console.log(`Baseball server listening on port ${PORT}`);
  await warmLeagues();
  await warmBBTeams();
  startMlbNotificationsLoop();
  // Refresh leagues periodically (every TTL_MS)
  setInterval(warmLeagues, TTL_MS);
});

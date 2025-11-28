// server.js
// S3-backed scheduled fetcher + public filtered API for the football diary endpoint
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const { S3 } = require("aws-sdk");
const fetch = (...args) => import("node-fetch").then((m) => m.default(...args));
const cron = require("node-cron");
const path = require("path");

const PORT = process.env.PORT || 3000;
const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION || "us-east-1";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";
const REFRESH_CRON = process.env.REFRESH_CRON || "*/10 * * * *"; // every 10 minutes
const PREFIX = process.env.S3_PREFIX || "cache/";

// Always fetch tomorrow's date for scheduled refresh (1 = tomorrow)
const FETCH_DAY_OFFSET = 1;

if (!BUCKET) {
  console.error("Missing S3_BUCKET - set env S3_BUCKET to your bucket name");
}

const s3 = new S3({ region: REGION });

// >>> ADDED — Function to log outbound IP
async function logOutboundIP() {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    console.log("🔎 Outbound IP detected:", data.ip);
  } catch (err) {
    console.error("Failed to fetch outbound IP:", err.message);
  }
}
// >>> END ADD

function makeKeyForDate(dateStr, sport = "football") {
  return `${PREFIX}diary-${sport}-${dateStr}.json`;
}

const WATCH_COMPETITIONS = [
  "Premier League",
  "Spanish La Liga",
  "Bundesliga",
  "Italian Serie A",
  "French Ligue 1",
  "FA Cup",
  "English Football League Cup",
  "Copa del Rey",
  "Supercopa de España",
  "DFB Pokal",
  "DFL Supercup",
  "Coppa Italia",
  "EA SPORTS FC Supercup",
  "Coupe de France",
  "French Trophee des Champions",
  "UEFA Champions League",
  "UEFA Europa League",
  "UEFA Europa Conference League",
  "Super Cup",
];

const WATCH_COMPETITIONS_BY_SPORT = {
  football: WATCH_COMPETITIONS,
  basketball: ["National Basketball Association"],
};

const DEFAULT_USER = process.env.UPSTREAM_USER || "";
const DEFAULT_SECRET = process.env.UPSTREAM_SECRET || "";
const UPSTREAM_HOST = process.env.UPSTREAM_HOST || "";

function utcStartOfDayTimestamp(date) {
  const d = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0
    )
  );
  return Math.floor(d.getTime() / 1000);
}

function formatDateYYYYMMDD(date) {
  // Use local date components (not UTC) so the generated `date=YYYYMMDD`
  // parameter matches the provider's expected calendar date and avoids
  // off-by-one (tomorrow) issues when the server runs in UTC.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

// For basketball we want the diary 'day' to roll at 02:00 Pacific Time
function formatDateYYYYMMDDForPSTBoundary(date) {
  try {
    // Get LA (America/Los_Angeles) date parts including hour
    const f = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    });
    const parts = f.formatToParts(date);
    const year = parts.find((p) => p.type === "year").value;
    const month = parts.find((p) => p.type === "month").value;
    const day = parts.find((p) => p.type === "day").value;
    const hourPart = parts.find((p) => p.type === "hour").value;
    const hour = parseInt(hourPart, 10) || 0;

    // If local LA hour is before 02:00, use the previous calendar day
    if (hour < 2) {
      // Build a UTC date from the LA calendar date, then subtract one day
      const dt = new Date(
        Date.UTC(Number(year), Number(month) - 1, Number(day))
      );
      dt.setUTCDate(dt.getUTCDate() - 1);
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
      const d = String(dt.getUTCDate()).padStart(2, "0");
      return `${y}${m}${d}`;
    }

    return `${year}${month}${day}`;
  } catch (e) {
    // Fallback to server-local formatting if Intl fails
    return formatDateYYYYMMDD(date);
  }
}

function normalizeName(str) {
  if (!str) return "";
  // Normalize to NFKD and strip diacritics, then lowercase for comparison
  try {
    return (
      String(str)
        .normalize("NFKD")
        // remove ONLY combining diacritical marks (U+0300 - U+036F)
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
    );
  } catch (e) {
    return String(str).toLowerCase();
  }
}

async function s3PutObject(key, obj) {
  if (!BUCKET) {
    const fs = require("fs").promises;
    const localPath = path.join(__dirname, key.replace(/\//g, "_"));
    await fs.writeFile(localPath, JSON.stringify(obj, null, 2), "utf8");
    return;
  }
  await s3
    .putObject({
      Bucket: BUCKET,
      Key: key,
      Body: JSON.stringify(obj),
      ContentType: "application/json",
      ACL: "private",
    })
    .promise();
}

async function s3GetObject(key) {
  if (!BUCKET) {
    const fs = require("fs").promises;
    const localPath = path.join(__dirname, key.replace(/\//g, "_"));
    const content = await fs.readFile(localPath, "utf8").catch(() => null);
    return content ? JSON.parse(content) : null;
  }
  const out = await s3
    .getObject({ Bucket: BUCKET, Key: key })
    .promise()
    .catch(() => null);
  if (!out) return null;
  return JSON.parse(out.Body.toString("utf8"));
}

async function s3ListCacheDates() {
  if (!BUCKET) {
    const fs = require("fs").promises;
    const files = await fs.readdir(__dirname).catch(() => []);
    return files
      .filter((f) => f.startsWith(PREFIX.replace(/\//g, "_") + "diary-"))
      .map((f) =>
        f
          .replace(PREFIX.replace(/\//g, "_") + "diary-", "")
          .replace(/\.json$/, "")
      );
  }
  const res = await s3.listObjectsV2({ Bucket: BUCKET, Prefix }).promise();
  return (res.Contents || []).map((o) => {
    const k = o.Key;
    const base = k.slice(PREFIX.length);
    return base.replace(/^diary-/, "").replace(/\.json$/, "");
  });
}

function pickFields(obj, picks = []) {
  if (!Array.isArray(picks) || picks.length === 0) return obj;
  const out = {};
  for (const key of picks) {
    const parts = key.split(".");
    let src = obj;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (src == null || !(p in src)) {
        src = undefined;
        break;
      }
      if (i === parts.length - 1) {
        let cur = out;
        const route = parts.slice(0, i);
        for (const r of route) {
          if (!(r in cur)) cur[r] = {};
          cur = cur[r];
        }
        cur[p] = src[p];
      } else {
        src = src[p];
      }
    }
  }
  return out;
}

async function fetchDiaryForDate(dateObj, sport = "football") {
  const tsp = utcStartOfDayTimestamp(dateObj);
  // Choose date string logic per sport: basketball uses PST boundary at 02:00
  const dateStr =
    sport === "basketball"
      ? formatDateYYYYMMDDForPSTBoundary(dateObj)
      : formatDateYYYYMMDD(dateObj);
  const user = process.env.UPSTREAM_USER || DEFAULT_USER;
  const secret = process.env.UPSTREAM_SECRET || "";

  // If a FORWARDER_URL is set, use the VPS forwarder which returns upstream data.
  const FORWARDER_URL = process.env.FORWARDER_URL || "";
  const FORWARDER_SECRET = process.env.FORWARDER_SECRET || "";

  if (FORWARDER_URL) {
    // Build the upstream URL we want the forwarder to fetch. We POST this to
    // the forwarder's `/forward` endpoint so the forwarder does the outbound
    // request from the whitelisted VM. Use sport-specific path.
    const sportPath = sport === "basketball" ? "basketball" : "football";
    const upstreamUrl = `${UPSTREAM_HOST}/v1/${sportPath}/match/diary?user=${encodeURIComponent(
      user
    )}&secret=${encodeURIComponent(secret)}&date=${dateStr}`;
    const forwardEndpoint = `${FORWARDER_URL.replace(/\/$/, "")}/forward`;
    console.log(
      "Using forwarder endpoint:",
      forwardEndpoint,
      "-> upstream:",
      upstreamUrl
    );

    const res = await fetch(forwardEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarder-secret": FORWARDER_SECRET,
      },
      body: JSON.stringify({ url: upstreamUrl }),
    });
    console.log("Forwarder response status:", res.status, res.statusText);
    const bodyText = await res.text().catch(() => "");
    if (!res.ok) {
      console.error(
        "Forwarder returned non-200",
        res.status,
        bodyText.slice(0, 200)
      );
      throw new Error(`Forwarder fetch failed ${res.status} ${res.statusText}`);
    }
    let json = null;
    try {
      json = JSON.parse(bodyText);
    } catch (err) {
      console.error("Failed to parse forwarder JSON:", err.message);
      throw new Error("Failed to parse forwarder JSON");
    }
    return { json, dateStr, rawText: bodyText };
  }

  // Default: call upstream host directly. Use `date=YYYYMMDD` (many accounts
  // reject `tsp` queries) — include only date to match upstream account scope.
  const sportPath = sport === "basketball" ? "basketball" : "football";
  const url = `${UPSTREAM_HOST}/v1/${sportPath}/match/diary?user=${encodeURIComponent(
    user
  )}&secret=${encodeURIComponent(secret)}&date=${dateStr}`;
  console.log("Upstream URL:", url);
  const res = await fetch(url, { method: "GET" });
  console.log("Upstream response status:", res.status, res.statusText);
  const bodyText = await res.text().catch(() => "");
  if (bodyText && bodyText.length > 0) {
    const lines = bodyText.split(/\r?\n/).slice(0, 2).join("\n");
    console.log(
      "Upstream sample:\n",
      lines.length ? lines : bodyText.slice(0, 200)
    );
  } else {
    console.log("Upstream returned empty body");
  }
  if (!res.ok) {
    throw new Error(`Upstream fetch failed ${res.status} ${res.statusText}`);
  }
  let json = null;
  try {
    json = JSON.parse(bodyText);
  } catch (err) {
    console.error("Failed to parse upstream JSON:", err.message);
    throw new Error("Failed to parse upstream JSON");
  }
  return { json, dateStr, rawText: bodyText };
}

function findCompetitionIds(resultsExtra) {
  const compMap = {};
  const comps =
    resultsExtra && resultsExtra.competition ? resultsExtra.competition : [];
  for (const c of comps) {
    if (!c || !c.name) continue;
    compMap[c.id] = c.name;
  }
  return compMap;
}

function matchCompetitionNamesToWatch(
  resultsExtra,
  wantedList = WATCH_COMPETITIONS
) {
  const comps =
    resultsExtra && resultsExtra.competition ? resultsExtra.competition : [];
  const found = {};
  for (const c of comps) {
    const nameNorm = normalizeName(c.name || "");
    for (const want of wantedList) {
      const wantNorm = normalizeName(want);
      if (nameNorm === wantNorm) {
        found[c.id] = c.name;
        break;
      }
    }
  }
  return found;
}

function transformResults(json, watchCompIdsMap) {
  const results = json.results || [];
  const extra = json.results_extra || {};
  const teamMap = {};
  for (const t of extra.team || []) {
    if (t && t.id) teamMap[t.id] = t.name || "";
  }
  const competitionMap = {};
  for (const c of extra.competition || []) {
    if (c && c.id) competitionMap[c.id] = c.name;
  }

  const competitionsPlayed = Array.from(
    new Set(Object.values(watchCompIdsMap || {}))
  );

  const filtered = [];
  for (const item of results) {
    if (!item || !item.id) continue;
    const compId = item.competition_id;
    if (!compId) continue;
    if (!(compId in watchCompIdsMap)) continue;
    const out = {
      id: item.id,
      competition_id: compId,
      competition_name:
        competitionMap[compId] || watchCompIdsMap[compId] || null,
      home_team_id: item.home_team_id,
      home_team_name: teamMap[item.home_team_id] || null,
      away_team_id: item.away_team_id,
      away_team_name: teamMap[item.away_team_id] || null,
      match_time: item.match_time,
      status_id: item.status_id,
    };
    filtered.push(out);
  }

  return { competitions_playing: competitionsPlayed, results: filtered };
}

async function refreshForDate(dateObj, sport = "football") {
  try {
    const tsp = utcStartOfDayTimestamp(dateObj);
    const dateStrLocal =
      sport === "basketball"
        ? formatDateYYYYMMDDForPSTBoundary(dateObj)
        : formatDateYYYYMMDD(dateObj);
    console.log(
      "Fetching diary for",
      dateObj.toISOString(),
      `(dateStr=${dateStrLocal}, tsp=${tsp})`
    );
    const { json, dateStr } = await fetchDiaryForDate(dateObj, sport);
    const wanted = WATCH_COMPETITIONS_BY_SPORT[sport] || WATCH_COMPETITIONS;
    const watchMap = matchCompetitionNamesToWatch(
      json.results_extra || {},
      wanted
    );
    const transformed = transformResults(json, watchMap);
    const record = {
      date: dateStr,
      fetchedAt: Date.now(),
      upstream: { host: UPSTREAM_HOST },
      transformed,
      raw_meta: { total: (json.query || {}).total || null },
    };
    const key = makeKeyForDate(dateStr, sport);
    await s3PutObject(key, record);
    console.log("Saved cache for", dateStr, "key=", key);
    return record;
  } catch (err) {
    console.error("refreshForDate error", err.message);
    throw err;
  }
}

async function scheduledRefresh() {
  try {
    const now = new Date();
    // Allow fetching a day offset (e.g. tomorrow) via env `FETCH_DAY_OFFSET=1`.
    if (Number.isFinite(FETCH_DAY_OFFSET) && FETCH_DAY_OFFSET !== 0) {
      now.setDate(now.getDate() + FETCH_DAY_OFFSET);
      console.log(
        "Applying fetch day offset:",
        FETCH_DAY_OFFSET,
        "-> fetching date",
        now.toISOString()
      );
    }
    await refreshForDate(now, "football");
    // Also refresh basketball diary so app can lookup NBA matches
    await refreshForDate(now, "basketball");
  } catch (err) {
    console.error("scheduledRefresh failed", err.message);
  }
}

const app = express();
app.use(cors());
app.use(bodyParser.json());

function requireAdmin(req, res, next) {
  const key = req.get("x-api-key") || req.query.api_key || "";
  if (!ADMIN_API_KEY)
    return res.status(500).json({ error: "ADMIN_API_KEY not configured" });
  if (!key || key !== ADMIN_API_KEY)
    return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.get("/public/today.json", async (req, res) => {
  const d = new Date();
  // Use the same fetch offset as scheduledRefresh (always fetch tomorrow)
  if (Number.isFinite(FETCH_DAY_OFFSET) && FETCH_DAY_OFFSET !== 0) {
    d.setDate(d.getDate() + FETCH_DAY_OFFSET);
  }
  const dateStr = formatDateYYYYMMDD(d);
  const key = makeKeyForDate(dateStr);
  const rec = await s3GetObject(key);
  if (!rec) return res.status(404).json({ error: "Not cached yet" });
  res.json(rec.transformed);
});

// Public diary endpoints per sport e.g. /public/football/today.json or /public/basketball/today.json
app.get("/public/:sport/today.json", async (req, res) => {
  const sport = req.params.sport || "football";
  const d = new Date();
  if (Number.isFinite(FETCH_DAY_OFFSET) && FETCH_DAY_OFFSET !== 0) {
    d.setDate(d.getDate() + FETCH_DAY_OFFSET);
  }
  const dateStr =
    sport === "basketball"
      ? formatDateYYYYMMDDForPSTBoundary(d)
      : formatDateYYYYMMDD(d);
  const key = makeKeyForDate(dateStr, sport);
  const rec = await s3GetObject(key);
  if (!rec) return res.status(404).json({ error: "Not cached yet" });
  res.json(rec.transformed);
});

app.get("/public/:sport/:yyyyMMdd.json", async (req, res) => {
  const sport = req.params.sport || "football";
  const dateStr = req.params.yyyyMMdd;
  const key = makeKeyForDate(dateStr, sport);
  const rec = await s3GetObject(key);
  if (!rec) return res.status(404).json({ error: "Not cached yet" });
  res.json(rec.transformed);
});

app.get("/public/:yyyyMMdd.json", async (req, res) => {
  const id = req.params.yyyyMMdd;
  if (!/^\d{8}$/.test(id))
    return res.status(400).json({ error: "Bad date format" });
  const key = makeKeyForDate(id);
  const rec = await s3GetObject(key);
  if (!rec) return res.status(404).json({ error: "Not cached" });
  res.json(rec.transformed);
});

app.post("/refresh/:yyyyMMdd", requireAdmin, async (req, res) => {
  const id = req.params.yyyyMMdd;
  if (!/^\d{8}$/.test(id))
    return res.status(400).json({ error: "Bad date format" });
  const d = new Date(
    Date.UTC(
      Number(id.slice(0, 4)),
      Number(id.slice(4, 6)) - 1,
      Number(id.slice(6, 8))
    )
  );
  try {
    const rec = await refreshForDate(d);
    res.json({ ok: true, date: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/debug/:yyyyMMdd", requireAdmin, async (req, res) => {
  const id = req.params.yyyyMMdd;
  if (!/^\d{8}$/.test(id))
    return res.status(400).json({ error: "Bad date format" });
  const key = makeKeyForDate(id);
  const rec = await s3GetObject(key);
  if (!rec) return res.status(404).json({ error: "Not cached" });
  res.json(rec);
});

app.get("/fetch-sample/:yyyyMMdd", requireAdmin, async (req, res) => {
  const id = req.params.yyyyMMdd;
  if (!/^\d{8}$/.test(id))
    return res.status(400).json({ error: "Bad date format" });
  const d = new Date(
    Date.UTC(
      Number(id.slice(0, 4)),
      Number(id.slice(4, 6)) - 1,
      Number(id.slice(6, 8))
    )
  );
  try {
    const { json, dateStr, rawText } = await fetchDiaryForDate(d);
    let sample = null;
    if (rawText) {
      const lines = rawText.split(/\r?\n/).slice(0, 2).join("\n");
      sample = lines.length ? lines : rawText.slice(0, 500);
    }
    const smallResults = Array.isArray(json.results)
      ? json.results.slice(0, 2)
      : [];
    res.json({
      ok: true,
      date: dateStr,
      sample_raw: sample,
      sample_results: smallResults,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (REFRESH_CRON) {
  console.log("Scheduling refresh cron:", REFRESH_CRON);
  cron.schedule(REFRESH_CRON, scheduledRefresh, { timezone: "UTC" });
} else {
  setInterval(scheduledRefresh, 10 * 60 * 1000);
}

app.listen(PORT, () => {
  console.log(`Proxy server listening on port ${PORT}`);

  // >>> ADDED — Log outbound IP at startup
  logOutboundIP();
  // >>> END

  scheduledRefresh().catch((err) =>
    console.error("Initial refresh failed", err.message)
  );
});

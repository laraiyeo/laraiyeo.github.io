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

function makeKeyForDate(dateStr) {
  return `${PREFIX}diary-${dateStr}.json`;
}

const WATCH_COMPETITIONS = [
  "Premier League",
  "La Liga",
  "Bundesliga",
  "Serie A",
  "Ligue 1",
  "FA Cup",
  "EFL Cup",
  "Copa del Rey",
  "Spanish Supercopa",
  "DFB Pokal",
  "German Super Cup",
  "Coppa Italia",
  "Italian Supercoppa",
  "Coupe de France",
  "Trophee des Champions",
  "Champions League",
  "Europa League",
  "Europa Conference League",
  "Super Cup",
];

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
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
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

async function fetchDiaryForDate(dateObj) {
  const tsp = utcStartOfDayTimestamp(dateObj);
  const dateStr = formatDateYYYYMMDD(dateObj);
  const user = process.env.UPSTREAM_USER || DEFAULT_USER;
  const secret = process.env.UPSTREAM_SECRET || "";

  // If a FORWARDER_URL is set, use the VPS forwarder which returns upstream data.
  const FORWARDER_URL = process.env.FORWARDER_URL || "";
  const FORWARDER_SECRET = process.env.FORWARDER_SECRET || "";

  if (FORWARDER_URL) {
    // Build the upstream URL we want the forwarder to fetch. We POST this to
    // the forwarder's `/forward` endpoint so the forwarder does the outbound
    // request from the whitelisted VM.
    const upstreamUrl = `${UPSTREAM_HOST}/v1/football/match/diary?user=${encodeURIComponent(
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
  const url = `${UPSTREAM_HOST}/v1/football/match/diary?user=${encodeURIComponent(
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

function matchCompetitionNamesToWatch(resultsExtra) {
  const comps =
    resultsExtra && resultsExtra.competition ? resultsExtra.competition : [];
  const found = {};
  for (const c of comps) {
    const name = (c.name || "").toLowerCase();
    for (const want of WATCH_COMPETITIONS) {
      if (
        name.includes(want.toLowerCase()) ||
        want.toLowerCase().includes(name)
      ) {
        found[c.id] = c.name;
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

async function refreshForDate(dateObj) {
  try {
    const tsp = utcStartOfDayTimestamp(dateObj);
    const dateStrLocal = formatDateYYYYMMDD(dateObj);
    console.log(
      "Fetching diary for",
      dateObj.toISOString(),
      `(dateStr=${dateStrLocal}, tsp=${tsp})`
    );
    const { json, dateStr } = await fetchDiaryForDate(dateObj);
    const watchMap = matchCompetitionNamesToWatch(json.results_extra || {});
    const transformed = transformResults(json, watchMap);
    const record = {
      date: dateStr,
      fetchedAt: Date.now(),
      upstream: { host: UPSTREAM_HOST },
      transformed,
      raw_meta: { total: (json.query || {}).total || null },
    };
    const key = makeKeyForDate(dateStr);
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
    await refreshForDate(now);
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
  const dateStr = formatDateYYYYMMDD(new Date());
  const key = makeKeyForDate(dateStr);
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

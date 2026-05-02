const express = require("express");
const axios = require("axios");
const cors = require("cors");
const compression = require("compression");

const app = express();
app.use(cors());
app.use(compression());

const PORT = process.env.PORT || 3000;

const BASE_URL = "https://openf1-main-production.up.railway.app/v1/";

const cache = new Map();
const TTL_MS = 30 * 60 * 1000; // 30 minutes
const TTL_6H = 6 * 60 * 60 * 1000; // 6 hours
const TTL_1H = 60 * 60 * 1000; // 1 hour
const refreshIntervals = new Map();
// track active live requestors per session to avoid polling when nobody is watching
const activeLiveClients = new Map(); // sessionKey -> { lastActive: number, timeoutId }
const ACTIVE_CLIENT_TIMEOUT_MS = 30 * 1000; // consider client inactive after 30s

function markSessionActive(sessionKey) {
  try {
    const now = Date.now();
    const existing = activeLiveClients.get(sessionKey) || {};
    if (existing.timeoutId) clearTimeout(existing.timeoutId);
    const timeoutId = setTimeout(() => {
      activeLiveClients.delete(sessionKey);
    }, ACTIVE_CLIENT_TIMEOUT_MS);
    activeLiveClients.set(sessionKey, { lastActive: now, timeoutId });
  } catch (e) {}
}

function setCachingHeaders(res, ttlMs) {
  const secs = Math.max(0, Math.floor((ttlMs || TTL_MS) / 1000));
  res.setHeader("Cache-Control", `public, max-age=${secs}`);
}

async function fetchAndCache(key, url) {
  try {
    const r = await axios.get(url, { timeout: 10000 });
    const payload = r.data;
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
    if (age < TTL_MS) return { data: entry.data, fromCache: true };
  }
  return await fetchAndCache(key, url);
}

// variant that accepts custom TTL
async function getCachedWithTTL(key, url, ttlMs) {
  const entry = cache.get(key);
  if (entry) {
    const age = Date.now() - entry.fetchedAt;
    if (age < ttlMs) return { data: entry.data, fromCache: true };
  }
  const res = await fetchAndCache(key, url);
  return res;
}

function normalizeArray(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.drivers)) return payload.drivers;
  if (Array.isArray(payload.meetings)) return payload.meetings;
  return [];
}

function removeKeyFromArray(arr, keyName) {
  if (!Array.isArray(arr)) return arr;
  for (const it of arr) {
    if (it && Object.prototype.hasOwnProperty.call(it, keyName))
      delete it[keyName];
  }
  return arr;
}

function ensureRefreshInterval(key, url, ttlMs) {
  if (!refreshIntervals.has(key)) {
    const id = setInterval(
      () => fetchAndCache(key, url).catch(() => {}),
      ttlMs,
    );
    refreshIntervals.set(key, id);
  }
}

// update or create a refresh interval (clears existing if present)
function updateRefreshInterval(key, url, ttlMs) {
  try {
    if (refreshIntervals.has(key)) {
      try {
        clearInterval(refreshIntervals.get(key));
      } catch (e) {}
      refreshIntervals.delete(key);
    }
    const id = setInterval(
      () => fetchAndCache(key, url).catch(() => {}),
      ttlMs,
    );
    refreshIntervals.set(key, id);
  } catch (e) {
    // ignore
  }
}

function hasAnyLiveSession() {
  try {
    const sessionsEntry = cache.get("sessions")?.data || [];
    const arr = Array.isArray(sessionsEntry)
      ? sessionsEntry
      : sessionsEntry.data || [];
    const now = Date.now();
    for (const s of arr) {
      if (!s) continue;
      const st = s.date_start || s.dateStart || s.start || null;
      const en = s.date_end || s.dateEnd || s.end || null;
      const startMs = st ? new Date(st).getTime() : null;
      const endMs = en ? new Date(en).getTime() : null;
      if (!startMs || !endMs) continue;
      const liveStart = startMs - 15 * 60 * 1000;
      const liveEnd = endMs + 15 * 60 * 1000;
      if (now >= liveStart && now <= liveEnd) return true;
    }
  } catch (e) {}
  return false;
}

async function refreshSessionResultCacheIfLive() {
  try {
    if (activeLiveClients.size > 0 || hasAnyLiveSession()) {
      await fetchAndCache("session_result", `${BASE_URL}session_result`).catch(
        () => {},
      );
    }
  } catch (e) {}
}

// monitor sessions and switch session_result/starting_grid to aggressive refresh when any session is live
function startLiveRefreshMonitor() {
  const CHECK_MS = 60 * 1000; // check once per minute
  const AGGRESSIVE_MS = 2 * 60 * 1000; // 2 minutes
  setInterval(() => {
    try {
      const sessionsEntry = cache.get("sessions")?.data || [];
      const arr = Array.isArray(sessionsEntry)
        ? sessionsEntry
        : sessionsEntry.data || [];
      const now = Date.now();
      let anyLive = false;
      for (const s of arr) {
        if (!s) continue;
        const st = s.date_start || s.dateStart || s.start || null;
        const en = s.date_end || s.dateEnd || s.end || null;
        const startMs = st ? new Date(st).getTime() : null;
        const endMs = en ? new Date(en).getTime() : null;
        if (!startMs || !endMs) continue;
        const liveStart = startMs - 15 * 60 * 1000;
        const liveEnd = endMs + 15 * 60 * 1000;
        if (now >= liveStart && now <= liveEnd) {
          anyLive = true;
          break;
        }
      }

      const sessionResultUrl = `${BASE_URL}session_result`;
      const startingGridUrl = `${BASE_URL}starting_grid`;
      if (anyLive) {
        updateRefreshInterval(
          "session_result",
          sessionResultUrl,
          AGGRESSIVE_MS,
        );
        updateRefreshInterval("starting_grid", startingGridUrl, AGGRESSIVE_MS);
      } else {
        // revert to sane defaults
        updateRefreshInterval("session_result", sessionResultUrl, TTL_1H);
        updateRefreshInterval("starting_grid", startingGridUrl, TTL_1H);
      }
    } catch (e) {
      // ignore monitor errors
    }
  }, CHECK_MS);
}

app.get("/drivers", async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const path = qs ? `drivers?${qs}` : "drivers";
    const url = `${BASE_URL}${path}`;
    const key = path;

    const { data, fromCache } = await getCached(key, url);

    // normalize to array
    let arr = [];
    if (Array.isArray(data)) arr = data;
    else if (Array.isArray(data?.drivers)) arr = data.drivers;
    else if (Array.isArray(data?.data)) arr = data.data;

    // Keep only entries that have team_name, and dedupe by driver_number or full_name
    const seen = new Set();
    const out = [];
    for (const d of arr) {
      const teamName = d?.team_name || d?.teamName || d?.team_name?.trim?.();
      if (!teamName) continue;
      const keyId = d?.driver_number
        ? `num:${d.driver_number}`
        : `name:${d.full_name || d.fullName || d.name || ""}`;
      if (seen.has(keyId)) continue;
      seen.add(keyId);
      out.push(d);
    }

    setCachingHeaders(res, TTL_MS);
    res.json({ source: fromCache ? "cache" : "origin", data: out });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch drivers", details: err.message });
  }
});

// Meetings endpoint - cache for 6 hours, remove country_key
app.get("/meetings", async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const path = qs ? `meetings?${qs}` : "meetings";
    const url = `${BASE_URL}${path}`;
    const key = path;

    const { data, fromCache } = await getCachedWithTTL(key, url, TTL_6H);
    let arr = normalizeArray(data);
    arr = removeKeyFromArray(arr, "country_key");

    // ensure underlying caches exist so we can compute winners
    await getCachedWithTTL("sessions", `${BASE_URL}sessions`, TTL_6H).catch(
      () => {},
    );
    await getCachedWithTTL(
      "session_result",
      `${BASE_URL}session_result`,
      TTL_1H,
    ).catch(() => {});
    await getCachedWithTTL("drivers", `${BASE_URL}drivers`, TTL_1H).catch(
      () => {},
    );

    const sessionsArr = normalizeArray(cache.get("sessions")?.data);
    const resultsArr = normalizeArray(cache.get("session_result")?.data);
    const driversArr = normalizeArray(cache.get("drivers")?.data);

    // helper to pick the race session for a meeting
    const pickRaceSession = (sessionsForMeeting) => {
      const races = sessionsForMeeting.filter(
        (s) => String(s.session_type || "").toLowerCase() === "race",
      );
      if (races.length === 0) return null;
      // prefer those with session_name === 'race'
      const namedRace = races.filter(
        (r) => String(r.session_name || "").toLowerCase() === "race",
      );
      const candidates = namedRace.length > 0 ? namedRace : races;
      // if multiple candidates, pick the last by date_start or last in array
      let chosen = candidates[candidates.length - 1];
      if (candidates.length > 1) {
        try {
          chosen = candidates
            .slice()
            .sort(
              (a, b) =>
                new Date(a.date_start || a.dateStart) -
                new Date(b.date_start || b.dateStart),
            )
            .pop();
        } catch (e) {}
      }
      return chosen;
    };

    // enrich meetings with winner info
    for (const meeting of arr) {
      try {
        const mKey = meeting?.meeting_key || meeting?.meetingKey;
        if (!mKey) continue;
        const sessionsForMeeting = sessionsArr.filter(
          (s) => String(s.meeting_key || s.meetingKey) === String(mKey),
        );
        const raceSession = pickRaceSession(sessionsForMeeting);
        if (!raceSession) continue;
        const sr = resultsArr.find(
          (r) =>
            String(r.session_key) === String(raceSession.session_key) &&
            (String(r.position) === "1" || r.position === 1),
        );
        if (!sr) continue;
        const driverNum = sr.driver_number || sr.driverNumber || sr.driver;
        const driverObj = driversArr.find(
          (d) => String(d.driver_number) === String(driverNum),
        );
        meeting.winner = driverObj
          ? driverObj.full_name || driverObj.broadcast_name || driverObj.name
          : sr.driver_name || sr.name || null;
        meeting.winner_team = driverObj
          ? driverObj.team_name || driverObj.teamName || null
          : sr.team_name || sr.team || null;
      } catch (e) {
        // ignore per-meeting errors
      }
    }

    ensureRefreshInterval(key, url, TTL_6H);
    setCachingHeaders(res, TTL_6H);
    res.json({ source: fromCache ? "cache" : "origin", data: arr });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch meetings", details: err.message });
  }
});

// Single meeting: return sessions for a meeting with winner and winner_team on each session
app.get("/meeting/:meeting_key", async (req, res) => {
  try {
    const meetingKey = req.params.meeting_key;
    if (!meetingKey)
      return res.status(400).json({ error: "meeting_key required" });

    await refreshSessionResultCacheIfLive();

    // ensure caches
    await getCachedWithTTL("meetings", `${BASE_URL}meetings`, TTL_6H).catch(
      () => {},
    );
    await getCachedWithTTL("sessions", `${BASE_URL}sessions`, TTL_6H).catch(
      () => {},
    );
    await getCachedWithTTL(
      "session_result",
      `${BASE_URL}session_result`,
      TTL_1H,
    ).catch(() => {});
    await getCachedWithTTL("drivers", `${BASE_URL}drivers`, TTL_1H).catch(
      () => {},
    );

    const meetingsArr = normalizeArray(cache.get("meetings")?.data);
    const sessionsArr = normalizeArray(cache.get("sessions")?.data);
    const resultsArr = normalizeArray(cache.get("session_result")?.data);
    const driversArr = normalizeArray(cache.get("drivers")?.data);

    const meeting = meetingsArr.find(
      (m) => String(m.meeting_key) === String(meetingKey),
    );
    if (!meeting) return res.status(404).json({ error: "meeting not found" });

    const sessionsForMeeting = sessionsArr.filter(
      (s) => String(s.meeting_key || s.meetingKey) === String(meetingKey),
    );

    const enriched = sessionsForMeeting.map((session) => {
      const sr = resultsArr.find(
        (r) =>
          String(r.session_key) === String(session.session_key) &&
          (String(r.position) === "1" || r.position === 1),
      );
      let winner = null;
      let winner_team = null;
      if (sr) {
        const driverNum = sr.driver_number || sr.driverNumber || sr.driver;
        const driverObj = driversArr.find(
          (d) => String(d.driver_number) === String(driverNum),
        );
        winner = driverObj
          ? driverObj.full_name || driverObj.broadcast_name || driverObj.name
          : sr.driver_name || sr.name || null;
        winner_team = driverObj
          ? driverObj.team_name || driverObj.teamName || null
          : sr.team_name || sr.team || null;
      }
      return { ...session, winner, winner_team };
    });

    setCachingHeaders(res, TTL_6H);
    res.json({ meeting, sessions: enriched });
  } catch (e) {
    res
      .status(502)
      .json({ error: "Failed to fetch meeting", details: e.message });
  }
});

// --- computed cache helper for driver/team endpoints ---
async function getComputedCached(key, ttlMs, builder) {
  const entry = cache.get(key);
  if (entry && entry.computed && Date.now() - entry.fetchedAt < ttlMs) {
    return { data: entry.data, fromCache: true };
  }
  const data = await builder();
  cache.set(key, { data, fetchedAt: Date.now(), computed: true });
  return { data, fromCache: false };
}

// Driver endpoint (aggregates drivers, championship_drivers, starting_grid, session_result)
app.get("/driver/:driver_number", async (req, res) => {
  try {
    const driverNumber = String(req.params.driver_number);
    if (!driverNumber)
      return res.status(400).json({ error: "driver_number required" });

    const key = `driver:${driverNumber}`;
    const { data, fromCache } = await getComputedCached(
      key,
      TTL_1H,
      async () => {
        // ensure underlying caches exist
        await getCachedWithTTL("drivers", `${BASE_URL}drivers`, TTL_1H).catch(
          () => {},
        );
        await getCachedWithTTL(
          "championship_drivers",
          `${BASE_URL}championship_drivers`,
          TTL_1H,
        ).catch(() => {});
        await getCachedWithTTL(
          "starting_grid",
          `${BASE_URL}starting_grid`,
          TTL_1H,
        ).catch(() => {});
        await getCachedWithTTL(
          "session_result",
          `${BASE_URL}session_result`,
          TTL_1H,
        ).catch(() => {});

        const driversArr = normalizeArray(cache.get("drivers")?.data);
        const champArr = normalizeArray(
          cache.get("championship_drivers")?.data,
        );
        const gridArr = normalizeArray(cache.get("starting_grid")?.data);
        const resultArr = normalizeArray(cache.get("session_result")?.data);

        const driverInfo =
          driversArr.find((d) => String(d.driver_number) === driverNumber) ||
          null;

        const championship = champArr.filter(
          (it) => String(it.driver_number) === driverNumber,
        );
        const starting_grid = gridArr.filter(
          (it) => String(it.driver_number) === driverNumber,
        );
        const session_result = resultArr.filter(
          (it) => String(it.driver_number) === driverNumber,
        );

        // build meetings/sessions maps for only referenced keys
        const meetingKeys = new Set();
        const sessionKeys = new Set();
        const collectKeys = (arr) => {
          for (const it of arr) {
            if (!it) continue;
            if (it.meeting_key) meetingKeys.add(String(it.meeting_key));
            if (it.meetingKey) meetingKeys.add(String(it.meetingKey));
            if (it.session_key) sessionKeys.add(String(it.session_key));
            if (it.sessionKey) sessionKeys.add(String(it.sessionKey));
          }
        };
        collectKeys(championship);
        collectKeys(starting_grid);
        collectKeys(session_result);

        const meetingsArr = normalizeArray(cache.get("meetings")?.data);
        const sessionsArr = normalizeArray(cache.get("sessions")?.data);
        const meetingsMap = Object.create(null);
        const sessionsMap = Object.create(null);
        for (const m of meetingsArr) {
          if (m?.meeting_key && meetingKeys.has(String(m.meeting_key))) {
            meetingsMap[String(m.meeting_key)] =
              m.meeting_name || m.name || null;
          }
        }
        for (const s of sessionsArr) {
          if (s?.session_key && sessionKeys.has(String(s.session_key))) {
            sessionsMap[String(s.session_key)] = {
              name: s.session_name || s.name || null,
              date_start: s.date_start || s.dateStart || null,
              date_end: s.date_end || s.dateEnd || null,
            };
          }
        }

        return {
          driver: driverInfo,
          championship,
          starting_grid,
          session_result,
          maps: { meetings: meetingsMap, sessions: sessionsMap },
        };
      },
    );

    setCachingHeaders(res, TTL_1H);
    res.json({ source: fromCache ? "cache" : "origin", data });
  } catch (e) {
    res
      .status(502)
      .json({ error: "Failed to fetch driver data", details: e.message });
  }
});

// Team endpoint: accepts hyphenated name and case-insensitive
app.get("/team/:team_name", async (req, res) => {
  try {
    const raw = req.params.team_name || "";
    const teamQuery = raw.replace(/-/g, " ").toLowerCase();
    if (!teamQuery)
      return res.status(400).json({ error: "team_name required" });

    const key = `team:${teamQuery}`;
    const { data, fromCache } = await getComputedCached(
      key,
      TTL_1H,
      async () => {
        await getCachedWithTTL("drivers", `${BASE_URL}drivers`, TTL_1H).catch(
          () => {},
        );
        await getCachedWithTTL(
          "championship_drivers",
          `${BASE_URL}championship_drivers`,
          TTL_1H,
        ).catch(() => {});
        await getCachedWithTTL(
          "starting_grid",
          `${BASE_URL}starting_grid`,
          TTL_1H,
        ).catch(() => {});
        await getCachedWithTTL(
          "session_result",
          `${BASE_URL}session_result`,
          TTL_1H,
        ).catch(() => {});

        const driversArr = normalizeArray(cache.get("drivers")?.data);
        const champArr = normalizeArray(
          cache.get("championship_drivers")?.data,
        );
        const gridArr = normalizeArray(cache.get("starting_grid")?.data);
        const resultArr = normalizeArray(cache.get("session_result")?.data);

        // find drivers matching team
        const teamDrivers = driversArr.filter(
          (d) => (d.team_name || d.teamName || "").toLowerCase() === teamQuery,
        );
        const out = Object.create(null);
        for (const d of teamDrivers) {
          const dn = String(d.driver_number);
          const driverInfo = d;
          const championship = champArr.filter(
            (it) => String(it.driver_number) === dn,
          );
          const starting_grid = gridArr.filter(
            (it) => String(it.driver_number) === dn,
          );
          const session_result = resultArr.filter(
            (it) => String(it.driver_number) === dn,
          );
          out[dn] = {
            driver: driverInfo,
            championship,
            starting_grid,
            session_result,
          };
        }
        // build maps for meetings/sessions present in any of the driver entries
        const meetingKeys = new Set();
        const sessionKeys = new Set();
        for (const dn of Object.keys(out)) {
          const entry = out[dn];
          const collect = (arr) => {
            for (const it of arr || []) {
              if (!it) continue;
              if (it.meeting_key) meetingKeys.add(String(it.meeting_key));
              if (it.meetingKey) meetingKeys.add(String(it.meetingKey));
              if (it.session_key) sessionKeys.add(String(it.session_key));
              if (it.sessionKey) sessionKeys.add(String(it.sessionKey));
            }
          };
          collect(entry.championship);
          collect(entry.starting_grid);
          collect(entry.session_result);
        }

        const meetingsArr = normalizeArray(cache.get("meetings")?.data);
        const sessionsArr = normalizeArray(cache.get("sessions")?.data);
        const meetingsMap = Object.create(null);
        const sessionsMap = Object.create(null);
        for (const m of meetingsArr) {
          if (m?.meeting_key && meetingKeys.has(String(m.meeting_key))) {
            meetingsMap[String(m.meeting_key)] =
              m.meeting_name || m.name || null;
          }
        }
        for (const s of sessionsArr) {
          if (s?.session_key && sessionKeys.has(String(s.session_key))) {
            sessionsMap[String(s.session_key)] = {
              name: s.session_name || s.name || null,
              date_start: s.date_start || s.dateStart || null,
              date_end: s.date_end || s.dateEnd || null,
            };
          }
        }

        return {
          drivers: out,
          maps: { meetings: meetingsMap, sessions: sessionsMap },
        };
      },
    );

    setCachingHeaders(res, TTL_1H);
    res.json({ source: fromCache ? "cache" : "origin", data });
  } catch (e) {
    res
      .status(502)
      .json({ error: "Failed to fetch team data", details: e.message });
  }
});

// --- Session builder and endpoint ---
function computeSessionTTLFromDates(dateStartStr, dateEndStr) {
  const now = Date.now();
  const start = dateStartStr ? new Date(dateStartStr).getTime() : null;
  const end = dateEndStr ? new Date(dateEndStr).getTime() : null;
  if (!start || !end) return TTL_1H; // fallback
  const beforeStart15 = start - 15 * 60 * 1000;
  const afterEnd15 = end + 15 * 60 * 1000;
  if (now < beforeStart15) return 30 * 60 * 1000; // 30 minutes
  if (now >= beforeStart15 && now <= afterEnd15) return 5 * 1000; // live window: 5 seconds
  return 24 * 60 * 60 * 1000; // finished: 24 hours
}

async function buildAndCacheSession(sessionKey, options = {}) {
  const cacheKey = `session:${sessionKey}`;
  try {
    // fetch session object (prefer cached sessions list lookup first)
    let sessionObj = null;
    const sessionsGlobal = cache.get("sessions")?.data;
    if (sessionsGlobal) {
      const arr = normalizeArray(sessionsGlobal);
      sessionObj = arr.find(
        (s) => String(s.session_key) === String(sessionKey),
      );
    }
    if (!sessionObj) {
      // fetch specific session
      const path = `sessions?session_key=${encodeURIComponent(sessionKey)}`;
      const { data } = await getCachedWithTTL(
        path,
        `${BASE_URL}${path}`,
        TTL_6H,
      );
      const arr = normalizeArray(data);
      sessionObj = arr[0] || null;
    }
    if (!sessionObj) throw new Error("session not found");

    const meetingKey = sessionObj.meeting_key || sessionObj.meetingKey;

    // find meeting
    let meetingObj = null;
    const meetingsGlobal = cache.get("meetings")?.data;
    if (meetingsGlobal) {
      const marr = normalizeArray(meetingsGlobal);
      meetingObj = marr.find(
        (m) => String(m.meeting_key) === String(meetingKey),
      );
    }
    if (!meetingObj && meetingKey) {
      const path = `meetings?meeting_key=${encodeURIComponent(meetingKey)}`;
      const { data } = await getCachedWithTTL(
        path,
        `${BASE_URL}${path}`,
        TTL_6H,
      );
      const marr = normalizeArray(data);
      meetingObj = marr[0] || null;
    }

    // enrich with circuit candidateLap/x/y if circuit_info_url exists on meeting
    let circuitInfo = null;
    if (meetingObj && meetingObj.circuit_info_url) {
      try {
        const cacheKeyCi = `circuit_info:${meetingKey}`;
        const { data } = await getCachedWithTTL(
          cacheKeyCi,
          meetingObj.circuit_info_url,
          TTL_6H,
        ).catch(() => ({ data: null }));
        const ci = data || {};
        const candidateLap = ci.candidateLap || null;
        const x = (candidateLap && candidateLap.x) || ci.x || null;
        const y = (candidateLap && candidateLap.y) || ci.y || null;
        circuitInfo = { candidateLap, x, y };
      } catch (e) {
        circuitInfo = null;
      }
    }

    // starting_grid (optional)
    let starting_grid = null;
    try {
      // by default use this session's starting_grid
      let sgSessionKey = sessionKey;
      // if this is a Race, prefer the corresponding Qualifying session for starting grid
      const sessType = String(
        sessionObj.session_type || sessionObj.sessionType || "",
      ).toLowerCase();
      const sessName = String(
        sessionObj.session_name || sessionObj.sessionName || "",
      ).toLowerCase();
      if (sessType === "race") {
        const allSessions = normalizeArray(cache.get("sessions")?.data);
        const sameMeeting = allSessions.filter(
          (s) => String(s.meeting_key || s.meetingKey) === String(meetingKey),
        );
        const qualifying = sameMeeting.filter(
          (s) => String(s.session_type || "").toLowerCase() === "qualifying",
        );
        if (qualifying.length > 0) {
          // if race is a sprint race, prefer qualifying sessions that include 'sprint'
          let candidates = qualifying;
          if (sessName.includes("sprint")) {
            const sprintQual = qualifying.filter((q) =>
              String(q.session_name || "")
                .toLowerCase()
                .includes("sprint"),
            );
            if (sprintQual.length > 0) candidates = sprintQual;
          } else {
            const exact = qualifying.filter(
              (q) =>
                String(q.session_name || "").toLowerCase() === "qualifying",
            );
            if (exact.length > 0) candidates = exact;
          }
          // prefer the qualifying that finished before the race start and is closest to it
          try {
            const raceStart = new Date(
              sessionObj.date_start || sessionObj.dateStart,
            ).getTime();
            const before = candidates.filter(
              (c) => new Date(c.date_end || c.dateEnd).getTime() <= raceStart,
            );
            const pickFrom = before.length > 0 ? before : candidates;
            pickFrom.sort(
              (a, b) =>
                new Date(a.date_end || a.dateEnd) -
                new Date(b.date_end || b.dateEnd),
            );
            const chosen = pickFrom[pickFrom.length - 1];
            if (chosen && chosen.session_key) sgSessionKey = chosen.session_key;
          } catch (e) {
            const chosen = candidates[candidates.length - 1];
            if (chosen && chosen.session_key) sgSessionKey = chosen.session_key;
          }
        }
      }
      const path = `starting_grid?session_key=${encodeURIComponent(sgSessionKey)}`;
      const { data } = await getCachedWithTTL(
        path,
        `${BASE_URL}${path}`,
        TTL_1H,
      ).catch(() => ({ data: null }));
      const arr = normalizeArray(data);
      if (arr.length > 0) starting_grid = arr;
    } catch (e) {
      starting_grid = null;
    }

    // determine TTL for assembled session
    const ttl = computeSessionTTLFromDates(
      sessionObj.date_start || sessionObj.dateStart,
      sessionObj.date_end || sessionObj.dateEnd,
    );

    // fetch other resources using session_key
    const resourceNames = [
      "overtakes",
      "pit",
      "race_control",
      "stints",
      "session_result",
      "position",
      "laps",
    ];
    const resources = {};
    for (const name of resourceNames) {
      try {
        // position should be fetched without a session filter so we can aggregate records
        let path;
        if (name === "position") {
          path = `position`;
        } else if (name === "laps") {
          // keep laps session-scoped for efficiency
          path = `${name}?session_key=${encodeURIComponent(sessionKey)}`;
        } else {
          path = `${name}?session_key=${encodeURIComponent(sessionKey)}`;
        }
        const { data } = await getCachedWithTTL(
          path,
          `${BASE_URL}${path}`,
          ttl,
        ).catch(() => ({ data: null }));
        resources[name] = normalizeArray(data);
      } catch (e) {
        resources[name] = [];
      }
    }

    // weather: fetch +/- 2 minutes from session start and pick the record closest to start
    let weatherObj = null;
    try {
      const startMs = new Date(
        sessionObj.date_start || sessionObj.dateStart,
      ).getTime();
      const startMinus = new Date(startMs - 2 * 60 * 1000).toISOString();
      const startPlus = new Date(startMs + 2 * 60 * 1000).toISOString();
      const path = `weather?session_key=${encodeURIComponent(sessionKey)}&date%3E=${encodeURIComponent(startMinus)}&date%3C=${encodeURIComponent(startPlus)}`;
      const { data } = await getCachedWithTTL(
        path,
        `${BASE_URL}${path}`,
        ttl,
      ).catch(() => ({ data: null }));
      const arr = normalizeArray(data);
      if (arr.length > 0) {
        let closest = arr[0];
        let bestDiff = Math.abs(new Date(closest.date).getTime() - startMs);
        for (const w of arr) {
          const diff = Math.abs(new Date(w.date).getTime() - startMs);
          if (diff < bestDiff) {
            bestDiff = diff;
            closest = w;
          }
        }
        weatherObj = closest;
      } else {
        weatherObj = null;
      }
    } catch (e) {
      weatherObj = null;
    }

    // prepare drivers set for referenced drivers (will be populated from other resources and live fetches)
    const driversSet = new Set();

    // live intervals and location: fetch 10s window when session is live (session start..end+15m) or when forced
    let intervalsMap = Object.create(null);
    let locationMap = Object.create(null);
    let positionMap = Object.create(null);
    try {
      const now = Date.now();
      const startMs = new Date(
        sessionObj.date_start || sessionObj.dateStart,
      ).getTime();
      const endMs = new Date(
        sessionObj.date_end || sessionObj.dateEnd,
      ).getTime();

      // live for TTL is based on 15m before start to 15m after end, but intervals should start at session start
      const isLiveWindow = now >= startMs && now <= endMs + 15 * 60 * 1000;
      const forced = !!options.forceLive;
      let shouldFetchLive = false;
      if (forced) shouldFetchLive = true;
      else if (isLiveWindow) shouldFetchLive = true;

      if (shouldFetchLive) {
        let windowStartMs;
        if (forced) {
          if (now > endMs)
            windowStartMs = endMs - 10000; // 10s before end when forced after end
          else if (now < startMs)
            windowStartMs = startMs; // before start forced -> use start
          else windowStartMs = options.initTime || now;
        } else {
          // not forced: only fetch if session has started
          if (now < startMs) windowStartMs = null;
          else windowStartMs = options.initTime || now;
        }

        if (windowStartMs) {
          const a = new Date(windowStartMs).toISOString();
          const b = new Date(windowStartMs + 10000).toISOString();
          // intervals
          try {
            const path = `intervals?session_key=${encodeURIComponent(sessionKey)}&date%3E=${encodeURIComponent(a)}&date%3C=${encodeURIComponent(b)}`;
            const { data } = await getCachedWithTTL(
              path,
              `${BASE_URL}${path}`,
              10000,
            ).catch(() => ({ data: null }));
            const arr = normalizeArray(data);
            for (const it of arr) {
              const dn = String(it.driver_number || it.driverNumber || "");
              if (!dn) continue;
              const copy = { ...it };
              if (copy.meeting_key) delete copy.meeting_key;
              if (copy.session_key) delete copy.session_key;
              if (!intervalsMap[dn]) intervalsMap[dn] = [];
              intervalsMap[dn].push(copy);
              driversSet.add(dn);
            }
          } catch (e) {}

          // location
          try {
            const path = `location?session_key=${encodeURIComponent(sessionKey)}&date%3E=${encodeURIComponent(a)}&date%3C=${encodeURIComponent(b)}`;
            const { data } = await getCachedWithTTL(
              path,
              `${BASE_URL}${path}`,
              10000,
            ).catch(() => ({ data: null }));
            const arr = normalizeArray(data);
            for (const it of arr) {
              const dn = String(it.driver_number || it.driverNumber || "");
              if (!dn) continue;
              const copy = { ...it };
              if (copy.meeting_key) delete copy.meeting_key;
              if (copy.session_key) delete copy.session_key;
              if (!locationMap[dn]) locationMap[dn] = [];
              locationMap[dn].push(copy);
              driversSet.add(dn);
            }
          } catch (e) {}

          // position (like intervals/location)
          try {
            const path = `position?session_key=${encodeURIComponent(sessionKey)}&date%3E=${encodeURIComponent(a)}&date%3C=${encodeURIComponent(b)}`;
            const { data } = await getCachedWithTTL(
              path,
              `${BASE_URL}${path}`,
              10000,
            ).catch(() => ({ data: null }));
            const arrPos = normalizeArray(data);
            for (const it of arrPos) {
              const dn = String(it.driver_number || it.driverNumber || "");
              if (!dn) continue;
              const copy = { ...it };
              if (copy.meeting_key) delete copy.meeting_key;
              if (copy.session_key) delete copy.session_key;
              if (!positionMap[dn]) positionMap[dn] = [];
              positionMap[dn].push(copy);
              driversSet.add(dn);
            }
          } catch (e) {}

          // live versions of other resources (overtakes, pit, race_control, stints, session_result)
          try {
            const liveResources = [
              "overtakes",
              "pit",
              "race_control",
              "stints",
              "session_result",
              "position",
            ];
            for (const name of liveResources) {
              try {
                const path = `${name}?session_key=${encodeURIComponent(sessionKey)}&date%3E=${encodeURIComponent(a)}&date%3C=${encodeURIComponent(b)}`;
                const { data } = await getCachedWithTTL(
                  path,
                  `${BASE_URL}${path}`,
                  10000,
                ).catch(() => ({ data: null }));
                const liveArr = normalizeArray(data);
                if (Array.isArray(liveArr) && liveArr.length > 0) {
                  // replace the previously fetched full-ttl resource with the live window
                  resources[name] = liveArr;
                  for (const it of liveArr) {
                    if (!it) continue;
                    if (it.meeting_key) delete it.meeting_key;
                    if (it.session_key) delete it.session_key;
                    const dn = String(
                      it.driver_number || it.driverNumber || "",
                    );
                    if (dn) driversSet.add(dn);
                  }
                }
              } catch (e) {
                // ignore per-resource live fetch errors
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {
      // ignore live fetch errors
    }
    // reduce intervals/location to last sample per driver (if present)
    try {
      for (const dn of Object.keys(intervalsMap)) {
        const arr = intervalsMap[dn];
        if (Array.isArray(arr) && arr.length > 0) {
          let last = arr[0];
          for (const it of arr) {
            if (!it || !it.date) continue;
            if (new Date(it.date).getTime() >= new Date(last.date).getTime())
              last = it;
          }
          intervalsMap[dn] = last;
        }
      }
      for (const dn of Object.keys(locationMap)) {
        const arr = locationMap[dn];
        if (Array.isArray(arr) && arr.length > 0) {
          let last = arr[0];
          for (const it of arr) {
            if (!it || !it.date) continue;
            if (new Date(it.date).getTime() >= new Date(last.date).getTime())
              last = it;
          }
          locationMap[dn] = last;
        }
      }
      for (const dn of Object.keys(positionMap)) {
        const arr = positionMap[dn];
        if (Array.isArray(arr) && arr.length > 0) {
          let last = arr[0];
          for (const it of arr) {
            if (!it || !it.date) continue;
            if (new Date(it.date).getTime() >= new Date(last.date).getTime())
              last = it;
          }
          positionMap[dn] = last;
        }
      }
    } catch (e) {
      // ignore reducing errors
    }

    // --- build positions map from 'position' resource scoped to this session ---
    const positionsMap = Object.create(null);
    try {
      const posArr = resources.position || [];
      // filter positions for this session_key only
      const filteredPos = posArr.filter((p) => {
        const sk = p?.session_key || p?.sessionKey || null;
        if (!sk) return false;
        return String(sk) === String(sessionKey);
      });
      if ((posArr.length || 0) > 0 && filteredPos.length === 0) {
        try {
          console.log(
            `[positions] session=${sessionKey} posArr_total=${posArr.length} filtered_for_session=0 — NOT using global posArr to avoid mixing sessions`,
          );
        } catch (e) {}
      }
      const toUse = filteredPos; // only use entries that specifically match this session
      // sort by date if date exists
      toUse.sort((a, b) => {
        const da = new Date(a.date || a.timestamp || a.t || 0).getTime() || 0;
        const db = new Date(b.date || b.timestamp || b.t || 0).getTime() || 0;
        return da - db;
      });
      for (const p of toUse) {
        const dn = String(
          p?.driver_number || p?.driverNumber || p?.driver || "",
        );
        if (!dn) continue;
        if (!positionsMap[dn])
          positionsMap[dn] = { position: null, record: [] };
        // push recorded position into record array (use null or string coercion)
        const posVal = p.position ?? p.position_current ?? p.pos ?? null;
        positionsMap[dn].record.push(posVal);
        // keep last known as position
        positionsMap[dn].position = posVal;
      }
    } catch (e) {
      // ignore
    }

    // --- build laps map per driver: last valid lap + fastest lap and fastest st_speed ---
    const lapsByDriver = Object.create(null);
    try {
      const lapsArr = resources.laps || [];
      // ensure chronological order
      lapsArr.sort((a, b) => {
        const da = new Date(a.date_start || a.date || 0).getTime() || 0;
        const db = new Date(b.date_start || b.date || 0).getTime() || 0;
        return da - db;
      });
      for (const lap of lapsArr) {
        const dn = String(
          lap?.driver_number || lap?.driverNumber || lap?.driver || "",
        );
        if (!dn) continue;
        if (!lapsByDriver[dn]) {
          lapsByDriver[dn] = {
            lastLap: null,
            fastest_lap: null,
            fastest_st_speed: null,
          };
        }
        // last lap with duration_sector_1 != null
        if (lap.duration_sector_1 != null) {
          lapsByDriver[dn].lastLap = lap;
        }
        // fastest lap (lowest lap_duration)
        const lapDur = lap.lap_duration ?? lap.duration ?? null;
        if (lapDur != null) {
          const cur = lapsByDriver[dn].fastest_lap;
          if (!cur || cur.lap_duration == null || lapDur < cur.lap_duration) {
            lapsByDriver[dn].fastest_lap = {
              lap_number: lap.lap_number ?? lap.lapNumber ?? null,
              lap_duration: lapDur,
            };
          }
        }
        // fastest st_speed (max)
        const st = lap.st_speed ?? lap.stSpeed ?? lap.st_speed ?? null;
        if (st != null) {
          const cur = lapsByDriver[dn].fastest_st_speed;
          if (!cur || cur.st_speed == null || st > cur.st_speed) {
            lapsByDriver[dn].fastest_st_speed = {
              lap_number: lap.lap_number ?? lap.lapNumber ?? null,
              st_speed: st,
            };
          }
        }
      }

      const formatGap = (gapSeconds) => {
        if (!Number.isFinite(gapSeconds) || gapSeconds <= 0) return "0.000";
        return gapSeconds.toFixed(3);
      };

      const formatLapGap = (lapDiff) => {
        if (!Number.isFinite(lapDiff) || lapDiff <= 0) return null;
        const displayLaps = Math.max(1, lapDiff - 1);
        return `${displayLaps} ${displayLaps === 1 ? "Lap" : "Laps"}`;
      };

      const driverOrder = Object.keys(lapsByDriver)
        .map((dn) => {
          const info = lapsByDriver[dn];
          const validLaps = Array.isArray(info?.lastLap) ? [] : [];
          return { dn, info };
        });

      const driverTimes = Object.create(null);
      let leaderDriver = null;
      let leaderTotalTime = null;
      let leaderLapNumber = null;

      for (const dn of Object.keys(lapsByDriver)) {
        const info = lapsByDriver[dn];
        const driverLaps = lapsArr.filter(
          (lap) => String(lap?.driver_number || lap?.driverNumber || lap?.driver || "") === String(dn),
        );

        // laps that have any sector data (include laps even if some sectors are null)
        const sectorLaps = driverLaps.filter(
          (lap) =>
            lap &&
            (lap.duration_sector_1 != null || lap.duration_sector_2 != null || lap.duration_sector_3 != null),
        );

        let totalTime = null;
        let lapsUsed = 0;
        if (sectorLaps.length > 0) {
          totalTime = sectorLaps.reduce((sum, lap) => {
            // prefer explicit lap_duration/duration when available
            const lapDurRaw = lap.lap_duration ?? lap.duration ?? null;
            const lapDur = lapDurRaw != null ? Number(lapDurRaw) : null;
            if (lapDur != null && Number.isFinite(lapDur)) return sum + lapDur;
            const s1 = Number(lap.duration_sector_1) || 0;
            const s2 = Number(lap.duration_sector_2) || 0;
            const s3 = Number(lap.duration_sector_3) || 0;
            return sum + s1 + s2 + s3;
          }, 0);
          lapsUsed = sectorLaps.length;
        } else {
          // fallback to most recent lap_duration if sectors not available
          const lastWithLapDuration = driverLaps
            .slice()
            .reverse()
            .find((l) => (l && (l.lap_duration != null || l.duration != null)));
          if (lastWithLapDuration) {
            totalTime = Number(lastWithLapDuration.lap_duration ?? lastWithLapDuration.duration) || null;
            lapsUsed = 1;
          }
        }

        const currentLap = info?.lastLap?.lap_number ?? info?.lastLap?.lapNumber ?? null;
        const currentLapNumber = Number(currentLap);
        const currentLapValid = Number.isFinite(currentLapNumber) ? currentLapNumber : null;

        lapsByDriver[dn].driver_time = {
          time: totalTime != null ? Number(totalTime.toFixed(3)) : null,
          behind: null,
          laps_used: lapsUsed,
        };
        driverTimes[dn] = {
          totalTime: totalTime != null ? Number(totalTime.toFixed(3)) : null,
          currentLap: currentLapValid,
          lapsUsed,
        };
      }

      const allDriverEntries = Object.entries(driverTimes).filter(([, v]) => v.totalTime != null);
      if (allDriverEntries.length > 0) {
        const maxLap = allDriverEntries.reduce((max, [, v]) => Math.max(max, v.currentLap || 0), 0);
        const leadCandidates = allDriverEntries.filter(([, v]) => (v.currentLap || 0) === maxLap);
        const leadByTime = leadCandidates.length > 0 ? leadCandidates : allDriverEntries;
        leadByTime.sort((a, b) => a[1].totalTime - b[1].totalTime);
        leaderDriver = leadByTime[0][0];
        leaderTotalTime = leadByTime[0][1].totalTime;
        leaderLapNumber = leadByTime[0][1].currentLap || maxLap || null;

        for (const [dn, v] of allDriverEntries) {
          const info = lapsByDriver[dn];
          if (!info || !info.driver_time) continue;
          const lapDiff = (leaderLapNumber || 0) - (v.currentLap || 0);
          if (lapDiff > 0) {
            info.driver_time.behind = formatLapGap(lapDiff);
          } else if (leaderTotalTime != null && v.totalTime != null) {
            info.driver_time.behind = formatGap(v.totalTime - leaderTotalTime);
          }
        }
      }
    } catch (e) {
      // ignore
    }

    // assemble driver list referenced
    const collectDriversFrom = (arr) => {
      if (!Array.isArray(arr)) return;
      for (const it of arr) {
        if (it?.driver_number) driversSet.add(String(it.driver_number));
        if (it?.driverNumber) driversSet.add(String(it.driverNumber));
      }
    };
    collectDriversFrom(starting_grid || []);
    collectDriversFrom(resources.overtakes || []);
    collectDriversFrom(resources.pit || []);
    collectDriversFrom(resources.race_control || []);
    collectDriversFrom(resources.stints || []);
    collectDriversFrom(resources.session_result || []);
    collectDriversFrom(resources.position || []);
    if (weatherObj && weatherObj.driver_number)
      driversSet.add(String(weatherObj.driver_number));

    // build drivers map only for referenced drivers
    const driversGlobal = normalizeArray(cache.get("drivers")?.data);
    const driversMap = Object.create(null);
    for (const d of driversGlobal) {
      const dn = String(d.driver_number);
      if (driversSet.has(dn))
        driversMap[dn] = {
          name: d.full_name || d.broadcast_name || d.fullName || d.name || null,
          headshot_url: d.headshot_url || d.headshotUrl || null,
        };
    }

    // build meetings/sessions maps only for referenced keys
    const meetingsMap = Object.create(null);
    const sessionsMap = Object.create(null);
    if (meetingObj && meetingObj.meeting_key)
      meetingsMap[String(meetingObj.meeting_key)] =
        meetingObj.meeting_name || meetingObj.name || null;
    if (sessionObj && sessionObj.session_key)
      sessionsMap[String(sessionObj.session_key)] =
        (sessionObj.circuit_short_name ||
          sessionObj.circuit?.short_name ||
          "") +
        (sessionObj.session_name ? ` - ${sessionObj.session_name}` : "");

    const assembled = {
      session: sessionObj,
      meeting: meetingObj,
      circuit_info: circuitInfo,
      starting_grid: starting_grid,
      overtakes: resources.overtakes || [],
      pits: resources.pit || [],
      race_control: resources.race_control || [],
      stints: resources.stints || [],
      session_result: resources.session_result || [],
      intervals: intervalsMap,
      location: locationMap,
      positions: positionsMap,
      laps: {
        byDriver: lapsByDriver,
      },
      weather: weatherObj,
      maps: {
        meetings: meetingsMap,
        sessions: sessionsMap,
        drivers: driversMap,
      },
    };

    // cache assembled
    cache.set(cacheKey, { data: assembled, fetchedAt: Date.now() });
    // ensure refresh interval for assembled session
    try {
      const now = Date.now();
      const startMs = new Date(
        sessionObj.date_start || sessionObj.dateStart,
      ).getTime();
      const endMs = new Date(
        sessionObj.date_end || sessionObj.dateEnd,
      ).getTime();
      const hasValidDates = Number.isFinite(startMs) && Number.isFinite(endMs);
      const liveWindowStart = hasValidDates
        ? startMs - 15 * 60 * 1000
        : -Infinity;
      const liveWindowEnd = hasValidDates ? endMs + 15 * 60 * 1000 : -Infinity;
      const isLiveWindow =
        hasValidDates && now >= liveWindowStart && now <= liveWindowEnd;
      // Only use aggressive 10s refresh if either (a) caller forced live and a recent
      // active live request exists for this session, or (b) we're in the live time
      // window and there is a recent active live request. This avoids polling when
      // no clients are actively requesting live data.
      const hasActiveClient = activeLiveClients.has(String(sessionKey));
      const shouldUseFastRefresh =
        hasActiveClient && ((options && options.forceLive) || isLiveWindow);
      const refreshMs = shouldUseFastRefresh ? 10000 : ttl;

      // if there's an existing interval, clear it so we can set the new cadence
      if (refreshIntervals.has(cacheKey)) {
        try {
          clearInterval(refreshIntervals.get(cacheKey));
        } catch (e) {}
        refreshIntervals.delete(cacheKey);
      }

      const id = setInterval(
        () => buildAndCacheSession(sessionKey, options).catch(() => {}),
        refreshMs,
      );
      refreshIntervals.set(cacheKey, id);
    } catch (e) {
      // ignore interval creation errors
    }

    return assembled;
  } catch (e) {
    throw e;
  }
}

app.get("/session", async (req, res) => {
  try {
    // support either session_key or meeting_key
    let sessionKey = req.query.session_key || req.query.s || null;
    const meetingKey = req.query.meeting_key || req.query.m || null;

    // if meeting_key provided, choose a session for that meeting based on cached sessions
    if (!sessionKey && meetingKey) {
      const sessionsGlobal = cache.get("sessions")?.data || [];
      const arr = normalizeArray(sessionsGlobal).filter(
        (s) =>
          String(s.meeting_key || s.meetingKey || "") === String(meetingKey),
      );
      if (arr.length === 0)
        return res.status(404).json({ error: "no sessions found for meeting" });

      const now = Date.now();
      // parse dates safely
      const parseStart = (s) => {
        const d = s.date_start || s.dateStart || s.start || null;
        const t = d ? new Date(d).getTime() : NaN;
        return Number.isFinite(t) ? t : null;
      };
      const parseEnd = (s) => {
        const d = s.date_end || s.dateEnd || s.end || null;
        const t = d ? new Date(d).getTime() : NaN;
        return Number.isFinite(t) ? t : null;
      };

      // New selection logic: choose the first session (by start time ascending)
      // that has NO winner. If all sessions have winners, choose the last
      // session that has a winner (by end/start time). This matches the
      // UI expectation: "next session with no winner" fallback to last
      // with winner.
      // Prefer authoritative meeting endpoint for winner info. If unavailable, fall back to session_result cache.
      let meetingProviderSessions = null;
      try {
        const provKey = `meeting_provider:${meetingKey}`;
        const provUrl = `https://laraiyeogithubio-production-ed10.up.railway.app/meeting/${encodeURIComponent(meetingKey)}`;
        const provRes = await getCachedWithTTL(provKey, provUrl, TTL_6H).catch(
          () => ({ data: null }),
        );
        if (provRes && provRes.data) {
          // provider returns { meeting, sessions }
          const payload = provRes.data;
          meetingProviderSessions = Array.isArray(payload.sessions)
            ? payload.sessions
            : normalizeArray(payload?.sessions || payload?.data || []);
        }
      } catch (e) {
        meetingProviderSessions = null;
      }

      let resultsArr = [];
      try {
        resultsArr = normalizeArray(cache.get("session_result")?.data);
      } catch (e) {
        resultsArr = [];
      }

      // Log sessions and which source we're using for winner info
      try {
        const source = meetingProviderSessions
          ? "meeting_provider"
          : "session_result_cache";
        console.log(
          `[session-selection] meeting=${meetingKey} winner_source=${source} session_result_count=${resultsArr.length}`,
        );
        const statusList = arr.map((s) => {
          const sk = s.session_key || s.sessionKey;
          const name = s.session_name || s.sessionName || "";
          let has = null;
          if (meetingProviderSessions) {
            const ms = meetingProviderSessions.find(
              (m) => String(m.session_key) === String(sk),
            );
            has = ms ? (ms.winner ? true : false) : null;
          }
          if (has === null) {
            has = resultsArr.some(
              (r) =>
                String(r.session_key) === String(sk) &&
                (String(r.position) === "1" || r.position === 1),
            );
          }
          return `${sk}:${name}:${has === true ? "HAS_WINNER" : has === false ? "NO_WINNER" : "UNKNOWN"}`;
        });
        console.log(
          `[session-selection] sessions_status=${statusList.join(", ")}`,
        );
      } catch (e) {}

      // Choose the first session in the provided sessions array that has NO winner.
      // If all sessions have winners, choose the last session that has a winner.
      // This intentionally ignores start/end times and uses the original ordering
      // returned by the upstream sessions payload.
      let chosen = null;
      for (const s of arr) {
        const sk = s.session_key || s.sessionKey;
        let hasWinner = null;
        if (meetingProviderSessions) {
          const ms = meetingProviderSessions.find(
            (m) => String(m.session_key) === String(sk),
          );
          if (ms) hasWinner = !!ms.winner;
        }
        if (hasWinner === null) {
          hasWinner = resultsArr.some(
            (r) =>
              String(r.session_key) === String(sk) &&
              (String(r.position) === "1" || r.position === 1),
          );
        }
        if (!hasWinner) {
          chosen = s;
          break;
        }
      }

      if (!chosen) {
        // all have winners — pick last one with a winner in original order
        for (let i = arr.length - 1; i >= 0; i--) {
          const s = arr[i];
          const sk = s.session_key || s.sessionKey;
          let hasWinner = null;
          if (meetingProviderSessions) {
            const ms = meetingProviderSessions.find(
              (m) => String(m.session_key) === String(sk),
            );
            if (ms) hasWinner = !!ms.winner;
          }
          if (hasWinner === null) {
            hasWinner = resultsArr.some(
              (r) =>
                String(r.session_key) === String(sk) &&
                (String(r.position) === "1" || r.position === 1),
            );
          }
          if (hasWinner) {
            chosen = s;
            break;
          }
        }
      }
      sessionKey = chosen
        ? chosen.session_key || chosen.sessionKey || null
        : null;
      try {
        const expected = arr.find((s) => {
          const sk = s.session_key || s.sessionKey;
          return !resultsArr.some(
            (r) =>
              String(r.session_key) === String(sk) &&
              (String(r.position) === "1" || r.position === 1),
          );
        });
        console.log(
          `[session-selection] expected_choice=${expected ? expected.session_key || expected.sessionKey : "none"}`,
        );
        console.log(
          `[session-selection] chosen=${sessionKey} reason=${chosen ? (resultsArr.some((r) => String(r.session_key) === String(chosen.session_key) && (String(r.position) === "1" || r.position === 1)) ? "hasWinner" : "noWinner") : "none"}`,
        );
      } catch (e) {}
      if (!sessionKey)
        return res
          .status(404)
          .json({ error: "could not determine session_key for meeting" });
    }

    if (!sessionKey)
      return res.status(400).json({ error: "session_key required" });
    const cacheKey = `session:${sessionKey}`;

    // find session to compute TTL
    let sessionObj = null;
    const sessionsGlobal = cache.get("sessions")?.data;
    if (sessionsGlobal) {
      const arr = normalizeArray(sessionsGlobal);
      sessionObj = arr.find(
        (s) => String(s.session_key) === String(sessionKey),
      );
    }
    if (!sessionObj) {
      const path = `sessions?session_key=${encodeURIComponent(sessionKey)}`;
      const { data } = await getCachedWithTTL(
        path,
        `${BASE_URL}${path}`,
        TTL_6H,
      ).catch(() => ({ data: null }));
      sessionObj = normalizeArray(data)[0] || null;
    }

    const ttl = computeSessionTTLFromDates(
      sessionObj?.date_start || sessionObj?.dateStart,
      sessionObj?.date_end || sessionObj?.dateEnd,
    );

    // return cached assembled if fresh (unless forcing live)
    const forceLive = String(req.query.status || "").toLowerCase() === "live";
    const entry = cache.get(cacheKey);
    if (entry && !forceLive) {
      const age = Date.now() - entry.fetchedAt;
      if (age < ttl) {
        setCachingHeaders(res, ttl);
        return res.json({ source: "cache", data: entry.data });
      }
    }

    // if forcing live, mark session active so 10s polling will be enabled
    if (forceLive) markSessionActive(sessionKey);
    if (forceLive) markSessionActive(sessionKey);
    const assembled = await buildAndCacheSession(sessionKey, {
      forceLive,
      initTime: Date.now(),
    });
    setCachingHeaders(res, ttl);
    res.json({ source: "origin", data: assembled });
  } catch (e) {
    res
      .status(502)
      .json({ error: "Failed to fetch session", details: e.message });
  }
});

// Path-style session route: /session/:session_key/:status?
app.get("/session/:session_key/:status?", async (req, res) => {
  try {
    let sessionKey = req.params.session_key;
    const status = req.params.status || null;
    if (!sessionKey)
      return res.status(400).json({ error: "session_key required" });
    const cacheKey = `session:${sessionKey}`;

    // try to find session object in cache by session_key first
    let sessionObj = null;
    const sessionsGlobal = cache.get("sessions")?.data;
    if (sessionsGlobal) {
      const arr = normalizeArray(sessionsGlobal);
      sessionObj = arr.find(
        (s) => String(s.session_key) === String(sessionKey),
      );
    }

    // if not found by session_key, treat the provided param as a meeting_key and try to pick a session
    if (!sessionObj) {
      // ensure we have sessions cached (may fetch)
      const allSessionsData =
        sessionsGlobal ||
        (
          await getCachedWithTTL(
            "sessions",
            `${BASE_URL}sessions`,
            TTL_6H,
          ).catch(() => ({ data: null }))
        ).data ||
        [];
      const sessArr = normalizeArray(allSessionsData).filter(
        (s) =>
          String(s.meeting_key || s.meetingKey || "") === String(sessionKey),
      );

      if (sessArr.length > 0) {
        const now = Date.now();
        const parseStart = (s) => {
          const d = s.date_start || s.dateStart || s.start || null;
          const t = d ? new Date(d).getTime() : NaN;
          return Number.isFinite(t) ? t : null;
        };
        const parseEnd = (s) => {
          const d = s.date_end || s.dateEnd || s.end || null;
          const t = d ? new Date(d).getTime() : NaN;
          return Number.isFinite(t) ? t : null;
        };

        // Simplified selection: pick the next session with NO winner.
        // If all sessions have winners, pick the last session with a winner.
        // Ensure we have session_result data available to check winners.
        // Prefer external meeting provider for winner info first (does not rely on session_result cache)
        let meetingProviderSessions = null;
        try {
          const provKey = `meeting_provider:${sessionKey}`;
          const provUrl = `https://laraiyeogithubio-production-ed10.up.railway.app/meeting/${encodeURIComponent(sessionKey)}`;
          const provRes = await getCachedWithTTL(
            provKey,
            provUrl,
            TTL_6H,
          ).catch(() => ({ data: null }));
          if (provRes && provRes.data) {
            const payload = provRes.data;
            meetingProviderSessions = Array.isArray(payload.sessions)
              ? payload.sessions
              : normalizeArray(payload?.sessions || payload?.data || []);
          }
        } catch (e) {
          meetingProviderSessions = null;
        }

        let resultsArr = normalizeArray(
          cache.get("session_result")?.data || [],
        );
        if (!resultsArr || resultsArr.length === 0) {
          try {
            const sr = await getCachedWithTTL(
              "session_result",
              `${BASE_URL}session_result`,
              TTL_1H,
            ).catch(() => ({ data: [] }));
            resultsArr = normalizeArray(sr.data);
          } catch (e) {
            resultsArr = [];
          }
        }

        try {
          const source = meetingProviderSessions
            ? "meeting_provider"
            : "session_result_cache";
          console.log(
            `[session-selection-path] meeting=${sessionKey} winner_source=${source} sessArr=${sessArr
              .map(
                (s) =>
                  `${s.session_key || s.sessionKey}:${s.session_name || s.sessionName}`,
              )
              .join(", ")}`,
          );
          console.log(
            `[session-selection-path] cached session_result count=${resultsArr.length}`,
          );
          const statusList = sessArr.map((s) => {
            const sk = s.session_key || s.sessionKey;
            const name = s.session_name || s.sessionName || "";
            let has = null;
            if (meetingProviderSessions) {
              const ms = meetingProviderSessions.find(
                (m) => String(m.session_key) === String(sk),
              );
              has = ms ? (ms.winner ? true : false) : null;
            }
            if (has === null) {
              has = resultsArr.some(
                (r) =>
                  String(r.session_key) === String(sk) &&
                  (String(r.position) === "1" || r.position === 1),
              );
            }
            return `${sk}:${name}:${has === true ? "HAS_WINNER" : has === false ? "NO_WINNER" : "UNKNOWN"}`;
          });
          console.log(
            `[session-selection-path] sessions_status=${statusList.join(", ")}`,
          );
        } catch (e) {}

        // sort sessions by start time asc for predictable ordering
        const sorted = sessArr
          .slice()
          .map((s) => ({ s, st: parseStart(s), en: parseEnd(s) }))
          .sort((a, b) => (a.st || 0) - (b.st || 0))
          .map((x) => x.s);

        // helper to check winner using meetingProviderSessions first then session_result
        const hasWinner = (s) => {
          const sk = String(s.session_key || s.sessionKey || "");
          if (meetingProviderSessions) {
            const ms = meetingProviderSessions.find(
              (m) => String(m.session_key) === sk,
            );
            if (ms) return !!ms.winner;
          }
          return resultsArr.some(
            (r) =>
              String(r.session_key) === sk &&
              (String(r.position) === "1" || r.position === 1),
          );
        };

        // Pick the next session without a winner (earliest start)
        let chosen = sorted.find((s) => !hasWinner(s));

        // if none, prefer a currently live session without a winner
        if (!chosen) {
          chosen = sorted.find((s) => {
            const st = parseStart(s);
            const en = parseEnd(s);
            return (
              st !== null &&
              en !== null &&
              now >= st &&
              now <= en &&
              !hasWinner(s)
            );
          });
        }

        // if still none, pick any session without a winner (earliest by start)
        if (!chosen) {
          chosen = sorted.find((s) => !hasWinner(s));
        }

        // fallback if all have winners
        if (!chosen) {
          const withTimes = sorted
            .map((s) => ({ s, en: parseEnd(s) || parseStart(s) || 0 }))
            .sort((a, b) => b.en - a.en);
          chosen = withTimes.map((x) => x.s).find((s) => hasWinner(s)) || null;
        }

        sessionKey = chosen
          ? chosen.session_key || chosen.sessionKey || null
          : null;
        try {
          console.log(
            `[session-selection-path] chosen=${sessionKey} reason=${chosen ? (hasWinner(chosen) ? "hasWinner" : "noWinner") : "none"}`,
          );
        } catch (e) {}
        if (sessionKey) {
          // now fetch sessionObj by sessionKey
          const path = `sessions?session_key=${encodeURIComponent(sessionKey)}`;
          const { data } = await getCachedWithTTL(
            path,
            `${BASE_URL}${path}`,
            TTL_6H,
          ).catch(() => ({ data: null }));
          sessionObj = normalizeArray(data)[0] || null;
        }
      }

      // if still not found, try the original session_key fetch as fallback
      if (!sessionObj && !sessionsGlobal) {
        const path = `sessions?session_key=${encodeURIComponent(sessionKey)}`;
        const { data } = await getCachedWithTTL(
          path,
          `${BASE_URL}${path}`,
          TTL_6H,
        ).catch(() => ({ data: null }));
        sessionObj = normalizeArray(data)[0] || null;
      }
    }

    const ttl = computeSessionTTLFromDates(
      sessionObj?.date_start || sessionObj?.dateStart,
      sessionObj?.date_end || sessionObj?.dateEnd,
    );

    const forceLive =
      status === "live" ||
      String(req.query.status || "").toLowerCase() === "live";
    const entry = cache.get(cacheKey);
    if (entry && !forceLive) {
      const age = Date.now() - entry.fetchedAt;
      if (age < ttl) {
        setCachingHeaders(res, ttl);
        return res.json({ source: "cache", data: entry.data });
      }
    }

    const assembled = await buildAndCacheSession(sessionKey, {
      forceLive,
      initTime: Date.now(),
    });
    setCachingHeaders(res, ttl);
    res.json({ source: "origin", data: assembled });
  } catch (e) {
    res
      .status(502)
      .json({ error: "Failed to fetch session", details: e.message });
  }
});

// Sessions endpoint - cache for 6 hours, remove circuit_key and country_key
app.get("/sessions", async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const path = qs ? `sessions?${qs}` : "sessions";
    const url = `${BASE_URL}${path}`;
    const key = path;

    const { data, fromCache } = await getCachedWithTTL(key, url, TTL_6H);
    let arr = normalizeArray(data);
    if (Array.isArray(arr)) {
      for (const it of arr) {
        if (it && Object.prototype.hasOwnProperty.call(it, "circuit_key"))
          delete it.circuit_key;
        if (it && Object.prototype.hasOwnProperty.call(it, "country_key"))
          delete it.country_key;
      }
    }

    ensureRefreshInterval(key, url, TTL_6H);
    setCachingHeaders(res, TTL_6H);
    res.json({ source: fromCache ? "cache" : "origin", data: arr });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch sessions", details: err.message });
  }
});

// DEBUG: expose cached session_result (optional session_key filter)
app.get("/debug/session_results/:session_key?", async (req, res) => {
  try {
    const sk = req.params.session_key || null;
    let arr = normalizeArray(cache.get("session_result")?.data || []);
    if ((!arr || arr.length === 0) && !sk) {
      // try to prime cache from upstream
      const sr = await getCachedWithTTL(
        "session_result",
        `${BASE_URL}session_result`,
        TTL_1H,
      ).catch(() => ({ data: [] }));
      arr = normalizeArray(sr.data);
    }
    if (sk) {
      arr = arr.filter((r) => String(r.session_key) === String(sk));
    }
    const hasWinner = arr.some(
      (r) => String(r.position) === "1" || r.position === 1,
    );
    setCachingHeaders(res, TTL_1H);
    res.json({ count: arr.length, hasWinner, sample: arr.slice(0, 50) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper to expand meeting_key param: commas => multiple params, and 'All' => all cached meeting keys
function buildMeetingQuery(originalQuery) {
  const q = { ...originalQuery };
  const keys = [];
  if (q.meeting_key && typeof q.meeting_key === "string") {
    if (q.meeting_key.toLowerCase() === "all") {
      // use cached meetings
      const meetingsEntry =
        cache.get("meetings") ||
        cache.get("meetings?year=2026") ||
        cache.get("meetings?");
      const mdata = meetingsEntry?.data || [];
      const arr = normalizeArray(mdata);
      for (const m of arr) {
        if (m?.meeting_key) keys.push(String(m.meeting_key));
      }
    } else {
      const parts = q.meeting_key
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const p of parts) keys.push(p);
    }
    delete q.meeting_key;
  }
  return { q, keys };
}

// Group championship drivers by driver_number
function groupChampionshipDrivers(arr) {
  const map = Object.create(null);
  for (const it of arr) {
    const dn = String(it?.driver_number ?? it?.driverNumber ?? "");
    const mk = String(it?.meeting_key ?? it?.meetingKey ?? "");
    const sk = String(it?.session_key ?? it?.sessionKey ?? "");
    if (!dn) continue;
    if (!map[dn])
      map[dn] = { driver_number: dn, meetings: Object.create(null) };
    const meetings = map[dn].meetings;
    if (!meetings[mk]) meetings[mk] = Object.create(null);
    meetings[mk][sk] = {
      position_start: it.position_start ?? it.positionStart ?? null,
      position_current: it.position_current ?? it.positionCurrent ?? null,
      points_start: it.points_start ?? it.pointsStart ?? null,
      points_current: it.points_current ?? it.pointsCurrent ?? null,
    };
  }
  return Object.values(map);
}

// Group championship teams by team_name
function groupChampionshipTeams(arr) {
  const map = Object.create(null);
  for (const it of arr) {
    const tn = String(it?.team_name ?? it?.teamName ?? "");
    const mk = String(it?.meeting_key ?? it?.meetingKey ?? "");
    const sk = String(it?.session_key ?? it?.sessionKey ?? "");
    if (!tn) continue;
    if (!map[tn]) map[tn] = { team_name: tn, meetings: Object.create(null) };
    const meetings = map[tn].meetings;
    if (!meetings[mk]) meetings[mk] = Object.create(null);
    meetings[mk][sk] = {
      position_start: it.position_start ?? it.positionStart ?? null,
      position_current: it.position_current ?? it.positionCurrent ?? null,
      points_start: it.points_start ?? it.pointsStart ?? null,
      points_current: it.points_current ?? it.pointsCurrent ?? null,
    };
  }
  return Object.values(map);
}

// championship_drivers - 1 hour cache
app.get("/championship_drivers", async (req, res) => {
  try {
    const { q, keys } = buildMeetingQuery(req.query);
    const params = new URLSearchParams(q);
    // append meeting_key params
    for (const k of keys) params.append("meeting_key", k);
    const qs = params.toString();
    const path = qs ? `championship_drivers?${qs}` : "championship_drivers";
    const url = `${BASE_URL}${path}`;
    const key = path;

    const { data, fromCache } = await getCachedWithTTL(key, url, TTL_1H);
    let arr = normalizeArray(data);
    const grouped = groupChampionshipDrivers(arr);

    ensureRefreshInterval(key, url, TTL_1H);
    setCachingHeaders(res, TTL_1H);
    // build maps
    const meetingsEntry = cache.get("meetings");
    const sessionsEntry = cache.get("sessions");
    const meetingsArr = normalizeArray(meetingsEntry?.data);
    const sessionsArr = normalizeArray(sessionsEntry?.data);
    const meetingsMap = Object.create(null);
    for (const m of meetingsArr) {
      if (m?.meeting_key)
        meetingsMap[String(m.meeting_key)] =
          m.meeting_name || m.name || m.title || null;
    }
    const sessionsMap = Object.create(null);
    for (const s of sessionsArr) {
      if (!s?.session_key) continue;
      const circuit =
        s.circuit_short_name || s.circuit?.short_name || s.circuit_name || "";
      const name = s.session_name || s.name || "";
      sessionsMap[String(s.session_key)] =
        `${circuit}${circuit && name ? " - " : ""}${name}`;
    }
    // drivers map
    const driversEntry = cache.get("drivers");
    const driversArr = normalizeArray(driversEntry?.data);
    const driversMap = Object.create(null);
    for (const d of driversArr) {
      if (!d?.driver_number) continue;
      driversMap[String(d.driver_number)] = {
        name: d.full_name || d.broadcast_name || d.fullName || d.name || null,
        headshot_url: d.headshot_url || d.headshotUrl || null,
      };
    }

    res.json({
      source: fromCache ? "cache" : "origin",
      data: grouped,
      maps: {
        meetings: meetingsMap,
        sessions: sessionsMap,
        drivers: driversMap,
      },
    });
  } catch (err) {
    res.status(502).json({
      error: "Failed to fetch championship_drivers",
      details: err.message,
    });
  }
});

// championship_teams - 1 hour cache
app.get("/championship_teams", async (req, res) => {
  try {
    const { q, keys } = buildMeetingQuery(req.query);
    const params = new URLSearchParams(q);
    for (const k of keys) params.append("meeting_key", k);
    const qs = params.toString();
    const path = qs ? `championship_teams?${qs}` : "championship_teams";
    const url = `${BASE_URL}${path}`;
    const key = path;

    const { data, fromCache } = await getCachedWithTTL(key, url, TTL_1H);
    let arr = normalizeArray(data);
    const grouped = groupChampionshipTeams(arr);

    ensureRefreshInterval(key, url, TTL_1H);
    setCachingHeaders(res, TTL_1H);
    const meetingsEntry = cache.get("meetings");
    const sessionsEntry = cache.get("sessions");
    const meetingsArr = normalizeArray(meetingsEntry?.data);
    const sessionsArr = normalizeArray(sessionsEntry?.data);
    const meetingsMap = Object.create(null);
    for (const m of meetingsArr) {
      if (m?.meeting_key)
        meetingsMap[String(m.meeting_key)] =
          m.meeting_name || m.name || m.title || null;
    }
    const sessionsMap = Object.create(null);
    for (const s of sessionsArr) {
      if (!s?.session_key) continue;
      const circuit =
        s.circuit_short_name || s.circuit?.short_name || s.circuit_name || "";
      const name = s.session_name || s.name || "";
      sessionsMap[String(s.session_key)] =
        `${circuit}${circuit && name ? " - " : ""}${name}`;
    }
    // drivers map grouped by team
    const driversEntry = cache.get("drivers");
    const driversArr = normalizeArray(driversEntry?.data);
    const driversByTeam = Object.create(null);
    for (const d of driversArr) {
      const team = d?.team_name || d?.teamName || "";
      if (!team) continue;
      if (!driversByTeam[team]) driversByTeam[team] = Object.create(null);
      driversByTeam[team][String(d.driver_number)] =
        d.full_name || d.broadcast_name || d.fullName || d.name || null;
    }

    res.json({
      source: fromCache ? "cache" : "origin",
      data: grouped,
      maps: {
        meetings: meetingsMap,
        sessions: sessionsMap,
        drivers_by_team: driversByTeam,
      },
    });
  } catch (err) {
    res.status(502).json({
      error: "Failed to fetch championship_teams",
      details: err.message,
    });
  }
});

// Standings endpoint: combine championship_drivers and championship_teams
app.get("/standings", async (req, res) => {
  try {
    // ensure cached source data exists
    await getCachedWithTTL(
      "championship_drivers",
      `${BASE_URL}championship_drivers`,
      TTL_1H,
    ).catch(() => {});
    await getCachedWithTTL(
      "championship_teams",
      `${BASE_URL}championship_teams`,
      TTL_1H,
    ).catch(() => {});

    const driversRaw = normalizeArray(cache.get("championship_drivers")?.data);
    const teamsRaw = normalizeArray(cache.get("championship_teams")?.data);

    // Build latest-per-driver from championship_drivers (take last object in array for each driver)
    const driversByNumber = Object.create(null);
    for (const d of driversRaw) {
      const dn = String(d?.driver_number ?? d?.driverNumber ?? "");
      if (!dn) continue;
      if (!driversByNumber[dn]) driversByNumber[dn] = [];
      driversByNumber[dn].push(d);
    }

    const drivers = [];
    for (const dn of Object.keys(driversByNumber)) {
      const arr = driversByNumber[dn];
      const last = arr[arr.length - 1] || {};
      drivers.push({
        driver_number: dn,
        points_current:
          last.points_current ?? last.pointsCurrent ?? last.points ?? 0,
        position_current:
          last.position_current ??
          last.positionCurrent ??
          last.position ??
          null,
      });
    }

    // Build latest-per-team from championship_teams
    const teamsByName = Object.create(null);
    for (const t of teamsRaw) {
      const tn = String(t?.team_name ?? t?.teamName ?? "");
      if (!tn) continue;
      if (!teamsByName[tn]) teamsByName[tn] = [];
      teamsByName[tn].push(t);
    }

    const teams = [];
    for (const tn of Object.keys(teamsByName)) {
      const arr = teamsByName[tn];
      const last = arr[arr.length - 1] || {};
      teams.push({
        team_name: tn,
        points_current:
          last.points_current ?? last.pointsCurrent ?? last.points ?? 0,
        position_current:
          last.position_current ??
          last.positionCurrent ??
          last.position ??
          null,
      });
    }

    // Build drivers_by_team and drivers maps from cached drivers list
    const driversGlobal = normalizeArray(cache.get("drivers")?.data);
    const drivers_by_team = Object.create(null);
    const driversMap = Object.create(null);
    for (const dv of driversGlobal) {
      const team = dv?.team_name || dv?.teamName || "";
      const dn = String(dv?.driver_number ?? "");
      const name =
        dv?.full_name || dv?.broadcast_name || dv?.fullName || dv?.name || null;
      const head = dv?.headshot_url || dv?.headshotUrl || null;
      if (dn)
        driversMap[dn] = {
          name,
          headshot_url: head,
        };
      if (!team) continue;
      if (!drivers_by_team[team]) drivers_by_team[team] = Object.create(null);
      if (dn) drivers_by_team[team][dn] = name;
    }

    setCachingHeaders(res, TTL_1H);
    res.json({
      source: "cache",
      data: { drivers, teams, drivers_by_team, drivers_map: driversMap },
    });
  } catch (e) {
    res
      .status(502)
      .json({ error: "Failed to build standings", details: e?.message || e });
  }
});

// session_result and starting_grid - group by meeting then session (1 hour)
function groupByMeetingThenSession(arr) {
  const out = Object.create(null);
  for (const it of arr) {
    const mk = String(
      it?.meeting_key ?? it?.meetingKey ?? it?.meeting_key ?? "",
    );
    const sk = String(
      it?.session_key ?? it?.sessionKey ?? it?.session_key ?? "",
    );
    if (!mk) continue;
    if (!out[mk]) out[mk] = Object.create(null);
    if (!out[mk][sk]) out[mk][sk] = [];
    out[mk][sk].push(it);
  }
  return out;
}

app.get("/session_result", async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const path = qs ? `session_result?${qs}` : "session_result";
    const url = `${BASE_URL}${path}`;
    const key = path;

    await refreshSessionResultCacheIfLive();

    const { data, fromCache } = await getCachedWithTTL(key, url, TTL_1H);
    let arr = normalizeArray(data);
    const grouped = groupByMeetingThenSession(arr);
    // remove meeting_key/session_key from inner items now that they've been grouped
    for (const mk of Object.keys(grouped)) {
      for (const sk of Object.keys(grouped[mk])) {
        grouped[mk][sk] = grouped[mk][sk].map((it) => {
          const copy = { ...it };
          delete copy.meeting_key;
          delete copy.session_key;
          return copy;
        });
      }
    }

    ensureRefreshInterval(key, url, TTL_1H);
    setCachingHeaders(res, TTL_1H);
    // build maps (meetings, sessions, drivers)
    const meetingsEntry = cache.get("meetings");
    const sessionsEntry = cache.get("sessions");
    const meetingsArr = normalizeArray(meetingsEntry?.data);
    const sessionsArr = normalizeArray(sessionsEntry?.data);
    const meetingsMap = Object.create(null);
    for (const m of meetingsArr) {
      if (m?.meeting_key)
        meetingsMap[String(m.meeting_key)] =
          m.meeting_name || m.name || m.title || null;
    }
    const sessionsMap = Object.create(null);
    for (const s of sessionsArr) {
      if (!s?.session_key) continue;
      const circuit =
        s.circuit_short_name || s.circuit?.short_name || s.circuit_name || "";
      const name = s.session_name || s.name || "";
      sessionsMap[String(s.session_key)] =
        `${circuit}${circuit && name ? " - " : ""}${name}`;
    }
    const driversEntry = cache.get("drivers");
    const driversArr = normalizeArray(driversEntry?.data);
    const driversMap = Object.create(null);
    for (const d of driversArr) {
      if (!d?.driver_number) continue;
      driversMap[String(d.driver_number)] = {
        name: d.full_name || d.broadcast_name || d.fullName || d.name || null,
        headshot_url: d.headshot_url || d.headshotUrl || null,
      };
    }

    res.json({
      source: fromCache ? "cache" : "origin",
      data: grouped,
      maps: {
        meetings: meetingsMap,
        sessions: sessionsMap,
        drivers: driversMap,
      },
    });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch session_result", details: err.message });
  }
});

app.get("/starting_grid", async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const path = qs ? `starting_grid?${qs}` : "starting_grid";
    const url = `${BASE_URL}${path}`;
    const key = path;

    const { data, fromCache } = await getCachedWithTTL(key, url, TTL_1H);
    let arr = normalizeArray(data);
    const grouped = groupByMeetingThenSession(arr);
    // remove meeting_key/session_key from inner items now that they've been grouped
    for (const mk of Object.keys(grouped)) {
      for (const sk of Object.keys(grouped[mk])) {
        grouped[mk][sk] = grouped[mk][sk].map((it) => {
          const copy = { ...it };
          delete copy.meeting_key;
          delete copy.session_key;
          return copy;
        });
      }
    }

    ensureRefreshInterval(key, url, TTL_1H);
    setCachingHeaders(res, TTL_1H);
    const meetingsEntry = cache.get("meetings");
    const sessionsEntry = cache.get("sessions");
    const meetingsArr = normalizeArray(meetingsEntry?.data);
    const sessionsArr = normalizeArray(sessionsEntry?.data);
    const meetingsMap = Object.create(null);
    for (const m of meetingsArr) {
      if (m?.meeting_key)
        meetingsMap[String(m.meeting_key)] =
          m.meeting_name || m.name || m.title || null;
    }
    const sessionsMap = Object.create(null);
    for (const s of sessionsArr) {
      if (!s?.session_key) continue;
      const circuit =
        s.circuit_short_name || s.circuit?.short_name || s.circuit_name || "";
      const name = s.session_name || s.name || "";
      sessionsMap[String(s.session_key)] =
        `${circuit}${circuit && name ? " - " : ""}${name}`;
    }
    const driversEntry = cache.get("drivers");
    const driversArr = normalizeArray(driversEntry?.data);
    const driversMap = Object.create(null);
    for (const d of driversArr) {
      if (!d?.driver_number) continue;
      driversMap[String(d.driver_number)] = {
        name: d.full_name || d.broadcast_name || d.fullName || d.name || null,
        headshot_url: d.headshot_url || d.headshotUrl || null,
      };
    }

    res.json({
      source: fromCache ? "cache" : "origin",
      data: grouped,
      maps: {
        meetings: meetingsMap,
        sessions: sessionsMap,
        drivers: driversMap,
      },
    });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch starting_grid", details: err.message });
  }
});

app.get("/proxy/*", async (req, res) => {
  const path = req.params[0] || "";
  const qs = req.url.split("?")[1] || "";
  const fullPath = qs ? `${path}?${qs}` : path;
  const url = `${BASE_URL}${fullPath}`;
  const key = fullPath;
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
      .json({ error: "Failed to fetch proxy", details: err.message });
  }
});

app.get("/health", (req, res) => {
  const entries = {};
  for (const [k, v] of cache.entries())
    entries[k] = { ageMs: Date.now() - v.fetchedAt };
  res.json({ status: "ok", cachedKeys: Object.keys(entries).length, entries });
});

app.get("/", (req, res) => {
  res.json({ message: "F1 server running", baseUrl: BASE_URL });
});

async function warmUpAll() {
  try {
    // fetch meetings and sessions first
    await fetchAndCache("meetings", `${BASE_URL}meetings`);
    ensureRefreshInterval("meetings", `${BASE_URL}meetings`, TTL_6H);
    await fetchAndCache("sessions", `${BASE_URL}sessions`);
    ensureRefreshInterval("sessions", `${BASE_URL}sessions`, TTL_6H);

    // fetch drivers and championship & session data
    await fetchAndCache("drivers", `${BASE_URL}drivers`).catch(() => {});
    ensureRefreshInterval("drivers", `${BASE_URL}drivers`, TTL_MS);
    await fetchAndCache(
      "championship_drivers",
      `${BASE_URL}championship_drivers`,
    ).catch(() => {});
    ensureRefreshInterval(
      "championship_drivers",
      `${BASE_URL}championship_drivers`,
      TTL_1H,
    );
    await fetchAndCache(
      "championship_teams",
      `${BASE_URL}championship_teams`,
    ).catch(() => {});
    ensureRefreshInterval(
      "championship_teams",
      `${BASE_URL}championship_teams`,
      TTL_1H,
    );
    await fetchAndCache("session_result", `${BASE_URL}session_result`).catch(
      () => {},
    );
    ensureRefreshInterval(
      "session_result",
      `${BASE_URL}session_result`,
      TTL_1H,
    );
    await fetchAndCache("starting_grid", `${BASE_URL}starting_grid`).catch(
      () => {},
    );
    ensureRefreshInterval("starting_grid", `${BASE_URL}starting_grid`, TTL_1H);
  } catch (e) {
    console.warn("Warm-up fetch failed:", e?.message || e);
  }
}

app.listen(PORT, async () => {
  console.log(`f1-server listening on ${PORT}`);
  // warm caches used across the app
  await warmUpAll();
  console.log("Warm-up complete");
  // start background monitor to toggle aggressive refresh for live sessions
  try {
    startLiveRefreshMonitor();
  } catch (e) {}
});

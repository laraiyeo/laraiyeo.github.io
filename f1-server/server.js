const express = require("express");
const axios = require("axios");
const cors = require("cors");
const compression = require("compression");

const app = express();
app.use(cors());
app.use(compression());
const f1 = express.Router();
app.use("/f1", f1);

const nascar = express.Router();
app.use("/nascar", nascar);

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

function normalizeDateKey(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function getSessionDateKey(session) {
  return normalizeDateKey(
    session?.date_start ||
      session?.dateStart ||
      session?.date ||
      session?.date_end ||
      session?.dateEnd ||
      null,
  );
}

function parseDateMs(value) {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function pickFirstValue(source, keys) {
  if (!source || !Array.isArray(keys)) return null;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function getDriverIdentity(entry) {
  if (!entry) return null;
  const driverNumber =
    entry.driver_number ??
    entry.driverNumber ??
    entry.driver ??
    entry.number ??
    null;
  if (driverNumber == null || driverNumber === "") return null;

  const fullName =
    entry.full_name ??
    entry.fullName ??
    entry.broadcast_name ??
    entry.broadcastName ??
    entry.driver_name ??
    entry.driverName ??
    entry.name ??
    entry.displayName ??
    null;

  return {
    driver_number: String(driverNumber),
    full_name: fullName,
    name: fullName,
    broadcast_name:
      entry.broadcast_name ?? entry.broadcastName ?? fullName ?? null,
    team_name: entry.team_name ?? entry.teamName ?? entry.team ?? null,
    headshot_url:
      entry.headshot_url ?? entry.headshotUrl ?? entry.headshot ?? null,
    driver_id:
      entry.driver_id ??
      entry.driverId ??
      entry.driver_key ??
      entry.driverKey ??
      null,
  };
}

function mergeDriverMapEntry(target, source) {
  if (!source || !source.driver_number) return;
  const key = String(source.driver_number);
  const existing = target[key] || null;
  if (!existing) {
    target[key] = { ...source };
    return;
  }

  target[key] = {
    ...existing,
    ...Object.fromEntries(
      Object.entries(source).filter(
        ([, value]) => value != null && value !== "",
      ),
    ),
    name: existing.name || source.name || source.full_name || null,
    full_name: existing.full_name || source.full_name || source.name || null,
    broadcast_name:
      existing.broadcast_name || source.broadcast_name || source.name || null,
    team_name: existing.team_name || source.team_name || null,
    headshot_url: existing.headshot_url || source.headshot_url || null,
  };
}

function buildDriverMapFromSources(baseDrivers, ...sources) {
  const driversMap = Object.create(null);

  for (const driver of Array.isArray(baseDrivers) ? baseDrivers : []) {
    const identity = getDriverIdentity(driver);
    if (identity) mergeDriverMapEntry(driversMap, identity);
  }

  for (const source of sources) {
    for (const entry of Array.isArray(source) ? source : []) {
      const identity = getDriverIdentity(entry);
      if (identity) mergeDriverMapEntry(driversMap, identity);
    }
  }

  return driversMap;
}

function normalizeCurrentResultsFeed(feed) {
  const runDataSource = Array.isArray(feed?.runData)
    ? feed.runData
    : Array.isArray(feed?.RunData)
      ? feed.RunData
      : [];
  const resultsSource = Array.isArray(feed?.results)
    ? feed.results
    : Array.isArray(feed?.Results)
      ? feed.Results
      : [];

  return {
    runData: runDataSource.map((run) => ({
      runType: pickFirstValue(run, ["runType", "RunType", "iRunType"]),
      runName: pickFirstValue(run, ["runName", "RunName"]),
      lapsInRace: pickFirstValue(run, ["lapsInRace", "LapsInRace"]),
      lapsToGo: pickFirstValue(run, ["lapsToGo", "LapsToGo"]),
      stage1End: pickFirstValue(run, ["stage1End", "Stage1End"]),
      stage2End: pickFirstValue(run, ["stage2End", "Stage2End"]),
      stage3End: pickFirstValue(run, ["stage3End", "Stage3End"]),
      stage1Laps: pickFirstValue(run, ["stage1Laps", "Stage1Laps"]),
      stage2Laps: pickFirstValue(run, ["stage2Laps", "Stage2Laps"]),
      stage3Laps: pickFirstValue(run, ["stage3Laps", "Stage3Laps"]),
      stage4Laps: pickFirstValue(run, ["stage4Laps", "Stage4Laps"]),
    })),
    results: resultsSource.map((result) => ({
      number: pickFirstValue(result, ["number", "Number"]),
      manufacturer: pickFirstValue(result, ["manufacturer", "Manufacturer"]),
      DriverNameTag: pickFirstValue(result, ["DriverNameTag"]),
      NASCARDriverID: pickFirstValue(result, ["NASCARDriverID"]),
      S1Fin: pickFirstValue(result, ["S1Fin"]),
      S2Fin: pickFirstValue(result, ["S2Fin"]),
      S3Fin: pickFirstValue(result, ["S3Fin"]),
      TeamOwner: pickFirstValue(result, ["TeamOwner"]),
    })),
  };
}

function getWinnerInfo(sessionKey, resultsArr, driversArr) {
  const sr = resultsArr.find(
    (r) =>
      String(r.session_key) === String(sessionKey) &&
      (String(r.position) === "1" || r.position === 1),
  );
  if (!sr) return { winner: null, winner_team: null };

  const driverNum = sr.driver_number || sr.driverNumber || sr.driver;
  const driverObj = driversArr.find(
    (d) => String(d.driver_number) === String(driverNum),
  );

  return {
    winner: driverObj
      ? driverObj.full_name || driverObj.broadcast_name || driverObj.name
      : sr.driver_name || sr.name || null,
    winner_team: driverObj
      ? driverObj.team_name || driverObj.teamName || null
      : sr.team_name || sr.team || null,
  };
}

function enrichSessionForDateView(session, meeting, resultsArr, driversArr) {
  const sessionKey = session?.session_key || session?.sessionKey || null;
  const winnerInfo = sessionKey
    ? getWinnerInfo(sessionKey, resultsArr, driversArr)
    : { winner: null, winner_team: null };

  return {
    ...session,
    session_date: getSessionDateKey(session),
    date_start: session?.date_start || session?.dateStart || null,
    date_end: session?.date_end || session?.dateEnd || null,
    meeting: meeting || null,
    winner: winnerInfo.winner,
    winner_team: winnerInfo.winner_team,
  };
}

function buildPositionIntervals({
  sessionObj,
  sessionKey,
  positionsArr,
  raceControlArr,
  startingGridArr,
}) {
  const positionsMap = Object.create(null);
  const normalizeLapNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const raceControlDates = (Array.isArray(raceControlArr) ? raceControlArr : [])
    .map((it) => ({
      date: it?.date || null,
      ms: parseDateMs(it?.date),
      lap_number: it?.lap_number ?? it?.lapNumber ?? it?.lap ?? null,
    }))
    .filter((it) => it.ms !== null && it.lap_number != null)
    .sort((a, b) => a.ms - b.ms);
  const hasRaceControl = raceControlDates.length > 0;

  const firstLap =
    raceControlDates.length > 0 ? Number(raceControlDates[0].lap_number) : null;
  const lastLap =
    raceControlDates.length > 0
      ? Number(raceControlDates[raceControlDates.length - 1].lap_number)
      : null;
  const findRaceControlLap = (ms) => {
    if (ms == null || raceControlDates.length === 0) return null;
    let best = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const candidate of raceControlDates) {
      const diff = Math.abs(candidate.ms - ms);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = candidate;
      }
    }
    return best ? normalizeLapNumber(best.lap_number) : null;
  };

  const startingGridMap = Object.create(null);
  for (const row of Array.isArray(startingGridArr) ? startingGridArr : []) {
    const driverNumber = String(
      row?.driver_number || row?.driverNumber || row?.driver || "",
    );
    if (!driverNumber) continue;
    const gridPosition =
      row?.position_start ?? row?.positionStart ?? row?.position ?? null;
    const gridDate = parseDateMs(
      row?.date_start || row?.dateStart || row?.date || null,
    );
    startingGridMap[driverNumber] = {
      position: gridPosition,
      date: gridDate,
    };
  }

  const grouped = Object.create(null);
  for (const row of Array.isArray(positionsArr) ? positionsArr : []) {
    const rowSessionKey = row?.session_key || row?.sessionKey || null;
    if (String(rowSessionKey) !== String(sessionKey)) continue;
    const driverNumber = String(
      row?.driver_number || row?.driverNumber || row?.driver || "",
    );
    if (!driverNumber) continue;
    if (!grouped[driverNumber]) grouped[driverNumber] = [];
    grouped[driverNumber].push(row);
  }

  if (
    Object.keys(grouped).length === 0 &&
    Array.isArray(positionsArr) &&
    positionsArr.length > 0
  ) {
    for (const row of positionsArr) {
      const driverNumber = String(
        row?.driver_number || row?.driverNumber || row?.driver || "",
      );
      if (!driverNumber) continue;
      if (!grouped[driverNumber]) grouped[driverNumber] = [];
      grouped[driverNumber].push(row);
    }
  }

  for (const driverNumber of Object.keys(grouped)) {
    const snapshotsByLap = Object.create(null);
    const driverRows = grouped[driverNumber].slice().sort((a, b) => {
      const da = parseDateMs(a?.date || a?.timestamp || a?.t || null) || 0;
      const db = parseDateMs(b?.date || b?.timestamp || b?.t || null) || 0;
      return da - db;
    });

    driverRows.forEach((row, index) => {
      const snapshotMs = parseDateMs(
        row?.date || row?.timestamp || row?.t || null,
      );
      const explicitLap = normalizeLapNumber(
        row?.lap_number ?? row?.lapNumber ?? row?.lap ?? null,
      );
      const snapshotLap =
        explicitLap ??
        (hasRaceControl ? findRaceControlLap(snapshotMs) : null) ??
        (hasRaceControl ? null : index + 1);
      const position =
        row?.position ?? row?.position_current ?? row?.pos ?? null;
      if (snapshotLap == null || position == null) return;
      snapshotsByLap[String(snapshotLap)] = {
        lap: snapshotLap,
        position,
        date: snapshotMs,
      };
    });

    const snapshots = Object.values(snapshotsByLap)
      .map((row) => ({
        lap: row.lap,
        position: row.position,
        date: row.date,
      }))
      .sort((a, b) => a.lap - b.lap || a.date - b.date);

    const grid = startingGridMap[driverNumber] || null;
    const hasGrid = grid && grid.position != null;

    if (snapshots.length === 0) {
      if (!hasGrid) continue;
      positionsMap[driverNumber] = {
        position: grid.position,
        record: [
          {
            position: grid.position,
            start: firstLap,
            end: lastLap,
          },
        ],
      };
      continue;
    }

    const timeline = [];
    let currentPosition = hasGrid ? grid.position : snapshots[0].position;
    let currentStart = firstLap != null ? firstLap : snapshots[0].lap;

    for (const snapshot of snapshots) {
      if (snapshot.position == null) continue;
      if (currentPosition == null) {
        currentPosition = snapshot.position;
        currentStart = firstLap != null ? firstLap : snapshot.lap;
        continue;
      }

      if (String(snapshot.position) === String(currentPosition)) {
        continue;
      }

      if (snapshot.lap === currentStart && hasGrid) {
        currentPosition = snapshot.position;
        continue;
      }

      timeline.push({
        position: currentPosition,
        start: currentStart,
        end: Math.max((snapshot.lap || currentStart) - 1, currentStart),
      });
      currentPosition = snapshot.position;
      currentStart = snapshot.lap;
    }

    if (currentPosition != null) {
      timeline.push({
        position: currentPosition,
        start: currentStart,
        end: lastLap != null ? lastLap : currentStart,
      });
    }

    positionsMap[driverNumber] = {
      position: timeline[timeline.length - 1]?.position ?? null,
      record: timeline,
    };
  }

  for (const driverNumber of Object.keys(startingGridMap)) {
    if (positionsMap[driverNumber]) continue;
    const grid = startingGridMap[driverNumber];
    if (!grid || grid.position == null) continue;
    positionsMap[driverNumber] = {
      position: grid.position,
      record: [
        {
          position: grid.position,
          start: firstLap,
          end: lastLap,
        },
      ],
    };
  }

  return positionsMap;
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

// fetch until upstream returns a non-empty session_result payload or until a timeout
async function fetchAndCacheWithRetry(key, url, opts = {}) {
  const { maxWaitMs = 30000, intervalMs = 2000 } = opts;
  const start = Date.now();

  while (true) {
    try {
      const r = await axios.get(url, { timeout: 10000 });
      const payload = r.data;

      // Consider payload non-empty if it's an array with length > 0,
      // or if it's an object with a non-empty `data` array, or if it has keys
      const isArray = Array.isArray(payload) && payload.length > 0;
      const hasDataArray =
        payload && Array.isArray(payload.data) && payload.data.length > 0;
      const hasAnyKeys =
        payload &&
        typeof payload === "object" &&
        Object.keys(payload).length > 0;

      if (isArray || hasDataArray || hasAnyKeys) {
        cache.set(key, { data: payload, fetchedAt: Date.now() });
        console.log(`Fetched and cached ${key} (with data)`);
        return { data: payload, fromCache: false };
      }

      // empty payload — decide whether to retry or return
      if (Date.now() - start >= maxWaitMs) {
        cache.set(key, { data: payload, fetchedAt: Date.now() });
        console.log(`Fetched and cached ${key} (empty, timeout reached)`);
        return { data: payload, fromCache: false };
      }
    } catch (err) {
      console.warn(`Transient fetch error for ${url}: ${err.message}`);
      if (Date.now() - start >= maxWaitMs) throw err;
    }

    await new Promise((res) => setTimeout(res, intervalMs));
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
  // For session_result we prefer to retry the upstream until non-empty (short wait),
  // For `session_result` we previously retried up to 30s to wait for upstream
  // data. That causes long delays for session-scoped queries (e.g. querying a
  // future session by session_key) where upstream will happily return an empty
  // payload. Avoid the retry loop for session-scoped requests (those that
  // include a session_key) and fall back to a single fetch instead. Keep the
  // retry behavior for global `session_result` polling.
  if (
    String(key).toLowerCase().startsWith("session_result") ||
    key === "session_result"
  ) {
    const lowerKey = String(key).toLowerCase();
    const lowerUrl = String(url || "").toLowerCase();
    const isSessionScoped =
      lowerKey.includes("session_key") || lowerUrl.includes("session_key=");
    if (isSessionScoped) {
      try {
        return await fetchAndCache(key, url);
      } catch (e) {
        return { data: null, fromCache: false };
      }
    }

    try {
      // try for up to 30s, polling every 2s for global session_result
      const res = await fetchAndCacheWithRetry(key, url, {
        maxWaitMs: 30000,
        intervalMs: 2000,
      });
      return res;
    } catch (e) {
      // fall back to single fetch attempt if retries fail
      console.warn(
        `[getCachedWithTTL] retry fetch failed for ${key}: ${e.message}`,
      );
      const res = await fetchAndCache(key, url).catch((err) => ({
        data: null,
        fromCache: false,
      }));
      return res;
    }
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

function normalizeNascarTracks(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function normalizeNascarDrivers(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.response)) return payload.response;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.drivers)) return payload.drivers;
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

// NASCAR data filtering helpers
function filterNascarDriver(driver) {
  if (!driver) return null;
  return {
    Nascar_Driver_ID: driver.Nascar_Driver_ID ?? null,
    Driver_ID: driver.Driver_ID ?? null,
    Driver_Series: driver.Driver_Series ?? null,
    First_Name: driver.First_Name ?? null,
    Last_Name: driver.Last_Name ?? null,
    Full_Name: driver.Full_Name ?? null,
    DOB: driver.DOB ?? null,
    Hometown_City: driver.Hometown_City ?? null,
    Crew_Chief: driver.Crew_Chief ?? null,
    Hometown_State: driver.Hometown_State ?? null,
    Hometown_Country: driver.Hometown_Country ?? null,
    Rookie_Year_Series_1: driver.Rookie_Year_Series_1 ?? null,
    Badge: driver.Badge ?? null,
    Badge_Image: driver.Badge_Image ?? null,
    Manufacturer: driver.Manufacturer ?? null,
    Team: driver.Team ?? null,
    Image:
      driver.Firesuit_Image_Small && driver.Firesuit_Image_Small !== ""
        ? driver.Firesuit_Image_Small
        : (driver.Image ?? null),
  };
}

function filterNascarTrack(track) {
  if (!track) return null;
  return {
    track_id: track.track_id ?? null,
    track_name: track.track_name ?? null,
    track_surface: track.track_surface ?? null,
    track_type: track.track_type ?? null,
    track_banking: track.track_banking ?? null,
    year_built: track.year_built ?? null,
    track_description: track.track_description ?? null,
    city: track.city ?? null,
    state: track.state ?? null,
    length: track.length ?? null,
    caution_car_speed: track.caution_car_speed ?? null,
    track_image: track.track_image ?? null,
    track_logo: track.track_logo ?? null,
    capacity: track.capacity ?? null,
  };
}

function buildNascarDriversMap(driversArr) {
  const map = Object.create(null);
  for (const driver of Array.isArray(driversArr) ? driversArr : []) {
    if (!driver) continue;
    const badge = String(driver.Badge ?? driver.badge ?? "").trim();
    const nascarDriverId = String(
      driver.Nascar_Driver_ID ?? driver.nascar_driver_id ?? "",
    ).trim();
    const driverId = String(driver.Driver_ID ?? driver.driver_id ?? "").trim();
    const key = badge || nascarDriverId || driverId;
    if (!key) continue;

    const entry = {
      badge: badge || null,
      nascar_driver_id: driver.Nascar_Driver_ID ?? null,
      driver_id: driver.Driver_ID ?? null,
      name: driver.Full_Name ?? driver.full_name ?? null,
      manufacturer: driver.Manufacturer ?? null,
      image: driver.Image ?? driver.Badge_Image ?? null,
      team: driver.Team ?? null,
    };

    // Prefer Nascar_Driver_ID as the canonical map key. Fall back to Driver_ID,
    // then Badge if Nascar_Driver_ID is not available.
    if (nascarDriverId) {
      map[nascarDriverId] = entry;
    } else if (driverId) {
      map[driverId] = entry;
    } else if (badge) {
      map[badge] = entry;
    }
  }
  return map;
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

// Start a watcher that polls session_result for a specific session_key until
// the returned payload changes (compared to `prevSnapshot`) or until `maxWaitMs`.
// This avoids stopping fetches immediately after a live window and ensures
// the server will keep requesting upstream until new session_result data appears.
function watchSessionResultUntilChanged(sessionKey, prevSnapshot, opts = {}) {
  try {
    const key = `watch_session_result:${sessionKey}`;
    if (refreshIntervals.has(key)) return; // already watching

    const intervalMs = opts.intervalMs || 30 * 1000; // default 30s
    const maxWaitMs = opts.maxWaitMs || 30 * 60 * 1000; // default 30 minutes
    const start = Date.now();
    const path = `session_result?session_key=${encodeURIComponent(sessionKey)}`;
    const url = `${BASE_URL}${path}`;

    const id = setInterval(async () => {
      try {
        const r = await axios.get(url, { timeout: 10000 });
        const payload = r.data || null;

        // Normalize to comparable form: JSON stringify of array or object
        const newSnap = payload === null ? null : JSON.stringify(payload);
        const prevSnap =
          prevSnapshot === null ? null : JSON.stringify(prevSnapshot);

        if (newSnap && newSnap !== prevSnap) {
          // Found updated session_result. Rebuild cached assembled session so
          // other endpoints pick up the new data.
          console.log(
            `watchSessionResultUntilChanged: detected update for ${sessionKey}`,
          );
          try {
            await buildAndCacheSession(String(sessionKey), {
              forceLive: false,
            }).catch(() => {});
          } catch (e) {}
          // stop watching
          clearInterval(id);
          refreshIntervals.delete(key);
          return;
        }

        // stop if waited too long
        if (Date.now() - start >= maxWaitMs) {
          console.log(
            `watchSessionResultUntilChanged: timeout for ${sessionKey}`,
          );
          clearInterval(id);
          refreshIntervals.delete(key);
          return;
        }
      } catch (e) {
        console.warn(
          `watchSessionResultUntilChanged: fetch error for ${sessionKey}: ${e.message}`,
        );
        if (Date.now() - start >= maxWaitMs) {
          clearInterval(id);
          refreshIntervals.delete(key);
          return;
        }
      }
    }, intervalMs);

    refreshIntervals.set(key, id);
  } catch (e) {
    // ignore
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

f1.get("/drivers", async (req, res) => {
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
f1.get("/meetings", async (req, res) => {
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
f1.get("/meeting/:meeting_key", async (req, res) => {
  try {
    const lookupKey = req.params.meeting_key;
    if (!lookupKey)
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

    let meeting = meetingsArr.find(
      (m) => String(m.meeting_key) === String(lookupKey),
    );
    let resolvedMeetingKey = meeting?.meeting_key || null;

    if (!meeting) {
      const sessionMatch = sessionsArr.find(
        (s) => String(s.session_key) === String(lookupKey),
      );
      if (sessionMatch && sessionMatch.meeting_key != null) {
        resolvedMeetingKey = sessionMatch.meeting_key;
        meeting = meetingsArr.find(
          (m) => String(m.meeting_key) === String(resolvedMeetingKey),
        );
      }
    }

    if (!meeting) return res.status(404).json({ error: "meeting not found" });
    if (resolvedMeetingKey == null) resolvedMeetingKey = meeting.meeting_key;

    const sessionsForMeeting = sessionsArr.filter(
      (s) =>
        String(s.meeting_key || s.meetingKey) === String(resolvedMeetingKey),
    );

    const enriched = sessionsForMeeting.map((session) => {
      const { winner, winner_team } = getWinnerInfo(
        session.session_key,
        resultsArr,
        driversArr,
      );
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

app.get("/racing/date/:date?", async (req, res) => {
  try {
    const inputDate = req.params.date || null;
    const normalizedDate = inputDate ? normalizeDateKey(inputDate) : null;
    if (inputDate && !normalizedDate) {
      return res.status(400).json({
        error: "date must be YYYYMMDD or YYYY-MM-DD",
      });
    }

    const currentYear = new Date().getFullYear();
    await refreshSessionResultCacheIfLive();

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

    // Also fetch NASCAR data
    await getCachedWithTTL(
      "nascar_races",
      `https://cf.nascar.com/cacher/${new Date().getFullYear()}/race_list_basic.json`,
      TTL_6H,
    ).catch(() => {});

    const meetingsArr = normalizeArray(cache.get("meetings")?.data);
    const sessionsArr = normalizeArray(cache.get("sessions")?.data);
    const resultsArr = normalizeArray(cache.get("session_result")?.data);
    const driversArr = normalizeArray(cache.get("drivers")?.data);

    const meetingsByKey = Object.create(null);
    for (const meeting of meetingsArr) {
      if (meeting?.meeting_key == null) continue;
      meetingsByKey[String(meeting.meeting_key)] = meeting;
    }

    const enriched = sessionsArr
      .filter((session) => {
        const sessionDate = getSessionDateKey(session);
        return !normalizedDate || sessionDate === normalizedDate;
      })
      .map((session) => {
        const meetingKey = session?.meeting_key || session?.meetingKey || null;
        const meeting = meetingKey
          ? meetingsByKey[String(meetingKey)] || null
          : null;
        return enrichSessionForDateView(
          session,
          meeting,
          resultsArr,
          driversArr,
        );
      })
      .sort((a, b) => {
        const aMs = parseDateMs(a.date_start || a.dateStart || a.session_date);
        const bMs = parseDateMs(b.date_start || b.dateStart || b.session_date);
        return (aMs || 0) - (bMs || 0);
      });

    // Build NASCAR schedule data with enrichment
    const nascarRacesData = cache.get("nascar_races")?.data;
    const tracksData = cache.get("nascar_tracks")?.data;
    const tracksArr = normalizeNascarTracks(tracksData);
    const tracksMap = Object.create(null);
    for (const track of tracksArr) {
      if (track?.track_id != null) {
        tracksMap[String(track.track_id)] = track;
      }
    }

    let nascarRacesArr = [];
    if (
      normalizedDate &&
      nascarRacesData &&
      nascarRacesData.series_1 &&
      Array.isArray(nascarRacesData.series_1)
    ) {
      // When date is specified, enrich NASCAR schedule data with weekend-feed
      for (const race of nascarRacesData.series_1) {
        const raceId = race?.race_id || null;
        if (!raceId) continue;

        // Check schedule items for matching date
        if (Array.isArray(race.schedule)) {
          for (const scheduleItem of race.schedule) {
            if (scheduleItem.run_type === 0) continue; // skip run_type 0
            const scheduleDate = scheduleItem.start_time_utc
              ? normalizeDateKey(scheduleItem.start_time_utc)
              : null;
            if (scheduleDate !== normalizedDate) continue;

            // Found matching schedule item - fetch weekend-feed for enrichment
            const weekendFeedKey = `nascar_weekend_feed:${currentYear}:${raceId}`;
            let weekendFeed = null;
            try {
              const r = await getCachedWithTTL(
                weekendFeedKey,
                `https://cf.nascar.com/cacher/${currentYear}/1/${encodeURIComponent(raceId)}/weekend-feed.json`,
                TTL_1H,
              ).catch(() => ({ data: null }));
              weekendFeed = r.data || null;
              ensureRefreshInterval(
                weekendFeedKey,
                `https://cf.nascar.com/cacher/${currentYear}/1/${encodeURIComponent(raceId)}/weekend-feed.json`,
                TTL_1H,
              );
            } catch (e) {
              weekendFeed = null;
            }

            // Extract winner based on run_type
            let winner = null;
            let winnerTeam = null;
            let winnerManufacturer = null;
            if (weekendFeed) {
              let resultsArray = null;
              if (scheduleItem.run_type === 3) {
                // Race - look in weekend_race[0].results
                if (
                  Array.isArray(weekendFeed.weekend_race) &&
                  weekendFeed.weekend_race[0] &&
                  Array.isArray(weekendFeed.weekend_race[0].results)
                ) {
                  resultsArray = weekendFeed.weekend_race[0].results;
                } else if (
                  weekendFeed.weekend_race &&
                  typeof weekendFeed.weekend_race === "object" &&
                  Array.isArray(weekendFeed.weekend_race.results)
                ) {
                  resultsArray = weekendFeed.weekend_race.results;
                }
              } else {
                // Other run_type - look up the run object by run_type in the weekend_runs array/object
                const runTypeKey = String(scheduleItem.run_type);
                let runObj = null;
                if (Array.isArray(weekendFeed.weekend_runs)) {
                  runObj = weekendFeed.weekend_runs.find(
                    (run) => String(run?.run_type) === runTypeKey,
                  );
                } else if (
                  weekendFeed.weekend_runs &&
                  typeof weekendFeed.weekend_runs === "object"
                ) {
                  runObj =
                    weekendFeed.weekend_runs[runTypeKey] ||
                    weekendFeed.weekend_runs[scheduleItem.run_type] ||
                    null;
                }

                if (runObj && Array.isArray(runObj.results)) {
                  resultsArray = runObj.results;
                }
              }

              // Find finishing_position 1
              if (resultsArray) {
                const winnerResult = resultsArray.find(
                  (r) => String(r?.finishing_position) === "1",
                );
                if (winnerResult) {
                  winner =
                    winnerResult.driver_name ||
                    winnerResult.driver_fullname ||
                    winnerResult.driver_fullName ||
                    winnerResult.full_name ||
                    winnerResult.name ||
                    null;
                  winnerTeam =
                    winnerResult.team_name ||
                    winnerResult.team ||
                    winnerResult.owner_fullname ||
                    winnerResult.owner_name ||
                    null;
                  winnerManufacturer =
                    winnerResult.manufacturer ||
                    winnerResult.car_make ||
                    winnerResult.make ||
                    winnerResult.car_manufacturer ||
                    null;
                }
              }
            }

            // Get track info
            const trackId = race?.track_id || null;
            const trackInfo = trackId ? tracksMap[String(trackId)] : null;

            nascarRacesArr.push({
              source: "nascar_schedule",
              race_id: raceId,
              race_name: race.race_name || null,
              track_id: trackId,
              track_name: race.track_name || null,
              track_image: trackInfo?.track_image || null,
              track_logo: trackInfo?.track_logo || null,
              state: trackInfo?.state || null,
              event_name: scheduleItem.event_name || null,
              date_start: scheduleItem.start_time_utc || null,
              schedule: scheduleItem,
              winner,
              winner_team: winnerTeam,
              winner_manufacturer: winnerManufacturer,
            });
          }
        }
      }
    } else if (
      !normalizedDate &&
      nascarRacesData &&
      nascarRacesData.series_1 &&
      Array.isArray(nascarRacesData.series_1)
    ) {
      // When no date is specified, collect all unique schedule dates
      for (const race of nascarRacesData.series_1) {
        if (Array.isArray(race.schedule)) {
          for (const scheduleItem of race.schedule) {
            if (scheduleItem.run_type !== 0 && scheduleItem.start_time_utc) {
              nascarRacesArr.push({
                source: "nascar_schedule",
                date_start: scheduleItem.start_time_utc,
              });
            }
          }
        }
      }
    }

    if (!normalizedDate) {
      // Return unique dates only (no time, deduplicated)
      const allDates = new Set();
      for (const session of enriched) {
        const dateStart = session.date_start || null;
        if (dateStart) {
          const normalized = normalizeDateKey(dateStart);
          if (normalized) allDates.add(normalized);
        }
      }
      for (const race of nascarRacesArr) {
        const dateStart = race.date_start || null;
        if (dateStart) {
          const normalized = normalizeDateKey(dateStart);
          if (normalized) allDates.add(normalized);
        }
      }

      const uniqueDates = Array.from(allDates)
        .sort()
        .map((date) => ({
          date_start: date,
        }));

      setCachingHeaders(res, TTL_6H);
      return res.json({
        source: "cache",
        date: null,
        data: uniqueDates,
      });
    }

    // Filter NASCAR races for the requested date
    const filteredNascarRaces = nascarRacesArr.filter((race) => {
      const raceDate = race.date_start
        ? normalizeDateKey(race.date_start)
        : null;
      return raceDate === normalizedDate;
    });

    // Combine F1 and NASCAR data
    const combinedData = [...enriched, ...filteredNascarRaces];

    setCachingHeaders(res, TTL_6H);
    res.json({
      source: "cache",
      date: normalizedDate,
      data: combinedData,
    });
  } catch (e) {
    res.status(502).json({
      error: "Failed to fetch racing date data",
      details: e.message,
    });
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
f1.get("/driver/:driver_number", async (req, res) => {
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
f1.get("/team/:team_name", async (req, res) => {
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
        let path;
        if (name === "position") {
          path = `position?session_key=${encodeURIComponent(sessionKey)}`;
        } else if (name === "laps") {
          // keep laps session-scoped for efficiency
          path = `${name}?session_key=${encodeURIComponent(sessionKey)}`;
        } else {
          path = `${name}?session_key=${encodeURIComponent(sessionKey)}`;
        }
        // By default use session TTL, but override session_result to be aggressively
        // refreshed (5s) while we're within 1 hour after session end so callers
        // will see updated data as it becomes available.
        let resourceTtl = ttl;
        if (name === "session_result") {
          try {
            const endMs = new Date(
              sessionObj.date_end || sessionObj.dateEnd,
            ).getTime();
            const now = Date.now();
            const endPlus1h = endMs + 60 * 60 * 1000; // 1 hour after end
            if (now <= endPlus1h) {
              // make session_result refresh frequently (10s)
              resourceTtl = 10 * 1000;
            }
          } catch (e) {
            // fallback: leave resourceTtl as ttl
          }
        }

        const { data } = await getCachedWithTTL(
          path,
          `${BASE_URL}${path}`,
          resourceTtl,
        ).catch(() => ({ data: null }));
        resources[name] = normalizeArray(data);
      } catch (e) {
        resources[name] = [];
      }
    }

    // weather: construct an `atStart` object (closest to session start)
    // and a `now` object with the latest available weather record for this session
    let weatherAtStart = null;
    let weatherNow = null;
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
        weatherAtStart = closest;
      }
    } catch (e) {
      weatherAtStart = null;
    }

    // latest weather for session (most recent record)
    try {
      const pathNow = `weather?session_key=${encodeURIComponent(sessionKey)}`;
      const { data: nowData } = await getCachedWithTTL(
        pathNow,
        `${BASE_URL}${pathNow}`,
        ttl,
      ).catch(() => ({ data: null }));
      const arrAll = normalizeArray(nowData);
      if (arrAll.length > 0) {
        // find most recent by date
        arrAll.sort((a, b) => {
          const da = new Date(a.date || a.timestamp || 0).getTime() || 0;
          const db = new Date(b.date || b.timestamp || 0).getTime() || 0;
          return db - da;
        });
        weatherNow = arrAll[0];
      }
    } catch (e) {
      weatherNow = null;
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
    const positionsMap = buildPositionIntervals({
      sessionObj,
      sessionKey,
      positionsArr: resources.position || [],
      raceControlArr: resources.race_control || [],
      startingGridArr: starting_grid || [],
    });

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
        const displayLaps = Math.max(1, Math.floor(lapDiff));
        return `${displayLaps} ${displayLaps === 1 ? "Lap" : "Laps"}`;
      };

      const driverOrder = Object.keys(lapsByDriver).map((dn) => {
        const info = lapsByDriver[dn];
        const validLaps = Array.isArray(info?.lastLap) ? [] : [];
        return { dn, info };
      });

      const driverTimes = Object.create(null);
      let leaderDriver = null;
      let leaderTotalTime = null;
      let leaderLapNumber = null;

      const toNumberOrNull = (value) => {
        if (value == null) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const getLapProgress = (lap) => {
        if (!lap) return null;
        const lapNumber = toNumberOrNull(lap.lap_number ?? lap.lapNumber);
        if (lapNumber == null) return null;

        const sectorCount =
          lap.lap_duration != null || lap.duration != null
            ? 3
            : [
                lap.duration_sector_1,
                lap.duration_sector_2,
                lap.duration_sector_3,
              ].filter((value) => value != null).length;

        if (sectorCount >= 3) return lapNumber + 1;
        return lapNumber + sectorCount / 10;
      };

      const getLapTime = (lap) => {
        if (!lap) return null;
        const lapDuration = toNumberOrNull(lap.lap_duration ?? lap.duration);
        if (lapDuration != null) return lapDuration;
        const s1 = toNumberOrNull(lap.duration_sector_1) ?? 0;
        const s2 = toNumberOrNull(lap.duration_sector_2) ?? 0;
        const s3 = toNumberOrNull(lap.duration_sector_3) ?? 0;
        const sectorTotal = s1 + s2 + s3;
        return sectorTotal > 0 ? sectorTotal : null;
      };

      // determine session type: if not a race, we'll compute times using fastest lap
      const sessionName = (
        sessionObj?.session_type ||
        sessionObj?.sessionType ||
        sessionObj?.type ||
        ""
      )
        .toString()
        .toLowerCase();
      const isRaceSession = sessionName.includes("race");

      for (const dn of Object.keys(lapsByDriver)) {
        const info = lapsByDriver[dn];
        const driverLaps = lapsArr.filter(
          (lap) =>
            String(
              lap?.driver_number || lap?.driverNumber || lap?.driver || "",
            ) === String(dn),
        );
        if (isRaceSession) {
          let totalTime = null;
          let lapsUsed = 0;
          const nullSectors = {
            duration_sector_1: 0,
            duration_sector_2: 0,
            duration_sector_3: 0,
            total: 0,
          };

          for (const lap of driverLaps) {
            if (lap?.duration_sector_1 == null) {
              nullSectors.duration_sector_1 += 1;
              nullSectors.total += 1;
            }
            if (lap?.duration_sector_2 == null) {
              nullSectors.duration_sector_2 += 1;
              nullSectors.total += 1;
            }
            if (lap?.duration_sector_3 == null) {
              nullSectors.duration_sector_3 += 1;
              nullSectors.total += 1;
            }
          }

          const lapsWithNumbers = driverLaps
            .map((lap) => ({
              lap,
              lapNumber: Number(lap?.lap_number ?? lap?.lapNumber ?? NaN),
              lapTime: getLapTime(lap),
            }))
            .filter((entry) => Number.isFinite(entry.lapNumber))
            .sort((a, b) => {
              if (a.lapNumber !== b.lapNumber) return a.lapNumber - b.lapNumber;
              const da =
                new Date(a.lap?.date_start || a.lap?.date || 0).getTime() || 0;
              const db =
                new Date(b.lap?.date_start || b.lap?.date || 0).getTime() || 0;
              return da - db;
            });

          if (lapsWithNumbers.length > 0) {
            let previousRecordedLapNumber = null;
            let previousRecordedLapTime = null;
            for (const entry of lapsWithNumbers) {
              if (entry.lapTime == null) continue;

              if (previousRecordedLapNumber != null) {
                const missingLapCount =
                  entry.lapNumber - previousRecordedLapNumber - 1;
                if (missingLapCount > 0 && previousRecordedLapTime != null) {
                  totalTime =
                    (totalTime ?? 0) +
                    previousRecordedLapTime * missingLapCount;
                  lapsUsed += missingLapCount;
                }
              }

              totalTime = (totalTime ?? 0) + entry.lapTime;
              lapsUsed += 1;
              previousRecordedLapNumber = entry.lapNumber;
              previousRecordedLapTime = entry.lapTime;
            }
          }

          const latestDriverLap =
            lapsWithNumbers.length > 0
              ? lapsWithNumbers[lapsWithNumbers.length - 1].lap
              : info?.lastLap;
          const currentLapProgress = getLapProgress(latestDriverLap);
          const currentLapNumber =
            latestDriverLap?.lap_number ?? latestDriverLap?.lapNumber ?? null;
          const currentLapValid = Number.isFinite(Number(currentLapProgress))
            ? Number(currentLapProgress)
            : Number.isFinite(Number(currentLapNumber))
              ? Number(currentLapNumber)
              : null;
          const nullSectorTotal = Number(nullSectors?.total) || 0;
          const nullSectorRemainder = nullSectorTotal % 3;
          const nullSectorFraction =
            nullSectorRemainder === 1
              ? 0.2
              : nullSectorRemainder === 2
                ? 0.1
                : 0;

          let lapsUsedDisplay = null;
          if (Number.isFinite(Number(lapsUsed))) {
            const baseLaps = Math.floor(Number(lapsUsed));
            lapsUsedDisplay = Number(
              (baseLaps + nullSectorFraction).toFixed(1),
            );
          } else if (Number.isFinite(Number(currentLapValid))) {
            lapsUsedDisplay = Number(Number(currentLapValid).toFixed(1));
          }

          lapsByDriver[dn].driver_time = {
            time: totalTime != null ? Number(totalTime.toFixed(3)) : null,
            behind: null,
            laps_used: lapsUsedDisplay,
            null_sectors: nullSectors,
          };
          lapsByDriver[dn].null_sectors = nullSectors;
          driverTimes[dn] = {
            totalTime: totalTime != null ? Number(totalTime.toFixed(3)) : null,
            currentLap: lapsUsedDisplay,
            lapsUsed: lapsUsedDisplay,
          };
        } else {
          // Non-race session: use fastest lap duration as the driver_time
          const fastest = info?.fastest_lap?.lap_duration ?? null;
          const fastestLapNumber = info?.fastest_lap?.lap_number ?? null;
          const fastestVal = Number.isFinite(Number(fastest))
            ? Number(fastest)
            : null;
          const nullSectors = {
            duration_sector_1: 0,
            duration_sector_2: 0,
            duration_sector_3: 0,
            total: 0,
          };
          for (const lap of driverLaps) {
            if (lap?.duration_sector_1 == null) {
              nullSectors.duration_sector_1 += 1;
              nullSectors.total += 1;
            }
            if (lap?.duration_sector_2 == null) {
              nullSectors.duration_sector_2 += 1;
              nullSectors.total += 1;
            }
            if (lap?.duration_sector_3 == null) {
              nullSectors.duration_sector_3 += 1;
              nullSectors.total += 1;
            }
          }
          lapsByDriver[dn].driver_time = {
            time: fastestVal != null ? Number(fastestVal.toFixed(3)) : null,
            behind: null,
            laps_used: fastestVal != null ? 1 : 0,
            null_sectors,
          };
          driverTimes[dn] = {
            totalTime:
              fastestVal != null ? Number(fastestVal.toFixed(3)) : null,
            currentLap:
              fastestLapNumber != null ? Number(fastestLapNumber) : null,
            lapsUsed: fastestVal != null ? 1 : 0,
          };
        }
      }

      const allDriverEntries = Object.entries(driverTimes).filter(
        ([, v]) => v.totalTime != null,
      );
      if (allDriverEntries.length > 0) {
        if (isRaceSession) {
          const maxLap = allDriverEntries.reduce(
            (max, [, v]) => Math.max(max, v.currentLap || 0),
            0,
          );
          const leadCandidates = allDriverEntries.filter(
            ([, v]) => (v.currentLap || 0) === maxLap,
          );
          const leadByTime =
            leadCandidates.length > 0 ? leadCandidates : allDriverEntries;
          leadByTime.sort((a, b) => a[1].totalTime - b[1].totalTime);
          leaderDriver = leadByTime[0][0];
          leaderTotalTime = leadByTime[0][1].totalTime;
          leaderLapNumber = leadByTime[0][1].currentLap || maxLap || null;

          for (const [dn, v] of allDriverEntries) {
            const info = lapsByDriver[dn];
            if (!info || !info.driver_time) continue;
            const lapDiff = (leaderLapNumber || 0) - (v.currentLap || 0);
            if (lapDiff >= 1) {
              info.driver_time.behind = formatLapGap(lapDiff);
            } else if (leaderTotalTime != null && v.totalTime != null) {
              info.driver_time.behind = formatGap(
                Math.abs(leaderTotalTime - v.totalTime),
              );
            }
          }
        } else {
          // Non-race session: leader determined by lowest totalTime (fastest lap)
          allDriverEntries.sort((a, b) => a[1].totalTime - b[1].totalTime);
          leaderDriver = allDriverEntries[0][0];
          leaderTotalTime = allDriverEntries[0][1].totalTime;
          leaderLapNumber = null;
          for (const [dn, v] of allDriverEntries) {
            const info = lapsByDriver[dn];
            if (!info || !info.driver_time) continue;
            if (leaderTotalTime != null && v.totalTime != null) {
              info.driver_time.behind = formatGap(
                v.totalTime - leaderTotalTime,
              );
            }
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
    if (weatherAtStart && weatherAtStart.driver_number)
      driversSet.add(String(weatherAtStart.driver_number));
    if (weatherNow && weatherNow.driver_number)
      driversSet.add(String(weatherNow.driver_number));

    // build drivers map only for referenced drivers
    const driversGlobal = normalizeArray(cache.get("drivers")?.data);
    const driversMap = buildDriverMapFromSources(
      driversGlobal,
      starting_grid || [],
      resources.session_result || [],
      resources.position || [],
      resources.laps || [],
      resources.overtakes || [],
      resources.pit || [],
      resources.race_control || [],
      resources.stints || [],
    );
    for (const dn of Object.keys(driversMap)) {
      if (!driversSet.has(dn)) delete driversMap[dn];
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
      weather: {
        atStart: weatherAtStart,
        now: weatherNow,
      },
      maps: {
        meetings: meetingsMap,
        sessions: sessionsMap,
        drivers: driversMap,
        drivers_by_number: driversMap,
      },
    };

    // cache assembled
    cache.set(cacheKey, { data: assembled, fetchedAt: Date.now() });
    // If the session has finished but session_result appears incomplete (no winner),
    // start a background watcher to keep polling the upstream session_result until
    // new data appears (or until a longer timeout). This prevents the server from
    // reverting to an infrequent refresh cadence and missing upstream updates.
    try {
      const endMs = new Date(
        sessionObj.date_end || sessionObj.dateEnd,
      ).getTime();
      const hasEnded = Number.isFinite(endMs) ? Date.now() > endMs : false;
      const srArr = Array.isArray(assembled.session_result)
        ? assembled.session_result
        : normalizeArray(assembled.session_result);
      const hasWinner = Array.isArray(srArr)
        ? srArr.some((r) => String(r?.position) === "1" || r?.position === 1)
        : false;
      if (hasEnded && !hasWinner) {
        // poll every 60s for up to 30 minutes until updated
        watchSessionResultUntilChanged(String(sessionKey), srArr || null, {
          intervalMs: 60 * 1000,
          maxWaitMs: 30 * 60 * 1000,
        });
      }
    } catch (e) {
      // ignore
    }
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

f1.get("/session", async (req, res) => {
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
f1.get("/session/:session_key/:status?", async (req, res) => {
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
f1.get("/sessions", async (req, res) => {
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
f1.get("/debug/session_results/:session_key?", async (req, res) => {
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
f1.get("/championship_drivers", async (req, res) => {
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
    const driversMap = buildDriverMapFromSources(driversArr, arr);

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
f1.get("/championship_teams", async (req, res) => {
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
f1.get("/standings", async (req, res) => {
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

f1.get("/session_result", async (req, res) => {
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
    const driversMap = buildDriverMapFromSources(driversArr, arr);

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

f1.get("/starting_grid", async (req, res) => {
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

f1.get("/proxy/*", async (req, res) => {
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

f1.get("/health", (req, res) => {
  const entries = {};
  for (const [k, v] of cache.entries())
    entries[k] = { ageMs: Date.now() - v.fetchedAt };
  res.json({ status: "ok", cachedKeys: Object.keys(entries).length, entries });
});

f1.get("/", (req, res) => {
  res.json({ message: "F1 server running", baseUrl: BASE_URL });
});

// NASCAR endpoints
nascar.get("/meetings", async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const url = `https://cf.nascar.com/cacher/${currentYear}/race_list_basic.json`;
    const key = "nascar_races";

    const { data, fromCache } = await getCachedWithTTL(key, url, TTL_6H);
    let races = [];
    if (data && data.series_1 && Array.isArray(data.series_1)) {
      races = data.series_1;
    }

    ensureRefreshInterval(key, url, TTL_6H);
    setCachingHeaders(res, TTL_6H);
    res.json({ source: fromCache ? "cache" : "origin", data: races });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch NASCAR meetings", details: err.message });
  }
});

nascar.get("/drivers", async (req, res) => {
  try {
    const url = "https://cf.nascar.com/cacher/drivers.json";
    const key = "nascar_drivers";

    const { data, fromCache } = await getCachedWithTTL(key, url, TTL_6H);
    let drivers = [];
    if (Array.isArray(data)) {
      drivers = data.map(filterNascarDriver).filter((d) => d !== null);
    } else if (data && data.response && Array.isArray(data.response)) {
      drivers = data.response.map(filterNascarDriver).filter((d) => d !== null);
    }

    ensureRefreshInterval(key, url, TTL_6H);
    setCachingHeaders(res, TTL_6H);
    res.json({ source: fromCache ? "cache" : "origin", data: drivers });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch NASCAR drivers", details: err.message });
  }
});

nascar.get("/tracks", async (req, res) => {
  try {
    const url = "https://cf.nascar.com/cacher/tracks.json";
    const key = "nascar_tracks";

    const { data, fromCache } = await getCachedWithTTL(key, url, TTL_6H);
    let tracks = [];
    if (data && data.items && Array.isArray(data.items)) {
      tracks = data.items.map(filterNascarTrack).filter((t) => t !== null);
    } else if (Array.isArray(data)) {
      tracks = data.map(filterNascarTrack).filter((t) => t !== null);
    }

    ensureRefreshInterval(key, url, TTL_6H);
    setCachingHeaders(res, TTL_6H);
    res.json({ source: fromCache ? "cache" : "origin", data: tracks });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch NASCAR tracks", details: err.message });
  }
});

// NASCAR standings: drivers, owners, manufacturers
nascar.get("/standings", async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const nascarDriversUrl = "https://cf.nascar.com/cacher/drivers.json";
    const driversUrl = `https://cf.nascar.com/data/cacher/production/${currentYear}/1/racinginsights-points-feed.json`;
    const ownersUrl = `https://cf.nascar.com/cacher/${currentYear}/1/final/1-owners-points.json`;
    const manufacturersUrl = `https://cf.nascar.com/cacher/${currentYear}/1/final/1-manufacturer-points.json`;

    const driversKey = `nascar_standings_drivers:${currentYear}`;
    const ownersKey = `nascar_standings_owners:${currentYear}`;
    const manufacturersKey = `nascar_standings_manufacturers:${currentYear}`;

    const driversRes = await getCachedWithTTL(
      driversKey,
      driversUrl,
      TTL_1H,
    ).catch(() => ({ data: null, fromCache: false }));
    const ownersRes = await getCachedWithTTL(
      ownersKey,
      ownersUrl,
      TTL_1H,
    ).catch(() => ({ data: null, fromCache: false }));
    const manufacturersRes = await getCachedWithTTL(
      manufacturersKey,
      manufacturersUrl,
      TTL_1H,
    ).catch(() => ({ data: null, fromCache: false }));

    ensureRefreshInterval(driversKey, driversUrl, TTL_1H);
    ensureRefreshInterval(ownersKey, ownersUrl, TTL_1H);
    ensureRefreshInterval(manufacturersKey, manufacturersUrl, TTL_1H);
    await getCachedWithTTL("nascar_drivers", nascarDriversUrl, TTL_6H).catch(
      () => {},
    );
    ensureRefreshInterval("nascar_drivers", nascarDriversUrl, TTL_6H);

    // normalize payloads to arrays/objects as-is (upstream shapes vary)
    const driversData = driversRes?.data || null;
    const ownersData = ownersRes?.data || null;
    const manufacturersData = manufacturersRes?.data || null;
    const nascarDriversArr = normalizeNascarDrivers(
      cache.get("nascar_drivers")?.data,
    );
    const driversMap = buildNascarDriversMap(nascarDriversArr);

    // For standings, only include drivers that appear in the upstream drivers list
    const standingsDriversArr = Array.isArray(driversData?.drivers)
      ? driversData.drivers
      : Array.isArray(driversData)
        ? driversData
        : [];
    const allowedDriverIds = new Set();
    for (const d of standingsDriversArr) {
      const id =
        d?.driver_id ?? d?.Driver_ID ?? d?.driverId ?? d?.driverNumber ?? null;
      if (id != null) allowedDriverIds.add(String(id));
    }

    const filteredDriversMap = Object.create(null);
    const seen = new Set();
    for (const entry of Object.values(driversMap)) {
      if (!entry || seen.has(entry)) continue;
      seen.add(entry);
      const entryDriverId = entry.driver_id ? String(entry.driver_id) : null;
      const entryNascarId = entry.nascar_driver_id
        ? String(entry.nascar_driver_id)
        : null;
      // Only include the entry if its nascar_driver_id or driver_id appears
      // in the upstream standings. Expose it in the map keyed by
      // `nascar_driver_id` only.
      if (
        (entryNascarId && allowedDriverIds.has(entryNascarId)) ||
        (entryDriverId && allowedDriverIds.has(entryDriverId))
      ) {
        if (entryNascarId) {
          filteredDriversMap[entryNascarId] = entry;
        } else if (entryDriverId) {
          // If there's no nascar id, use driver id as the key (rare fallback)
          filteredDriversMap[entryDriverId] = entry;
        }
      }
    }

    setCachingHeaders(res, TTL_1H);
    res.json({
      source:
        driversRes.fromCache ||
        ownersRes.fromCache ||
        manufacturersRes.fromCache
          ? "cache"
          : "origin",
      data: {
        drivers: driversData,
        owners: ownersData,
        manufacturers: manufacturersData,
        maps: {
          drivers: filteredDriversMap,
        },
      },
    });
  } catch (err) {
    res.status(502).json({
      error: "Failed to fetch NASCAR standings",
      details: err.message,
    });
  }
});

// NASCAR race endpoint: /nascar/race/:race_id/:status (status: off|live)
nascar.get("/race/:race_id/:status?", async (req, res) => {
  try {
    const raceId = req.params.race_id;
    const status = (req.params.status || "off").toLowerCase();
    if (!raceId) return res.status(400).json({ error: "race_id required" });

    const currentYear = new Date().getFullYear();
    const raceListUrl = `https://cf.nascar.com/cacher/${currentYear}/race_list_basic.json`;
    const raceListKey = `nascar_races:${currentYear}`;

    await getCachedWithTTL(raceListKey, raceListUrl, TTL_6H).catch(() => {});
    const raceListData =
      cache.get(raceListKey)?.data || cache.get("nascar_races")?.data || null;
    const raceListArr = Array.isArray(raceListData?.series_1)
      ? raceListData.series_1
      : [];
    const raceObj =
      raceListArr.find((race) => String(race?.race_id) === String(raceId)) ||
      null;

    const trackId = raceObj?.track_id || null;
    const trackInfo = (() => {
      const tracksData = cache.get("nascar_tracks")?.data;
      const tracksArr = normalizeNascarTracks(tracksData);
      if (!trackId) return null;
      return (
        tracksArr.find(
          (track) => String(track?.track_id) === String(trackId),
        ) || null
      );
    })();

    const scheduleArr = Array.isArray(raceObj?.schedule)
      ? raceObj.schedule
      : [];
    const nowMs = Date.now();
    const hasLiveScheduledEvent = scheduleArr.some((item) => {
      if (Number(item?.run_type) === 0) return false;
      const startMs = parseDateMs(
        item?.start_time_utc || item?.start_time || null,
      );
      return startMs != null && Math.abs(startMs - nowMs) <= 4 * 60 * 60 * 1000;
    });
    const shouldUseLiveFeeds = status === "live";
    const liveRefreshMs = hasLiveScheduledEvent ? 10 * 1000 : TTL_1H;

    const liveUrls = {
      live_stage_points: `https://cf.nascar.com/cacher/live/current-results.json`,
      live_flag_data: `https://cf.nascar.com/live/feeds/live-flag-data.json`,
      live_pit_data: `https://cf.nascar.com/live/feeds/live-pit-data.json`,
      live_feed: `https://cf.nascar.com/live/feeds/live-feed.json`,
    };

    const staticUrls = {
      loopstats: `https://cf.nascar.com/loopstats/prod/${currentYear}/1/${encodeURIComponent(raceId)}.json`,
      weekend: `https://cf.nascar.com/cacher/${currentYear}/1/${encodeURIComponent(raceId)}/weekend-feed.json`,
      lap_notes: `https://cf.nascar.com/cacher/${currentYear}/1/${encodeURIComponent(raceId)}/lap-notes.json`,
      lap_times: `https://cf.nascar.com/cacher/${currentYear}/1/${encodeURIComponent(raceId)}/lap-times.json`,
      live_pit: `https://cf.nascar.com/cacher/live/series_1/${encodeURIComponent(raceId)}/live-pit-data.json`,
    };

    const staticCacheKeys = {
      loopstats: `nascar_race_loopstats:${currentYear}:${raceId}`,
      weekend: `nascar_race_weekend:${currentYear}:${raceId}`,
      lap_notes: `nascar_race_lap_notes:${currentYear}:${raceId}`,
      lap_times: `nascar_race_lap_times:${currentYear}:${raceId}`,
      live_pit: `nascar_race_live_pit:${currentYear}:${raceId}`,
    };

    const liveCacheKeys = {
      live_stage_points: `nascar_live_stage_points:${currentYear}:${raceId}`,
      live_flag_data: `nascar_live_flag_data:${currentYear}:${raceId}`,
      live_pit_data: `nascar_live_pit_data:${currentYear}:${raceId}`,
      live_feed: `nascar_live_feed:${currentYear}:${raceId}`,
    };

    const out = {
      race_list_basic: raceObj,
    };

    await getCachedWithTTL(
      "nascar_drivers",
      "https://cf.nascar.com/cacher/drivers.json",
      TTL_6H,
    ).catch(() => {});
    ensureRefreshInterval(
      "nascar_drivers",
      "https://cf.nascar.com/cacher/drivers.json",
      TTL_6H,
    );
    const nascarDriversArr = normalizeNascarDrivers(
      cache.get("nascar_drivers")?.data,
    );
    const driversMap = buildNascarDriversMap(nascarDriversArr);

    if (shouldUseLiveFeeds) {
      const liveSources = [
        ["live_stage_points", liveUrls.live_stage_points],
        ["live_flag_data", liveUrls.live_flag_data],
        ["live_pit_data", liveUrls.live_pit_data],
        ["live_feed", liveUrls.live_feed],
      ];

      for (const [name, url] of liveSources) {
        try {
          const cacheKey = liveCacheKeys[name];
          const result = await getCachedWithTTL(
            cacheKey,
            url,
            liveRefreshMs,
          ).catch(() => ({ data: null }));
          out[name] =
            name === "live_stage_points"
              ? normalizeCurrentResultsFeed(result.data || null)
              : result.data || null;
          ensureRefreshInterval(cacheKey, url, liveRefreshMs);
        } catch (e) {
          out[name] = null;
        }
      }

      // Keep track object available in live mode too.
      out.track = trackInfo || null;

      // Also expose the schedule window that triggered live refresh.
      out.live_window = hasLiveScheduledEvent;
      out.maps = { drivers: driversMap };

      setCachingHeaders(res, liveRefreshMs);
      return res.json({ source: "cache", race_id: raceId, status, data: out });
    }

    // offline / default mode: perform resilient fetches from the non-live feeds
    try {
      const r = await getCachedWithTTL(
        staticCacheKeys.loopstats,
        staticUrls.loopstats,
        TTL_1H,
      ).catch(() => ({ data: null }));
      out.loopstats = r.data || null;
      ensureRefreshInterval(
        staticCacheKeys.loopstats,
        staticUrls.loopstats,
        TTL_1H,
      );
    } catch (e) {
      out.loopstats = null;
    }

    try {
      const r = await getCachedWithTTL(
        staticCacheKeys.weekend,
        staticUrls.weekend,
        TTL_1H,
      ).catch(() => ({ data: null }));
      out.weekend = r.data || null;
      ensureRefreshInterval(
        staticCacheKeys.weekend,
        staticUrls.weekend,
        TTL_1H,
      );
    } catch (e) {
      out.weekend = null;
    }

    try {
      const r = await getCachedWithTTL(
        staticCacheKeys.lap_notes,
        staticUrls.lap_notes,
        TTL_1H,
      ).catch(() => ({ data: null }));
      out.lap_notes = r.data || null;
      ensureRefreshInterval(
        staticCacheKeys.lap_notes,
        staticUrls.lap_notes,
        TTL_1H,
      );
    } catch (e) {
      out.lap_notes = null;
    }

    try {
      const r = await getCachedWithTTL(
        staticCacheKeys.lap_times,
        staticUrls.lap_times,
        TTL_1H,
      ).catch(() => ({ data: null }));
      out.lap_times = r.data || null;
      ensureRefreshInterval(
        staticCacheKeys.lap_times,
        staticUrls.lap_times,
        TTL_1H,
      );
    } catch (e) {
      out.lap_times = null;
    }

    try {
      const r = await getCachedWithTTL(
        staticCacheKeys.live_pit,
        staticUrls.live_pit,
        TTL_1H,
      ).catch(() => ({ data: null }));
      let livePit = r.data || null;
      ensureRefreshInterval(
        staticCacheKeys.live_pit,
        staticUrls.live_pit,
        TTL_1H,
      );

      if (Array.isArray(livePit)) {
        const grouped = Object.create(null);
        for (const item of livePit) {
          const vn =
            item?.vehicle_number ??
            item?.vehicleNumber ??
            item?.vehicle ??
            null;
          if (vn == null) continue;
          const copy = { ...item };
          delete copy.vehicle_number;
          delete copy.vehicleNumber;
          delete copy.vehicle;
          delete copy.left_front_tire_changed;
          delete copy.left_rear_tire_changed;
          delete copy.right_front_tire_changed;
          delete copy.right_rear_tire_changed;
          const key = String(vn);
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(copy);
        }
        out.live_pit = grouped;
      } else if (livePit && typeof livePit === "object") {
        let arr = null;
        if (Array.isArray(livePit.items)) arr = livePit.items;
        else if (Array.isArray(livePit.data)) arr = livePit.data;
        if (arr) {
          const grouped = Object.create(null);
          for (const item of arr) {
            const vn =
              item?.vehicle_number ??
              item?.vehicleNumber ??
              item?.vehicle ??
              null;
            if (vn == null) continue;
            const copy = { ...item };
            delete copy.vehicle_number;
            delete copy.vehicleNumber;
            delete copy.vehicle;
            delete copy.left_front_tire_changed;
            delete copy.left_rear_tire_changed;
            delete copy.right_front_tire_changed;
            delete copy.right_rear_tire_changed;
            const key = String(vn);
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(copy);
          }
          out.live_pit = grouped;
        } else {
          out.live_pit = null;
        }
      } else {
        out.live_pit = null;
      }
    } catch (e) {
      out.live_pit = null;
    }

    out.track = trackInfo || null;
    // For race responses, restrict the drivers map to only drivers referenced
    // in the various race payload locations (loopstats, weekend results, lap_times,
    // live_stage_points, live_feed vehicles).
    const allowed = new Set();

    // loopstats -> drivers
    if (out.loopstats) {
      const lsArr = Array.isArray(out.loopstats)
        ? out.loopstats
        : [out.loopstats];
      for (const ls of lsArr) {
        if (!ls) continue;
        const drivers = Array.isArray(ls.drivers) ? ls.drivers : [];
        for (const d of drivers) {
          const id =
            d?.driver_id ??
            d?.Driver_ID ??
            d?.driverId ??
            d?.NASCARDriverID ??
            null;
          if (id != null) allowed.add(String(id));
        }
      }
    }

    // weekend -> weekend_race[].results
    if (out.weekend && Array.isArray(out.weekend.weekend_race)) {
      for (const wr of out.weekend.weekend_race) {
        if (!wr) continue;
        const results = Array.isArray(wr.results) ? wr.results : [];
        for (const r of results) {
          const id =
            r?.driver_id ??
            r?.Driver_ID ??
            r?.driverId ??
            r?.NASCARDriverID ??
            null;
          if (id != null) allowed.add(String(id));
        }
      }
    }

    // lap_times -> laps[].NASCARDriverID or similar
    if (out.lap_times && Array.isArray(out.lap_times.laps)) {
      for (const lap of out.lap_times.laps) {
        if (!lap) continue;
        const id =
          lap?.NASCARDriverID ??
          lap?.Nascar_Driver_ID ??
          lap?.nascar_driver_id ??
          lap?.driver_id ??
          null;
        if (id != null) allowed.add(String(id));
      }
    }

    // live_stage_points/current-results -> results
    if (out.live_stage_points && Array.isArray(out.live_stage_points.results)) {
      for (const r of out.live_stage_points.results) {
        const id =
          r?.driver_id ??
          r?.Driver_ID ??
          r?.driverId ??
          r?.NASCARDriverID ??
          null;
        if (id != null) allowed.add(String(id));
      }
    }

    // live_feed -> vehicles[].driver
    if (out.live_feed && Array.isArray(out.live_feed.vehicles)) {
      for (const v of out.live_feed.vehicles) {
        const drv = v?.driver ?? v?.Driver ?? v?.driverObj ?? null;
        if (!drv) continue;
        const id =
          drv?.driver_id ??
          drv?.Driver_ID ??
          drv?.driverId ??
          drv?.NASCARDriverID ??
          null;
        if (id != null) allowed.add(String(id));
      }
    }

    // Build filtered drivers map from driversMap using allowed set
    const filteredDriversMap = Object.create(null);
    const added = new Set();
    for (const entry of Object.values(driversMap)) {
      if (!entry) continue;
      const entryDriverId = entry.driver_id ? String(entry.driver_id) : null;
      const entryNascarId = entry.nascar_driver_id
        ? String(entry.nascar_driver_id)
        : null;
      // Only include drivers referenced in `allowed`. Expose by nascar id only
      if (entryNascarId && allowed.has(entryNascarId)) {
        if (added.has(entryNascarId)) continue;
        added.add(entryNascarId);
        filteredDriversMap[entryNascarId] = entry;
      } else if (entryDriverId && allowed.has(entryDriverId)) {
        // fallback: include by driver id key if no nascar id present
        if (added.has(entryDriverId)) continue;
        added.add(entryDriverId);
        filteredDriversMap[entryDriverId] = entry;
      }
    }

    out.maps = { drivers: filteredDriversMap };

    setCachingHeaders(res, TTL_1H);
    res.json({ source: "cache", race_id: raceId, status, data: out });
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to fetch race data", details: err.message });
  }
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

    // fetch NASCAR data on startup
    const currentYear = new Date().getFullYear();
    await fetchAndCache(
      "nascar_races",
      `https://cf.nascar.com/cacher/${currentYear}/race_list_basic.json`,
    ).catch(() => {});
    ensureRefreshInterval(
      "nascar_races",
      `https://cf.nascar.com/cacher/${currentYear}/race_list_basic.json`,
      TTL_6H,
    );
    await fetchAndCache(
      "nascar_drivers",
      "https://cf.nascar.com/cacher/drivers.json",
    ).catch(() => {});
    ensureRefreshInterval(
      "nascar_drivers",
      "https://cf.nascar.com/cacher/drivers.json",
      TTL_6H,
    );
    await fetchAndCache(
      "nascar_tracks",
      "https://cf.nascar.com/cacher/tracks.json",
    ).catch(() => {});
    ensureRefreshInterval(
      "nascar_tracks",
      "https://cf.nascar.com/cacher/tracks.json",
      TTL_6H,
    );
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

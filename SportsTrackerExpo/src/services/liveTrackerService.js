// liveTrackerService.js
// Simple service to fetch and cache the diary payload for the app session

const DEFAULT_DIARY_URL =
  "https://laraiyeogithubio-production.up.railway.app/public/today.json";

function buildDiaryUrl(sport = "football") {
  const base = DEFAULT_DIARY_URL.replace(/\/public\/.*$/, "");
  if (sport === "basketball" || sport === "nba") {
    return `${base}/public/basketball/today.json`;
  }
  return `${base}/public/today.json`;
}
// Store diary payloads keyed by sport to avoid overwriting when multiple
// sports are fetched during the same session (e.g. football + basketball).
const diaryDataBySport = {
  football: null,
  basketball: null,
};

// Auto-refresh settings: fetch on app load and then every 30 minutes while app is running
let autoRefreshIntervalId = null;
const AUTO_REFRESH_MS = 30 * 60 * 1000; // 30 minutes

// Internal: fetch the diary URL for a sport and update the in-memory cache
async function updateDiaryForSport(sport = "football") {
  try {
    const url = buildDiaryUrl(sport);
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      console.warn(
        `liveTrackerService: updateDiaryForSport ${sport} fetch failed`,
        res.status,
        url
      );
      return null;
    }
    const json = await res.json();
    diaryDataBySport[sport] = json;
    return json;
  } catch (err) {
    console.warn("liveTrackerService: updateDiaryForSport error", err);
    return null;
  }
}

// Start periodic auto-refresh (idempotent)
function startAutoRefresh() {
  if (autoRefreshIntervalId) return;
  // Immediately fetch both diaries and then schedule periodic refreshes
  (async () => {
    await Promise.all([
      updateDiaryForSport("football"),
      updateDiaryForSport("basketball"),
    ]);
  })();
  autoRefreshIntervalId = setInterval(() => {
    updateDiaryForSport("football");
    updateDiaryForSport("basketball");
  }, AUTO_REFRESH_MS);
  console.log(
    "liveTrackerService: started auto-refresh every",
    AUTO_REFRESH_MS,
    "ms"
  );
}

function stopAutoRefresh() {
  if (!autoRefreshIntervalId) return;
  clearInterval(autoRefreshIntervalId);
  autoRefreshIntervalId = null;
  console.log("liveTrackerService: stopped auto-refresh");
}

function normalize(str) {
  if (!str) return "";

  const customMap = {
    "paris saint germain": "psg",
    "paris saint-germain": "psg",
    "tottenham hotspur": "tottenham hotspur",
    tottenham: "tottenham hotspur",
    "manchester united": "manchester united",
    "manchester city": "manchester city",
    "real madrid": "real madrid",
    "atletico madrid": "atletico madrid",
    "bayern munich": "bayern munich",
    "borussia dortmund": "borussia dortmund",
    "stade rennais": "rennes",
    marseille: "olympique marseille",
    lafc: "los angeles fc",
    "sporting kansas city": "sporting kc",
    "chicago fire fc": "chicago fire",
    "st. louis city sc": "st louis city",
    "afc bournemouth": "bournemouth",
    bournemouth: "bournemouth",
    "west ham united": "west ham united",
    "west ham": "west ham united",
    "brighton & hove albion": "brighton",
    brighton: "brighton",
    "crystal palace": "crystal palace",
    "newcastle united": "newcastle united",
    newcastle: "newcastle united",
    "wolverhampton wanderers": "wolves",
    wolves: "wolves",
    "nottingham forest": "nottingham forest",
    fulham: "fulham",
    burnley: "burnley",
    "sheffield united": "sheffield united",
    "luton town": "luton town",
    millwall: "millwall",
    "preston north end": "preston",
    "coventry city": "coventry city",
    "swansea city": "swansea city",
    swansea: "swansea city",
    "norwich city": "norwich city",
    norwich: "norwich city",
    watford: "watford",
    sunderland: "sunderland",
    middlesbrough: "middlesbrough",
    "hull city": "hull city",
    "cardiff city": "cardiff city",
    cardiff: "cardiff city",
    "rb salzburg": "red bull salzburg",
    "stade rennais": "stade rennais fc",
    "la clippers": "los angeles clippers",
    "bayer leverkusen": "bayer 04 leverkusen",
  };

  // Normalize customMap keys using the same function
  const normalizedMap = {};
  for (const key in customMap) {
    normalizedMap[normalizeRaw(key)] = customMap[key];
  }

  const out = normalizeRaw(str);
  return normalizedMap[out] || out;

  function normalizeRaw(s) {
    return (
      String(s)
        .toLowerCase()
        // accents → ascii
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        // remove punctuation except spaces
        .replace(/[^a-z0-9 ]+/g, " ")
        // collapse spaces
        .replace(/\s+/g, " ")
        .trim()
    );
  }
}

// idempotent init: accepts a diary `url` (or default) and an optional `sport`.
// If the diary for `sport` is already loaded it will be returned without
// making a new network request. If only `url` is provided we attempt to
// infer the sport from the URL (contains '/basketball/' -> basketball).
async function initDiary(
  url = DEFAULT_DIARY_URL,
  fetchImpl = fetch,
  sport = null
) {
  try {
    // infer sport if not provided
    const inferredSport =
      sport ||
      (String(url).includes("/basketball/") ? "basketball" : "football");

    // return cached if present
    if (diaryDataBySport[inferredSport]) {
      return diaryDataBySport[inferredSport];
    }

    const res = await fetchImpl(url, { method: "GET" });
    if (!res.ok) {
      console.warn("liveTrackerService: diary fetch failed", res.status, url);
      diaryDataBySport[inferredSport] = null;
      return null;
    }
    const json = await res.json();
    diaryDataBySport[inferredSport] = json;
    return diaryDataBySport[inferredSport];
  } catch (err) {
    console.warn("liveTrackerService: initDiary error", err);
    return null;
  }
}

// Convenience: prefetch both the default football diary and the basketball diary
// (useful on app startup so both are available later without per-navigation fetches)
async function prefetchDefaultDiaries(fetchImpl = fetch) {
  try {
    const footballUrl = DEFAULT_DIARY_URL;
    const basketballUrl = buildDiaryUrl("basketball");
    await Promise.all([
      initDiary(footballUrl, fetchImpl, "football"),
      initDiary(basketballUrl, fetchImpl, "basketball"),
    ]);
  } catch (e) {
    // ignore individual errors; initDiary logs them
  }
}

function getDiary(sport = "football") {
  return diaryDataBySport[sport] || null;
}

// Try to find a match id by exact normalized home+away names.
// Returns the `id` string if found, otherwise null.
// Try to find a match id by exact normalized home+away names for the given sport.
// Returns the `id` string if found, otherwise null.
function findMatchIdByTeams(homeName, awayName, sport = "football") {
  const diary = getDiary(sport);
  if (!diary || !Array.isArray(diary.results)) return null;
  const homeNorm = normalize(homeName);
  const awayNorm = normalize(awayName);

  for (const r of diary.results) {
    const h = normalize(r.home_team_name || "");
    const a = normalize(r.away_team_name || "");
    if (h === homeNorm && a === awayNorm) return r.id;
  }

  // fallback: try loose matching (substring) in case abbreviations differ
  for (const r of diary.results) {
    const h = normalize(r.home_team_name || "");
    const a = normalize(r.away_team_name || "");
    if (h.includes(homeNorm) || homeNorm.includes(h)) {
      if (a.includes(awayNorm) || awayNorm.includes(a)) return r.id;
    }
  }

  return null;
}

// Auto-start refresh on module import so app load triggers initial fetches
startAutoRefresh();

export default {
  initDiary,
  getDiary,
  findMatchIdByTeams,
  buildDiaryUrl,
  DEFAULT_DIARY_URL,
  prefetchDefaultDiaries,
  // Controls for the auto-refresh from other modules if needed
  startAutoRefresh,
  stopAutoRefresh,
  // Expose manual refresh for a specific sport
  updateDiaryForSport,
};

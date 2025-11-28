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
let diaryData = null;

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

async function initDiary(url = DEFAULT_DIARY_URL, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, { method: "GET" });
    if (!res.ok) {
      console.warn("liveTrackerService: diary fetch failed", res.status);
      diaryData = null;
      return null;
    }
    const json = await res.json();
    diaryData = json;
    return diaryData;
  } catch (err) {
    console.warn("liveTrackerService: initDiary error", err);
    diaryData = null;
    return null;
  }
}

function getDiary() {
  return diaryData;
}

// Try to find a match id by exact normalized home+away names.
// Returns the `id` string if found, otherwise null.
function findMatchIdByTeams(homeName, awayName) {
  if (!diaryData || !Array.isArray(diaryData.results)) return null;
  const homeNorm = normalize(homeName);
  const awayNorm = normalize(awayName);

  for (const r of diaryData.results) {
    const h = normalize(r.home_team_name || "");
    const a = normalize(r.away_team_name || "");
    if (h === homeNorm && a === awayNorm) return r.id;
  }

  // fallback: try loose matching (substring) in case abbreviations differ
  for (const r of diaryData.results) {
    const h = normalize(r.home_team_name || "");
    const a = normalize(r.away_team_name || "");
    if (h.includes(homeNorm) || homeNorm.includes(h)) {
      if (a.includes(awayNorm) || awayNorm.includes(a)) return r.id;
    }
  }

  return null;
}

export default {
  initDiary,
  getDiary,
  findMatchIdByTeams,
  buildDiaryUrl,
  DEFAULT_DIARY_URL,
};

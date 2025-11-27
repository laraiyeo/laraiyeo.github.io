// liveTrackerService.js
// Simple service to fetch and cache the diary payload for the app session

const DEFAULT_DIARY_URL =
  "https://laraiyeogithubio-production.up.railway.app/public/today.json";

let diaryData = null;

function normalize(str) {
  if (!str) return "";
  try {
    return String(str)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  } catch (e) {
    return String(str).toLowerCase();
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
};

// Lightweight in-memory cache for ESPN scoreboard and standings requests
const scoreboardCache = {};
const standingsCache = {};

// Fetch scoreboard JSON for a league + dates once per runtime (keyed by league+dates)
export async function fetchScoreboardOnce(league, dates, force = false) {
  try {
    const key = `${league}::${dates}`;
    if (!force && scoreboardCache[key]) {
      return scoreboardCache[key];
    }

    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${dates}`;
    const res = await fetch(url);
    const data = await res.json();
    scoreboardCache[key] = data;
    return data;
  } catch (err) {
    console.error("fetchScoreboardOnce error", err);
    // return cached fallback if available
    const key = `${league}::${dates}`;
    return scoreboardCache[key] || null;
  }
}

// Fetch standings table for a league once per runtime
export async function fetchStandingsOnce(leagueCode, force = false) {
  try {
    if (!force && standingsCache[leagueCode]) return standingsCache[leagueCode];

    const url = `https://cdn.espn.com/core/soccer/table?xhr=1&league=${leagueCode}`;
    const res = await fetch(url);
    const data = await res.json();
    const entries =
      data?.content?.standings?.groups?.[0]?.standings?.entries || [];
    standingsCache[leagueCode] = entries;
    return entries;
  } catch (err) {
    console.error("fetchStandingsOnce error", err);
    return standingsCache[leagueCode] || [];
  }
}

// Optional helpers for tests or forced refresh
export function clearScoreboardCache() {
  Object.keys(scoreboardCache).forEach((k) => delete scoreboardCache[k]);
}
export function clearStandingsCache() {
  Object.keys(standingsCache).forEach((k) => delete standingsCache[k]);
}

export default {
  fetchScoreboardOnce,
  fetchStandingsOnce,
  clearScoreboardCache,
  clearStandingsCache,
};

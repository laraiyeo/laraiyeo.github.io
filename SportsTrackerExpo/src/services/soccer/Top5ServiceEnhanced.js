// Top 5 Leagues Scoreboard Service
// Fetches fixture data from the football proxy server (SportMonks-based data).
// Response format: { leagueId: { id, name, image_path, country, matches: [...] } }

const FOOTBALL_BASE = "https://laraiyeogithubio-production-08da.up.railway.app";

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
]);
const SCHEDULED_STATES = new Set(["NS", "TBA", "DELAYED"]);

export function getMatchStatusType(match) {
  const code = (match?.state?.state || "").toUpperCase();
  if (FINISHED_STATES.has(code)) return "finished";
  if (!code || SCHEDULED_STATES.has(code)) return "scheduled";
  return "live";
}

function formatDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function getTargetDate(filter) {
  const now = new Date();
  if (filter === "yesterday") {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d;
  }
  if (filter === "upcoming") {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }
  return now;
}

const Top5ServiceEnhanced = {
  async getScoreboard(dateStr) {
    const res = await fetch(`${FOOTBALL_BASE}/football/fixture/${dateStr}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.data || {};
  },

  // Convert raw league-keyed response into sorted display groups.
  toGroups(leagueData) {
    const getLeaguePriority = (league) => {
      const statuses = (league.matches || []).map((m) => getMatchStatusType(m));
      if (statuses.includes("live")) return 1;
      if (statuses.includes("scheduled")) return 2;
      return 3;
    };
    const getMatchPriority = (match) => {
      const s = getMatchStatusType(match);
      if (s === "live") return 1;
      if (s === "scheduled") return 2;
      return 3;
    };

    return Object.values(leagueData)
      .sort((a, b) => getLeaguePriority(a) - getLeaguePriority(b))
      .map((league) => ({
        leagueKey: String(league.id),
        label: league.name || "Unknown League",
        imagePath: league.image_path || null,
        countryName: league.country?.name || null,
        countryImage: league.country?.image_path || null,
        matches: [...(league.matches || [])].sort(
          (a, b) => getMatchPriority(a) - getMatchPriority(b),
        ),
      }));
  },
};

export default Top5ServiceEnhanced;

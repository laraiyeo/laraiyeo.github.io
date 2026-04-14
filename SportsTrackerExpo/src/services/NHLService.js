// NHL API Service for Mobile App
// Combines ESPN NHL endpoints with nhl api fallback for additional data

import { BaseCacheService } from "./BaseCacheService";

export class NHLService extends BaseCacheService {
  static BACKEND_URL =
    "https://laraiyeogithubio-production-0255.up.railway.app";
  static SCOREBOARD_API_URL = `${this.BACKEND_URL}/nhl/scoreboard`;
  static TEAM_COLOR_MAP = {
    ANA: "#F47A38",
    Ducks: "#F47A38",
    "Anaheim Ducks": "#F47A38",
    ARI: "#8C2633",
    Coyotes: "#8C2633",
    "Arizona Coyotes": "#8C2633",
    BOS: "#FFB81C",
    Bruins: "#FFB81C",
    "Boston Bruins": "#FFB81C",
    BUF: "#003087",
    Sabres: "#003087",
    "Buffalo Sabres": "#003087",
    CGY: "#C8102E",
    Flames: "#C8102E",
    "Calgary Flames": "#C8102E",
    CAR: "#CC0000",
    Hurricanes: "#CC0000",
    "Carolina Hurricanes": "#CC0000",
    CHI: "#CF0A2C",
    Blackhawks: "#CF0A2C",
    "Chicago Blackhawks": "#CF0A2C",
    COL: "#6F263D",
    Avalanche: "#6F263D",
    "Colorado Avalanche": "#6F263D",
    CBJ: "#002654",
    "Blue Jackets": "#002654",
    "Columbus Blue Jackets": "#002654",
    DAL: "#006847",
    Stars: "#006847",
    "Dallas Stars": "#006847",
    DET: "#CE1126",
    "Red Wings": "#CE1126",
    "Detroit Red Wings": "#CE1126",
    EDM: "#041E42",
    Oilers: "#041E42",
    "Edmonton Oilers": "#041E42",
    FLA: "#041E42",
    Panthers: "#041E42",
    "Florida Panthers": "#041E42",
    LAK: "#111111",
    Kings: "#111111",
    "Los Angeles Kings": "#111111",
    MIN: "#154734",
    Wild: "#154734",
    "Minnesota Wild": "#154734",
    MTL: "#AF1E2D",
    Canadiens: "#AF1E2D",
    "Montreal Canadiens": "#AF1E2D",
    NSH: "#FFB81C",
    Predators: "#FFB81C",
    "Nashville Predators": "#FFB81C",
    NJD: "#CE1126",
    Devils: "#CE1126",
    "New Jersey Devils": "#CE1126",
    NYI: "#00539B",
    Islanders: "#00539B",
    "New York Islanders": "#00539B",
    NYR: "#0038A8",
    Rangers: "#0038A8",
    "New York Rangers": "#0038A8",
    OTT: "#C52032",
    Senators: "#C52032",
    "Ottawa Senators": "#C52032",
    PHI: "#F74902",
    Flyers: "#F74902",
    "Philadelphia Flyers": "#F74902",
    PIT: "#FFB81C",
    Penguins: "#FFB81C",
    "Pittsburgh Penguins": "#FFB81C",
    SEA: "#001628",
    Kraken: "#001628",
    "Seattle Kraken": "#001628",
    SJS: "#006D75",
    Sharks: "#006D75",
    "San Jose Sharks": "#006D75",
    STL: "#002F87",
    Blues: "#002F87",
    "St. Louis Blues": "#002F87",
    TBL: "#002868",
    Lightning: "#002868",
    "Tampa Bay Lightning": "#002868",
    TOR: "#00205B",
    "Maple Leafs": "#00205B",
    "Toronto Maple Leafs": "#00205B",
    UTA: "#6CAEDF",
    "Utah Hockey Club": "#6CAEDF",
    Utah: "#6CAEDF",
    VAN: "#00205B",
    Canucks: "#00205B",
    "Vancouver Canucks": "#00205B",
    VGK: "#B4975A",
    "Golden Knights": "#B4975A",
    "Vegas Golden Knights": "#B4975A",
    WSH: "#041E42",
    Capitals: "#041E42",
    "Washington Capitals": "#041E42",
    WPG: "#041E42",
    Jets: "#041E42",
    "Winnipeg Jets": "#041E42",
  };
  static TEAMS_API_URL =
    "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams";
  static NHL_API_BASE = "https://api-web.nhle.com/v1";
  static TEAM_ABBREV_ALIASES = {
    ANA: ["ANA", "Anaheim", "Ducks", "Anaheim Ducks"],
    BOS: ["BOS", "Boston", "Bruins", "Boston Bruins"],
    BUF: ["BUF", "Buffalo", "Sabres", "Buffalo Sabres"],
    CAR: ["CAR", "Carolina", "Hurricanes", "Carolina Hurricanes"],
    CBJ: ["CBJ", "Columbus", "Blue Jackets", "Columbus Blue Jackets"],
    CGY: ["CGY", "Calgary", "Flames", "Calgary Flames"],
    CHI: ["CHI", "Chicago", "Blackhawks", "Chicago Blackhawks"],
    COL: ["COL", "Colorado", "Avalanche", "Colorado Avalanche"],
    DAL: ["DAL", "Dallas", "Stars", "Dallas Stars"],
    DET: ["DET", "Detroit", "Red Wings", "Detroit Red Wings"],
    EDM: ["EDM", "Edmonton", "Oilers", "Edmonton Oilers"],
    FLA: ["FLA", "Florida", "Panthers", "Florida Panthers"],
    LAK: ["LAK", "Los Angeles", "Kings", "Los Angeles Kings"],
    MIN: ["MIN", "Minnesota", "Wild", "Minnesota Wild"],
    MTL: ["MTL", "Montreal", "Canadiens", "Montreal Canadiens"],
    NJD: ["NJD", "New Jersey", "Devils", "New Jersey Devils"],
    NSH: ["NSH", "Nashville", "Predators", "Nashville Predators"],
    NYI: ["NYI", "New York Islanders", "Islanders"],
    NYR: ["NYR", "New York Rangers", "Rangers"],
    OTT: ["OTT", "Ottawa", "Senators", "Ottawa Senators"],
    PHI: ["PHI", "Philadelphia", "Flyers", "Philadelphia Flyers"],
    PIT: ["PIT", "Pittsburgh", "Penguins", "Pittsburgh Penguins"],
    SEA: ["SEA", "Seattle", "Kraken", "Seattle Kraken"],
    SJS: ["SJS", "San Jose", "Sharks", "San Jose Sharks"],
    STL: ["STL", "St. Louis", "Saint Louis", "Blues", "St. Louis Blues"],
    TBL: ["TBL", "Tampa Bay", "Lightning", "Tampa Bay Lightning"],
    TOR: ["TOR", "Toronto", "Maple Leafs", "Toronto Maple Leafs"],
    UTA: ["UTA", "Utah", "Mammoth", "Utah Hockey Club"],
    VAN: ["VAN", "Vancouver", "Canucks", "Vancouver Canucks"],
    VGK: ["VGK", "Vegas", "Golden Knights", "Vegas Golden Knights"],
    WPG: ["WPG", "Winnipeg", "Jets", "Winnipeg Jets"],
    WSH: ["WSH", "Washington", "Capitals", "Washington Capitals"],
  };
  static _TEAM_ALIAS_MAP = null;

  static getTeamColor(teamOrKey, fallback = "#888888") {
    if (!teamOrKey) return fallback;
    if (typeof teamOrKey === "string") {
      return this.TEAM_COLOR_MAP[teamOrKey] || fallback;
    }

    const keys = [
      teamOrKey.abbrev,
      teamOrKey.name,
      teamOrKey.teamName,
      teamOrKey.displayName,
      teamOrKey.fullName,
    ];

    for (const key of keys) {
      if (key && this.TEAM_COLOR_MAP[key]) {
        return this.TEAM_COLOR_MAP[key];
      }
    }

    return fallback;
  }

  static normalizeTeamKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  static getTeamAliasMap() {
    if (this._TEAM_ALIAS_MAP) return this._TEAM_ALIAS_MAP;
    const map = new Map();
    Object.entries(this.TEAM_ABBREV_ALIASES).forEach(([abbr, aliases]) => {
      aliases.forEach((alias) => {
        const normalized = this.normalizeTeamKey(alias);
        if (normalized) map.set(normalized, abbr);
      });
    });
    this._TEAM_ALIAS_MAP = map;
    return map;
  }

  static levenshteinDistance(a, b) {
    const s = String(a || "");
    const t = String(b || "");
    if (s === t) return 0;
    if (!s.length) return t.length;
    if (!t.length) return s.length;

    const prev = Array(t.length + 1)
      .fill(0)
      .map((_, i) => i);

    for (let i = 1; i <= s.length; i += 1) {
      let next = [i];
      for (let j = 1; j <= t.length; j += 1) {
        const cost = s[i - 1] === t[j - 1] ? 0 : 1;
        next[j] = Math.min(next[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      for (let j = 0; j <= t.length; j += 1) prev[j] = next[j];
    }

    return prev[t.length];
  }

  static resolveTeamAbbrevFuzzy(teamOrName) {
    const raw =
      typeof teamOrName === "string"
        ? teamOrName
        : teamOrName?.teamAbbrev ||
          teamOrName?.abbrev ||
          teamOrName?.name ||
          teamOrName?.teamName ||
          teamOrName?.displayName ||
          teamOrName?.fullName ||
          "";

    if (!raw) return null;

    const direct = String(raw).trim().toUpperCase();
    if (this.TEAM_ABBREV_ALIASES[direct]) return direct;

    const normalizedQuery = this.normalizeTeamKey(raw);
    if (!normalizedQuery) return null;

    const aliasMap = this.getTeamAliasMap();
    if (aliasMap.has(normalizedQuery)) return aliasMap.get(normalizedQuery);

    let bestAbbrev = null;
    let bestDistance = Infinity;
    let bestLengthDiff = Infinity;

    aliasMap.forEach((abbr, alias) => {
      if (!alias) return;

      if (alias.includes(normalizedQuery) || normalizedQuery.includes(alias)) {
        const lenDiff = Math.abs(alias.length - normalizedQuery.length);
        if (0 < bestDistance || lenDiff < bestLengthDiff) {
          bestAbbrev = abbr;
          bestDistance = 0;
          bestLengthDiff = lenDiff;
        }
        return;
      }

      const distance = this.levenshteinDistance(normalizedQuery, alias);
      const threshold = Math.max(
        2,
        Math.floor(Math.max(normalizedQuery.length, alias.length) * 0.34),
      );
      if (distance > threshold) return;

      const lenDiff = Math.abs(alias.length - normalizedQuery.length);
      if (
        distance < bestDistance ||
        (distance === bestDistance && lenDiff < bestLengthDiff)
      ) {
        bestAbbrev = abbr;
        bestDistance = distance;
        bestLengthDiff = lenDiff;
      }
    });

    return bestAbbrev;
  }

  // Smart live game detection for NHL
  static hasLiveEvents(data) {
    try {
      const events = data?.events || [];
      return events.some((event) => {
        const status = event?.status?.type?.name;
        const description = event?.status?.type?.description;

        // NHL live statuses
        return (
          status === "STATUS_IN_PROGRESS" ||
          description?.toLowerCase().includes("period") ||
          description?.toLowerCase().includes("overtime") ||
          description?.toLowerCase().includes("intermission")
        );
      });
    } catch (error) {
      console.error("NHLService: Error detecting live events", error);
      return false;
    }
  }

  static getDataType(data, context) {
    try {
      if (this.hasLiveEvents(data)) {
        return "live";
      }

      if (context?.includes("standings") || context?.includes("teams")) {
        return "static";
      }

      // Check if events are scheduled or finished
      const events = data?.events || [];
      const hasScheduled = events.some(
        (event) => event?.status?.type?.name === "STATUS_SCHEDULED",
      );
      const hasFinished = events.some(
        (event) => event?.status?.type?.completed === true,
      );

      if (hasScheduled && !hasFinished) return "scheduled";
      if (hasFinished && !hasScheduled) return "finished";

      return "scheduled"; // Default for mixed or unknown
    } catch (error) {
      console.error("NHLService: Error determining data type", error);
      return "scheduled";
    }
  }

  // Convert ESPN/HTTP urls to HTTPS
  static convertToHttps(url) {
    if (typeof url !== "string") return url;
    return url.replace(/^http:\/\//i, "https://");
  }

  // Fetch scoreboard from backend contract endpoint
  static async getScoreboard(startDate = null, endDate = null) {
    const cacheKey = `nhl_scoreboard_${startDate || "today"}_${endDate || startDate || "today"}`;
    return this.getCachedData(
      cacheKey,
      async () => {
        const date =
          startDate || new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const url = `${this.SCOREBOARD_API_URL}/${date}`;
        const headers = this.getBrowserHeaders();
        const res = await fetch(url, { headers });
        if (!res.ok) {
          throw new Error(`Failed to fetch NHL scoreboard: ${res.status}`);
        }
        const data = await res.json();
        return data;
      },
      "scoreboard",
    );
  }

  // Fetch game details using ESPN summary as primary
  static async getGameDetails(gameId) {
    const cacheKey = `nhl_game_details_${gameId}`;
    return this.getCachedData(
      cacheKey,
      async () => {
        const url = `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/summary?event=${gameId}`;
        const headers = this.getBrowserHeaders();
        const res = await fetch(this.convertToHttps(url), { headers });
        const data = await res.json();
        return data;
      },
      "game_details",
    );
  }

  // Try NHL official API as fallback to convert or enrich data
  static async fetchNhlScheduleForDate(nhlDate) {
    try {
      const url = `${this.NHL_API_BASE}/schedule/${nhlDate}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("NHL API fetch failed");
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  // Format ESPN game structure into mobile-friendly shape similar to NFLService.formatGameForMobile
  static formatGameForMobile(game) {
    try {
      const competition = game.competitions?.[0] || {};
      const home =
        (competition.competitors || []).find((c) => c.homeAway === "home") ||
        {};
      const away =
        (competition.competitors || []).find((c) => c.homeAway === "away") ||
        {};

      return {
        id: game.id,
        status: game.status?.type?.description || "",
        displayClock: game.status?.displayClock || "",
        period: game.status?.period || 0,
        isCompleted: !!game.status?.type?.completed,
        season: game.season || {},
        notes: competition.notes?.[0]?.headline || "",
        situation: competition.situation || null,
        homeTeam: {
          id: home.id,
          displayName: home.team?.displayName || "",
          abbreviation: home.team?.abbreviation || "",
          logo: this.convertToHttps(home.team?.logo),
          score: home.score,
          record: home.records?.[0]?.summary || "",
        },
        awayTeam: {
          id: away.id,
          displayName: away.team?.displayName || "",
          abbreviation: away.team?.abbreviation || "",
          logo: this.convertToHttps(away.team?.logo),
          score: away.score,
          record: away.records?.[0]?.summary || "",
        },
        venue: competition.venue?.fullName || "",
        date: new Date(game.date),
        broadcasts: competition.broadcasts?.[0]?.names || [],
      };
    } catch (e) {
      console.error("NHLService.formatGameForMobile error", e);
      return null;
    }
  }

  // Simple standings fetch via ESPN scoreboard endpoint (site api provides standings url elsewhere)
  static async getStandings() {
    const cacheKey = "nhl_standings";
    return this.getCachedData(
      cacheKey,
      async () => {
        // Prefer NHL official API which returns a flat standings array
        const headers = this.getBrowserHeaders();

        try {
          const nhlUrl = `https://corsproxy.io/?url=${this.NHL_API_BASE}/standings/now`;
          // Try direct fetch first
          try {
            const res = await fetch(nhlUrl, { headers });
            if (res.ok) {
              const data = await res.json();
              return data;
            }
          } catch (directErr) {
            // Direct fetch failed (possibly CORS) - try via a public CORS proxy
            try {
              const proxy = `https://corsproxy.io/?url=${encodeURIComponent(nhlUrl)}`;
              const pres = await fetch(proxy, { headers });
              if (pres.ok) {
                const pdata = await pres.json();
                return pdata;
              }
            } catch (proxyErr) {
              // proxy failed too - will fallback to ESPN below
              console.warn(
                "NHLService: NHL API direct and proxy fetch failed, falling back to ESPN",
                directErr,
                proxyErr,
              );
            }
          }
        } catch (e) {
          // swallow and fallback to ESPN
        }

        // ESPN fallback
        try {
          const url =
            "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/standings";
          const res2 = await fetch(url, { headers });
          const data2 = await res2.json();
          return data2;
        } catch (err) {
          throw err;
        }
      },
      "standings",
    );
  }

  static async getPlayerGameStats(gameId, playerId) {
    const cacheKey = `nhl_player_stats_${gameId}_${playerId}`;
    return this.getCachedData(
      cacheKey,
      async () => {
        const url = `https://cdn.espn.com/core/nhl/boxscore?xhr=1&gameId=${gameId}`;
        const headers = this.getBrowserHeaders();

        const response = await fetch(this.convertToHttps(url), { headers });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const gameData = await response.json();

        // Use the exact same structure as team-page.js
        const players = gameData.gamepackageJSON?.boxscore?.players || [];

        if (players.length === 0) {
          return null;
        }

        // Find the player in the game stats
        let playerStats = {};
        let foundPlayer = false;

        for (const team of players) {
          if (!team.statistics || team.statistics.length === 0) continue;

          // Search through all statistics categories for this team
          for (const statCategory of team.statistics) {
            const athletes = statCategory.athletes || [];

            // Try different ID matching approaches
            const foundPlayerInCategory = athletes.find(
              (athlete) =>
                athlete.athlete.id === playerId.toString() ||
                athlete.athlete.id === playerId,
            );

            if (foundPlayerInCategory) {
              foundPlayer = true;
              playerStats[statCategory.name] = {
                name: statCategory.name,
                displayName: statCategory.displayName || statCategory.name,
                stats: foundPlayerInCategory.stats || [],
              };
            }
          }

          if (foundPlayer) break;
        }

        if (!foundPlayer) {
          return null;
        }

        // Convert to the format expected by the mobile app
        const formattedStats = {
          splits: {
            categories: Object.values(playerStats).map((category) => ({
              name: category.name,
              displayName: category.displayName,
              stats: category.stats.map((statValue, index) => {
                // Map common stat names based on category and index for NHL
                let statName = `Stat ${index + 1}`;
                let displayName = statName;

                if (
                  category.name === "skaters" ||
                  category.name === "forwards" ||
                  category.name === "defensemen"
                ) {
                  const skaterStats = [
                    "Goals",
                    "Assists",
                    "Time on Ice",
                    "Shots",
                    "Hits",
                    "Blocked Shots",
                    "Plus/Minus",
                  ];
                  displayName = skaterStats[index] || statName;
                } else if (
                  category.name === "goalies" ||
                  category.name === "goaltending"
                ) {
                  const goalieStats = [
                    "Goals Against",
                    "Shots Against",
                    "Save Pct",
                    "Saves",
                    "Minutes",
                  ];
                  displayName = goalieStats[index] || statName;
                }

                return {
                  name: statName,
                  displayName: displayName,
                  value: statValue,
                  displayValue: statValue.toString(),
                };
              }),
            })),
          },
        };

        return formattedStats;
      },
      "player_stats",
    );
  }

  static clearCache() {
    return super.clearCache();
  }
}

export default NHLService;

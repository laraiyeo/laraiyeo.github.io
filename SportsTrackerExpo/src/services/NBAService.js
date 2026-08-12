// NBA API Service for Mobile App
// Uses ESPN NBA endpoints with AsyncStorage persistent caching

import { BaseCacheService } from "./BaseCacheService";
import { combinerUrl } from "../utils/imageUtils";

export class NBAService extends BaseCacheService {
  // League-aware URL templates — {{league}} is replaced at call time.
  static SCOREBOARD_URL_TPL =
    "https://site.api.espn.com/apis/site/v2/sports/basketball/{{league}}/scoreboard";
  static TEAMS_URL_TPL =
    "https://site.api.espn.com/apis/site/v2/sports/basketball/{{league}}/teams";
  static STANDINGS_URL_TPL =
    "https://site.web.api.espn.com/apis/v2/sports/basketball/{{league}}/standings";

  // Keep old static URLs as aliases for backwards compatibility
  static SCOREBOARD_API_URL =
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
  static TEAMS_API_URL =
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams";
  static STANDINGS_API_URL = "https://cdn.espn.com/core/nba/standings?xhr=1";

  // ---------- league helpers ----------

  /**
   * Determine the default league based on the current date.
   * June 1 – August 1 (inclusive) → "nba-summer-league"
   * Otherwise → "nba"
   */
  static getDefaultLeague() {
    const now = new Date();
    const month = now.getMonth(); // 0-indexed: 5 = June, 6 = July, 7 = August
    const day = now.getDate();

    // June (month 5) any day, or August 1 (month 7, day 1)
    if (month === 5 || month === 6 || (month === 7 && day === 1)) {
      return "nba-summer";
    }
    return "nba";
  }

  /** Replace {{league}} in a URL template. */
  static _url(tpl, league = "nba") {
    return tpl.replace("{{league}}", league);
  }

  /**
   * Fetch JSON with automatic fallback from `league` → "nba".
   * Returns { data, leagueUsed } so callers know which source succeeded.
   */
  static async fetchWithLeagueFallback(urlFn, league) {
    league = league || this.getDefaultLeague();
    // 1. Try the requested league
    try {
      const resp = await fetch(urlFn(league), {
        headers: this.getBrowserHeaders(),
      });
      if (resp.ok) {
        const data = await resp.json();
        return { data, leagueUsed: league };
      }
      // Non-OK → fall through to fallback (unless already nba)
      if (league !== "nba") {
        console.warn(
          `[NBAService] ${league} request returned ${resp.status}, falling back to nba`,
        );
      }
    } catch (err) {
      if (league !== "nba") {
        console.warn(
          `[NBAService] ${league} request failed, falling back to nba:`,
          err.message,
        );
      } else {
        throw err; // nba itself failed — propagate
      }
    }

    // 2. Fallback to "nba"
    if (league !== "nba") {
      const resp = await fetch(urlFn("nba"), {
        headers: this.getBrowserHeaders(),
      });
      const data = await resp.json();
      return { data, leagueUsed: "nba" };
    }
  }

  /**
   * Fetch with fallback AND usable-data guard.
   * If the successful response has no events, retry with the alternate league.
   */
  static async fetchScoreboardWithFallback(urlFn, league) {
    league = league || this.getDefaultLeague();
    const { data, leagueUsed } = await this.fetchWithLeagueFallback(
      urlFn,
      league,
    );

    // If we got usable events, great
    if (data && Array.isArray(data.events) && data.events.length > 0) {
      return { data, leagueUsed };
    }

    // No events — if we haven't tried the alternate yet, try it
    const alternate = leagueUsed === "nba" ? league : "nba";
    if (alternate !== leagueUsed) {
      try {
        const resp = await fetch(urlFn(alternate), {
          headers: this.getBrowserHeaders(),
        });
        if (resp.ok) {
          const altData = await resp.json();
          if (
            altData &&
            Array.isArray(altData.events) &&
            altData.events.length > 0
          ) {
            console.log(
              `[NBAService] No ${leagueUsed} events found, using ${alternate} instead`,
            );
            return { data: altData, leagueUsed: alternate };
          }
        }
      } catch (_) {
        // Swallow — return the original empty result
      }
    }

    return { data, leagueUsed };
  }

  /**
   * Deep-convert every `http://` URL string inside an object/array to `https://`.
   * Avoids infinite recursion by capping depth.
   */
  static convertLeagueLogos(obj, depth = 0) {
    if (depth > 8) return obj;
    if (typeof obj === "string") return this.convertToHttps(obj);
    if (Array.isArray(obj))
      return obj.map((v) => this.convertLeagueLogos(v, depth + 1));
    if (obj && typeof obj === "object") {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k] = this.convertLeagueLogos(v, depth + 1);
      }
      return out;
    }
    return obj;
  }

  // ---------- live detection & data typing ----------

  // Override to detect NBA live games
  static hasLiveEvents(data) {
    if (!data || !data.events) return false;
    return data.events.some(
      (game) =>
        game.status &&
        (game.status.type?.state === "in" ||
          game.status.type?.completed === false ||
          game.competitions?.[0]?.status?.type?.state === "in"),
    );
  }

  // Override to determine NBA data type
  static getDataType(data) {
    if (!data || !data.events) return "static";

    const hasLive = this.hasLiveEvents(data);
    if (hasLive) return "live";

    const hasScheduled = data.events.some(
      (game) =>
        game.status?.type?.state === "pre" ||
        game.competitions?.[0]?.status?.type?.state === "pre",
    );
    if (hasScheduled) return "scheduled";

    return "finished";
  }

  // Convert ESPN/HTTP urls to HTTPS
  static convertToHttps(url) {
    if (typeof url !== "string") return url;
    return url.replace(/^http:\/\//i, "https://");
  }

  // Fetch scoreboard from ESPN with smart caching
  // @param {string} league - auto-detected by date, or pass explicitly
  static async getScoreboard(startDate = null, endDate = null, league = null) {
    league = league || this.getDefaultLeague();
    const cacheKey = `${league}_scoreboard_${startDate || "today"}_${
      endDate || startDate || "today"
    }`;

    return this.getCachedData(
      cacheKey,
      async () => {
        const { data } = await this.fetchScoreboardWithFallback((lg) => {
          let url = this._url(this.SCOREBOARD_URL_TPL, lg);
          if (startDate) {
            if (endDate && endDate !== startDate) {
              url += `?dates=${startDate}-${endDate}`;
            } else {
              url += `?dates=${startDate}`;
            }
          }
          return url;
        }, league);
        return data;
      },
      false,
      "scheduled",
    );
  }

  // Fetch game details using ESPN summary
  // @param {string} league - auto-detected by date, or pass explicitly
  static async getGameDetails(gameId, league = null) {
    league = league || this.getDefaultLeague();
    const cacheKey = `${league}_gameDetails_${gameId}`;
    return this.getCachedData(
      cacheKey,
      async () => {
        const { data } = await this.fetchWithLeagueFallback(
          (lg) =>
            `https://site.api.espn.com/apis/site/v2/sports/basketball/${lg}/summary?event=${gameId}`,
          league,
        );
        return data;
      },
      false,
      "live",
    ); // Game details are often live data
  }

  // Fetch standings
  // @param {string} league - auto-detected by date, or pass explicitly
  static async getStandings(league = null) {
    league = league || this.getDefaultLeague();
    const cacheKey = `${league}_standings`;
    return this.getCachedData(
      cacheKey,
      async () => {
        const { data } = await this.fetchWithLeagueFallback(
          (lg) => this._url(this.STANDINGS_URL_TPL, lg),
          league,
        );
        return data;
      },
      false,
      "static",
    ); // Standings are static data
  }

  // Fetch teams
  // @param {string} league - auto-detected by date, or pass explicitly
  static async getTeams(league = null) {
    league = league || this.getDefaultLeague();
    const cacheKey = `${league}_teams`;
    return this.getCachedData(
      cacheKey,
      async () => {
        const { data } = await this.fetchWithLeagueFallback(
          (lg) => this._url(this.TEAMS_URL_TPL, lg),
          league,
        );
        return data;
      },
      false,
      "static",
    ); // Teams are static data
  }

  // Fetch team details
  // @param {string} league - auto-detected by date, or pass explicitly
  static async getTeamDetails(teamId, league = null) {
    league = league || this.getDefaultLeague();
    const cacheKey = `${league}_teamDetails_${teamId}`;
    return this.getCachedData(
      cacheKey,
      async () => {
        const { data } = await this.fetchWithLeagueFallback(
          (lg) =>
            `https://site.api.espn.com/apis/site/v2/sports/basketball/${lg}/teams/${teamId}`,
          league,
        );
        return data;
      },
      false,
      "static",
    );
  }

  // Fetch team roster
  // @param {string} league - auto-detected by date, or pass explicitly
  static async getTeamRoster(teamId, league = null) {
    league = league || this.getDefaultLeague();
    const cacheKey = `${league}_teamRoster_${teamId}`;
    return this.getCachedData(
      cacheKey,
      async () => {
        const { data } = await this.fetchWithLeagueFallback(
          (lg) =>
            `https://site.api.espn.com/apis/site/v2/sports/basketball/${lg}/teams/${teamId}/roster`,
          league,
        );
        return data;
      },
      false,
      "static",
    );
  }

  // Fetch athlete details
  // @param {string} league - auto-detected by date, or pass explicitly
  static async getAthleteDetails(athleteId, league = null) {
    league = league || this.getDefaultLeague();
    const cacheKey = `${league}_athleteDetails_${athleteId}`;
    return this.getCachedData(
      cacheKey,
      async () => {
        const { data } = await this.fetchWithLeagueFallback(
          (lg) =>
            `https://site.api.espn.com/apis/site/v2/sports/basketball/${lg}/athletes/${athleteId}`,
          league,
        );
        return data;
      },
      false,
      "static",
    );
  }

  // Format ESPN game structure into mobile-friendly shape
  static formatGameForMobile(game) {
    try {
      const competition = game.competitions?.[0] || {};
      const home =
        (competition.competitors || []).find((c) => c.homeAway === "home") ||
        {};
      const away =
        (competition.competitors || []).find((c) => c.homeAway === "away") ||
        {};

      const homeRecord =
        home?.record ??
        (typeof away?.record === "string"
          ? away.record.split("-").reverse().join("-")
          : "");

      const awayRecord =
        away?.record ??
        (typeof home?.record === "string"
          ? home.record.split("-").reverse().join("-")
          : "");

      return {
        id: game.id,
        status: game.status?.type?.description || "",
        displayClock: game.status?.displayClock || "",
        period: game.status?.period || 0,
        isCompleted: !!game.status?.type?.completed,
        isLive: game.status?.type?.state === "in",
        situation: competition.situation || null,
        homeTeam: {
          id: home.id,
          displayName: home.team?.displayName || "",
          abbreviation: home.team?.abbreviation || "",
          // Canonicalize logos to the ESPN combiner URL so consumers see a
          // stable, predictable URI and we avoid double-fetches of different
          // URL shapes (combiner vs raw) across the app.
          logo: combinerUrl(home.team?.logo),
          score: home.score,
          record: homeRecord || home.records?.[0]?.summary || "",
          color: home.team?.color || null,
          alternateColor: home.team?.alternateColor || null,
        },
        awayTeam: {
          id: away.id,
          displayName: away.team?.displayName || "",
          abbreviation: away.team?.abbreviation || "",
          logo: combinerUrl(away.team?.logo),
          score: away.score,
          record: awayRecord || away.records?.[0]?.summary || "",
          color: away.team?.color || null,
          alternateColor: away.team?.alternateColor || null,
        },
        date: game.date,
        venue: competition.venue?.fullName || "",
        attendance: competition.attendance,
        // Aggregate up to 3 broadcast names across markets (home/away/neutral)
        broadcast: (() => {
          try {
            const broadcasts = competition.broadcasts || [];
            const names = [];
            broadcasts.forEach((b) => {
              if (b && Array.isArray(b.names)) {
                b.names.forEach((n) => {
                  if (n && !names.includes(n)) names.push(n);
                });
              }
            });
            return names.slice(0, 3).join(", ");
          } catch (e) {
            return competition.broadcasts?.[0]?.names?.[0] || "";
          }
        })(),
        notes: competition.notes?.[0]?.headline || "",
        // Summer league identifier extracted from the Gamecast link (e.g. "nba-summer-utah", "nba-summer-california")
        summerLeague: (() => {
          try {
            const gamecastLink = (game.links || []).find(
              (l) =>
                Array.isArray(l.rel) &&
                l.rel.includes("event") &&
                l.text === "Gamecast",
            );
            if (gamecastLink?.href) {
              const match = gamecastLink.href.match(/\/league\/([^/]+)/);
              if (match) return match[1];
            }
          } catch (_) {}
          return null;
        })(),
        season: game.season || {},
        gameStatus: game.status?.type?.state || "",
        neutral: competition.neutralSite || false,
        odds: competition.odds?.[0] || null,
        lastPlay: competition.situation?.lastPlay?.text || "",
        leaders: {
          home: home.leaders || [],
          away: away.leaders || [],
        },
      };
    } catch (error) {
      console.error("Error formatting NBA game:", error);
      return null;
    }
  }

  // Format team standings data
  // Supports both the new ESPN v2 API (children[]) and legacy CDN format (content.standings.groups[])
  static formatStandingsForMobile(standingsData) {
    try {
      // New ESPN v2 API: groups are in top-level `children` array
      // (NBA Summer League has multiple children like Las Vegas, Utah, California Classic)
      // Each child may itself have nested `children` for sub-groups/divisions.
      let groups = standingsData?.children || [];

      // Legacy CDN API fallback: groups inside content.standings.groups
      if (groups.length === 0) {
        groups = standingsData?.content?.standings?.groups || [];
      }

      const formatted = {};

      groups.forEach((group) => {
        const confName = group.name;
        formatted[confName] = {};

        // Some groups (esp. NBA regular season) have nested children for divisions
        if (group.children && group.children.length > 0) {
          group.children.forEach((subGroup) => {
            const divName = subGroup.name || "teams";
            const entries = subGroup.standings?.entries || [];
            formatted[confName][divName] = entries.map((entry) => ({
              team: {
                id: entry.team?.id,
                displayName: entry.team?.displayName || "",
                abbreviation: entry.team?.abbreviation || "",
                logo: this.convertToHttps(entry.team?.logos?.[0]?.href),
                color: entry.team?.color,
                alternateColor: entry.team?.alternateColor,
              },
              stats: Array.isArray(entry.stats)
                ? entry.stats.reduce((acc, stat) => {
                    acc[stat.name] = stat.displayValue;
                    return acc;
                  }, {})
                : entry.stats || {},
            }));
          });
        } else {
          // Flat group — entries directly under group.standings
          const entries = group.standings?.entries || [];
          formatted[confName]["teams"] = entries.map((entry) => ({
            team: {
              id: entry.team?.id,
              displayName: entry.team?.displayName || "",
              abbreviation: entry.team?.abbreviation || "",
              logo: this.convertToHttps(entry.team?.logos?.[0]?.href),
              color: entry.team?.color,
              alternateColor: entry.team?.alternateColor,
            },
            stats: Array.isArray(entry.stats)
              ? entry.stats.reduce((acc, stat) => {
                  acc[stat.name] = stat.displayValue;
                  return acc;
                }, {})
              : entry.stats || {},
          }));
        }
      });

      return formatted;
    } catch (error) {
      console.error("Error formatting NBA standings:", error);
      return {};
    }
  }

  // Format team data for mobile
  static formatTeamForMobile(team) {
    try {
      return {
        id: team.id,
        displayName: team.displayName || "",
        name: team.name || "",
        abbreviation: team.abbreviation || "",
        nickname: team.nickname || "",
        location: team.location || "",
        logo: this.convertToHttps(team.logos?.[0]?.href),
        color: team.color,
        alternateColor: team.alternateColor,
        venue: team.venue?.fullName || "",
        founded: team.founded,
        record: team.record?.items?.[0]?.summary || "",
        standingSummary: team.standingSummary || "",
      };
    } catch (error) {
      console.error("Error formatting NBA team:", error);
      return null;
    }
  }

  // Format athlete data for mobile
  static formatAthleteForMobile(athlete) {
    try {
      return {
        id: athlete.id,
        displayName: athlete.displayName || "",
        fullName: athlete.fullName || "",
        firstName: athlete.firstName || "",
        lastName: athlete.lastName || "",
        position: athlete.position?.displayName || "",
        jersey: athlete.jersey || "",
        age: athlete.age,
        height: athlete.height,
        weight: athlete.weight,
        experience: athlete.experience?.years,
        college: athlete.college?.name || "",
        birthPlace: athlete.birthPlace?.displayText || "",
        headshot: this.convertToHttps(athlete.headshot?.href),
        team: athlete.team ? this.formatTeamForMobile(athlete.team) : null,
        salary: athlete.salary,
        stats: athlete.statistics || [],
      };
    } catch (error) {
      console.error("Error formatting NBA athlete:", error);
      return null;
    }
  }
}

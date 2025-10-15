// NBA API Service for Mobile App
// Uses ESPN NBA endpoints for comprehensive NBA data

export class NBAService {
  static SCOREBOARD_API_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
  static TEAMS_API_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams";
  static STANDINGS_API_URL = "https://cdn.espn.com/core/nba/standings?xhr=1";

  static cache = new Map();
  static cacheTimestamps = new Map();
  static CACHE_DURATION = 2000; // 2 seconds for live responsiveness

  static async getCachedData(key, fetchFunction) {
    const now = Date.now();
    const lastFetch = this.cacheTimestamps.get(key);
    if (lastFetch && (now - lastFetch) < this.CACHE_DURATION && this.cache.has(key)) {
      return this.cache.get(key);
    }

    try {
      const data = await fetchFunction();
      this.cache.set(key, data);
      this.cacheTimestamps.set(key, now);
      return data;
    } catch (error) {
      if (this.cache.has(key)) return this.cache.get(key);
      throw error;
    }
  }

  // Convert ESPN/HTTP urls to HTTPS
  static convertToHttps(url) {
    if (typeof url !== 'string') return url;
    return url.replace(/^http:\/\//i, 'https://');
  }

  // Fetch scoreboard from ESPN
  static async getScoreboard(startDate = null, endDate = null) {
    const cacheKey = `scoreboard_${startDate || 'today'}_${endDate || startDate || 'today'}`;
    return this.getCachedData(cacheKey, async () => {
      let url = this.SCOREBOARD_API_URL;
      if (startDate) {
        if (endDate && endDate !== startDate) {
          url += `?dates=${startDate}-${endDate}`;
        } else {
          url += `?dates=${startDate}`;
        }
      }
      const res = await fetch(url);
      const data = await res.json();
      return data;
    });
  }

  // Fetch game details using ESPN summary
  static async getGameDetails(gameId) {
    const cacheKey = `gameDetails_${gameId}`;
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`;
      const res = await fetch(this.convertToHttps(url));
      const data = await res.json();
      return data;
    });
  }

  // Fetch standings
  static async getStandings() {
    const cacheKey = 'nba_standings';
    return this.getCachedData(cacheKey, async () => {
      const url = 'https://cdn.espn.com/core/nba/standings?xhr=1';
      const res = await fetch(url);
      const data = await res.json();
      return data;
    });
  }

  // Fetch teams
  static async getTeams() {
    const cacheKey = 'teams';
    return this.getCachedData(cacheKey, async () => {
      const res = await fetch(this.TEAMS_API_URL);
      const data = await res.json();
      return data;
    });
  }

  // Fetch team details
  static async getTeamDetails(teamId) {
    const cacheKey = `teamDetails_${teamId}`;
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}`;
      const res = await fetch(url);
      const data = await res.json();
      return data;
    });
  }

  // Fetch team roster
  static async getTeamRoster(teamId) {
    const cacheKey = `teamRoster_${teamId}`;
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/roster`;
      const res = await fetch(url);
      const data = await res.json();
      return data;
    });
  }

  // Fetch athlete details
  static async getAthleteDetails(athleteId) {
    const cacheKey = `athleteDetails_${athleteId}`;
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes/${athleteId}`;
      const res = await fetch(url);
      const data = await res.json();
      return data;
    });
  }

  // Format ESPN game structure into mobile-friendly shape
  static formatGameForMobile(game) {
    try {
      const competition = game.competitions?.[0] || {};
      const home = (competition.competitors || []).find(c => c.homeAway === 'home') || {};
      const away = (competition.competitors || []).find(c => c.homeAway === 'away') || {};

      let resultAway;
      if (away.record) {
        resultAway = away.record;
      } else if (home.record) {
        const flippedHomeRecord = home.record.split('-').reverse().join('-');
        resultAway = flippedHomeRecord;
      } else if (away.records?.[0]?.summary) {
        resultAway = away.records[0].summary;
      } else {
        resultAway = null;
      }

      let resultHome;
      if (home.record) {
        resultHome = home.record;
      } else if (away.record) {
        const flippedAwayRecord = away.record.split('-').reverse().join('-');
        resultHome = flippedAwayRecord;
      } else if (home.records?.[0]?.summary) {
        resultHome = home.records[0].summary;
      } else {
        resultHome = null;
      }

      return {
        id: game.id,
        status: game.status?.type?.description || '',
        displayClock: game.status?.displayClock || '',
        period: game.status?.period || 0,
        isCompleted: !!game.status?.type?.completed,
        situation: competition.situation || null,
        homeTeam: {
          id: home.id,
          displayName: home.team?.displayName || '',
          abbreviation: home.team?.abbreviation || '',
          logo: this.convertToHttps(home.team?.logo),
          score: home.score,
          record: resultHome || ''
        },
        awayTeam: {
          id: away.id,
          displayName: away.team?.displayName || '',
          abbreviation: away.team?.abbreviation || '',
          logo: this.convertToHttps(away.team?.logo),
          score: away.score,
          record: resultAway || ''
        },
        date: game.date,
        venue: competition.venue?.fullName || '',
        attendance: competition.attendance,
        broadcast: competition.broadcasts?.[0]?.names?.[0] || '',
        gameStatus: game.status?.type?.state || '',
        neutral: competition.neutralSite || false,
        odds: competition.odds?.[0] || null,
        lastPlay: competition.situation?.lastPlay?.text || '',
        leaders: {
          home: home.leaders || [],
          away: away.leaders || []
        }
      };
    } catch (error) {
      console.error('Error formatting NBA game:', error);
      return null;
    }
  }

  // Format team standings data
  static formatStandingsForMobile(standingsData) {
    try {
      // New structure: data.content.standings.groups
      const groups = standingsData?.content?.standings?.groups || [];
      const formatted = {};

      groups.forEach(group => {
        const confName = group.name; // "Eastern Conference" or "Western Conference"
        formatted[confName] = {};

        // In the new structure, there's no division breakdown, just one standings list per conference
        const entries = group.standings?.entries || [];
        formatted[confName]['teams'] = entries.map(entry => ({
          team: {
            id: entry.team?.id,
            displayName: entry.team?.displayName || '',
            abbreviation: entry.team?.abbreviation || '',
            logo: this.convertToHttps(entry.team?.logos?.[0]?.href),
            color: entry.team?.color,
            alternateColor: entry.team?.alternateColor
          },
          stats: entry.stats?.reduce((acc, stat) => {
            acc[stat.name] = stat.displayValue;
            return acc;
          }, {}) || {}
        }));
      });

      return formatted;
    } catch (error) {
      console.error('Error formatting NBA standings:', error);
      return {};
    }
  }

  // Format team data for mobile
  static formatTeamForMobile(team) {
    try {
      return {
        id: team.id,
        displayName: team.displayName || '',
        name: team.name || '',
        abbreviation: team.abbreviation || '',
        nickname: team.nickname || '',
        location: team.location || '',
        logo: this.convertToHttps(team.logos?.[0]?.href),
        color: team.color,
        alternateColor: team.alternateColor,
        venue: team.venue?.fullName || '',
        founded: team.founded,
        record: team.record?.items?.[0]?.summary || '',
        standingSummary: team.standingSummary || ''
      };
    } catch (error) {
      console.error('Error formatting NBA team:', error);
      return null;
    }
  }

  // Format athlete data for mobile
  static formatAthleteForMobile(athlete) {
    try {
      return {
        id: athlete.id,
        displayName: athlete.displayName || '',
        fullName: athlete.fullName || '',
        firstName: athlete.firstName || '',
        lastName: athlete.lastName || '',
        position: athlete.position?.displayName || '',
        jersey: athlete.jersey || '',
        age: athlete.age,
        height: athlete.height,
        weight: athlete.weight,
        experience: athlete.experience?.years,
        college: athlete.college?.name || '',
        birthPlace: athlete.birthPlace?.displayText || '',
        headshot: this.convertToHttps(athlete.headshot?.href),
        team: athlete.team ? this.formatTeamForMobile(athlete.team) : null,
        salary: athlete.salary,
        stats: athlete.statistics || []
      };
    } catch (error) {
      console.error('Error formatting NBA athlete:', error);
      return null;
    }
  }
}
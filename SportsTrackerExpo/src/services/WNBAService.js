// WNBA API Service for Mobile App
// Uses ESPN WNBA endpoints for comprehensive WNBA data

export class WNBAService {
  static SCOREBOARD_API_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard";
  static TEAMS_API_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams";
  static STANDINGS_API_URL = "https://cdn.espn.com/core/wnba/standings?xhr=1";

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
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/summary?event=${gameId}`;
      const res = await fetch(this.convertToHttps(url));
      const data = await res.json();
      return data;
    });
  }

  // Fetch standings
  static async getStandings() {
    const cacheKey = 'wnba_standings';
    return this.getCachedData(cacheKey, async () => {
      const url = 'https://cdn.espn.com/core/wnba/standings?xhr=1';
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
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/${teamId}`;
      const res = await fetch(url);
      const data = await res.json();
      return data;
    });
  }

  // Fetch team roster
  static async getTeamRoster(teamId) {
    const cacheKey = `teamRoster_${teamId}`;
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/${teamId}/roster`;
      const res = await fetch(url);
      const data = await res.json();
      return data;
    });
  }

  // Fetch athlete details
  static async getAthleteDetails(athleteId) {
    const cacheKey = `athleteDetails_${athleteId}`;
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/athletes/${athleteId}`;
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
          record: home.records?.[0]?.summary || ''
        },
        awayTeam: {
          id: away.id,
          displayName: away.team?.displayName || '',
          abbreviation: away.team?.abbreviation || '',
          logo: this.convertToHttps(away.team?.logo),
          score: away.score,
          record: away.records?.[0]?.summary || ''
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
      console.error('Error formatting WNBA game:', error);
      return null;
    }
  }

  // Format team standings data
  static formatStandingsForMobile(standingsData) {
    try {
      // WNBA structure: data.content.standings.standings.entries (single list, no conference groups)
      const allEntries = standingsData?.content?.standings?.standings?.entries || [];
      
      // Define conference mappings like in the JS version
      const eastTeams = ["ATL", "CHI", "CON", "IND", "NY", "WSH"];
      const westTeams = ["DAL", "GS", "LV", "LA", "MIN", "PHX", "SEA"];
      
      const formatted = {};

      // Eastern Conference
      const easternEntries = allEntries.filter(entry => 
        eastTeams.includes(entry.team?.abbreviation)
      );
      
      formatted["Eastern Conference"] = {
        teams: easternEntries.map(entry => ({
          team: {
            id: entry.team?.id,
            displayName: entry.team?.displayName || '',
            abbreviation: entry.team?.abbreviation || '',
            logo: this.convertToHttps(entry.team?.logos?.[0]?.href),
            color: entry.team?.color,
            alternateColor: entry.team?.alternateColor,
            seed: entry.team?.seed,
            clincher: entry.team?.clincher
          },
          stats: entry.stats?.reduce((acc, stat) => {
            acc[stat.name] = stat.displayValue;
            return acc;
          }, {}) || {}
        }))
      };

      // Western Conference
      const westernEntries = allEntries.filter(entry => 
        westTeams.includes(entry.team?.abbreviation)
      );
      
      formatted["Western Conference"] = {
        teams: westernEntries.map(entry => ({
          team: {
            id: entry.team?.id,
            displayName: entry.team?.displayName || '',
            abbreviation: entry.team?.abbreviation || '',
            logo: this.convertToHttps(entry.team?.logos?.[0]?.href),
            color: entry.team?.color,
            alternateColor: entry.team?.alternateColor,
            seed: entry.team?.seed,
            clincher: entry.team?.clincher
          },
          stats: entry.stats?.reduce((acc, stat) => {
            acc[stat.name] = stat.displayValue;
            return acc;
          }, {}) || {}
        }))
      };

      return formatted;
    } catch (error) {
      console.error('Error formatting WNBA standings:', error);
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
      console.error('Error formatting WNBA team:', error);
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
      console.error('Error formatting WNBA athlete:', error);
      return null;
    }
  }
}
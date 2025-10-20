// NBA API Service for Mobile App
// Uses ESPN NBA endpoints with AsyncStorage persistent caching

import { BaseCacheService } from './BaseCacheService';

export class NBAService extends BaseCacheService {
  static SCOREBOARD_API_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
  static TEAMS_API_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams";
  static STANDINGS_API_URL = "https://cdn.espn.com/core/nba/standings?xhr=1";

  // Override to detect NBA live games
  static hasLiveEvents(data) {
    if (!data || !data.events) return false;
    return data.events.some(game => 
      game.status && (
        game.status.type?.state === 'in' || 
        game.status.type?.completed === false ||
        game.competitions?.[0]?.status?.type?.state === 'in'
      )
    );
  }

  // Override to determine NBA data type
  static getDataType(data) {
    if (!data || !data.events) return 'static';
    
    const hasLive = this.hasLiveEvents(data);
    if (hasLive) return 'live';
    
    const hasScheduled = data.events.some(game => 
      game.status?.type?.state === 'pre' || 
      game.competitions?.[0]?.status?.type?.state === 'pre'
    );
    if (hasScheduled) return 'scheduled';
    
    return 'finished';
  }

  // Convert ESPN/HTTP urls to HTTPS
  static convertToHttps(url) {
    if (typeof url !== 'string') return url;
    return url.replace(/^http:\/\//i, 'https://');
  }

  // Fetch scoreboard from ESPN with smart caching
  static async getScoreboard(startDate = null, endDate = null) {
    const cacheKey = `nba_scoreboard_${startDate || 'today'}_${endDate || startDate || 'today'}`;
    
    return this.getCachedData(cacheKey, async () => {
      let url = this.SCOREBOARD_API_URL;
      if (startDate) {
        if (endDate && endDate !== startDate) {
          url += `?dates=${startDate}-${endDate}`;
        } else {
          url += `?dates=${startDate}`;
        }
      }
      
      const response = await fetch(url, { headers: this.getBrowserHeaders() });
      const data = await response.json();
      return data;
    }, 'scoreboard');
  }

  // Fetch game details using ESPN summary
  static async getGameDetails(gameId) {
    const cacheKey = `nba_gameDetails_${gameId}`;
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`;
      const response = await fetch(url, { headers: this.getBrowserHeaders() });
      const data = await response.json();
      return data;
    }, false, 'live'); // Game details are often live data
  }

  // Fetch standings
  static async getStandings() {
    const cacheKey = 'nba_standings';
    return this.getCachedData(cacheKey, async () => {
      const url = 'https://cdn.espn.com/core/nba/standings?xhr=1';
      const response = await fetch(url, { headers: this.getBrowserHeaders() });
      const data = await response.json();
      return data;
    }, false, 'static'); // Standings are static data
  }

  // Fetch teams
  static async getTeams() {
    const cacheKey = 'nba_teams';
    return this.getCachedData(cacheKey, async () => {
      const response = await fetch(this.TEAMS_API_URL, { headers: this.getBrowserHeaders() });
      const data = await response.json();
      return data;
    }, false, 'static'); // Teams are static data
  }

  // Fetch team details
  static async getTeamDetails(teamId) {
    const cacheKey = `nba_teamDetails_${teamId}`;
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}`;
      const response = await fetch(url, { headers: this.getBrowserHeaders() });
      const data = await response.json();
      return data;
    }, false, 'static');
  }

  // Fetch team roster
  static async getTeamRoster(teamId) {
    const cacheKey = `nba_teamRoster_${teamId}`;
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/roster`;
      const response = await fetch(url, { headers: this.getBrowserHeaders() });
      const data = await response.json();
      return data;
    }, false, 'static');
  }

  // Fetch athlete details
  static async getAthleteDetails(athleteId) {
    const cacheKey = `nba_athleteDetails_${athleteId}`;
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes/${athleteId}`;
      const response = await fetch(url, { headers: this.getBrowserHeaders() });
      const data = await response.json();
      return data;
    }, false, 'static');
  }

  // Convert ESPN/HTTP urls to HTTPS (for compatibility)
  static convertToHttps(url) {
    if (typeof url !== 'string') return url;
    return url.replace(/^http:\/\//i, 'https://');
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
        isLive: game.status?.type?.state === 'in',
        situation: competition.situation || null,
        homeTeam: {
          id: home.id,
          displayName: home.team?.displayName || '',
          abbreviation: home.team?.abbreviation || '',
          logo: this.convertToHttps(home.team?.logo),
          score: home.score,
          record: home.record || home.records?.[0]?.summary || ''
        },
        awayTeam: {
          id: away.id,
          displayName: away.team?.displayName || '',
          abbreviation: away.team?.abbreviation || '',
          logo: this.convertToHttps(away.team?.logo),
          score: away.score,
          record: away.record || away.records?.[0]?.summary || ''
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
      const groups = standingsData?.content?.standings?.groups || [];
      const formatted = {};

      groups.forEach(group => {
        const confName = group.name;
        formatted[confName] = {};

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
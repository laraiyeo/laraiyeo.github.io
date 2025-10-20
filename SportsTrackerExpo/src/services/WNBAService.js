// WNBA API Service for Mobile App
// Uses ESPN WNBA endpoints for comprehensive WNBA data

import { BaseCacheService } from './BaseCacheService';

export class WNBAService extends BaseCacheService {
  static SCOREBOARD_API_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard";
  static TEAMS_API_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams";
  static STANDINGS_API_URL = "https://cdn.espn.com/core/wnba/standings?xhr=1";

  // Smart live game detection for WNBA
  static hasLiveEvents(data) {
    try {
      const events = data?.events || [];
      return events.some(event => {
        const status = event?.status?.type?.name;
        const description = event?.status?.type?.description;
        
        // WNBA live statuses
        return status === 'STATUS_IN_PROGRESS' || 
               description?.toLowerCase().includes('period') ||
               description?.toLowerCase().includes('quarter') ||
               description?.toLowerCase().includes('halftime') ||
               description?.toLowerCase().includes('overtime');
      });
    } catch (error) {
      console.error('WNBAService: Error detecting live events', error);
      return false;
    }
  }

  static getDataType(data, context) {
    try {
      if (this.hasLiveEvents(data)) {
        return 'live';
      }
      
      if (context?.includes('standings') || context?.includes('teams')) {
        return 'static';
      }
      
      // Check if events are scheduled or finished
      const events = data?.events || [];
      const hasScheduled = events.some(event => 
        event?.status?.type?.name === 'STATUS_SCHEDULED'
      );
      const hasFinished = events.some(event => 
        event?.status?.type?.completed === true
      );
      
      if (hasScheduled && !hasFinished) return 'scheduled';
      if (hasFinished && !hasScheduled) return 'finished';
      
      return 'scheduled'; // Default for mixed or unknown
    } catch (error) {
      console.error('WNBAService: Error determining data type', error);
      return 'scheduled';
    }
  }

  // Convert ESPN/HTTP urls to HTTPS
  static convertToHttps(url) {
    if (typeof url !== 'string') return url;
    return url.replace(/^http:\/\//i, 'https://');
  }

  // Fetch scoreboard from ESPN
  static async getScoreboard(startDate = null, endDate = null) {
    const cacheKey = `wnba_scoreboard_${startDate || 'today'}_${endDate || startDate || 'today'}`;
    return this.getCachedData(cacheKey, async () => {
      let url = this.SCOREBOARD_API_URL;
      if (startDate) {
        if (endDate && endDate !== startDate) {
          url += `?dates=${startDate}-${endDate}`;
        } else {
          url += `?dates=${startDate}`;
        }
      }
      const headers = this.getBrowserHeaders();
      const res = await fetch(url, { headers });
      const data = await res.json();
      return data;
    }, 'scoreboard');
  }

  // Fetch game details using ESPN summary
  static async getGameDetails(gameId) {
    const cacheKey = `wnba_game_details_${gameId}`;
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/summary?event=${gameId}`;
      const headers = this.getBrowserHeaders();
      const res = await fetch(this.convertToHttps(url), { headers });
      const data = await res.json();
      return data;
    }, 'game_details');
  }

  // Fetch standings
  static async getStandings() {
    const cacheKey = 'wnba_standings';
    return this.getCachedData(cacheKey, async () => {
      const url = 'https://cdn.espn.com/core/wnba/standings?xhr=1';
      const headers = this.getBrowserHeaders();
      const res = await fetch(url, { headers });
      const data = await res.json();
      return data;
    }, 'standings');
  }

  // Fetch teams
  static async getTeams() {
    const cacheKey = 'wnba_teams';
    return this.getCachedData(cacheKey, async () => {
      const headers = this.getBrowserHeaders();
      const res = await fetch(this.TEAMS_API_URL, { headers });
      const data = await res.json();
      return data;
    }, 'teams');
  }

  // Fetch team details
  static async getTeamDetails(teamId) {
    const cacheKey = `wnba_team_details_${teamId}`;
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/${teamId}`;
      const headers = this.getBrowserHeaders();
      const res = await fetch(url, { headers });
      const data = await res.json();
      return data;
    }, 'team_details');
  }

  // Fetch team roster
  static async getTeamRoster(teamId) {
    const cacheKey = `wnba_team_roster_${teamId}`;
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/${teamId}/roster`;
      const headers = this.getBrowserHeaders();
      const res = await fetch(url, { headers });
      const data = await res.json();
      return data;
    }, 'team_roster');
  }

  // Fetch athlete details
  static async getAthleteDetails(athleteId) {
    const cacheKey = `wnba_athlete_details_${athleteId}`;
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/athletes/${athleteId}`;
      const headers = this.getBrowserHeaders();
      const res = await fetch(url, { headers });
      const data = await res.json();
      return data;
    }, 'athlete_details');
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

  static clearCache() {
    return super.clearCache();
  }
}
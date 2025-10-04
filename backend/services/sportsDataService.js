const axios = require('axios');
const { getCachedData, setCachedData, generateCacheKey } = require('./cacheService');
const deltaService = require('./deltaService');

/**
 * Sports Data Service - Handles optimized data fetching and aggregation
 */
class SportsDataService {
  constructor() {
    this.espnBaseUrl = process.env.ESPN_BASE_URL || 'https://site.api.espn.com';
    this.mlbBaseUrl = process.env.MLB_BASE_URL || 'https://statsapi.mlb.com';
    this.nflBaseUrl = process.env.NFL_BASE_URL || 'https://sports.core.api.espn.com';
    
    // Cache TTL settings
    this.shortCacheTTL = parseInt(process.env.CACHE_TTL_SECONDS) || 30;
    this.longCacheTTL = parseInt(process.env.LONG_CACHE_TTL_SECONDS) || 300;
    
    // Request timeout
    this.requestTimeout = 5000;
    
    // Teams scheduled for data fetching
    this.scheduledTeams = new Set();
  }

  /**
   * Get optimized games data for user's favorite teams
   */
  async getOptimizedGamesData(teams, lastUpdateDate = null) {
    try {
      const gamesData = {
        games: [],
        lastUpdate: new Date().toISOString(),
        hasChanges: false
      };

      // Group teams by sport for efficient batch fetching
      const teamsBySport = this.groupTeamsBySport(teams);
      
      // Fetch data for each sport
      const sportPromises = Object.entries(teamsBySport).map(([sport, sportTeams]) => 
        this.fetchSportData(sport, sportTeams)
      );

      const sportResults = await Promise.allSettled(sportPromises);
      
      // Combine results
      for (const result of sportResults) {
        if (result.status === 'fulfilled' && result.value) {
          gamesData.games.push(...result.value);
        }
      }

      // Get previous games data for delta comparison
      let previousGames = null;
      if (lastUpdateDate) {
        const cacheKey = generateCacheKey('games_snapshot', this.generateTeamsHash(teams));
        previousGames = await getCachedData(cacheKey);
      }

      // Generate delta response
      const deltaResponse = deltaService.generateGamesDelta(
        gamesData.games,
        lastUpdateDate,
        previousGames?.games
      );

      // Cache current games for future delta comparisons
      const snapshotCacheKey = generateCacheKey('games_snapshot', this.generateTeamsHash(teams));
      await setCachedData(snapshotCacheKey, { games: gamesData.games }, this.shortCacheTTL);

      return deltaResponse;
    } catch (error) {
      console.error('Error getting optimized games data:', error);
      throw error;
    }
  }

  /**
   * Fetch data for a specific sport
   */
  async fetchSportData(sport, teams) {
    const cacheKey = generateCacheKey('sport_data', sport, this.generateTeamsHash(teams));
    const cachedData = await getCachedData(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    let sportData = [];

    try {
      switch (sport.toLowerCase()) {
        case 'mlb':
          sportData = await this.fetchMLBData(teams);
          break;
        case 'nfl':
          sportData = await this.fetchNFLData(teams);
          break;
        case 'nba':
          sportData = await this.fetchNBAData(teams);
          break;
        case 'nhl':
          sportData = await this.fetchNHLData(teams);
          break;
        case 'f1':
          sportData = await this.fetchF1Data(teams);
          break;
        case 'soccer':
          sportData = await this.fetchSoccerData(teams);
          break;
        default:
          console.warn(`Unsupported sport: ${sport}`);
      }

      // Optimize the data payload
      sportData = deltaService.optimizePayload(sportData);

      // Cache the data
      await setCachedData(cacheKey, sportData, this.shortCacheTTL);

      return sportData;
    } catch (error) {
      console.error(`Error fetching ${sport} data:`, error);
      return [];
    }
  }

  /**
   * Fetch MLB data
   */
  async fetchMLBData(teams) {
    const games = [];
    const today = new Date().toISOString().split('T')[0];

    try {
      // Fetch today's games
      const scheduleUrl = `${this.mlbBaseUrl}/api/v1/schedule/games/?sportId=1&date=${today}`;
      const response = await this.makeRequest(scheduleUrl);

      if (response.data?.dates?.[0]?.games) {
        for (const game of response.data.dates[0].games) {
          // Check if any of our favorite teams are playing
          const homeTeamId = game.teams?.home?.team?.id;
          const awayTeamId = game.teams?.away?.team?.id;
          
          const isRelevant = teams.some(team => 
            String(team.teamId) === String(homeTeamId) || 
            String(team.teamId) === String(awayTeamId)
          );

          if (isRelevant) {
            games.push(this.transformMLBGame(game));
          }
        }
      }
    } catch (error) {
      console.error('Error fetching MLB data:', error);
    }

    return games;
  }

  /**
   * Fetch NFL data
   */
  async fetchNFLData(teams) {
    const games = [];

    try {
      const currentWeek = this.getCurrentNFLWeek();
      const url = `${this.nflBaseUrl}/v2/sports/football/leagues/nfl/seasons/2024/types/2/weeks/${currentWeek}/events`;
      
      const response = await this.makeRequest(url);

      if (response.data?.events) {
        for (const event of response.data.events) {
          const homeTeamId = event.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home')?.team?.id;
          const awayTeamId = event.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away')?.team?.id;

          const isRelevant = teams.some(team => 
            String(team.teamId) === String(homeTeamId) || 
            String(team.teamId) === String(awayTeamId)
          );

          if (isRelevant) {
            games.push(this.transformNFLGame(event));
          }
        }
      }
    } catch (error) {
      console.error('Error fetching NFL data:', error);
    }

    return games;
  }

  /**
   * Fetch NBA data
   */
  async fetchNBAData(teams) {
    const games = [];
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');

    try {
      const url = `${this.espnBaseUrl}/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today}`;
      const response = await this.makeRequest(url);

      if (response.data?.events) {
        for (const event of response.data.events) {
          const homeTeamId = event.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home')?.team?.id;
          const awayTeamId = event.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away')?.team?.id;

          const isRelevant = teams.some(team => 
            String(team.teamId) === String(homeTeamId) || 
            String(team.teamId) === String(awayTeamId)
          );

          if (isRelevant) {
            games.push(this.transformNBAGame(event));
          }
        }
      }
    } catch (error) {
      console.error('Error fetching NBA data:', error);
    }

    return games;
  }

  /**
   * Fetch NHL data
   */
  async fetchNHLData(teams) {
    const games = [];
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');

    try {
      const url = `${this.espnBaseUrl}/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${today}`;
      const response = await this.makeRequest(url);

      if (response.data?.events) {
        for (const event of response.data.events) {
          const homeTeamId = event.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home')?.team?.id;
          const awayTeamId = event.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away')?.team?.id;

          const isRelevant = teams.some(team => 
            String(team.teamId) === String(homeTeamId) || 
            String(team.teamId) === String(awayTeamId)
          );

          if (isRelevant) {
            games.push(this.transformNHLGame(event));
          }
        }
      }
    } catch (error) {
      console.error('Error fetching NHL data:', error);
    }

    return games;
  }

  /**
   * Fetch F1 data
   */
  async fetchF1Data(teams) {
    const races = [];

    try {
      // F1 implementation would go here - adapting from your existing F1 service
      // This is a placeholder for the F1 API integration
      console.log('F1 data fetching not yet implemented');
    } catch (error) {
      console.error('Error fetching F1 data:', error);
    }

    return races;
  }

  /**
   * Fetch Soccer data
   */
  async fetchSoccerData(teams) {
    const games = [];

    try {
      // Soccer implementation would go here - adapting from your existing soccer services
      // This is a placeholder for the soccer API integration
      console.log('Soccer data fetching not yet implemented');
    } catch (error) {
      console.error('Error fetching Soccer data:', error);
    }

    return games;
  }

  /**
   * Transform MLB game data to standardized format
   */
  transformMLBGame(game) {
    return {
      id: game.gamePk,
      sport: 'mlb',
      homeTeam: {
        id: game.teams?.home?.team?.id,
        name: game.teams?.home?.team?.name,
        abbreviation: game.teams?.home?.team?.abbreviation,
        score: game.teams?.home?.score || 0
      },
      awayTeam: {
        id: game.teams?.away?.team?.id,
        name: game.teams?.away?.team?.name,
        abbreviation: game.teams?.away?.team?.abbreviation,
        score: game.teams?.away?.score || 0
      },
      status: game.status?.detailedState,
      inProgress: game.status?.abstractGameState === 'Live',
      completed: game.status?.abstractGameState === 'Final',
      startTime: game.gameDate,
      inning: game.linescore?.currentInning,
      inningHalf: game.linescore?.inningHalf,
      lastUpdate: new Date().toISOString()
    };
  }

  /**
   * Transform NFL game data to standardized format
   */
  transformNFLGame(event) {
    const competition = event.competitions?.[0];
    const homeTeam = competition?.competitors?.find(c => c.homeAway === 'home');
    const awayTeam = competition?.competitors?.find(c => c.homeAway === 'away');

    return {
      id: event.id,
      sport: 'nfl',
      homeTeam: {
        id: homeTeam?.team?.id,
        name: homeTeam?.team?.displayName,
        abbreviation: homeTeam?.team?.abbreviation,
        score: parseInt(homeTeam?.score) || 0
      },
      awayTeam: {
        id: awayTeam?.team?.id,
        name: awayTeam?.team?.displayName,
        abbreviation: awayTeam?.team?.abbreviation,
        score: parseInt(awayTeam?.score) || 0
      },
      status: competition?.status?.type?.description,
      inProgress: competition?.status?.type?.state === 'in',
      completed: competition?.status?.type?.completed,
      startTime: event.date,
      period: competition?.status?.period,
      clock: competition?.status?.displayClock,
      lastUpdate: new Date().toISOString()
    };
  }

  /**
   * Transform NBA game data to standardized format
   */
  transformNBAGame(event) {
    const competition = event.competitions?.[0];
    const homeTeam = competition?.competitors?.find(c => c.homeAway === 'home');
    const awayTeam = competition?.competitors?.find(c => c.homeAway === 'away');

    return {
      id: event.id,
      sport: 'nba',
      homeTeam: {
        id: homeTeam?.team?.id,
        name: homeTeam?.team?.displayName,
        abbreviation: homeTeam?.team?.abbreviation,
        score: parseInt(homeTeam?.score) || 0
      },
      awayTeam: {
        id: awayTeam?.team?.id,
        name: awayTeam?.team?.displayName,
        abbreviation: awayTeam?.team?.abbreviation,
        score: parseInt(awayTeam?.score) || 0
      },
      status: competition?.status?.type?.description,
      inProgress: competition?.status?.type?.state === 'in',
      completed: competition?.status?.type?.completed,
      startTime: event.date,
      period: competition?.status?.period,
      clock: competition?.status?.displayClock,
      lastUpdate: new Date().toISOString()
    };
  }

  /**
   * Transform NHL game data to standardized format
   */
  transformNHLGame(event) {
    const competition = event.competitions?.[0];
    const homeTeam = competition?.competitors?.find(c => c.homeAway === 'home');
    const awayTeam = competition?.competitors?.find(c => c.homeAway === 'away');

    return {
      id: event.id,
      sport: 'nhl',
      homeTeam: {
        id: homeTeam?.team?.id,
        name: homeTeam?.team?.displayName,
        abbreviation: homeTeam?.team?.abbreviation,
        score: parseInt(homeTeam?.score) || 0
      },
      awayTeam: {
        id: awayTeam?.team?.id,
        name: awayTeam?.team?.displayName,
        abbreviation: awayTeam?.team?.abbreviation,
        score: parseInt(awayTeam?.score) || 0
      },
      status: competition?.status?.type?.description,
      inProgress: competition?.status?.type?.state === 'in',
      completed: competition?.status?.type?.completed,
      startTime: event.date,
      period: competition?.status?.period,
      clock: competition?.status?.displayClock,
      lastUpdate: new Date().toISOString()
    };
  }

  /**
   * Generate user summary data
   */
  async generateUserSummary(userId) {
    // Implementation for generating user summary
    return {
      userId,
      totalFavorites: 0,
      liveGames: 0,
      upcomingGames: 0,
      completedToday: 0,
      lastUpdate: new Date().toISOString()
    };
  }

  /**
   * Schedule teams for background data fetching
   */
  scheduleTeamDataFetch(teams) {
    teams.forEach(team => {
      this.scheduledTeams.add(`${team.sport}:${team.teamId}`);
    });
  }

  /**
   * Get optimized games data for a specific sport (corrected signature)
   */
  async getOptimizedGamesData(sport, options = {}) {
    try {
      const { startDate, endDate } = options;
      console.log(`[SportsDataService] Fetching ${sport} games:`, { startDate, endDate });

      const gamesData = {
        events: [],
        lastUpdate: new Date().toISOString()
      };

      switch (sport.toLowerCase()) {
        case 'mlb':
          gamesData.events = await this.fetchMLBGames(startDate, endDate);
          break;
        case 'nfl':
          gamesData.events = await this.fetchNFLGames(startDate, endDate);
          break;
        case 'nba':
          gamesData.events = await this.fetchNBAGames(startDate, endDate);
          break;
        case 'nhl':
          gamesData.events = await this.fetchNHLGames(startDate, endDate);
          break;
        case 'f1':
          gamesData.events = await this.fetchF1Races(startDate, endDate);
          break;
        case 'soccer':
          gamesData.events = await this.fetchSoccerGames(startDate, endDate);
          break;
        default:
          throw new Error(`Unsupported sport: ${sport}`);
      }

      return gamesData;
    } catch (error) {
      console.error(`Error getting ${sport} games data:`, error);
      throw error;
    }
  }

  /**
   * Get standings data for a specific sport
   */
  async getStandings(sport) {
    try {
      console.log(`[SportsDataService] Fetching ${sport} standings`);

      const cacheKey = generateCacheKey('standings', sport);
      const cachedData = await getCachedData(cacheKey);

      if (cachedData) {
        return cachedData;
      }

      let standingsData = {};

      switch (sport.toLowerCase()) {
        case 'mlb':
          standingsData = await this.fetchMLBStandings();
          break;
        case 'nfl':
          standingsData = await this.fetchNFLStandings();
          break;
        case 'nba':
          standingsData = await this.fetchNBAStandings();
          break;
        case 'nhl':
          standingsData = await this.fetchNHLStandings();
          break;
        default:
          throw new Error(`Standings not supported for sport: ${sport}`);
      }

      // Cache standings data
      await setCachedData(cacheKey, standingsData, this.longCacheTTL);
      return standingsData;
    } catch (error) {
      console.error(`Error getting ${sport} standings:`, error);
      throw error;
    }
  }

  /**
   * Get team data for a specific sport and team
   */
  async getTeamData(sport, teamId) {
    try {
      console.log(`[SportsDataService] Fetching ${sport} team ${teamId} data`);

      const cacheKey = generateCacheKey('team_data', sport, teamId);
      const cachedData = await getCachedData(cacheKey);

      if (cachedData) {
        return cachedData;
      }

      let teamData = {};

      switch (sport.toLowerCase()) {
        case 'mlb':
          teamData = await this.fetchMLBTeamData(teamId);
          break;
        case 'nfl':
          teamData = await this.fetchNFLTeamData(teamId);
          break;
        case 'nba':
          teamData = await this.fetchNBATeamData(teamId);
          break;
        case 'nhl':
          teamData = await this.fetchNHLTeamData(teamId);
          break;
        default:
          throw new Error(`Team data not supported for sport: ${sport}`);
      }

      // Cache team data
      await setCachedData(cacheKey, teamData, this.longCacheTTL);
      return teamData;
    } catch (error) {
      console.error(`Error getting ${sport} team ${teamId} data:`, error);
      throw error;
    }
  }

  /**
   * Fetch MLB games for date range
   */
  async fetchMLBGames(startDate, endDate) {
    try {
      let url = `${this.mlbBaseUrl}/api/v1/schedule/games/?sportId=1`;
      
      if (startDate) {
        if (endDate && endDate !== startDate) {
          url += `&startDate=${startDate}&endDate=${endDate}`;
        } else {
          url += `&startDate=${startDate}&endDate=${startDate}`;
        }
      } else {
        // Use today's date adjusted for MLB
        const today = this.getAdjustedDateForMLB();
        url += `&startDate=${today}&endDate=${today}`;
      }

      console.log('[SportsDataService] Fetching MLB games from:', url);
      const response = await this.makeRequest(url);
      return this.normalizeMLBGames(response.data);
    } catch (error) {
      console.error('Error fetching MLB games:', error);
      throw error;
    }
  }

  /**
   * Fetch MLB standings
   */
  async fetchMLBStandings() {
    try {
      const currentYear = new Date().getFullYear();
      const url = `${this.mlbBaseUrl}/api/v1/standings?leagueId=103,104&season=${currentYear}&standingsTypes=regularSeason`;
      console.log('[SportsDataService] Fetching MLB standings from:', url);
      const response = await this.makeRequest(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching MLB standings:', error);
      throw error;
    }
  }

  /**
   * Fetch MLB team data
   */
  async fetchMLBTeamData(teamId) {
    try {
      const url = `${this.mlbBaseUrl}/api/v1/teams/${teamId}`;
      console.log('[SportsDataService] Fetching MLB team data from:', url);
      const response = await this.makeRequest(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching MLB team data:', error);
      throw error;
    }
  }

  /**
   * Normalize MLB games data to common format
   */
  normalizeMLBGames(data) {
    const events = [];

    if (data.dates && data.dates.length > 0) {
      data.dates.forEach(dateObj => {
        if (dateObj.games && dateObj.games.length > 0) {
          dateObj.games.forEach(game => {
            events.push(this.normalizeMLBGame(game));
          });
        }
      });
    }

    return events;
  }

  /**
   * Normalize single MLB game
   */
  normalizeMLBGame(game) {
    const awayTeam = game.teams?.away;
    const homeTeam = game.teams?.home;
    
    return {
      id: game.gamePk?.toString(),
      date: game.gameDate,
      status: game.status?.detailedState || 'Unknown',
      statusType: game.status?.statusCode || 'U',
      isCompleted: game.status?.statusCode === 'F',
      isLive: game.status?.statusCode === 'I' || 
               game.status?.detailedState === 'In Progress' ||
               game.status?.detailedState === 'Manager challenge' ||
               game.status?.codedGameState === 'M',
      displayClock: this.getMLBGameTimeDisplay(game),
      venue: game.venue?.name || '',
      awayTeam: {
        id: awayTeam?.team?.id?.toString(),
        displayName: awayTeam?.team?.name || '',
        abbreviation: awayTeam?.team?.abbreviation || '',
        score: awayTeam?.score?.toString() || '0',
        record: this.formatMLBRecord(awayTeam?.leagueRecord)
      },
      homeTeam: {
        id: homeTeam?.team?.id?.toString(),
        displayName: homeTeam?.team?.name || '',
        abbreviation: homeTeam?.team?.abbreviation || '',
        score: homeTeam?.score?.toString() || '0',
        record: this.formatMLBRecord(homeTeam?.leagueRecord)
      },
      // MLB-specific data
      inning: game.linescore?.currentInning || 0,
      inningState: game.linescore?.inningState || '',
      situation: this.getMLBGameSituation(game)
    };
  }

  /**
   * Get adjusted date for MLB (accounting for late games)
   */
  getAdjustedDateForMLB() {
    const now = new Date();
    const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    
    // If before 2 AM EST, use previous day
    if (estNow.getHours() < 2) {
      estNow.setDate(estNow.getDate() - 1);
    }

    return estNow.getFullYear() + "-" +
           String(estNow.getMonth() + 1).padStart(2, "0") + "-" +
           String(estNow.getDate()).padStart(2, "0");
  }

  /**
   * Get MLB game time display
   */
  getMLBGameTimeDisplay(game) {
    if (game.status?.statusCode === 'F') {
      return 'Final';
    }
    
    if (game.status?.statusCode === 'I' || 
        game.status?.detailedState === 'In Progress' ||
        game.status?.detailedState === 'Manager challenge' ||
        game.status?.codedGameState === 'M') {
      const inning = game.linescore?.currentInning || 0;
      const inningState = game.linescore?.inningState || '';
      const ordinal = this.getOrdinalSuffix(inning);
      return inningState === 'Top' ? `Top ${ordinal}` : `Bot ${ordinal}`;
    }
    
    if (game.status?.statusCode === 'S' || game.status?.statusCode === 'P') {
      const gameDate = new Date(game.gameDate);
      return gameDate.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        timeZone: 'America/New_York'
      });
    }
    
    return game.status?.detailedState || 'Unknown';
  }

  /**
   * Format MLB team record
   */
  formatMLBRecord(record) {
    if (!record) return '';
    return `${record.wins}-${record.losses}`;
  }

  /**
   * Get MLB game situation
   */
  getMLBGameSituation(game) {
    if (!game.linescore) return {};
    
    return {
      balls: game.linescore.balls || 0,
      strikes: game.linescore.strikes || 0,
      outs: game.linescore.outs || 0,
      bases: {
        first: !!game.linescore.offense?.first,
        second: !!game.linescore.offense?.second,
        third: !!game.linescore.offense?.third
      }
    };
  }

  /**
   * Get ordinal suffix for inning numbers
   */
  getOrdinalSuffix(num) {
    if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
    switch (num % 10) {
      case 1: return `${num}st`;
      case 2: return `${num}nd`;
      case 3: return `${num}rd`;
      default: return `${num}th`;
    }
  }

  // Placeholder methods for other sports - can be implemented later
  async fetchNFLGames(startDate, endDate) { return []; }
  async fetchNBAGames(startDate, endDate) { return []; }
  async fetchNHLGames(startDate, endDate) { return []; }
  async fetchF1Races(startDate, endDate) { return []; }
  async fetchSoccerGames(startDate, endDate) { return []; }
  
  async fetchNFLStandings() { return {}; }
  async fetchNBAStandings() { return {}; }
  async fetchNHLStandings() { return {}; }
  
  async fetchNFLTeamData(teamId) { return {}; }
  async fetchNBATeamData(teamId) { return {}; }
  async fetchNHLTeamData(teamId) { return {}; }

  /**
   * Helper methods
   */
  groupTeamsBySport(teams) {
    return teams.reduce((groups, team) => {
      const sport = team.sport.toLowerCase();
      if (!groups[sport]) groups[sport] = [];
      groups[sport].push(team);
      return groups;
    }, {});
  }

  generateTeamsHash(teams) {
    const sortedTeams = teams
      .map(t => `${t.sport}:${t.teamId}`)
      .sort()
      .join(',');
    return Buffer.from(sortedTeams).toString('base64').substring(0, 16);
  }

  getCurrentNFLWeek() {
    // Simple implementation - you might want to make this more sophisticated
    const now = new Date();
    const season2024Start = new Date('2024-09-05');
    const weeksSinceStart = Math.floor((now - season2024Start) / (7 * 24 * 60 * 60 * 1000));
    return Math.max(1, Math.min(18, weeksSinceStart + 1));
  }

  async makeRequest(url, options = {}) {
    try {
      const response = await axios.get(url, {
        timeout: this.requestTimeout,
        headers: {
          'User-Agent': 'SportsTracker/1.0',
          ...options.headers
        },
        ...options
      });
      return response;
    } catch (error) {
      console.error(`Request failed for ${url}:`, error.message);
      throw error;
    }
  }
}

module.exports = new SportsDataService();/ /   C a c h e   c l e a r   t r i g g e r  
 / /   C a c h e   c l e a r   t r i g g e r  
 
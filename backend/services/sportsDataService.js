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

module.exports = new SportsDataService();
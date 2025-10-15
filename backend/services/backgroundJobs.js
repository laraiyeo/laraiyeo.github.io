const cron = require('node-cron');
const sportsDataService = require('./sportsDataService');
const notificationService = require('./notificationService');
const { getCachedData, setCachedData, generateCacheKey } = require('./cacheService');

/**
 * Background Jobs Service - Handles scheduled data fetching and notifications
 */
class BackgroundJobsService {
  constructor() {
    this.jobs = new Map();
    this.isInitialized = false;
  }

  /**
   * Start all background jobs
   */
  startBackgroundJobs() {
    if (this.isInitialized) {
      console.log('Background jobs already initialized');
      return;
    }

    console.log('Starting background jobs...');

    // Job 1: Fetch live game data every 30 seconds
    this.jobs.set('liveGamesFetch', cron.schedule('*/30 * * * * *', async () => {
      await this.fetchLiveGamesData();
    }, { scheduled: false }));

    // Job 2: Fetch upcoming games data every 5 minutes
    this.jobs.set('upcomingGamesFetch', cron.schedule('*/5 * * * *', async () => {
      await this.fetchUpcomingGamesData();
    }, { scheduled: false }));

    // Job 3: Send notifications for game events every minute
    this.jobs.set('gameNotifications', cron.schedule('* * * * *', async () => {
      await this.processGameNotifications();
    }, { scheduled: false }));

    // Job 4: Cleanup old cache entries every hour
    this.jobs.set('cacheCleanup', cron.schedule('0 * * * *', async () => {
      await this.cleanupCache();
    }, { scheduled: false }));

    // Job 5: Generate user summaries every 2 minutes
    this.jobs.set('userSummaries', cron.schedule('*/2 * * * *', async () => {
      await this.generateUserSummaries();
    }, { scheduled: false }));

    // Start all jobs
    this.jobs.forEach((job, name) => {
      job.start();
      console.log(`✅ Started background job: ${name}`);
    });

    this.isInitialized = true;
    console.log('All background jobs started successfully');
  }

  /**
   * Stop all background jobs
   */
  stopBackgroundJobs() {
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`🛑 Stopped background job: ${name}`);
    });
    this.jobs.clear();
    this.isInitialized = false;
  }

  /**
   * Fetch live games data for all tracked teams
   */
  async fetchLiveGamesData() {
    try {
      console.log('Fetching live games data...');
      
      // Get all unique teams from user favorites
      const trackedTeams = await this.getTrackedTeams();
      if (!trackedTeams.length) {
        console.log('No teams to track, skipping live games fetch');
        return;
      }

      console.log(`Fetching live data for ${trackedTeams.length} tracked teams`);

      // Group teams by sport for efficient batch processing
      const teamsBySport = trackedTeams.reduce((groups, team) => {
        const sport = team.sport.toLowerCase();
        if (!groups[sport]) groups[sport] = [];
        groups[sport].push(team);
        return groups;
      }, {});

      // Fetch data for each sport using the sports data service
      const fetchPromises = Object.entries(teamsBySport).map(async ([sport, teams]) => {
        try {
          const data = await sportsDataService.fetchSportData(sport, teams);
          console.log(`Fetched ${data.length} ${sport} games`);
          
          // Cache the fetched data globally (not just for specific users)
          const globalCacheKey = generateCacheKey('global_live_games', sport);
          await setCachedData(globalCacheKey, {
            sport,
            games: data,
            teams: teams.map(t => ({ id: t.teamId, sport: t.sport, name: t.teamName })),
            lastUpdate: new Date().toISOString()
          }, 60); // Cache for 1 minute
          
          return data;
        } catch (error) {
          console.error(`Error fetching ${sport} data:`, error.message);
          return [];
        }
      });

      const results = await Promise.allSettled(fetchPromises);
      const totalGames = results
        .filter(r => r.status === 'fulfilled')
        .reduce((sum, r) => sum + (r.value?.length || 0), 0);
        
      console.log(`Live games data fetch completed - ${totalGames} total games found`);
    } catch (error) {
      console.error('Error fetching live games data:', error);
    }
  }

  /**
   * Fetch upcoming games data
   */
  async fetchUpcomingGamesData() {
    try {
      console.log('Fetching upcoming games data...');
      
      const trackedTeams = await this.getTrackedTeams();
      if (!trackedTeams.length) {
        console.log('No teams to track, skipping upcoming games fetch');
        return;
      }

      // Group teams by sport
      const teamsBySport = trackedTeams.reduce((groups, team) => {
        const sport = team.sport.toLowerCase();
        if (!groups[sport]) groups[sport] = [];
        groups[sport].push(team);
        return groups;
      }, {});

      // Fetch scheduled games for each sport (next 7 days)
      const fetchPromises = Object.entries(teamsBySport).map(async ([sport, teams]) => {
        try {
          // Use sports data service to fetch scheduled games
          const scheduledData = await sportsDataService.fetchSportData(sport, teams);
          
          // Filter for upcoming games only
          const upcomingGames = scheduledData.filter(game => {
            const gameDate = new Date(game.startTime);
            const now = new Date();
            const sevenDaysFromNow = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
            return gameDate > now && gameDate <= sevenDaysFromNow && !game.completed;
          });

          console.log(`Found ${upcomingGames.length} upcoming ${sport} games`);
          
          // Cache upcoming games
          const upcomingCacheKey = generateCacheKey('global_upcoming_games', sport);
          await setCachedData(upcomingCacheKey, {
            sport,
            games: upcomingGames,
            teams: teams.map(t => ({ id: t.teamId, sport: t.sport, name: t.teamName })),
            lastUpdate: new Date().toISOString(),
            daysAhead: 7
          }, 300); // Cache for 5 minutes
          
          return upcomingGames;
        } catch (error) {
          console.error(`Error fetching upcoming ${sport} games:`, error.message);
          return [];
        }
      });

      const results = await Promise.allSettled(fetchPromises);
      const totalUpcoming = results
        .filter(r => r.status === 'fulfilled')
        .reduce((sum, r) => sum + (r.value?.length || 0), 0);
        
      console.log(`Upcoming games data fetch completed - ${totalUpcoming} total upcoming games`);
    } catch (error) {
      console.error('Error fetching upcoming games data:', error);
    }
  }

  /**
   * Process game notifications
   */
  async processGameNotifications() {
    try {
      // Get all users who have push subscriptions
      const users = await this.getNotificationUsers();
      
      for (const user of users) {
        await this.processUserNotifications(user);
      }
    } catch (error) {
      console.error('Error processing game notifications:', error);
    }
  }

  /**
   * Process notifications for a specific user
   */
  async processUserNotifications(user) {
    try {
      const { userId, subscription, preferences } = user;

      // Get user's favorite teams
      const favoritesCacheKey = generateCacheKey('user_favorites', userId);
      const favoritesData = await getCachedData(favoritesCacheKey);

      if (!favoritesData || !favoritesData.teams.length) {
        return;
      }

      // Get current games for user's teams
      const gamesData = await sportsDataService.getOptimizedGamesData(favoritesData.teams);
      
      // Check for notification-worthy events
      const notifications = await this.detectNotificationEvents(
        userId,
        gamesData.games,
        preferences
      );

      // Send notifications
      for (const notification of notifications) {
        await notificationService.sendNotification(userId, notification);
      }
    } catch (error) {
      console.error(`Error processing notifications for user ${user.userId}:`, error);
    }
  }

  /**
   * Detect events that should trigger notifications
   */
  async detectNotificationEvents(userId, currentGames, preferences) {
    const notifications = [];
    
    // Get previous game states for comparison
    const previousStateKey = generateCacheKey('user_previous_games', userId);
    const previousGames = await getCachedData(previousStateKey) || [];
    const previousGameMap = new Map(previousGames.map(g => [g.id, g]));

    for (const game of currentGames) {
      const previousGame = previousGameMap.get(game.id);
      
      // Game started
      if (!previousGame?.inProgress && game.inProgress && preferences.gameStart) {
        notifications.push({
          type: 'game_start',
          title: 'Game Started!',
          body: `${game.awayTeam.name} vs ${game.homeTeam.name}`,
          data: { gameId: game.id, sport: game.sport }
        });
      }

      // Score changed
      if (previousGame && preferences.scoreUpdate) {
        const homeScoreChanged = previousGame.homeTeam.score !== game.homeTeam.score;
        const awayScoreChanged = previousGame.awayTeam.score !== game.awayTeam.score;
        
        if (homeScoreChanged || awayScoreChanged) {
          notifications.push({
            type: 'score_update',
            title: 'Score Update',
            body: `${game.awayTeam.abbreviation} ${game.awayTeam.score} - ${game.homeTeam.score} ${game.homeTeam.abbreviation}`,
            data: { gameId: game.id, sport: game.sport }
          });
        }
      }

      // Game ended
      if (!previousGame?.completed && game.completed && preferences.gameEnd) {
        const winner = game.homeTeam.score > game.awayTeam.score ? game.homeTeam : game.awayTeam;
        notifications.push({
          type: 'game_end',
          title: 'Game Final',
          body: `${winner.name} wins! Final: ${game.awayTeam.abbreviation} ${game.awayTeam.score} - ${game.homeTeam.score} ${game.homeTeam.abbreviation}`,
          data: { gameId: game.id, sport: game.sport }
        });
      }
    }

    // Store current games as previous for next comparison
    await setCachedData(previousStateKey, currentGames, 3600);

    return notifications;
  }

  /**
   * Clean up old cache entries
   */
  async cleanupCache() {
    try {
      console.log('Running cache cleanup...');
      
      // This would implement cache cleanup logic
      // For now, it's a placeholder
      
      console.log('Cache cleanup completed');
    } catch (error) {
      console.error('Error during cache cleanup:', error);
    }
  }

  /**
   * Generate user summaries
   */
  async generateUserSummaries() {
    try {
      console.log('Generating user summaries...');
      
      const users = await this.getAllUsers();
      
      if (!users.length) {
        console.log('No users found, skipping summary generation');
        return;
      }

      let successCount = 0;
      
      for (const userId of users) {
        try {
          const summary = await sportsDataService.generateUserSummary(userId);
          const cacheKey = generateCacheKey('user_summary', userId);
          await setCachedData(cacheKey, summary, 300); // 5 minutes cache
          successCount++;
        } catch (error) {
          console.error(`Error generating summary for user ${userId}:`, error.message);
        }
      }
      
      console.log(`User summaries generation completed - ${successCount}/${users.length} successful`);
    } catch (error) {
      console.error('Error generating user summaries:', error);
    }
  }

  /**
   * Fetch live data for a specific sport
   */
  async fetchSportLiveData(sport, teams) {
    try {
      const data = await sportsDataService.fetchSportData(sport, teams);
      
      // Cache the data with sport-specific cache key
      const cacheKey = generateCacheKey('live_sport_data', sport);
      await setCachedData(cacheKey, data, 30); // 30 seconds for live data
      
      return data;
    } catch (error) {
      console.error(`Error fetching live ${sport} data:`, error);
      return [];
    }
  }

  /**
   * Get all tracked teams across all users
   */
  async getTrackedTeams() {
    try {
      // Get all user favorites cache keys
      const userFavoritesPattern = 'user_favorites:*';
      const keys = await this.getCacheKeysPattern(userFavoritesPattern);
      
      if (!keys || keys.length === 0) {
        return [];
      }

      const allTeams = new Set();
      const teamDetails = [];

      // Fetch all user favorites
      for (const key of keys) {
        try {
          const userFavorites = await getCachedData(key);
          if (userFavorites && userFavorites.teams) {
            for (const team of userFavorites.teams) {
              const teamKey = `${team.sport}:${team.teamId}`;
              if (!allTeams.has(teamKey)) {
                allTeams.add(teamKey);
                teamDetails.push({
                  teamId: team.teamId,
                  sport: team.sport.toLowerCase(),
                  teamName: team.teamName || team.displayName,
                  displayName: team.displayName
                });
              }
            }
          }
        } catch (error) {
          console.error(`Error reading favorites from key ${key}:`, error.message);
        }
      }

      console.log(`Found ${teamDetails.length} unique teams to track across all users`);
      return teamDetails;
    } catch (error) {
      console.error('Error getting tracked teams:', error);
      return [];
    }
  }

  /**
   * Get cache keys matching a pattern (simplified implementation)
   * In production, you'd use Redis SCAN command for efficiency
   */
  async getCacheKeysPattern(pattern) {
    try {
      // For now, we'll return a few common user IDs as examples
      // In a real implementation, you'd track active user IDs or use Redis SCAN
      const commonUserIds = ['user1', 'user2', 'test_user', 'demo_user'];
      const keys = [];
      
      for (const userId of commonUserIds) {
        const key = generateCacheKey('user_favorites', userId);
        const exists = await getCachedData(key);
        if (exists) {
          keys.push(key);
        }
      }
      
      return keys;
    } catch (error) {
      console.error('Error getting cache keys pattern:', error);
      return [];
    }
  }

  /**
   * Get users who have notification subscriptions
   */
  async getNotificationUsers() {
    // This would query Redis for all push subscriptions
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Get all users (for summary generation)
   */
  async getAllUsers() {
    try {
      // Get all user IDs that have favorites configured
      const userFavoritesPattern = 'user_favorites:*';
      const keys = await this.getCacheKeysPattern(userFavoritesPattern);
      
      const userIds = keys.map(key => {
        // Extract user ID from cache key like "user_favorites:user123"
        const match = key.match(/user_favorites:(.+)/);
        return match ? match[1] : null;
      }).filter(Boolean);

      console.log(`Found ${userIds.length} users with configured favorites`);
      return userIds;
    } catch (error) {
      console.error('Error getting all users:', error);
      return [];
    }
  }

  /**
   * Get job status
   */
  getJobStatus() {
    const status = {};
    this.jobs.forEach((job, name) => {
      status[name] = {
        running: job.running,
        scheduled: job.scheduled
      };
    });
    return status;
  }
}

module.exports = {
  startBackgroundJobs: () => new BackgroundJobsService().startBackgroundJobs(),
  stopBackgroundJobs: () => new BackgroundJobsService().stopBackgroundJobs(),
  getJobStatus: () => new BackgroundJobsService().getJobStatus()
};
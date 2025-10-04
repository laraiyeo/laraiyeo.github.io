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
        return;
      }

      // Group teams by sport for efficient batch processing
      const teamsBySport = trackedTeams.reduce((groups, team) => {
        const sport = team.sport.toLowerCase();
        if (!groups[sport]) groups[sport] = [];
        groups[sport].push(team);
        return groups;
      }, {});

      // Fetch data for each sport
      const fetchPromises = Object.entries(teamsBySport).map(([sport, teams]) =>
        this.fetchSportLiveData(sport, teams)
      );

      await Promise.allSettled(fetchPromises);
      console.log('Live games data fetch completed');
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
        return;
      }

      // Similar to live games but for upcoming games
      // Implementation would vary based on specific requirements
      console.log('Upcoming games data fetch completed');
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
      
      for (const userId of users) {
        const summary = await sportsDataService.generateUserSummary(userId);
        const cacheKey = generateCacheKey('user_summary', userId);
        await setCachedData(cacheKey, summary, 300); // 5 minutes cache
      }
      
      console.log('User summaries generation completed');
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
    // This would query Redis for all user favorites and extract unique teams
    // For now, return empty array as placeholder
    return [];
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
    // This would query Redis for all user IDs
    // For now, return empty array as placeholder
    return [];
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
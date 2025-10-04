const express = require('express');
const router = express.Router();
const { getCachedData, setCachedData, generateCacheKey } = require('../services/cacheService');
const sportsDataService = require('../services/sportsDataService');
const deltaService = require('../services/deltaService');

/**
 * GET /api/favorites/teams/:userId
 * Get user's favorite teams with optimized data
 */
router.get('/teams/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { lastUpdate } = req.query;

    const cacheKey = generateCacheKey('user_favorites', userId);
    const cachedFavorites = await getCachedData(cacheKey);

    if (cachedFavorites) {
      // If client provides lastUpdate timestamp, return only changes
      if (lastUpdate) {
        const deltaResponse = deltaService.generateDelta(
          cachedFavorites, 
          new Date(lastUpdate)
        );
        return res.json(deltaResponse);
      }
      return res.json(cachedFavorites);
    }

    // If no cached data, return empty structure
    const emptyResponse = {
      teams: [],
      lastUpdate: new Date().toISOString(),
      hasChanges: false
    };

    res.json(emptyResponse);
  } catch (error) {
    console.error('Error fetching favorite teams:', error);
    res.status(500).json({ error: 'Failed to fetch favorite teams' });
  }
});

/**
 * POST /api/favorites/teams/:userId
 * Update user's favorite teams
 */
router.post('/teams/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { teams } = req.body;

    if (!Array.isArray(teams)) {
      return res.status(400).json({ error: 'Teams must be an array' });
    }

    const favoritesData = {
      userId,
      teams: teams.map(team => ({
        teamId: team.teamId,
        sport: team.sport,
        displayName: team.displayName,
        teamName: team.teamName,
        addedAt: team.addedAt || new Date().toISOString()
      })),
      lastUpdate: new Date().toISOString()
    };

    const cacheKey = generateCacheKey('user_favorites', userId);
    await setCachedData(cacheKey, favoritesData, 3600); // Cache for 1 hour

    // Trigger background fetch for these teams
    sportsDataService.scheduleTeamDataFetch(teams);

    res.json({ success: true, lastUpdate: favoritesData.lastUpdate });
  } catch (error) {
    console.error('Error updating favorite teams:', error);
    res.status(500).json({ error: 'Failed to update favorite teams' });
  }
});

/**
 * GET /api/favorites/games/:userId
 * Get optimized games data for user's favorite teams
 */
router.get('/games/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { lastUpdate, sports } = req.query;

    // Get user's favorite teams
    const favoritesCacheKey = generateCacheKey('user_favorites', userId);
    const favoritesData = await getCachedData(favoritesCacheKey);

    if (!favoritesData || !favoritesData.teams.length) {
      return res.json({
        games: [],
        lastUpdate: new Date().toISOString(),
        hasChanges: false
      });
    }

    // Filter by sports if specified
    let teamsToFetch = favoritesData.teams;
    if (sports) {
      const sportsArray = sports.split(',');
      teamsToFetch = favoritesData.teams.filter(team => 
        sportsArray.includes(team.sport.toLowerCase())
      );
    }

    // Get optimized games data
    const gamesData = await sportsDataService.getOptimizedGamesData(
      teamsToFetch,
      lastUpdate ? new Date(lastUpdate) : null
    );

    res.json(gamesData);
  } catch (error) {
    console.error('Error fetching favorite games:', error);
    res.status(500).json({ error: 'Failed to fetch favorite games' });
  }
});

/**
 * GET /api/favorites/summary/:userId
 * Get minimal summary data for quick overview
 */
router.get('/summary/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { lastUpdate } = req.query;

    const cacheKey = generateCacheKey('user_summary', userId);
    const cachedSummary = await getCachedData(cacheKey);

    if (cachedSummary) {
      // Return delta if lastUpdate provided
      if (lastUpdate) {
        const deltaResponse = deltaService.generateSummaryDelta(
          cachedSummary,
          new Date(lastUpdate)
        );
        return res.json(deltaResponse);
      }
      return res.json(cachedSummary);
    }

    // Generate fresh summary
    const summary = await sportsDataService.generateUserSummary(userId);
    await setCachedData(cacheKey, summary, 60); // Cache for 1 minute

    res.json(summary);
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

/**
 * DELETE /api/favorites/cache/:userId
 * Clear cache for a specific user (useful for debugging)
 */
router.delete('/cache/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const keys = [
      generateCacheKey('user_favorites', userId),
      generateCacheKey('user_summary', userId),
      generateCacheKey('user_games', userId)
    ];

    // Clear all user-related cache entries
    for (const key of keys) {
      await setCachedData(key, null, 0); // Set to null with 0 TTL to delete
    }

    res.json({ success: true, message: 'Cache cleared for user' });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

module.exports = router;
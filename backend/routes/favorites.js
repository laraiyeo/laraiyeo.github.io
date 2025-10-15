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
 * GET /api/favorites/:userId/delta
 * Get only changed data since last sync - optimized for minimal bandwidth
 */
router.get('/:userId/delta', async (req, res) => {
  try {
    const { userId } = req.params;
    const { lastSync, include } = req.query;

    if (!lastSync) {
      return res.status(400).json({ 
        error: 'lastSync timestamp is required for delta requests',
        example: '?lastSync=2025-10-04T15:00:00.000Z'
      });
    }

    // Get user's favorite teams
    const favoritesCacheKey = generateCacheKey('user_favorites', userId);
    const favoritesData = await getCachedData(favoritesCacheKey);

    if (!favoritesData || !favoritesData.teams.length) {
      return res.json({
        hasChanges: false,
        deltaType: 'none',
        lastSync,
        currentSync: new Date().toISOString(),
        message: 'No favorite teams configured'
      });
    }

    // Get optimized games data with delta computation
    const deltaResponse = await sportsDataService.getOptimizedGamesData(
      favoritesData.teams, 
      lastSync
    );

    // Include additional data types if requested
    const response = { ...deltaResponse };
    
    if (include && include.includes('summary')) {
      const summaryCacheKey = generateCacheKey('user_summary', userId);
      const summaryData = await getCachedData(summaryCacheKey);
      if (summaryData) {
        const summaryDelta = deltaService.generateSummaryDelta(summaryData, lastSync);
        response.summary = summaryDelta;
      }
    }

    // Track client sync state
    const syncStateCacheKey = generateCacheKey('user_sync_state', userId);
    const syncState = {
      userId,
      lastClientSync: lastSync,
      currentServerSync: response.metadata?.syncTime || new Date().toISOString(),
      syncCount: (await getCachedData(syncStateCacheKey))?.syncCount + 1 || 1,
      dataTypes: ['games'],
      clientInfo: {
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        timestamp: new Date().toISOString()
      }
    };

    if (include && include.includes('summary')) {
      syncState.dataTypes.push('summary');
    }

    await setCachedData(syncStateCacheKey, syncState, 86400); // Cache for 24 hours

    res.json(response);
  } catch (error) {
    console.error('Error processing delta request:', error);
    
    // Provide helpful error response
    res.status(500).json({ 
      error: 'Failed to process delta request',
      deltaType: 'error',
      lastSync: req.query.lastSync,
      currentSync: new Date().toISOString(),
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/favorites/:userId/sync
 * Update client sync state and get current server timestamp
 */
router.post('/:userId/sync', async (req, res) => {
  try {
    const { userId } = req.params;
    const { clientTimestamp, forceFullSync } = req.body;

    const currentServerTime = new Date().toISOString();
    
    if (forceFullSync) {
      // Clear cached snapshots to force full data on next request
      const keys = [
        generateCacheKey('games_snapshot', '*'),
        generateCacheKey('user_summary', userId)
      ];
      
      for (const keyPattern of keys) {
        if (keyPattern.includes('*')) {
          // In a real implementation, you'd use Redis SCAN to find and delete matching keys
          console.log(`Would clear cache keys matching: ${keyPattern}`);
        } else {
          await setCachedData(keyPattern, null, 0);
        }
      }
    }

    // Update sync state
    const syncStateCacheKey = generateCacheKey('user_sync_state', userId);
    const syncState = {
      userId,
      lastClientSync: clientTimestamp,
      currentServerSync: currentServerTime,
      syncCount: (await getCachedData(syncStateCacheKey))?.syncCount + 1 || 1,
      forceFullSync: forceFullSync || false,
      clientInfo: {
        userAgent: req.get('User-Agent'),  
        ip: req.ip,
        timestamp: currentServerTime
      }
    };

    await setCachedData(syncStateCacheKey, syncState, 86400);

    res.json({
      success: true,
      serverTimestamp: currentServerTime,
      clientTimestamp,
      syncState: {
        syncCount: syncState.syncCount,
        nextSyncRecommendedIn: 30, // seconds
        deltaEndpoint: `/api/favorites/${userId}/delta?lastSync=${currentServerTime}`
      }
    });
  } catch (error) {
    console.error('Error updating sync state:', error);
    res.status(500).json({ error: 'Failed to update sync state' });
  }
});

/**
 * GET /api/favorites/:userId/sync-status
 * Get current sync status and recommendations
 */
router.get('/:userId/sync-status', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const syncStateCacheKey = generateCacheKey('user_sync_state', userId);
    const syncState = await getCachedData(syncStateCacheKey);
    
    const favoritesCacheKey = generateCacheKey('user_favorites', userId);
    const favoritesData = await getCachedData(favoritesCacheKey);
    
    const currentTime = new Date().toISOString();
    const response = {
      userId,
      currentServerTime: currentTime,
      hasFavorites: !!(favoritesData && favoritesData.teams.length > 0),
      totalFavoriteTeams: favoritesData?.teams.length || 0
    };

    if (syncState) {
      const lastSyncAge = syncState.lastClientSync 
        ? (Date.now() - new Date(syncState.lastClientSync).getTime()) / 1000 
        : null;
        
      response.syncState = {
        lastClientSync: syncState.lastClientSync,
        lastServerSync: syncState.currentServerSync,
        syncCount: syncState.syncCount,
        lastSyncAgeSeconds: lastSyncAge,
        recommendsFullSync: !syncState.lastClientSync || lastSyncAge > 3600, // 1 hour
        dataTypes: syncState.dataTypes || ['games']
      };
    } else {
      response.syncState = {
        lastClientSync: null,
        lastServerSync: null,
        syncCount: 0,
        lastSyncAgeSeconds: null,
        recommendsFullSync: true,
        dataTypes: []
      };
    }

    // Add helpful endpoints
    response.endpoints = {
      delta: `/api/favorites/${userId}/delta?lastSync=${response.syncState.lastServerSync || currentTime}`,
      games: `/api/favorites/games/${userId}`,
      summary: `/api/favorites/summary/${userId}`,
      sync: `/api/favorites/${userId}/sync`
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
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
      generateCacheKey('user_games', userId),
      generateCacheKey('user_sync_state', userId),
      generateCacheKey('games_snapshot', '*') // Would need pattern matching in real Redis
    ];

    // Clear all user-related cache entries
    for (const key of keys) {
      if (key.includes('*')) {
        console.log(`Would clear cache keys matching pattern: ${key}`);
      } else {
        await setCachedData(key, null, 0); // Set to null with 0 TTL to delete
      }
    }

    res.json({ success: true, message: 'Cache cleared for user' });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

module.exports = router;
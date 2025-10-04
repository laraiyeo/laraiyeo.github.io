const express = require('express');
const router = express.Router();
const sportsDataService = require('../services/sportsDataService');
const deltaService = require('../services/deltaService');
const cacheService = require('../services/cacheService');

// GET /api/sports/:sport/games - Get games with delta support
router.get('/:sport/games', async (req, res) => {
  try {
    const { sport } = req.params;
    const { lastSync, startDate, endDate } = req.query;
    
    // Validate sport
    const validSports = ['mlb', 'nba', 'nfl', 'nhl', 'f1', 'soccer'];
    if (!validSports.includes(sport.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid sport. Supported: ' + validSports.join(', ') });
    }

    console.log(`[Sports API] ${sport.toUpperCase()} games request:`, { lastSync, startDate, endDate });

    // Get current games data
    const currentData = await sportsDataService.getOptimizedGamesData(sport, { startDate, endDate });
    
    if (!lastSync) {
      // No lastSync provided, return full data
      return res.json({
        hasChanges: true,
        deltaType: 'full',
        lastSync: null,
        currentSync: new Date().toISOString(),
        data: currentData,
        message: 'Full data provided'
      });
    }

    // Get cached previous data for delta comparison
    const cacheKey = `${sport}_games_${startDate || 'today'}_${endDate || startDate || 'today'}`;
    const previousData = await cacheService.getCachedData(`delta_${cacheKey}`);

    if (!previousData) {
      // No previous data found, return full data
      await cacheService.setCachedData(`delta_${cacheKey}`, currentData, 300); // Cache for 5 minutes
      return res.json({
        hasChanges: true,
        deltaType: 'full',
        lastSync,
        currentSync: new Date().toISOString(),
        data: currentData,
        message: 'No previous data found, returning full data'
      });
    }

    // Generate delta
    const delta = deltaService.generateGamesDelta(currentData.events || currentData, lastSync, previousData.events || previousData);
    
    // Cache current data for next delta comparison
    await cacheService.setCachedData(`delta_${cacheKey}`, currentData, 300);

    if (!delta.hasChanges) {
      return res.json({
        hasChanges: false,
        deltaType: 'none',
        lastSync,
        currentSync: new Date().toISOString(),
        message: 'No changes detected'
      });
    }

    res.json({
      hasChanges: true,
      deltaType: 'partial',
      lastSync,
      currentSync: new Date().toISOString(),
      data: {
        events: delta.games || [],
        lastUpdate: delta.lastUpdate || new Date().toISOString()
      },
      changes: delta.changes,
      summary: delta.changesSummary
    });

  } catch (error) {
    console.error(`[Sports API] Error fetching ${req.params.sport} games:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch games data',
      message: error.message 
    });
  }
});

// GET /api/sports/:sport/standings - Get standings with delta support
router.get('/:sport/standings', async (req, res) => {
  try {
    const { sport } = req.params;
    const { lastSync } = req.query;
    
    // Validate sport  
    const validSports = ['mlb', 'nba', 'nfl', 'nhl'];
    if (!validSports.includes(sport.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid sport for standings. Supported: ' + validSports.join(', ') });
    }

    console.log(`[Sports API] ${sport.toUpperCase()} standings request with lastSync:`, lastSync);

    // Get current standings data
    const currentData = await sportsDataService.getStandings(sport);
    
    if (!lastSync) {
      // No lastSync provided, return full data
      return res.json({
        hasChanges: true,
        deltaType: 'full',
        lastSync: null,
        currentSync: new Date().toISOString(),
        data: currentData,
        message: 'Full standings data provided'
      });
    }

    // Get cached previous data for delta comparison
    const cacheKey = `${sport}_standings`;
    const previousData = await cacheService.getCachedData(`delta_${cacheKey}`);

    if (!previousData) {
      // No previous data found, return full data
      await cacheService.setCachedData(`delta_${cacheKey}`, currentData, 600); // Cache for 10 minutes
      return res.json({
        hasChanges: true,
        deltaType: 'full',
        lastSync,
        currentSync: new Date().toISOString(),
        data: currentData,
        message: 'No previous standings data found, returning full data'
      });
    }

    // Generate delta for standings
    const delta = deltaService.generateStandingsDelta(previousData, currentData);
    
    // Cache current data for next delta comparison
    await cacheService.setCachedData(`delta_${cacheKey}`, currentData, 600);

    if (!delta.hasChanges) {
      return res.json({
        hasChanges: false,
        deltaType: 'none',
        lastSync,
        currentSync: new Date().toISOString(),
        message: 'No standings changes detected'
      });
    }

    res.json({
      hasChanges: true,
      deltaType: 'partial',
      lastSync,
      currentSync: new Date().toISOString(),
      data: delta.changes,
      summary: delta.summary
    });

  } catch (error) {
    console.error(`[Sports API] Error fetching ${req.params.sport} standings:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch standings data',
      message: error.message 
    });
  }
});

// GET /api/sports/:sport/teams/:teamId - Get team details
router.get('/:sport/teams/:teamId', async (req, res) => {
  try {
    const { sport, teamId } = req.params;
    const { lastSync } = req.query;
    
    console.log(`[Sports API] ${sport.toUpperCase()} team ${teamId} request with lastSync:`, lastSync);

    // Get current team data
    const currentData = await sportsDataService.getTeamData(sport, teamId);
    
    if (!lastSync) {
      // No lastSync provided, return full data
      return res.json({
        hasChanges: true,
        deltaType: 'full',
        lastSync: null,
        currentSync: new Date().toISOString(),
        data: currentData,
        message: 'Full team data provided'
      });
    }

    // For team data, we can implement similar delta logic if needed
    // For now, return full data since team info changes less frequently
    res.json({
      hasChanges: true,
      deltaType: 'full',
      lastSync,
      currentSync: new Date().toISOString(),
      data: currentData,
      message: 'Team data (full refresh for now)'
    });

  } catch (error) {
    console.error(`[Sports API] Error fetching ${req.params.sport} team ${req.params.teamId}:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch team data',
      message: error.message 
    });
  }
});

module.exports = router;
/**
 * Delta Service - Handles change detection and delta responses
 * to minimize data transfer between backend and mobile app
 */

/**
 * Generate a delta response comparing current data with client's last update
 */
function generateDelta(currentData, lastUpdateDate) {
  const now = new Date();
  const lastUpdate = new Date(lastUpdateDate);

  // If no last update or invalid date, return full data
  if (!lastUpdateDate || isNaN(lastUpdate.getTime())) {
    return {
      ...currentData,
      hasChanges: true,
      deltaType: 'full',
      lastUpdate: now.toISOString()
    };
  }

  // Check if current data is newer than client's last update
  const currentDataTime = new Date(currentData.lastUpdate || now);
  if (currentDataTime <= lastUpdate) {
    return {
      hasChanges: false,
      deltaType: 'none',
      lastUpdate: currentDataTime.toISOString()
    };
  }

  // Return delta with only changed fields
  return {
    ...currentData,
    hasChanges: true,
    deltaType: 'partial',
    lastUpdate: now.toISOString()
  };
}

/**
 * Generate game delta by comparing game states
 */
function generateGamesDelta(currentGames, lastUpdateDate, previousGames = null) {
  const now = new Date();
  const lastUpdate = new Date(lastUpdateDate);

  if (!lastUpdateDate || isNaN(lastUpdate.getTime()) || !previousGames) {
    return {
      games: currentGames,
      hasChanges: true,
      deltaType: 'full',
      lastUpdate: now.toISOString(),
      changesSummary: {
        added: currentGames.length,
        updated: 0,
        removed: 0
      }
    };
  }

  const changes = {
    added: [],
    updated: [],
    removed: [],
    unchanged: []
  };

  // Create maps for efficient lookup
  const currentMap = new Map(currentGames.map(game => [game.id || game.gameId, game]));
  const previousMap = new Map(previousGames.map(game => [game.id || game.gameId, game]));

  // Find added and updated games
  for (const [gameId, currentGame] of currentMap) {
    const previousGame = previousMap.get(gameId);
    
    if (!previousGame) {
      // New game
      changes.added.push(currentGame);
    } else if (hasGameChanged(currentGame, previousGame)) {
      // Game state changed
      changes.updated.push({
        id: gameId,
        changes: getGameChanges(currentGame, previousGame),
        game: currentGame
      });
    } else {
      changes.unchanged.push(gameId);
    }
  }

  // Find removed games
  for (const [gameId, previousGame] of previousMap) {
    if (!currentMap.has(gameId)) {
      changes.removed.push({
        id: gameId,
        game: previousGame
      });
    }
  }

  const hasChanges = changes.added.length > 0 || changes.updated.length > 0 || changes.removed.length > 0;

  if (!hasChanges) {
    return {
      hasChanges: false,
      deltaType: 'none',
      lastUpdate: now.toISOString(),
      changesSummary: {
        added: 0,
        updated: 0,
        removed: 0
      }
    };
  }

  return {
    hasChanges: true,
    deltaType: 'delta',
    lastUpdate: now.toISOString(),
    changes,
    changesSummary: {
      added: changes.added.length,
      updated: changes.updated.length,
      removed: changes.removed.length
    },
    // Include minimal data for efficiency
    games: changes.added.concat(changes.updated.map(u => u.game))
  };
}

/**
 * Check if a game has changed between two states
 */
function hasGameChanged(currentGame, previousGame) {
  // Key fields that indicate game state changes
  const keyFields = [
    'status',
    'period',
    'clock',
    'homeScore',
    'awayScore',
    'lastPlay',
    'gameState',
    'inProgress',
    'completed'
  ];

  for (const field of keyFields) {
    if (getNestedValue(currentGame, field) !== getNestedValue(previousGame, field)) {
      return true;
    }
  }

  // Check nested score objects
  if (currentGame.homeTeam?.score !== previousGame.homeTeam?.score ||
      currentGame.awayTeam?.score !== previousGame.awayTeam?.score) {
    return true;
  }

  return false;
}

/**
 * Get specific changes between two game objects
 */
function getGameChanges(currentGame, previousGame) {
  const changes = {};
  
  const fieldsToCheck = [
    'status', 'period', 'clock', 'homeScore', 'awayScore', 
    'lastPlay', 'gameState', 'inProgress', 'completed'
  ];

  for (const field of fieldsToCheck) {
    const currentValue = getNestedValue(currentGame, field);
    const previousValue = getNestedValue(previousGame, field);
    
    if (currentValue !== previousValue) {
      changes[field] = {
        from: previousValue,
        to: currentValue
      };
    }
  }

  // Check nested team scores
  if (currentGame.homeTeam?.score !== previousGame.homeTeam?.score) {
    changes.homeScore = {
      from: previousGame.homeTeam?.score,
      to: currentGame.homeTeam?.score
    };
  }

  if (currentGame.awayTeam?.score !== previousGame.awayTeam?.score) {
    changes.awayScore = {
      from: previousGame.awayTeam?.score,
      to: currentGame.awayTeam?.score
    };
  }

  return changes;
}

/**
 * Generate summary delta for quick overview updates
 */
function generateSummaryDelta(currentSummary, lastUpdateDate) {
  const now = new Date();
  const lastUpdate = new Date(lastUpdateDate);

  if (!lastUpdateDate || isNaN(lastUpdate.getTime())) {
    return {
      ...currentSummary,
      hasChanges: true,
      deltaType: 'full',
      lastUpdate: now.toISOString()
    };
  }

  const currentSummaryTime = new Date(currentSummary.lastUpdate || now);
  if (currentSummaryTime <= lastUpdate) {
    return {
      hasChanges: false,
      deltaType: 'none',
      lastUpdate: currentSummaryTime.toISOString()
    };
  }

  // For summary, we typically return the full data as it's already minimal
  return {
    ...currentSummary,
    hasChanges: true,
    deltaType: 'partial',
    lastUpdate: now.toISOString()
  };
}

/**
 * Helper function to get nested object values safely
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => 
    current && current[key] !== undefined ? current[key] : undefined, obj
  );
}

/**
 * Optimize data payload by removing unnecessary fields
 */
function optimizePayload(data, fields = null) {
  if (!data) return data;

  if (Array.isArray(data)) {
    return data.map(item => optimizePayload(item, fields));
  }

  if (typeof data !== 'object') {
    return data;
  }

  // If no specific fields specified, use default optimization
  if (!fields) {
    const optimized = { ...data };
    
    // Remove common heavy fields that mobile app doesn't need
    delete optimized.fullRoster;
    delete optimized.detailedStats;
    delete optimized.playByPlay;
    delete optimized.boxScore;
    delete optimized.seasonStats;
    
    return optimized;
  }

  // Return only specified fields
  const optimized = {};
  for (const field of fields) {
    if (data[field] !== undefined) {
      optimized[field] = data[field];
    }
  }

  return optimized;
}

module.exports = {
  generateDelta,
  generateGamesDelta,
  generateSummaryDelta,
  hasGameChanged,
  getGameChanges,
  optimizePayload
};
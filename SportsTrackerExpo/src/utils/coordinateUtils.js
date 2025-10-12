import { getMapConfig, getMapConfigByUuid, getMapConfigByName } from './valorantMaps';

/**
 * Converts API coordinates to screen positions for player positioning on Valorant maps
 * Uses normalization approach based on coordinate bounds analysis
 * 
 * @param {Object} position - The position object from API with x and y coordinates
 * @param {Object} mapInfo - Map configuration object (not used in normalization but kept for compatibility)
 * @param {number} mapSize - The size of the map container (default 720px like rib.gg)
 * @param {Object} coordinateBounds - The bounds of coordinates for normalization {minX, maxX, minY, maxY}
 * @returns {Object} Screen coordinates {x, y} or {x: 0, y: 0} if invalid
 */
export const getMapPosition = (position, mapInfo, mapSize = 720, coordinateBounds = null) => {
  // Validation: Check if position exists and has valid coordinates
  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
    return { x: 0, y: 0 };
  }

  // If coordinate bounds are provided, use normalization approach
  if (coordinateBounds && 
      typeof coordinateBounds.minX === 'number' && 
      typeof coordinateBounds.maxX === 'number' &&
      typeof coordinateBounds.minY === 'number' && 
      typeof coordinateBounds.maxY === 'number') {
    
    // Normalize coordinates to 0-1 range based on actual bounds
    const normalizedX = (position.x - coordinateBounds.minX) / (coordinateBounds.maxX - coordinateBounds.minX);
    const normalizedY = (position.y - coordinateBounds.minY) / (coordinateBounds.maxY - coordinateBounds.minY);
    
    // Scale to screen size
    const screenX = normalizedX * mapSize;
    const screenY = normalizedY * mapSize;
    
    return {
      x: screenX,
      y: screenY
    };
  }

  // Fallback to original rib.gg formula if no bounds provided
  if (!mapInfo || typeof mapInfo.xMultiplier !== 'number' || typeof mapInfo.yMultiplier !== 'number') {
    return { x: 0, y: 0 };
  }

  // Transform coordinates using the original rib.gg formula
  // Note: X and Y are swapped in the transformation
  const screenX = position.y * mapInfo.xMultiplier * mapSize;
  const screenY = position.x * mapInfo.yMultiplier * mapSize;

  return {
    x: screenX,
    y: screenY
  };
};

/**
 * Get map configuration for a given map URL
 * @param {string} mapUrl - The map URL from the API
 * @returns {Object|null} Map configuration or null if not found
 */
export const getMapConfiguration = (mapUrl) => {
  return getMapConfig(mapUrl);
};

/**
 * Get map configuration for a given map UUID
 * @param {string} uuid - The map UUID
 * @returns {Object|null} Map configuration or null if not found
 */
export const getMapConfigurationByUuid = (uuid) => {
  return getMapConfigByUuid(uuid);
};

/**
 * Get map configuration for a given map display name
 * @param {string} displayName - The map display name (e.g., "Lotus", "Haven", etc.)
 * @returns {Object|null} Map configuration or null if not found
 */
export const getMapConfigurationByName = (displayName) => {
  return getMapConfigByName(displayName);
};

/**
 * Filters location data for a specific round and time, showing only alive players
 * @param {Array} locations - Array of location objects from API
 * @param {number} roundNumber - The round number to filter by
 * @param {number} timeMillis - The time in milliseconds to filter by (optional)
 * @param {Array} events - Array of event objects for checking player deaths (optional)
 * @returns {Array} Filtered location data
 */
export const getLocationsForRound = (locations, roundNumber, timeMillis = null, events = null) => {
  if (!locations || !Array.isArray(locations)) {
    return [];
  }

  let filtered = locations.filter(location => location.roundNumber === roundNumber);

  // If specific time is provided, return ONLY coordinates that exist at that exact time
  if (timeMillis !== null) {
    // SPECIAL CASE: If time is exactly 0, return empty array (no players at 0s)
    if (timeMillis === 0) {
      return [];
    }
    
    // Find the exact time that matches or the closest available time
    const availableTimes = [...new Set(filtered.map(loc => loc.roundTimeMillis))].sort((a, b) => a - b);
    
    // Find the closest available time to the requested time
    let targetTime = null;
    let minDifference = Infinity;
    
    for (const time of availableTimes) {
      const difference = Math.abs(time - timeMillis);
      if (difference < minDifference) {
        minDifference = difference;
        targetTime = time;
      }
    }
    
    // If no available times, return empty array
    if (targetTime === null) {
      return [];
    }
    
    // Return ONLY the coordinates that exist at this exact target time
    filtered = filtered.filter(location => location.roundTimeMillis === targetTime);

    // Add alive/dead status to each player if events data is available
    if (events && Array.isArray(events)) {
      filtered = filtered.map(location => ({
        ...location,
        isAlive: isPlayerAliveAtTime(events, location.playerId, roundNumber, location.roundTimeMillis || targetTime)
      }));
    } else {
      // Default to alive if no events data
      filtered = filtered.map(location => ({
        ...location,
        isAlive: true
      }));
    }
  }

  return filtered;
};

/**
 * Get all available time points for a specific round
 * @param {Array} locations - Array of location objects from API
 * @param {number} roundNumber - The round number
 * @returns {Array} Sorted array of unique time points in milliseconds
 */
export const getTimePointsForRound = (locations, roundNumber) => {
  if (!locations || !Array.isArray(locations)) {
    return [];
  }

  const timePoints = new Set();
  
  locations
    .filter(location => location.roundNumber === roundNumber)
    .forEach(location => timePoints.add(location.roundTimeMillis));

  return Array.from(timePoints).sort((a, b) => a - b);
};

/**
 * Convert milliseconds to human-readable time format (MM:SS)
 * @param {number} milliseconds - Time in milliseconds
 * @returns {string} Formatted time string
 */
export const formatRoundTime = (milliseconds) => {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

/**
 * Get the bounds of all player positions for a map (useful for debugging)
 * @param {Array} locations - Array of location objects
 * @returns {Object} Bounds object with min/max x/y values
 */
export const getPositionBounds = (locations) => {
  if (!locations || !Array.isArray(locations) || locations.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  locations.forEach(location => {
    if (typeof location.locationX === 'number' && typeof location.locationY === 'number') {
      minX = Math.min(minX, location.locationX);
      maxX = Math.max(maxX, location.locationX);
      minY = Math.min(minY, location.locationY);
      maxY = Math.max(maxY, location.locationY);
    }
  });

  return { minX, maxX, minY, maxY };
};

/**
 * Check if a player is alive at a specific time by examining kill events
 * @param {Array} events - Array of event objects from match data
 * @param {number} playerId - The player ID to check
 * @param {number} roundNumber - The round number
 * @param {number} timeMillis - The time in milliseconds to check
 * @returns {boolean} True if player is alive, false if dead
 */
export const isPlayerAliveAtTime = (events, playerId, roundNumber, timeMillis) => {
  if (!events || !Array.isArray(events)) {
    return true; // Assume alive if no event data
  }

  // Find all kill events in the specified round where this player was killed
  const killEvents = events.filter(event => 
    event.roundNumber === roundNumber &&
    event.eventType === 'kill' &&
    event.referencePlayerId === playerId && // referencePlayerId is the victim
    event.roundTimeMillis <= timeMillis
  );

  const isAlive = killEvents.length === 0;

  // If there are any kill events for this player at or before the specified time, they're dead
  return isAlive;
};
const redis = require('redis');

let redisClient = null;

/**
 * Initialize Redis connection
 */
async function initializeRedis() {
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    redisClient.on('error', (err) => {
      console.error('Redis error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis connected');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('Failed to initialize Redis:', error);
    throw error;
  }
}

/**
 * Generate cache key with prefix
 */
function generateCacheKey(type, identifier, ...args) {
  const prefix = 'sports_tracker';
  const parts = [prefix, type, identifier, ...args].filter(Boolean);
  return parts.join(':');
}

/**
 * Get cached data from Redis
 */
async function getCachedData(key) {
  try {
    if (!redisClient) {
      console.warn('Redis client not initialized');
      return null;
    }

    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting cached data:', error);
    return null;
  }
}

/**
 * Set cached data in Redis with TTL
 */
async function setCachedData(key, data, ttlSeconds = 300) {
  try {
    if (!redisClient) {
      console.warn('Redis client not initialized');
      return false;
    }

    if (data === null || ttlSeconds === 0) {
      // Delete the key
      await redisClient.del(key);
      return true;
    }

    const serializedData = JSON.stringify(data);
    await redisClient.setEx(key, ttlSeconds, serializedData);
    return true;
  } catch (error) {
    console.error('Error setting cached data:', error);
    return false;
  }
}

/**
 * Get multiple cached keys at once
 */
async function getMultipleCachedData(keys) {
  try {
    if (!redisClient || !keys.length) {
      return {};
    }

    const pipeline = redisClient.multi();
    keys.forEach(key => pipeline.get(key));
    const results = await pipeline.exec();

    const data = {};
    keys.forEach((key, index) => {
      const result = results[index];
      data[key] = result ? JSON.parse(result) : null;
    });

    return data;
  } catch (error) {
    console.error('Error getting multiple cached data:', error);
    return {};
  }
}

/**
 * Delete keys matching a pattern
 */
async function deleteCachePattern(pattern) {
  try {
    if (!redisClient) {
      return 0;
    }

    const keys = await redisClient.keys(pattern);
    if (keys.length === 0) {
      return 0;
    }

    const deletedCount = await redisClient.del(keys);
    return deletedCount;
  } catch (error) {
    console.error('Error deleting cache pattern:', error);
    return 0;
  }
}

/**
 * Check if Redis is connected and healthy
 */
async function isRedisHealthy() {
  try {
    if (!redisClient) {
      return false;
    }

    const pong = await redisClient.ping();
    return pong === 'PONG';
  } catch (error) {
    return false;
  }
}

/**
 * Close Redis connection
 */
async function closeRedis() {
  try {
    if (redisClient) {
      await redisClient.disconnect();
      redisClient = null;
    }
  } catch (error) {
    console.error('Error closing Redis connection:', error);
  }
}

module.exports = {
  initializeRedis,
  generateCacheKey,
  getCachedData,
  setCachedData,
  getMultipleCachedData,
  deleteCachePattern,
  isRedisHealthy,
  closeRedis,
  getClient: () => redisClient
};
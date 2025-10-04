const redis = require('redis');

let redisClient = null;

/**
 * Initialize Redis connection
 */
async function initializeRedis() {
  try {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      console.warn('REDIS_URL not set; skipping Redis initialization (will run without cache)');
      return null;
    }

    redisClient = redis.createClient({
      url: redisUrl,
      // Provide a small reconnect strategy backoff to avoid very aggressive reconnects
      socket: {
        reconnectStrategy: (retries) => {
          // Exponential backoff capped at 2000ms
          return Math.min(50 * Math.pow(2, retries), 2000);
        }
      }
    });

    // Throttle repeated error logs to avoid terminal spam when Redis is unreachable
    let errorLogged = false;
    redisClient.on('error', (err) => {
      if (!errorLogged) {
        console.error('Redis error:', err);
        errorLogged = true;
        setTimeout(() => { errorLogged = false; }, 60 * 1000); // reset throttle after 60s
      }
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
// Base Cache Service - AsyncStorage-based persistent caching for all sports services
// Provides browser-equivalent or better caching performance for React Native

import AsyncStorage from '@react-native-async-storage/async-storage';

export class BaseCacheService {
  // Cache configuration
  static CACHE_DURATION_LIVE = 2000; // 2 seconds for live games/matches
  static CACHE_DURATION_SCHEDULED = 10000; // 10 seconds for scheduled events
  static CACHE_DURATION_FINISHED = 30000; // 30 seconds for completed events
  static CACHE_DURATION_STATIC = 300000; // 5 minutes for standings, stats, etc.
  
  // Fallback in-memory cache for AsyncStorage failures
  static memoryCache = new Map();
  static memoryCacheTimestamps = new Map();

  /**
   * Get cached data with AsyncStorage persistence
   * @param {string} key - Cache key
   * @param {Function} fetchFunction - Function to fetch fresh data
   * @param {boolean} isLiveData - Whether data contains live events
   * @param {string} dataType - Type of data ('live', 'scheduled', 'finished', 'static')
   * @returns {Promise} - Cached or fresh data
   */
  static async getCachedData(key, fetchFunction, isLiveData = false, dataType = 'scheduled') {
    const now = Date.now();
    const cacheKey = `sports_cache_${key}`;
    
    // Determine cache duration based on data type
    let cacheDuration;
    switch (dataType) {
      case 'live':
        cacheDuration = this.CACHE_DURATION_LIVE;
        break;
      case 'scheduled':
        cacheDuration = this.CACHE_DURATION_SCHEDULED;
        break;
      case 'finished':
        cacheDuration = this.CACHE_DURATION_FINISHED;
        break;
      case 'static':
        cacheDuration = this.CACHE_DURATION_STATIC;
        break;
      default:
        cacheDuration = isLiveData ? this.CACHE_DURATION_LIVE : this.CACHE_DURATION_SCHEDULED;
    }
    
    try {
      // 1️⃣ Try to read from AsyncStorage
      const cachedItem = await AsyncStorage.getItem(cacheKey);
      if (cachedItem) {
        const { data, timestamp } = JSON.parse(cachedItem);
        const age = (now - timestamp) / 1000;
        const isFresh = (now - timestamp) < cacheDuration;

        if (isFresh) {
          console.log(
            `%c[Cache HIT] %c${key} %c(${age.toFixed(1)}s old)${this.getCacheTypeLabel(dataType, isLiveData)}`,
            'color: limegreen; font-weight: bold;',
            'color: white;',
            'color: gray;'
          );
          return data;
        } else {
          console.log(
            `%c[Cache STALE] %c${key} %c(${age.toFixed(1)}s old — refreshing...)${this.getCacheTypeLabel(dataType, isLiveData)}`,
            'color: orange; font-weight: bold;',
            'color: white;',
            'color: gray;'
          );
        }
      }

      // 2️⃣ Fetch from network if not cached or stale
      console.log(
        `%c[Network Fetch] %c${key} %c(network request)${this.getCacheTypeLabel(dataType, isLiveData)}`,
        'color: cyan; font-weight: bold;',
        'color: white;',
        'color: gray;'
      );

      const data = await fetchFunction();
      
      // Save to AsyncStorage
      await AsyncStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: now }));
      
      // Also save to memory cache as backup
      this.memoryCache.set(key, data);
      this.memoryCacheTimestamps.set(key, now);

      return data;
    } catch (err) {
      console.warn('⚠️ AsyncStorage cache failed:', err);

      // 3️⃣ Fallback to in-memory cache
      if (this.memoryCache.has(key)) {
        const timestamp = this.memoryCacheTimestamps.get(key) || 0;
        const age = (now - timestamp) / 1000;
        
        if ((now - timestamp) < cacheDuration) {
          console.log(
            `%c[Memory Fallback HIT] %c${key} %c(${age.toFixed(1)}s old)`,
            'color: yellow; font-weight: bold;',
            'color: white;',
            'color: gray;'
          );
          return this.memoryCache.get(key);
        }
      }

      // 4️⃣ Last resort: fetch from network without caching
      console.log(
        `%c[Network Fallback] %c${key} %c(no cache available)`,
        'color: red; font-weight: bold;',
        'color: white;',
        'color: gray;'
      );
      
      const data = await fetchFunction();
      
      // Try to save to memory cache at least
      try {
        this.memoryCache.set(key, data);
        this.memoryCacheTimestamps.set(key, now);
      } catch (memErr) {
        console.warn('Memory cache also failed:', memErr);
      }
      
      return data;
    }
  }

  /**
   * Get cache type label for logging
   */
  static getCacheTypeLabel(dataType, isLiveData) {
    if (dataType === 'live' || isLiveData) return ' [LIVE]';
    if (dataType === 'static') return ' [STATIC]';
    if (dataType === 'finished') return ' [FINISHED]';
    return ' [SCHEDULED]';
  }

  /**
   * Clear cache for a specific key or all cache
   */
  static async clearCache(key = null) {
    try {
      if (key) {
        await AsyncStorage.removeItem(`sports_cache_${key}`);
        this.memoryCache.delete(key);
        this.memoryCacheTimestamps.delete(key);
        console.log(`✅ Cleared cache for: ${key}`);
      } else {
        // Clear all sports cache
        const keys = await AsyncStorage.getAllKeys();
        const sportsCacheKeys = keys.filter(k => k.startsWith('sports_cache_'));
        await AsyncStorage.multiRemove(sportsCacheKeys);
        this.memoryCache.clear();
        this.memoryCacheTimestamps.clear();
        console.log(`✅ Cleared all sports cache (${sportsCacheKeys.length} items)`);
      }
    } catch (err) {
      console.warn('⚠️ Cache clear failed:', err);
    }
  }

  /**
   * Get cache statistics
   */
  static async getCacheStats() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const sportsCacheKeys = keys.filter(k => k.startsWith('sports_cache_'));
      
      return {
        asyncStorageItems: sportsCacheKeys.length,
        memoryItems: this.memoryCache.size,
        cacheKeys: sportsCacheKeys
      };
    } catch (err) {
      console.warn('⚠️ Cache stats failed:', err);
      return {
        asyncStorageItems: 0,
        memoryItems: this.memoryCache.size,
        cacheKeys: []
      };
    }
  }

  /**
   * Check if data contains live events (to be overridden by specific services)
   */
  static hasLiveEvents(data) {
    if (!data || !data.events) return false;
    return data.events.some(event => event.isLive);
  }

  /**
   * Determine data type based on content (to be overridden by specific services)
   */
  static getDataType(data) {
    if (!data || !data.events) return 'static';
    
    const hasLive = data.events.some(event => event.isLive);
    if (hasLive) return 'live';
    
    const hasScheduled = data.events.some(event => !event.isCompleted && !event.isLive);
    if (hasScheduled) return 'scheduled';
    
    return 'finished';
  }

  /**
   * Get browser-like headers for compression (for fetch requests)
   */
  static getBrowserHeaders() {
    return {
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
  }
}
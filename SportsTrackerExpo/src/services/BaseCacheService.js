// Base Cache Service - AsyncStorage-based persistent caching for all sports services
// Provides browser-equivalent or better caching performance for React Native

import AsyncStorage from "@react-native-async-storage/async-storage";

export class BaseCacheService {
  // Cache configuration
  static CACHE_DURATION_LIVE = 2000; // 2 seconds for live games/matches
  static CACHE_DURATION_SCHEDULED = 10000; // 10 seconds for scheduled events
  static CACHE_DURATION_FINISHED = 30000; // 30 seconds for completed events
  static CACHE_DURATION_STATIC = 300000; // 5 minutes for standings, stats, etc.

  // Fallback in-memory cache for AsyncStorage failures
  static memoryCache = new Map();
  static memoryCacheTimestamps = new Map();
  // Track in-flight fetch promises to coalesce concurrent requests
  static inFlightFetches = new Map();
  // Track whether AsyncStorage should be used (disable after persistent failures)
  static asyncStorageAvailable = true;

  /**
   * Get cached data with AsyncStorage persistence
   * @param {string} key - Cache key
   * @param {Function} fetchFunction - Function to fetch fresh data
   * @param {boolean} isLiveData - Whether data contains live events
   * @param {string} dataType - Type of data ('live', 'scheduled', 'finished', 'static')
   * @returns {Promise} - Cached or fresh data
   */
  static async getCachedData(
    key,
    fetchFunction,
    isLiveData = false,
    dataType = "scheduled"
  ) {
    const now = Date.now();
    const cacheKey = `sports_cache_${key}`;

    // Determine cache duration based on data type
    let cacheDuration;
    switch (dataType) {
      case "live":
        cacheDuration = this.CACHE_DURATION_LIVE;
        break;
      case "scheduled":
        cacheDuration = this.CACHE_DURATION_SCHEDULED;
        break;
      case "finished":
        cacheDuration = this.CACHE_DURATION_FINISHED;
        break;
      case "static":
        cacheDuration = this.CACHE_DURATION_STATIC;
        break;
      default:
        cacheDuration = isLiveData
          ? this.CACHE_DURATION_LIVE
          : this.CACHE_DURATION_SCHEDULED;
    }

    let data = null;
    let fetchedFromNetwork = false;

    try {
      // If AsyncStorage is currently marked unavailable, skip AsyncStorage ops
      if (this.asyncStorageAvailable) {
        // Debug: show how many AsyncStorage items exist (quick sanity)
        try {
          const _keys = await AsyncStorage.getAllKeys();
          console.log(
            `[Cache] asyncStorage keys count: ${_keys ? _keys.length : 0}`
          );
        } catch (kErr) {
          console.warn("[Cache] getAllKeys failed", kErr);
          // If getAllKeys fails repeatedly, mark AsyncStorage as unavailable
          this.asyncStorageAvailable = false;
        }

        // 1️⃣ Try to read from AsyncStorage
        let cachedItem = null;
        try {
          cachedItem = await AsyncStorage.getItem(cacheKey);
          console.log(
            `[Cache] read ${cacheKey}:`,
            cachedItem ? "FOUND" : "MISS"
          );
        } catch (rErr) {
          console.warn(
            "[Cache] AsyncStorage.getItem failed for",
            cacheKey,
            rErr
          );
          this.asyncStorageAvailable = false;
        }

        if (cachedItem) {
          let parsed = null;
          try {
            parsed = JSON.parse(cachedItem);
          } catch (parseErr) {
            console.warn(
              "[Cache] failed to parse cached item for",
              cacheKey,
              parseErr
            );
          }

          if (parsed) {
            const { data: cachedData, timestamp } = parsed;
            const age = (now - timestamp) / 1000;
            const isFresh = now - timestamp < cacheDuration;

            if (isFresh) {
              console.log(
                `%c[Cache HIT] %c${key} %c(${age.toFixed(
                  1
                )}s old)${this.getCacheTypeLabel(dataType, isLiveData)}`,
                "color: limegreen; font-weight: bold;",
                "color: white;",
                "color: gray;"
              );
              return cachedData;
            } else {
              console.log(
                `%c[Cache STALE] %c${key} %c(${age.toFixed(
                  1
                )}s old — refreshing...)${this.getCacheTypeLabel(
                  dataType,
                  isLiveData
                )}`,
                "color: orange; font-weight: bold;",
                "color: white;",
                "color: gray;"
              );
            }
          }
        }
      } else {
        console.log(
          "[Cache] AsyncStorage disabled — using in-memory fallback for",
          key
        );
      }

      // 2️⃣ Fetch from network if not cached or stale
      console.log(
        `%c[Network Fetch] %c${key} %c(network request)${this.getCacheTypeLabel(
          dataType,
          isLiveData
        )}`,
        "color: cyan; font-weight: bold;",
        "color: white;",
        "color: gray;"
      );

      // Coalesce concurrent network fetches for the same cache key
      if (this.inFlightFetches.has(cacheKey)) {
        try {
          const sharedPromise = this.inFlightFetches.get(cacheKey);
          const sharedData = await sharedPromise;
          // Return the shared data without attempting another network write
          return sharedData;
        } catch (sharedErr) {
          // If the shared fetch failed, continue and perform our own fetch
          console.warn(
            "[Cache] shared in-flight fetch failed, falling back",
            sharedErr
          );
        }
      }

      // Create a single in-flight promise for this fetch so others can await it
      const networkPromise = (async () => {
        const result = await fetchFunction();
        return result;
      })();

      this.inFlightFetches.set(cacheKey, networkPromise);

      try {
        data = await networkPromise;
        fetchedFromNetwork = true;

        // Save to AsyncStorage (guarded)
        try {
          if (this.asyncStorageAvailable) {
            await AsyncStorage.setItem(
              cacheKey,
              JSON.stringify({ data, timestamp: now })
            );
            console.log(`[Cache] wrote ${cacheKey} (ts=${now})`);
          }
        } catch (setErr) {
          console.warn(
            "[Cache] failed to write to AsyncStorage for",
            cacheKey,
            setErr
          );
          try {
            const msg = String(
              setErr && setErr.message ? setErr.message : setErr
            );
            if (/quota|exceed/i.test(msg)) {
              console.warn(
                "[Cache] AsyncStorage appears to be full - disabling AsyncStorage usage"
              );
              this.asyncStorageAvailable = false;
            }
          } catch (chkErr) {}
        }

        // Also save to memory cache as backup
        try {
          this.memoryCache.set(key, data);
          this.memoryCacheTimestamps.set(key, now);
        } catch (memErr) {
          console.warn("[Cache] memory cache set failed for", key, memErr);
        }

        return data;
      } finally {
        // Clean up in-flight promise map
        try {
          this.inFlightFetches.delete(cacheKey);
        } catch (e) {}
      }
    } catch (err) {
      console.warn("⚠️ AsyncStorage cache failed:", err);

      // If we already fetched from network in the try block, return that data
      if (fetchedFromNetwork && data !== null) {
        return data;
      }

      // 3️⃣ Fallback to in-memory cache
      if (this.memoryCache.has(key)) {
        const timestamp = this.memoryCacheTimestamps.get(key) || 0;
        const age = (now - timestamp) / 1000;

        if (now - timestamp < cacheDuration) {
          console.log(
            `%c[Memory Fallback HIT] %c${key} %c(${age.toFixed(1)}s old)`,
            "color: yellow; font-weight: bold;",
            "color: white;",
            "color: gray;"
          );
          return this.memoryCache.get(key);
        }
      }

      // 4️⃣ Last resort: fetch from network without caching
      console.log(
        `%c[Network Fallback] %c${key} %c(no cache available)`,
        "color: red; font-weight: bold;",
        "color: white;",
        "color: gray;"
      );

      data = await fetchFunction();

      // Try to save to memory cache at least
      try {
        this.memoryCache.set(key, data);
        this.memoryCacheTimestamps.set(key, now);
      } catch (memErr) {
        console.warn("Memory cache also failed:", memErr);
      }

      return data;
    }
  }

  /**
   * Get cache type label for logging
   */
  static getCacheTypeLabel(dataType, isLiveData) {
    if (dataType === "live" || isLiveData) return " [LIVE]";
    if (dataType === "static") return " [STATIC]";
    if (dataType === "finished") return " [FINISHED]";
    return " [SCHEDULED]";
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
        const sportsCacheKeys = keys.filter((k) =>
          k.startsWith("sports_cache_")
        );
        await AsyncStorage.multiRemove(sportsCacheKeys);
        this.memoryCache.clear();
        this.memoryCacheTimestamps.clear();
        console.log(
          `✅ Cleared all sports cache (${sportsCacheKeys.length} items)`
        );
      }
    } catch (err) {
      console.warn("⚠️ Cache clear failed:", err);
    }
  }

  /**
   * Get cache statistics
   */
  static async getCacheStats() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const sportsCacheKeys = keys.filter((k) => k.startsWith("sports_cache_"));

      return {
        asyncStorageItems: sportsCacheKeys.length,
        memoryItems: this.memoryCache.size,
        cacheKeys: sportsCacheKeys,
      };
    } catch (err) {
      console.warn("⚠️ Cache stats failed:", err);
      return {
        asyncStorageItems: 0,
        memoryItems: this.memoryCache.size,
        cacheKeys: [],
      };
    }
  }

  /**
   * Check if data contains live events (to be overridden by specific services)
   */
  static hasLiveEvents(data) {
    if (!data || !data.events) return false;
    return data.events.some((event) => event.isLive);
  }

  /**
   * Determine data type based on content (to be overridden by specific services)
   */
  static getDataType(data) {
    if (!data || !data.events) return "static";

    const hasLive = data.events.some((event) => event.isLive);
    if (hasLive) return "live";

    const hasScheduled = data.events.some(
      (event) => !event.isCompleted && !event.isLive
    );
    if (hasScheduled) return "scheduled";

    return "finished";
  }

  /**
   * Get browser-like headers for fetch requests
   * Note: We omit Accept-Encoding headers because React Native's fetch doesn't
   * automatically decompress gzip/deflate/brotli responses like browsers do.
   * Without these headers, the API will return uncompressed JSON.
   */
  static getBrowserHeaders() {
    return {
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };
  }
}

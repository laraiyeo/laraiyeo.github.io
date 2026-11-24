import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * CacheJanitor
 *
 * AsyncStorage-backed caches in this app are keyed per-entity (per game,
 * per player, per date, ...) and are never evicted, so "Documents & Data"
 * grows without bound over time. This service prunes stale entries on launch.
 *
 * It is intentionally conservative:
 *  - Only touches keys matching known cache prefixes (never user data).
 *  - Keeps entries newer than MAX_AGE_MS.
 *  - Additionally caps each prefix to MAX_ENTRIES_PER_PREFIX (newest kept).
 *  - Never throws; failures are swallowed so startup is never blocked.
 */

// Cache key prefixes written by the app's services/screens.
const CACHE_PREFIXES = [
  "sports_cache_", // BaseCacheService (all sports services)
  "mlb_cache_", // MLBService
  "@gameDetail_v2:", // Top5 game details
  "@gameDetail_h2h_v2:", // Top5 head-to-head
  "@gameDetail_facts_v2:", // Top5 match facts
  "@mlb_series_v2:", // MLB series games
];

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_ENTRIES_PER_PREFIX = 300; // hard cap per prefix

const matchesCachePrefix = (key) =>
  CACHE_PREFIXES.some((prefix) => key.startsWith(prefix));

/**
 * Extract a timestamp (ms) from a cached payload. Different services use
 * different field names, so check the known variants.
 */
const extractTimestamp = (raw) => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const ts = parsed.timestamp ?? parsed.ts ?? parsed.expiresAt ?? null;
    return typeof ts === "number" && Number.isFinite(ts) ? ts : null;
  } catch (e) {
    return null;
  }
};

export const CacheJanitor = {
  /**
   * Prune stale cache entries. Safe to call on every launch.
   * @returns {Promise<{removed:number, scanned:number}>}
   */
  async prune() {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = (allKeys || []).filter(matchesCachePrefix);
      if (cacheKeys.length === 0) return { removed: 0, scanned: 0 };

      const now = Date.now();
      const entries = await AsyncStorage.multiGet(cacheKeys);

      const toRemove = [];
      // Group surviving keys by prefix so we can enforce per-prefix caps.
      const byPrefix = new Map();

      for (const [key, raw] of entries) {
        const ts = extractTimestamp(raw);
        // Drop entries with no parseable timestamp or that are too old.
        if (ts === null || now - ts > MAX_AGE_MS) {
          toRemove.push(key);
          continue;
        }
        const prefix = CACHE_PREFIXES.find((p) => key.startsWith(p));
        if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
        byPrefix.get(prefix).push({ key, ts });
      }

      // Enforce per-prefix entry caps (keep newest).
      for (const list of byPrefix.values()) {
        if (list.length <= MAX_ENTRIES_PER_PREFIX) continue;
        list.sort((a, b) => b.ts - a.ts);
        for (let i = MAX_ENTRIES_PER_PREFIX; i < list.length; i++) {
          toRemove.push(list[i].key);
        }
      }

      if (toRemove.length > 0) {
        await AsyncStorage.multiRemove(toRemove);
      }

      if (__DEV__) {
        console.log(
          `[CacheJanitor] scanned ${cacheKeys.length}, removed ${toRemove.length}`,
        );
      }

      return { removed: toRemove.length, scanned: cacheKeys.length };
    } catch (e) {
      if (__DEV__) console.warn("[CacheJanitor] prune failed:", e?.message || e);
      return { removed: 0, scanned: 0 };
    }
  },
};

export default CacheJanitor;

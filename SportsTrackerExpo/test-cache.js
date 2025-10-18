// Test AsyncStorage Cache Implementation
const AsyncStorage = require('@react-native-async-storage/async-storage');

class MLBServiceTest {
  static CACHE_DURATION = 10000; // 10 seconds

  static async getCachedData(key, fetchFunction) {
    const now = Date.now();
    const cacheKey = `mlb_cache_${key}`;
    
    try {
      // 1️⃣ Try to read from AsyncStorage
      const cachedItem = await AsyncStorage.getItem(cacheKey);
      if (cachedItem) {
        const { data, timestamp } = JSON.parse(cachedItem);
        const age = (now - timestamp) / 1000;
        const isFresh = (now - timestamp) < this.CACHE_DURATION;

        if (isFresh) {
          console.log(
            `[MLBService Cache HIT] ${key} (${age.toFixed(1)}s old)`
          );
          return data;
        } else {
          console.log(
            `[MLBService Cache STALE] ${key} (${age.toFixed(1)}s old — refreshing...)`
          );
        }
      }

      // 2️⃣ Fetch from network if not cached or stale
      console.log(`[MLBService Fetch] ${key} (network request)`);

      const data = await fetchFunction();
      await AsyncStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: now }));

      return data;
    } catch (err) {
      console.warn('⚠️ Cache read/write failed:', err);
      return await fetchFunction();
    }
  }

  static async testScoreboard() {
    return this.getCachedData('scoreboard_2025-10-17', async () => {
      console.log('🌐 Fetching from MLB API...');
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { games: ['TOR vs SEA', 'MIL vs LAD'], total: 2, fetchTime: new Date().toISOString() };
    });
  }
}

async function testCache() {
  console.log('🧪 Testing AsyncStorage Persistent Caching');
  console.log('==========================================');
  
  // Test 1: First call (should fetch from network)
  console.log('\n1️⃣ First call (should fetch from network):');
  const result1 = await MLBServiceTest.testScoreboard();
  console.log('Result:', result1);
  
  // Test 2: Second call (should hit cache)
  console.log('\n2️⃣ Second call (should hit cache):');
  const result2 = await MLBServiceTest.testScoreboard();
  console.log('Result:', result2);
  
  // Test 3: Wait 11 seconds and call again (should be stale and refetch)
  console.log('\n3️⃣ Waiting 11 seconds for cache to expire...');
  setTimeout(async () => {
    console.log('Cache should be stale now, making third call:');
    const result3 = await MLBServiceTest.testScoreboard();
    console.log('Result:', result3);
  }, 11000);
}

// Run test if this file is executed directly
if (require.main === module) {
  testCache().catch(console.error);
}

module.exports = { MLBServiceTest };
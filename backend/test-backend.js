const BackendApiService = require('./services/cacheService');
const { getCachedData, setCachedData, generateCacheKey } = BackendApiService;

/**
 * Quick Start Test Script
 * Run this to verify the backend is working correctly
 */

async function runTests() {
  console.log('🧪 Running Backend Tests...\n');

  // Test 1: Cache Service
  console.log('1. Testing Cache Service...');
  try {
    const testKey = generateCacheKey('test', 'user123');
    const testData = { message: 'Hello World', timestamp: Date.now() };
    
    await setCachedData(testKey, testData, 60);
    const retrievedData = await getCachedData(testKey);
    
    if (retrievedData && retrievedData.message === 'Hello World') {
      console.log('   ✅ Cache service working correctly');
    } else {
      console.log('   ❌ Cache service test failed');
    }
  } catch (error) {
    console.log('   ❌ Cache service error:', error.message);
  }

  // Test 2: Health Check
  console.log('\n2. Testing Health Endpoint...');
  try {
    const response = await fetch('http://localhost:3001/health');
    const data = await response.json();
    
    if (data.status === 'ok') {
      console.log('   ✅ Health endpoint responding correctly');
      console.log(`   ℹ️  Server uptime: ${Math.round(data.uptime)} seconds`);
    } else {
      console.log('   ❌ Health endpoint returned unexpected status');
    }
  } catch (error) {
    console.log('   ❌ Health endpoint not accessible:', error.message);
    console.log('   ℹ️  Make sure the server is running with: npm start');
  }

  // Test 3: Favorites API
  console.log('\n3. Testing Favorites API...');
  try {
    const testUserId = 'test-user-123';
    const testTeams = [
      {
        teamId: '119',
        sport: 'mlb',
        displayName: 'Los Angeles Dodgers',
        teamName: 'Dodgers'
      }
    ];

    // Test POST (create favorites)
    const postResponse = await fetch(`http://localhost:3001/api/favorites/teams/${testUserId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teams: testTeams })
    });

    if (postResponse.ok) {
      console.log('   ✅ POST favorites endpoint working');
      
      // Test GET (retrieve favorites)
      const getResponse = await fetch(`http://localhost:3001/api/favorites/teams/${testUserId}`);
      const favoritesData = await getResponse.json();
      
      if (favoritesData.teams && favoritesData.teams.length > 0) {
        console.log('   ✅ GET favorites endpoint working');
        console.log(`   ℹ️  Retrieved ${favoritesData.teams.length} favorite teams`);
      } else {
        console.log('   ❌ GET favorites returned no data');
      }
    } else {
      console.log('   ❌ POST favorites failed:', postResponse.statusText);
    }
  } catch (error) {
    console.log('   ❌ Favorites API test failed:', error.message);
  }

  // Test 4: VAPID Keys
  console.log('\n4. Testing Notification Setup...');
  try {
    const response = await fetch('http://localhost:3001/api/notifications/vapid-public-key');
    const data = await response.json();
    
    if (data.publicKey) {
      console.log('   ✅ VAPID public key available');
      console.log(`   ℹ️  Key length: ${data.publicKey.length} characters`);
    } else {
      console.log('   ❌ VAPID public key not configured');
      console.log('   ℹ️  Check your .env file for VAPID keys');
    }
  } catch (error) {
    console.log('   ❌ Notification endpoint test failed:', error.message);
  }

  console.log('\n🏁 Tests completed!');
  console.log('\n📋 Next Steps:');
  console.log('1. If all tests passed, your backend is ready to use');
  console.log('2. Update your mobile app to use the backend services');
  console.log('3. Test the integration with the INTEGRATION_GUIDE.md');
  console.log('4. Monitor performance improvements');
  
  process.exit(0);
}

// Run tests when script is executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('Test script failed:', error);
    process.exit(1);
  });
}

module.exports = { runTests };
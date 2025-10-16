# Integration Guide: Migrating FavoritesScreen to Backend

This guide walks you through integrating the optimized backend with your existing FavoritesScreen.

## Step 1: Install Backend Dependencies

Navigate to the backend directory and run setup:

```bash
cd backend
npm install
```

Copy environment configuration:
```bash
cp .env.example .env
```

## Step 2: Start Redis and Backend

### Option A: Local Redis
```bash
# Install Redis (if not already installed)
# Ubuntu: sudo apt install redis-server  
# macOS: brew install redis
# Windows: Use Redis for Windows or Docker

# Start Redis
redis-server

# Start backend (in backend directory)
npm start
```

### Option B: Docker Redis
```bash
# Start Redis with Docker
docker run -d --name redis-sports -p 6379:6379 redis:alpine

# Start backend
npm start
```

## Step 3: Update Mobile App Configuration

Add backend service to your mobile app:

```bash
# In SportsTrackerExpo directory
# The backend services are already created in src/services/backend/
```

## Step 4: Integrate with FavoritesScreen

### Option A: Gradual Migration (Recommended)

Replace the heavy `fetchFavoriteGames` function gradually:

```javascript
// In FavoritesScreen.js, add at the top:
import OptimizedFavoritesService from '../services/backend/OptimizedFavoritesService';
import BackendApiService from '../services/backend/BackendApiService';

// Add this inside the FavoritesScreen component:
const [useBackend, setUseBackend] = useState(false);
const [backendHealthy, setBackendHealthy] = useState(false);

// Add backend health check on component mount:
useEffect(() => {
  checkBackendHealth();
}, []);

const checkBackendHealth = async () => {
  try {
    const healthy = await BackendApiService.checkHealth();
    setBackendHealthy(healthy);
    if (healthy) {
      setUseBackend(true);
    }
  } catch (error) {
    console.log('Backend not available, using original implementation');
    setBackendHealthy(false);
    setUseBackend(false);
  }
};

// Replace the fetchFavoriteGames function:
const fetchFavoriteGames = async (forceRefresh = false) => {
  if (useBackend && backendHealthy) {
    return fetchFavoriteGamesOptimized(forceRefresh);
  } else {
    return fetchFavoriteGamesOriginal(forceRefresh);
  }
};

// Add the optimized version:
const fetchFavoriteGamesOptimized = async (forceRefresh = false) => {
  try {
    setLoading(true);
    
    const response = await OptimizedFavoritesService.getFavoriteGames(forceRefresh);
    
    if (response.hasChanges) {
      setGames(response.games);
      console.log(`Optimized fetch: ${response.changesSummary?.updated || 0} updated, ${response.changesSummary?.added || 0} added`);
    }
    
    setLastFetchTime(Date.now());
    setLoading(false);
    setRefreshing(false);
  } catch (error) {
    console.error('Optimized fetch failed, falling back to original:', error);
    // Fallback to original implementation
    setUseBackend(false);
    return fetchFavoriteGamesOriginal(forceRefresh);
  }
};

// Rename original function:
const fetchFavoriteGamesOriginal = async (forceRefresh = false) => {
  // Your existing fetchFavoriteGames implementation here
  // ... (keep all the original logic)
};
```

### Option B: Complete Replacement

Replace the entire `fetchFavoriteGames` function:

```javascript
const fetchFavoriteGames = async (forceRefresh = false) => {
  if (isFetchingFavorites && !forceRefresh) {
    console.log('Skipping fetch - already in progress');
    return;
  }

  try {
    isFetchingFavorites = true;
    setLoading(true);
    
    const response = await OptimizedFavoritesService.getFavoriteGames(forceRefresh);
    
    if (response.hasChanges) {
      setGames(response.games);
      
      // Log the optimization benefits
      if (response.changesSummary) {
        const { added, updated, removed } = response.changesSummary;
        console.log(`✅ Optimized fetch completed: ${updated} updated, ${added} added, ${removed} removed`);
      }
    } else {
      console.log('✅ No changes detected - using cached data');
    }
    
    setLastFetchTime(Date.now());
  } catch (error) {
    console.error('Error fetching favorite games:', error);
    setError('Failed to fetch games data');
  } finally {
    setLoading(false);
    setRefreshing(false);
    isFetchingFavorites = false;
  }
};
```

## Step 5: Add Push Notifications

### Setup Push Notifications
```javascript
// Add to FavoritesScreen.js imports:
import PushNotificationService from '../services/backend/PushNotificationService';

// Add inside component:
const [notificationsEnabled, setNotificationsEnabled] = useState(false);

// Initialize notifications on component mount:
useEffect(() => {
  initializeNotifications();
}, []);

const initializeNotifications = async () => {
  try {
    const initialized = await PushNotificationService.initialize();
    if (initialized) {
      const isSubscribed = await PushNotificationService.isSubscribed();
      setNotificationsEnabled(isSubscribed);
    }
  } catch (error) {
    console.error('Error initializing notifications:', error);
  }
};

// Add notification toggle:
const toggleNotifications = async () => {
  try {
    const userId = await OptimizedFavoritesService.getUserId();
    
    if (notificationsEnabled) {
      await PushNotificationService.unsubscribe(userId);
      setNotificationsEnabled(false);
    } else {
      await PushNotificationService.requestPermissionAndSubscribe(userId, {
        gameStart: true,
        scoreUpdate: true,
        gameEnd: true,
        news: false
      });
      setNotificationsEnabled(true);
    }
  } catch (error) {
    console.error('Error toggling notifications:', error);
  }
};
```

### Add Notification Settings UI
```javascript
// Add to your render method:
<View style={styles.notificationSection}>
  <Text style={styles.sectionTitle}>Notifications</Text>
  <TouchableOpacity 
    style={styles.notificationToggle}
    onPress={toggleNotifications}
  >
    <Text style={styles.toggleText}>
      Push Notifications: {notificationsEnabled ? 'ON' : 'OFF'}
    </Text>
  </TouchableOpacity>
</View>
```

## Step 6: Monitor Performance

Add performance monitoring to see the improvements:

```javascript
// Add to FavoritesScreen.js:
const [performanceStats, setPerformanceStats] = useState(null);

// Monitor data consumption:
const monitorPerformance = (response) => {
  const stats = {
    dataSize: JSON.stringify(response).length,
    hasChanges: response.hasChanges,
    deltaType: response.deltaType,
    changesSummary: response.changesSummary,
    timestamp: new Date().toISOString()
  };
  
  setPerformanceStats(stats);
  console.log('📊 Performance Stats:', stats);
};

// Call after each fetch:
const response = await OptimizedFavoritesService.getFavoriteGames(forceRefresh);
monitorPerformance(response);
```

## Step 7: Testing

### Test Backend Connection
```javascript
// Add a debug function:
const testBackendConnection = async () => {
  try {
    const healthy = await BackendApiService.checkHealth();
    console.log('Backend Health:', healthy);
    
    const cacheStats = OptimizedFavoritesService.getCacheStats();
    console.log('Cache Stats:', cacheStats);
  } catch (error) {
    console.error('Backend test failed:', error);
  }
};
```

### Test Notifications
```javascript
// Add a test notification function:
const testNotification = async () => {
  try {
    await PushNotificationService.sendTestNotification();
  } catch (error) {
    console.error('Test notification failed:', error);
  }
};
```

## Step 8: Production Configuration

### Backend Environment
Update `.env` for production:
```bash
NODE_ENV=production
PORT=3001
REDIS_URL=redis://your-production-redis-url
VAPID_PUBLIC_KEY=your-production-vapid-public-key
VAPID_PRIVATE_KEY=your-production-vapid-private-key
```

### Mobile App Configuration
Update `BackendApiService.js`:
```javascript
const API_BASE_URL = __DEV__ 
  ? 'http://localhost:3001/api' 
  : 'https://your-production-backend.com/api';
```

## Expected Results

### Data Consumption Reduction
- **Before**: 2-5MB per fetch
- **After**: 50-200KB per fetch
- **Savings**: 90-95% reduction

### Performance Improvements
- **Faster loading**: Delta updates mean less data to process
- **Better caching**: Redis caching with smart invalidation
- **Reduced API calls**: Single aggregated request vs multiple
- **Background updates**: Server handles heavy lifting

### User Experience
- **Real-time notifications**: Push alerts for game events
- **Offline support**: Cached data available offline
- **Consistent updates**: Background jobs ensure fresh data
- **Lower battery usage**: Less frequent polling needed

## Troubleshooting

### Backend Not Starting
```bash
# Check Redis is running
redis-cli ping

# Check port availability
netstat -an | grep 3001

# Check logs
npm start
```

### Mobile App Connection Issues
```javascript
// Test connection manually
const testConnection = async () => {
  try {
    const response = await fetch('http://localhost:3001/health');
    const data = await response.json();
    console.log('Connection test:', data);
  } catch (error) {
    console.error('Connection failed:', error);
  }
};
```

### Notification Issues
```javascript
// Check notification support
console.log('Notification support:', PushNotificationService.isNotificationSupported());

// Check permissions
console.log('Notification permission:', Notification.permission);
```

## Rollback Plan

If issues occur, you can easily rollback:

1. **Disable backend usage**:
   ```javascript
   const [useBackend, setUseBackend] = useState(false); // Set to false
   ```

2. **Keep original functions**: The gradual migration approach keeps your original `fetchFavoriteGamesOriginal` function intact.

3. **Remove backend services**: Simply don't import the backend services to use original implementation.

This ensures you can always fall back to the working original implementation while testing the optimized version.
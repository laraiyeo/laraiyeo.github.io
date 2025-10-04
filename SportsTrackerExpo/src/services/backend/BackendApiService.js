/**
 * Backend API Service - Optimized service for communicating with the backend server
 * This replaces the heavy data fetching logic in FavoritesScreen
 */

const API_BASE_URL = __DEV__ ? 'http://localhost:3001/api' : 'https://your-production-backend.com/api';

class BackendApiService {
  static instance = null;
  
  constructor() {
    this.lastUpdateTimes = new Map(); // Track last update times per endpoint
    this.requestCache = new Map(); // Short-term request cache
    this.isOnline = true;
    
    // Set up network state monitoring
    this.setupNetworkMonitoring();
  }

  static getInstance() {
    if (!BackendApiService.instance) {
      BackendApiService.instance = new BackendApiService();
    }
    return BackendApiService.instance;
  }

  /**
   * Setup network monitoring to handle offline scenarios
   */
  setupNetworkMonitoring() {
    // Implementation would use NetInfo in React Native
    // For now, just assume online
  }

  /**
   * Make HTTP request with timeout and error handling
   */
  async makeRequest(endpoint, options = {}) {
    const {
      method = 'GET',
      body = null,
      headers = {},
      timeout = 10000,
      useCache = false
    } = options;

    const url = `${API_BASE_URL}${endpoint}`;
    const cacheKey = `${method}:${url}`;

    // Check cache for GET requests
    if (method === 'GET' && useCache) {
      const cached = this.requestCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < 30000) { // 30 second cache
        return cached.data;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: body ? JSON.stringify(body) : null,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Cache successful GET requests
      if (method === 'GET' && useCache) {
        this.requestCache.set(cacheKey, {
          data,
          timestamp: Date.now()
        });
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      
      console.error(`Backend API request failed: ${url}`, error);
      throw error;
    }
  }

  /**
   * Get optimized favorite games data with delta updates
   */
  async getFavoriteGames(userId, sports = null) {
    const lastUpdate = this.lastUpdateTimes.get(`games:${userId}`);
    const params = new URLSearchParams();
    
    if (lastUpdate) {
      params.append('lastUpdate', lastUpdate);
    }
    
    if (sports) {
      params.append('sports', Array.isArray(sports) ? sports.join(',') : sports);
    }

    const endpoint = `/favorites/games/${userId}?${params.toString()}`;
    
    try {
      const response = await this.makeRequest(endpoint, { useCache: true });
      
      // Update last update time if we got new data
      if (response.hasChanges && response.lastUpdate) {
        this.lastUpdateTimes.set(`games:${userId}`, response.lastUpdate);
      }

      return response;
    } catch (error) {
      console.error('Error fetching favorite games:', error);
      
      // Return cached data if available
      const cacheKey = `GET:${API_BASE_URL}${endpoint}`;
      const cached = this.requestCache.get(cacheKey);
      if (cached) {
        console.log('Returning cached data due to error');
        return cached.data;
      }
      
      throw error;
    }
  }

  /**
   * Get user's favorite teams
   */
  async getFavoriteTeams(userId) {
    const lastUpdate = this.lastUpdateTimes.get(`teams:${userId}`);
    const params = lastUpdate ? `?lastUpdate=${lastUpdate}` : '';
    
    const endpoint = `/favorites/teams/${userId}${params}`;
    
    try {
      const response = await this.makeRequest(endpoint, { useCache: true });
      
      if (response.hasChanges && response.lastUpdate) {
        this.lastUpdateTimes.set(`teams:${userId}`, response.lastUpdate);
      }

      return response;
    } catch (error) {
      console.error('Error fetching favorite teams:', error);
      throw error;
    }
  }

  /**
   * Update user's favorite teams
   */
  async updateFavoriteTeams(userId, teams) {
    const endpoint = `/favorites/teams/${userId}`;
    
    try {
      const response = await this.makeRequest(endpoint, {
        method: 'POST',
        body: { teams }
      });

      // Clear cached data since we updated
      this.clearUserCache(userId);

      return response;
    } catch (error) {
      console.error('Error updating favorite teams:', error);
      throw error;
    }
  }

  /**
   * Get user summary (minimal data for quick overview)
   */
  async getUserSummary(userId) {
    const lastUpdate = this.lastUpdateTimes.get(`summary:${userId}`);
    const params = lastUpdate ? `?lastUpdate=${lastUpdate}` : '';
    
    const endpoint = `/favorites/summary/${userId}${params}`;
    
    try {
      const response = await this.makeRequest(endpoint, { useCache: true });
      
      if (response.hasChanges && response.lastUpdate) {
        this.lastUpdateTimes.set(`summary:${userId}`, response.lastUpdate);
      }

      return response;
    } catch (error) {
      console.error('Error fetching user summary:', error);
      throw error;
    }
  }

  /**
   * Subscribe to push notifications
   */
  async subscribeToNotifications(userId, subscription, preferences) {
    const endpoint = `/notifications/subscribe/${userId}`;
    
    try {
      const response = await this.makeRequest(endpoint, {
        method: 'POST',
        body: { subscription, preferences }
      });

      return response;
    } catch (error) {
      console.error('Error subscribing to notifications:', error);
      throw error;
    }
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(userId, preferences) {
    const endpoint = `/notifications/preferences/${userId}`;
    
    try {
      const response = await this.makeRequest(endpoint, {
        method: 'PUT',
        body: { preferences }
      });

      return response;
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      throw error;
    }
  }

  /**
   * Get VAPID public key for push notifications
   */
  async getVapidPublicKey() {
    const endpoint = '/notifications/vapid-public-key';
    
    try {
      const response = await this.makeRequest(endpoint, { useCache: true });
      return response.publicKey;
    } catch (error) {
      console.error('Error getting VAPID public key:', error);
      throw error;
    }
  }

  /**
   * Clear cache for a specific user
   */
  clearUserCache(userId) {
    // Clear last update times
    this.lastUpdateTimes.delete(`games:${userId}`);
    this.lastUpdateTimes.delete(`teams:${userId}`);
    this.lastUpdateTimes.delete(`summary:${userId}`);

    // Clear request cache for user-specific endpoints
    const keysToDelete = [];
    for (const [key] of this.requestCache) {
      if (key.includes(`/${userId}`)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.requestCache.delete(key));
  }

  /**
   * Clear all cache
   */
  clearAllCache() {
    this.lastUpdateTimes.clear();
    this.requestCache.clear();
  }

  /**
   * Check if backend is healthy
   */
  async checkHealth() {
    try {
      const response = await this.makeRequest('/health', { timeout: 5000 });
      return response.status === 'ok';
    } catch (error) {
      console.error('Backend health check failed:', error);
      return false;
    }
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats() {
    return {
      lastUpdateTimes: this.lastUpdateTimes.size,
      requestCache: this.requestCache.size,
      cacheKeys: Array.from(this.requestCache.keys())
    };
  }
}

export default BackendApiService.getInstance();
// Backend-Integrated MLB Service
// Replaces direct API calls with backend delta updates using sport-specific endpoints

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MLBService } from './MLBService'; // Fallback service

export class BackendMLBService {
  static BACKEND_URL = "https://laraiyeogithubio-production.up.railway.app";
  
  // Local cache for storing last sync times and data
  static cache = new Map();
  static lastSyncTimes = new Map();
  
  // Storage keys for different data types
  static GAMES_SYNC_KEY = 'mlb_games_last_sync';
  static STANDINGS_SYNC_KEY = 'mlb_standings_last_sync';
  static GAMES_CACHE_KEY = 'mlb_games_cache';
  static STANDINGS_CACHE_KEY = 'mlb_standings_cache';
  
  // Service status
  static isBackendActive = false;
  static lastHealthCheck = null;

  /**
   * Initialize the service and check backend connectivity
   */
  static async initialize() {
    try {
      console.log('BackendMLBService: Initializing...');
      
      // Check backend health
      const healthStatus = await this.checkBackendHealth();
      this.isBackendActive = healthStatus;
      
      if (healthStatus) {
        console.log('BackendMLBService: Backend is active, using delta updates');
      } else {
        console.log('BackendMLBService: Backend unavailable, will use fallback');
      }
      
      return { 
        backendActive: healthStatus,
        message: healthStatus ? 'Backend ready for delta updates' : 'Using fallback mode'
      };
    } catch (error) {
      console.error('BackendMLBService: Initialization failed:', error);
      this.isBackendActive = false;
      return { 
        backendActive: false,
        message: 'Backend unavailable, using fallback mode'
      };
    }
  }

  /**
   * Check backend health status
   */
  static async checkBackendHealth() {
    try {
      const response = await fetch(`${this.BACKEND_URL}/health`, {
        method: 'GET',
        timeout: 5000
      });
      
      if (response.ok) {
        const data = await response.json();
        this.lastHealthCheck = new Date().toISOString();
        return data.status === 'ok';
      }
      
      return false;
    } catch (error) {
      console.error('BackendMLBService: Health check failed:', error);
      return false;
    }
  }

  /**
   * Get MLB games with delta updates
   */
  static async getGames(options = {}) {
    try {
      const { startDate, endDate, forceRefresh = false } = options;
      
      if (!this.isBackendActive) {
        console.log('BackendMLBService: Backend inactive, using fallback');
        return await MLBService.getScoreboard(startDate, endDate);
      }

      // Try backend delta first
      try {
        const result = await this.getGamesFromBackend(startDate, endDate, forceRefresh);
        if (result) {
          return result;
        }
      } catch (error) {
        console.error('BackendMLBService: Backend games request failed:', error);
        this.isBackendActive = false;
      }

      // Fallback to direct API
      console.log('BackendMLBService: Falling back to direct MLB API');
      return await MLBService.getScoreboard(startDate, endDate);
      
    } catch (error) {
      console.error('BackendMLBService: getGames failed:', error);
      // Final fallback
      return await MLBService.getScoreboard(startDate, endDate);
    }
  }

  /**
   * Get games from backend with delta support
   */
  static async getGamesFromBackend(startDate, endDate, forceRefresh = false) {
    try {
      // Build cache key for this request
      const cacheKey = `games_${startDate || 'today'}_${endDate || startDate || 'today'}`;
      
      // Get last sync time for this specific query
      let lastSync = null;
      if (!forceRefresh) {
        lastSync = await AsyncStorage.getItem(`${this.GAMES_SYNC_KEY}_${cacheKey}`);
      }

      // Build request URL
      let url = `${this.BACKEND_URL}/api/sports/mlb/games`;
      const params = new URLSearchParams();
      
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (lastSync) params.append('lastSync', lastSync);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      console.log('BackendMLBService: Fetching games from backend:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000
      });

      if (!response.ok) {
        throw new Error(`Backend request failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('BackendMLBService: Received games delta:', {
        hasChanges: data.hasChanges,
        deltaType: data.deltaType,
        dataSize: data.data ? (data.data.events ? data.data.events.length : 'no events') : 'no data'
      });

      if (data.hasChanges && data.data) {
        // Store the new sync time
        await AsyncStorage.setItem(`${this.GAMES_SYNC_KEY}_${cacheKey}`, data.currentSync);
        
        // Cache the data locally
        await AsyncStorage.setItem(`${this.GAMES_CACHE_KEY}_${cacheKey}`, JSON.stringify(data.data));
        
        return data.data;
      } else if (!data.hasChanges) {
        // No changes, return cached data
        const cachedData = await AsyncStorage.getItem(`${this.GAMES_CACHE_KEY}_${cacheKey}`);
        if (cachedData) {
          return JSON.parse(cachedData);
        }
      }

      return data.data || { events: [] };
      
    } catch (error) {
      console.error('BackendMLBService: Backend games request failed:', error);
      throw error;
    }
  }

  /**
   * Get MLB standings with delta updates
   */
  static async getStandings(forceRefresh = false) {
    try {
      if (!this.isBackendActive) {
        console.log('BackendMLBService: Backend inactive, using fallback for standings');
        return await MLBService.getStandings();
      }

      // Try backend delta first
      try {
        const result = await this.getStandingsFromBackend(forceRefresh);
        if (result) {
          return result;
        }
      } catch (error) {
        console.error('BackendMLBService: Backend standings request failed:', error);
        this.isBackendActive = false;
      }

      // Fallback to direct API
      console.log('BackendMLBService: Falling back to direct MLB API for standings');
      return await MLBService.getStandings();
      
    } catch (error) {
      console.error('BackendMLBService: getStandings failed:', error);
      // Final fallback
      return await MLBService.getStandings();
    }
  }

  /**
   * Get standings from backend with delta support
   */
  static async getStandingsFromBackend(forceRefresh = false) {
    try {
      // Get last sync time
      let lastSync = null;
      if (!forceRefresh) {
        lastSync = await AsyncStorage.getItem(this.STANDINGS_SYNC_KEY);
      }

      // Build request URL
      let url = `${this.BACKEND_URL}/api/sports/mlb/standings`;
      if (lastSync) {
        url += `?lastSync=${encodeURIComponent(lastSync)}`;
      }

      console.log('BackendMLBService: Fetching standings from backend:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000
      });

      if (!response.ok) {
        throw new Error(`Backend standings request failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('BackendMLBService: Received standings delta:', {
        hasChanges: data.hasChanges,
        deltaType: data.deltaType
      });

      if (data.hasChanges && data.data) {
        // Store the new sync time
        await AsyncStorage.setItem(this.STANDINGS_SYNC_KEY, data.currentSync);
        
        // Cache the data locally
        await AsyncStorage.setItem(this.STANDINGS_CACHE_KEY, JSON.stringify(data.data));
        
        return data.data;
      } else if (!data.hasChanges) {
        // No changes, return cached data
        const cachedData = await AsyncStorage.getItem(this.STANDINGS_CACHE_KEY);
        if (cachedData) {
          return JSON.parse(cachedData);
        }
      }

      return data.data || {};
      
    } catch (error) {
      console.error('BackendMLBService: Backend standings request failed:', error);
      throw error;
    }
  }

  /**
   * Get service status for UI indicators
   */
  static getServiceStatus() {
    return {
      backendActive: this.isBackendActive,
      lastHealthCheck: this.lastHealthCheck,
      fallbackMode: !this.isBackendActive
    };
  }

  /**
   * Force refresh backend health status
   */
  static async refreshBackendStatus() {
    const healthStatus = await this.checkBackendHealth();
    this.isBackendActive = healthStatus;
    return healthStatus;
  }

  /**
   * Clear all cached data (useful for debugging)
   */
  static async clearCache() {
    try {
      const keys = [
        this.GAMES_SYNC_KEY,
        this.STANDINGS_SYNC_KEY,
        this.GAMES_CACHE_KEY,
        this.STANDINGS_CACHE_KEY
      ];

      // Also clear date-specific cache keys
      const allKeys = await AsyncStorage.getAllKeys();
      const mlbKeys = allKeys.filter(key => 
        key.startsWith('mlb_games_last_sync_') || 
        key.startsWith('mlb_games_cache_')
      );

      await AsyncStorage.multiRemove([...keys, ...mlbKeys]);
      this.cache.clear();
      this.lastSyncTimes.clear();
      
      console.log('BackendMLBService: Cache cleared');
    } catch (error) {
      console.error('BackendMLBService: Failed to clear cache:', error);
    }
  }

  /**
   * Get live games (games currently in progress)
   */
  static async getLiveGames() {
    try {
      const games = await this.getGames();
      
      if (games && games.events) {
        return {
          events: games.events.filter(game => game.isLive)
        };
      }
      
      return { events: [] };
    } catch (error) {
      console.error('BackendMLBService: getLiveGames failed:', error);
      return { events: [] };
    }
  }

  /**
   * Get games for a specific date range
   */
  static async getGamesForDateRange(startDate, endDate) {
    return await this.getGames({ startDate, endDate });
  }

  /**
   * Get today's games
   */
  static async getTodaysGames() {
    return await this.getGames(); // No date params = today
  }
}
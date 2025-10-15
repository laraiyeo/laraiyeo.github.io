/**
 * Optimized Favorites Service - Replacement for heavy data fetching in FavoritesScreen
 * Uses backend API for efficient data management
 */

import BackendApiService from './BackendApiService';
import AsyncStorage from '@react-native-async-storage/async-storage';

class OptimizedFavoritesService {
  static instance = null;
  
  constructor() {
    this.userId = null;
    this.cachedFavorites = null;
    this.cachedGames = null;
    this.listeners = new Set();
    this.isInitialized = false;
    
    this.init();
  }

  static getInstance() {
    if (!OptimizedFavoritesService.instance) {
      OptimizedFavoritesService.instance = new OptimizedFavoritesService();
    }
    return OptimizedFavoritesService.instance;
  }

  /**
   * Initialize the service
   */
  async init() {
    try {
      // Get or generate user ID
      this.userId = await this.getUserId();
      
      // Load cached favorites from local storage
      await this.loadCachedFavorites();
      
      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing OptimizedFavoritesService:', error);
    }
  }

  /**
   * Get or generate user ID
   */
  async getUserId() {
    try {
      let userId = await AsyncStorage.getItem('userId');
      if (!userId) {
        // Generate a simple UUID
        userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        await AsyncStorage.setItem('userId', userId);
      }
      return userId;
    } catch (error) {
      console.error('Error getting user ID:', error);
      return 'user_default';
    }
  }

  /**
   * Load cached favorites from local storage
   */
  async loadCachedFavorites() {
    try {
      const cached = await AsyncStorage.getItem('cachedFavorites');
      if (cached) {
        this.cachedFavorites = JSON.parse(cached);
      }
    } catch (error) {
      console.error('Error loading cached favorites:', error);
    }
  }

  /**
   * Save favorites to local storage
   */
  async saveCachedFavorites(favorites) {
    try {
      this.cachedFavorites = favorites;
      await AsyncStorage.setItem('cachedFavorites', JSON.stringify(favorites));
    } catch (error) {
      console.error('Error saving cached favorites:', error);
    }
  }

  /**
   * Get favorite teams with optimized backend calls
   */
  async getFavoriteTeams(forceRefresh = false) {
    if (!this.isInitialized) {
      await this.init();
    }

    try {
      // Return cached data immediately if available and not forcing refresh
      if (!forceRefresh && this.cachedFavorites) {
        return this.cachedFavorites;
      }

      // Fetch from backend with delta updates
      const response = await BackendApiService.getFavoriteTeams(this.userId);
      
      if (response.hasChanges || !this.cachedFavorites) {
        // Update local cache
        await this.saveCachedFavorites(response);
        
        // Notify listeners
        this.notifyListeners('favoritesUpdated', response);
      }

      return this.cachedFavorites || response;
    } catch (error) {
      console.error('Error getting favorite teams:', error);
      
      // Return cached data if available
      if (this.cachedFavorites) {
        return this.cachedFavorites;
      }
      
      throw error;
    }
  }

  /**
   * Get favorite games with delta updates
   */
  async getFavoriteGames(forceRefresh = false, sports = null) {
    if (!this.isInitialized) {
      await this.init();
    }

    try {
      const response = await BackendApiService.getFavoriteGames(this.userId, sports);
      
      // Process delta response
      if (response.hasChanges) {
        if (response.deltaType === 'full') {
          // Full data refresh
          this.cachedGames = response.games;
        } else if (response.deltaType === 'delta') {
          // Apply delta changes
          this.cachedGames = this.applyGamesDelta(this.cachedGames || [], response);
        }
        
        // Notify listeners of changes
        this.notifyListeners('gamesUpdated', {
          games: this.cachedGames,
          changes: response.changes,
          deltaType: response.deltaType
        });
      }

      return {
        games: this.cachedGames || response.games || [],
        hasChanges: response.hasChanges,
        lastUpdate: response.lastUpdate,
        changesSummary: response.changesSummary
      };
    } catch (error) {
      console.error('Error getting favorite games:', error);
      
      // Return cached games if available
      if (this.cachedGames) {
        return {
          games: this.cachedGames,
          hasChanges: false,
          lastUpdate: new Date().toISOString(),
          error: error.message
        };
      }
      
      throw error;
    }
  }

  /**
   * Apply delta changes to cached games
   */
  applyGamesDelta(currentGames, deltaResponse) {
    if (!deltaResponse.changes) {
      return currentGames;
    }

    const { added, updated, removed } = deltaResponse.changes;
    let updatedGames = [...currentGames];

    // Remove games
    if (removed.length > 0) {
      const removedIds = new Set(removed.map(r => r.id));
      updatedGames = updatedGames.filter(game => !removedIds.has(game.id || game.gameId));
    }

    // Update existing games
    if (updated.length > 0) {
      const updatedMap = new Map(updated.map(u => [u.id, u.game]));
      updatedGames = updatedGames.map(game => {
        const gameId = game.id || game.gameId;
        return updatedMap.has(gameId) ? updatedMap.get(gameId) : game;
      });
    }

    // Add new games
    if (added.length > 0) {
      updatedGames.push(...added);
    }

    return updatedGames;
  }

  /**
   * Update favorite teams
   */
  async updateFavoriteTeams(teams) {
    if (!this.isInitialized) {
      await this.init();
    }

    try {
      const response = await BackendApiService.updateFavoriteTeams(this.userId, teams);
      
      // Update local cache
      const updatedFavorites = {
        teams,
        lastUpdate: response.lastUpdate,
        userId: this.userId
      };
      
      await this.saveCachedFavorites(updatedFavorites);
      
      // Notify listeners
      this.notifyListeners('favoritesUpdated', updatedFavorites);
      
      return response;
    } catch (error) {
      console.error('Error updating favorite teams:', error);
      throw error;
    }
  }

  /**
   * Get user summary
   */
  async getUserSummary() {
    if (!this.isInitialized) {
      await this.init();
    }

    try {
      const response = await BackendApiService.getUserSummary(this.userId);
      return response;
    } catch (error) {
      console.error('Error getting user summary:', error);
      throw error;
    }
  }

  /**
   * Setup push notifications
   */
  async setupPushNotifications(subscription, preferences) {
    if (!this.isInitialized) {
      await this.init();
    }

    try {
      const response = await BackendApiService.subscribeToNotifications(
        this.userId,
        subscription,
        preferences
      );
      return response;
    } catch (error) {
      console.error('Error setting up push notifications:', error);
      throw error;
    }
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(preferences) {
    if (!this.isInitialized) {
      await this.init();
    }

    try {
      const response = await BackendApiService.updateNotificationPreferences(
        this.userId,
        preferences
      );
      return response;
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      throw error;
    }
  }

  /**
   * Add event listener
   */
  addEventListener(listener) {
    this.listeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify listeners of changes
   */
  notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (error) {
        console.error('Error notifying listener:', error);
      }
    });
  }

  /**
   * Clear all cache
   */
  async clearCache() {
    this.cachedFavorites = null;
    this.cachedGames = null;
    
    try {
      await AsyncStorage.removeItem('cachedFavorites');
      BackendApiService.clearUserCache(this.userId);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats() {
    return {
      userId: this.userId,
      hasCachedFavorites: !!this.cachedFavorites,
      hasCachedGames: !!this.cachedGames,
      listenersCount: this.listeners.size,
      backendCacheStats: BackendApiService.getCacheStats()
    };
  }

  /**
   * Check backend health
   */
  async checkBackendHealth() {
    return await BackendApiService.checkHealth();
  }
}

export default OptimizedFavoritesService.getInstance();
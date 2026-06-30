import {
  getDatabase,
  ref,
  set,
  onValue,
  off,
  push,
  onDisconnect,
  serverTimestamp,
  runTransaction,
  get,
  increment,
} from "firebase/database";
import { initializeApp, getApps } from "firebase/app";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// Initialize Realtime Database (separate from Firestore)
const getRealtimeDatabase = () => {
  const apps = getApps();
  let app;

  if (apps.length === 0) {
    // If no app is initialized, initialize with basic config
    const firebaseConfig = {
      apiKey: "AIzaSyBAbBZyb3ENGpALGXTwErYNL2iJo5nr6A4",
      authDomain: "live-sports-tracker-chat.firebaseapp.com",
      projectId: "live-sports-tracker-chat",
      databaseURL:
        "https://live-sports-tracker-chat-default-rtdb.firebaseio.com", // You'll need to create this
      storageBucket: "live-sports-tracker-chat.firebasestorage.app",
      messagingSenderId: "228719774397",
      appId: "1:228719774397:web:66321ba2003c060fdc05d4",
    };
    app = initializeApp(firebaseConfig);
  } else {
    app = apps[0];
  }

  return getDatabase(app);
};

export class PresenceService {
  static database = null;
  static userPresenceRefs = new Map();
  static gameViewerListeners = new Map();

  /**
   * Initialize the realtime database
   */
  static init() {
    if (!this.database) {
      try {
        this.database = getRealtimeDatabase();

        // Test database connection
        this.testDatabaseConnection();
      } catch (error) {
        throw error;
      }
    } else {
    }
  }

  /**
   * Test database connection and permissions
   */
  static async testDatabaseConnection() {
    try {
      const testRef = ref(this.database, "test/connection");
      await set(testRef, { timestamp: Date.now(), test: "success" });
    } catch (error) {
      console.error(
        "❌ PresenceService - Database connection test failed:",
        error,
      );
      console.error(
        "❌ PresenceService - This might be a permissions issue. Check Firebase rules.",
      );
    }
  }

  /**
   * Generate or get persistent user ID
   */
  static async getUserId() {
    try {
      let userId = await AsyncStorage.getItem("presence_user_id");
      if (!userId) {
        userId = `user_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        await AsyncStorage.setItem("presence_user_id", userId);
      }
      return userId;
    } catch (error) {
      console.error("Error getting user ID:", error);
      return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  /**
   * Record a view for a game (increment cumulative viewer count)
   */
  static async recordGameView(gameId) {
    try {
      this.init();
      const userId = await this.getUserId();

      // Reference to this user's presence in this game
      const userGamePresenceRef = ref(
        this.database,
        `presence/games/${gameId}/viewers/${userId}`,
      );

      // Check if this user has already viewed this game
      const snapshot = await get(userGamePresenceRef);
      if (!snapshot.exists()) {
        // First time viewing this game - record the view
        await set(userGamePresenceRef, true);
        
        // Increment the total viewer count
        const viewerCountRef = ref(
          this.database,
          `presence/games/${gameId}/viewerCount`,
        );
        await set(viewerCountRef, increment(1));
      }

      return true;
    } catch (error) {
      console.error("❌ PresenceService.recordGameView - Error recording view:", error);
      console.error("❌ PresenceService.recordGameView - Error details:", {
        code: error.code,
        message: error.message,
        name: error.name,
      });
      return false;
    }
  }

  /**
   * Get live viewer count for a game
   */
  static subscribeToGameViewers(gameId, callback) {
    try {
      this.init();

      const gameViewerCountRef = ref(
        this.database,
        `presence/games/${gameId}/viewerCount`,
      );

      const unsubscribe = onValue(
        gameViewerCountRef,
        (snapshot) => {
          const viewerCount = snapshot.exists() ? snapshot.val() : 0;
          callback({ count: viewerCount, viewers: [] });
        },
        (error) => {
          console.error(
            "❌ PresenceService.subscribeToGameViewers - Firebase subscription error:",
            error,
          );
          console.error(
            "❌ PresenceService.subscribeToGameViewers - Error details:",
            {
              code: error.code,
              message: error.message,
              name: error.name,
            },
          );
          callback({ count: 0, viewers: [] });
        },
      );

      // Store listener for cleanup
      this.gameViewerListeners.set(gameId, unsubscribe);

      return unsubscribe;
    } catch (error) {
      console.error("Error subscribing to game viewers:", error);
      return () => {}; // Return no-op function
    }
  }

  /**
   * Unsubscribe from game viewer updates
   */
  static unsubscribeFromGameViewers(gameId) {
    const unsubscribe = this.gameViewerListeners.get(gameId);
    if (unsubscribe) {
      unsubscribe();
      this.gameViewerListeners.delete(gameId);
    }
  }

  /**
   * Get viewer counts for multiple games at once
   */
  static subscribeToMultipleGames(gameIds, callback) {
    const unsubscribers = [];
    const viewerCounts = {};

    const updateCallback = (gameId, viewerData) => {
      viewerCounts[gameId] = viewerData;
      callback({ ...viewerCounts });
    };

    gameIds.forEach((gameId) => {
      const unsubscribe = this.subscribeToGameViewers(gameId, (data) => {
        updateCallback(gameId, data);
      });
      unsubscribers.push(() => this.unsubscribeFromGameViewers(gameId));
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }

  /**
   * Cleanup all presence tracking
   */
  static async cleanup() {
    // Unsubscribe from all listeners
    for (const gameId of this.gameViewerListeners.keys()) {
      this.unsubscribeFromGameViewers(gameId);
    }
  }

  /**
   * Get presence statistics
   */
  static async getPresenceStats() {
    try {
      this.init();

      const allGamesRef = ref(this.database, "presence/games");

      return new Promise((resolve, reject) => {
        onValue(
          allGamesRef,
          (snapshot) => {
            const gamesData = snapshot.val() || {};
            const stats = {};

            Object.entries(gamesData).forEach(([gameId, gameData]) => {
              stats[gameId] = {
                totalViewers: gameData.viewerCount || 0,
              };
            });

            resolve(stats);
          },
          {
            onlyOnce: true,
          },
        );
      });
    } catch (error) {
      console.error("Error getting presence stats:", error);
      return {};
    }
  }
}

export default PresenceService;
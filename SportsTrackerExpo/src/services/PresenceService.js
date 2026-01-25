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
        error
      );
      console.error(
        "❌ PresenceService - This might be a permissions issue. Check Firebase rules."
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
   * Join a game (start tracking presence for specific game)
   */
  static async joinGame(gameId) {
    try {

      this.init();
      const userId = await this.getUserId();

      // Create presence object
      const presenceData = {
        userId,
        joinedAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
        platform: "mobile",
        version: "1.0.0",
      };

      // Reference to this user's presence in this game
      const userGamePresenceRef = ref(
        this.database,
        `presence/games/${gameId}/viewers/${userId}`
      );
      await set(userGamePresenceRef, presenceData);
      // Set up disconnect handler - remove user when they disconnect
      onDisconnect(userGamePresenceRef).remove();

      // Store reference for later cleanup
      this.userPresenceRefs.set(gameId, {
        ref: userGamePresenceRef,
        userId,
        gameId,
      });

      // Update last seen every 30 seconds
      const heartbeatInterval = setInterval(() => {
        set(
          ref(
            this.database,
            `presence/games/${gameId}/viewers/${userId}/lastSeen`
          ),
          serverTimestamp()
        );
      }, 30000);

      // Store interval for cleanup
      this.userPresenceRefs.get(gameId).heartbeatInterval = heartbeatInterval;

      return true;
    } catch (error) {
      console.error("❌ PresenceService.joinGame - Error joining game:", error);
      console.error("❌ PresenceService.joinGame - Error details:", {
        code: error.code,
        message: error.message,
        name: error.name,
      });
      return false;
    }
  }

  /**
   * Leave a game (stop tracking presence)
   */
  static async leaveGame(gameId) {
    try {
      const presenceData = this.userPresenceRefs.get(gameId);
      if (!presenceData) {
        return;
      }

      // Clear heartbeat
      if (presenceData.heartbeatInterval) {
        clearInterval(presenceData.heartbeatInterval);
      }
      await set(presenceData.ref, null);

      // Clean up
      this.userPresenceRefs.delete(gameId);

    } catch (error) {
      console.error(
        "❌ PresenceService.leaveGame - Error leaving game:",
        error
      );
    }
  }

  /**
   * Get live viewer count for a game
   */
  static subscribeToGameViewers(gameId, callback) {
    try {
      this.init();

      const gameViewersRef = ref(
        this.database,
        `presence/games/${gameId}/viewers`
      );

      const unsubscribe = onValue(
        gameViewersRef,
        (snapshot) => {
          const viewers = snapshot.val() || {};
          const currentTime = Date.now();

          // Filter out stale viewers (haven't been seen in 2 minutes)
          const activeViewers = Object.entries(viewers).filter(
            ([userId, data]) => {
              if (!data.lastSeen) return false;

              const lastSeenTime =
                typeof data.lastSeen === "number"
                  ? data.lastSeen
                  : new Date(data.lastSeen).getTime();

              return currentTime - lastSeenTime < 2 * 60 * 1000; // 2 minutes
            }
          );

          const viewerCount = activeViewers.length;
          const viewerData = {
            count: viewerCount,
            viewers: activeViewers.map(([userId, data]) => ({
              userId,
              joinedAt: data.joinedAt,
              platform: data.platform || "unknown",
            })),
          };

          // Update stored peak for this game if current active viewers exceed it.
          const peakRef = ref(this.database, `presence/games/${gameId}/peak`);

          (async () => {
            try {

              // Log database URL if available to help diagnose rule/project mismatches
              try {
                const dbUrl = this.database?.app?.options?.databaseURL ||
                  this.database?.app?.options?.databaseURL;
              } catch (e) {
                // ignore
              }

              // Read current peak value to inspect permissions/errors
              let currentPeakVal = null;
              try {
                const peakSnap = await get(peakRef);
                currentPeakVal = peakSnap.exists() ? peakSnap.val() : null;
                console.log("PresenceService: current peak value:", currentPeakVal);
              } catch (readErr) {
                console.error(
                  "❌ PresenceService.subscribeToGameViewers - Error reading peak before transaction:",
                  readErr
                );
              }

              const intendedPeak = { count: viewerCount, recordedAt: Date.now() };

              const currentPeakCount = (currentPeakVal && currentPeakVal.count) || 0;

              // If there's no higher peak to set, skip writes and return current peak
              if (!(viewerCount > currentPeakCount)) {
                // No update needed
                callback({ ...viewerData, peak: currentPeakVal });
                return;
              }

              // Try a direct set for debugging to capture permission errors clearly.
              console.log("PresenceService: attempting debug set of peak:", intendedPeak);
              try {
                await set(peakRef, intendedPeak);
                console.log("PresenceService: debug set succeeded");
              } catch (setErr) {
                console.error("❌ PresenceService: debug set failed:", {
                  message: setErr?.message,
                  name: setErr?.name,
                  code: setErr?.code,
                  stack: setErr?.stack,
                  toString: String(setErr),
                });
              }

              const txResult = await runTransaction(peakRef, (currentPeak) => {
                const currentPeakCountInner = (currentPeak && currentPeak.count) || 0;
                if (viewerCount > currentPeakCountInner) {
                  return intendedPeak;
                }
                return currentPeak;
              });

              const peakVal = (txResult.snapshot && txResult.snapshot.val()) || null;
              console.log("PresenceService: runTransaction result:", {
                committed: txResult.committed,
                peakVal,
              });

              // Attach peak info to the data passed back to consumers
              callback({ ...viewerData, peak: peakVal });
            } catch (err) {
              // Provide rich diagnostics for permission_denied and other errors
              try {
              } catch (logErr) {
                console.error("Error logging transaction error:", logErr);
              }

              // Fallback: return viewer data without peak
              callback(viewerData);
            }
          })();
        },
        (error) => {
          console.error(
            "❌ PresenceService.subscribeToGameViewers - Firebase subscription error:",
            error
          );
          console.error(
            "❌ PresenceService.subscribeToGameViewers - Error details:",
            {
              code: error.code,
              message: error.message,
              name: error.name,
            }
          );
          callback({ count: 0, viewers: [] });
        }
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
    // Leave all games
    for (const gameId of this.userPresenceRefs.keys()) {
      await this.leaveGame(gameId);
    }

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
              const viewers = gameData.viewers || {};
              const activeViewers = Object.entries(viewers).filter(
                ([userId, data]) => {
                  if (!data.lastSeen) return false;

                  const lastSeenTime =
                    typeof data.lastSeen === "number"
                      ? data.lastSeen
                      : new Date(data.lastSeen).getTime();

                  return Date.now() - lastSeenTime < 2 * 60 * 1000;
                }
              );

              stats[gameId] = {
                totalViewers: activeViewers.length,
                platforms: activeViewers.reduce((acc, [, data]) => {
                  const platform = data.platform || "unknown";
                  acc[platform] = (acc[platform] || 0) + 1;
                  return acc;
                }, {}),
              };
            });

            resolve(stats);
          },
          {
            onlyOnce: true,
          }
        );
      });
    } catch (error) {
      console.error("Error getting presence stats:", error);
      return {};
    }
  }
}

export default PresenceService;

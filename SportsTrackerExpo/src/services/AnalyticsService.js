import { Platform } from "react-native";
import Constants from "expo-constants";
import app from "../config/firebase"; // Import Firebase app (web SDK)

class AnalyticsService {
  constructor() {
    this.initialized = false;
    this.isDevelopment = __DEV__;
    // Detect Expo Go / managed client
    this.isExpoGo = Constants.appOwnership === "expo";
    // Allow opting into analytics during development via config or env var
    const extra = (Constants.manifest && Constants.manifest.extra) ||
      (Constants.expoConfig && Constants.expoConfig.extra) || {};
    this.allowAnalyticsInDev =
      !!(
        extra.enableAnalyticsInDev ||
        (typeof process !== "undefined" && process.env && process.env.EXPO_ENABLE_ANALYTICS_IN_DEV === "1")
      );
    this._analyticsModule = null; // will hold dynamic import of native analytics
    this._analytics = null; // will hold analytics instance and function refs
  }

  async initialize() {
    try {
      // Determine whether native analytics should be initialized.
      // Follow UpdateService logic: prefer native only for standalone/bare non-dev builds,
      // but allow forcing analytics in dev via `enableAnalyticsInDev`.
      const isNativeEnv = Platform.OS !== 'web' && (Constants.executionEnvironment === 'standalone' || Constants.executionEnvironment === 'bare');
      const shouldInitNative = (!__DEV__ && isNativeEnv) || this.allowAnalyticsInDev;
      if (!shouldInitNative) {
        console.log('Firebase Analytics: Skipping native initialization (not standalone/bare or not enabled in dev)');
        return;
      }

      // Check if Firebase app is available (web SDK)
      if (!app) {
        console.warn(
          "Firebase app not available, skipping analytics initialization"
        );
        return;
      }

      // Dynamically import the native analytics module to avoid errors in Expo Go
      try {
        // Dynamically import analytics and app modules
        const analyticsModule = await import("@react-native-firebase/analytics");
        const appModule = await import("@react-native-firebase/app");

        // Resolve helpers for both modular (v22+) and namespaced APIs
        const getApp = appModule.getApp || (appModule.default && appModule.default.getApp);
        const getAnalytics = analyticsModule.getAnalytics || (analyticsModule.default && analyticsModule.default.getAnalytics);
        const setAnalyticsCollectionEnabledFn =
          analyticsModule.setAnalyticsCollectionEnabled ||
          (analyticsModule.default && analyticsModule.default.setAnalyticsCollectionEnabled);
        const logEventFn = analyticsModule.logEvent || (analyticsModule.default && analyticsModule.default.logEvent);
        const setUserIdFn = analyticsModule.setUserId || (analyticsModule.default && analyticsModule.default.setUserId);
        const setUserPropertyFn = analyticsModule.setUserProperty || (analyticsModule.default && analyticsModule.default.setUserProperty);
        const logScreenViewFn = analyticsModule.logScreenView || (analyticsModule.default && analyticsModule.default.logScreenView);

        // Create analytics instance (prefer modular getAnalytics(getApp()))
        let analyticsInstance = null;
        try {
          if (getAnalytics && getApp) {
            analyticsInstance = getAnalytics(getApp());
          } else if (typeof analyticsModule === "function") {
            // older namespaced default export (analytics())
            analyticsInstance = analyticsModule();
          } else if (analyticsModule && analyticsModule.default && typeof analyticsModule.default === "function") {
            analyticsInstance = analyticsModule.default();
          }
        } catch (e) {
          console.warn("Failed to obtain analytics instance:", e.message || e);
        }

        const analyticsEnabled = !this.isDevelopment || this.allowAnalyticsInDev;

        // Call the appropriate setAnalyticsCollectionEnabled variant
        try {
          if (setAnalyticsCollectionEnabledFn) {
            // modular: setAnalyticsCollectionEnabled(analyticsInstance, enabled)
            if (analyticsInstance && setAnalyticsCollectionEnabledFn.length >= 2) {
              await setAnalyticsCollectionEnabledFn(analyticsInstance, analyticsEnabled);
            } else {
              // namespaced: analyticsInstance.setAnalyticsCollectionEnabled(enabled) or setAnalyticsCollectionEnabled(enabled)
              if (analyticsInstance && typeof analyticsInstance.setAnalyticsCollectionEnabled === "function") {
                await analyticsInstance.setAnalyticsCollectionEnabled(analyticsEnabled);
              } else {
                await setAnalyticsCollectionEnabledFn(analyticsEnabled);
              }
            }
          } else if (analyticsInstance && typeof analyticsInstance.setAnalyticsCollectionEnabled === "function") {
            await analyticsInstance.setAnalyticsCollectionEnabled(analyticsEnabled);
          }
        } catch (e) {
          console.warn("Failed to set analytics collection flag:", e.message || e);
        }

        // Save resolved refs for later use
        this._analytics = {
          instance: analyticsInstance,
          fn: {
            setAnalyticsCollectionEnabled: setAnalyticsCollectionEnabledFn,
            logEvent: logEventFn,
            setUserId: setUserIdFn,
            setUserProperty: setUserPropertyFn,
            logScreenView: logScreenViewFn,
          },
        };

        this.initialized = true;
        console.log("Firebase Analytics initialized successfully; analyticsEnabled=", analyticsEnabled);

        // Log app open event
        this.logEvent("app_open", {
          platform: Platform.OS,
          development: this.isDevelopment,
        });
      } catch (err) {
        // If native module not available, skip gracefully
        console.warn(
          "Native Firebase Analytics not available:",
          err.message || err
        );
        return;
      }
    } catch (error) {
      console.error("Firebase Analytics initialization failed:", error);
    }
  }

  async logEvent(eventName, parameters = {}) {
    try {
      if (!this.initialized || this.isExpoGo || !this._analytics) {
        console.log(
          `Analytics Event (${this.isExpoGo ? "Expo Go" : "Not Initialized"}):`,
          eventName,
          parameters
        );
        return;
      }

      const { instance, fn } = this._analytics;
      if (fn && typeof fn.logEvent === "function") {
        // modular: logEvent(analyticsInstance, name, params)
        if (fn.logEvent.length >= 2) {
          await fn.logEvent(instance, eventName, parameters);
        } else {
          // namespaced: instance.logEvent(name, params) or fn.logEvent(name, params)
          if (instance && typeof instance.logEvent === "function") {
            await instance.logEvent(eventName, parameters);
          } else {
            await fn.logEvent(eventName, parameters);
          }
        }
        console.log("Analytics Event Logged:", eventName, parameters);
        return;
      }

      // Fallback: if instance has logEvent
      if (instance && typeof instance.logEvent === "function") {
        await instance.logEvent(eventName, parameters);
        console.log("Analytics Event Logged:", eventName, parameters);
        return;
      }

      console.warn("No logEvent function available on analytics module");
    } catch (error) {
      console.error("Failed to log analytics event:", error);
    }
  }

  async setUserId(userId) {
    try {
      if (!this.initialized || this.isExpoGo || !this._analytics) return;

      const { instance, fn } = this._analytics;
      if (fn && typeof fn.setUserId === "function") {
        if (fn.setUserId.length >= 2) await fn.setUserId(instance, userId);
        else await fn.setUserId(userId);
        console.log("Analytics User ID set:", userId);
        return;
      }

      if (instance && typeof instance.setUserId === "function") {
        await instance.setUserId(userId);
        console.log("Analytics User ID set:", userId);
      }
    } catch (error) {
      console.error("Failed to set analytics user ID:", error);
    }
  }

  async setUserProperty(name, value) {
    try {
      if (!this.initialized || this.isExpoGo || !this._analytics) return;

      const { instance, fn } = this._analytics;
      if (fn && typeof fn.setUserProperty === "function") {
        if (fn.setUserProperty.length >= 2) await fn.setUserProperty(instance, name, value);
        else await fn.setUserProperty(name, value);
        console.log("Analytics User Property set:", name, value);
        return;
      }

      if (instance && typeof instance.setUserProperty === "function") {
        await instance.setUserProperty(name, value);
        console.log("Analytics User Property set:", name, value);
      }
    } catch (error) {
      console.error("Failed to set analytics user property:", error);
    }
  }

  async logScreenView(screenName, screenClass) {
    try {
      if (!this.initialized || this.isExpoGo || !this._analytics) {
        console.log(
          `Screen View (${this.isExpoGo ? "Expo Go" : "Not Initialized"}):`,
          screenName
        );
        return;
      }

      const { instance, fn } = this._analytics;
      const payload = { screen_name: screenName, screen_class: screenClass || screenName };
      if (fn && typeof fn.logScreenView === "function") {
        if (fn.logScreenView.length >= 2) await fn.logScreenView(instance, payload);
        else await fn.logScreenView(payload);
        console.log("Screen View Logged:", screenName);
        return;
      }

      if (instance && typeof instance.logScreenView === "function") {
        await instance.logScreenView(payload);
        console.log("Screen View Logged:", screenName);
      }
    } catch (error) {
      console.error("Failed to log screen view:", error);
    }
  }

  // Custom events for your sports app
  async logSportSelection(sport) {
    await this.logEvent("sport_selected", {
      sport_name: sport,
      timestamp: Date.now(),
    });
  }

  async logGameView(sport, gameId, teamHome, teamAway) {
    await this.logEvent("game_viewed", {
      sport,
      game_id: gameId,
      home_team: teamHome,
      away_team: teamAway,
    });
  }

  async logTeamView(sport, teamId, teamName) {
    await this.logEvent("team_viewed", {
      sport,
      team_id: teamId,
      team_name: teamName,
    });
  }

  async logPlayerView(sport, playerId, playerName) {
    await this.logEvent("player_viewed", {
      sport,
      player_id: playerId,
      player_name: playerName,
    });
  }

  async logFavoriteAction(action, sport, itemType, itemId) {
    await this.logEvent("favorite_action", {
      action, // 'add' or 'remove'
      sport,
      item_type: itemType, // 'team', 'player', 'game'
      item_id: itemId,
    });
  }

  async logSearchAction(sport, searchTerm, resultsCount) {
    await this.logEvent("search_performed", {
      sport,
      search_term: searchTerm,
      results_count: resultsCount,
    });
  }

  async logThemeChange(newTheme) {
    await this.logEvent("theme_changed", {
      theme: newTheme,
      timestamp: Date.now(),
    });
  }

  async logAppIconChange(newIcon) {
    await this.logEvent("app_icon_changed", {
      icon: newIcon,
      timestamp: Date.now(),
    });
  }
}

// Create and export a singleton instance
const analyticsService = new AnalyticsService();
export default analyticsService;

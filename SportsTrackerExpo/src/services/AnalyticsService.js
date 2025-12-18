import { Platform } from "react-native";
import Constants from "expo-constants";
import app from "../config/firebase"; // Import Firebase app (web SDK)

class AnalyticsService {
  constructor() {
    this.initialized = false;
    this.isDevelopment = __DEV__;
    // Detect Expo Go / managed client
    this.isExpoGo =
      Constants.appOwnership === "expo" ||
      Constants.executionEnvironment === "storeClient";
    this._analyticsModule = null; // will hold dynamic import of native analytics
  }

  async initialize() {
    try {
      // Only initialize in production builds (not Expo Go)
      if (this.isExpoGo) {
        console.log("Firebase Analytics: Skipping initialization in Expo Go");
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
        const analytics = (await import("@react-native-firebase/analytics"))
          .default;
        this._analyticsModule = analytics;

        // Initialize Firebase Analytics (native)
        await analytics().setAnalyticsCollectionEnabled(!this.isDevelopment);

        this.initialized = true;
        console.log("Firebase Analytics initialized successfully");

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
      if (!this.initialized || this.isExpoGo || !this._analyticsModule) {
        console.log(
          `Analytics Event (${this.isExpoGo ? "Expo Go" : "Not Initialized"}):`,
          eventName,
          parameters
        );
        return;
      }

      await this._analyticsModule().logEvent(eventName, parameters);
      console.log("Analytics Event Logged:", eventName, parameters);
    } catch (error) {
      console.error("Failed to log analytics event:", error);
    }
  }

  async setUserId(userId) {
    try {
      if (!this.initialized || this.isExpoGo || !this._analyticsModule) return;

      await this._analyticsModule().setUserId(userId);
      console.log("Analytics User ID set:", userId);
    } catch (error) {
      console.error("Failed to set analytics user ID:", error);
    }
  }

  async setUserProperty(name, value) {
    try {
      if (!this.initialized || this.isExpoGo || !this._analyticsModule) return;

      await this._analyticsModule().setUserProperty(name, value);
      console.log("Analytics User Property set:", name, value);
    } catch (error) {
      console.error("Failed to set analytics user property:", error);
    }
  }

  async logScreenView(screenName, screenClass) {
    try {
      if (!this.initialized || this.isExpoGo || !this._analyticsModule) {
        console.log(
          `Screen View (${this.isExpoGo ? "Expo Go" : "Not Initialized"}):`,
          screenName
        );
        return;
      }
      await this._analyticsModule().logScreenView({
        screen_name: screenName,
        screen_class: screenClass || screenName,
      });
      console.log("Screen View Logged:", screenName);
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

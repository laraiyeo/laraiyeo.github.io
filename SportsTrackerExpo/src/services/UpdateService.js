import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Conditionally import expo-updates only for production builds
let Updates;
if (!__DEV__ && Constants.executionEnvironment === 'standalone') {
  try {
    Updates = require('expo-updates');
  } catch (error) {
    console.log('expo-updates not available:', error.message);
    Updates = null;
  }
} else {
  Updates = null;
}

class UpdateService {
  /**
   * Check for available updates and download them
   * @returns {Promise<{isAvailable: boolean, isNew?: boolean}>}
   */
  static async checkForUpdates() {
    try {
      // Check if Updates is available
      if (!Updates) {
        console.log('Updates not available - running in development or Expo Go');
        return { isAvailable: false };
      }

      // Only check for updates in standalone apps, not in development
      if (__DEV__ || !Updates.isEnabled) {
        console.log('Updates disabled in development mode or Expo Go');
        return { isAvailable: false };
      }

      console.log('Checking for updates...');
      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable) {
        console.log('Update available, downloading...');
        await Updates.fetchUpdateAsync();
        console.log('Update downloaded successfully');
        return { isAvailable: true, isNew: true };
      } else {
        console.log('No updates available');
        return { isAvailable: false };
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      return { isAvailable: false, error: error.message };
    }
  }

  /**
   * Restart the app to apply downloaded updates
   */
  static async restartApp() {
    try {
      if (!Updates || !Updates.isEnabled) {
        console.log('Cannot restart - updates not available or not enabled');
        return false;
      }

      console.log('Restarting app to apply updates...');
      await Updates.reloadAsync();
      return true;
    } catch (error) {
      console.error('Error restarting app:', error);
      return false;
    }
  }

  /**
   * Get current update information
   * @returns {Promise<object>}
   */
  static async getCurrentUpdateInfo() {
    try {
      if (!Updates) {
        return {
          isEnabled: false,
          message: 'Updates not available (development mode, Expo Go, or not properly configured)'
        };
      }

      if (!Updates.isEnabled) {
        return {
          isEnabled: false,
          message: 'Updates not enabled (development mode or Expo Go)'
        };
      }

      const manifest = await Updates.getLocalAssetsAsync();
      const updateId = Updates.updateId;
      const runtimeVersion = Updates.runtimeVersion;
      const channel = Updates.channel;

      return {
        isEnabled: true,
        updateId: updateId || 'No update ID',
        runtimeVersion: runtimeVersion || 'No runtime version',
        channel: channel || 'No channel',
        lastUpdate: manifest ? 'Available' : 'No local assets'
      };
    } catch (error) {
      console.error('Error getting update info:', error);
      return {
        isEnabled: false,
        error: error.message
      };
    }
  }

  /**
   * Check for updates on app startup (recommended)
   * @param {boolean} autoRestart - Whether to automatically restart after download
   */
  static async checkForUpdatesOnStartup(autoRestart = false) {
    try {
      // Wait a bit after app startup
      setTimeout(async () => {
        const result = await this.checkForUpdates();
        
        if (result.isNew && autoRestart) {
          // Auto restart after a brief delay
          setTimeout(() => {
            this.restartApp();
          }, 3000);
        }
        
        return result;
      }, 5000); // Check 5 seconds after startup
    } catch (error) {
      console.error('Error in startup update check:', error);
    }
  }

  /**
   * Manual update check with user prompt
   * @param {Function} onUpdateAvailable - Callback when update is available
   * @param {Function} onNoUpdate - Callback when no update is available
   * @param {Function} onError - Callback when error occurs
   */
  static async checkForUpdatesManually(onUpdateAvailable, onNoUpdate, onError) {
    try {
      const result = await this.checkForUpdates();
      
      if (result.error) {
        onError && onError(result.error);
      } else if (result.isNew) {
        onUpdateAvailable && onUpdateAvailable();
      } else {
        onNoUpdate && onNoUpdate();
      }
      
      return result;
    } catch (error) {
      console.error('Manual update check failed:', error);
      onError && onError(error.message);
    }
  }
}

export default UpdateService;
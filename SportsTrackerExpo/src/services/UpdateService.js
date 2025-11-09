import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Conditionally import expo-updates only for production builds on native platforms
let Updates;
if (!__DEV__ && Platform.OS !== 'web' && (Constants.executionEnvironment === 'standalone' || Constants.executionEnvironment === 'bare')) {
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
   * Check if updates are available (without downloading)
   * @returns {Promise<{isAvailable: boolean, reason?: string}>}
   */
  static async checkForUpdatesOnly() {
    try {
      console.log('=== UpdateService.checkForUpdatesOnly() START ===');
      console.log('Updates object exists:', !!Updates);
      console.log('__DEV__:', __DEV__);
      console.log('Constants.executionEnvironment:', Constants.executionEnvironment);
      
      // Check if Updates is available
      if (!Updates) {
        console.log('Updates not available - running in development or Expo Go');
        return { isAvailable: false, reason: 'Updates object not available' };
      }

      console.log('Updates.isEnabled:', Updates.isEnabled);
      
      // Only check for updates in standalone apps, not in development
      if (__DEV__ || !Updates.isEnabled) {
        console.log('Updates disabled in development mode or Expo Go');
        return { isAvailable: false, reason: 'Updates disabled or in dev mode' };
      }

      console.log('Checking for updates...');
      const update = await Updates.checkForUpdateAsync();
      console.log('Update check result:', update);

      if (update.isAvailable) {
        console.log('Update available - NOT downloading yet');
        return { isAvailable: true };
      } else {
        console.log('No updates available');
        return { isAvailable: false, reason: 'No new updates available' };
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      return { isAvailable: false, error: error.message };
    }
  }

  /**
   * Download and prepare update for restart
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async downloadUpdate() {
    try {
      console.log('=== UpdateService.downloadUpdate() START ===');
      
      if (!Updates || !Updates.isEnabled) {
        console.log('Updates not available or not enabled');
        return { success: false, error: 'Updates not available' };
      }

      console.log('Downloading update...');
      const fetchResult = await Updates.fetchUpdateAsync();
      console.log('Update fetch result:', fetchResult);
      
      console.log('Update downloaded successfully');
      return { success: true };
    } catch (error) {
      console.error('Error downloading update:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check for available updates and download them (legacy method)
   * @returns {Promise<{isAvailable: boolean, isNew?: boolean}>}
   */
  static async checkForUpdates() {
    try {
      const checkResult = await this.checkForUpdatesOnly();
      
      if (checkResult.isAvailable) {
        const downloadResult = await this.downloadUpdate();
        if (downloadResult.success) {
          return { isAvailable: true, isNew: true };
        } else {
          return { isAvailable: true, isNew: false, error: downloadResult.error };
        }
      }
      
      return checkResult;
    } catch (error) {
      console.error('Error in checkForUpdates:', error);
      return { isAvailable: false, error: error.message };
    }
  }

  /**
   * Restart the app to apply downloaded updates
   * @param {boolean} markForFeaturePopup - Whether to show new features popup after restart
   */
  static async restartApp(markForFeaturePopup = false) {
    try {
      if (!Updates || !Updates.isEnabled) {
        console.log('Cannot restart - updates not available or not enabled');
        return false;
      }

      // Mark that we're restarting for an update
      if (markForFeaturePopup) {
        await this.markPendingUpdateRestart();
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
   * Mark that app will restart for an update (to show features popup later)
   */
  static async markPendingUpdateRestart() {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem('pendingUpdateRestart', JSON.stringify({
        timestamp: new Date().getTime(),
        version: Updates?.updateId || 'unknown'
      }));
    } catch (error) {
      console.error('Error marking pending update restart:', error);
    }
  }

  /**
   * Check if app just restarted from an update and clear the flag
   * @returns {Promise<{didRestart: boolean, updateInfo?: object}>}
   */
  static async checkAndClearUpdateRestart() {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const pendingRestart = await AsyncStorage.getItem('pendingUpdateRestart');
      
      if (pendingRestart) {
        await AsyncStorage.removeItem('pendingUpdateRestart');
        const restartInfo = JSON.parse(pendingRestart);
        
        // Only show popup if restart was recent (within last 2 minutes)
        const timeDiff = new Date().getTime() - restartInfo.timestamp;
        const isRecent = timeDiff < 2 * 60 * 1000; // 2 minutes
        
        return {
          didRestart: isRecent,
          updateInfo: restartInfo
        };
      }
      
      return { didRestart: false };
    } catch (error) {
      console.error('Error checking update restart:', error);
      return { didRestart: false };
    }
  }

  /**
   * Get current update information
   * @returns {Promise<object>}
   */
  static async getCurrentUpdateInfo() {
    try {
      console.log('=== UpdateService.getCurrentUpdateInfo() START ===');
      
      if (!Updates) {
        const info = {
          isEnabled: false,
          message: 'Updates not available (development mode, Expo Go, or not properly configured)',
          __DEV__: __DEV__,
          executionEnvironment: Constants.executionEnvironment
        };
        console.log('Update info (no Updates):', info);
        return info;
      }

      if (!Updates.isEnabled) {
        const info = {
          isEnabled: false,
          message: 'Updates not enabled (development mode or Expo Go)',
          __DEV__: __DEV__,
          executionEnvironment: Constants.executionEnvironment,
          updatesIsEnabled: Updates.isEnabled
        };
        console.log('Update info (not enabled):', info);
        return info;
      }

      let manifest = null;
      let updateId = null;
      let runtimeVersion = null;
      let channel = null;

      // Safely try to get each property/method
      try {
        updateId = Updates.updateId || null;
      } catch (e) { console.log('updateId not available:', e.message); }

      try {
        runtimeVersion = Updates.runtimeVersion || null;
      } catch (e) { console.log('runtimeVersion not available:', e.message); }

      try {
        channel = Updates.channel || null;
      } catch (e) { console.log('channel not available:', e.message); }

      try {
        if (Updates.getLocalAssetsAsync && typeof Updates.getLocalAssetsAsync === 'function') {
          manifest = await Updates.getLocalAssetsAsync();
        }
      } catch (e) { console.log('getLocalAssetsAsync not available:', e.message); }

      const info = {
        isEnabled: true,
        updateId: updateId || 'No update ID',
        runtimeVersion: runtimeVersion || 'No runtime version',
        channel: channel || 'No channel',
        lastUpdate: manifest ? `Available (${manifest.length} assets)` : 'No local assets',
        __DEV__: __DEV__,
        executionEnvironment: Constants.executionEnvironment,
        updatesIsEnabled: Updates.isEnabled,
        availableMethods: Object.getOwnPropertyNames(Updates).filter(name => typeof Updates[name] === 'function')
      };
      
      console.log('Update info (enabled):', info);
      return info;
    } catch (error) {
      console.error('Error getting update info:', error);
      const errorInfo = {
        isEnabled: false,
        error: error.message,
        __DEV__: __DEV__,
        executionEnvironment: Constants.executionEnvironment
      };
      console.log('Update info (error):', errorInfo);
      return errorInfo;
    }
  }

  /**
   * Check for updates on app startup (recommended)
   * @param {Function} onUpdateAvailable - Callback when update is available for user prompt
   */
  static async checkForUpdatesOnStartup(onUpdateAvailable = null) {
    try {
      console.log('Starting automatic update check on app startup...');
      
      // Wait a bit after app startup to let the app fully load
      return new Promise((resolve) => {
        setTimeout(async () => {
          try {
            const result = await this.checkForUpdatesOnly(); // Only check, don't download
            console.log('Startup update check result:', result);
            
            if (result.isAvailable) {
              console.log('Update available, prompting user...');
              // Call the callback to show user prompt
              if (onUpdateAvailable) {
                onUpdateAvailable();
              }
            } else {
              console.log('No updates available on startup');
            }
            
            resolve(result);
          } catch (error) {
            console.error('Error in startup update check:', error);
            resolve({ isAvailable: false, error: error.message });
          }
        }, 3000); // Check 3 seconds after startup
      });
    } catch (error) {
      console.error('Error in startup update check setup:', error);
      return { isAvailable: false, error: error.message };
    }
  }

  /**
   * Manual update check with user prompt
   * @param {Function} onUpdateAvailable - Callback when update is available
   * @param {Function} onNoUpdate - Callback when no update is available
   * @param {Function} onError - Callback when error occurs
   * @param {boolean} autoRestart - Whether to automatically restart after download
   */
  static async checkForUpdatesManually(onUpdateAvailable, onNoUpdate, onError, autoRestart = false) {
    try {
      const result = await this.checkForUpdates();
      
      if (result.error) {
        onError && onError(result.error);
      } else if (result.isNew) {
        onUpdateAvailable && onUpdateAvailable();
        
        // Auto restart if enabled
        if (autoRestart) {
          setTimeout(() => {
            this.restartApp(true); // Mark for popup
          }, 2000); // Wait 2 seconds to show the update message
        }
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
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Conditionally import dynamic app icon only for native platforms
let setAppIcon, getAppIcon;
if (Platform.OS !== 'web') {
  try {
    const dynamicAppIcon = require('nixa-expo-dynamic-app-icon');
    setAppIcon = dynamicAppIcon.setAppIcon;
    getAppIcon = dynamicAppIcon.getAppIcon;
  } catch (error) {
    console.warn('Dynamic app icon not available:', error.message);
  }
}

class AppIconService {
  /**
   * Check if we're running in Expo Go
   */
  static isExpoGo() {
    // In Expo Go, executionEnvironment is 'storeClient'
    // In development builds and production, it's 'standalone'
    return Constants.executionEnvironment === 'storeClient';
  }

  /**
   * Changes the app icon based on theme and color palette
   * @param {boolean} isDarkMode - Whether dark mode is enabled
   * @param {string} colorPalette - The current color palette (blue, red, green, purple, gold)
   */
  static async changeAppIcon(isDarkMode, colorPalette) {
    try {
      // Check if running on web
      if (Platform.OS === 'web') {
        console.log('Dynamic app icons are not supported on web platform.');
        return false;
      }

      // Check if functions are available
      if (!setAppIcon) {
        console.log('Dynamic app icon functionality not available.');
        return false;
      }

      // Check if running in Expo Go
      if (this.isExpoGo()) {
        console.log('Dynamic app icons are not supported in Expo Go. Build a development build to test this feature.');
        return false;
      }

      // Construct the icon name based on theme and color
      const theme = isDarkMode ? 'dark' : 'light';
      const iconName = `${theme}-${colorPalette}`;
      
      // Set the alternate icon using nixa-expo-dynamic-app-icon
      const result = await setAppIcon(iconName, 'DEFAULT');
      
      if (result === false) {
        console.log(`Failed to change app icon to: ${iconName}`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error changing app icon:', error);
      return false;
    }
  }

  /**
   * Gets the current app icon name
   * @returns {Promise<string|null>} The current icon name or null if default
   */
  static async getCurrentIcon() {
    try {
      // Check if running on web
      if (Platform.OS === 'web') {
        console.log('Cannot get current app icon on web platform');
        return null;
      }

      // Check if functions are available
      if (!getAppIcon) {
        console.log('Dynamic app icon functionality not available.');
        return null;
      }

      if (this.isExpoGo()) {
        console.log('Cannot get current app icon in Expo Go');
        return null;
      }

      const currentIcon = await getAppIcon();
      return currentIcon === 'DEFAULT' ? null : currentIcon;
    } catch (error) {
      console.error('Error getting current app icon:', error);
      return null;
    }
  }

  /**
   * Resets to the default app icon (dark-red)
   */
  static async resetToDefaultIcon() {
    try {
      if (this.isExpoGo()) {
        console.log('Cannot reset app icon in Expo Go');
        return false;
      }

      // Reset to dark-red as the default icon
      const result = await setAppIcon('dark-red', 'DEFAULT');
      
      if (result === false) {
        console.log('Failed to reset to default app icon');
        return false;
      }
      
      console.log('Reset to default app icon (dark-red)');
      return true;
    } catch (error) {
      console.error('Error resetting to default app icon:', error);
      return false;
    }
  }

  /**
   * Gets all available icon combinations
   */
  static getAvailableIcons() {
    const themes = ['dark', 'light'];
    const colors = ['blue', 'red', 'green', 'purple', 'gold'];
    
    const icons = [];
    themes.forEach(theme => {
      colors.forEach(color => {
        icons.push(`${theme}-${color}`);
      });
    });
    
    return icons;
  }
}

export default AppIconService;
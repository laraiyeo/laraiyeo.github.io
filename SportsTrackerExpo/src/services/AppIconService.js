import * as Application from 'expo-application';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

class AppIconService {
  /**
   * Check if we're running in Expo Go
   */
  static isExpoGo() {
    return Constants.executionEnvironment === 'standalone' ? false : true;
  }

  /**
   * Changes the app icon based on theme and color palette
   * @param {boolean} isDarkMode - Whether dark mode is enabled
   * @param {string} colorPalette - The current color palette (blue, red, green, purple, gold)
   */
  static async changeAppIcon(isDarkMode, colorPalette) {
    try {
      // Check if running in Expo Go
      if (this.isExpoGo()) {
        console.log('Dynamic app icons are not supported in Expo Go. Build a development build to test this feature.');
        return false;
      }

      // Only available on iOS
      if (Platform.OS !== 'ios') {
        console.log('Dynamic app icons are only supported on iOS');
        return false;
      }

      // Check if Application.supportsAlternateIconsAsync exists
      if (!Application.supportsAlternateIconsAsync) {
        console.log('Application.supportsAlternateIconsAsync is not available');
        return false;
      }

      // Check if the device supports alternate icons
      const supportsAlternateIcons = await Application.supportsAlternateIconsAsync();
      if (!supportsAlternateIcons) {
        console.log('This device does not support alternate app icons');
        return false;
      }

      // Construct the icon name based on theme and color
      const theme = isDarkMode ? 'dark' : 'light';
      const iconName = `${theme}-${colorPalette}`;
      
      console.log(`Attempting to change app icon to: ${iconName}`);

      // Set the alternate icon
      await Application.setAlternateIconAsync(iconName);
      
      console.log(`Successfully changed app icon to: ${iconName}`);
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
      if (this.isExpoGo()) {
        console.log('Cannot get current app icon in Expo Go');
        return null;
      }

      if (Platform.OS !== 'ios') {
        return null;
      }

      if (!Application.getAlternateIconAsync) {
        console.log('Application.getAlternateIconAsync is not available');
        return null;
      }

      const currentIcon = await Application.getAlternateIconAsync();
      return currentIcon;
    } catch (error) {
      console.error('Error getting current app icon:', error);
      return null;
    }
  }

  /**
   * Resets to the default app icon
   */
  static async resetToDefaultIcon() {
    try {
      if (this.isExpoGo()) {
        console.log('Cannot reset app icon in Expo Go');
        return false;
      }

      if (Platform.OS !== 'ios') {
        return false;
      }

      if (!Application.setAlternateIconAsync) {
        console.log('Application.setAlternateIconAsync is not available');
        return false;
      }

      await Application.setAlternateIconAsync(null);
      console.log('Reset to default app icon');
      return true;
    } catch (error) {
      console.error('Error resetting to default app icon:', error);
      return false;
    }
  }

  /**
   * Gets all available icon combinations
   * @returns {Array} Array of all possible icon combinations
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
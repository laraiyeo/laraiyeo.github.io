import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { stripSportSuffix } from '../utils/TeamIdMapping';
import AppIconService from '../services/AppIconService';

const ThemeContext = createContext();

const colorPalettes = {
  blue: {
    primary: '#1e40af',      // Brighter blue for better visibility in dark mode
    primaryDark: '#1e3a8a',  // Slightly lighter than original for dark mode
    secondary: '#3b82f6',    // More vibrant blue for both modes
    accent: '#60a5fa',       // Lighter accent for dark mode visibility
    light: '#dbeafe',        // Adjusted for better contrast
    name: 'Classic Blue'
  },
  red: {
    primary: '#dc2626',      // Brighter red for better visibility
    primaryDark: '#b91c1c',  // Lighter than original for dark mode
    secondary: '#ef4444',    // More vibrant red for both modes
    accent: '#f87171',       // Lighter accent for dark mode visibility
    light: '#fecaca',        // Adjusted for better contrast
    name: 'Championship Red'
  },
  green: {
    primary: '#16a34a',      // Slightly brighter green
    primaryDark: '#15803d',  // Lighter than original for dark mode
    secondary: '#22c55e',    // More vibrant green for both modes
    accent: '#4ade80',       // Lighter accent for dark mode visibility
    light: '#bbf7d0',        // Adjusted for better contrast
    name: 'Victory Green'
  },
  purple: {
    primary: '#7c3aed',      // Brighter purple for better visibility
    primaryDark: '#6d28d9',  // Lighter than original for dark mode
    secondary: '#8b5cf6',    // More vibrant purple for both modes
    accent: '#a78bfa',       // Lighter accent for dark mode visibility
    light: '#ddd6fe',        // Adjusted for better contrast
    name: 'Royal Purple'
  },
  gold: {
    primary: '#bf9b30',      // Brighter gold for better visibility
    primaryDark: '#a67c00',  // Slightly darker for dark mode
    secondary: '#ffbf00',    // More vibrant gold for both modes
    accent: '#ffcf40',       // Lighter accent for dark mode visibility
    light: '#ffdc73',        // Adjusted for better contrast
    name: 'Golden Glory'
}
};

const lightTheme = {
  background: '#f5f5f5',
  surface: '#ffffff',
  surfaceSecondary: '#f8f9fa',
  text: '#333333',
  textSecondary: '#666666',
  textTertiary: '#999999',
  border: '#e0e0e0',
  borderSecondary: '#dee2e6',
  shadow: 'rgba(0, 0, 0, 0.1)',
  overlay: 'rgba(0, 0, 0, 0.5)',
  success: '#28a745',
  warning: '#ffc107',
  error: '#dc3545',
  info: '#17a2b8'
};

const darkTheme = {
  background: '#121212',
  surface: '#1e1e1e',
  surfaceSecondary: '#2a2a2a',
  text: '#ffffff',
  textSecondary: '#cccccc',
  textTertiary: '#999999',
  border: '#404040',
  borderSecondary: '#555555',
  shadow: 'rgba(0, 0, 0, 0.3)',
  overlay: 'rgba(0, 0, 0, 0.7)',
  success: '#28a745',
  warning: '#ffc107',
  error: '#dc3545',
  info: '#17a2b8'
};

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [currentColorPalette, setCurrentColorPalette] = useState('red');
  const [isLoading, setIsLoading] = useState(true);

  // Load saved preferences
  useEffect(() => {
    loadThemePreferences();
  }, []);

  const loadThemePreferences = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('theme');
      const savedColor = await AsyncStorage.getItem('colorPalette');
      
      let finalTheme = true; // default dark mode
      let finalColor = 'red'; // default red color
      
      if (savedTheme !== null) {
        finalTheme = savedTheme === 'dark';
        setIsDarkMode(finalTheme);
      }
      if (savedColor !== null) {
        finalColor = savedColor;
        setCurrentColorPalette(finalColor);
      }
      
      // Set initial app icon based on loaded preferences
      await AppIconService.changeAppIcon(finalTheme, finalColor);
    } catch (error) {
      console.error('Error loading theme preferences:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTheme = async () => {
    console.log('toggleTheme called - current isDarkMode:', isDarkMode);
    const newTheme = !isDarkMode;
    console.log('Setting new theme to:', newTheme);
    setIsDarkMode(newTheme);
    try {
      await AsyncStorage.setItem('theme', newTheme ? 'dark' : 'light');
      console.log('Theme saved to AsyncStorage:', newTheme ? 'dark' : 'light');
      // Update app icon when theme changes
      await AppIconService.changeAppIcon(newTheme, currentColorPalette);
      console.log('App icon updated successfully');
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  };

  const changeColorPalette = async (paletteKey) => {
    setCurrentColorPalette(paletteKey);
    try {
      await AsyncStorage.setItem('colorPalette', paletteKey);
      // Update app icon when color palette changes
      await AppIconService.changeAppIcon(isDarkMode, paletteKey);
    } catch (error) {
      console.error('Error saving color preference:', error);
    }
  };

  const theme = isDarkMode ? darkTheme : lightTheme;
  const colors = colorPalettes[currentColorPalette];

  // Generate logo path based on theme
  const getLogoPath = (teamId, size = '500') => {
    const themeSuffix = isDarkMode ? '-dark' : '';
    // If teamId is suffixed (e.g. "1_mlb"), strip it for logo URL
    const base = stripSportSuffix(teamId).id || teamId;
    return `https://a.espncdn.com/i/teamlogos/mlb/500${themeSuffix}/${base}.png`;
  };

  const getTeamLogoUrl = (sport, teamId, size = '500') => {
    // Return null if no teamId provided
    if (!teamId) {
      return null;
    }
    
    const themeSuffix = isDarkMode ? '-dark' : '';
    
  // Handle abbreviation mapping for special cases only where ESPN uses different abbreviations
  // If teamId is suffixed (e.g. '1_mlb'), strip the suffix before building URLs
  let normalizedTeamId = stripSportSuffix(teamId).id || teamId;
    // Normalize incoming sport string for defensive handling
    const incomingSport = (sport || '').toString().toLowerCase();

    // If teamId is suffixed with a sport/league (e.g. '367_champions league'),
    // stripSportSuffix will return { id, sport } where sport is normalized to
    // a canonical form (e.g. 'uefa champions'). For building logo URLs we only
    // want the raw id portion (usually numeric for soccer) and the generic
    // 'soccer' path, not the league name. So prefer the stripped id value.
    normalizedTeamId = stripSportSuffix(teamId).id || teamId;

    if (incomingSport === 'mlb') {
      const abbreviationMap = {
        'AZ': 'ari',   // Arizona Diamondbacks (MLB API uses AZ, logo URL uses ari)
        'CWS': 'chw',  // Chicago White Sox (ESPN uses CWS, logo URL uses chw)
        'KCR': 'kc',   // Kansas City Royals (ESPN uses KCR, logo URL uses kc)
        'SFG': 'sf',   // San Francisco Giants (ESPN uses SFG, logo URL uses sf)
        'TBR': 'tb',   // Tampa Bay Rays (ESPN uses TBR, logo URL uses tb)
      };
      
      normalizedTeamId = abbreviationMap[teamId?.toUpperCase()] || teamId?.toLowerCase();
    } else {
      normalizedTeamId = teamId?.toLowerCase();
    }
    
    // Special handling for different sports
    switch (sport) {
      case 'mlb':
        return `https://a.espncdn.com/i/teamlogos/mlb/${size}${themeSuffix}/${normalizedTeamId}.png`;
      case 'nfl':
        // Some ESPN payloads provide numeric team IDs; map those to the standard abbreviations used in the logo filenames
        const nflIdToAbbr = {
          '2': 'buf', '15': 'mia', '17': 'ne', '20': 'nyj',
          '33': 'bal', '4': 'cin', '5': 'cle', '23': 'pit',
          '34': 'hou', '11': 'ind', '30': 'jax', '10': 'ten',
          '7': 'den', '12': 'kc', '13': 'lv', '24': 'lac',
          '6': 'dal', '19': 'nyg', '21': 'phi', '28': 'was',
          '3': 'chi', '8': 'det', '9': 'gb', '16': 'min',
          '1': 'atl', '29': 'car', '18': 'no', '27': 'tb',
          '22': 'ari', '14': 'lar', '25': 'sf', '26': 'sea'
        };
        // If teamId looks numeric and we have a mapping, prefer the abbreviation
        const nflNormalized = (nflIdToAbbr[normalizedTeamId] || normalizedTeamId);
        return `https://a.espncdn.com/i/teamlogos/nfl/${size}${themeSuffix}/${nflNormalized}.png`;
      case 'nba':
        return `https://a.espncdn.com/i/teamlogos/nba/${size}${themeSuffix}/${normalizedTeamId}.png`;
      case 'nhl':
        return `https://a.espncdn.com/i/teamlogos/nhl/${size}${themeSuffix}/${normalizedTeamId}.png`;
      case 'soccer':
      case 'champions league':
      case 'uefa champions':
      case 'europa league': 
      case 'uefa europa':
      case 'europa conference':
      case 'uefa europa conf':
      case 'premier league':
      case 'england':
      case 'la liga':
      case 'serie a':
      case 'bundesliga':
      case 'ligue 1':
        // All soccer-related leagues use the same logo handling:
        // Extract the raw team ID (usually numeric) and build a clean URL 
        // using the generic 'soccer' path to avoid league names in URLs
        try {
          const stripped = stripSportSuffix(teamId || normalizedTeamId);
          const cleanId = (stripped && stripped.id) ? String(stripped.id) : String(normalizedTeamId);
          // Some soccer IDs are numeric; prefer the numeric portion if present
          const numericMatch = String(cleanId).match(/(\d+)/);
          const finalId = numericMatch ? numericMatch[1] : cleanId.replace(/\s+/g, '-').toLowerCase();
          return `https://a.espncdn.com/i/teamlogos/soccer/${size}${themeSuffix}/${finalId}.png`;
        } catch (e) {
          return `https://a.espncdn.com/i/teamlogos/soccer/${size}${themeSuffix}/${normalizedTeamId}.png`;
        }
      default:
        return `https://a.espncdn.com/i/teamlogos/${sport}/${size}${themeSuffix}/${normalizedTeamId}.png`;
    }
  };

  // Helper function to get current app icon info
  const getCurrentAppIcon = () => {
    const theme = isDarkMode ? 'dark' : 'light';
    return `${theme}-${currentColorPalette}`;
  };

  const value = {
    isDarkMode,
    theme,
    colors,
    colorPalettes,
    currentColorPalette,
    isLoading,
    toggleTheme,
    changeColorPalette,
    getLogoPath,
    getTeamLogoUrl,
    getCurrentAppIcon,
    AppIconService
  };

  // Prevent rendering children until we've loaded saved preferences to avoid
  // a flash of the hard-coded defaults. Consumers can still read `isLoading`
  // from context if they want to show their own loading UI.
  return (
    <ThemeContext.Provider value={value}>
      {isLoading ? null : children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;

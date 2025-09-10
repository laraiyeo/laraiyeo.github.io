import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext();

const colorPalettes = {
  blue: {
    primary: '#002D72',
    primaryDark: '#001F4F',
    secondary: '#4A90E2',
    accent: '#007AFF',
    light: '#E3F2FD',
    name: 'Classic Blue'
  },
  red: {
    primary: '#C41E3A',
    primaryDark: '#8B0000',
    secondary: '#FF6B6B',
    accent: '#FF4444',
    light: '#FFEBEE',
    name: 'Championship Red'
  },
  green: {
    primary: '#00A651',
    primaryDark: '#006B35',
    secondary: '#4CAF50',
    accent: '#2E7D32',
    light: '#E8F5E8',
    name: 'Victory Green'
  },
  purple: {
    primary: '#6A1B9A',
    primaryDark: '#4A148C',
    secondary: '#9C27B0',
    accent: '#8E24AA',
    light: '#F3E5F5',
    name: 'Royal Purple'
  },
  orange: {
    primary: '#FF6900',
    primaryDark: '#CC5500',
    secondary: '#FF9800',
    accent: '#F57C00',
    light: '#FFF3E0',
    name: 'Energy Orange'
  },
  teal: {
    primary: '#00695C',
    primaryDark: '#004D40',
    secondary: '#26A69A',
    accent: '#00897B',
    light: '#E0F2F1',
    name: 'Ocean Teal'
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
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [currentColorPalette, setCurrentColorPalette] = useState('blue');
  const [isLoading, setIsLoading] = useState(true);

  // Load saved preferences
  useEffect(() => {
    loadThemePreferences();
  }, []);

  const loadThemePreferences = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('theme');
      const savedColor = await AsyncStorage.getItem('colorPalette');
      
      if (savedTheme !== null) {
        setIsDarkMode(savedTheme === 'dark');
      }
      if (savedColor !== null) {
        setCurrentColorPalette(savedColor);
      }
    } catch (error) {
      console.error('Error loading theme preferences:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTheme = async () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    try {
      await AsyncStorage.setItem('theme', newTheme ? 'dark' : 'light');
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  };

  const changeColorPalette = async (paletteKey) => {
    setCurrentColorPalette(paletteKey);
    try {
      await AsyncStorage.setItem('colorPalette', paletteKey);
    } catch (error) {
      console.error('Error saving color preference:', error);
    }
  };

  const theme = isDarkMode ? darkTheme : lightTheme;
  const colors = colorPalettes[currentColorPalette];

  // Generate logo path based on theme
  const getLogoPath = (teamId, size = '500') => {
    const themeSuffix = isDarkMode ? '-dark' : '';
    return `https://a.espncdn.com/i/teamlogos/mlb/500${themeSuffix}/${teamId}.png`;
  };

  const getTeamLogoUrl = (sport, teamId, size = '500') => {
    // Return null if no teamId provided
    if (!teamId) {
      return null;
    }
    
    const themeSuffix = isDarkMode ? '-dark' : '';
    
    // Handle abbreviation mapping for special cases only where ESPN uses different abbreviations
    let normalizedTeamId = teamId;
    if (sport === 'mlb') {
      const abbreviationMap = {
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
        return `https://a.espncdn.com/i/teamlogos/nfl/${size}${themeSuffix}/${normalizedTeamId}.png`;
      case 'nba':
        return `https://a.espncdn.com/i/teamlogos/nba/${size}${themeSuffix}/${normalizedTeamId}.png`;
      case 'nhl':
        return `https://a.espncdn.com/i/teamlogos/nhl/${size}${themeSuffix}/${normalizedTeamId}.png`;
      default:
        return `https://a.espncdn.com/i/teamlogos/${sport}/${size}${themeSuffix}/${normalizedTeamId}.png`;
    }
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
    getTeamLogoUrl
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
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

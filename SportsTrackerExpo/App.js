import React from 'react';
import { NavigationContainer, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Import theme context
import { ThemeProvider, useTheme } from './src/context/ThemeContext';

// Import our screens
import HomeScreen from './src/screens/HomeScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import SettingsScreen from './src/screens/SettingsScreen';

// NFL specific screens
import NFLScoreboardScreen from './src/screens/nfl/ScoreboardScreen';
import NFLStandingsScreen from './src/screens/nfl/StandingsScreen';
import NFLSearchScreen from './src/screens/nfl/SearchScreen';
import NFLCompareScreen from './src/screens/nfl/CompareScreen';
import NFLStatsScreen from './src/screens/nfl/StatsScreen';
import NFLGameDetailsScreen from './src/screens/nfl/GameDetailsScreen';
import NFLTeamPageScreen from './src/screens/nfl/TeamPageScreen';

// MLB specific screens
import MLBScoreboardScreen from './src/screens/mlb/ScoreboardScreen';
import MLBStandingsScreen from './src/screens/mlb/StandingsScreen';
import MLBSearchScreen from './src/screens/mlb/SearchScreen';
import MLBCompareScreen from './src/screens/mlb/CompareScreen';
import MLBStatsScreen from './src/screens/mlb/StatsScreen';
import MLBGameDetailsScreen from './src/screens/mlb/GameDetailsScreen';
import MLBTeamPageScreen from './src/screens/mlb/TeamPageScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Home Tab Navigator (for main app navigation)
const HomeTabNavigator = () => {
  const { theme, colors } = useTheme();
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = 'home';
          } else if (route.name === 'Favorites') {
            iconName = 'star';
          } else if (route.name === 'Settings') {
            iconName = 'settings';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: theme.textTertiary,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopWidth: 1,
          borderTopColor: theme.border,
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen}
        options={{ 
          title: 'Home',
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      />
      <Tab.Screen 
        name="Favorites" 
        component={FavoritesScreen}
        options={{ 
          title: 'Favorites',
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{ 
          title: 'Settings',
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      />
    </Tab.Navigator>
  );
};

// Sport Tab Navigator (for specific sport navigation)
const SportTabNavigator = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors } = useTheme();
  
  // Get sport-specific components
  const getScreenComponents = (sport) => {
    switch(sport.toLowerCase()) {
      case 'nfl':
        return {
          ScoreboardScreen: NFLScoreboardScreen,
          StandingsScreen: NFLStandingsScreen,
          SearchScreen: NFLSearchScreen,
          CompareScreen: NFLCompareScreen,
          StatsScreen: NFLStatsScreen,
        };
      case 'mlb':
        return {
          ScoreboardScreen: MLBScoreboardScreen,
          StandingsScreen: MLBStandingsScreen,
          SearchScreen: MLBSearchScreen,
          CompareScreen: MLBCompareScreen,
          StatsScreen: MLBStatsScreen,
        };
      default:
        // For other sports, return placeholder components (can be extended later)
        return {
          ScoreboardScreen: () => <View style={styles.placeholderContainer}><Text style={[styles.placeholderText, { color: theme.text }]}>Coming Soon</Text></View>,
          StandingsScreen: () => <View style={styles.placeholderContainer}><Text style={[styles.placeholderText, { color: theme.text }]}>Coming Soon</Text></View>,
          SearchScreen: () => <View style={styles.placeholderContainer}><Text style={[styles.placeholderText, { color: theme.text }]}>Coming Soon</Text></View>,
          CompareScreen: () => <View style={styles.placeholderContainer}><Text style={[styles.placeholderText, { color: theme.text }]}>Coming Soon</Text></View>,
          StatsScreen: () => <View style={styles.placeholderContainer}><Text style={[styles.placeholderText, { color: theme.text }]}>Coming Soon</Text></View>,
        };
    }
  };

  const screens = getScreenComponents(sport);
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Scores') {
            iconName = 'stats-chart';
          } else if (route.name === 'Standings') {
            iconName = 'trophy';
          } else if (route.name === 'Search') {
            iconName = 'search';
          } else if (route.name === 'Compare') {
            iconName = 'git-compare';
          } else if (route.name === 'Stats') {
            iconName = 'bar-chart';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: theme.textTertiary,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopWidth: 1,
          borderTopColor: theme.border,
        },
      })}
    >
      <Tab.Screen 
        name="Scores" 
        component={screens.ScoreboardScreen}
        initialParams={{ sport }}
        options={{ 
          title: 'Scores',
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerTitle: `${sport.toUpperCase()} Scores`,
        }}
      />
      <Tab.Screen 
        name="Standings" 
        component={screens.StandingsScreen}
        initialParams={{ sport }}
        options={{ 
          title: 'Standings',
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerTitle: `${sport.toUpperCase()} Standings`,
        }}
      />
      <Tab.Screen 
        name="Search" 
        component={screens.SearchScreen}
        initialParams={{ sport }}
        options={{ 
          title: 'Search',
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerTitle: `${sport.toUpperCase()} Search`,
        }}
      />
      <Tab.Screen 
        name="Compare" 
        component={screens.CompareScreen}
        initialParams={{ sport }}
        options={{ 
          title: 'Compare',
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerTitle: `${sport.toUpperCase()} Compare`,
        }}
      />
      <Tab.Screen 
        name="Stats" 
        component={screens.StatsScreen}
        initialParams={{ sport }}
        options={{ 
          title: 'Stats',
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerTitle: `${sport.toUpperCase()} Stats`,
        }}
      />
    </Tab.Navigator>
  );
};

// Main Stack Navigator
const MainStackNavigator = () => {
  const { colors } = useTheme();
  
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="HomeTabs" 
        component={HomeTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="SportTabs" 
        component={SportTabNavigator}
        options={({ route }) => {
          const { sport } = route.params;
          return {
            headerShown: false,
            title: sport.toUpperCase(),
          };
        }}
      />
      <Stack.Screen 
        name="GameDetails" 
        component={({ route, navigation }) => {
          const { sport } = route?.params || {};
          const props = { route, navigation };
          switch(sport?.toLowerCase()) {
            case 'nfl':
              return <NFLGameDetailsScreen {...props} />;
            case 'mlb':
              return <MLBGameDetailsScreen {...props} />;
            default:
              return <NFLGameDetailsScreen {...props} />; // Default fallback
          }
        }}
        options={{ 
          title: 'Game Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      />
      <Stack.Screen 
        name="TeamPage" 
        component={({ route, navigation }) => {
          const { sport } = route?.params || {};
          const props = { route, navigation };
          switch(sport?.toLowerCase()) {
            case 'nfl':
              return <NFLTeamPageScreen {...props} />;
            case 'mlb':
              return <MLBTeamPageScreen {...props} />;
            default:
              return <NFLTeamPageScreen {...props} />; // Default fallback
          }
        }}
        options={{ 
          title: 'Team Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      />
    </Stack.Navigator>
  );
};

const AppContent = () => (
  <NavigationContainer>
    <MainStackNavigator />
  </NavigationContainer>
);

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: '600',
  },
});

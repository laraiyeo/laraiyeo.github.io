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
import MLBPlayerPageScreen from './src/screens/mlb/PlayerPageScreen';

// Soccer specific screens
import SoccerHomeScreen from './src/screens/soccer/SoccerHomeScreen';
import EnglandScreen from './src/screens/soccer/england/EnglandScreen';
import ItalyScreen from './src/screens/soccer/italy/ItalyScreen';
import GermanyScreen from './src/screens/soccer/germany/GermanyScreen';
import FranceScreen from './src/screens/soccer/france/FranceScreen';
import ChampionsLeagueScreen from './src/screens/soccer/champions-league/ChampionsLeagueScreen';
import EuropaLeagueScreen from './src/screens/soccer/europa-league/EuropaLeagueScreen';
import EuropaConferenceScreen from './src/screens/soccer/europa-conference/EuropaConferenceScreen';

// Spain enhanced screens
import SpainScoreboardScreen from './src/screens/soccer/spain/SpainScoreboardScreen';
import SpainStandingsScreen from './src/screens/soccer/spain/SpainStandingsScreen';
import SpainSearchScreen from './src/screens/soccer/spain/SpainSearchScreen';
import SpainCompareScreen from './src/screens/soccer/spain/SpainCompareScreen';
import SpainStatsScreen from './src/screens/soccer/spain/SpainStatsScreen';
import SpainGameDetailsScreen from './src/screens/soccer/spain/SpainGameDetailsScreen';
import SpainTeamPageScreen from './src/screens/soccer/spain/SpainTeamPageScreen';

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

// Sport Tab Navigator (for specific sport navigation - NFL and MLB only)
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
      case 'soccer':
        return {
          ScoreboardScreen: SoccerHomeScreen,
          StandingsScreen: SoccerHomeScreen,
          SearchScreen: SoccerHomeScreen,
          CompareScreen: SoccerHomeScreen,
          StatsScreen: SoccerHomeScreen,
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
        }}
      />
      <Tab.Screen 
        name="Standings" 
        component={screens.StandingsScreen}
        initialParams={{ sport }}
        options={{ 
          title: 'Standings',
        }}
      />
      <Tab.Screen 
        name="Search" 
        component={screens.SearchScreen}
        initialParams={{ sport }}
        options={{ 
          title: 'Search',
        }}
      />
      <Tab.Screen 
        name="Compare" 
        component={screens.CompareScreen}
        initialParams={{ sport }}
        options={{ 
          title: 'Compare',
        }}
      />
      <Tab.Screen 
        name="Stats" 
        component={screens.StatsScreen}
        initialParams={{ sport }}
        options={{ 
          title: 'Stats',
        }}
      />
    </Tab.Navigator>
  );
};

// Soccer Tab Navigator (for individual league navigation)
const SoccerTabNavigator = ({ route }) => {
  const { leagueId, leagueName } = route.params;
  const { theme, colors } = useTheme();
  
  // Get league-specific components
  const getLeagueComponents = (leagueId) => {
    switch(leagueId) {
      case 'england':
        return {
          ScoresScreen: EnglandScreen,
          StandingsScreen: EnglandScreen,
          SearchScreen: EnglandScreen,
          CompareScreen: EnglandScreen,
          StatsScreen: EnglandScreen,
        };
      case 'spain':
        return {
          ScoresScreen: SpainScoreboardScreen,
          StandingsScreen: SpainStandingsScreen,
          SearchScreen: SpainSearchScreen,
          CompareScreen: SpainCompareScreen,
          StatsScreen: SpainStatsScreen,
        };
      case 'italy':
        return {
          ScoresScreen: ItalyScreen,
          StandingsScreen: ItalyScreen,
          SearchScreen: ItalyScreen,
          CompareScreen: ItalyScreen,
          StatsScreen: ItalyScreen,
        };
      case 'germany':
        return {
          ScoresScreen: GermanyScreen,
          StandingsScreen: GermanyScreen,
          SearchScreen: GermanyScreen,
          CompareScreen: GermanyScreen,
          StatsScreen: GermanyScreen,
        };
      case 'france':
        return {
          ScoresScreen: FranceScreen,
          StandingsScreen: FranceScreen,
          SearchScreen: FranceScreen,
          CompareScreen: FranceScreen,
          StatsScreen: FranceScreen,
        };
      case 'champions-league':
        return {
          ScoresScreen: ChampionsLeagueScreen,
          StandingsScreen: ChampionsLeagueScreen,
          SearchScreen: ChampionsLeagueScreen,
          CompareScreen: ChampionsLeagueScreen,
          StatsScreen: ChampionsLeagueScreen,
        };
      case 'europa-league':
        return {
          ScoresScreen: EuropaLeagueScreen,
          StandingsScreen: EuropaLeagueScreen,
          SearchScreen: EuropaLeagueScreen,
          CompareScreen: EuropaLeagueScreen,
          StatsScreen: EuropaLeagueScreen,
        };
      case 'europa-conference':
        return {
          ScoresScreen: EuropaConferenceScreen,
          StandingsScreen: EuropaConferenceScreen,
          SearchScreen: EuropaConferenceScreen,
          CompareScreen: EuropaConferenceScreen,
          StatsScreen: EuropaConferenceScreen,
        };
      default:
        return {
          ScoresScreen: EnglandScreen,
          StandingsScreen: EnglandScreen,
          SearchScreen: EnglandScreen,
          CompareScreen: EnglandScreen,
          StatsScreen: EnglandScreen,
        };
    }
  };

  const screens = getLeagueComponents(leagueId);
  
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
        component={screens.ScoresScreen}
        initialParams={{ leagueId, leagueName }}
        options={{ 
          title: 'Scores',
        }}
      />
      <Tab.Screen 
        name="Standings" 
        component={screens.StandingsScreen}
        initialParams={{ leagueId, leagueName }}
        options={{ 
          title: 'Standings',
        }}
      />
      <Tab.Screen 
        name="Search" 
        component={screens.SearchScreen}
        initialParams={{ leagueId, leagueName }}
        options={{ 
          title: 'Search',
        }}
      />
      <Tab.Screen 
        name="Compare" 
        component={screens.CompareScreen}
        initialParams={{ leagueId, leagueName }}
        options={{ 
          title: 'Compare',
        }}
      />
      <Tab.Screen 
        name="Stats" 
        component={screens.StatsScreen}
        initialParams={{ leagueId, leagueName }}
        options={{ 
          title: 'Stats',
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
        name="Home" 
        component={HomeTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="SportTabs" 
        component={({ route, navigation }) => {
          const { sport } = route.params;
          // For soccer, show the home screen directly without tabs
          if (sport?.toLowerCase() === 'soccer') {
            return <SoccerHomeScreen route={route} navigation={navigation} />;
          }
          // For other sports, use the tab navigator
          return <SportTabNavigator route={route} navigation={navigation} />;
        }}
        options={({ route }) => {
          const { sport } = route.params;
          return {
            headerShown: true, // Always show header for sports
            title: sport.toUpperCase(),
            headerStyle: {
              backgroundColor: colors.primary,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
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
            case 'soccer':
              return <SpainGameDetailsScreen {...props} />;
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
        name="SpainGameDetails" 
        component={SpainGameDetailsScreen}
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
          console.log('TeamPage navigation - sport:', sport, 'params:', route?.params);
          const props = { route, navigation };
          switch(sport?.toLowerCase()) {
            case 'nfl':
              console.log('Rendering NFL TeamPage');
              return <NFLTeamPageScreen {...props} />;
            case 'mlb':
              console.log('Rendering MLB TeamPage');
              return <MLBTeamPageScreen {...props} />;
            case 'soccer':
              console.log('Rendering Spain TeamPage');
              return <SpainTeamPageScreen {...props} />;
            default:
              console.log('Rendering default NFL TeamPage');
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
      <Stack.Screen 
        name="SpainTeamPage" 
        component={SpainTeamPageScreen}
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
      <Stack.Screen 
        name="PlayerPage" 
        component={({ route, navigation }) => {
          const { sport } = route?.params || {};
          const props = { route, navigation };
          switch(sport?.toLowerCase()) {
            case 'mlb':
              return <MLBPlayerPageScreen {...props} />;
            default:
              return <MLBPlayerPageScreen {...props} />; // Default fallback for now
          }
        }}
        options={{ 
          title: 'Player Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      />
      {/* Soccer League Screens */}
      <Stack.Screen 
        name="england" 
        component={SoccerTabNavigator}
        initialParams={{ leagueId: 'england', leagueName: 'England' }}
        options={{ 
          title: 'England',
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
        name="spain" 
        component={SoccerTabNavigator}
        initialParams={{ leagueId: 'spain', leagueName: 'Spain' }}
        options={{ 
          title: 'Spain',
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
        name="italy" 
        component={SoccerTabNavigator}
        initialParams={{ leagueId: 'italy', leagueName: 'Italy' }}
        options={{ 
          title: 'Italy',
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
        name="germany" 
        component={SoccerTabNavigator}
        initialParams={{ leagueId: 'germany', leagueName: 'Germany' }}
        options={{ 
          title: 'Germany',
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
        name="france" 
        component={SoccerTabNavigator}
        initialParams={{ leagueId: 'france', leagueName: 'France' }}
        options={{ 
          title: 'France',
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
        name="champions-league" 
        component={SoccerTabNavigator}
        initialParams={{ leagueId: 'champions-league', leagueName: 'Champions League' }}
        options={{ 
          title: 'Champions League',
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
        name="europa-league" 
        component={SoccerTabNavigator}
        initialParams={{ leagueId: 'europa-league', leagueName: 'Europa League' }}
        options={{ 
          title: 'Europa League',
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
        name="europa-conference" 
        component={SoccerTabNavigator}
        initialParams={{ leagueId: 'europa-conference', leagueName: 'Europa Conference' }}
        options={{ 
          title: 'Europa Conference',
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

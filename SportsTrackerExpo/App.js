import React from 'react';
import { NavigationContainer, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Import theme context
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { FavoritesProvider } from './src/context/FavoritesContext';

// Custom header title component that disables font scaling
const HeaderTitle = ({ children, style }) => {
  const { colors } = useTheme();
  return (
    <Text 
      allowFontScaling={false} 
      style={[
        {
          fontSize: 17,
          fontWeight: 'bold',
          color: '#fff'
        },
        style
      ]}
    >
      {children}
    </Text>
  );
};

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
import NFLPlayerPageScreen from './src/screens/nfl/NFLPlayerPageScreen';

// MLB specific screens
import MLBScoreboardScreen from './src/screens/mlb/ScoreboardScreen';
import MLBStandingsScreen from './src/screens/mlb/StandingsScreen';
import MLBSearchScreen from './src/screens/mlb/SearchScreen';
import MLBCompareScreen from './src/screens/mlb/CompareScreen';
import MLBStatsScreen from './src/screens/mlb/StatsScreen';
import MLBGameDetailsScreen from './src/screens/mlb/GameDetailsScreen';
import MLBTeamPageScreen from './src/screens/mlb/TeamPageScreen';
import MLBPlayerPageScreen from './src/screens/mlb/PlayerPageScreen';

// F1 specific screens
import F1ResultsScreen from './src/screens/f1/ResultsScreen';
import F1StandingsScreen from './src/screens/f1/StandingsScreen';
import F1RaceDetailsScreen from './src/screens/f1/RaceDetailsScreen';
import F1ConstructorDetailsScreen from './src/screens/f1/ConstructorDetailsScreen';
import F1RacerDetailsScreen from './src/screens/f1/RacerDetailsScreen';
import F1VehiclesScreen from './src/screens/f1/VehiclesScreen';

// Soccer specific screens
import SoccerHomeScreen from './src/screens/soccer/SoccerHomeScreen';

// NHL specific screens (added)
import NHLScoreboardScreen from './src/screens/nhl/ScoreboardScreen';
import NHLStandingsScreen from './src/screens/nhl/StandingsScreen';
import NHLSearchScreen from './src/screens/nhl/SearchScreen';
import NHLCompareScreen from './src/screens/nhl/CompareScreen';
import NHLStatsScreen from './src/screens/nhl/StatsScreen';
import NHLGameDetailsScreen from './src/screens/nhl/GameDetailsScreen';
import NHLTeamPageScreen from './src/screens/nhl/TeamPageScreen';
import NHLPlayerPageScreen from './src/screens/nhl/PlayerPageScreen';

// Italy enhanced screens
import ItalyScoreboardScreen from './src/screens/soccer/italy/ItalyScoreboardScreen';
import ItalyStandingsScreen from './src/screens/soccer/italy/ItalyStandingsScreen';
import ItalySearchScreen from './src/screens/soccer/italy/ItalySearchScreen';
import ItalyCompareScreen from './src/screens/soccer/italy/ItalyCompareScreen';
import ItalyTransferScreen from './src/screens/soccer/italy/ItalyTransferScreen';
import ItalyGameDetailsScreen from './src/screens/soccer/italy/ItalyGameDetailsScreen';
import ItalyTeamPageScreen from './src/screens/soccer/italy/ItalyTeamPageScreen';
import ItalyPlayerPageScreen from './src/screens/soccer/italy/ItalyPlayerPageScreen';

// Spain enhanced screens
import SpainScoreboardScreen from './src/screens/soccer/spain/SpainScoreboardScreen';
import SpainStandingsScreen from './src/screens/soccer/spain/SpainStandingsScreen';
import SpainSearchScreen from './src/screens/soccer/spain/SpainSearchScreen';
import SpainCompareScreen from './src/screens/soccer/spain/SpainCompareScreen';
import SpainTransferScreen from './src/screens/soccer/spain/SpainTransferScreen';
import SpainGameDetailsScreen from './src/screens/soccer/spain/SpainGameDetailsScreen';
import SpainTeamPageScreen from './src/screens/soccer/spain/SpainTeamPageScreen';
import SpainPlayerPageScreen from './src/screens/soccer/spain/SpainPlayerPageScreen';

// England enhanced screens
import EnglandScoreboardScreen from './src/screens/soccer/england/EnglandScoreboardScreen';
import EnglandStandingsScreen from './src/screens/soccer/england/EnglandStandingsScreen';
import EnglandSearchScreen from './src/screens/soccer/england/EnglandSearchScreen';
import EnglandCompareScreen from './src/screens/soccer/england/EnglandCompareScreen';
import EnglandTransferScreen from './src/screens/soccer/england/EnglandTransferScreen';
import EnglandGameDetailsScreen from './src/screens/soccer/england/EnglandGameDetailsScreen';
import EnglandTeamPageScreen from './src/screens/soccer/england/EnglandTeamPageScreen';
import EnglandPlayerPageScreen from './src/screens/soccer/england/EnglandPlayerPageScreen';

// France enhanced screens
import FranceScoreboardScreen from './src/screens/soccer/france/FranceScoreboardScreen';
import FranceStandingsScreen from './src/screens/soccer/france/FranceStandingsScreen';
import FranceSearchScreen from './src/screens/soccer/france/FranceSearchScreen';
import FranceCompareScreen from './src/screens/soccer/france/FranceCompareScreen';
import FranceTransferScreen from './src/screens/soccer/france/FranceTransferScreen';
import FranceGameDetailsScreen from './src/screens/soccer/france/FranceGameDetailsScreen';
import FranceTeamPageScreen from './src/screens/soccer/france/FranceTeamPageScreen';
import FrancePlayerPageScreen from './src/screens/soccer/france/FrancePlayerPageScreen';

// Germany enhanced screens
import GermanyScoreboardScreen from './src/screens/soccer/germany/GermanyScoreboardScreen';
import GermanyStandingsScreen from './src/screens/soccer/germany/GermanyStandingsScreen';
import GermanySearchScreen from './src/screens/soccer/germany/GermanySearchScreen';
import GermanyCompareScreen from './src/screens/soccer/germany/GermanyCompareScreen';
import GermanyTransferScreen from './src/screens/soccer/germany/GermanyTransferScreen';
import GermanyGameDetailsScreen from './src/screens/soccer/germany/GermanyGameDetailsScreen';
import GermanyTeamPageScreen from './src/screens/soccer/germany/GermanyTeamPageScreen';
import GermanyPlayerPageScreen from './src/screens/soccer/germany/GermanyPlayerPageScreen';

// Champions League enhanced screens
import UCLScoreboardScreen from './src/screens/soccer/champions-league/UCLScoreboardScreen';
import UCLStandingsScreen from './src/screens/soccer/champions-league/UCLStandingsScreen';
import UCLSearchScreen from './src/screens/soccer/champions-league/UCLSearchScreen';
import UCLCompareScreen from './src/screens/soccer/champions-league/UCLCompareScreen';
import UCLBracketScreen from './src/screens/soccer/champions-league/UCLBracketScreen';
import UCLGameDetailsScreen from './src/screens/soccer/champions-league/UCLGameDetailsScreen';
import UCLTeamPageScreen from './src/screens/soccer/champions-league/UCLTeamPageScreen';
import UCLPlayerPageScreen from './src/screens/soccer/champions-league/UCLPlayerPageScreen';

// Europa League enhanced screens
import UELScoreboardScreen from './src/screens/soccer/europa-league/UELScoreboardScreen';
import UELStandingsScreen from './src/screens/soccer/europa-league/UELStandingsScreen';
import UELSearchScreen from './src/screens/soccer/europa-league/UELSearchScreen';
import UELCompareScreen from './src/screens/soccer/europa-league/UELCompareScreen';
import UELBracketScreen from './src/screens/soccer/europa-league/UELBracketScreen';
import UELGameDetailsScreen from './src/screens/soccer/europa-league/UELGameDetailsScreen';
import UELTeamPageScreen from './src/screens/soccer/europa-league/UELTeamPageScreen';
import UELPlayerPageScreen from './src/screens/soccer/europa-league/UELPlayerPageScreen';

// Europa Conference League enhanced screens
import UECLScoreboardScreen from './src/screens/soccer/europa-conference/UECLScoreboardScreen';
import UECLStandingsScreen from './src/screens/soccer/europa-conference/UECLStandingsScreen';
import UECLSearchScreen from './src/screens/soccer/europa-conference/UECLSearchScreen';
import UECLCompareScreen from './src/screens/soccer/europa-conference/UECLCompareScreen';
import UECLBracketScreen from './src/screens/soccer/europa-conference/UECLBracketScreen';
import UECLGameDetailsScreen from './src/screens/soccer/europa-conference/UECLGameDetailsScreen';
import UECLTeamPageScreen from './src/screens/soccer/europa-conference/UECLTeamPageScreen';
import UECLPlayerPageScreen from './src/screens/soccer/europa-conference/UECLPlayerPageScreen';

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
          headerTitle: (props) => <HeaderTitle {...props} />,
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
          headerTitle: (props) => <HeaderTitle {...props} />,
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
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
    </Tab.Navigator>
  );
};

// Sport Tab Navigator (for specific sport navigation - NFL, MLB, and F1)
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
      case 'nhl':
        return {
          ScoreboardScreen: NHLScoreboardScreen,
          StandingsScreen: NHLStandingsScreen,
          SearchScreen: NHLSearchScreen,
          CompareScreen: NHLCompareScreen,
          StatsScreen: NHLStatsScreen,
        };
      case 'f1':
        return {
          ScoreboardScreen: F1ResultsScreen, // Using Results screen for Scores tab
          StandingsScreen: F1StandingsScreen,
          SearchScreen: () => <View style={styles.placeholderContainer}><Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.text }]}>Coming Soon</Text></View>,
          CompareScreen: () => <View style={styles.placeholderContainer}><Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.text }]}>Coming Soon</Text></View>,
          StatsScreen: () => <View style={styles.placeholderContainer}><Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.text }]}>Coming Soon</Text></View>,
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
          ScoreboardScreen: () => <View style={styles.placeholderContainer}><Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.text }]}>Coming Soon</Text></View>,
          StandingsScreen: () => <View style={styles.placeholderContainer}><Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.text }]}>Coming Soon</Text></View>,
          SearchScreen: () => <View style={styles.placeholderContainer}><Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.text }]}>Coming Soon</Text></View>,
          CompareScreen: () => <View style={styles.placeholderContainer}><Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.text }]}>Coming Soon</Text></View>,
          StatsScreen: () => <View style={styles.placeholderContainer}><Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.text }]}>Coming Soon</Text></View>,
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

// F1 Tab Navigator (custom for F1 with only Calendar, Standings, and Vehicles)
const F1TabNavigator = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors } = useTheme();
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          // Use the local SVG asset for the Vehicles tab. If your bundler
          // supports importing SVGs as images, this will render the SVG.
          if (route.name === 'Vehicles') {
            // Wrap the image so we can control background/tint safely.
            // Avoid relying solely on tintColor which can make the icon invisible
            // when the tint matches the tab background. Provide a subtle fallback
            // color and fixed sizing for consistency.
            const iconSize = 50;
            const safeTint = color || (focused ? colors.primary : theme.textTertiary);
            return (
              <View style={{ width: iconSize, height: iconSize, alignItems: 'center', justifyContent: 'center' }}>
                <Image
                  source={require('./assets/f1-car-svgrepo-com.png')}
                  style={{ width: iconSize, height: iconSize, tintColor: safeTint }}
                  resizeMode="contain"
                />
              </View>
            );
          }

          let iconName;
          if (route.name === 'Calendar') {
            iconName = 'calendar';
          } else if (route.name === 'Standings') {
            iconName = 'trophy';
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
        name="Calendar" 
        component={F1ResultsScreen}
        initialParams={{ sport }}
        options={{ 
          title: 'Calendar',
        }}
      />
      <Tab.Screen 
        name="Standings" 
        component={F1StandingsScreen}
        initialParams={{ sport }}
        options={{ 
          title: 'Standings',
        }}
      />
      <Tab.Screen 
        name="Vehicles" 
        component={F1VehiclesScreen}
        initialParams={{ sport }}
        options={{ 
          title: 'Vehicles',
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
          ScoresScreen: EnglandScoreboardScreen,
          StandingsScreen: EnglandStandingsScreen,
          SearchScreen: EnglandSearchScreen,
          CompareScreen: EnglandCompareScreen,
          StatsScreen: EnglandTransferScreen,
        };
      case 'spain':
        return {
          ScoresScreen: SpainScoreboardScreen,
          StandingsScreen: SpainStandingsScreen,
          SearchScreen: SpainSearchScreen,
          CompareScreen: SpainCompareScreen,
          StatsScreen: SpainTransferScreen,
        };
      case 'italy':
        return {
          ScoresScreen: ItalyScoreboardScreen,
          StandingsScreen: ItalyStandingsScreen,
          SearchScreen: ItalySearchScreen,
          CompareScreen: ItalyCompareScreen,
          StatsScreen: ItalyTransferScreen,
        };
      case 'germany':
        return {
          ScoresScreen: GermanyScoreboardScreen,
          StandingsScreen: GermanyStandingsScreen,
          SearchScreen: GermanySearchScreen,
          CompareScreen: GermanyCompareScreen,
          StatsScreen: GermanyTransferScreen,
        };
      case 'france':
        return {
          ScoresScreen: FranceScoreboardScreen,
          StandingsScreen: FranceStandingsScreen,
          SearchScreen: FranceSearchScreen,
          CompareScreen: FranceCompareScreen,
          StatsScreen: FranceTransferScreen,
        };
      case 'champions-league':
        return {
          ScoresScreen: UCLScoreboardScreen,
          StandingsScreen: UCLStandingsScreen,
          SearchScreen: UCLSearchScreen,
          CompareScreen: UCLCompareScreen,
          StatsScreen: UCLBracketScreen,
        };
      case 'europa-league':
        return {
          ScoresScreen: UELScoreboardScreen,
          StandingsScreen: UELStandingsScreen,
          SearchScreen: UELSearchScreen,
          CompareScreen: UELCompareScreen,
          StatsScreen: UELBracketScreen,
        };
      case 'europa-conference':
        return {
          ScoresScreen: UECLScoreboardScreen,
          StandingsScreen: UECLStandingsScreen,
          SearchScreen: UECLSearchScreen,
          CompareScreen: UECLCompareScreen,
          StatsScreen: UECLBracketScreen,
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
  
  // Check if it's a soccer league that should have Transfers instead of Stats
  const shouldShowTransfers = ['spain', 'england', 'italy', 'germany', 'france'].includes(leagueId);
  
  // Check if it's a UEFA competition that should have Bracket instead of Stats
  const shouldShowBracket = ['champions-league', 'europa-conference', 'europa-league'].includes(leagueId);
  
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
          } else if (route.name === 'Transfers') {
            iconName = 'cash';
          } else if (route.name === 'Bracket') {
            iconName = 'git-network';
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
      {shouldShowBracket ? (
        <Tab.Screen 
          name="Bracket" 
          component={screens.StatsScreen}
          initialParams={{ leagueId, leagueName }}
          options={{ 
            title: 'Bracket',
          }}
        />
      ) : shouldShowTransfers ? (
        <Tab.Screen 
          name="Transfers" 
          component={screens.StatsScreen}
          initialParams={{ leagueId, leagueName }}
          options={{ 
            title: 'Transfers',
          }}
        />
      ) : (
        <Tab.Screen 
          name="Stats" 
          component={screens.StatsScreen}
          initialParams={{ leagueId, leagueName }}
          options={{ 
            title: 'Stats',
          }}
        />
      )}
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
          // For F1, use the custom F1 tab navigator
          if (sport?.toLowerCase() === 'f1') {
            return <F1TabNavigator route={route} navigation={navigation} />;
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
            headerTitle: (props) => <HeaderTitle {...props} />,
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
            case 'nhl':
              return <NHLGameDetailsScreen {...props} />;
            case 'f1':
              return <F1RaceDetailsScreen {...props} />;
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
          headerTitle: (props) => <HeaderTitle {...props} />,
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
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="EnglandGameDetails" 
        component={EnglandGameDetailsScreen}
        options={{ 
          title: 'Game Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="ItalyGameDetails" 
        component={ItalyGameDetailsScreen}
        options={{ 
          title: 'Game Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="FranceGameDetails" 
        component={FranceGameDetailsScreen}
        options={{ 
          title: 'Game Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="GermanyGameDetails" 
        component={GermanyGameDetailsScreen}
        options={{ 
          title: 'Game Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="UCLGameDetails" 
        component={UCLGameDetailsScreen}
        options={{ 
          title: 'Game Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="UELGameDetails" 
        component={UELGameDetailsScreen}
        options={{ 
          title: 'Game Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="UECLGameDetails" 
        component={UECLGameDetailsScreen}
        options={{ 
          title: 'Game Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="F1RaceDetails" 
        component={F1RaceDetailsScreen}
        options={{ 
          title: 'Race Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="F1ConstructorDetails" 
        component={F1ConstructorDetailsScreen}
        options={{ 
          title: 'Constructor Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="F1RacerDetails" 
        component={F1RacerDetailsScreen}
        options={{ 
          title: 'Racer Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
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
            case 'nhl':
              console.log('Rendering NHL TeamPage');
              return <NHLTeamPageScreen {...props} />;
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
          headerTitle: (props) => <HeaderTitle {...props} />,
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
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="EnglandTeamPage" 
        component={EnglandTeamPageScreen}
        options={{ 
          title: 'Team Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="ItalyTeamPage" 
        component={ItalyTeamPageScreen}
        options={{ 
          title: 'Team Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="FranceTeamPage" 
        component={FranceTeamPageScreen}
        options={{ 
          title: 'Team Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="GermanyTeamPage" 
        component={GermanyTeamPageScreen}
        options={{ 
          title: 'Team Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="UCLTeamPage" 
        component={UCLTeamPageScreen}
        options={{ 
          title: 'Team Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="UELTeamPage" 
        component={UELTeamPageScreen}
        options={{ 
          title: 'Team Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="UECLTeamPage" 
        component={UECLTeamPageScreen}
        options={{ 
          title: 'Team Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="SpainPlayerPage" 
        component={SpainPlayerPageScreen}
        options={{ 
          title: 'Player Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="EnglandPlayerPage" 
        component={EnglandPlayerPageScreen}
        options={{ 
          title: 'Player Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="ItalyPlayerPage" 
        component={ItalyPlayerPageScreen}
        options={{ 
          title: 'Player Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="FrancePlayerPage" 
        component={FrancePlayerPageScreen}
        options={{ 
          title: 'Player Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="GermanyPlayerPage" 
        component={GermanyPlayerPageScreen}
        options={{ 
          title: 'Player Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="UCLPlayerPage" 
        component={UCLPlayerPageScreen}
        options={{ 
          title: 'Player Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="UELPlayerPage" 
        component={UELPlayerPageScreen}
        options={{ 
          title: 'Player Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="UECLPlayerPage" 
        component={UECLPlayerPageScreen}
        options={{ 
          title: 'Player Details',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen 
        name="PlayerPage" 
        component={({ route, navigation }) => {
          const { sport } = route?.params || {};
          const props = { route, navigation };
          switch(sport?.toLowerCase()) {
            case 'nfl':
              return <NFLPlayerPageScreen {...props} />;
            case 'mlb':
              return <MLBPlayerPageScreen {...props} />;
            case 'nhl':
              return <NHLPlayerPageScreen {...props} />;
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
          headerTitle: (props) => <HeaderTitle {...props} />,
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
          headerTitle: (props) => <HeaderTitle {...props} />,
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
          headerTitle: (props) => <HeaderTitle {...props} />,
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
          headerTitle: (props) => <HeaderTitle {...props} />,
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
          headerTitle: (props) => <HeaderTitle {...props} />,
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
          headerTitle: (props) => <HeaderTitle {...props} />,
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
          headerTitle: (props) => <HeaderTitle {...props} />,
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
          headerTitle: (props) => <HeaderTitle {...props} />,
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
          headerTitle: (props) => <HeaderTitle {...props} />,
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
      <FavoritesProvider>
        <AppContent />
      </FavoritesProvider>
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

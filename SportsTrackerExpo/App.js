import React, { useState, useEffect, useRef } from "react";
import {
  NavigationContainer,
  getFocusedRouteNameFromRoute,
  useFocusEffect,
  StackActions,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native";
import { Ionicons, FontAwesome } from "@expo/vector-icons";
import * as ExpoSplashScreen from "expo-splash-screen";
import { Platform } from "react-native";
import Constants from "expo-constants";

// Conditionally require `expo-linking` where available; fall back to React
// Native `Linking` with a minimal `parse()` helper on platforms where
// `expo-linking` is not present (avoids Android bundler/runtime crashes).
let Linking;
try {
  Linking = require("expo-linking");
} catch (e) {
  Linking = require("react-native").Linking;
  if (!Linking.parse) {
    Linking.parse = (url = "") => {
      try {
        const withoutScheme = String(url).includes("://")
          ? String(url).split("://")[1]
          : String(url);
        const [path] = withoutScheme.split("?");
        return { path: path || null };
      } catch (err) {
        return { path: null };
      }
    };
  }
}
import { navigationRef } from "./src/navigationRef";

// Import SplashScreen component
import SplashScreen from "./src/components/SplashScreen";

// Import theme context
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { FavoritesProvider } from "./src/context/FavoritesContext";
import { ChatProvider } from "./src/context/ChatContext";
import { EmoteProvider } from "./src/context/EmoteContext";
import { MutedUsersProvider } from "./src/context/MutedUsersContext";
import { BetSlipProvider } from "./src/context/BetSlipContext";
import {
  AppSettingsProvider,
  useAppSettings,
} from "./src/context/AppSettingsContext";
import { BetDataProvider } from "./src/context/BetDataContext";
import { OddsDisplayProvider } from "./src/context/OddsDisplayContext";
import {
  OnboardingProvider,
  useOnboarding,
} from "./src/context/OnboardingContext";

import * as Notifications from "expo-notifications";

// `expo-widgets` is iOS-only; require it dynamically and only on iOS so
// Android builds don't attempt to bundle or execute it.
let addPushToStartTokenListener = null;
if (Platform.OS === "ios") {
  try {
    // eslint-disable-next-line global-require
    const widgets = require("expo-widgets");
    addPushToStartTokenListener = widgets.addPushToStartTokenListener;
  } catch (e) {
    addPushToStartTokenListener = null;
    console.warn("expo-widgets not available:", e?.message || e);
  }
}

// Import Analytics Service
import analyticsService from "./src/services/AnalyticsService";

// Import Update Service
import UpdateService from "./src/services/UpdateService";

// Import Emote Service for preloading
import EmoteService from "./src/services/EmoteService";
// Prefetch helper removed — home layout is static; no import needed.

// Import PresenceService for viewer tracking
import { PresenceService } from "./src/services/PresenceService";

// Import streaming utils
import { useStreamingAccess } from "./src/utils/streamingUtils";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  initPurchases,
  getOfferings,
  getCustomerInfo,
  isEntitled,
} from "./src/services/revenuecat";
import { useBetSlip } from "./src/context/BetSlipContext";
import { supabase } from "./src/config/supabase";
import { initAds } from "./src/services/ads";

// Custom header title component that disables font scaling
const HeaderTitle = ({ children, style }) => {
  const { colors } = useTheme();
  return (
    <Text
      allowFontScaling={false}
      style={[
        {
          fontSize: 17,
          fontWeight: "bold",
          color: "#fff",
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
};

// Import our screens
import HomeScreen from "./src/screens/HomeScreen";
import FavoritesScreen from "./src/screens/FavoritesScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import FavoritesManagementScreen from "./src/screens/FavoritesManagementScreen";
import MutedUsersScreen from "./src/screens/MutedUsersScreen";

// NFL specific screens
import NFLScoreboardScreen from "./src/screens/nfl/ScoreboardScreen";
import NFLStandingsScreen from "./src/screens/nfl/StandingsScreen";
import NFLSearchScreen from "./src/screens/nfl/SearchScreen";
import NFLCompareScreen from "./src/screens/nfl/CompareScreen";
import NFLStatsScreen from "./src/screens/nfl/StatsScreen";
import NFLGameDetailsScreen from "./src/screens/nfl/GameDetailsScreen";
import NFLTeamPageScreen from "./src/screens/nfl/TeamPageScreen";
import NFLPlayerPageScreen from "./src/screens/nfl/NFLPlayerPageScreen";
import NFLMoreScreen from "./src/screens/nfl/MoreScreen";
import NFLTransactionsScreen from "./src/screens/nfl/TransactionsScreen";
import NFLInjuriesScreen from "./src/screens/nfl/InjuriesScreen";
import NFLDraftScreen from "./src/screens/nfl/DraftScreen";

// MLB specific screens
import MLBScoreboardScreen from "./src/screens/mlb/ScoreboardScreen";
import MLBStandingsScreen from "./src/screens/mlb/StandingsScreen";
import MLBSearchScreen from "./src/screens/mlb/SearchScreen";
import MLBCompareScreen from "./src/screens/mlb/CompareScreen";
import MLBGameDetailsScreen from "./src/screens/mlb/GameDetailsScreen";
import MLBTeamPageScreen from "./src/screens/mlb/TeamPageScreen";
import MLBPlayerPageScreen from "./src/screens/mlb/PlayerPageScreen";
import MLBMoreScreen from "./src/screens/mlb/MoreScreen";
import MLBTransactionsScreen from "./src/screens/mlb/TransactionsScreen";
import MLBDraftScreen from "./src/screens/mlb/DraftScreen";

// WBC specific screens (lightweight re-exports)
import WBCScoreboardScreen from "./src/screens/wbc/ScoreboardScreen";
import WBCStandingsScreen from "./src/screens/wbc/StandingsScreen";
import WBCSearchScreen from "./src/screens/wbc/SearchScreen";
import WBCCompareScreen from "./src/screens/wbc/CompareScreen";
import WBCGameDetailsScreen from "./src/screens/wbc/GameDetailsScreen";
import WBCTeamPageScreen from "./src/screens/wbc/TeamPageScreen";
import WBCPlayerPageScreen from "./src/screens/wbc/PlayerPageScreen";
import WBCStatsScreen from "./src/screens/wbc/StatsScreen";

// NBA specific screens
import NBAScoreboardScreen from "./src/screens/nba/ScoreboardScreen";
import NBAStandingsScreen from "./src/screens/nba/StandingsScreen";
import NBASearchScreen from "./src/screens/nba/SearchScreen";
import NBACompareScreen from "./src/screens/nba/CompareScreen";
import NBAStatsScreen from "./src/screens/nba/StatsScreen";
import NBAGameDetailsScreen from "./src/screens/nba/GameDetailsScreen";
import NBATeamPageScreen from "./src/screens/nba/TeamPageScreen";
import NBAPlayerPageScreen from "./src/screens/nba/PlayerPageScreen";
import NBAMoreScreen from "./src/screens/nba/MoreScreen";
import NBATransactionsScreen from "./src/screens/nba/TransactionsScreen";
import NBAInjuriesScreen from "./src/screens/nba/InjuriesScreen";
import NBADraftScreen from "./src/screens/nba/DraftScreen";

// WNBA specific screens
import WNBAScoreboardScreen from "./src/screens/wnba/ScoreboardScreen";
import WNBAStandingsScreen from "./src/screens/wnba/StandingsScreen";
import WNBASearchScreen from "./src/screens/wnba/SearchScreen";
import WNBACompareScreen from "./src/screens/wnba/CompareScreen";
import WNBAGameDetailsScreen from "./src/screens/wnba/GameDetailsScreen";
import WNBATeamPageScreen from "./src/screens/wnba/TeamPageScreen";
import WNBAPlayerPageScreen from "./src/screens/wnba/PlayerPageScreen";
import WNBAMoreScreen from "./src/screens/wnba/MoreScreen";
import WNBATransactionsScreen from "./src/screens/wnba/TransactionsScreen";
import WNBAInjuriesScreen from "./src/screens/wnba/InjuriesScreen";
import WNBADraftScreen from "./src/screens/wnba/DraftScreen";

// F1 specific screens
import F1ResultsScreen from "./src/screens/f1/ResultsScreen";
import F1StandingsScreen from "./src/screens/f1/StandingsScreen";
import F1RaceDetailsScreen from "./src/screens/f1/RaceDetailsScreen";
import F1ConstructorDetailsScreen from "./src/screens/f1/ConstructorDetailsScreen";
import F1RacerDetailsScreen from "./src/screens/f1/RacerDetailsScreen";
import F1VehiclesScreen from "./src/screens/f1/VehiclesScreen";

// Soccer specific screens
import SoccerHomeScreen from "./src/screens/soccer/SoccerHomeScreen";
import SoccerMoreScreen from "./src/screens/soccer/SoccerMoreScreen";

// NHL specific screens (added)
import NHLScoreboardScreen from "./src/screens/nhl/ScoreboardScreen";
import NHLStandingsScreen from "./src/screens/nhl/StandingsScreen";
import NHLSearchScreen from "./src/screens/nhl/SearchScreen";
import NHLCompareScreen from "./src/screens/nhl/CompareScreen";
import NHLGameDetailsScreen from "./src/screens/nhl/GameDetailsScreen";
import NHLTeamPageScreen from "./src/screens/nhl/TeamPageScreen";
import NHLPlayerPageScreen from "./src/screens/nhl/PlayerPageScreen";
import NHLMoreScreen from "./src/screens/nhl/MoreScreen";
import NHLTransactionsScreen from "./src/screens/nhl/TransactionsScreen";
import NHLInjuriesScreen from "./src/screens/nhl/InjuriesScreen";

// Esports screens
import EsportsNavigator from "./src/screens/esports/EsportsTabNavigator";

// CS2 Esports screens
import CS2TabNavigator from "./src/screens/esports/cs2/CS2TabNavigator";
import CS2HomeScreen from "./src/screens/esports/cs2/CS2HomeScreen";
import CS2DiscoverScreen from "./src/screens/esports/cs2/CS2DiscoverScreen";
import CS2MatchDetailsScreen from "./src/screens/esports/cs2/CS2MatchDetailsScreen";
import CS2MatchScreen from "./src/screens/esports/cs2/CS2MatchScreen";
import CS2LiveScreen from "./src/screens/esports/cs2/CS2LiveScreen";
import CS2ResultsScreen from "./src/screens/esports/cs2/CS2ResultsScreen";
import CS2UpcomingScreen from "./src/screens/esports/cs2/CS2UpcomingScreen";
import CS2TournamentScreen from "./src/screens/esports/cs2/CS2TournamentScreen";
import CS2TeamPageScreen from "./src/screens/esports/cs2/CS2TeamPageScreen";

// Valorant Esports screens
import VALTabNavigator from "./src/screens/esports/val/VALTabNavigator";
import VALHomeScreen from "./src/screens/esports/val/VALHomeScreen";
import VALDiscoverScreen from "./src/screens/esports/val/VALDiscoverScreen";
import VALLiveScreen from "./src/screens/esports/val/VALLiveScreen";
import VALResultsScreen from "./src/screens/esports/val/VALResultsScreen";
import VALUpcomingScreen from "./src/screens/esports/val/VALUpcomingScreen";
import VALEventScreen from "./src/screens/esports/val/VALEventScreen";
import VALSeriesScreen from "./src/screens/esports/val/VALSeriesScreen";
import VALMatchScreen from "./src/screens/esports/val/VALMatchScreen";
import VALTeamPageScreen from "./src/screens/esports/val/VALTeamPageScreen";

// League of Legends Esports screens
import LOLTabNavigator from "./src/screens/esports/lol/LOLTabNavigator";
import LOLHomeScreen from "./src/screens/esports/lol/LOLHomeScreen";
import LOLDiscoverScreen from "./src/screens/esports/lol/LOLDiscoverScreen";
import LOLMatchDetailsScreen from "./src/screens/esports/lol/LOLMatchDetailsScreen";
import LOLGameDetailsScreen from "./src/screens/esports/lol/LOLGameDetailsScreen";
import LOLTournamentScreen from "./src/screens/esports/lol/LOLTournamentScreen";

// Betting screens
import BetTabNavigator from "./src/screens/bet/BetTabNavigator";
import BetLoginScreen from "./src/screens/bet/BetLoginScreen";
import BetEntryScreen from "./src/screens/bet/BetEntryScreen";
import ProSplashScreen from "./src/screens/bet/ProSplashScreen";
import BetGameDetailScreen from "./src/screens/bet/BetGameDetailScreen";
import BetGameStatsScreen from "./src/screens/bet/BetGameStatsScreen";
import BetQuickHitsScreen from "./src/screens/bet/BetQuickHitsScreen";
import BetPlayerPropsScreen from "./src/screens/bet/BetPlayerPropsScreen";
import BetGameLinesScreen from "./src/screens/bet/BetGameLinesScreen";
import BetAthleteScreen from "./src/screens/bet/BetAthleteScreen";
import OnboardingScreen from "./src/screens/onboarding/OnboardingScreen";

// Italy enhanced screens
import ItalyScoreboardScreen from "./src/screens/soccer/italy/ItalyScoreboardScreen";
import ItalyStandingsScreen from "./src/screens/soccer/italy/ItalyStandingsScreen";
import ItalySearchScreen from "./src/screens/soccer/italy/ItalySearchScreen";
import ItalyCompareScreen from "./src/screens/soccer/italy/ItalyCompareScreen";
import ItalyTransferScreen from "./src/screens/soccer/italy/ItalyTransferScreen";
import ItalyGameDetailsScreen from "./src/screens/soccer/italy/ItalyGameDetailsScreen";
import ItalyTeamPageScreen from "./src/screens/soccer/italy/ItalyTeamPageScreen";
import ItalyPlayerPageScreen from "./src/screens/soccer/italy/ItalyPlayerPageScreen";
import ItalyMoreScreen from "./src/screens/soccer/italy/MoreScreen";

// Spain enhanced screens
import SpainScoreboardScreen from "./src/screens/soccer/spain/SpainScoreboardScreen";
import SpainStandingsScreen from "./src/screens/soccer/spain/SpainStandingsScreen";
import SpainSearchScreen from "./src/screens/soccer/spain/SpainSearchScreen";
import SpainCompareScreen from "./src/screens/soccer/spain/SpainCompareScreen";
import SpainTransferScreen from "./src/screens/soccer/spain/SpainTransferScreen";
import SpainGameDetailsScreen from "./src/screens/soccer/spain/SpainGameDetailsScreen";
import SpainTeamPageScreen from "./src/screens/soccer/spain/SpainTeamPageScreen";
import SpainPlayerPageScreen from "./src/screens/soccer/spain/SpainPlayerPageScreen";
import SpainMoreScreen from "./src/screens/soccer/spain/MoreScreen";

// England enhanced screens
import EnglandScoreboardScreen from "./src/screens/soccer/england/EnglandScoreboardScreen";
import EnglandStandingsScreen from "./src/screens/soccer/england/EnglandStandingsScreen";
import EnglandSearchScreen from "./src/screens/soccer/england/EnglandSearchScreen";
import EnglandCompareScreen from "./src/screens/soccer/england/EnglandCompareScreen";
import EnglandTransferScreen from "./src/screens/soccer/england/EnglandTransferScreen";
import EnglandGameDetailsScreen from "./src/screens/soccer/england/EnglandGameDetailsScreen";
import EnglandTeamPageScreen from "./src/screens/soccer/england/EnglandTeamPageScreen";
import EnglandPlayerPageScreen from "./src/screens/soccer/england/EnglandPlayerPageScreen";
import EnglandMoreScreen from "./src/screens/soccer/england/MoreScreen";

// France enhanced screens
import FranceScoreboardScreen from "./src/screens/soccer/france/FranceScoreboardScreen";
import FranceStandingsScreen from "./src/screens/soccer/france/FranceStandingsScreen";
import FranceSearchScreen from "./src/screens/soccer/france/FranceSearchScreen";
import FranceCompareScreen from "./src/screens/soccer/france/FranceCompareScreen";
import FranceTransferScreen from "./src/screens/soccer/france/FranceTransferScreen";
import FranceGameDetailsScreen from "./src/screens/soccer/france/FranceGameDetailsScreen";
import FranceTeamPageScreen from "./src/screens/soccer/france/FranceTeamPageScreen";
import FrancePlayerPageScreen from "./src/screens/soccer/france/FrancePlayerPageScreen";
import FranceMoreScreen from "./src/screens/soccer/france/MoreScreen";

// Germany enhanced screens
import GermanyScoreboardScreen from "./src/screens/soccer/germany/GermanyScoreboardScreen";
import GermanyStandingsScreen from "./src/screens/soccer/germany/GermanyStandingsScreen";
import GermanySearchScreen from "./src/screens/soccer/germany/GermanySearchScreen";
import GermanyCompareScreen from "./src/screens/soccer/germany/GermanyCompareScreen";
import GermanyTransferScreen from "./src/screens/soccer/germany/GermanyTransferScreen";
import GermanyGameDetailsScreen from "./src/screens/soccer/germany/GermanyGameDetailsScreen";
import GermanyTeamPageScreen from "./src/screens/soccer/germany/GermanyTeamPageScreen";
import GermanyPlayerPageScreen from "./src/screens/soccer/germany/GermanyPlayerPageScreen";
import GermanyMoreScreen from "./src/screens/soccer/germany/MoreScreen";

// Champions League enhanced screens
import UCLScoreboardScreen from "./src/screens/soccer/champions-league/UCLScoreboardScreen";
import UCLStandingsScreen from "./src/screens/soccer/champions-league/UCLStandingsScreen";
import UCLSearchScreen from "./src/screens/soccer/champions-league/UCLSearchScreen";
import UCLCompareScreen from "./src/screens/soccer/champions-league/UCLCompareScreen";
import UCLBracketScreen from "./src/screens/soccer/champions-league/UCLBracketScreen";
import UCLGameDetailsScreen from "./src/screens/soccer/champions-league/UCLGameDetailsScreen";
import UCLTeamPageScreen from "./src/screens/soccer/champions-league/UCLTeamPageScreen";
import UCLPlayerPageScreen from "./src/screens/soccer/champions-league/UCLPlayerPageScreen";
import UCLMoreScreen from "./src/screens/soccer/champions-league/MoreScreen";

// Europa League enhanced screens
import UELScoreboardScreen from "./src/screens/soccer/europa-league/UELScoreboardScreen";
import UELStandingsScreen from "./src/screens/soccer/europa-league/UELStandingsScreen";
import UELSearchScreen from "./src/screens/soccer/europa-league/UELSearchScreen";
import UELCompareScreen from "./src/screens/soccer/europa-league/UELCompareScreen";
import UELBracketScreen from "./src/screens/soccer/europa-league/UELBracketScreen";
import UELGameDetailsScreen from "./src/screens/soccer/europa-league/UELGameDetailsScreen";
import UELTeamPageScreen from "./src/screens/soccer/europa-league/UELTeamPageScreen";
import UELPlayerPageScreen from "./src/screens/soccer/europa-league/UELPlayerPageScreen";
import UELMoreScreen from "./src/screens/soccer/europa-league/MoreScreen";

// Europa Conference League enhanced screens
import UECLScoreboardScreen from "./src/screens/soccer/europa-conference/UECLScoreboardScreen";
import UECLStandingsScreen from "./src/screens/soccer/europa-conference/UECLStandingsScreen";
import UECLSearchScreen from "./src/screens/soccer/europa-conference/UECLSearchScreen";
import UECLCompareScreen from "./src/screens/soccer/europa-conference/UECLCompareScreen";
import UECLBracketScreen from "./src/screens/soccer/europa-conference/UECLBracketScreen";
import UECLGameDetailsScreen from "./src/screens/soccer/europa-conference/UECLGameDetailsScreen";
import UECLTeamPageScreen from "./src/screens/soccer/europa-conference/UECLTeamPageScreen";
import UECLPlayerPageScreen from "./src/screens/soccer/europa-conference/UECLPlayerPageScreen";
import UECLMoreScreen from "./src/screens/soccer/europa-conference/MoreScreen";

// Top 5 Leagues screens
import Top5ScoreboardScreen from "./src/screens/soccer/top5/Top5ScoreboardScreen";
import Top5LeaguesScreen from "./src/screens/soccer/top5/Top5LeaguesScreen";
import Top5TeamsScreen from "./src/screens/soccer/top5/Top5TeamsScreen";
import Top5SearchScreen from "./src/screens/soccer/top5/Top5SearchScreen";
import Top5LeagueDetailScreen from "./src/screens/soccer/top5/Top5LeagueDetailScreen";
import Top5TeamDetailScreen from "./src/screens/soccer/top5/Top5TeamDetailScreen";
import Top5CoachScreen from "./src/screens/soccer/top5/Top5CoachScreen";
import Top5RefereeScreen from "./src/screens/soccer/top5/Top5RefereeScreen";
import Top5PlayerScreen from "./src/screens/soccer/top5/Top5PlayerScreen";
import Top5GameDetailsScreen from "./src/screens/soccer/top5/Top5GameDetailsScreen";
import FootballLiveActivityController from "./components/FootballLiveActivityController";

// FIFA World Cup screens
import FIFAWorldScoreboardScreen from "./src/screens/soccer/fifa.world/FIFAWorldScoreboardScreen";
import FIFAWorldStandingsScreen from "./src/screens/soccer/fifa.world/FIFAWorldStandingsScreen";
import FIFAWorldStatsScreen from "./src/screens/soccer/fifa.world/FIFAWorldStatsScreen";
import FIFAWorldPlayerPageScreen from "./src/screens/soccer/fifa.world/FIFAWorldPlayerPageScreen";
import FIFAWorldGameDetailsScreen from "./src/screens/soccer/fifa.world/FIFAWorldGameDetailsScreen";

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();
const GateStack = createStackNavigator();
const RootStack = createStackNavigator();

// Top 5 Leagues Tab Navigator
const Top5TabNavigator = () => {
  const { theme, colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopWidth: 1,
          borderTopColor: theme.border,
        },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Matches: "football-outline",
            Leagues: "trophy-outline",
            Teams: "people-outline",
            Search: "search-outline",
          };
          return (
            <Ionicons
              name={icons[route.name] ?? "ellipse-outline"}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen
        name="Matches"
        component={Top5ScoreboardScreen}
        options={{ title: "Matches" }}
      />
      <Tab.Screen
        name="Leagues"
        component={Top5LeaguesScreen}
        options={{ title: "Leagues" }}
      />
      <Tab.Screen
        name="Teams"
        component={Top5TeamsScreen}
        options={{ title: "Teams" }}
      />
      <Tab.Screen
        name="Search"
        component={Top5SearchScreen}
        options={{ title: "Search" }}
      />
    </Tab.Navigator>
  );
};

// Home Tab Navigator (for main app navigation)
const HomeTabNavigator = () => {
  const { theme, colors } = useTheme();
  const { isUnlocked, checkStatus } = useStreamingAccess();
  const { isPro } = useBetSlip();

  const showTab = true; //Show Tab for Picks

  // Refresh streaming status when this navigator comes into focus
  useFocusEffect(
    React.useCallback(() => {
      checkStatus();
    }, [checkStatus]),
  );

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === "Home") {
            iconName = "home";
          } else if (route.name === "Favorites") {
            iconName = "star";
          } else if (route.name === "Picks") {
            iconName = "cash";
          } else if (route.name === "Settings") {
            iconName = "settings";
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
          title: "Home",
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Tab.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{
          title: "Favorites",
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      {isPro && showTab && (
        <Tab.Screen
          name="Picks"
          component={BetEntryScreen}
          options={{
            title: "Picks",
            headerShown: true,
            headerStyle: {
              backgroundColor: colors.primary,
            },
            headerTintColor: "#fff",
            headerTitle: (props) => <HeaderTitle {...props} />,
          }}
        />
      )}
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: "Settings",
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
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
    switch (sport.toLowerCase()) {
      case "nfl":
        return {
          ScoreboardScreen: NFLScoreboardScreen,
          StandingsScreen: NFLStandingsScreen,
          SearchScreen: NFLSearchScreen,
          CompareScreen: NFLCompareScreen,
          StatsScreen: NFLMoreScreen,
          TransactionsScreen: NFLTransactionsScreen,
          InjuriesScreen: NFLInjuriesScreen,
          DraftScreen: NFLDraftScreen,
        };
      case "mlb":
        return {
          ScoreboardScreen: MLBScoreboardScreen,
          StandingsScreen: MLBStandingsScreen,
          SearchScreen: MLBSearchScreen,
          CompareScreen: MLBCompareScreen,
          StatsScreen: MLBMoreScreen,
          TransactionsScreen: MLBTransactionsScreen,
          DraftScreen: MLBDraftScreen,
        };
      case "wbc":
        return {
          // Use lightweight WBC-specific screens (currently re-exports of MLB implementations)
          ScoreboardScreen: WBCScoreboardScreen,
          StandingsScreen: WBCStandingsScreen,
          SearchScreen: WBCSearchScreen,
          CompareScreen: WBCCompareScreen,
          StatsScreen: WBCStatsScreen,
        };
      case "nba":
        return {
          ScoreboardScreen: NBAScoreboardScreen,
          StandingsScreen: NBAStandingsScreen,
          SearchScreen: NBASearchScreen,
          CompareScreen: NBACompareScreen,
          StatsScreen: NBAMoreScreen,
          TransactionsScreen: NBATransactionsScreen,
          InjuriesScreen: NBAInjuriesScreen,
          DraftScreen: NBADraftScreen,
        };
      case "wnba":
        return {
          ScoreboardScreen: WNBAScoreboardScreen,
          StandingsScreen: WNBAStandingsScreen,
          SearchScreen: WNBASearchScreen,
          CompareScreen: WNBACompareScreen,
          StatsScreen: WNBAMoreScreen,
          TransactionsScreen: WNBATransactionsScreen,
          InjuriesScreen: WNBAInjuriesScreen,
          DraftScreen: WNBADraftScreen,
        };
      case "nhl":
        return {
          ScoreboardScreen: NHLScoreboardScreen,
          StandingsScreen: NHLStandingsScreen,
          SearchScreen: NHLSearchScreen,
          CompareScreen: NHLCompareScreen,
          StatsScreen: NHLMoreScreen,
          TransactionsScreen: NHLTransactionsScreen,
          InjuriesScreen: NHLInjuriesScreen,
        };
      case "f1":
        return {
          ScoreboardScreen: F1ResultsScreen, // Using Results screen for Scores tab
          StandingsScreen: F1StandingsScreen,
          SearchScreen: () => (
            <View style={styles.placeholderContainer}>
              <Text
                allowFontScaling={false}
                style={[styles.placeholderText, { color: theme.text }]}
              >
                Coming Soon
              </Text>
            </View>
          ),
          CompareScreen: () => (
            <View style={styles.placeholderContainer}>
              <Text
                allowFontScaling={false}
                style={[styles.placeholderText, { color: theme.text }]}
              >
                Coming Soon
              </Text>
            </View>
          ),
          StatsScreen: () => (
            <View style={styles.placeholderContainer}>
              <Text
                allowFontScaling={false}
                style={[styles.placeholderText, { color: theme.text }]}
              >
                Coming Soon
              </Text>
            </View>
          ),
        };
      case "soccer":
        return {
          ScoreboardScreen: SoccerHomeScreen,
          StandingsScreen: SoccerHomeScreen,
          SearchScreen: SoccerHomeScreen,
          CompareScreen: SoccerHomeScreen,
          MoreScreen: SoccerMoreScreen,
        };
      default:
        // For other sports, return placeholder components (can be extended later)
        return {
          ScoreboardScreen: () => (
            <View style={styles.placeholderContainer}>
              <Text
                allowFontScaling={false}
                style={[styles.placeholderText, { color: theme.text }]}
              >
                Coming Soon
              </Text>
            </View>
          ),
          StandingsScreen: () => (
            <View style={styles.placeholderContainer}>
              <Text
                allowFontScaling={false}
                style={[styles.placeholderText, { color: theme.text }]}
              >
                Coming Soon
              </Text>
            </View>
          ),
          SearchScreen: () => (
            <View style={styles.placeholderContainer}>
              <Text
                allowFontScaling={false}
                style={[styles.placeholderText, { color: theme.text }]}
              >
                Coming Soon
              </Text>
            </View>
          ),
          CompareScreen: () => (
            <View style={styles.placeholderContainer}>
              <Text
                allowFontScaling={false}
                style={[styles.placeholderText, { color: theme.text }]}
              >
                Coming Soon
              </Text>
            </View>
          ),
          StatsScreen: () => (
            <View style={styles.placeholderContainer}>
              <Text
                allowFontScaling={false}
                style={[styles.placeholderText, { color: theme.text }]}
              >
                Coming Soon
              </Text>
            </View>
          ),
        };
    }
  };

  const screens = getScreenComponents(sport);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === "Scores") {
            iconName = "stats-chart";
          } else if (route.name === "Standings") {
            iconName = "trophy";
          } else if (route.name === "Search") {
            iconName = "search";
          } else if (route.name === "Compare") {
            iconName = "git-compare";
          } else if (route.name === "Stats") {
            iconName = "bar-chart";
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
          title: "Scores",
        }}
      />
      <Tab.Screen
        name="Standings"
        component={screens.StandingsScreen}
        initialParams={{ sport }}
        options={{
          title: "Standings",
        }}
      />
      <Tab.Screen
        name="Search"
        component={screens.SearchScreen}
        initialParams={{ sport }}
        options={{
          title: "Search",
        }}
      />
      <Tab.Screen
        name="Compare"
        component={screens.CompareScreen}
        initialParams={{ sport }}
        options={{
          title: "Compare",
        }}
      />
      <Tab.Screen
        name="Stats"
        component={screens.StatsScreen || screens.MoreScreen}
        initialParams={{ sport }}
        options={{
          title:
            sport?.toLowerCase() === "nba" ||
            sport?.toLowerCase() === "nfl" ||
            sport?.toLowerCase() === "wnba" ||
            sport?.toLowerCase() === "nhl" ||
            sport?.toLowerCase() === "mlb" ||
            sport?.toLowerCase() === "soccer"
              ? "More"
              : "Stats",
          tabBarIcon: ({ color, size }) => {
            if (
              sport?.toLowerCase() === "nba" ||
              sport?.toLowerCase() === "nfl" ||
              sport?.toLowerCase() === "wnba" ||
              sport?.toLowerCase() === "nhl" ||
              sport?.toLowerCase() === "mlb" ||
              sport?.toLowerCase() === "soccer"
            ) {
              return <FontAwesome name="navicon" size={size} color={color} />;
            }
            return <Ionicons name="bar-chart" size={size} color={color} />;
          },
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
          if (route.name === "Vehicles") {
            // Wrap the image so we can control background/tint safely.
            // Avoid relying solely on tintColor which can make the icon invisible
            // when the tint matches the tab background. Provide a subtle fallback
            // color and fixed sizing for consistency.
            const iconSize = 50;
            const safeTint =
              color || (focused ? colors.primary : theme.textTertiary);
            return (
              <View
                style={{
                  width: iconSize,
                  height: iconSize,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Image
                  source={require("./assets/f1-car-svgrepo-com.png")}
                  style={{
                    width: iconSize,
                    height: iconSize,
                    tintColor: safeTint,
                  }}
                  resizeMode="contain"
                />
              </View>
            );
          }

          let iconName;
          if (route.name === "Calendar") {
            iconName = "calendar";
          } else if (route.name === "Standings") {
            iconName = "trophy";
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
          title: "Calendar",
        }}
      />
      <Tab.Screen
        name="Standings"
        component={F1StandingsScreen}
        initialParams={{ sport }}
        options={{
          title: "Standings",
        }}
      />
      <Tab.Screen
        name="Vehicles"
        component={F1VehiclesScreen}
        initialParams={{ sport }}
        options={{
          title: "Vehicles",
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
    switch (leagueId) {
      case "england":
        return {
          ScoresScreen: EnglandScoreboardScreen,
          StandingsScreen: EnglandStandingsScreen,
          SearchScreen: EnglandSearchScreen,
          CompareScreen: EnglandCompareScreen,
          StatsScreen: EnglandTransferScreen,
          MoreScreen: EnglandMoreScreen,
        };
      case "spain":
        return {
          ScoresScreen: SpainScoreboardScreen,
          StandingsScreen: SpainStandingsScreen,
          SearchScreen: SpainSearchScreen,
          CompareScreen: SpainCompareScreen,
          StatsScreen: SpainTransferScreen,
          MoreScreen: SpainMoreScreen,
        };
      case "italy":
        return {
          ScoresScreen: ItalyScoreboardScreen,
          StandingsScreen: ItalyStandingsScreen,
          SearchScreen: ItalySearchScreen,
          CompareScreen: ItalyCompareScreen,
          StatsScreen: ItalyTransferScreen,
          MoreScreen: ItalyMoreScreen,
        };
      case "germany":
        return {
          ScoresScreen: GermanyScoreboardScreen,
          StandingsScreen: GermanyStandingsScreen,
          SearchScreen: GermanySearchScreen,
          CompareScreen: GermanyCompareScreen,
          StatsScreen: GermanyTransferScreen,
          MoreScreen: GermanyMoreScreen,
        };
      case "france":
        return {
          ScoresScreen: FranceScoreboardScreen,
          StandingsScreen: FranceStandingsScreen,
          SearchScreen: FranceSearchScreen,
          CompareScreen: FranceCompareScreen,
          StatsScreen: FranceTransferScreen,
          MoreScreen: FranceMoreScreen,
        };
      case "champions-league":
        return {
          ScoresScreen: UCLScoreboardScreen,
          StandingsScreen: UCLStandingsScreen,
          SearchScreen: UCLSearchScreen,
          CompareScreen: UCLCompareScreen,
          StatsScreen: UCLBracketScreen,
          MoreScreen: UCLMoreScreen,
        };
      case "europa-league":
        return {
          ScoresScreen: UELScoreboardScreen,
          StandingsScreen: UELStandingsScreen,
          SearchScreen: UELSearchScreen,
          CompareScreen: UELCompareScreen,
          StatsScreen: UELBracketScreen,
          MoreScreen: UELMoreScreen,
        };
      case "europa-conference":
        return {
          ScoresScreen: UECLScoreboardScreen,
          StandingsScreen: UECLStandingsScreen,
          SearchScreen: UECLSearchScreen,
          CompareScreen: UECLCompareScreen,
          StatsScreen: UECLBracketScreen,
          MoreScreen: UECLMoreScreen,
        };
      case "fifa.world":
        return {
          ScoresScreen: FIFAWorldScoreboardScreen,
          StandingsScreen: FIFAWorldStandingsScreen,
          SearchScreen: FIFAWorldScoreboardScreen, // Placeholder for now
          CompareScreen: FIFAWorldScoreboardScreen, // Placeholder for now
          StatsScreen: FIFAWorldStatsScreen,
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

  // Check if it's FIFA World Cup - should only show Scores, Standings, Stats
  const isFIFAWorldCup = leagueId === "fifa.world";

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === "Scores") {
            iconName = "stats-chart";
          } else if (route.name === "Standings") {
            iconName = "trophy";
          } else if (route.name === "Search") {
            iconName = "search";
          } else if (route.name === "Compare") {
            iconName = "git-compare";
          } else if (route.name === "Stats") {
            iconName = "bar-chart";
          } else if (route.name === "Transfers") {
            iconName = "cash";
          } else if (route.name === "Bracket") {
            iconName = "git-network";
          } else if (route.name === "More") {
            iconName = "navicon";
          }

          return route.name === "More" ? (
            <FontAwesome name={iconName} size={size} color={color} />
          ) : (
            <Ionicons name={iconName} size={size} color={color} />
          );
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
          title: "Scores",
        }}
      />
      <Tab.Screen
        name="Standings"
        component={screens.StandingsScreen}
        initialParams={{ leagueId, leagueName }}
        options={{
          title: "Standings",
        }}
      />
      {!isFIFAWorldCup && (
        <Tab.Screen
          name="Search"
          component={screens.SearchScreen}
          initialParams={{ leagueId, leagueName }}
          options={{
            title: "Search",
          }}
        />
      )}
      {!isFIFAWorldCup && (
        <Tab.Screen
          name="Compare"
          component={screens.CompareScreen}
          initialParams={{ leagueId, leagueName }}
          options={{
            title: "Compare",
          }}
        />
      )}
      {isFIFAWorldCup && (
        <Tab.Screen
          name="Stats"
          component={screens.StatsScreen}
          initialParams={{ leagueId, leagueName }}
          options={{
            title: "Stats",
          }}
        />
      )}
      {!isFIFAWorldCup && (
        <Tab.Screen
          name="More"
          component={screens.MoreScreen}
          initialParams={{ leagueId, leagueName }}
          options={{
            title: "More",
          }}
        />
      )}
    </Tab.Navigator>
  );
};

// Main Stack Navigator
const MainStackNavigator = ({ initialRouteName }) => {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      initialRouteName={initialRouteName || "Home"}
      screenOptions={({ navigation }) => ({
        headerBackTitle: "Back", // Always show "Back" instead of previous screen name
        headerLeft: (props) => (
          <TouchableOpacity
            onPress={() => {
              try {
                if (
                  navigation &&
                  typeof navigation.canGoBack === "function" &&
                  navigation.canGoBack()
                ) {
                  navigation.goBack();
                } else {
                  navigation.navigate("Home");
                }
              } catch (e) {
                navigation.navigate("Home");
              }
            }}
            onLongPress={() => navigation.navigate("Home")}
            delayLongPress={500}
            hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
            style={{
              paddingHorizontal: 12,
              flexDirection: "row",
              alignItems: "center",
            }}
            accessibilityLabel="Back"
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={props?.tintColor || "#fff"}
            />
            <Text
              allowFontScaling={false}
              style={{
                color: props?.tintColor || "#fff",
                fontSize: 17,
                marginLeft: 6,
                fontWeight: "600",
              }}
            >
              Back
            </Text>
          </TouchableOpacity>
        ),
      })}
    >
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
          if (sport?.toLowerCase() === "soccer") {
            return <SoccerHomeScreen route={route} navigation={navigation} />;
          }
          // For F1, use the custom F1 tab navigator
          if (sport?.toLowerCase() === "f1") {
            return <F1TabNavigator route={route} navigation={navigation} />;
          }
          // For esports (VAL, CS2, DOTA2, LOL), use the unified esports navigator
          if (
            sport?.toLowerCase() === "cs2" ||
            sport?.toLowerCase() === "val" ||
            sport?.toLowerCase() === "valorant" ||
            sport?.toLowerCase() === "esports" ||
            sport?.toLowerCase() === "dota2" ||
            sport?.toLowerCase() === "lol"
          ) {
            return <EsportsNavigator route={route} navigation={navigation} />;
          }
          // For other sports, use the tab navigator
          return <SportTabNavigator route={route} navigation={navigation} />;
        }}
        options={({ route }) => {
          const { sport } = route.params;
          // For esports, show a unified title
          const title =
            sport?.toLowerCase() === "cs2" ||
            sport?.toLowerCase() === "val" ||
            sport?.toLowerCase() === "valorant" ||
            sport?.toLowerCase() === "esports" ||
            sport?.toLowerCase() === "dota2" ||
            sport?.toLowerCase() === "lol"
              ? "ESPORTS"
              : sport?.toLowerCase() === "soccer"
                ? "FOOTBALL"
                : sport.toUpperCase();
          return {
            headerShown: true, // Always show header for sports
            title: title,
            headerStyle: {
              backgroundColor: colors.primary,
            },
            headerTintColor: "#fff",
            headerTitle: (props) => <HeaderTitle {...props} />,
          };
        }}
      />
      <Stack.Screen
        name="GameDetails"
        component={({ route, navigation }) => {
          const { sport } = route?.params || {};
          const props = { route, navigation };
          switch (sport?.toLowerCase()) {
            case "nfl":
              return <NFLGameDetailsScreen {...props} />;
            case "mlb":
              return <MLBGameDetailsScreen {...props} />;
            case "wbc":
              return <WBCGameDetailsScreen {...props} />;
            case "nba":
              return <NBAGameDetailsScreen {...props} />;
            case "wnba":
              return <WNBAGameDetailsScreen {...props} />;
            case "nhl":
              return <NHLGameDetailsScreen {...props} />;
            case "f1":
              return <F1RaceDetailsScreen {...props} />;
            case "soccer":
              return <SpainGameDetailsScreen {...props} />;
            case "cs2":
              return <CS2MatchDetailsScreen {...props} />;
            case "val":
            case "valorant":
            case "esports":
              return <VALEventScreen {...props} />;
            default:
              return <NFLGameDetailsScreen {...props} />; // Default fallback
          }
        }}
        options={{
          title: "Game Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="SpainGameDetails"
        component={SpainGameDetailsScreen}
        options={{
          title: "Game Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="EnglandGameDetails"
        component={EnglandGameDetailsScreen}
        options={{
          title: "Game Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="ItalyGameDetails"
        component={ItalyGameDetailsScreen}
        options={{
          title: "Game Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="FranceGameDetails"
        component={FranceGameDetailsScreen}
        options={{
          title: "Game Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="GermanyGameDetails"
        component={GermanyGameDetailsScreen}
        options={{
          title: "Game Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="UCLGameDetails"
        component={UCLGameDetailsScreen}
        options={{
          title: "Game Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="UELGameDetails"
        component={UELGameDetailsScreen}
        options={{
          title: "Game Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="UECLGameDetails"
        component={UECLGameDetailsScreen}
        options={{
          title: "Game Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="F1RaceDetails"
        component={F1RaceDetailsScreen}
        options={{
          title: "Race Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="F1ConstructorDetails"
        component={F1ConstructorDetailsScreen}
        options={{
          title: "Constructor Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="F1RacerDetails"
        component={F1RacerDetailsScreen}
        options={{
          title: "Racer Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="CS2MatchDetails"
        component={CS2MatchDetailsScreen}
        options={{
          title: "Match Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="CS2Live"
        component={CS2LiveScreen}
        options={{
          title: "Live Matches",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="CS2Results"
        component={CS2ResultsScreen}
        options={{
          title: "Results",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="CS2Match"
        component={CS2MatchScreen}
        options={{
          title: "Match Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="CS2Upcoming"
        component={CS2UpcomingScreen}
        options={{
          title: "Upcoming Matches",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="CS2Tournament"
        component={CS2TournamentScreen}
        options={{
          title: "Tournament",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="CS2TeamPage"
        component={CS2TeamPageScreen}
        options={{
          title: "Team",
          headerShown: false,
        }}
      />

      {/* Valorant Esports Screens */}
      <Stack.Screen
        name="VALHome"
        component={VALHomeScreen}
        options={{
          title: "Valorant",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="VALDiscover"
        component={VALDiscoverScreen}
        options={{
          title: "Discover",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="VALLive"
        component={VALLiveScreen}
        options={{
          title: "Live Events",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="VALResults"
        component={VALResultsScreen}
        options={{
          title: "Results",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="VALUpcoming"
        component={VALUpcomingScreen}
        options={{
          title: "Upcoming Events",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="VALEvent"
        component={VALEventScreen}
        options={{
          title: "Event Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="VALSeries"
        component={VALSeriesScreen}
        options={{
          title: "Match Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="VALMatch"
        component={VALMatchScreen}
        options={{
          title: "Match Analysis",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="VALTeamPage"
        component={VALTeamPageScreen}
        options={{
          title: "Team",
          headerShown: false,
        }}
      />

      {/* League of Legends Esports Screens */}
      <Stack.Screen
        name="LOLHome"
        component={LOLHomeScreen}
        options={{
          title: "League of Legends",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="LOLDiscover"
        component={LOLDiscoverScreen}
        options={{
          title: "Discover LoL",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="LOLMatchDetails"
        component={LOLMatchDetailsScreen}
        options={{
          title: "Match Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="LOLGameDetails"
        component={LOLGameDetailsScreen}
        options={{
          title: "Game Analysis",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="LOLTournament"
        component={LOLTournamentScreen}
        options={{
          title: "Tournament",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />

      {/* CS2 Esports Screens */}
      <Stack.Screen
        name="CS2Home"
        component={CS2HomeScreen}
        options={{
          title: "Counter-Strike 2",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="CS2Discover"
        component={CS2DiscoverScreen}
        options={{
          title: "Discover",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="TeamPage"
        component={({ route, navigation }) => {
          const { sport } = route?.params || {};
          console.log(
            "TeamPage navigation - sport:",
            sport,
            "params:",
            route?.params,
          );
          const props = { route, navigation };
          switch (sport?.toLowerCase()) {
            case "nfl":
              console.log("Rendering NFL TeamPage");
              return <NFLTeamPageScreen {...props} />;
            case "mlb":
              console.log("Rendering MLB TeamPage");
              return <MLBTeamPageScreen {...props} />;
            case "wbc":
              console.log("Rendering WBC TeamPage");
              return <WBCTeamPageScreen {...props} />;
            case "nba":
              console.log("Rendering NBA TeamPage");
              return <NBATeamPageScreen {...props} />;
            case "wnba":
              console.log("Rendering WNBA TeamPage");
              return <WNBATeamPageScreen {...props} />;
            case "nhl":
              console.log("Rendering NHL TeamPage");
              return <NHLTeamPageScreen {...props} />;
            case "soccer":
              console.log("Rendering Spain TeamPage");
              return <SpainTeamPageScreen {...props} />;
            default:
              console.log("Rendering default NFL TeamPage");
              return <NFLTeamPageScreen {...props} />; // Default fallback
          }
        }}
        options={{
          title: "Team Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="SpainTeamPage"
        component={SpainTeamPageScreen}
        options={{
          title: "Team Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="EnglandTeamPage"
        component={EnglandTeamPageScreen}
        options={{
          title: "Team Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="ItalyTeamPage"
        component={ItalyTeamPageScreen}
        options={{
          title: "Team Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="FranceTeamPage"
        component={FranceTeamPageScreen}
        options={{
          title: "Team Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="GermanyTeamPage"
        component={GermanyTeamPageScreen}
        options={{
          title: "Team Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="UCLTeamPage"
        component={UCLTeamPageScreen}
        options={{
          title: "Team Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="UELTeamPage"
        component={UELTeamPageScreen}
        options={{
          title: "Team Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="UECLTeamPage"
        component={UECLTeamPageScreen}
        options={{
          title: "Team Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="SpainPlayerPage"
        component={SpainPlayerPageScreen}
        options={{
          title: "Player Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="EnglandPlayerPage"
        component={EnglandPlayerPageScreen}
        options={{
          title: "Player Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="ItalyPlayerPage"
        component={ItalyPlayerPageScreen}
        options={{
          title: "Player Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="FrancePlayerPage"
        component={FrancePlayerPageScreen}
        options={{
          title: "Player Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="GermanyPlayerPage"
        component={GermanyPlayerPageScreen}
        options={{
          title: "Player Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="UCLPlayerPage"
        component={UCLPlayerPageScreen}
        options={{
          title: "Player Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="UELPlayerPage"
        component={UELPlayerPageScreen}
        options={{
          title: "Player Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="UECLPlayerPage"
        component={UECLPlayerPageScreen}
        options={{
          title: "Player Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="FIFAWorldPlayerPage"
        component={FIFAWorldPlayerPageScreen}
        options={{
          title: "Player Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="FIFAWorldGameDetails"
        component={FIFAWorldGameDetailsScreen}
        options={{
          title: "Game Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="PlayerPage"
        component={({ route, navigation }) => {
          const { sport } = route?.params || {};
          const props = { route, navigation };
          switch (sport?.toLowerCase()) {
            case "nfl":
              return <NFLPlayerPageScreen {...props} />;
            case "mlb":
              return <MLBPlayerPageScreen {...props} />;
            case "wbc":
              return <WBCPlayerPageScreen {...props} />;
            case "nba":
              return <NBAPlayerPageScreen {...props} />;
            case "wnba":
              return <WNBAPlayerPageScreen {...props} />;
            case "nhl":
              return <NHLPlayerPageScreen {...props} />;
            default:
              return <MLBPlayerPageScreen {...props} />; // Default fallback for now
          }
        }}
        options={{
          title: "Player Details",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      {/* Soccer League Screens */}
      <Stack.Screen
        name="england"
        component={SoccerTabNavigator}
        initialParams={{ leagueId: "england", leagueName: "England" }}
        options={{
          title: "England",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="spain"
        component={SoccerTabNavigator}
        initialParams={{ leagueId: "spain", leagueName: "Spain" }}
        options={{
          title: "Spain",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="italy"
        component={SoccerTabNavigator}
        initialParams={{ leagueId: "italy", leagueName: "Italy" }}
        options={{
          title: "Italy",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="germany"
        component={SoccerTabNavigator}
        initialParams={{ leagueId: "germany", leagueName: "Germany" }}
        options={{
          title: "Germany",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="france"
        component={SoccerTabNavigator}
        initialParams={{ leagueId: "france", leagueName: "France" }}
        options={{
          title: "France",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="champions-league"
        component={SoccerTabNavigator}
        initialParams={{
          leagueId: "champions-league",
          leagueName: "Champions League",
        }}
        options={{
          title: "Champions League",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="europa-league"
        component={SoccerTabNavigator}
        initialParams={{
          leagueId: "europa-league",
          leagueName: "Europa League",
        }}
        options={{
          title: "Europa League",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="europa-conference"
        component={SoccerTabNavigator}
        initialParams={{
          leagueId: "europa-conference",
          leagueName: "Europa Conference",
        }}
        options={{
          title: "Europa Conference",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="fifa.world"
        component={SoccerTabNavigator}
        initialParams={{
          leagueId: "fifa.world",
          leagueName: "FIFA World Cup",
        }}
        options={{
          title: "FIFA World Cup",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="top5"
        component={Top5TabNavigator}
        options={{
          title: "Football",
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="Top5TeamDetail"
        component={Top5TeamDetailScreen}
        options={({ route }) => ({
          title: route.params?.teamName ?? "Team",
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        })}
      />
      <Stack.Screen
        name="Top5LeagueDetail"
        component={Top5LeagueDetailScreen}
        options={({ route }) => ({
          title: route.params?.leagueName ?? "League",
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        })}
      />
      <Stack.Screen
        name="Top5CoachDetail"
        component={Top5CoachScreen}
        options={({ route }) => ({
          title: route.params?.coachName ?? "Coach",
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        })}
      />
      <Stack.Screen
        name="Top5RefereeDetail"
        component={Top5RefereeScreen}
        options={({ route }) => ({
          title: route.params?.refereeName ?? "Referee",
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        })}
      />
      <Stack.Screen
        name="Top5PlayerDetail"
        component={Top5PlayerScreen}
        options={({ route }) => ({
          title: route.params?.playerName ?? "Player",
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        })}
      />
      <Stack.Screen
        name="Top5GameDetail"
        component={Top5GameDetailsScreen}
        options={({ route }) => ({
          title: route.params?.matchTitle ?? "Match",
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        })}
      />
      <Stack.Screen
        name="FootballLiveActivity"
        component={FootballLiveActivityController}
        options={({ route }) => ({
          title: "Live Activity",
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        })}
      />
      <Stack.Screen
        name="FavoritesManagement"
        component={FavoritesManagementScreen}
        options={{
          headerShown: false, // We're handling the header in the component
        }}
      />
      <Stack.Screen
        name="MutedUsers"
        component={MutedUsersScreen}
        options={{
          headerShown: false, // We're handling the header in the component
        }}
      />
      <Stack.Screen
        name="BetLogin"
        component={BetLoginScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="BetMain"
        component={BetTabNavigator}
        options={{
          title: "SportsHeart Picks",
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => <HeaderTitle {...props} />,
        }}
      />
      <Stack.Screen
        name="ProSplash"
        component={ProSplashScreen}
        options={{
          headerShown: false,
          animationEnabled: false,
        }}
      />
      <Stack.Screen
        name="BetGameDetail"
        component={BetGameDetailScreen}
        options={{
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: "",
        }}
      />
      <Stack.Screen
        name="BetGameStats"
        component={BetGameStatsScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="BetQuickHits"
        component={BetQuickHitsScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="BetPlayerProps"
        component={BetPlayerPropsScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="BetGameLines"
        component={BetGameLinesScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="BetAthlete"
        component={BetAthleteScreen}
        options={{
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitle: (props) => (
            <HeaderTitle {...props}>Player Details</HeaderTitle>
          ),
        }}
      />
    </Stack.Navigator>
  );
};

const GateStackNavigator = ({ initialRouteName }) => (
  <GateStack.Navigator
    initialRouteName={initialRouteName || "Onboarding"}
    screenOptions={{ headerShown: false, animationEnabled: false }}
  >
    <GateStack.Screen name="Onboarding" component={OnboardingScreen} />
    <GateStack.Screen
      name="OnboardingLogin"
      component={BetLoginScreen}
      initialParams={{ onboarding: true }}
    />
  </GateStack.Navigator>
);

const RootStackNavigator = ({
  initialRouteName,
  mainInitialRouteName,
  gateInitialRoute,
}) => (
  <RootStack.Navigator
    initialRouteName={initialRouteName}
    screenOptions={{
      headerShown: false,
      animationEnabled: true,
      animationTypeForReplace: "push",
    }}
  >
    <RootStack.Screen name="GateRoot">
      {() => <GateStackNavigator initialRouteName={gateInitialRoute} />}
    </RootStack.Screen>
    <RootStack.Screen name="MainRoot">
      {() => (
        <MainStackNavigator
          key={`main-${mainInitialRouteName}`}
          initialRouteName={mainInitialRouteName}
        />
      )}
    </RootStack.Screen>
  </RootStack.Navigator>
);

// Keep the native splash screen visible until we're ready
ExpoSplashScreen.preventAutoHideAsync();

const AppContent = () => {
  const { setIsPro, isPro } = useBetSlip();
  const { currentColorPalette, changeColorPalette, isDarkMode, theme } =
    useTheme();
  const [showSplash, setShowSplash] = useState(Platform.OS === "ios");
  const {
    isReady: onboardingReady,
    isOnboardingComplete,
    loginDontShow,
    loginDismissedThisSession,
  } = useOnboarding();
  const [authChecked, setAuthChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [pendingProSplash, setPendingProSplash] = useState(null);

  const proInitRef = useRef(false);

  // Fetch pro status from profile (made available early so revenuecat can follow)
  const fetchProStatusFromProfile = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return false;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id,is_pro")
        .eq("id", user.id)
        .maybeSingle();

      const isPro = !!profile?.is_pro;

      // Update state and storage
      if (setIsPro) setIsPro(isPro);
      try {
        if (isPro) {
          await AsyncStorage.setItem("@is_pro", "1");
        } else {
          await AsyncStorage.removeItem("@is_pro");
        }
      } catch (e) {}

      // Reset custom theme if lost Pro access
      if (!isPro && currentColorPalette === "custom") {
        changeColorPalette("red");
        const iconVariant = isDarkMode ? "dark_red" : "light_red";
        const DynamicAppIcon = require("nixa-expo-dynamic-app-icon").default;
        await DynamicAppIcon.setAppIcon(iconVariant).catch(() => {});
      }
      return isPro;
    } catch (e) {
      if (__DEV__) console.warn("Failed to fetch pro status:", e.message);
      return false;
    } finally {
      proInitRef.current = true;
    }
  };

  // Defer ALL heavy initialization until after first render
  useEffect(() => {
    // Use InteractionManager to wait until animations complete
    const handle =
      require("react-native").InteractionManager.runAfterInteractions(() => {
        // Start all background initialization tasks
        initializeBackgroundServices();

        // Register a listener for push-to-start tokens (expo-widgets)
        // When received, POST to our server to register the app-wide push-to-start token
        let pushToStartSub = null;
        try {
          pushToStartSub = addPushToStartTokenListener(async (event) => {
            try {
              const token = event?.activityPushToStartToken;
              if (!token) return;
              console.log("Received push-to-start token:", token);
              try {
                const resp = await fetch(
                  `https://laraiyeogithubio-production-08da.up.railway.app/live-activity/register-push-to-start`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      bundleId: "com.sportsheart.app",
                      token,
                    }),
                  },
                );
                const txt = await resp.text().catch(() => "");
                console.log(
                  `[App] register-push-to-start response: ${resp.status}`,
                  txt,
                );
              } catch (e) {
                console.warn(
                  "Failed to register push-to-start token",
                  e?.message || e,
                );
              }
            } catch (e) {
              console.warn(
                "Failed to register push-to-start token",
                e?.message || e,
              );
            }
          });
        } catch (e) {
          console.warn(
            "addPushToStartTokenListener not available",
            e?.message || e,
          );
        }

        return () => {
          try {
            if (pushToStartSub && typeof pushToStartSub.remove === "function")
              pushToStartSub.remove();
          } catch (e) {}
        };
      });

    return () => handle.cancel();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session || null;
        if (mounted) setHasSession(!!session?.user);
      } catch (e) {
        if (mounted) setHasSession(false);
      } finally {
        if (mounted) setAuthChecked(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const initializeBackgroundServices = async () => {
    // Run analytics init (non-blocking) with extra diagnostics
    try {
      console.log("App.js: starting analytics initialization", {
        platform: Platform.OS,
        executionEnvironment: Constants.executionEnvironment,
        appOwnership: Constants.appOwnership,
        isDev: __DEV__,
      });
    } catch (e) {
      console.log("App.js: starting analytics initialization");
    }

    analyticsService
      .initialize()
      .then(async () => {
        try {
          const diag = await analyticsService.getDiagnosticInfo();
          console.log("App.js: analytics diagnostic:", diag);
        } catch (e) {
          if (__DEV__)
            console.warn(
              "Failed to fetch analytics diagnostic:",
              e?.message || e,
            );
        }
      })
      .catch((err) => {
        if (__DEV__)
          console.warn("Analytics init failed:", err?.message || err);
      });

    // Preload emotes in background
    EmoteService.getAllEmotes().catch((err) => {
      if (__DEV__) console.warn("Emote preload failed:", err);
    });

    // Initialize PresenceService
    try {
      PresenceService.init();
    } catch (error) {
      if (__DEV__) console.warn("PresenceService init failed:", error);
    }

    // Ensure we have profile / isPro information before initializing RevenueCat
    let isProFromProfile = false;
    try {
      if (!proInitRef.current) {
        isProFromProfile = await fetchProStatusFromProfile();
      } else {
        // If proInitRef already populated, read quick flag
        try {
          const v = await AsyncStorage.getItem("@is_pro");
          isProFromProfile = v === "1";
        } catch (e) {
          isProFromProfile = false;
        }
      }
    } catch (e) {
      if (__DEV__) console.warn("Profile fetch before RevenueCat failed:", e);
    }

    // Initialize RevenueCat (most expensive) with profile-derived Pro flag
    await initializeRevenueCat(isProFromProfile);

    // Initialize ads AFTER everything else (lowest priority)
    setTimeout(() => {
      initAds().catch((err) => {
        if (__DEV__) console.warn("Ads init failed:", err.message);
      });
    }, 2000);
  };

  const initializeRevenueCat = async (isProFromProfile = false) => {
    try {
      const isExpoGo =
        Constants.appOwnership === "expo" ||
        Constants.executionEnvironment === "storeClient";
      if (isExpoGo) {
        console.log(
          "initializeRevenueCat: skipping in Expo Go (native store unavailable)",
        );
        return;
      }
      // If profile already indicates Pro access (from provider or fetched), skip RevenueCat init.
      if (isPro || isProFromProfile) {
        console.log(
          "initializeRevenueCat: skipping RevenueCat init because user is Pro from profile",
        );
        return;
      }
      let userId = null;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) userId = user.id;
      } catch (e) {}

      const initRes = await initPurchases(
        "appl_mdoICWLxVPeKJjUzLbFUKhMrXAT",
        userId,
      );

      // Fetch offerings and customer info in parallel
      const [offerings, customerInfo] = await Promise.allSettled([
        getOfferings(),
        getCustomerInfo(),
      ]);

      // Process entitlements if available
      if (customerInfo.status === "fulfilled") {
        const entitled = isEntitled(customerInfo.value, [
          "tester",
          "SportsHeart Pro",
        ]);
        try {
          if (entitled) {
            await AsyncStorage.setItem("@is_pro", "1");
          } else {
            await AsyncStorage.removeItem("@is_pro");
          }
          if (setIsPro) setIsPro(!!entitled);
        } catch (e) {}
      }
    } catch (e) {
      if (__DEV__) console.warn("RevenueCat init failed:", e.message);
    }
  };

  // Fetch pro status from profile (deferred, non-blocking)
  useEffect(() => {
    const handle =
      require("react-native").InteractionManager.runAfterInteractions(() => {
        fetchProStatusFromProfile();
      });
    return () => handle.cancel();
  }, [currentColorPalette, changeColorPalette, setIsPro]);

  // Check for updates (very low priority - after splash finishes)
  useEffect(() => {
    if (!showSplash) {
      // Only check after splash is done
      setTimeout(() => {
        UpdateService.checkForUpdatesOnStartup().catch((err) => {
          if (__DEV__) console.warn("Update check failed:", err.message);
        });
      }, 5000); // Wait 5 seconds after splash finishes
    }
  }, [showSplash]);

  const handleSplashFinish = async () => {
    console.log("[App] handleSplashFinish invoked");
    setShowSplash(false);
    // Hide the native splash screen after our custom splash finishes
    try {
      await ExpoSplashScreen.hideAsync();
      console.log("[App] ExpoSplashScreen.hideAsync succeeded");
    } catch (e) {
      console.warn("[App] ExpoSplashScreen.hideAsync failed", e?.message || e);
    }
  };

  // Hide the native splash screen as soon as our app is ready to show custom splash
  useEffect(() => {
    const hideSplash = async () => {
      // Small delay to ensure our custom splash screen is mounted
      setTimeout(async () => {
        try {
          // No HomeScreen prefetch needed; hide native splash
          await ExpoSplashScreen.hideAsync();
        } catch (error) {
          console.log("Native splash screen already hidden");
        }
      }, 100);
    };

    hideSplash();
  }, []);
  // Minimal deep linking config so incoming URLs like
  // `sportsheart://football/fixture/<id>` navigate to the Top5 game detail screen.
  const linking = {
    prefixes: ["sportsheart://"],
    config: {
      screens: {
        Top5GameDetail: "football/fixture/:fixtureId",
      },
    },
  };

  // Ensure any initial URL used to launch the app is handled even on cold start.
  useEffect(() => {
    let mounted = true;

    const handleInitialUrl = async () => {
      console.log("[DeepLink] handleInitialUrl start");
      try {
        const url = await Linking.getInitialURL();
        console.log("[DeepLink] initial url:", url);
        if (!url) return;

        const { path } = Linking.parse(url);
        console.log("[DeepLink] parsed path:", path);
        if (!path) return;

        const navigateToFixture = (p) => {
          if (p.startsWith("football/fixture/")) {
            const fixtureId = p.split("/").pop();
            if (fixtureId) {
              console.log("[DeepLink] will navigate to fixtureId:", fixtureId);
              navigationRef.navigate("Top5GameDetail", { fixtureId });
            }
          }
        };

        console.log(
          "[DeepLink] navigationRef.isReady?",
          navigationRef.isReady && navigationRef.isReady(),
        );

        if (navigationRef.isReady && navigationRef.isReady()) {
          navigateToFixture(path);
          return;
        }

        // If navigation not ready yet, wait until ready then navigate
        await new Promise((resolve) => {
          const check = () => {
            if (navigationRef.isReady && navigationRef.isReady())
              return resolve();
            setTimeout(check, 50);
          };
          check();
        });

        if (mounted) navigateToFixture(path);
      } catch (e) {
        if (__DEV__) console.warn("Initial URL handling failed:", e);
      }
    };

    handleInitialUrl();
    return () => {
      mounted = false;
    };
  }, []);

  // Listen for incoming deep links while the app is running (resume / background)
  useEffect(() => {
    const handler = ({ url }) => {
      try {
        console.log("[DeepLink] Linking event url received:", url);
        const { path } = Linking.parse(url || "");
        if (path && path.startsWith("football/fixture/")) {
          const fixtureId = path.split("/").pop();
          console.log("[DeepLink] event navigating to fixtureId:", fixtureId);
          if (navigationRef.isReady && navigationRef.isReady()) {
            navigationRef.navigate("Top5GameDetail", { fixtureId });
          }
        }
      } catch (e) {
        if (__DEV__) console.warn("Deep link event handling failed:", e);
      }
    };

    // Backwards-compatible attach
    let subscription = null;
    if (Linking.addEventListener) {
      subscription = Linking.addEventListener("url", handler);
    } else if (Linking.addListener) {
      subscription = Linking.addListener("url", handler);
    }

    return () => {
      try {
        if (subscription && subscription.remove) subscription.remove();
        else if (Linking.removeEventListener)
          Linking.removeEventListener("url", handler);
      } catch (e) {}
    };
  }, []);

  const showLoginGate =
    isOnboardingComplete &&
    !loginDontShow &&
    !loginDismissedThisSession &&
    !hasSession;

  // If onboarding login requested ProSplash, set initial route before MainStack mounts.
  useEffect(() => {
    let mounted = true;
    const inMainStack = isOnboardingComplete && !showLoginGate;
    if (!inMainStack) {
      if (mounted) setPendingProSplash(null);
      if (__DEV__)
        console.log("ProSplash gate: not in MainStack", {
          isOnboardingComplete,
          loginDontShow,
          loginDismissedThisSession,
        });
      return () => {
        mounted = false;
      };
    }

    const run = async () => {
      try {
        if (mounted) setPendingProSplash(null);
        const flag = await AsyncStorage.getItem("@show_pro_splash_next");
        if (__DEV__)
          console.log("ProSplash gate: flag read", {
            flag,
            isOnboardingComplete,
            loginDontShow,
            loginDismissedThisSession,
          });
        if (!mounted) return;

        if (!flag) {
          setPendingProSplash(false);
          return;
        }

        await AsyncStorage.removeItem("@show_pro_splash_next");
        if (__DEV__)
          console.log("ProSplash gate: flag removed, setting pending");
        if (!mounted) return;
        setPendingProSplash(true);
        return;
      } catch (e) {}
      if (mounted) setPendingProSplash(false);
    };

    run();
    return () => {
      mounted = false;
    };
  }, [
    isOnboardingComplete,
    loginDontShow,
    loginDismissedThisSession,
    hasSession,
  ]);

  const inMainStack = isOnboardingComplete && !showLoginGate;
  const mainInitialRoute = pendingProSplash ? "ProSplash" : "Home";
  if (__DEV__)
    console.log("MainStack initialRoute", {
      pendingProSplash,
      mainInitialRoute,
    });

  const rootTarget =
    inMainStack && pendingProSplash !== null ? "MainRoot" : "GateRoot";

  useEffect(() => {
    if (!onboardingReady) return;
    if (!navigationRef.isReady || !navigationRef.isReady()) return;
    const state = navigationRef.getRootState?.();
    const currentRoot = state?.routes?.[state?.index || 0]?.name || null;
    if (currentRoot === rootTarget) return;
    navigationRef.dispatch(StackActions.replace(rootTarget));
  }, [rootTarget, onboardingReady]);

  const rootInitialRoute =
    inMainStack && pendingProSplash !== null ? "MainRoot" : "GateRoot";

  const gateInitialRoute = isOnboardingComplete
    ? "OnboardingLogin"
    : "Onboarding";

  if (showSplash) return <SplashScreen onFinish={handleSplashFinish} />;
  if (!onboardingReady || (isOnboardingComplete && !authChecked)) return null;

  return (
    <NavigationContainer linking={linking} ref={navigationRef}>
      <RootStackNavigator
        initialRouteName={rootInitialRoute}
        mainInitialRouteName={mainInitialRoute}
        gateInitialRoute={gateInitialRoute}
      />
    </NavigationContainer>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <FavoritesProvider>
        <ChatProvider>
          <EmoteProvider>
            <MutedUsersProvider>
              <BetSlipProvider>
                <AppSettingsProvider>
                  <OddsDisplayProvider>
                    <BetDataProvider>
                      <OnboardingProvider>
                        <AppContent />
                      </OnboardingProvider>
                    </BetDataProvider>
                  </OddsDisplayProvider>
                </AppSettingsProvider>
              </BetSlipProvider>
            </MutedUsersProvider>
          </EmoteProvider>
        </ChatProvider>
      </FavoritesProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({});

import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";

// Import bet screens
import BetHomeScreen from "./BetHomeScreen";
import BetTopScreen from "./BetTopScreen";
import BetBetsScreen from "./BetBetsScreen";
import BetLeadersScreen from "./BetLeadersScreen";
import BetSettingsScreen from "./BetSettingsScreen";

const Tab = createBottomTabNavigator();

const SOCCERBetTabNavigator = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const sport = "SOCCER";

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === "BetHome") {
            iconName = "home";
          } else if (route.name === "BetTop") {
            iconName = "trending-up";
          } else if (route.name === "BetBets") {
            iconName = "receipt";
          } else if (route.name === "BetLeaders") {
            iconName = "trophy";
          } else if (route.name === "BetSettings") {
            iconName = "settings";
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: theme.textTertiary,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
        },
      })}
    >
      <Tab.Screen
        name="BetHome"
        options={{
          tabBarLabel: "Home",
        }}
      >
        {(props) => <BetHomeScreen {...props} sport={sport} />}
      </Tab.Screen>
      <Tab.Screen
        name="BetTop"
        options={{
          tabBarLabel: "Top",
        }}
      >
        {(props) => <BetTopScreen {...props} sport={sport} />}
      </Tab.Screen>
      <Tab.Screen
        name="BetBets"
        options={{
          tabBarLabel: "Bets",
        }}
      >
        {(props) => <BetBetsScreen {...props} sport={sport} />}
      </Tab.Screen>
      <Tab.Screen
        name="BetLeaders"
        options={{
          tabBarLabel: "Leaders",
        }}
      >
        {(props) => <BetLeadersScreen {...props} sport={sport} />}
      </Tab.Screen>
      <Tab.Screen
        name="BetSettings"
        options={{
          tabBarLabel: "Settings",
        }}
      >
        {(props) => <BetSettingsScreen {...props} sport={sport} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
};

export default SOCCERBetTabNavigator;

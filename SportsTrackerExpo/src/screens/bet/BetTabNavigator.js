import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../../context/ThemeContext";

// Import sport-specific tab navigators
import NBABetTabNavigator from "./NBABetTabNavigator";
import NFLBetTabNavigator from "./NFLBetTabNavigator";
import SOCCERBetTabNavigator from "./SOCCERBetTabNavigator";

const BetTabNavigator = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const [activeSport, setActiveSport] = useState("NBA");

  const sports = [
    { key: "NBA", label: "NBA" },
    { key: "NFL", label: "NFL" },
    { key: "SOCCER", label: "SOCCER" },
  ];

  const renderActiveSport = () => {
    switch (activeSport) {
      case "NFL":
        return <NFLBetTabNavigator navigation={navigation} route={route} />;
      case "SOCCER":
        return <SOCCERBetTabNavigator navigation={navigation} route={route} />;
      case "NBA":
      default:
        return <NBABetTabNavigator navigation={navigation} route={route} />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Custom Top Tab Bar for Sport Selection */}
      <View
        style={[
          styles.topTabBar,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        {sports.map((sport) => (
          <TouchableOpacity
            key={sport.key}
            style={[
              styles.topTab,
              activeSport === sport.key && {
                borderBottomColor: colors.primary,
              },
            ]}
            onPress={() => setActiveSport(sport.key)}
          >
            <Text
              style={[
                styles.topTabText,
                {
                  color:
                    activeSport === sport.key
                      ? colors.primary
                      : theme.textSecondary,
                  fontWeight: activeSport === sport.key ? "600" : "400",
                },
              ]}
            >
              {sport.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Active Sport Content with Bottom Tabs */}
      <View style={styles.sportContent}>{renderActiveSport()}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topTabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  topTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  topTabText: {
    fontSize: 14,
  },
  sportContent: {
    flex: 1,
  },
});

export default BetTabNavigator;

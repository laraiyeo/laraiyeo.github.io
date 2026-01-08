import React, { useState, createContext, useContext } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../../context/ThemeContext";

// Import sport-specific tab navigators
import NBABetTabNavigator from "./NBABetTabNavigator";
import NFLBetTabNavigator from "./NFLBetTabNavigator";
import SOCCERBetTabNavigator from "./SOCCERBetTabNavigator";

// Create context for current sport
const SportContext = createContext();

export const useSport = () => {
  const context = useContext(SportContext);
  if (!context) {
    throw new Error("useSport must be used within SportContext.Provider");
  }
  return context;
};

const BetTabNavigator = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const [activeSport, setActiveSport] = useState("NBA");
  const [hideSportTabs, setHideSportTabs] = useState(false);

  const sports = [
    { key: "NBA", label: "NBA" },
    { key: "NFL", label: "NFL" },
    { key: "NHL", label: "NHL" },
    //{ key: "UEFA", label: "UEFA" },
  ];

  const renderActiveSport = () => {
    const commonProps = {
      navigation,
      route,
      onHideSportTabs: setHideSportTabs,
    };

    switch (activeSport) {
      case "NFL":
        return <NFLBetTabNavigator {...commonProps} />;
      case "NHL":
        return <SOCCERBetTabNavigator {...commonProps} />; // Reuse for NHL
      case "UEFA":
        return <SOCCERBetTabNavigator {...commonProps} />;
      case "NBA":
      default:
        return <NBABetTabNavigator {...commonProps} />;
    }
  };

  return (
    <SportContext.Provider
      value={{ sport: activeSport, setSport: setActiveSport }}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Custom Top Tab Bar for Sport Selection - Hidden on certain screens */}
        {!hideSportTabs && (
          <View
            style={[
              styles.topTabBar,
              {
                backgroundColor: theme.surface,
                borderBottomColor: theme.border,
              },
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
        )}

        {/* Active Sport Content with Bottom Tabs */}
        <View style={styles.sportContent}>{renderActiveSport()}</View>
      </View>
    </SportContext.Provider>
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

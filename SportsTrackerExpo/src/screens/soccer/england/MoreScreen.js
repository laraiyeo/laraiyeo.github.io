import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../../../context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import FIFAWorldStatsScreen from "../fifa.world/FIFAWorldStatsScreen";
import EnglandTransferScreen from "./EnglandTransferScreen";
import FinderScreen from "../../FinderScreen";

const MoreScreen = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const [selected, setSelected] = useState("menu");

  const sport = (route?.params?.sport || "soccer").toLowerCase();
  const competitionCode = "eng.1";

  const renderMenu = () => (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: theme.border }]}
        onPress={() => setSelected("stats")}
        activeOpacity={0.7}
      >
        <View style={styles.iconWrap}>
          <Ionicons name="bar-chart" size={22} color={colors.primary} />
        </View>
        <View style={styles.textWrap}>
          <Text
            allowFontScaling={false}
            style={[styles.title, { color: theme.text }]}
          >
            Stats
          </Text>
          <Text
            allowFontScaling={false}
            style={[styles.subtitle, { color: theme.textTertiary }]}
          >
            Player stats
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.row, { borderBottomColor: theme.border }]}
        onPress={() => setSelected("transactions")}
        activeOpacity={0.7}
      >
        <View style={styles.iconWrap}>
          <Ionicons name="cash" size={22} color={colors.primary} />
        </View>
        <View style={styles.textWrap}>
          <Text
            allowFontScaling={false}
            style={[styles.title, { color: theme.text }]}
          >
            Transfers
          </Text>
          <Text
            allowFontScaling={false}
            style={[styles.subtitle, { color: theme.textTertiary }]}
          >
            League transfers and roster moves
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.row, { borderBottomColor: theme.border }]}
        onPress={() => setSelected("finder")}
        activeOpacity={0.7}
      >
        <View style={styles.iconWrap}>
          <Ionicons name="search" size={22} color={colors.primary} />
        </View>
        <View style={styles.textWrap}>
          <Text
            allowFontScaling={false}
            style={[styles.title, { color: theme.text }]}
          >
            Finder
          </Text>
          <Text
            allowFontScaling={false}
            style={[styles.subtitle, { color: theme.textTertiary }]}
          >
            Find games by date
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderStats = () => (
    <View style={{ flex: 1, marginTop: 0 }}>
      <FIFAWorldStatsScreen
        navigation={navigation}
        route={{
          params: {
            competition: competitionCode,
            competitionName: "Premier League",
            competitionLogo: "23",
          },
        }}
        hideSelector={false}
      />
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.secondary }]}
        onPress={() => setSelected("menu")}
        activeOpacity={0.8}
      >
        <Ionicons name="chevron-back" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const renderFinder = () => (
    <View style={{ flex: 1, marginTop: 0 }}>
      <FinderScreen
        navigation={navigation}
        route={{ params: { sport: competitionCode } }}
        hideHeader={true}
      />
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.secondary }]}
        onPress={() => setSelected("menu")}
        activeOpacity={0.8}
      >
        <Ionicons name="chevron-back" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const renderTransfers = () => (
    <View style={{ flex: 1, marginTop: 0 }}>
      <EnglandTransferScreen />
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.secondary, bottom: 70 }]}
        onPress={() => setSelected("menu")}
        activeOpacity={0.8}
      >
        <Ionicons name="chevron-back" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  if (selected === "menu") return renderMenu();
  if (selected === "stats") return renderStats();
  if (selected === "finder") return renderFinder();
  if (selected === "transactions") return renderTransfers();
  return renderMenu();
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
    paddingTop: 8,
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e6e6e6",
  },
  iconWrap: {
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  inlineHeader: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  backBtn: {
    padding: 6,
    marginRight: 8,
  },
  inlineHeaderTitle: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 17,
  },
  placeholderContainer: {
    flex: 1,
  },
  placeholderBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    position: "absolute",
    left: 14,
    bottom: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },
});

export default MoreScreen;

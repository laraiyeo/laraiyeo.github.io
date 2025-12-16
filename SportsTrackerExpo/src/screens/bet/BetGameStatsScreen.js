import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";

const BetGameStatsScreen = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const { game } = route.params || {};
  const [selectedTab, setSelectedTab] = useState("box");

  // Placeholder stats data
  const boxScoreStats = [
    { player: "Player A", pts: 25, reb: 8, ast: 5, fg: "10/18" },
    { player: "Player B", pts: 18, reb: 4, ast: 12, fg: "7/15" },
    { player: "Player C", pts: 15, reb: 10, ast: 2, fg: "6/12" },
    { player: "Player D", pts: 12, reb: 3, ast: 6, fg: "5/11" },
    { player: "Player E", pts: 10, reb: 5, ast: 3, fg: "4/9" },
  ];

  const teamStats = {
    team1: {
      name: game?.team1 || "Team A",
      fieldGoal: "45.2%",
      threePoint: "38.5%",
      freeThrow: "82.4%",
      rebounds: 42,
      assists: 25,
      turnovers: 12,
    },
    team2: {
      name: game?.team2 || "Team B",
      fieldGoal: "48.1%",
      threePoint: "35.2%",
      freeThrow: "78.9%",
      rebounds: 38,
      assists: 22,
      turnovers: 15,
    },
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Game Stats
        </Text>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tab,
            selectedTab === "box" && { backgroundColor: colors.primary },
          ]}
          onPress={() => setSelectedTab("box")}
        >
          <Text
            style={[
              styles.tabText,
              { color: selectedTab === "box" ? "white" : theme.text },
            ]}
          >
            Box Score
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            selectedTab === "team" && { backgroundColor: colors.primary },
          ]}
          onPress={() => setSelectedTab("team")}
        >
          <Text
            style={[
              styles.tabText,
              { color: selectedTab === "team" ? "white" : theme.text },
            ]}
          >
            Team Stats
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {selectedTab === "box" ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {game?.team1 || "Team A"} Box Score
            </Text>

            <View
              style={[styles.tableHeader, { backgroundColor: theme.surface }]}
            >
              <Text style={[styles.tableHeaderText, { color: theme.text }]}>
                Player
              </Text>
              <Text style={[styles.tableHeaderText, { color: theme.text }]}>
                PTS
              </Text>
              <Text style={[styles.tableHeaderText, { color: theme.text }]}>
                REB
              </Text>
              <Text style={[styles.tableHeaderText, { color: theme.text }]}>
                AST
              </Text>
              <Text style={[styles.tableHeaderText, { color: theme.text }]}>
                FG
              </Text>
            </View>

            {boxScoreStats.map((stat, index) => (
              <View
                key={index}
                style={[
                  styles.tableRow,
                  {
                    backgroundColor:
                      index % 2 === 0 ? theme.surface : "transparent",
                  },
                ]}
              >
                <Text style={[styles.playerName, { color: theme.text }]}>
                  {stat.player}
                </Text>
                <Text style={[styles.statText, { color: theme.text }]}>
                  {stat.pts}
                </Text>
                <Text style={[styles.statText, { color: theme.text }]}>
                  {stat.reb}
                </Text>
                <Text style={[styles.statText, { color: theme.text }]}>
                  {stat.ast}
                </Text>
                <Text style={[styles.statText, { color: theme.text }]}>
                  {stat.fg}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Team Comparison
            </Text>

            <View style={styles.comparisonRow}>
              <Text
                style={[styles.teamStatLabel, { color: theme.textSecondary }]}
              >
                Field Goal %
              </Text>
              <Text style={[styles.teamStatValue, { color: theme.text }]}>
                {teamStats.team1.fieldGoal}
              </Text>
              <Text style={[styles.teamStatValue, { color: theme.text }]}>
                {teamStats.team2.fieldGoal}
              </Text>
            </View>

            <View style={styles.comparisonRow}>
              <Text
                style={[styles.teamStatLabel, { color: theme.textSecondary }]}
              >
                3-Point %
              </Text>
              <Text style={[styles.teamStatValue, { color: theme.text }]}>
                {teamStats.team1.threePoint}
              </Text>
              <Text style={[styles.teamStatValue, { color: theme.text }]}>
                {teamStats.team2.threePoint}
              </Text>
            </View>

            <View style={styles.comparisonRow}>
              <Text
                style={[styles.teamStatLabel, { color: theme.textSecondary }]}
              >
                Free Throw %
              </Text>
              <Text style={[styles.teamStatValue, { color: theme.text }]}>
                {teamStats.team1.freeThrow}
              </Text>
              <Text style={[styles.teamStatValue, { color: theme.text }]}>
                {teamStats.team2.freeThrow}
              </Text>
            </View>

            <View style={styles.comparisonRow}>
              <Text
                style={[styles.teamStatLabel, { color: theme.textSecondary }]}
              >
                Rebounds
              </Text>
              <Text style={[styles.teamStatValue, { color: theme.text }]}>
                {teamStats.team1.rebounds}
              </Text>
              <Text style={[styles.teamStatValue, { color: theme.text }]}>
                {teamStats.team2.rebounds}
              </Text>
            </View>

            <View style={styles.comparisonRow}>
              <Text
                style={[styles.teamStatLabel, { color: theme.textSecondary }]}
              >
                Assists
              </Text>
              <Text style={[styles.teamStatValue, { color: theme.text }]}>
                {teamStats.team1.assists}
              </Text>
              <Text style={[styles.teamStatValue, { color: theme.text }]}>
                {teamStats.team2.assists}
              </Text>
            </View>

            <View style={styles.comparisonRow}>
              <Text
                style={[styles.teamStatLabel, { color: theme.textSecondary }]}
              >
                Turnovers
              </Text>
              <Text style={[styles.teamStatValue, { color: theme.text }]}>
                {teamStats.team1.turnovers}
              </Text>
              <Text style={[styles.teamStatValue, { color: theme.text }]}>
                {teamStats.team2.turnovers}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  tabContainer: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  tableHeaderText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  playerName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  statText: {
    flex: 1,
    fontSize: 14,
    textAlign: "center",
  },
  comparisonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  teamStatLabel: {
    flex: 2,
    fontSize: 14,
    fontWeight: "500",
  },
  teamStatValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
  },
});

export default BetGameStatsScreen;

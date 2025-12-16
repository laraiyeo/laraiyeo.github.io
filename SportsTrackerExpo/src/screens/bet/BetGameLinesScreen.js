import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";

const BetGameLinesScreen = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const { game } = route.params || {};

  // Placeholder betting lines
  const gameLines = [
    {
      category: "Spread",
      lines: [
        { label: `${game?.team1 || "Team A"} -5.5`, odds: "-110" },
        { label: `${game?.team2 || "Team B"} +5.5`, odds: "-110" },
      ],
    },
    {
      category: "Moneyline",
      lines: [
        { label: game?.team1 || "Team A", odds: "-220" },
        { label: game?.team2 || "Team B", odds: "+180" },
      ],
    },
    {
      category: "Total Points",
      lines: [
        { label: "Over 215.5", odds: "-110" },
        { label: "Under 215.5", odds: "-110" },
      ],
    },
    {
      category: "Alt Spread",
      lines: [
        { label: `${game?.team1 || "Team A"} -3.5`, odds: "+105" },
        { label: `${game?.team1 || "Team A"} -7.5`, odds: "-155" },
        { label: `${game?.team2 || "Team B"} +3.5`, odds: "-125" },
        { label: `${game?.team2 || "Team B"} +7.5`, odds: "+135" },
      ],
    },
    {
      category: "Alt Total",
      lines: [
        { label: "Over 210.5", odds: "+125" },
        { label: "Over 220.5", odds: "-145" },
        { label: "Under 210.5", odds: "-155" },
        { label: "Under 220.5", odds: "+115" },
      ],
    },
    {
      category: "1st Half Spread",
      lines: [
        { label: `${game?.team1 || "Team A"} -3.5`, odds: "-110" },
        { label: `${game?.team2 || "Team B"} +3.5`, odds: "-110" },
      ],
    },
    {
      category: "1st Half Total",
      lines: [
        { label: "Over 107.5", odds: "-110" },
        { label: "Under 107.5", odds: "-110" },
      ],
    },
    {
      category: "1st Quarter Winner",
      lines: [
        { label: game?.team1 || "Team A", odds: "-145" },
        { label: game?.team2 || "Team B", odds: "+120" },
      ],
    },
  ];

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
          Game Lines
        </Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          All betting lines for this game
        </Text>

        {gameLines.map((section, index) => (
          <View
            key={index}
            style={[styles.lineSection, { backgroundColor: theme.surface }]}
          >
            <Text style={[styles.categoryTitle, { color: theme.text }]}>
              {section.category}
            </Text>

            <View style={styles.linesContainer}>
              {section.lines.map((line, lineIndex) => (
                <TouchableOpacity
                  key={lineIndex}
                  style={[styles.lineButton, { borderColor: colors.primary }]}
                >
                  <Text style={[styles.lineLabel, { color: theme.text }]}>
                    {line.label}
                  </Text>
                  <Text style={[styles.lineOdds, { color: colors.primary }]}>
                    {line.odds}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.bottomPadding} />
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
  content: {
    flex: 1,
    padding: 16,
  },
  description: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
  },
  lineSection: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
  },
  linesContainer: {
    gap: 8,
  },
  lineButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  lineLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  lineOdds: {
    fontSize: 14,
    fontWeight: "bold",
  },
  bottomPadding: {
    height: 32,
  },
});

export default BetGameLinesScreen;

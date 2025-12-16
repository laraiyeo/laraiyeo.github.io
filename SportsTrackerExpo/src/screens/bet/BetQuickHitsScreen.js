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

const BetQuickHitsScreen = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const { game } = route.params || {};

  // Placeholder quick hit bets
  const quickHits = [
    {
      id: 1,
      category: "Next Point",
      options: [
        { label: "Team A", odds: "-110" },
        { label: "Team B", odds: "+105" },
      ],
    },
    {
      id: 2,
      category: "Next FG Type",
      options: [
        { label: "2-Point", odds: "-150" },
        { label: "3-Point", odds: "+120" },
        { label: "Free Throw", odds: "+180" },
      ],
    },
    {
      id: 3,
      category: "Next Score",
      options: [
        { label: "Under 2.5", odds: "-120" },
        { label: "Over 2.5", odds: "+100" },
      ],
    },
    {
      id: 4,
      category: "Will Next Play Be",
      options: [
        { label: "Turnover", odds: "+250" },
        { label: "Score", odds: "-180" },
        { label: "Foul", odds: "+300" },
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
          Quick Hits
        </Text>
        <View style={styles.headerRight}>
          <Ionicons name="flash" size={24} color={colors.primary} />
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          Live in-game betting on next play outcomes
        </Text>

        {quickHits.map((hit) => (
          <View
            key={hit.id}
            style={[styles.quickHitCard, { backgroundColor: theme.surface }]}
          >
            <Text style={[styles.categoryTitle, { color: theme.text }]}>
              {hit.category}
            </Text>

            <View style={styles.optionsContainer}>
              {hit.options.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.optionButton, { borderColor: colors.primary }]}
                >
                  <Text style={[styles.optionLabel, { color: theme.text }]}>
                    {option.label}
                  </Text>
                  <Text style={[styles.optionOdds, { color: colors.primary }]}>
                    {option.odds}
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
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    flex: 1,
    marginLeft: 8,
  },
  headerRight: {
    padding: 8,
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
  quickHitCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
  },
  optionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionButton: {
    flex: 1,
    minWidth: "45%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  optionOdds: {
    fontSize: 14,
    fontWeight: "bold",
  },
  bottomPadding: {
    height: 32,
  },
});

export default BetQuickHitsScreen;

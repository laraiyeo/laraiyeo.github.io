import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import BetSlip from "../../components/BetSlip";

const BetLeadersScreen = () => {
  const { colors, theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Ionicons name="trophy" size={64} color={theme.textTertiary} />
        <Text style={[styles.title, { color: theme.text }]}>Leaderboards</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Top bettors will be displayed here
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary, fontSize: 14, marginTop: 8, fontStyle: 'italic' }]}>
          Coming Soon!
        </Text>
      </ScrollView>
      <BetSlip />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
  },
});

export default BetLeadersScreen;

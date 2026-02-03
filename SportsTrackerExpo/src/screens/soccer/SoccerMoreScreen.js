import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useTheme } from "../../context/ThemeContext";

// league-specific More screens
import EnglandMoreScreen from "./england/MoreScreen";
import FranceMoreScreen from "./france/MoreScreen";
import GermanyMoreScreen from "./germany/MoreScreen";
import ItalyMoreScreen from "./italy/MoreScreen";
import SpainMoreScreen from "./spain/MoreScreen";
import UCLMoreScreen from "./champions-league/MoreScreen";
import UELMoreScreen from "./europa-league/MoreScreen";
import UECLMoreScreen from "./europa-conference/MoreScreen";

const LEAGUES = [
  { id: "england", name: "England" },
  { id: "spain", name: "Spain" },
  { id: "italy", name: "Italy" },
  { id: "germany", name: "Germany" },
  { id: "france", name: "France" },
  { id: "champions-league", name: "Champions League" },
  { id: "europa-league", name: "Europa League" },
  { id: "europa-conference", name: "Europa Conference" },
];

const SoccerMoreScreen = ({ route, navigation }) => {
  const { theme, colors } = useTheme();
  const leagueId = route?.params?.leagueId || null;

  const [selected, setSelected] = useState(leagueId || null);

  const renderSelected = () => {
    switch (selected) {
      case "england":
        return <EnglandMoreScreen route={{ params: {} }} />;
      case "spain":
        return <SpainMoreScreen route={{ params: {} }} />;
      case "italy":
        return <ItalyMoreScreen route={{ params: {} }} />;
      case "germany":
        return <GermanyMoreScreen route={{ params: {} }} />;
      case "france":
        return <FranceMoreScreen route={{ params: {} }} />;
      case "champions-league":
        return <UCLMoreScreen route={{ params: {} }} />;
      case "europa-league":
        return <UELMoreScreen route={{ params: {} }} />;
      case "europa-conference":
        return <UECLMoreScreen route={{ params: {} }} />;
      default:
        return null;
    }
  };

  if (selected) {
    return <View style={{ flex: 1 }}>{renderSelected()}</View>;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text
        allowFontScaling={false}
        style={[styles.header, { color: theme.text }]}
      >
        Select League
      </Text>
      <ScrollView>
        {LEAGUES.map((l) => (
          <TouchableOpacity
            key={l.id}
            style={[styles.row, { borderColor: theme.border }]}
            onPress={() => setSelected(l.id)}
          >
            <Text
              allowFontScaling={false}
              style={{ color: theme.text, fontSize: 16 }}
            >
              {l.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  header: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});

export default SoccerMoreScreen;

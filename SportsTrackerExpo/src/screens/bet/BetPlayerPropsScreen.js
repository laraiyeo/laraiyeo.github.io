import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Image,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";


const { width } = Dimensions.get("window");

const BetPlayerPropsScreen = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const { game } = route.params || {};
  const [expandedPlayer, setExpandedPlayer] = useState(null);
  const [showPlayerModal, setShowPlayerModal] = useState(null);
  const [selectedPropForGraph, setSelectedPropForGraph] = useState(null);
  const [parlayProps, setParlayProps] = useState([]);

  // Placeholder player data
  const players = [
    {
      id: 1,
      name: "LeBron James",
      team: "LAL",
      headshotUrl: null, // Use placeholder
      props: [
        {
          id: "pts",
          label: "Points",
          line: 27.5,
          over: "-110",
          under: "-110",
          last5: [32, 28, 24, 31, 29],
        },
        {
          id: "reb",
          label: "Rebounds",
          line: 8.5,
          over: "-120",
          under: "+100",
          last5: [10, 7, 9, 8, 11],
        },
        {
          id: "ast",
          label: "Assists",
          line: 7.5,
          over: "+105",
          under: "-125",
          last5: [9, 6, 8, 7, 10],
        },
        {
          id: "pra",
          label: "PRA",
          line: 43.5,
          over: "-115",
          under: "-105",
          last5: [51, 41, 41, 46, 50],
        },
        {
          id: "3pt",
          label: "3-Pointers",
          line: 1.5,
          over: "+150",
          under: "-180",
          last5: [2, 1, 0, 2, 3],
        },
      ],
    },
    {
      id: 2,
      name: "Stephen Curry",
      team: "GSW",
      headshotUrl: null,
      props: [
        {
          id: "pts",
          label: "Points",
          line: 29.5,
          over: "-105",
          under: "-115",
          last5: [35, 27, 31, 28, 33],
        },
        {
          id: "reb",
          label: "Rebounds",
          line: 5.5,
          over: "-110",
          under: "-110",
          last5: [6, 5, 4, 7, 5],
        },
        {
          id: "ast",
          label: "Assists",
          line: 6.5,
          over: "-120",
          under: "+100",
          last5: [8, 5, 7, 6, 9],
        },
        {
          id: "pra",
          label: "PRA",
          line: 41.5,
          over: "-110",
          under: "-110",
          last5: [49, 37, 42, 41, 47],
        },
        {
          id: "3pt",
          label: "3-Pointers",
          line: 4.5,
          over: "-130",
          under: "+110",
          last5: [6, 3, 5, 4, 7],
        },
      ],
    },
    {
      id: 3,
      name: "Giannis Antetokounmpo",
      team: "MIL",
      headshotUrl: null,
      props: [
        {
          id: "pts",
          label: "Points",
          line: 31.5,
          over: "-115",
          under: "-105",
          last5: [38, 29, 33, 30, 35],
        },
        {
          id: "reb",
          label: "Rebounds",
          line: 11.5,
          over: "-110",
          under: "-110",
          last5: [14, 10, 12, 11, 13],
        },
        {
          id: "ast",
          label: "Assists",
          line: 5.5,
          over: "+100",
          under: "-120",
          last5: [7, 4, 6, 5, 8],
        },
        {
          id: "pra",
          label: "PRA",
          line: 48.5,
          over: "-105",
          under: "-115",
          last5: [59, 43, 51, 46, 56],
        },
      ],
    },
  ];

  const toggleExpandPlayer = (playerId) => {
    setExpandedPlayer(expandedPlayer === playerId ? null : playerId);
  };

  const handleLongPress = (player) => {
    setShowPlayerModal(player);
  };

  const handlePropSelect = (prop) => {
    setSelectedPropForGraph(prop);
  };

  const addToParlay = (player, prop, type) => {
    const parlayItem = {
      id: `${player.id}-${prop.id}-${type}`,
      playerName: player.name,
      propLabel: prop.label,
      line: prop.line,
      type: type, // 'over' or 'under'
      odds: type === "over" ? prop.over : prop.under,
    };

    // Check if already in parlay
    if (parlayProps.find((p) => p.id === parlayItem.id)) {
      setParlayProps(parlayProps.filter((p) => p.id !== parlayItem.id));
    } else {
      setParlayProps([...parlayProps, parlayItem]);
    }
  };

  const renderBarGraph = (prop) => {
    if (!prop || !prop.last5) return null;

    const hitCount = prop.last5.filter((val) => val > prop.line).length;
    const maxValue = Math.max(...prop.last5, prop.line);
    const chartHeight = 200;

    return (
      <View style={styles.graphContainer}>
        <Text style={[styles.graphTitle, { color: theme.text }]}>
          Last 5 Games - Hit {hitCount}/5 times
        </Text>

        <View style={styles.chartContainer}>
          <View style={styles.barsContainer}>
            {prop.last5.map((value, index) => {
              const barHeight = (value / maxValue) * chartHeight;
              const isAboveLine = value > prop.line;

              return (
                <View key={index} style={styles.barWrapper}>
                  <View style={styles.barColumn}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: barHeight,
                          backgroundColor: isAboveLine
                            ? colors.primary
                            : theme.textTertiary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.barLabel, { color: theme.textSecondary }]}>
                    G{index + 1}
                  </Text>
                  <Text style={[styles.barValue, { color: theme.text }]}>
                    {value}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View
          style={[styles.lineIndicator, { backgroundColor: colors.secondary }]}
        >
          <Text style={styles.lineText}>Line: {prop.line}</Text>
        </View>
      </View>
    );
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
          Player Props
        </Text>
        <TouchableOpacity
          style={styles.parlayButton}
          onPress={() => {
            /* Show parlay slip */
          }}
        >
          {parlayProps.length > 0 && (
            <View
              style={[styles.parlayBadge, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.parlayBadgeText}>{parlayProps.length}</Text>
            </View>
          )}
          <Ionicons name="list" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.instruction, { color: theme.textSecondary }]}>
          Tap to expand • Long press for details
        </Text>

        {players.map((player) => (
          <View key={player.id}>
            <TouchableOpacity
              style={[styles.playerRow, { backgroundColor: theme.surface }]}
              onPress={() => toggleExpandPlayer(player.id)}
              onLongPress={() => handleLongPress(player)}
              delayLongPress={500}
            >
              <View style={styles.playerInfo}>
                <View
                  style={[
                    styles.playerAvatar,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={styles.playerInitials}>
                    {player.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </Text>
                </View>
                <View style={styles.playerDetails}>
                  <Text style={[styles.playerName, { color: theme.text }]}>
                    {player.name}
                  </Text>
                  <Text
                    style={[styles.playerTeam, { color: theme.textSecondary }]}
                  >
                    {player.team}
                  </Text>
                </View>
              </View>

              <Ionicons
                name={
                  expandedPlayer === player.id ? "chevron-up" : "chevron-down"
                }
                size={24}
                color={theme.textSecondary}
              />
            </TouchableOpacity>

            {expandedPlayer === player.id && (
              <View
                style={[
                  styles.propsContainer,
                  { backgroundColor: theme.surfaceSecondary },
                ]}
              >
                {player.props.map((prop) => {
                  const isInParlayOver = parlayProps.find(
                    (p) => p.id === `${player.id}-${prop.id}-over`
                  );
                  const isInParlayUnder = parlayProps.find(
                    (p) => p.id === `${player.id}-${prop.id}-under`
                  );

                  return (
                    <View key={prop.id} style={styles.propRow}>
                      <Text style={[styles.propLabel, { color: theme.text }]}>
                        {prop.label}
                      </Text>
                      <View style={styles.propButtons}>
                        <TouchableOpacity
                          style={[
                            styles.propButton,
                            { borderColor: colors.primary },
                            isInParlayOver && {
                              backgroundColor: colors.primary,
                            },
                          ]}
                          onPress={() => addToParlay(player, prop, "over")}
                        >
                          <Text
                            style={[
                              styles.propButtonText,
                              { color: isInParlayOver ? "white" : theme.text },
                            ]}
                          >
                            O {prop.line}
                          </Text>
                          <Text
                            style={[
                              styles.propOdds,
                              {
                                color: isInParlayOver
                                  ? "white"
                                  : colors.primary,
                              },
                            ]}
                          >
                            {prop.over}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.propButton,
                            { borderColor: colors.primary },
                            isInParlayUnder && {
                              backgroundColor: colors.primary,
                            },
                          ]}
                          onPress={() => addToParlay(player, prop, "under")}
                        >
                          <Text
                            style={[
                              styles.propButtonText,
                              { color: isInParlayUnder ? "white" : theme.text },
                            ]}
                          >
                            U {prop.line}
                          </Text>
                          <Text
                            style={[
                              styles.propOdds,
                              {
                                color: isInParlayUnder
                                  ? "white"
                                  : colors.primary,
                              },
                            ]}
                          >
                            {prop.under}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ))}

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Player Modal with Props */}
      <Modal
        visible={showPlayerModal !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowPlayerModal(null);
          setSelectedPropForGraph(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalContent, { backgroundColor: theme.surface }]}
          >
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => {
                setShowPlayerModal(null);
                setSelectedPropForGraph(null);
              }}
            >
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>

            {showPlayerModal && (
              <>
                {/* Player Header */}
                <View style={styles.modalHeader}>
                  <View
                    style={[
                      styles.modalAvatar,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text style={styles.modalInitials}>
                      {showPlayerModal.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </Text>
                  </View>
                  <Text style={[styles.modalPlayerName, { color: theme.text }]}>
                    {showPlayerModal.name}
                  </Text>
                  <Text
                    style={[
                      styles.modalPlayerTeam,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {showPlayerModal.team}
                  </Text>
                </View>

                {/* Props List */}
                <ScrollView style={styles.modalPropsScroll}>
                  {selectedPropForGraph ? (
                    <View>
                      <TouchableOpacity
                        style={styles.backToPropsButton}
                        onPress={() => setSelectedPropForGraph(null)}
                      >
                        <Ionicons
                          name="arrow-back"
                          size={20}
                          color={colors.primary}
                        />
                        <Text
                          style={[
                            styles.backToPropsText,
                            { color: colors.primary },
                          ]}
                        >
                          Back to Props
                        </Text>
                      </TouchableOpacity>
                      {renderBarGraph(selectedPropForGraph)}
                    </View>
                  ) : (
                    showPlayerModal.props.map((prop) => (
                      <TouchableOpacity
                        key={prop.id}
                        style={[
                          styles.modalPropRow,
                          { borderBottomColor: theme.border },
                        ]}
                        onPress={() => handlePropSelect(prop)}
                      >
                        <View style={styles.modalPropInfo}>
                          <Text
                            style={[
                              styles.modalPropLabel,
                              { color: theme.text },
                            ]}
                          >
                            {prop.label}
                          </Text>
                          <Text
                            style={[
                              styles.modalPropLine,
                              { color: theme.textSecondary },
                            ]}
                          >
                            Line: {prop.line}
                          </Text>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color={theme.textSecondary}
                        />
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Parlay Display */}
      {parlayProps.length > 0 && (
        <View
          style={[styles.parlayContainer, { backgroundColor: theme.surface }]}
        >
          <Text style={[styles.parlayTitle, { color: theme.text }]}>
            Parlay ({parlayProps.length})
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {parlayProps.map((item) => (
              <View
                key={item.id}
                style={[styles.parlayChip, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.parlayChipText} numberOfLines={1}>
                  {item.playerName} {item.propLabel}{" "}
                  {item.type === "over" ? "O" : "U"} {item.line}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    setParlayProps(parlayProps.filter((p) => p.id !== item.id))
                  }
                >
                  <Ionicons name="close-circle" size={16} color="white" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
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
  parlayButton: {
    padding: 8,
    position: "relative",
  },
  parlayBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  parlayBadgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
  content: {
    flex: 1,
  },
  instruction: {
    fontSize: 12,
    textAlign: "center",
    padding: 12,
    fontStyle: "italic",
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  playerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  playerInitials: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  playerDetails: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 2,
  },
  playerTeam: {
    fontSize: 12,
  },
  propsContainer: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
  },
  propRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  propLabel: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  propButtons: {
    flexDirection: "row",
    gap: 8,
  },
  propButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    minWidth: 70,
    alignItems: "center",
  },
  propButtonText: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
  },
  propOdds: {
    fontSize: 11,
    fontWeight: "bold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxHeight: "80%",
    borderRadius: 16,
    padding: 20,
  },
  modalClose: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 1,
    padding: 4,
  },
  modalHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  modalAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  modalInitials: {
    color: "white",
    fontSize: 32,
    fontWeight: "bold",
  },
  modalPlayerName: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 4,
  },
  modalPlayerTeam: {
    fontSize: 14,
  },
  modalPropsScroll: {
    maxHeight: 400,
  },
  modalPropRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalPropInfo: {
    flex: 1,
  },
  modalPropLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  modalPropLine: {
    fontSize: 14,
  },
  graphContainer: {
    padding: 16,
    alignItems: "center",
  },
  graphTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  chartContainer: {
    width: "100%",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  barsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    height: 220,
    paddingBottom: 40,
  },
  barWrapper: {
    alignItems: "center",
    flex: 1,
  },
  barColumn: {
    width: "80%",
    alignItems: "center",
    justifyContent: "flex-end",
    height: 200,
  },
  bar: {
    width: "100%",
    borderRadius: 4,
    minHeight: 5,
  },
  barLabel: {
    fontSize: 12,
    marginTop: 8,
    fontWeight: "500",
  },
  barValue: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: "600",
  },
  lineIndicator: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  lineText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  backToPropsButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  backToPropsText: {
    fontSize: 14,
    fontWeight: "600",
  },
  parlayContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  parlayTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
  },
  parlayChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginRight: 8,
    gap: 8,
    maxWidth: 200,
  },
  parlayChipText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  bottomPadding: {
    height: 32,
  },
});

export default BetPlayerPropsScreen;

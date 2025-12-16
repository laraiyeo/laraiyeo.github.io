import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import BetSlip from "../../components/BetSlip";
import { useBetSlip } from "../../context/BetSlipContext";

const BetTopScreen = () => {
  const { colors, theme } = useTheme();
  const { toggleBet } = useBetSlip();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConfidence, setSelectedConfidence] = useState("All");
  const [showConfidenceDropdown, setShowConfidenceDropdown] = useState(false);
  const [selectedProp, setSelectedProp] = useState(null);

  // Mock data - replace with actual API data
  const mockProps = [
    {
      id: "1",
      playerName: "Neemias Queta",
      team: "BOS",
      opponent: "DET",
      matchup: "BOS vs DET",
      propType: "PRA",
      line: 9.5,
      type: "over",
      odds: "+150",
      confidence: 90.3,
      stats: {
        last5: 100.0,
        last10: 90.0,
        h2h: 20.0,
        "2025": 91.3,
        "2024": 46,
      },
    },
    {
      id: "2",
      playerName: "Kel'el Ware",
      team: "MIA",
      opponent: "TOR",
      matchup: "MIA @ TOR",
      propType: "PRA",
      line: 9.5,
      type: "over",
      odds: "+145",
      confidence: 90.0,
      stats: {
        last5: 80.0,
        last10: 90.0,
        h2h: 100.0,
        "2025": 96.0,
        "2024": 82,
      },
    },
    {
      id: "3",
      playerName: "Ja Morant",
      team: "MEM",
      opponent: "LAC",
      matchup: "MEM @ LAC",
      propType: "PRA",
      line: 24.5,
      type: "over",
      odds: "+120",
      confidence: 88.1,
      stats: {
        last5: 60.0,
        last10: 70.0,
        h2h: 100.0,
        "2025": 69.2,
        "2024": 88,
      },
    },
    {
      id: "4",
      playerName: "Cam Spencer",
      team: "MEM",
      opponent: "LAC",
      matchup: "MEM @ LAC",
      propType: "PRA",
      line: 14.5,
      type: "over",
      odds: "+130",
      confidence: 88.1,
      stats: {
        last5: 100.0,
        last10: 100.0,
        h2h: 66.7,
        "2025": 72.0,
        "2024": 16,
      },
    },
    {
      id: "5",
      playerName: "Jordan Walsh",
      team: "BOS",
      opponent: "DET",
      matchup: "BOS vs DET",
      propType: "PRA",
      line: 10.5,
      type: "over",
      odds: "+140",
      confidence: 87.6,
      stats: {
        last5: 100.0,
        last10: 80.0,
        h2h: 16.7,
        "2025": 66.7,
        "2024": 71,
      },
    },
    {
      id: "6",
      playerName: "Cedric Coward",
      team: "MEM",
      opponent: "LAC",
      matchup: "MEM @ LAC",
      propType: "PRA",
      line: 16.5,
      type: "over",
      odds: "+135",
      confidence: 87.5,
      stats: {
        last5: 80.0,
        last10: 60.0,
        h2h: 50.0,
        "2025": 80.0,
        "2024": 0,
      },
    },
    {
      id: "7",
      playerName: "Kawhi Leonard",
      team: "LAC",
      opponent: "MEM",
      matchup: "LAC vs MEM",
      propType: "PRA",
      line: 22.5,
      type: "over",
      odds: "+125",
      confidence: 87.3,
      stats: {
        last5: 100.0,
        last10: 100.0,
        h2h: 85.7,
        "2025": 93.3,
        "2024": 86,
      },
    },
    {
      id: "8",
      playerName: "Jamal Shead",
      team: "TOR",
      opponent: "MIA",
      matchup: "TOR @ MIA",
      propType: "PRA",
      line: 11.5,
      type: "over",
      odds: "+138",
      confidence: 86.9,
      stats: {
        last5: 80.0,
        last10: 60.0,
        h2h: 25.0,
        "2025": 65.4,
        "2024": 56,
      },
    },
    {
      id: "9",
      playerName: "Brandon Ingram",
      team: "TOR",
      opponent: "MIA",
      matchup: "TOR @ MIA",
      propType: "PRA",
      line: 25.5,
      type: "over",
      odds: "+142",
      confidence: 86.9,
      stats: {
        last5: 80.0,
        last10: 70.0,
        h2h: 0.0,
        "2025": 76.9,
        "2024": 83,
      },
    },
  ];

  const confidenceOptions = ["All", "90%+", "85-90%", "80-85%", "75-80%"];

  const getStatColor = (percentage) => {
    if (percentage >= 80) return "#22C55E"; // Green
    if (percentage >= 60) return "#F59E0B"; // Orange
    return "#EF4444"; // Red
  };

  const filteredProps = mockProps.filter((prop) => {
    const matchesSearch = prop.playerName.toLowerCase().includes(searchQuery.toLowerCase());
    let matchesConfidence = true;

    if (selectedConfidence !== "All") {
      if (selectedConfidence === "90%+") {
        matchesConfidence = prop.confidence >= 90;
      } else if (selectedConfidence === "85-90%") {
        matchesConfidence = prop.confidence >= 85 && prop.confidence < 90;
      } else if (selectedConfidence === "80-85%") {
        matchesConfidence = prop.confidence >= 80 && prop.confidence < 85;
      } else if (selectedConfidence === "75-80%") {
        matchesConfidence = prop.confidence >= 75 && prop.confidence < 80;
      }
    }

    return matchesSearch && matchesConfidence;
  });

  const handlePropPress = (prop) => {
    setSelectedProp(prop);
  };

  const handleAddToBetSlip = () => {
    if (selectedProp) {
      toggleBet({
        id: selectedProp.id,
        gameId: `${selectedProp.team}-${selectedProp.opponent}`,
        gameInfo: {
          time: "TBD",
          teams: selectedProp.matchup,
        },
        type: selectedProp.propType,
        description: `${selectedProp.playerName} ${selectedProp.type} ${selectedProp.line}`,
        line: `${selectedProp.line}`,
        odds: selectedProp.odds,
      });
      setSelectedProp(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Filters Section */}
      <View style={[styles.filtersContainer, { backgroundColor: theme.cardBackground }]}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: theme.surface, color: theme.text }]}
          placeholder="Search player name..."
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        {/* Confidence Dropdown */}
        <TouchableOpacity
          style={[styles.dropdownButton, { backgroundColor: theme.surface }]}
          onPress={() => setShowConfidenceDropdown(!showConfidenceDropdown)}
        >
          <Text style={[styles.dropdownButtonText, { color: theme.text }]}>
            {selectedConfidence}
          </Text>
          <Ionicons
            name={showConfidenceDropdown ? "chevron-up" : "chevron-down"}
            size={20}
            color={theme.textSecondary}
          />
        </TouchableOpacity>

        {showConfidenceDropdown && (
          <View style={[styles.dropdownMenu, { backgroundColor: theme.surface }]}>
            {confidenceOptions.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.dropdownItem,
                  { borderBottomColor: theme.border },
                  option === selectedConfidence && { backgroundColor: theme.surfaceSecondary },
                ]}
                onPress={() => {
                  setSelectedConfidence(option);
                  setShowConfidenceDropdown(false);
                }}
              >
                <Text style={[styles.dropdownItemText, { color: theme.text }]}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.filterButtons}>
          <TouchableOpacity
            style={[styles.applyButton, { backgroundColor: theme.surface }]}
            onPress={() => setShowConfidenceDropdown(false)}
          >
            <Text style={[styles.applyButtonText, { color: theme.text }]}>Apply Filters</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.resetButton, { backgroundColor: theme.surface }]}
            onPress={() => {
              setSearchQuery("");
              setSelectedConfidence("All");
              setShowConfidenceDropdown(false);
            }}
          >
            <Text style={[styles.resetButtonText, { color: theme.text }]}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Props List */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.propsSection}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Today's NBA Props</Text>

          {/* Table Header */}
          <View style={styles.tableHeader}>
            <View style={styles.propColumn}>
              <Text style={[styles.headerText, { color: theme.textSecondary }]}>Prop</Text>
            </View>
            <View style={styles.statsHeaderContainer}>
              <Text style={[styles.headerText, { color: theme.textSecondary }]}>Statistics</Text>
            </View>
          </View>

          {/* Props Rows */}
          {filteredProps.map((prop) => (
            <View
              key={prop.id}
              style={[styles.propRow, { backgroundColor: theme.cardBackground }]}
            >
              <TouchableOpacity
                style={styles.propColumn}
                onPress={() => handlePropPress(prop)}
              >
                <Text style={[styles.playerName, { color: theme.text }]}>{prop.playerName}</Text>
                <Text style={[styles.propInfo, { color: theme.textSecondary }]}>
                  {prop.matchup}
                </Text>
                <Text style={[styles.propInfo, { color: theme.textSecondary }]}>
                  {prop.type.charAt(0).toUpperCase() + prop.type.slice(1)} {prop.line} {prop.propType}
                </Text>
                <Text style={[styles.propConfidence, { color: theme.text }]}>
                  {prop.confidence}% Confidence
                </Text>
              </TouchableOpacity>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.statsScroll}
              >
                {(() => {
                  const labelMap = {
                    last5: "Last 5",
                    last10: "Last 10",
                    h2h: "H2H",
                    "2025": "2025",
                    "2024": "2024",
                  };

                  // ✅ Define the exact order you want displayed
                  const statOrder = ["last5", "last10", "h2h", "2025", "2024"];

                  return statOrder.map((key) => {
                    const value = prop.stats?.[key];
                    if (value == null) return null;

                    return (
                      <View
                        key={key}
                        style={[styles.statCell, { backgroundColor: getStatColor(value) }]}
                      >
                        <Text style={styles.statValue}>{value.toFixed(1)}%</Text>
                        <Text style={styles.statLabel}>{labelMap[key]}</Text>
                      </View>
                    );
                  });
                })()}
              </ScrollView>
            </View>
          ))}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Add to Bet Slip Modal */}
      <Modal
        visible={selectedProp !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedProp(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
            {selectedProp && (
              <>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Add to Bet Slip?</Text>
                <View style={styles.modalPropInfo}>
                  <Text style={[styles.modalPlayerName, { color: theme.text }]}>
                    {selectedProp.playerName}
                  </Text>
                  <Text style={[styles.modalPropDetails, { color: theme.textSecondary }]}>
                    {selectedProp.matchup}
                  </Text>
                  <Text style={[styles.modalPropDetails, { color: theme.textSecondary }]}>
                    {selectedProp.type.charAt(0).toUpperCase() + selectedProp.type.slice(1)}{" "}
                    {selectedProp.line} {selectedProp.propType}
                  </Text>
                  <Text style={[styles.modalOdds, { color: colors.primary }]}>
                    {selectedProp.odds}
                  </Text>
                  <Text style={[styles.modalConfidence, { color: theme.text }]}>
                    {selectedProp.confidence}% Confidence
                  </Text>
                </View>

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton, { backgroundColor: theme.surface }]}
                    onPress={() => setSelectedProp(null)}
                  >
                    <Text style={[styles.cancelButtonText, { color: theme.text }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.addButton, { backgroundColor: colors.primary }]}
                    onPress={handleAddToBetSlip}
                  >
                    <Text style={styles.addButtonText}>Add to Bet Slip</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <BetSlip />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filtersContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  searchInput: {
    height: 48,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 12,
  },
  dropdownButton: {
    height: 48,
    borderRadius: 8,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  dropdownButtonText: {
    fontSize: 16,
  },
  dropdownMenu: {
    borderRadius: 8,
    marginBottom: 12,
    overflow: "hidden",
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  dropdownItemText: {
    fontSize: 16,
  },
  filterButtons: {
    flexDirection: "row",
    gap: 12,
  },
  applyButton: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  resetButton: {
    paddingHorizontal: 24,
    height: 44,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  propsSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  propColumn: {
    width: 180,
    paddingRight: 8,
  },
  statsScroll: {
    flex: 1,
  },
  statsHeaderContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statColumn: {
    width: 80,
    alignItems: "center",
  },
  statHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    fontSize: 12,
    fontWeight: "600",
    marginHorizontal: 2,
  },
  propRow: {
    flexDirection: "row",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  playerName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  propInfo: {
    fontSize: 13,
    marginBottom: 2,
  },
  propLine: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  propConfidence: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  statCell: {
    width: 80,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 4,
    borderRadius: 6,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFF",
    opacity: 0.9,
  },
  bottomPadding: {
    height: 100,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 16,
    textAlign: "center",
  },
  modalPropInfo: {
    marginBottom: 24,
    alignItems: "center",
  },
  modalPlayerName: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
  },
  modalPropDetails: {
    fontSize: 16,
    marginBottom: 4,
  },
  modalOdds: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: 8,
    marginBottom: 4,
  },
  modalConfidence: {
    fontSize: 16,
    fontWeight: "600",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButton: {},
  addButton: {},
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
});

export default BetTopScreen;

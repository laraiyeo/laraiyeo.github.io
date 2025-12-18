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
import { useBetData } from "../../context/BetDataContext";

const BetTopScreen = () => {
  const { colors, theme } = useTheme();
  const { toggleBet } = useBetSlip();
  const { rostersData, scoreboardData } = useBetData();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConfidence, setSelectedConfidence] = useState("All");
  const [showConfidenceDropdown, setShowConfidenceDropdown] = useState(false);
  const [selectedProp, setSelectedProp] = useState(null);
  const [selectedPropType, setSelectedPropType] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [oddsRange, setOddsRange] = useState([-2000, 900]);
  const [tempOddsRange, setTempOddsRange] = useState([-2000, 900]);
  const [sortBy, setSortBy] = useState("confidence");
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const ITEMS_PER_PAGE = 30;

  // Generate props from roster data
  const allProps = [];

  if (rostersData?.teams) {
    // Prop type mapping for consistent IDs
    const propTypeMap = {
      'PTS': 'Points',
      'REB': 'Rebounds',
      'AST': 'Assists',
      'BLK': 'Blocks',
      'STL': 'Steals',
      'TO': 'Turnovers',
      'PF': 'Fouls',
      'FGM': 'Field Goals Made',
      'FGA': 'Field Goals Attempted',
      'FG3M': '3-Pointers Made',
      'FTM': 'Free Throws Made'
    };
    
    rostersData.teams.forEach((team) => {
      team.athletes?.forEach((athlete) => {
        if (!athlete.odds?.overUnder) return;

        // Process each prop type
        Object.entries(athlete.odds.overUnder).forEach(([propType, data]) => {
          if (!data.line) return;
          
          // Convert propType to full word for consistent IDs
          const fullPropType = propTypeMap[propType] || propType;

          // Add Over prop
          if (data.oConfidence) {
            allProps.push({
              id: `${athlete.id}-${fullPropType}-${data.line}-over`,
              playerId: athlete.id,
              playerName: athlete.shortName || athlete.name,
              fullName: athlete.name,
              team: team.abbreviation,
              propType,
              line: data.line,
              type: "over",
              odds: data.over > 0 ? `+${data.over}` : String(data.over),
              confidence: parseFloat(data.oConfidence),
              stats: {
                last5: parseFloat(data.o5 || 0),
                last10: parseFloat(data.o10 || 0),
                h2h: data.oH2h ? parseFloat(data.oH2h) : null,
                season: parseFloat(data.oSeason || 0),
              },
            });
          }

          // Add Under prop
          if (data.uConfidence) {
            allProps.push({
              id: `${athlete.id}-${fullPropType}-${data.line}-under`,
              playerId: athlete.id,
              playerName: athlete.shortName || athlete.name,
              fullName: athlete.name,
              team: team.abbreviation,
              propType,
              line: data.line,
              type: "under",
              odds: data.under > 0 ? `+${data.under}` : String(data.under),
              confidence: parseFloat(data.uConfidence),
              stats: {
                last5: parseFloat(data.u5 || 0),
                last10: parseFloat(data.u10 || 0),
                h2h: data.uH2h ? parseFloat(data.uH2h) : null,
                season: parseFloat(data.uSeason || 0),
              },
            });
          }
        });
      });
    });
  }

  // Sort by confidence descending
  allProps.sort((a, b) => b.confidence - a.confidence);

  const mockProps = [];

  const confidenceOptions = ["All", "90%+", "85-90%", "80-85%", "75-80%"];
  const sortOptions = [
    { label: "Confidence", value: "confidence" },
    { label: "Odds", value: "odds" },
    { label: "Last 5", value: "last5" },
    { label: "Last 10", value: "last10" },
    { label: "H2H", value: "h2h" },
    { label: "Season", value: "season" },
  ];

  const getStatColor = (percentage) => {
    if (percentage >= 80) return "#22C55E"; // Green
    if (percentage >= 60) return "#F59E0B"; // Orange
    return "#EF4444"; // Red
  };

  const filteredProps = allProps.filter((prop) => {
    const matchesSearch = prop.playerName
      .toLowerCase()
      .includes(searchQuery.toLowerCase()) ||
      (prop.fullName && prop.fullName.toLowerCase().includes(searchQuery.toLowerCase()));
    let matchesConfidence = true;
    let matchesPropType =
      selectedPropType === "All" || prop.propType === selectedPropType;

    // Parse odds (remove + sign and convert to number)
    const oddsValue = parseInt(prop.odds.replace("+", ""));
    const matchesOdds = oddsValue >= oddsRange[0] && oddsValue <= oddsRange[1];

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

    return matchesSearch && matchesConfidence && matchesPropType && matchesOdds;
  });

  // Sort props
  const sortedProps = [...filteredProps].sort((a, b) => {
    if (sortBy === "confidence") {
      return b.confidence - a.confidence;
    } else if (sortBy === "odds") {
      const aOdds = parseInt(a.odds.replace("+", ""));
      const bOdds = parseInt(b.odds.replace("+", ""));
      return bOdds - aOdds;
    } else if (sortBy === "last5") {
      return (b.stats.last5 || 0) - (a.stats.last5 || 0);
    } else if (sortBy === "last10") {
      return (b.stats.last10 || 0) - (a.stats.last10 || 0);
    } else if (sortBy === "h2h") {
      return (b.stats.h2h || 0) - (a.stats.h2h || 0);
    } else if (sortBy === "season") {
      return (b.stats.season || 0) - (a.stats.season || 0);
    }
    return 0;
  });

  // Pagination logic
  const totalPages = Math.ceil(sortedProps.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedProps = sortedProps.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedConfidence, selectedPropType, oddsRange, sortBy]);

  const handlePropPress = (prop) => {
    setSelectedProp(prop);
  };

  const handleAddToBetSlip = () => {
    if (selectedProp) {
      // Convert prop type abbreviations to full words
      const propTypeMap = {
        'PTS': 'Points',
        'REB': 'Rebounds',
        'AST': 'Assists',
        'BLK': 'Blocks',
        'STL': 'Steals',
        'TO': 'Turnovers',
        'PF': 'Fouls',
        'FGM': 'Field Goals Made',
        'FGA': 'Field Goals Attempted',
        'FG3M': '3-Pointers Made',
        'FTM': 'Free Throws Made',
        'PRA': 'PRA'
      };
      
      const fullPropType = propTypeMap[selectedProp.propType] || selectedProp.propType;
      
      // Convert to lowercase for statType to match BetGameDetailScreen format
      const statType = fullPropType.toLowerCase();

      // Build bet value for API (e.g., "o29.5" or "u29.5")
      const betValue =
        selectedProp.type === "over"
          ? `o${selectedProp.line}`
          : `u${selectedProp.line}`;

      // Find game from scoreboard data using team abbreviation
      let gameId = `${selectedProp.team}-${selectedProp.opponent}`;
      let gameInfo = {
        time: "TBD",
        teams: selectedProp.matchup,
      };

      if (scoreboardData?.events) {
        const game = scoreboardData.events.find(event => {
          const competition = event.competitions?.[0];
          const competitors = competition?.competitors || [];
          // Check if this game includes the team
          return competitors.some(competitor => 
            competitor.team?.abbreviation === selectedProp.team
          );
        });

        if (game) {
          gameId = game.id;
          const competition = game.competitions?.[0];
          const shortDetail = game?.status?.type?.shortDetail || "TBD";
          const shortName = game.shortName || "TBD";
          
          gameInfo = {
            time: shortDetail,
            teams: shortName,
          };
        }
      }

      toggleBet({
        id: selectedProp.id, // Keep unique ID for React
        gameId: gameId,
        gameInfo: gameInfo,
        playerId: selectedProp.playerId,
        player: selectedProp.playerName,
        team: selectedProp.team,
        prop: `${fullPropType} ${selectedProp.type} ${selectedProp.line}`,
        statType: statType,
        betValue: betValue,
        type: selectedProp.type === "over" ? "over" : "under",
        line: `${selectedProp.line}`,
        odds: selectedProp.odds,
        description: `${selectedProp.playerName} ${fullPropType} ${selectedProp.type === "over" ? "O" : "U"}${selectedProp.line}`,
      });
      setSelectedProp(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Filters Section */}
      <View
        style={[
          styles.filtersContainer,
          { backgroundColor: theme.cardBackground },
        ]}
      >
        {/* Search and Confidence Row */}
        <View style={styles.searchRow}>
          <TextInput
            style={[
              styles.searchInput,
              { backgroundColor: theme.surface, color: theme.text },
            ]}
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
        </View>

        {showConfidenceDropdown && (
          <View
            style={[styles.dropdownMenu, { backgroundColor: theme.surface }]}
          >
            {confidenceOptions.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.dropdownItem,
                  { borderBottomColor: theme.border },
                  option === selectedConfidence && {
                    backgroundColor: theme.surfaceSecondary,
                  },
                ]}
                onPress={() => {
                  setSelectedConfidence(option);
                  setShowConfidenceDropdown(false);
                }}
              >
                <Text style={[styles.dropdownItemText, { color: theme.text }]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Odds Range Inputs */}
        <View style={styles.sliderContainer}>
          <View style={styles.oddsAndSortRow}>
            <View style={styles.oddsSection}>
              <Text style={[styles.sliderLabel, { color: theme.text }]}>
                Odds Range
              </Text>
              <View style={styles.sliderRow}>
                <TextInput
                  style={[
                    styles.oddsInput,
                    { backgroundColor: theme.surface, color: theme.text },
                  ]}
                  placeholder="-2000"
                  placeholderTextColor={theme.textSecondary}
                  value={
                    tempOddsRange[0] === -2000 ? "" : String(tempOddsRange[0])
                  }
                  onChangeText={(text) => {
                    if (text === "" || text === "-") {
                      setTempOddsRange([
                        text === "" ? -2000 : "-",
                        tempOddsRange[1],
                      ]);
                    } else {
                      const value = parseInt(text);
                      if (!isNaN(value)) {
                        setTempOddsRange([value, tempOddsRange[1]]);
                      }
                    }
                  }}
                  allowFontScaling={false}
                />
                <Text
                  style={[styles.oddsToText, { color: theme.textSecondary }]}
                >
                  to
                </Text>
                <TextInput
                  style={[
                    styles.oddsInput,
                    { backgroundColor: theme.surface, color: theme.text },
                  ]}
                  placeholder="900"
                  placeholderTextColor={theme.textSecondary}
                  value={
                    tempOddsRange[1] === 900 ? "" : String(tempOddsRange[1])
                  }
                  onChangeText={(text) => {
                    const value = text === "" ? 900 : parseInt(text) || 900;
                    setTempOddsRange([tempOddsRange[0], value]);
                  }}
                />
              </View>
            </View>

            <View style={styles.sortSection}>
              <Text style={[styles.sliderLabel, { color: theme.text }]}>
                Sort By
              </Text>
              <TouchableOpacity
                style={[styles.sortButton, { backgroundColor: theme.surface }]}
                onPress={() => setShowSortDropdown(!showSortDropdown)}
              >
                <Text style={[styles.sortButtonText, { color: theme.text }]}>
                  {sortOptions.find((opt) => opt.value === sortBy)?.label}
                </Text>
                <Ionicons
                  name={showSortDropdown ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {showSortDropdown && (
            <View
              style={[
                styles.sortDropdownMenu,
                { backgroundColor: theme.surface },
              ]}
            >
              {sortOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.dropdownItem,
                    { borderBottomColor: theme.border },
                    option.value === sortBy && {
                      backgroundColor: theme.surfaceSecondary,
                    },
                  ]}
                  onPress={() => {
                    setSortBy(option.value);
                    setShowSortDropdown(false);
                  }}
                >
                  <Text
                    style={[styles.dropdownItemText, { color: theme.text }]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.filterButtons}>
          <TouchableOpacity
            style={[styles.applyButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              setOddsRange(tempOddsRange);
              setShowConfidenceDropdown(false);
              setShowSortDropdown(false);
            }}
          >
            <Text style={[styles.applyButtonText, { color: "#FFF" }]}>
              Apply Filters
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.resetButton, { backgroundColor: theme.surface }]}
            onPress={() => {
              setSearchQuery("");
              setSelectedConfidence("All");
              setShowConfidenceDropdown(false);
              setShowSortDropdown(false);
              setOddsRange([-2000, 900]);
              setTempOddsRange([-2000, 900]);
              setSortBy("confidence");
            }}
          >
            <Text style={[styles.resetButtonText, { color: theme.text }]}>
              Reset
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Props List */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.propsSection}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <View style={styles.propColumn}>
              <Text style={[styles.headerText, { color: theme.textSecondary }]}>
                Prop
              </Text>
            </View>
            <View style={styles.statsHeaderContainer}>
              <Text style={[styles.headerText, { color: theme.textSecondary }]}>
                Statistics
              </Text>
            </View>
          </View>

          {/* Props Rows */}
          {paginatedProps.map((prop) => (
            <View
              key={prop.id}
              style={[
                styles.propRow,
                { backgroundColor: theme.cardBackground },
              ]}
            >
              <TouchableOpacity
                style={styles.propColumn}
                onPress={() => handlePropPress(prop)}
              >
                <Text style={[styles.playerName, { color: theme.text }]}>
                  {prop.playerName}
                </Text>
                <Text style={[styles.propInfo, { color: theme.textSecondary }]}>
                  {prop.team}
                </Text>
                <Text style={[styles.propInfo, { color: theme.textSecondary }]}>
                  {prop.type.charAt(0).toUpperCase() + prop.type.slice(1)}{" "}
                  {prop.line} {prop.propType}
                </Text>
                <Text style={[styles.propOdds, { color: colors.primary }]}>
                  {prop.odds}
                </Text>
                <Text style={[styles.propConfidence, { color: theme.text }]}>
                  {prop.confidence.toFixed(1)}% Confidence
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
                    season: "Season",
                  };

                  const statOrder = ["last5", "last10", "h2h", "season"];

                  return statOrder.map((key) => {
                    const value = prop.stats?.[key];
                    if (value == null) return null;

                    return (
                      <View
                        key={key}
                        style={[
                          styles.statCell,
                          { backgroundColor: getStatColor(value) },
                        ]}
                      >
                        <Text style={styles.statValue}>
                          {value.toFixed(1)}%
                        </Text>
                        <Text style={styles.statLabel}>{labelMap[key]}</Text>
                      </View>
                    );
                  });
                })()}
              </ScrollView>
            </View>
          ))}
        </View>

        {/* Pagination */}
        {totalPages > 1 && (
          <View style={styles.paginationContainer}>
            <TouchableOpacity
              style={[
                styles.paginationButton,
                { backgroundColor: theme.cardBackground },
                currentPage === 1 && styles.paginationButtonDisabled,
              ]}
              onPress={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={currentPage === 1 ? theme.textTertiary : theme.text}
              />
            </TouchableOpacity>

            <View style={styles.paginationInfo}>
              <Text style={[styles.paginationText, { color: theme.text }]}>
                Page {currentPage} of {totalPages}
              </Text>
              <Text
                style={[
                  styles.paginationSubtext,
                  { color: theme.textSecondary },
                ]}
              >
                Showing {startIndex + 1}-
                {Math.min(endIndex, sortedProps.length)} of {sortedProps.length}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.paginationButton,
                { backgroundColor: theme.cardBackground },
                currentPage === totalPages && styles.paginationButtonDisabled,
              ]}
              onPress={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={
                  currentPage === totalPages ? theme.textTertiary : theme.text
                }
              />
            </TouchableOpacity>
          </View>
        )}

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
          <View
            style={[styles.modalContent, { backgroundColor: theme.background }]}
          >
            {selectedProp && (
              <>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  Add to Bet Slip?
                </Text>
                <View style={styles.modalPropInfo}>
                  <Text style={[styles.modalPlayerName, { color: theme.text }]}>
                    {selectedProp.playerName}
                  </Text>
                  <Text
                    style={[
                      styles.modalPropDetails,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {selectedProp.team}
                  </Text>
                  <Text
                    style={[
                      styles.modalPropDetails,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {selectedProp.type.charAt(0).toUpperCase() +
                      selectedProp.type.slice(1)}{" "}
                    {selectedProp.line} {selectedProp.propType}
                  </Text>
                  <Text style={[styles.modalOdds, { color: colors.primary }]}>
                    {selectedProp.odds}
                  </Text>
                  <Text style={[styles.modalConfidence, { color: theme.text }]}>
                    {selectedProp.confidence.toFixed(1)}% Confidence
                  </Text>
                </View>

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[
                      styles.modalButton,
                      styles.cancelButton,
                      { backgroundColor: theme.surface },
                    ]}
                    onPress={() => setSelectedProp(null)}
                  >
                    <Text
                      style={[styles.cancelButtonText, { color: theme.text }]}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalButton,
                      styles.addButton,
                      { backgroundColor: colors.primary },
                    ]}
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
  searchRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  dropdownButton: {
    width: 140,
    height: 48,
    borderRadius: 8,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  sliderContainer: {
    marginBottom: 16,
  },
  oddsAndSortRow: {
    flexDirection: "row",
    gap: 12,
  },
  oddsSection: {
    flex: 1,
  },
  sortSection: {
    width: 140,
  },
  sliderLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  oddsInput: {
    width: 100,
    height: 48,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  oddsToText: {
    fontSize: 14,
    fontWeight: "600",
    marginHorizontal: 4,
  },
  sortButton: {
    height: 48,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sortButtonText: {
    fontSize: 14,
    flex: 1,
  },
  sortDropdownMenu: {
    borderRadius: 8,
    marginTop: 8,
    overflow: "hidden",
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
    marginTop: -8,
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
  propOdds: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
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
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 20,
    gap: 16,
  },
  paginationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  paginationButtonDisabled: {
    opacity: 0.3,
  },
  paginationInfo: {
    alignItems: "center",
  },
  paginationText: {
    fontSize: 14,
    fontWeight: "600",
  },
  paginationSubtext: {
    fontSize: 12,
    marginTop: 2,
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

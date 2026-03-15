import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { useTheme } from "../../context/ThemeContext";
import WBCService from "../../services/WBCService";
import { loadWBCSearchData } from "../../services/WBCSearchCache";
import { useBetSlip } from '../../context/BetSlipContext';
import { BannerAdWrapper } from '../../services/ads';

const CompareScreen = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors, isDarkMode } = useTheme();
  const { isPro } = useBetSlip();
  const AD_SPACE = 80;

  const [player1, setPlayer1] = useState(null);
  const [player2, setPlayer2] = useState(null);
  const [comparisonStats, setComparisonStats] = useState(null);
  const [loading, setLoading] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchingForPlayer, setSearchingForPlayer] = useState(null);
  const [allPlayersLoading, setAllPlayersLoading] = useState(false);

  // All WBC players in compare-ready shape
  const [allWBCPlayers, setAllWBCPlayers] = useState([]);

  // Load from cache on mount
  useEffect(() => {
    let mounted = true;
    setAllPlayersLoading(true);
    loadWBCSearchData()
      .then(({ teams, players }) => {
        if (!mounted) return;
        const teamMap = Object.fromEntries(teams.map((t) => [t.id, t]));
        const mapped = players.map((p) => ({
          id: p.id,
          fullName: p.fullName,
          position: p.primaryPosition?.abbreviation || "N/A",
          positionName: p.primaryPosition?.name || "",
          jersey: p.primaryNumber || "N/A",
          teamId: p.currentTeam?.id,
          teamName: teamMap[p.currentTeam?.id]?.name || "",
          teamAbbr: teamMap[p.currentTeam?.id]?.abbreviation || "",
          headshot: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${p.id}/headshot/67/current`,
          isTwoWayPlayer: false,
        }));
        setAllWBCPlayers(mapped);
      })
      .catch((e) => {
        console.error("WBC compare data load error:", e);
        if (mounted) Alert.alert("Error", "Failed to load WBC player data.");
      })
      .finally(() => {
        if (mounted) setAllPlayersLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (player1 && player2) loadComparison();
  }, [player1, player2]);

  // Debounced client-side search
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchText.length >= 2) {
        setSearchLoading(true);
        const q = searchText.toLowerCase();
        const results = allWBCPlayers
          .filter((p) => p.fullName.toLowerCase().includes(q))
          .slice(0, 15);
        setSearchResults(results);
        setSearchLoading(false);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [searchText, allWBCPlayers]);

  const selectPlayer = (player, playerNumber) => {
    if (playerNumber === 1) setPlayer1(player);
    else setPlayer2(player);
    setShowSearchModal(false);
    setSearchText("");
    setSearchResults([]);
  };

  const clearPlayer = (playerNumber) => {
    if (playerNumber === 1) setPlayer1(null);
    else setPlayer2(null);
    setComparisonStats(null);
  };
        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingBottom: isPro ? 20 : 20 + AD_SPACE }] }>

        {!isPro && (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' }}>
            <BannerAdWrapper />
          </View>
        )}
  const openPlayerSearch = (playerNumber) => {
    setSearchingForPlayer(playerNumber);
    setShowSearchModal(true);
  };

  const loadComparison = async () => {
    if (!player1 || !player2) return;
    setLoading(true);
    try {
      const res = await WBCService.fetchJson(
        `/wbc/compare/${player1.id}-${player2.id}`,
      );

      const statsA = res?.data?.playerA?.seasonStats ?? [];
      const statsB = res?.data?.playerB?.seasonStats ?? [];

      const getStats = (seasonStats, group) =>
        seasonStats.find((s) => s.group?.displayName === group)?.splits?.[0]
          ?.stat ?? null;

      const isPitcher = (pos) =>
        ["P", "SP", "RP", "CP", "Pitcher"].includes(pos);
      const group =
        isPitcher(player1.position) || isPitcher(player2.position)
          ? "pitching"
          : "hitting";

      const stats1 = getStats(statsA, group);
      const stats2 = getStats(statsB, group);

      if (!stats1 && !stats2) {
        setComparisonStats({ error: "No statistics available for comparison" });
        setLoading(false);
        return;
      }

      const hitDefs = [
        { key: "Avg", label: "AVG", higherIsBetter: true },
        { key: "Home Runs", label: "HR", higherIsBetter: true },
        { key: "Rbi", label: "RBI", higherIsBetter: true },
        { key: "Obp", label: "OBP", higherIsBetter: true },
        { key: "Slg", label: "SLG", higherIsBetter: true },
        { key: "Ops", label: "OPS", higherIsBetter: true },
        { key: "Hits", label: "H", higherIsBetter: true },
        { key: "Runs", label: "R", higherIsBetter: true },
        { key: "Stolen Bases", label: "SB", higherIsBetter: true },
        { key: "Strike Outs", label: "K", higherIsBetter: false },
      ];
      const pitDefs = [
        { key: "Era", label: "ERA", higherIsBetter: false },
        { key: "Whip", label: "WHIP", higherIsBetter: false },
        { key: "Wins", label: "W", higherIsBetter: true },
        { key: "Strike Outs", label: "K", higherIsBetter: true },
        { key: "Saves", label: "SV", higherIsBetter: true },
        { key: "Innings Pitched", label: "IP", higherIsBetter: true },
        { key: "Base On Balls", label: "BB", higherIsBetter: false },
        { key: "Losses", label: "L", higherIsBetter: false },
        { key: "Hits", label: "H", higherIsBetter: false },
        { key: "Home Runs", label: "HR", higherIsBetter: false },
      ];

      const defs = group === "pitching" ? pitDefs : hitDefs;
      const isDecimalKey = (k) =>
        ["Avg", "Obp", "Slg", "Ops", "Era", "Whip"].includes(k);

      const compData = defs.map((def) => {
        const fallback = isDecimalKey(def.key) ? "0.000" : "0";
        const v1 = stats1?.[def.key] ?? fallback;
        const v2 = stats2?.[def.key] ?? fallback;
        const n1 = parseFloat(v1) || 0;
        const n2 = parseFloat(v2) || 0;
        let p1Better = false,
          p2Better = false;
        if (n1 !== 0 || n2 !== 0) {
          if (def.higherIsBetter) {
            p1Better = n1 > n2;
            p2Better = n2 > n1;
          } else {
            p1Better = n1 < n2;
            p2Better = n2 < n1;
          }
        }
        return {
          ...def,
          player1Value: v1,
          player2Value: v2,
          player1Better: p1Better,
          player2Better: p2Better,
        };
      });

      setComparisonStats({
        stats: compData,
        comparisonType: group === "pitching" ? "Pitching" : "Hitting",
      });
    } catch (e) {
      console.error("Compare error:", e);
      setComparisonStats({ error: "Error loading comparison statistics" });
    }
    setLoading(false);
  };

  const renderPlayerCard = (player, playerNumber) => {
    const teamColor = player?.teamId
      ? WBCService.getTeamColor(player.teamId)
      : null;
    const logo = player?.teamId
      ? WBCService.getTeamLogo(player.teamId, isDarkMode)
      : null;

    return (
      <View
        style={[
          styles.playerCard,
          { backgroundColor: theme.surface },
          teamColor ? { borderWidth: 2, borderColor: teamColor } : null,
        ]}
      >
        {player ? (
          <>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => clearPlayer(playerNumber)}
            >
              <Text allowFontScaling={false} style={styles.clearButtonText}>
                ×
              </Text>
            </TouchableOpacity>

            {logo && (
              <View style={styles.teamHeader}>
                <Image
                  source={{ uri: logo }}
                  style={styles.teamLogo}
                  resizeMode="contain"
                />
                <Text
                  allowFontScaling={false}
                  style={[styles.teamName, { color: theme.text }]}
                >
                  {player.teamAbbr}
                </Text>
              </View>
            )}

            <View style={styles.playerImageContainer}>
              <Image
                source={{ uri: player.headshot }}
                style={styles.playerImage}
              />
            </View>

            <View style={styles.playerNameContainer}>
              <Text
                allowFontScaling={false}
                style={[styles.playerName, { color: theme.text }]}
                numberOfLines={2}
              >
                {player.fullName}
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.playerDetails, { color: theme.textSecondary }]}
              >
                #{player.jersey} | {player.position}
              </Text>
            </View>
          </>
        ) : (
          <TouchableOpacity
            style={styles.addPlayerButton}
            onPress={() => openPlayerSearch(playerNumber)}
          >
            <Text
              allowFontScaling={false}
              style={[styles.addPlayerIcon, { color: colors.secondary }]}
            >
              +
            </Text>
            <Text
              allowFontScaling={false}
              style={[styles.addPlayerText, { color: colors.secondary }]}
            >
              Add Player {playerNumber}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderComparisonStats = () => {
    if (!comparisonStats) return null;
    if (comparisonStats.error) {
      return (
        <View style={styles.errorContainer}>
          <Text
            allowFontScaling={false}
            style={[styles.errorText, { color: theme.textSecondary }]}
          >
            {comparisonStats.error}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.statsContainer}>
        {comparisonStats.comparisonType && (
          <View style={styles.comparisonHeader}>
            <Text
              allowFontScaling={false}
              style={[styles.comparisonType, { color: theme.text }]}
            >
              {comparisonStats.comparisonType} Statistics
            </Text>
          </View>
        )}
        {comparisonStats.stats.map((stat, index) => (
          <View
            key={index}
            style={[styles.statRow, { backgroundColor: theme.surface }]}
          >
            <View
              style={[
                styles.statBox,
                {
                  backgroundColor: stat.player1Better
                    ? colors.secondary + "20"
                    : theme.background,
                  borderColor: stat.player1Better
                    ? colors.secondary
                    : theme.border,
                  borderWidth: stat.player1Better ? 2 : 1,
                },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[
                  styles.statValue,
                  { color: stat.player1Better ? colors.secondary : theme.text },
                ]}
              >
                {stat.player1Value}
              </Text>
            </View>
            <View style={styles.statLabelContainer}>
              <Text
                allowFontScaling={false}
                style={[styles.statLabel, { color: theme.text }]}
              >
                {stat.label}
              </Text>
            </View>
            <View
              style={[
                styles.statBox,
                {
                  backgroundColor: stat.player2Better
                    ? colors.secondary + "20"
                    : theme.background,
                  borderColor: stat.player2Better
                    ? colors.secondary
                    : theme.border,
                  borderWidth: stat.player2Better ? 2 : 1,
                },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[
                  styles.statValue,
                  { color: stat.player2Better ? colors.secondary : theme.text },
                ]}
              >
                {stat.player2Value}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderSearchModal = () => (
    <Modal
      visible={showSearchModal}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowSearchModal(false)}
    >
      <View
        style={[styles.modalContainer, { backgroundColor: theme.background }]}
      >
        <View
          style={[
            styles.modalHeader,
            { backgroundColor: theme.surface, borderBottomColor: theme.border },
          ]}
        >
          <Text
            allowFontScaling={false}
            style={[styles.modalTitle, { color: theme.text }]}
          >
            Select Player {searchingForPlayer}
          </Text>
          <TouchableOpacity
            onPress={() => setShowSearchModal(false)}
            style={styles.modalCloseButton}
          >
            <Text
              allowFontScaling={false}
              style={[styles.modalCloseText, { color: colors.primary }]}
            >
              Close
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <TextInput
            style={[
              styles.searchInput,
              {
                backgroundColor: theme.surface,
                color: theme.text,
                borderColor: theme.border,
              },
            ]}
            placeholder="Search for a player..."
            placeholderTextColor={theme.textSecondary}
            value={searchText}
            onChangeText={setSearchText}
            autoFocus
          />
        </View>

        <ScrollView style={styles.searchResults}>
          {allPlayersLoading || searchLoading ? (
            <View style={{ padding: 24, alignItems: "center" }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text
                allowFontScaling={false}
                style={{ marginTop: 12, color: theme.textSecondary }}
              >
                {allPlayersLoading ? "Loading WBC roster..." : "Searching..."}
              </Text>
            </View>
          ) : (
            searchResults.map((player) => {
              const logo = WBCService.getTeamLogo(player.teamId, isDarkMode);
              const itemColor = WBCService.getTeamColor(player.teamId);
              return (
                <TouchableOpacity
                  key={player.id}
                  style={[
                    styles.searchResultItem,
                    { backgroundColor: theme.surface },
                    itemColor
                      ? { borderLeftWidth: 3, borderLeftColor: itemColor }
                      : null,
                  ]}
                  onPress={() => selectPlayer(player, searchingForPlayer)}
                >
                  <Image
                    source={{ uri: player.headshot }}
                    style={styles.searchResultImage}
                  />
                  <View style={styles.searchResultInfo}>
                    <Text
                      allowFontScaling={false}
                      style={[styles.searchResultName, { color: theme.text }]}
                    >
                      {player.fullName}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.searchResultDetails,
                        { color: theme.textSecondary },
                      ]}
                    >
                      #{player.jersey} | {player.position}
                    </Text>
                    {player.teamName ? (
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.searchResultTeam,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {player.teamName}
                      </Text>
                    ) : null}
                  </View>
                  {logo ? (
                    <Image
                      source={{ uri: logo }}
                      style={styles.searchResultTeamLogo}
                      resizeMode="contain"
                    />
                  ) : null}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: isPro ? 20 : 20 + AD_SPACE }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text
            allowFontScaling={false}
            style={[styles.title, { color: colors.primary }]}
          >
            Player Comparison
          </Text>
          <Text
            allowFontScaling={false}
            style={[styles.subtitle, { color: theme.textSecondary }]}
          >
            Compare WBC players side by side
          </Text>
        </View>

        <View style={styles.playersHeader}>
          {renderPlayerCard(player1, 1)}
          <View style={styles.vsContainer}>
            <Text
              allowFontScaling={false}
              style={[styles.vsText, { color: theme.text }]}
            >
              VS
            </Text>
          </View>
          {renderPlayerCard(player2, 2)}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text
              allowFontScaling={false}
              style={[styles.loadingText, { color: theme.textSecondary }]}
            >
              Loading comparison...
            </Text>
          </View>
        ) : (
          renderComparisonStats()
        )}
      </ScrollView>

      {renderSearchModal()}
      {!isPro && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' }}>
          <BannerAdWrapper />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  header: { alignItems: "center", marginBottom: 20 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 8 },
  subtitle: { fontSize: 16, textAlign: "center" },
  playersHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 16,
  },
  playerCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    position: "relative",
    minHeight: 200,
    justifyContent: "flex-start",
  },
  teamHeader: { alignItems: "center", marginBottom: 8 },
  teamLogo: { width: 28, height: 28, marginBottom: 4 },
  teamName: { fontSize: 12, fontWeight: "bold", textAlign: "center" },
  playerImageContainer: { alignItems: "center", marginBottom: 6 },
  playerNameContainer: {
    height: 45,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  clearButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#dc3545",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  clearButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },
  playerImage: { width: 60, height: 60, borderRadius: 30, marginBottom: 12 },
  playerName: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 4,
  },
  playerDetails: { fontSize: 14, textAlign: "center", marginBottom: 8 },
  addPlayerButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  addPlayerIcon: { fontSize: 48, fontWeight: "bold", marginBottom: 8 },
  addPlayerText: { fontSize: 16, fontWeight: "500", textAlign: "center" },
  vsContainer: { alignItems: "center", justifyContent: "center" },
  vsText: { fontSize: 20, fontWeight: "bold" },
  statsContainer: { gap: 8, marginTop: 8 },
  comparisonHeader: {
    alignItems: "center",
    paddingVertical: 8,
    marginBottom: 12,
  },
  comparisonType: { fontSize: 18, fontWeight: "bold" },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    gap: 12,
  },
  statBox: { flex: 1, padding: 12, borderRadius: 6, alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "bold" },
  statLabelContainer: { width: 80, alignItems: "center" },
  statLabel: { fontSize: 14, fontWeight: "bold", textAlign: "center" },
  errorContainer: { padding: 20, alignItems: "center" },
  errorText: { fontSize: 16, textAlign: "center" },
  loadingContainer: { padding: 40, alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 16 },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold" },
  modalCloseButton: { padding: 8 },
  modalCloseText: { fontSize: 16, fontWeight: "500" },
  searchContainer: { padding: 16 },
  searchInput: { padding: 12, borderRadius: 8, borderWidth: 1, fontSize: 16 },
  searchResults: { flex: 1, padding: 16 },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    gap: 12,
  },
  searchResultImage: { width: 40, height: 40, borderRadius: 20 },
  searchResultInfo: { flex: 1 },
  searchResultName: { fontSize: 16, fontWeight: "bold" },
  searchResultDetails: { fontSize: 14, marginTop: 2 },
  searchResultTeam: { fontSize: 12, marginTop: 2, fontWeight: "500" },
  searchResultTeamLogo: { width: 24, height: 24 },
});

export default CompareScreen;

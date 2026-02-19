import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  FlatList,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../../context/ThemeContext";
import WBCService from "../../services/WBCService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a camelCase category key into a readable label.
 * e.g. "earnedRunAverage" → "Earned Run Average"
 *      "walksAndHitsPerInningPitched" → "Walks And Hits Per Inning Pitched"
 *      "strikeoutsPer9Inn" → "Strikeouts Per 9 Inn"
 */
const formatCategoryName = (key) =>
  key
    .replace(/([A-Z])/g, " $1") // insert space before each uppercase letter
    .replace(/([0-9]+)/g, " $1") // insert space before each run of digits
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/**
 * For categories that appear twice in the leaders array, specify which
 * occurrence (1 = first, 2 = second) should be treated as HITTING.
 * The other occurrence automatically becomes pitching.
 * Change a value here to flip which occurrence goes where.
 */
const DUPLICATE_CATEGORY_HITTING_OCCURRENCE = {
  strikeouts: 1, // 1st = batter strikeouts (hitting), 2nd = pitcher strikeouts
  homeRuns: 2,
  stolenBases: 1,
  walks: 1,
  hits: 2,
  runs: 1,
  battingAverage: 2,
  onBasePercentage: 2,
  sluggingPercentage: 1,
  onBasePlusSlugging: 1,
  totalBases: 2,
  atBats: 1,
  runsBattedIn: 1,
};

// Categories that always belong to pitching (even on first occurrence)
const PITCHING_ONLY = new Set([
  "earnedRunAverage",
  "inningsPitched",
  "walksAndHitsPerInningPitched",
  "numberOfPitches",
  "wins",
  "saves",
  "shutouts",
  "completeGames",
  "strikeoutsPer9Inn",
  "strikeoutWalkRatio",
]);

// Preferred display order within each group (unlisted keys are appended)
const HITTING_ORDER = [
  "battingAverage",
  "homeRuns",
  "runsBattedIn",
  "hits",
  "runs",
  "stolenBases",
  "onBasePercentage",
  "sluggingPercentage",
  "onBasePlusSlugging",
  "walks",
  "totalBases",
  "atBats",
];

const PITCHING_ORDER = [
  "earnedRunAverage",
  "walksAndHitsPerInningPitched",
  "strikeouts",
  "inningsPitched",
  "wins",
  "saves",
  "numberOfPitches",
  "stolenBases",
  "runs",
  "battingAverage",
  "onBasePercentage",
  "sluggingPercentage",
  "onBasePlusSlugging",
];

/** Return keys of `obj` sorted by the given order array (extras appended). */
const sortedKeys = (obj, order) => {
  const all = Object.keys(obj);
  const ordered = order.filter((k) => all.includes(k));
  const rest = all.filter((k) => !ordered.includes(k));
  return [...ordered, ...rest];
};

// ─── Team stat category definitions ───────────────────────────────────────────

const TEAM_HITTING_CATS = [
  { key: "Avg", name: "Batting Average", abbr: "AVG", higherBetter: true },
  { key: "Home Runs", name: "Home Runs", abbr: "HR", higherBetter: true },
  { key: "Rbi", name: "RBIs", abbr: "RBI", higherBetter: true },
  { key: "Runs", name: "Runs", abbr: "R", higherBetter: true },
  { key: "Hits", name: "Hits", abbr: "H", higherBetter: true },
  { key: "Stolen Bases", name: "Stolen Bases", abbr: "SB", higherBetter: true },
  { key: "Ops", name: "OPS", abbr: "OPS", higherBetter: true },
  { key: "Obp", name: "On-Base Percentage", abbr: "OBP", higherBetter: true },
  { key: "Slg", name: "Slugging Percentage", abbr: "SLG", higherBetter: true },
];

const TEAM_PITCHING_CATS = [
  { key: "Era", name: "ERA", abbr: "ERA", higherBetter: false },
  { key: "Whip", name: "WHIP", abbr: "WHIP", higherBetter: false },
  { key: "Strike Outs", name: "Strikeouts", abbr: "SO", higherBetter: true },
  {
    key: "Innings Pitched",
    name: "Innings Pitched",
    abbr: "IP",
    higherBetter: true,
  },
  { key: "Strikeouts Per 9 Inn", name: "K/9", abbr: "K/9", higherBetter: true },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────

const StatsScreen = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors, isDarkMode } = useTheme();
  const navigation = useNavigation();

  const [selectedTab, setSelectedTab] = useState("Players");
  const [hittingLeaders, setHittingLeaders] = useState({}); // categoryKey → leaders[]
  const [pitchingLeaders, setPitchingLeaders] = useState({}); // categoryKey → leaders[]
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalData, setModalData] = useState([]);
  const [modalTitle, setModalTitle] = useState("");

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [leadersRes, statsRes] = await Promise.all([
        WBCService.getLeaders(),
        WBCService.getStats(),
      ]);
      processLeaders(leadersRes?.data?.leagueLeaders || []);
      setTeams(statsRes?.data?.teams || []);
    } catch (e) {
      console.error("WBC stats fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Separate leagueLeaders into hitting vs pitching maps.
   * - Categories in PITCHING_ONLY → pitching (first occurrence wins)
   * - All others: first occurrence → hitting, second occurrence → pitching
   */
  const processLeaders = (leagueLeaders) => {
    const hitting = {};
    const pitching = {};
    // Track how many times each category has been seen
    const occurrenceCount = {};

    leagueLeaders.forEach(({ leaderCategory, leaders }) => {
      if (!leaderCategory || !leaders?.length) return;

      occurrenceCount[leaderCategory] =
        (occurrenceCount[leaderCategory] || 0) + 1;
      const thisOccurrence = occurrenceCount[leaderCategory];

      if (PITCHING_ONLY.has(leaderCategory)) {
        // Always pitching — only store the first occurrence
        if (thisOccurrence === 1) {
          pitching[leaderCategory] = leaders;
        }
        return;
      }

      const hittingOccurrence =
        DUPLICATE_CATEGORY_HITTING_OCCURRENCE[leaderCategory] ?? 1;
      if (thisOccurrence === hittingOccurrence) {
        hitting[leaderCategory] = leaders;
      } else if (thisOccurrence !== hittingOccurrence) {
        // Any other occurrence goes to pitching (only store the first non-hitting one)
        if (!pitching[leaderCategory]) {
          pitching[leaderCategory] = leaders;
        }
      }
    });

    setHittingLeaders(hitting);
    setPitchingLeaders(pitching);
  };

  const openModal = (data, title) => {
    setModalData(data);
    setModalTitle(title);
    setModalVisible(true);
  };

  // ── Player leader rows ──────────────────────────────────────────────────────

  const renderPlayerLeaderRow = (leader, index, isFirst = false) => {
    const teamLogo = WBCService.getTeamLogo(leader?.team?.id, isDarkMode);
    const teamColor = WBCService.getTeamColor(leader?.team?.id);
    const headshotUri = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${leader?.person?.id}/headshot/67/current`;

    if (isFirst) {
      return (
        <TouchableOpacity
          key={`${leader.person?.id}-first`}
          style={[styles.firstLeaderRow, { borderBottomColor: theme.border }]}
          onPress={() =>
            navigation.navigate("PlayerPage", {
              playerId: leader.person?.id,
              sport: "wbc",
            })
          }
        >
          <View
            style={[
              styles.headshotBorder,
              { borderColor: teamColor || colors.primary },
            ]}
          >
            <Image
              source={{ uri: headshotUri }}
              style={styles.playerHeadshot}
            />
          </View>
          <View style={styles.firstLeaderInfo}>
            <View style={styles.playerNameRow}>
              {teamLogo ? (
                <Image
                  source={{ uri: teamLogo }}
                  style={styles.teamLogoSmall}
                />
              ) : null}
              <Text
                allowFontScaling={false}
                style={[styles.playerName, { color: theme.text }]}
              >
                {leader.person?.fullName}
              </Text>
            </View>
            <Text
              allowFontScaling={false}
              style={[styles.teamName, { color: theme.textSecondary }]}
            >
              {leader.team?.name}
            </Text>
          </View>
          <Text
            allowFontScaling={false}
            style={[styles.statValue, { color: colors.primary }]}
          >
            {leader.value}
          </Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        key={`${leader.person?.id}-${index}`}
        style={styles.leaderRow}
        onPress={() =>
          navigation.navigate("PlayerPage", {
            playerId: leader.person?.id,
            sport: "wbc",
          })
        }
      >
        <Text
          allowFontScaling={false}
          style={[styles.rank, { color: theme.textSecondary }]}
        >
          {leader.rank}
        </Text>
        {teamLogo ? (
          <Image source={{ uri: teamLogo }} style={styles.teamLogoSmall} />
        ) : null}
        <Text
          allowFontScaling={false}
          style={[styles.playerNameCompact, { color: theme.text }]}
        >
          {leader.person?.fullName}
        </Text>
        <Text
          allowFontScaling={false}
          style={[styles.statValueCompact, { color: colors.primary }]}
        >
          {leader.value}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderPlayerCategory = (categoryKey, leadersMap) => {
    const leaders = leadersMap[categoryKey] || [];
    const displayLeaders = leaders.slice(0, 5);
    const categoryName = formatCategoryName(categoryKey);

    return (
      <TouchableOpacity
        key={categoryKey}
        style={[styles.categoryContainer, { backgroundColor: theme.surface }]}
        onPress={() => openModal(leaders, categoryName)}
      >
        <Text
          allowFontScaling={false}
          style={[styles.categoryTitle, { color: colors.primary }]}
        >
          {categoryName}
        </Text>
        {displayLeaders.map((leader, index) =>
          renderPlayerLeaderRow(leader, index, index === 0),
        )}
        {leaders.length > 5 && (
          <Text
            allowFontScaling={false}
            style={[styles.viewMore, { color: colors.secondary }]}
          >
            Tap to view all {leaders.length} leaders
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  // ── Team stat rows ──────────────────────────────────────────────────────────

  const getTeamsSortedByCat = (statType, catKey, higherBetter) => {
    const filtered = teams.filter(
      (t) => t.stats?.[statType]?.["2025"]?.stat?.[catKey] != null,
    );
    return [...filtered].sort((a, b) => {
      const va = parseFloat(a.stats[statType]["2025"].stat[catKey]);
      const vb = parseFloat(b.stats[statType]["2025"].stat[catKey]);
      return higherBetter ? vb - va : va - vb;
    });
  };

  const renderTeamLeaderRow = (
    team,
    index,
    statType,
    catKey,
    isFirst = false,
  ) => {
    const value = team.stats?.[statType]?.["2025"]?.stat?.[catKey];
    const logo = WBCService.getTeamLogo(team.id, isDarkMode);
    const teamColor = WBCService.getTeamColor(team.id);

    if (isFirst) {
      return (
        <View
          key={`${team.id}-first`}
          style={[
            styles.firstLeaderRow,
            { borderBottomColor: teamColor || theme.border },
          ]}
        >
          {logo ? (
            <Image source={{ uri: logo }} style={styles.teamLogoLarge} />
          ) : null}
          <View style={styles.firstLeaderInfo}>
            <Text
              allowFontScaling={false}
              style={[styles.playerName, { color: theme.text }]}
            >
              {team.name}
            </Text>
          </View>
          <Text
            allowFontScaling={false}
            style={[styles.statValue, { color: colors.primary }]}
          >
            {value}
          </Text>
        </View>
      );
    }

    return (
      <View key={`${team.id}-${index}`} style={styles.leaderRow}>
        <Text
          allowFontScaling={false}
          style={[styles.rank, { color: theme.textSecondary }]}
        >
          {index + 1}
        </Text>
        {logo ? (
          <Image source={{ uri: logo }} style={styles.teamLogoSmall} />
        ) : null}
        <Text
          allowFontScaling={false}
          style={[styles.playerNameCompact, { color: theme.text }]}
        >
          {team.name}
        </Text>
        <Text
          allowFontScaling={false}
          style={[styles.statValueCompact, { color: colors.primary }]}
        >
          {value}
        </Text>
      </View>
    );
  };

  const renderTeamCategory = (catDef, statType) => {
    const sorted = getTeamsSortedByCat(
      statType,
      catDef.key,
      catDef.higherBetter,
    );
    const display = sorted.slice(0, 5);
    const modalItems = sorted.map((t, i) => ({
      ...t,
      _rank: i + 1,
      _value: t.stats?.[statType]?.["2025"]?.stat?.[catDef.key],
    }));

    return (
      <TouchableOpacity
        key={`${statType}-${catDef.key}`}
        style={[styles.categoryContainer, { backgroundColor: theme.surface }]}
        onPress={() => openModal(modalItems, catDef.name)}
      >
        <Text
          allowFontScaling={false}
          style={[styles.categoryTitle, { color: colors.primary }]}
        >
          {catDef.name}
        </Text>
        {display.map((team, index) =>
          renderTeamLeaderRow(team, index, statType, catDef.key, index === 0),
        )}
        {sorted.length > 5 && (
          <Text
            allowFontScaling={false}
            style={[styles.viewMore, { color: colors.secondary }]}
          >
            Tap to view all {sorted.length} teams
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  // ── Modal item renderer ─────────────────────────────────────────────────────

  const renderModalItem = ({ item, index }) => {
    if (item.person) {
      // Player modal row
      const logo = WBCService.getTeamLogo(item.team?.id, isDarkMode);
      const playerTeamColor = WBCService.getTeamColor(item.team?.id);
      return (
        <TouchableOpacity
          style={[styles.modalItem, { backgroundColor: theme.surface }]}
          onPress={() => {
            setModalVisible(false);
            navigation.navigate("PlayerPage", {
              playerId: item.person.id,
              sport: "wbc",
            });
          }}
        >
          <Text
            allowFontScaling={false}
            style={[styles.modalRank, { color: theme.textSecondary }]}
          >
            {item.rank}
          </Text>
          <View
            style={[
              styles.modalHeadshotBorder,
              { borderColor: playerTeamColor || colors.primary },
            ]}
          >
            <Image
              source={{
                uri: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${item.person.id}/headshot/67/current`,
              }}
              style={styles.modalHeadshot}
            />
          </View>
          <View style={styles.modalPlayerInfo}>
            <View style={styles.modalNameRow}>
              {logo ? (
                <Image source={{ uri: logo }} style={styles.modalTeamLogo} />
              ) : null}
              <Text
                allowFontScaling={false}
                style={[styles.modalPlayerName, { color: theme.text }]}
              >
                {item.person.fullName}
              </Text>
            </View>
            <Text
              allowFontScaling={false}
              style={[styles.modalTeamName, { color: theme.textSecondary }]}
            >
              {item.team?.name}
            </Text>
          </View>
          <Text
            allowFontScaling={false}
            style={[styles.modalStatValue, { color: colors.primary }]}
          >
            {item.value}
          </Text>
        </TouchableOpacity>
      );
    }

    // Team modal row
    const logo = WBCService.getTeamLogo(item.id, isDarkMode);
    const modalTeamColor = WBCService.getTeamColor(item.id);
    return (
      <View
        style={[
          styles.modalItem,
          {
            backgroundColor: theme.surface,
            borderBottomWidth: 2,
            borderBottomColor: modalTeamColor || theme.border,
          },
        ]}
      >
        <Text
          allowFontScaling={false}
          style={[styles.modalRank, { color: theme.textSecondary }]}
        >
          {item._rank}
        </Text>
        {logo ? (
          <Image source={{ uri: logo }} style={styles.modalTeamLogoLarge} />
        ) : (
          <View style={styles.modalTeamLogoLarge} />
        )}
        <View style={styles.modalPlayerInfo}>
          <Text
            allowFontScaling={false}
            style={[styles.modalPlayerName, { color: theme.text }]}
          >
            {item.name}
          </Text>
        </View>
        <Text
          allowFontScaling={false}
          style={[styles.modalStatValue, { color: colors.primary }]}
        >
          {item._value}
        </Text>
      </View>
    );
  };

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          allowFontScaling={false}
          style={[styles.loadingText, { color: theme.textSecondary }]}
        >
          Loading stats...
        </Text>
      </View>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Tab Selector: Players / Teams */}
      <View
        style={[
          styles.tabSelector,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        {["Players", "Teams"].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tabButton,
              {
                backgroundColor:
                  selectedTab === tab ? colors.primary : "transparent",
                borderColor: colors.primary,
              },
            ]}
            onPress={() => setSelectedTab(tab)}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.tabButtonText,
                { color: selectedTab === tab ? "#fff" : colors.primary },
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {selectedTab === "Players" ? (
          <>
            {/* Hitting Leaders */}
            <Text
              allowFontScaling={false}
              style={[
                styles.sectionTitle,
                { color: theme.text, marginTop: -5 },
              ]}
            >
              Hitting Leaders
            </Text>
            {sortedKeys(hittingLeaders, HITTING_ORDER).map((k) =>
              renderPlayerCategory(k, hittingLeaders),
            )}

            {/* Pitching Leaders */}
            <Text
              allowFontScaling={false}
              style={[styles.sectionTitle, { color: theme.text }]}
            >
              Pitching Leaders
            </Text>
            {sortedKeys(pitchingLeaders, PITCHING_ORDER).map((k) =>
              renderPlayerCategory(k, pitchingLeaders),
            )}
          </>
        ) : (
          <>
            {/* Hitting Teams */}
            <Text
              allowFontScaling={false}
              style={[
                styles.sectionTitle,
                { color: theme.text, marginTop: -5 },
              ]}
            >
              Hitting Leaders
            </Text>
            {TEAM_HITTING_CATS.map((cat) => renderTeamCategory(cat, "hitting"))}

            {/* Pitching Teams */}
            <Text
              allowFontScaling={false}
              style={[styles.sectionTitle, { color: theme.text }]}
            >
              Pitching Leaders
            </Text>
            {TEAM_PITCHING_CATS.map((cat) =>
              renderTeamCategory(cat, "pitching"),
            )}
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Full-list Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View
          style={[styles.modalContainer, { backgroundColor: theme.background }]}
        >
          <View
            style={[
              styles.modalHeader,
              {
                backgroundColor: theme.surface,
                borderBottomColor: theme.border,
              },
            ]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.modalHeaderTitle, { color: theme.text }]}
            >
              {modalTitle} Leaders
            </Text>
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
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
          <FlatList
            data={modalData}
            renderItem={renderModalItem}
            keyExtractor={(item, i) => String(item.person?.id ?? item.id ?? i)}
            style={styles.modalList}
          />
        </View>
      </Modal>
    </View>
  );
};

// ─── Styles (mirrors MLB StatsScreen layout exactly) ──────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  tabSelector: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 40,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 60,
    alignItems: "center",
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 20,
    marginBottom: 16,
    textAlign: "center",
  },
  categoryContainer: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  firstLeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  headshotBorder: {
    borderRadius: 27,
    borderWidth: 2,
    padding: 1,
    marginRight: 12,
  },
  playerHeadshot: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  teamLogoLarge: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 12,
    resizeMode: "contain",
  },
  firstLeaderInfo: {
    flex: 1,
  },
  playerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  teamLogoSmall: {
    width: 20,
    height: 20,
    marginRight: 8,
    resizeMode: "contain",
  },
  playerName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  teamName: {
    fontSize: 14,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "bold",
    minWidth: 60,
    textAlign: "right",
  },
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  rank: {
    fontSize: 14,
    fontWeight: "600",
    width: 30,
    textAlign: "center",
  },
  playerNameCompact: {
    flex: 1,
    fontSize: 14,
    marginLeft: 8,
  },
  statValueCompact: {
    fontSize: 16,
    fontWeight: "bold",
    minWidth: 50,
    textAlign: "right",
  },
  viewMore: {
    textAlign: "center",
    marginTop: 8,
    fontSize: 12,
    fontStyle: "italic",
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  modalCloseButton: {
    padding: 8,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: "600",
  },
  modalList: {
    flex: 1,
    padding: 16,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  modalRank: {
    fontSize: 16,
    fontWeight: "bold",
    width: 30,
    textAlign: "center",
  },
  modalHeadshotBorder: {
    borderRadius: 22,
    borderWidth: 2,
    padding: 1,
    marginHorizontal: 10,
  },
  modalHeadshot: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  modalTeamLogoLarge: {
    width: 40,
    height: 40,
    borderRadius: 6,
    marginHorizontal: 12,
    resizeMode: "contain",
  },
  modalPlayerInfo: {
    flex: 1,
  },
  modalNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  modalTeamLogo: {
    width: 16,
    height: 16,
    marginRight: 6,
    resizeMode: "contain",
  },
  modalPlayerName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  modalTeamName: {
    fontSize: 12,
  },
  modalStatValue: {
    fontSize: 18,
    fontWeight: "bold",
    minWidth: 60,
    textAlign: "right",
  },
});

export default StatsScreen;

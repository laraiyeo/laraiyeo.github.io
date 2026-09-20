import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../../context/ThemeContext";
import { useBetSlip } from "../../context/BetSlipContext";
import { BannerAdWrapper } from "../../services/ads";
import WBCService from "../../services/WBCService";

const StatsScreen = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const { isPro } = useBetSlip();
  const AD_SPACE = 80;
  const navigation = useNavigation();

  const [selectedLeague, setSelectedLeague] = useState("ALL");
  const [hittingStats, setHittingStats] = useState({});
  const [pitchingStats, setPitchingStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState({});

  const leagues = [
    { key: "ALL", name: "All MLB", id: null },
    { key: "AL", name: "American League", id: 103 },
    { key: "NL", name: "National League", id: 104 },
  ];

  const hittingCategories = [
    { key: "battingAverage", name: "Batting Average", abbr: "AVG" },
    { key: "homeRuns", name: "Home Runs", abbr: "HR" },
    { key: "runsBattedIn", name: "RBIs", abbr: "RBI" },
    { key: "hits", name: "Hits", abbr: "H" },
    { key: "runs", name: "Runs", abbr: "R" },
    { key: "stolenBases", name: "Stolen Bases", abbr: "SB" },
  ];

  const pitchingCategories = [
    { key: "earnedRunAverage", name: "Earned Run Average", abbr: "ERA" },
    { key: "strikeouts", name: "Strikeouts", abbr: "SO" },
    { key: "wins", name: "Wins", abbr: "W" },
    { key: "saves", name: "Saves", abbr: "SV" },
  ];

  useEffect(() => {
    fetchStats();
  }, [selectedLeague]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const leagueParam =
        selectedLeague === "ALL"
          ? ""
          : `&leagueId=${leagues.find((l) => l.key === selectedLeague).id}`;

      // Use current year for API calls since MLB has 2026 data available
      const currentYear = new Date().getFullYear();
      const [hittingResponse, pitchingResponse] = await Promise.all([
        fetch(
          `https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=battingAverage,homeRuns,rbi,hits,runs,stolenBases&leaderGameTypes=R&season=${currentYear}&limit=10${leagueParam}&statGroup=hitting`,
        ),
        fetch(
          `https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=era,strikeouts,wins,saves&leaderGameTypes=R&season=${currentYear}&limit=10${leagueParam}&statGroup=pitching`,
        ),
      ]);

      const hittingData = await hittingResponse.json();
      const pitchingData = await pitchingResponse.json();

      // Process hitting stats
      const processedHitting = {};
      hittingData.leagueLeaders?.forEach((category) => {
        processedHitting[category.leaderCategory] = category.leaders;
      });

      // Process pitching stats
      const processedPitching = {};
      pitchingData.leagueLeaders?.forEach((category) => {
        processedPitching[category.leaderCategory] = category.leaders;
      });

      setHittingStats(processedHitting);
      setPitchingStats(processedPitching);
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const getTeamAbbreviation = (teamId) => {
    const teamMapping = {
      108: "LAA",
      109: "ARI",
      110: "BAL",
      111: "BOS",
      112: "CHC",
      113: "CIN",
      114: "CLE",
      115: "COL",
      116: "DET",
      117: "HOU",
      118: "KC",
      119: "LAD",
      120: "WSH",
      121: "NYM",
      133: "OAK",
      134: "PIT",
      135: "SD",
      136: "SEA",
      137: "SF",
      138: "STL",
      139: "TB",
      140: "TEX",
      141: "TOR",
      142: "MIN",
      143: "PHI",
      144: "ATL",
      145: "CWS",
      146: "MIA",
      147: "NYY",
      158: "MIL",
    };
    return teamMapping[teamId] || "MLB";
  };

  const navigateToPlayer = (playerId) => {
    navigation.navigate("PlayerPage", {
      playerId,
      sport: "mlb",
    });
  };

  const getHeadshotUrl = (playerId) =>
    `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`;

  const getTeamColor = (teamId) => {
    return WBCService.getTeamColor(teamId) || colors.primary;
  };

  const renderPodiumPlayer = (leader, rank, barHeight, barColor) => {
    const teamAbbr = getTeamAbbreviation(leader.team.id);
    const teamColor = getTeamColor(leader.team.id);
    const isFirst = rank === 1;

    return (
      <TouchableOpacity
        key={leader.person.id}
        style={styles.podiumPlayer}
        onPress={() => navigateToPlayer(leader.person.id)}
        activeOpacity={0.7}
      >
        {/* Headshot with logo overlay */}
        <View style={styles.podiumHeadshotContainer}>
          <Image
            cachePolicy="memory-disk"
            source={{ uri: getHeadshotUrl(leader.person.id) }}
            style={[
              styles.podiumHeadshot,
              { borderColor: teamColor },
              isFirst && styles.podiumHeadshotFirst,
            ]}
            defaultSource={{
              uri: "https://via.placeholder.com/60x60?text=MLB",
            }}
          />
          <Image
            cachePolicy="memory-disk"
            source={{ uri: getTeamLogoUrl("mlb", teamAbbr) }}
            style={[
              styles.podiumLogoOverlay,
              { borderColor: teamColor },
              isFirst && styles.podiumLogoOverlayFirst,
            ]}
          />
        </View>

        {/* Name */}
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[
            styles.podiumName,
            { color: theme.text },
            isFirst && styles.podiumNameFirst,
          ]}
        >
          {leader.person.fullName}
        </Text>

        {/* Bar with value */}
        <View
          style={[
            styles.podiumBar,
            {
              height: barHeight,
              backgroundColor: barColor,
            },
            isFirst && styles.podiumBarFirst,
          ]}
        >
          <Text
            allowFontScaling={false}
            style={[
              styles.podiumBarValue,
              isFirst && styles.podiumBarValueFirst,
            ]}
          >
            {leader.value}
          </Text>
        </View>

        {/* Rank badge */}
        <View style={[styles.podiumRankBadge, { backgroundColor: barColor }]}>
          <Text allowFontScaling={false} style={styles.podiumRankText}>
            {rank}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderRemainingPlayer = (leader) => {
    const teamAbbr = getTeamAbbreviation(leader.team.id);

    return (
      <TouchableOpacity
        key={leader.person.id}
        style={[styles.remainingRow, { borderBottomColor: theme.border }]}
        onPress={() => navigateToPlayer(leader.person.id)}
        activeOpacity={0.7}
      >
        <Text
          allowFontScaling={false}
          style={[styles.remainingRank, { color: theme.textSecondary }]}
        >
          {leader.rank}
        </Text>
        <Image
          cachePolicy="memory-disk"
          source={{ uri: getTeamLogoUrl("mlb", teamAbbr) }}
          style={styles.remainingTeamLogo}
        />
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[styles.remainingName, { color: theme.text }]}
        >
          {leader.person.fullName}
        </Text>
        <Text
          allowFontScaling={false}
          style={[styles.remainingValue, { color: colors.primary }]}
        >
          {leader.value}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderCategory = (categoryKey, categoryInfo, stats) => {
    const leaders = stats[categoryKey] || [];
    if (leaders.length === 0) return null;

    const podiumLeaders = leaders.slice(0, 3);
    const remainingLeaders = leaders.slice(3);
    const isExpanded = expandedCategories[categoryKey] || false;

    // Arrange podium: 2nd (left), 1st (center), 3rd (right)
    const first = podiumLeaders.find((l) => l.rank === 1) || podiumLeaders[0];
    const second = podiumLeaders.find((l) => l.rank === 2) || podiumLeaders[1];
    const third = podiumLeaders.find((l) => l.rank === 3) || podiumLeaders[2];

    return (
      <View
        key={categoryKey}
        style={[styles.categoryContainer, { backgroundColor: theme.surface }]}
      >
        <Text
          allowFontScaling={false}
          style={[styles.categoryTitle, { color: colors.primary }]}
        >
          {categoryInfo.name}
        </Text>

        {/* Podium */}
        <View style={styles.podiumContainer}>
          {/* 2nd Place - Left */}
          {second && renderPodiumPlayer(second, 2, 70, "#C0C0C0")}

          {/* 1st Place - Center */}
          {first && renderPodiumPlayer(first, 1, 100, "#FFD700")}

          {/* 3rd Place - Right */}
          {third && renderPodiumPlayer(third, 3, 55, "#CD7F32")}
        </View>

        {/* Remaining players (expandable) */}
        {remainingLeaders.length > 0 && (
          <>
            <TouchableOpacity
              style={[styles.expandButton, { borderColor: colors.primary }]}
              onPress={() =>
                setExpandedCategories((prev) => ({
                  ...prev,
                  [categoryKey]: !prev[categoryKey],
                }))
              }
              activeOpacity={0.7}
            >
              <Text
                allowFontScaling={false}
                style={[styles.expandButtonText, { color: colors.primary }]}
              >
                {isExpanded
                  ? "▲ Collapse"
                  : `▼ Expand to view ${remainingLeaders.length} more`}
              </Text>
            </TouchableOpacity>

            {isExpanded && (
              <View style={styles.remainingContainer}>
                {remainingLeaders.map((leader) =>
                  renderRemainingPlayer(leader),
                )}
              </View>
            )}
          </>
        )}
      </View>
    );
  };

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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* League Selector */}
      <View
        style={[
          styles.leagueSelector,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        {leagues.map((league) => (
          <TouchableOpacity
            key={league.key}
            style={[
              styles.leagueButton,
              {
                backgroundColor:
                  selectedLeague === league.key
                    ? colors.primary
                    : "transparent",
                borderColor: colors.primary,
              },
            ]}
            onPress={() => setSelectedLeague(league.key)}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.leagueButtonText,
                {
                  color:
                    selectedLeague === league.key ? "#fff" : colors.primary,
                },
              ]}
            >
              {league.key}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 8,
          paddingBottom: isPro ? 16 : 16 + AD_SPACE,
        }}
      >
        {/* Hitting Stats */}
        <Text
          allowFontScaling={false}
          style={[styles.sectionTitle, { color: theme.text, marginTop: -5 }]}
        >
          Hitting Leaders
        </Text>
        {hittingCategories.map((category) =>
          renderCategory(category.key, category, hittingStats),
        )}

        {/* Pitching Stats */}
        <Text
          allowFontScaling={false}
          style={[styles.sectionTitle, { color: theme.text }]}
        >
          Pitching Leaders
        </Text>
        {pitchingCategories.map((category) =>
          renderCategory(category.key, category, pitchingStats),
        )}
      </ScrollView>

      {!isPro && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
          }}
        >
          <BannerAdWrapper />
        </View>
      )}
    </View>
  );
};

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
  leagueSelector: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  leagueButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 60,
    alignItems: "center",
  },
  leagueButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
    padding: 8,
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
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },

  // ── Podium ──
  podiumContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    paddingTop: 8,
    paddingBottom: 4,
  },
  podiumPlayer: {
    alignItems: "center",
    marginHorizontal: 6,
    flex: 1,
    maxWidth: 110,
  },
  podiumHeadshotContainer: {
    position: "relative",
    marginBottom: 6,
  },
  podiumHeadshot: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
  },
  podiumHeadshotFirst: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
  },
  podiumLogoOverlay: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    backgroundColor: "#ffffff42",
  },
  podiumLogoOverlayFirst: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  podiumName: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 6,
    maxWidth: 100,
  },
  podiumNameFirst: {
    fontSize: 13,
    fontWeight: "700",
  },
  podiumBar: {
    width: "100%",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 36,
  },
  podiumBarFirst: {
    borderRadius: 8,
  },
  podiumBarValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  podiumBarValueFirst: {
    fontSize: 20,
    color: "#5a4a00",
  },
  podiumRankBadge: {
    marginTop: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  podiumRankText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
  },

  // ── Expand / Collapse ──
  expandButton: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  expandButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
  remainingContainer: {
    marginTop: 8,
  },
  remainingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  remainingRank: {
    fontSize: 13,
    fontWeight: "600",
    width: 28,
    textAlign: "center",
  },
  remainingTeamLogo: {
    width: 20,
    height: 20,
    marginRight: 10,
  },
  remainingName: {
    flex: 1,
    fontSize: 14,
  },
  remainingValue: {
    fontSize: 16,
    fontWeight: "bold",
    minWidth: 50,
    textAlign: "right",
  },
});

export default StatsScreen;

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Dimensions,
  RefreshControl,
} from "react-native";
import { useTheme } from "../../context/ThemeContext";
import WBCService from "../../services/WBCService";
import { LiveViewerBadge } from "../../components/ViewerCounter";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";

const { width } = Dimensions.get("window");

// ─── helpers ──────────────────────────────────────────────────────────────────

const getDateForFilter = (filter) => {
  const d = new Date();
  if (filter === "yesterday") d.setDate(d.getDate() - 1);
  if (filter === "tomorrow") d.setDate(d.getDate() + 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
};

const formatTimeEST = (dateString) => {
  try {
    const date = new Date(dateString);
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const parts = fmt.formatToParts(date);
    const hour = parts.find((p) => p.type === "hour")?.value || "";
    const minute = parts.find((p) => p.type === "minute")?.value || "00";
    const ampm = parts.find((p) => p.type === "dayPeriod")?.value || "";
    return { time: `${hour}:${minute}`, ampm };
  } catch {
    return { time: "", period: "" };
  }
};

const groupGamesByEvent = (games = []) => {
  const grouped = {};
  games.forEach((game) => {
    const key = game.seriesDescription || game.venue?.name || "Other";
    if (!grouped[key]) {
      grouped[key] = { eventName: key, eventChildLabel: "", games: [] };
    }
    grouped[key].games.push(game);
  });
  Object.values(grouped).forEach((group) => {
    group.games.sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
  });
  return Object.values(grouped);
};

// ─── Card gradient overlay (top + bottom, SVG — no extra package needed) ───

// awayColor = top gradient color, homeColor = bottom gradient color
const CardGradient = ({
  gradId,
  awayColor,
  homeColor,
  fallbackColor,
  theme,
}) => {
  const top = awayColor || fallbackColor;
  const bot = homeColor || fallbackColor;
  return (
    <>
      <Svg
        style={{ position: "absolute", top: 0, left: 0, right: 0 }}
        width="100%"
        height={48}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient
            id={`topGrad_${gradId}`}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <Stop offset="0%" stopColor={top} stopOpacity="0.18" />
            <Stop
              offset="100%"
              stopColor={theme.surfaceSecondary}
              stopOpacity="0"
            />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#topGrad_${gradId})`} />
      </Svg>
      <Svg
        style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
        width="100%"
        height={48}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient
            id={`botGrad_${gradId}`}
            x1="0%"
            y1="100%"
            x2="0%"
            y2="0%"
          >
            <Stop offset="0%" stopColor={bot} stopOpacity="0.18" />
            <Stop
              offset="100%"
              stopColor={theme.surfaceSecondary}
              stopOpacity="0"
            />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#botGrad_${gradId})`} />
      </Svg>
    </>
  );
};

// ─── Upcoming Matches Section (Liquipedia-style, copied from VALHomeScreen) ───

const UpcomingMatchesSection = ({
  groups,
  navigation,
  theme,
  colors,
  isDarkMode,
}) => (
  <View style={styles.upcomingMatchesContainer}>
    {groups.map((group, gIdx) => (
      <View
        key={group.eventName}
        style={[
          styles.eventContainer,
          { backgroundColor: theme.surfaceSecondary },
        ]}
      >
        {/* Event header */}
        <View style={styles.eventHeaderContainer}>
          <View style={styles.eventLogoContainer}>
            <Image
              source={require("../../../assets/wbc_logo.png")}
              style={styles.eventLogoImage}
              resizeMode="contain"
            />
          </View>
          <View style={styles.eventInfo}>
            <Text
              style={[styles.upcomingEventName, { color: theme.text }]}
              numberOfLines={1}
            >
              {group.eventName}
            </Text>
            {!!group.eventChildLabel && (
              <Text
                style={[
                  styles.upcomingEventChildLabel,
                  { color: theme.textTertiary },
                ]}
                numberOfLines={1}
              >
                {group.eventChildLabel}
              </Text>
            )}
          </View>
        </View>

        {/* Match rows */}
        <View style={styles.matchesList}>
          {group.games.map((game, idx) => {
            const away = game.teams?.away?.team || {};
            const home = game.teams?.home?.team || {};
            const awayScore = game.teams?.away?.score;
            const homeScore = game.teams?.home?.score;
            const { time, ampm } = formatTimeEST(game.gameDate);
            const isFinished = ["F", "FT", "FO"].includes(
              game.status?.codedGameState,
            );
            const homeWinner = isFinished && game.teams?.home?.isWinner;
            const awayWinner = isFinished && game.teams?.away?.isWinner;
            const awayId =
              away.id ||
              away.teamId ||
              away.teamPk ||
              away.teamCode ||
              away.code;
            const homeId =
              home.id ||
              home.teamId ||
              home.teamPk ||
              home.teamCode ||
              home.code;
            const awayLogo = WBCService.getTeamLogo(awayId, isDarkMode);
            const homeLogo = WBCService.getTeamLogo(homeId, isDarkMode);
            const awayColor = WBCService.getTeamColor(awayId);
            const homeColor = WBCService.getTeamColor(homeId);

            return (
              <View key={game.gamePk} style={styles.gameRow}>
                <CardGradient
                  gradId={`${gIdx}_${idx}`}
                  awayColor={awayColor}
                  homeColor={homeColor}
                  fallbackColor={colors.primary}
                  theme={theme}
                />
                <TouchableOpacity
                  style={styles.upcomingMatchRow}
                  onPress={() =>
                    navigation.navigate("GameDetails", {
                      sport: "wbc",
                      gamePk: game.gamePk,
                    })
                  }
                >
                  {/* Time / status column */}
                  <View style={styles.matchTimeContainer}>
                    <Text
                      style={[
                        styles.matchTime,
                        {
                          color: isFinished ? theme.textSecondary : theme.text,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {(game.status?.detailedState || "").slice(0, 5)}{(game.status?.detailedState).length > 5 ? "." : ""}
                    </Text>
                    <Text
                      style={[
                        styles.matchTimeAmPm,
                        { color: theme.textTertiary },
                      ]}
                    >
                      {time} {ampm}
                    </Text>
                  </View>

                  {/* Stacked teams */}
                  <View style={styles.stackedTeams}>
                    {/* Away */}
                    <View style={styles.teamWithLogo}>
                      <View style={styles.teamLogoSmall}>
                        {awayLogo ? (
                          <Image
                            source={{ uri: awayLogo }}
                            style={styles.teamLogoSmallPlaceholder}
                          />
                        ) : (
                          <View
                            style={[
                              styles.teamLogoSmallPlaceholder,
                              { backgroundColor: colors.primary },
                            ]}
                          >
                            <Text style={styles.teamLogoSmallText}>
                              {(away.name || "A").substring(0, 1).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={[styles.stackedTeamName, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {away.name || "Away"}
                      </Text>
                      {awayScore != null && (
                        <Text
                          style={[
                            styles.matchScore,
                            {
                              color: awayWinner ? colors.primary : theme.text,
                              fontWeight: awayWinner ? "700" : "400",
                            },
                          ]}
                        >
                          {awayScore}
                        </Text>
                      )}
                    </View>

                    {/* Home */}
                    <View style={styles.teamWithLogo}>
                      <View style={styles.teamLogoSmall}>
                        {homeLogo ? (
                          <Image
                            source={{ uri: homeLogo }}
                            style={styles.teamLogoSmallPlaceholder}
                          />
                        ) : (
                          <View
                            style={[
                              styles.teamLogoSmallPlaceholder,
                              { backgroundColor: colors.secondary },
                            ]}
                          >
                            <Text style={styles.teamLogoSmallText}>
                              {(home.name || "H").substring(0, 1).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={[styles.stackedTeamName, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {home.name || "Home"}
                      </Text>
                      {homeScore != null && (
                        <Text
                          style={[
                            styles.matchScore,
                            {
                              color: homeWinner ? colors.primary : theme.text,
                              fontWeight: homeWinner ? "700" : "400",
                            },
                          ]}
                        >
                          {homeScore}
                        </Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Footer: venue + live viewer badge (MLB pattern, styled for WBC) */}
                <View
                  style={[styles.gameFooter, { borderTopColor: theme.border }]}
                >
                  <View style={styles.gameFooterLeft}>
                    <Text
                      style={[styles.venue, { color: theme.textSecondary }]}
                    >
                      {" "}
                      {game.venue?.name || ""}{" "}
                    </Text>
                  </View>
                  <View style={styles.gameFooterRight}>
                    <LiveViewerBadge
                      gameId={game.gamePk}
                      status={game.status}
                      style={styles.viewerBadge}
                    />
                  </View>
                </View>

                {idx < group.games.length - 1 && (
                  <View
                    style={[
                      styles.matchSeparator,
                      { backgroundColor: theme.border },
                    ]}
                  />
                )}
              </View>
            );
          })}
        </View>
      </View>
    ))}
  </View>
);

// ─── main screen ──────────────────────────────────────────────────────────────

const ScoreboardScreen = ({ navigation, route }) => {
  const { colors, theme, isDarkMode } = useTheme();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true); // initial mount only
  const [fetching, setFetching] = useState(false); // silent filter-change fetch
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("today");

  const loadData = useCallback(async (filter, silent = false) => {
    if (!silent) setLoading(true);
    else setFetching(true);
    try {
      const date = getDateForFilter(filter);
      const resp = await WBCService.getScoreboard(date);
      const allGames = [];
      (resp?.data?.dates || []).forEach((d) =>
        (d.games || []).forEach((g) => allGames.push(g)),
      );
      setGroups(groupGamesByEvent(allGames));
    } catch (err) {
      console.error("WBC scoreboard fetch error:", err);
      setGroups([]);
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(activeFilter, true);
    setRefreshing(false);
  };

  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
    loadData(filter, true); // silent — no full-screen spinner
  };

  useEffect(() => {
    loadData(activeFilter, false); // initial load shows full-screen spinner
  }, []);

  if (loading) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading WBC games…
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            World Baseball Classic
          </Text>
        </View>

        {/* Section title + date filters */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Games
            </Text>
            {fetching && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </View>

          <View style={styles.upcomingFilters}>
            {["yesterday", "today", "tomorrow"].map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.upcomingFilterButton,
                  {
                    backgroundColor:
                      activeFilter === filter
                        ? colors.primary
                        : theme.surfaceSecondary,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => handleFilterChange(filter)}
              >
                <Text
                  style={[
                    styles.upcomingFilterText,
                    { color: activeFilter === filter ? "white" : theme.text },
                  ]}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Games or empty state */}
        <View style={{ opacity: fetching ? 0.45 : 1 }}>
          {groups.length > 0 ? (
            <View style={styles.upcomingContainer}>
              <UpcomingMatchesSection
                groups={groups}
                navigation={navigation}
                theme={theme}
                colors={colors}
                isDarkMode={isDarkMode}
              />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text
                style={[styles.emptyStateText, { color: theme.textSecondary }]}
              >
                No games for {activeFilter}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
};

// ─── styles (copied 1-to-1 from VALHomeScreen) ────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  horizontalScroll: {
    paddingLeft: 16,
  },
  upcomingFilters: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  upcomingFilterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
  },
  upcomingFilterText: {
    fontSize: 14,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 16,
    textAlign: "center",
  },
  bottomPadding: {
    height: 32,
  },

  // Upcoming Matches — Liquipedia Layout (VALHomeScreen)
  upcomingContainer: {
    paddingHorizontal: 16,
  },
  upcomingMatchesContainer: {
    marginBottom: 24,
  },
  eventContainer: {
    borderRadius: 12,
    marginBottom: 16,
    overflow: "hidden",
  },
  eventHeaderContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  eventLogoContainer: {
    marginRight: 12,
  },
  eventLogoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  eventLogoImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  eventInfo: {
    flex: 1,
  },
  upcomingEventName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  upcomingEventChildLabel: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
  },
  matchesList: {
    // no padding — gameRow must be flush so gradient reaches card edges
  },
  upcomingMatchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  matchTimeContainer: {
    width: 50,
    marginRight: 16,
  },
  matchTime: {
    fontSize: 12,
    fontWeight: "500",
  },
  matchTimeAmPm: {
    fontSize: 11,
    opacity: 0.7,
  },
  matchScore: {
    fontSize: 16,
    marginLeft: 8,
    minWidth: 20,
    textAlign: "right",
  },
  stackedTeams: {
    flex: 1,
  },
  teamWithLogo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  teamLogoSmall: {
    width: 32.5,
    height: 25,
    marginRight: 8,
  },
  teamLogoSmallPlaceholder: {
    width: 32.5,
    height: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  teamLogoSmallText: {
    fontSize: 8,
    fontWeight: "bold",
    color: "white",
  },
  stackedTeamName: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  fetchingContainer: {
    alignItems: "center",
    paddingVertical: 32,
  },
  gameRow: {
    position: "relative",
    overflow: "hidden",
  },
  matchSeparator: {
    height: 1,
    opacity: 0.3,
  },
  gameFooter: {
    marginTop: -8,
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gameFooterLeft: { flex: 1 },
  gameFooterRight: { alignItems: "flex-end" },
  viewerBadge: { marginTop: 2 },
  venue: { fontSize: 12 },
});

export default ScoreboardScreen;

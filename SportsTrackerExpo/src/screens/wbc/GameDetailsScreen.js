import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Dimensions,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import WBCService from "../../services/WBCService";

const { width } = Dimensions.get("window");

// ─── Ordinal helper ───────────────────────────────────────────────────────────
const toOrdinal = (n) => {
  if (!n) return "";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// ─── Horizontal header gradient ──────────────────────────────────────────────
// away color bleeds in from the left, home color bleeds in from the right
const HeaderGradient = ({ awayColor, homeColor, theme, height }) => (
  <Svg
    style={StyleSheet.absoluteFill}
    width="115%"
    height={height || 300}
    pointerEvents="none"
  >
    <Defs>
      <LinearGradient id="hGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <Stop offset="0%" stopColor={awayColor} stopOpacity="0.25" />
        <Stop offset="40%" stopColor={theme.secondary} stopOpacity="0" />
        <Stop offset="60%" stopColor={theme.secondary} stopOpacity="0" />
        <Stop offset="100%" stopColor={homeColor} stopOpacity="0.25" />
      </LinearGradient>
    </Defs>
    <Rect width="100%" height="100%" fill="url(#hGrad)" />
  </Svg>
);

// ─── Team column (logo + name + score) ───────────────────────────────────────
const TeamColumn = ({ team, score, isWinner, side, isDarkMode, theme }) => {
  const logo = WBCService.getTeamLogo(team?.id, isDarkMode);

  return (
    <View style={[styles.teamColumn, { alignItems: "center" }]}>
      {score != null && (
        <Text
          style={[
            styles.teamScore,
            {
              color: isWinner ? theme.text : theme.textSecondary,
              fontWeight: isWinner ? "800" : "400",
            },
          ]}
        >
          {score}
        </Text>
      )}
      {logo ? (
        <Image
          source={{ uri: logo }}
          style={styles.teamLogo}
          resizeMode="contain"
        />
      ) : (
        <View
          style={[
            styles.teamLogoPlaceholder,
            { backgroundColor: theme.surfaceSecondary },
          ]}
        >
          <Text
            style={[
              styles.teamLogoPlaceholderText,
              { color: theme.textSecondary },
            ]}
          >
            {(team?.name || "?").charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <Text style={[styles.teamName, { color: theme.text }]} numberOfLines={2}>
        {team?.name || "—"}
      </Text>
    </View>
  );
};

// ─── Player headshot URL ────────────────────────────────────────────────────────
const playerHeadshotUrl = (playerId) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`;

// ─── Batting stat columns ────────────────────────────────────────────────────
const BATTING_COLS = [
  { key: "atBats", label: "AB" },
  { key: "hits", label: "H" },
  { key: "runs", label: "R" },
  { key: "rbi", label: "RBI" },
  { key: "homeRuns", label: "HR" },
  { key: "baseOnBalls", label: "BB" },
];

const PITCHING_COLS = [
  { key: "inningsPitched", label: "IP" },
  { key: "hits", label: "H" },
  { key: "runs", label: "ER" },
  { key: "baseOnBalls", label: "BB" },
  { key: "strikeOuts", label: "K" },
  { key: "numberOfPitches", label: "NP" },
];

// ─── Individual player card ───────────────────────────────────────────────────
const PlayerCard = ({ playerId, playerInfo, bsPlayer, theme }) => {
  const pos = bsPlayer?.position?.abbreviation ?? "";
  const position = bsPlayer?.position?.name ?? "";
  const isPitcher = pos === "P" || pos === "SP" || pos === "RP";
  const batting = bsPlayer?.stats?.batting ?? {};
  const pitching = bsPlayer?.stats?.pitching ?? {};
  const hasBatting = Object.keys(batting).length > 0;
  const hasPitching = Object.keys(pitching).length > 0;

  // Default stat mode: pitching if pitcher, else batting
  const [statMode, setStatMode] = useState(isPitcher ? "pitching" : "batting");

  const cols = statMode === "pitching" ? PITCHING_COLS : BATTING_COLS;
  const stats = statMode === "pitching" ? pitching : batting;
  const fullName = playerInfo?.fullName ?? `Player ${playerId}`;
  const number = playerInfo?.primaryNumber
    ? `#${playerInfo.primaryNumber}`
    : "";

  return (
    <View
      style={[
        pcStyles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {/* Top row: headshot + name block + stat toggle */}
      <View style={pcStyles.topRow}>
        {/* Headshot */}
        <Image
          source={{ uri: playerHeadshotUrl(playerId) }}
          style={pcStyles.headshot}
          resizeMode="cover"
        />

        {/* Name / position */}
        <View style={pcStyles.nameBlock}>
          <Text
            style={[pcStyles.playerName, { color: theme.text }]}
            numberOfLines={1}
          >
            {fullName}
          </Text>
          <Text style={[pcStyles.playerMeta, { color: theme.textSecondary }]}>
            {[number, position].filter(Boolean).join(" • ")}
          </Text>
        </View>

        {/* Toggle batting / pitching — only show if player has both */}
        {hasBatting && hasPitching && (
          <View style={pcStyles.toggleRow}>
            {["batting", "pitching"].map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setStatMode(m)}
                style={[
                  pcStyles.toggleBtn,
                  statMode === m && {
                    backgroundColor: theme.primary ?? "#3B82F6",
                  },
                ]}
              >
                <Text
                  style={[
                    pcStyles.toggleLabel,
                    {
                      color: statMode === m ? "#fff" : theme.textSecondary,
                    },
                  ]}
                >
                  {m === "batting" ? "Bat" : "Pit"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Stats row */}
      <View style={pcStyles.statsRow}>
        {cols.map(({ key, label }) => (
          <View key={key} style={pcStyles.statCell}>
            <Text style={[pcStyles.statValue, { color: theme.text }]}>
              {stats[key] ?? "—"}
            </Text>
            <Text style={[pcStyles.statLabel, { color: theme.textSecondary }]}>
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const pcStyles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  headshot: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(128,128,128,0.1)",
  },
  nameBlock: {
    flex: 1,
    marginLeft: 10,
  },
  playerName: {
    fontSize: 14,
    fontWeight: "700",
  },
  playerMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 4,
  },
  toggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(128,128,128,0.12)",
  },
  toggleLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statCell: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 15,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 10,
    marginTop: 2,
  },
});

// ─── Box score panel (one team) ───────────────────────────────────────────────
const BoxScorePanel = ({ bsTeamData, playersMap, theme }) => {
  const [section, setSection] = useState("batting");

  const bsPlayers = bsTeamData?.players ?? {};
  const battingOrder = bsTeamData?.battingOrder ?? [];

  // Collect ordered batters (by batting order, fallback to all with batting stats)
  const batterIds = battingOrder.length
    ? battingOrder
    : Object.keys(bsPlayers)
        .map((k) => Number(k.replace("ID", "")))
        .filter(
          (id) =>
            Object.keys(bsPlayers[`ID${id}`]?.stats?.batting ?? {}).length > 0,
        );

  // Collect pitchers (players with pitching stats)
  const pitcherIds = Object.keys(bsPlayers)
    .map((k) => Number(k.replace("ID", "")))
    .filter(
      (id) =>
        Object.keys(bsPlayers[`ID${id}`]?.stats?.pitching ?? {}).length > 0,
    );

  const ids = section === "batting" ? batterIds : pitcherIds;

  return (
    <View style={{ paddingBottom: 24 }}>
      {/* Section toggle */}
      <View style={bsStyles.sectionToggle}>
        {["batting", "pitching"].map((s) => (
          <TouchableOpacity
            key={s}
            style={[
              bsStyles.sectionBtn,
              section === s && bsStyles.sectionBtnActive,
            ]}
            onPress={() => setSection(s)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                bsStyles.sectionLabel,
                { color: section === s ? theme.text : theme.textSecondary },
              ]}
            >
              {s === "batting" ? "Batting" : "Pitching"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Player cards */}
      {ids.map((id) => (
        <PlayerCard
          key={id}
          playerId={id}
          playerInfo={playersMap?.[`ID${id}`] ?? null}
          bsPlayer={bsPlayers[`ID${id}`] ?? null}
          theme={theme}
        />
      ))}

      {ids.length === 0 && (
        <Text style={[bsStyles.empty, { color: theme.textSecondary }]}>
          No {section} data available.
        </Text>
      )}
    </View>
  );
};

const bsStyles = StyleSheet.create({
  sectionToggle: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 4,
    borderRadius: 10,
    backgroundColor: "rgba(128,128,128,0.1)",
    padding: 3,
  },
  sectionBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 8,
  },
  sectionBtnActive: {
    backgroundColor: "rgba(128,128,128,0.25)",
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  empty: {
    textAlign: "center",
    marginTop: 32,
    fontSize: 14,
  },
});

// ─── Center status badge ──────────────────────────────────────────────────────
const StatusBadge = ({ status, linescore, theme }) => {
  const state = status?.detailedState || "";
  const isLive = !["S", "P", "D", "C", "O", "F", "Q", "R"].includes(
    status?.codedGameState,
  );
  const inning = linescore?.currentInning;
  const inningState = linescore?.inningState;

  let topLabel = state;
  let bottomLabel = "";

  if (isLive && inning) {
    topLabel = `${inningState || ""} ${inning}`.trim();
    bottomLabel = state.startsWith("In Progress") ? "In Progress" : state;
  } else if (state === "Final") {
    topLabel = "Final";
    if (inning && inning > 9) bottomLabel = `F/${inning}`;
  }

  return (
    <View style={styles.statusBadge}>
      {isLive && inning != null && (
        <Text style={[styles.inningLabel, { color: theme.text }]}>
          {linescore?.isTopInning === false ? "Bot" : "Top"} {toOrdinal(inning)}
        </Text>
      )}
      <Text
        style={[
          styles.statusTop,
          { color: isLive ? theme.success : theme.textSecondary },
        ]}
      >
        {topLabel || "—"}
      </Text>
      {!!bottomLabel && (
        <Text style={[styles.statusBottom, { color: theme.textSecondary }]}>
          {bottomLabel}
        </Text>
      )}
      {!isLive && !inning && (
        <Text style={[styles.statusBottom, { color: theme.textTertiary }]}>
          {state === "Scheduled" ? "Upcoming" : ""}
        </Text>
      )}
    </View>
  );
};

// ─── Main screen ─────────────────────────────────────────────────────────────
const GameDetailsScreen = ({ navigation, route }) => {
  const { colors, theme, isDarkMode } = useTheme();
  const gamePk = route?.params?.gamePk;

  const [feed, setFeed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadFeed = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await WBCService.getGameFeed(gamePk);
        setFeed(res?.data ?? null);
      } catch (err) {
        console.error("WBC gameFeed error:", err);
        setError("Failed to load game data.");
      } finally {
        setLoading(false);
      }
    },
    [gamePk],
  );

  useEffect(() => {
    if (gamePk) loadFeed(false);
  }, [gamePk]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFeed(true);
    setRefreshing(false);
  };

  // ── Derived data ─────────────────────────────────────────────────────────
  const gameData = feed?.gameData ?? {};
  // linescore lives under liveData in the pruned payload
  const linescore = feed?.liveData?.linescore ?? feed?.linescore ?? null;

  const awayTeam = gameData?.teams?.away ?? {};
  const homeTeam = gameData?.teams?.home ?? {};
  const awayScore = linescore?.teams?.away?.runs ?? null;
  const homeScore = linescore?.teams?.home?.runs ?? null;

  const status = gameData?.status ?? {};
  const isFinished =
    status?.codedGameState === "F" || status?.detailedState === "Final";
  const homeWinner =
    isFinished &&
    homeScore != null &&
    awayScore != null &&
    homeScore > awayScore;
  const awayWinner =
    isFinished &&
    homeScore != null &&
    awayScore != null &&
    awayScore > homeScore;

  const [headerHeight, setHeaderHeight] = useState(0);
  const [activeTab, setActiveTab] = useState("Main");

  const TABS = ["Main", "Away", "Home", "Plays"];

  const awayColor = WBCService.getTeamColor(awayTeam?.id) || colors.primary;
  const homeColor = WBCService.getTeamColor(homeTeam?.id) || colors.secondary;

  const boxscore = feed?.liveData?.boxscore ?? null;
  const playersMap = gameData?.players ?? {};
  const bsAwayTeam = boxscore?.teams?.away ?? null;
  const bsHomeTeam = boxscore?.teams?.home ?? null;

  const venueRaw = gameData?.venue ?? null;
  const venue =
    typeof venueRaw === "string" ? venueRaw : (venueRaw?.name ?? null);

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading game…
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* ── Back button (absolute, sits above scroll) ── */}
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── HEADER ───────────────────────────────────────────────── */}
        <View
          style={[styles.header, { backgroundColor: theme.surfaceSecondary }]}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        >
          <HeaderGradient
            awayColor={awayColor}
            homeColor={homeColor}
            theme={theme}
            height={headerHeight}
          />

          {/* Venue */}
          {!!venue && (
            <Text style={[styles.venue, { color: theme.textTertiary }]}>
              {venue}
            </Text>
          )}

          {/* Team row */}
          <View style={styles.teamsRow}>
            <TeamColumn
              team={awayTeam}
              score={awayScore}
              isWinner={awayWinner}
              side="away"
              isDarkMode={isDarkMode}
              theme={theme}
            />

            <StatusBadge status={status} linescore={linescore} theme={theme} />

            <TeamColumn
              team={homeTeam}
              score={homeScore}
              isWinner={homeWinner}
              side="home"
              isDarkMode={isDarkMode}
              theme={theme}
            />
          </View>
        </View>

        {/* ── TAB BAR ─────────────────────────────────────────────── */}
        <View
          style={[
            styles.tabBar,
            { backgroundColor: theme.surface, borderBottomColor: theme.border },
          ]}
        >
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabButton,
                activeTab === tab && {
                  borderBottomColor: colors.primary,
                  borderBottomWidth: 2,
                },
              ]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color:
                      activeTab === tab ? colors.primary : theme.textSecondary,
                    fontWeight: activeTab === tab ? "700" : "400",
                  },
                ]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Error notice (non-blocking) ──────────────────────────── */}
        {!!error && (
          <View
            style={[
              styles.errorBanner,
              { backgroundColor: theme.surfaceSecondary },
            ]}
          >
            <Text style={{ color: theme.textSecondary }}>{error}</Text>
          </View>
        )}

        {/* ── TAB CONTENT ──────────────────────────────────────────── */}
        {activeTab === "Away" && (
          <BoxScorePanel
            bsTeamData={bsAwayTeam}
            playersMap={playersMap}
            theme={theme}
          />
        )}

        {activeTab === "Home" && (
          <BoxScorePanel
            bsTeamData={bsHomeTeam}
            playersMap={playersMap}
            theme={theme}
          />
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
};

// ─── styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { fontSize: 14 },
  // ── header ──
  header: {
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
    overflow: "hidden",
    position: "relative",
  },
  teamsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  teamColumn: {
    flex: 1,
    maxWidth: (width - 40) * 0.38,
    gap: 6,
  },
  teamLogo: {
    width: 76,
    height: 64,
  },
  teamLogoPlaceholder: {
    width: 76,
    height: 64,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  teamLogoPlaceholderText: { fontSize: 20, fontWeight: "bold" },
  teamName: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 18,
    textAlign: "center",
    width: "100%",
  },
  teamScore: {
    fontSize: 38,
    lineHeight: 42,
  },
  statusBadge: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    flex: 1,
  },
  inningLabel: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
  },
  statusTop: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    flexWrap: "wrap",
  },
  statusBottom: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 2,
    flexWrap: "wrap",
  },
  venue: {
    fontSize: 12,
    textAlign: "center",
    marginBottom: 12,
  },
  // ── tab bar ──
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: {
    fontSize: 14,
  },
  // ── misc ──
  errorBanner: {
    margin: 16,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  bottomPadding: { height: 32 },
});

export default GameDetailsScreen;

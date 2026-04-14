import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  RefreshControl,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
} from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import { NHLService } from "../../services/NHLService";

const { width } = Dimensions.get("window");
const STAT_CHIP_COLS = 3;
const STAT_CHIP_GAP = 8;
const STAT_CHIP_W =
  (width - 2 * 12 - 2 * 14 - STAT_CHIP_GAP * (STAT_CHIP_COLS - 1)) /
  STAT_CHIP_COLS;

const TABS = ["Team", "Matches", "Stats", "Roster"];

const TEAM_ID_TO_ABBR = {
  1: "BOS",
  2: "BUF",
  3: "CGY",
  4: "CHI",
  5: "DET",
  6: "EDM",
  7: "CAR",
  8: "LAK",
  9: "DAL",
  10: "MTL",
  11: "NJD",
  12: "NYI",
  13: "NYR",
  14: "OTT",
  15: "PHI",
  16: "PIT",
  17: "COL",
  18: "SJS",
  19: "STL",
  20: "TBL",
  21: "TOR",
  22: "VAN",
  23: "WSH",
  25: "ANA",
  26: "FLA",
  27: "NSH",
  28: "WPG",
  29: "CBJ",
  30: "MIN",
  37: "VGK",
  124292: "SEA",
  129764: "UTA",
};

const normalizeAbbr = (abbr) => {
  if (!abbr) return null;
  const v = String(abbr).toUpperCase();
  if (v === "LA") return "LAK";
  if (v === "SJ") return "SJS";
  if (v === "TB") return "TBL";
  return v;
};

const resolveTeamInput = (params) => {
  const raw = params?.teamId ?? params?.team ?? null;
  const teamObj =
    params?.team && typeof params.team === "object" ? params.team : null;

  let id = null;
  let abbreviation = null;
  let displayName = null;

  if (teamObj) {
    id = teamObj.id != null ? String(teamObj.id) : null;
    abbreviation = teamObj.abbreviation
      ? normalizeAbbr(teamObj.abbreviation)
      : null;
    displayName = teamObj.displayName || teamObj.name || null;
  }

  if (raw != null && typeof raw === "object") {
    id = id || (raw.id != null ? String(raw.id) : null);
    abbreviation =
      abbreviation ||
      (raw.abbreviation ? normalizeAbbr(raw.abbreviation) : null);
    displayName = displayName || raw.displayName || raw.name || null;
  } else if (raw != null) {
    const token = String(raw);
    if (/^\d+$/.test(token)) {
      id = id || token;
      abbreviation = abbreviation || TEAM_ID_TO_ABBR[token] || null;
    } else {
      abbreviation = abbreviation || normalizeAbbr(token);
    }
  }

  return {
    id,
    abbreviation,
    displayName,
    endpointId: abbreviation || id,
  };
};

const getTextOnColor = (hex) => {
  if (!hex) return "#FFFFFF";
  const c = String(hex).replace("#", "");
  if (c.length < 6) return "#FFFFFF";
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#000000" : "#FFFFFF";
};

const formatDate = (dateStr) => {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(dateStr);
  }
};

const formatTime = (dateStr) => {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
};

const getTodayDateStr = () => {
  try {
    const now = new Date();
    const localToday = now.toLocaleDateString("en-CA");
    if (now.getHours() < 2) {
      const prev = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return prev.toLocaleDateString("en-CA");
    }
    return localToday;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

const gameToLocalDateStr = (gameDate) => {
  if (!gameDate) return "";
  try {
    return new Date(gameDate).toLocaleDateString("en-CA");
  } catch {
    return String(gameDate).slice(0, 10);
  }
};

const getGameLabel = (game) => {
  const type = Number(game?.gameType || 2);
  if (type === 1) return "Preseason";
  if (type === 3) return "Playoffs";
  return null;
};

const toFinite = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const average = (arr, key) => {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  let total = 0;
  let count = 0;
  for (const row of arr) {
    const val = Number(row?.[key]);
    if (Number.isFinite(val)) {
      total += val;
      count += 1;
    }
  }
  return count > 0 ? total / count : 0;
};

const sum = (arr, key) => {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  return arr.reduce((acc, row) => {
    const val = Number(row?.[key]);
    return Number.isFinite(val) ? acc + val : acc;
  }, 0);
};

const buildMetricRows = (players, metrics) => {
  return metrics
    .map((m) => {
      const values = (players || [])
        .map((p) => Number(p?.[m.key]))
        .filter((v) => Number.isFinite(v));
      if (!values.length) return null;

      const minVal = Math.min(...values);
      const maxVal = Math.max(...values);
      const teamVal =
        m.type === "sum" ? sum(players, m.key) : average(players, m.key);

      let pct = 0;
      if (maxVal !== minVal) {
        pct = (teamVal - minVal) / (maxVal - minVal);
        pct = Math.max(0, Math.min(1, pct));
      }

      return {
        key: m.key,
        label: m.label,
        value: m.format ? m.format(teamVal) : String(Math.round(teamVal)),
        pct,
      };
    })
    .filter(Boolean);
};

const StatBubble = ({ title, rows, expanded, onToggle, teamColor, theme }) => {
  const visibleRows = expanded ? rows : rows.slice(0, 5);
  return (
    <TouchableOpacity
      style={[sbStyles.bubble, { backgroundColor: theme.surface }]}
      onPress={onToggle}
      activeOpacity={0.85}
    >
      <View style={sbStyles.bubbleHeader}>
        <Text
          allowFontScaling={false}
          style={[sbStyles.bubbleTitle, { color: theme.text }]}
        >
          {title}
        </Text>
        <View style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}>
          <Text style={[sbStyles.bubbleChevron, { color: theme.text }]}>›</Text>
        </View>
      </View>
      <View>
        {visibleRows.map(({ key, label, value, pct }) => (
          <View key={key} style={sbStyles.statRow}>
            <Text
              allowFontScaling={false}
              style={[sbStyles.statRowLabel, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {label}
            </Text>
            <View style={sbStyles.statRowRight}>
              <Text
                allowFontScaling={false}
                style={[sbStyles.statRowValue, { color: theme.text }]}
              >
                {value}
              </Text>
              <View
                style={[
                  sbStyles.statBarTrack,
                  { backgroundColor: theme.border },
                ]}
              >
                <View
                  style={[
                    sbStyles.statBarFill,
                    {
                      width: `${Math.round(pct * 100)}%`,
                      backgroundColor: teamColor,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        ))}
        {!expanded && rows.length > 5 && (
          <Text
            allowFontScaling={false}
            style={[sbStyles.showMore, { color: theme.textSecondary }]}
          >
            +{rows.length - 5} more ›
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const sbStyles = StyleSheet.create({
  bubble: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 0,
  },
  bubbleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  bubbleTitle: { fontSize: 14, fontWeight: "800", letterSpacing: 0.3 },
  bubbleChevron: { fontSize: 20, lineHeight: 22 },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  statRowLabel: { flex: 1, fontSize: 12, fontWeight: "500", paddingRight: 8 },
  statRowRight: { alignItems: "flex-end", gap: 4 },
  statRowValue: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
    minWidth: 40,
  },
  statBarTrack: { width: 64, height: 3, borderRadius: 2, overflow: "hidden" },
  statBarFill: { height: "100%", borderRadius: 2, minWidth: 2 },
  showMore: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
    marginTop: 2,
  },
});

const RosterPlayerRow = ({ player, teamColor, theme }) => {
  const [expanded, setExpanded] = useState(false);
  const [headshotError, setHeadshotError] = useState(false);
  const personId = player.person?.id;
  const headshotUrl =
    player.headshot ||
    (personId
      ? `https://assets.nhle.com/mugs/nhl/20252026/${personId}.png`
      : null);

  const statEntries = Object.entries(player.stats || {}).filter(
    ([, v]) => v?.value != null,
  );

  const rankTextColor = getTextOnColor(teamColor);
  const statusColor =
    player.status?.description === "Active" ? theme.success : theme.error;

  return (
    <View style={[rStyles.playerBubble, { backgroundColor: theme.surface }]}>
      <TouchableOpacity
        style={rStyles.playerRow}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.75}
      >
        {headshotUrl && !headshotError ? (
          <Image
            cachePolicy="memory-disk"
            source={{ uri: headshotUrl }}
            style={rStyles.headshot}
            onError={() => setHeadshotError(true)}
          />
        ) : (
          <View
            style={[
              rStyles.headshot,
              rStyles.headshotPlaceholder,
              { backgroundColor: teamColor + "33" },
            ]}
          />
        )}

        <View style={rStyles.nameBlock}>
          <Text
            allowFontScaling={false}
            style={[rStyles.playerName, { color: theme.text }]}
            numberOfLines={1}
          >
            {player.person?.fullName || ""}
          </Text>
          <Text
            allowFontScaling={false}
            style={[rStyles.playerMeta, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {player.position?.name || ""} • #{player.jerseyNumber || ""}
          </Text>
        </View>

        <Text
          allowFontScaling={false}
          style={[rStyles.statusText, { color: statusColor }]}
          numberOfLines={2}
        >
          {player.status?.description || ""}
        </Text>

        <View style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}>
          <Text style={[rStyles.chevron, { color: theme.textSecondary }]}>
            ›
          </Text>
        </View>
      </TouchableOpacity>

      {expanded &&
        (statEntries.length === 0 ? (
          <View style={rStyles.noStats}>
            <Text style={[rStyles.noStatsText, { color: theme.textSecondary }]}>
              No stats available
            </Text>
          </View>
        ) : (
          <View style={rStyles.statsDropdown}>
            <View style={rStyles.statsGrid}>
              {statEntries.map(([label, info]) => (
                <View
                  key={label}
                  style={[
                    rStyles.statChip,
                    { backgroundColor: theme.background },
                  ]}
                >
                  {info.rank != null && (
                    <View
                      style={[
                        rStyles.rankBadge,
                        { backgroundColor: teamColor },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[rStyles.rankText, { color: rankTextColor }]}
                      >
                        #{info.rank}
                      </Text>
                    </View>
                  )}
                  <Text
                    allowFontScaling={false}
                    style={[rStyles.chipValue, { color: theme.text }]}
                  >
                    {info.value}
                  </Text>
                  <Text
                    allowFontScaling={false}
                    style={[rStyles.chipLabel, { color: theme.textSecondary }]}
                    numberOfLines={2}
                  >
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
    </View>
  );
};

const rStyles = StyleSheet.create({
  playerBubble: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 14,
    overflow: "visible",
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  headshot: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(128,128,128,0.1)",
  },
  headshotPlaceholder: { borderRadius: 23 },
  nameBlock: { flex: 1 },
  playerName: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  playerMeta: { fontSize: 12 },
  statusText: { fontSize: 12, textAlign: "right", maxWidth: 80 },
  chevron: { fontSize: 22, lineHeight: 26, paddingLeft: 4 },
  statsDropdown: {
    paddingHorizontal: 12,
    paddingBottom: 14,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.2)",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 6,
  },
  statChip: {
    width: STAT_CHIP_W,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    position: "relative",
    overflow: "visible",
    marginBottom: 8,
  },
  rankBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  rankText: { fontSize: 9, fontWeight: "700" },
  chipValue: { fontSize: 15, fontWeight: "800", marginBottom: 4 },
  chipLabel: { fontSize: 10, fontWeight: "500", textAlign: "center" },
  noStats: { paddingHorizontal: 16, paddingBottom: 14, paddingTop: 6 },
  noStatsText: { fontSize: 13 },
  posSection: {},
  posSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  posSectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  posSectionCount: {
    fontSize: 12,
    fontWeight: "800",
  },
});

const TeamTab = ({ teamData, teamColor, theme }) => {
  const summary = teamData?.summary || {};
  const leaders = teamData?.leaders || [];

  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 24,
        gap: 12,
      }}
    >
      <View style={[ttStyles.bubble, { backgroundColor: theme.surface }]}>
        <Text
          allowFontScaling={false}
          style={[ttStyles.sectionTitle, { color: teamColor }]}
        >
          Team Overview
        </Text>

        {[
          ["Season", summary.currentSeason || "--"],
          ["Record", summary.record || "--"],
          [
            "Games",
            summary.gamesPlayed != null ? String(summary.gamesPlayed) : "--",
          ],
          [
            "Goals For",
            summary.goalsFor != null ? String(summary.goalsFor) : "--",
          ],
          [
            "Goals Against",
            summary.goalsAgainst != null ? String(summary.goalsAgainst) : "--",
          ],
          [
            "Goal Diff",
            summary.goalDiff != null ? String(summary.goalDiff) : "--",
          ],
        ].map(([label, value], idx, arr) => (
          <View
            key={label}
            style={[
              ttStyles.coachRow,
              idx < arr.length - 1
                ? {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: theme.border,
                  }
                : null,
            ]}
          >
            <Text style={[ttStyles.coachName, { color: theme.textSecondary }]}>
              {label}
            </Text>
            <Text style={[ttStyles.coachJersey, { color: theme.text }]}>
              {value}
            </Text>
          </View>
        ))}
      </View>

      {leaders.length > 0 && (
        <View style={[ttStyles.bubble, { backgroundColor: theme.surface }]}>
          <Text
            allowFontScaling={false}
            style={[ttStyles.sectionTitle, { color: teamColor }]}
          >
            Team Leaders
          </Text>
          {leaders.map((leader, i) => (
            <View
              key={`${leader.label}-${i}`}
              style={[
                ttStyles.coachRow,
                i < leaders.length - 1
                  ? {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: theme.border,
                    }
                  : null,
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  allowFontScaling={false}
                  style={[ttStyles.coachName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {leader.player}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[ttStyles.coachJob, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {leader.label}
                </Text>
              </View>
              <Text
                allowFontScaling={false}
                style={[ttStyles.coachJersey, { color: teamColor }]}
              >
                {leader.value}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const ttStyles = StyleSheet.create({
  bubble: {
    borderRadius: 14,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  coachRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  coachName: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  coachJob: { fontSize: 12 },
  coachJersey: {
    fontSize: 15,
    fontWeight: "700",
    minWidth: 36,
    textAlign: "right",
  },
});

const MatchCard = ({
  game,
  idx,
  navigation,
  sport,
  isDarkMode,
  theme,
  colors,
  teamColor,
  getLogo,
}) => {
  const label = getGameLabel(game);
  const away = game.teams?.away?.team || {};
  const home = game.teams?.home?.team || {};
  const awayScore = game.teams?.away?.score;
  const homeScore = game.teams?.home?.score;

  const state = String(game.status?.codedGameState || "").toUpperCase();
  const isLive = ["I", "MA", "MC"].includes(state);
  const isScheduled = ["S", "P"].includes(state);
  const isFinished = !isLive && !isScheduled && !!state;

  const awayLogo = getLogo(away.abbreviation || away.id, isDarkMode);
  const homeLogo = getLogo(home.abbreviation || home.id, isDarkMode);
  const awayColor = NHLService.getTeamColor(away.abbreviation, colors.primary);
  const homeColor = NHLService.getTeamColor(
    home.abbreviation,
    colors.secondary,
  );

  const awayWinner =
    isFinished &&
    awayScore != null &&
    homeScore != null &&
    Number(awayScore) > Number(homeScore);
  const homeWinner =
    isFinished &&
    homeScore != null &&
    awayScore != null &&
    Number(homeScore) > Number(awayScore);

  const statusLabel = isScheduled
    ? formatTime(game.gameDate)
    : isLive
      ? "LIVE"
      : game.status?.detailedState?.includes("Final")
        ? "Final"
        : (game.status?.detailedState || "").slice(0, 8);

  const gradId = `nhl_match_${idx}_${game.gamePk || "x"}`;

  return (
    <View style={styles.matchCardWrap}>
      {label ? (
        <View
          style={[
            styles.matchGameBadge,
            {
              backgroundColor: teamColor + "80",
              borderColor: teamColor,
            },
          ]}
        >
          <Text
            allowFontScaling={false}
            style={[styles.matchGameBadgeText, { color: theme.textSecondary }]}
          >
            {label}
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.matchCard, { backgroundColor: theme.surface }]}
        onPress={() =>
          navigation.navigate("GameDetails", {
            sport: sport || "nhl",
            gameId: game.gamePk,
          })
        }
        activeOpacity={0.75}
      >
        <Svg
          style={StyleSheet.absoluteFill}
          width="100%"
          height="100%"
          pointerEvents="none"
        >
          <Defs>
            <SvgLinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={awayColor} stopOpacity="0.08" />
              <Stop offset="40%" stopColor={theme.surface} stopOpacity="0" />
              <Stop offset="60%" stopColor={theme.surface} stopOpacity="0" />
              <Stop offset="100%" stopColor={homeColor} stopOpacity="0.08" />
            </SvgLinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${gradId})`} />
        </Svg>

        <View style={styles.matchCardInner}>
          <View style={styles.matchStatusCol}>
            <Text
              allowFontScaling={false}
              style={[styles.matchDateText, { color: theme.textSecondary }]}
              numberOfLines={2}
            >
              {formatDate(game.gameDate)}
            </Text>
            <Text
              allowFontScaling={false}
              style={[
                styles.matchStatusText,
                isLive
                  ? { color: "#E53935", fontWeight: "700" }
                  : { color: theme.textTertiary || theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {statusLabel}
            </Text>
          </View>

          <View style={styles.matchTeamsList}>
            <View style={styles.matchTeamRow}>
              <View style={styles.matchLogoWrap}>
                {awayLogo ? (
                  <Image
                    cachePolicy="memory-disk"
                    source={{ uri: awayLogo }}
                    style={styles.matchTeamLogo}
                    resizeMode="contain"
                  />
                ) : (
                  <View
                    style={[
                      styles.matchTeamLogoFallback,
                      { backgroundColor: awayColor },
                    ]}
                  >
                    <Text style={styles.matchLogoFallbackText}>
                      {(away.abbreviation || away.name || "A").charAt(0)}
                    </Text>
                  </View>
                )}
              </View>

              <Text
                allowFontScaling={false}
                style={[
                  styles.matchTeamName,
                  {
                    color: awayWinner ? theme.text : theme.textSecondary,
                    fontWeight: awayWinner ? "800" : "400",
                  },
                ]}
                numberOfLines={1}
              >
                {away.name || away.abbreviation || "Away"}
              </Text>

              {awayScore != null && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.matchScoreText,
                    {
                      color: awayWinner ? theme.text : theme.textSecondary,
                      fontWeight: awayWinner ? "800" : "400",
                    },
                  ]}
                >
                  {awayScore}
                </Text>
              )}
            </View>

            <View
              style={[
                styles.matchTeamDivider,
                { backgroundColor: theme.border },
              ]}
            />

            <View style={styles.matchTeamRow}>
              <View style={styles.matchLogoWrap}>
                {homeLogo ? (
                  <Image
                    cachePolicy="memory-disk"
                    source={{ uri: homeLogo }}
                    style={styles.matchTeamLogo}
                    resizeMode="contain"
                  />
                ) : (
                  <View
                    style={[
                      styles.matchTeamLogoFallback,
                      { backgroundColor: homeColor },
                    ]}
                  >
                    <Text style={styles.matchLogoFallbackText}>
                      {(home.abbreviation || home.name || "H").charAt(0)}
                    </Text>
                  </View>
                )}
              </View>

              <Text
                allowFontScaling={false}
                style={[
                  styles.matchTeamName,
                  {
                    color: homeWinner ? theme.text : theme.textSecondary,
                    fontWeight: homeWinner ? "800" : "400",
                  },
                ]}
                numberOfLines={1}
              >
                {home.name || home.abbreviation || "Home"}
              </Text>

              {homeScore != null && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.matchScoreText,
                    {
                      color: homeWinner ? theme.text : theme.textSecondary,
                      fontWeight: homeWinner ? "800" : "400",
                    },
                  ]}
                >
                  {homeScore}
                </Text>
              )}
            </View>
          </View>

          <Text
            style={[
              styles.matchChevron,
              { color: theme.textTertiary || theme.textSecondary },
            ]}
          >
            ›
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const MatchesSection = ({
  title,
  games,
  collapsible,
  navigation,
  sport,
  isDarkMode,
  theme,
  colors,
  teamColor,
  getLogo,
}) => {
  const [expanded, setExpanded] = useState(false);
  if (!games.length) return null;

  const visibleGames = collapsible && !expanded ? games.slice(0, 1) : games;

  return (
    <View style={{ marginBottom: 6 }}>
      <TouchableOpacity
        style={[mStyles.sectionHeader, { backgroundColor: theme.surface }]}
        onPress={collapsible ? () => setExpanded((v) => !v) : undefined}
        activeOpacity={collapsible ? 0.7 : 1}
        disabled={!collapsible}
      >
        <Text
          allowFontScaling={false}
          style={[mStyles.sectionTitle, { color: teamColor }]}
        >
          {title}
        </Text>

        {collapsible && !expanded && games.length > 1 && (
          <View
            style={[mStyles.countBadge, { backgroundColor: teamColor + "22" }]}
          >
            <Text
              allowFontScaling={false}
              style={[mStyles.countText, { color: theme.textTertiary }]}
            >
              +{games.length - 1}
            </Text>
          </View>
        )}

        {collapsible && (
          <View
            style={{
              transform: [{ rotate: expanded ? "90deg" : "0deg" }],
              marginLeft: 4,
            }}
          >
            <Text
              style={[mStyles.sectionChevron, { color: theme.textSecondary }]}
            >
              ›
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {visibleGames.map((game, idx) => (
        <MatchCard
          key={game.gamePk || idx}
          game={game}
          idx={idx}
          navigation={navigation}
          sport={sport}
          isDarkMode={isDarkMode}
          theme={theme}
          colors={colors}
          teamColor={teamColor}
          getLogo={getLogo}
        />
      ))}
    </View>
  );
};

const mStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  countBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  countText: { fontSize: 11, fontWeight: "700" },
  sectionChevron: { fontSize: 22, lineHeight: 26 },
});

const TeamPageScreen = ({ route, navigation }) => {
  const params = route.params || {};
  const { sport = "nhl" } = params;
  const { theme, colors, isDarkMode, getTeamLogoUrl } = useTheme();

  const teamInput = useMemo(() => resolveTeamInput(params), [params]);

  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("Team");
  const [skaterExpanded, setSkaterExpanded] = useState(false);
  const [goalieExpanded, setGoalieExpanded] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(180);

  const scrollY = useRef(new Animated.Value(0)).current;

  const getLogo = useCallback(
    (abbrOrId, dark) => {
      const abbr =
        normalizeAbbr(abbrOrId) || TEAM_ID_TO_ABBR[String(abbrOrId)] || null;
      if (!abbr) return null;
      return getTeamLogoUrl ? getTeamLogoUrl("nhl", abbr, dark) : null;
    },
    [getTeamLogoUrl],
  );

  const loadTeam = useCallback(
    async (isRefresh = false) => {
      if (!teamInput.endpointId) {
        setLoading(false);
        return;
      }

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const url = `${NHLService.BACKEND_URL}/nhl/team/${encodeURIComponent(teamInput.endpointId)}`;
        const response = await fetch(url, {
          headers: NHLService.getBrowserHeaders?.() || undefined,
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch NHL team: ${response.status}`);
        }
        const json = await response.json();
        const payload = json?.data || json || null;

        const skaters = Array.isArray(payload?.stats?.skaters)
          ? payload.stats.skaters
          : [];
        const goalies = Array.isArray(payload?.stats?.goalies)
          ? payload.stats.goalies
          : [];
        const scheduleGames = Array.isArray(payload?.schedule?.games)
          ? payload.schedule.games
          : [];

        const wins = scheduleGames.filter((g) => {
          const homeScore = toFinite(g?.homeTeam?.score, NaN);
          const awayScore = toFinite(g?.awayTeam?.score, NaN);
          const isHome =
            normalizeAbbr(g?.homeTeam?.abbrev) ===
            normalizeAbbr(payload?.id || teamInput.abbreviation);
          if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore))
            return false;
          return isHome ? homeScore > awayScore : awayScore > homeScore;
        }).length;

        const losses = scheduleGames.filter((g) => {
          const homeScore = toFinite(g?.homeTeam?.score, NaN);
          const awayScore = toFinite(g?.awayTeam?.score, NaN);
          const isHome =
            normalizeAbbr(g?.homeTeam?.abbrev) ===
            normalizeAbbr(payload?.id || teamInput.abbreviation);
          if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore))
            return false;
          return isHome ? homeScore < awayScore : awayScore < homeScore;
        }).length;

        const gf = scheduleGames.reduce((acc, g) => {
          const isHome =
            normalizeAbbr(g?.homeTeam?.abbrev) ===
            normalizeAbbr(payload?.id || teamInput.abbreviation);
          return (
            acc + toFinite(isHome ? g?.homeTeam?.score : g?.awayTeam?.score, 0)
          );
        }, 0);

        const ga = scheduleGames.reduce((acc, g) => {
          const isHome =
            normalizeAbbr(g?.homeTeam?.abbrev) ===
            normalizeAbbr(payload?.id || teamInput.abbreviation);
          return (
            acc + toFinite(isHome ? g?.awayTeam?.score : g?.homeTeam?.score, 0)
          );
        }, 0);

        const leaderPoints = [...skaters]
          .sort((a, b) => toFinite(b?.points) - toFinite(a?.points))
          .slice(0, 3)
          .map((p) => ({
            label: "PTS",
            value: String(toFinite(p?.points)),
            player: `#${p?.playerId || ""}`,
          }));

        const rosterRaw = payload?.roster || {};
        const skaterMap = Object.fromEntries(
          skaters.map((p) => [String(p?.playerId), p]),
        );
        const goalieMap = Object.fromEntries(
          goalies.map((p) => [String(p?.playerId), p]),
        );

        const normalizeRosterGroup = (arr, positionName) =>
          (Array.isArray(arr) ? arr : []).map((p) => {
            const pid = String(p?.playerId || p?.id || "");
            const statSource = skaterMap[pid] || goalieMap[pid] || null;
            const fullName = [p?.firstName?.default, p?.lastName?.default]
              .filter(Boolean)
              .join(" ");

            return {
              person: {
                id: pid,
                fullName: fullName || p?.name?.default || `#${pid}`,
              },
              position: {
                name: positionName,
                abbreviation: p?.positionCode || positionName,
              },
              jerseyNumber:
                p?.sweaterNumber != null ? String(p.sweaterNumber) : "",
              status: { description: "Active" },
              headshot: pid
                ? `https://assets.nhle.com/mugs/nhl/20252026/${pid}.png`
                : null,
              stats: statSource
                ? Object.fromEntries(
                    Object.entries(statSource)
                      .filter(([, v]) => Number.isFinite(Number(v)))
                      .slice(0, 9)
                      .map(([k, v]) => [
                        k,
                        {
                          value:
                            Number(v) % 1 === 0
                              ? String(Number(v))
                              : Number(v).toFixed(3).replace(/\.0+$/, ""),
                        },
                      ]),
                  )
                : {},
            };
          });

        const roster = [
          ...normalizeRosterGroup(rosterRaw?.forwards, "Forward"),
          ...normalizeRosterGroup(rosterRaw?.defensemen, "Defenseman"),
          ...normalizeRosterGroup(rosterRaw?.goalies, "Goalie"),
        ];

        const normalizedGames = scheduleGames.map((g) => {
          const awayAbbr = normalizeAbbr(
            g?.awayTeam?.abbrev || g?.awayTeam?.abbreviation || "AWY",
          );
          const homeAbbr = normalizeAbbr(
            g?.homeTeam?.abbrev || g?.homeTeam?.abbreviation || "HME",
          );
          const state = String(g?.gameState || "").toUpperCase();
          const codedGameState =
            state === "LIVE" || state === "CRIT"
              ? "I"
              : state === "FUT" || state === "PRE"
                ? "S"
                : "F";

          return {
            gamePk: g?.id,
            gameType: g?.gameType,
            gameDate: g?.startTimeUTC || g?.gameDate,
            venue: g?.venue || "",
            status: {
              codedGameState,
              detailedState:
                state === "OFF" || state === "FINAL"
                  ? "Final"
                  : state === "LIVE"
                    ? "Live"
                    : "Scheduled",
            },
            teams: {
              away: {
                score: g?.awayTeam?.score,
                team: {
                  id: awayAbbr,
                  abbreviation: awayAbbr,
                  name: g?.awayTeam?.name?.default || awayAbbr,
                },
              },
              home: {
                score: g?.homeTeam?.score,
                team: {
                  id: homeAbbr,
                  abbreviation: homeAbbr,
                  name: g?.homeTeam?.name?.default || homeAbbr,
                },
              },
            },
          };
        });

        setTeamData({
          team: {
            id: teamInput.id || payload?.id || teamInput.endpointId,
            abbreviation: normalizeAbbr(
              payload?.id || teamInput.abbreviation || teamInput.endpointId,
            ),
            name:
              teamInput.displayName ||
              route.params?.team?.displayName ||
              normalizeAbbr(payload?.id || teamInput.endpointId) ||
              "NHL Team",
            league: { name: "National Hockey League" },
            division: { name: "" },
          },
          summary: {
            currentSeason: payload?.schedule?.currentSeason || "--",
            gamesPlayed: scheduleGames.length,
            record: `${wins}-${losses}`,
            goalsFor: gf,
            goalsAgainst: ga,
            goalDiff: gf - ga,
          },
          leaders: leaderPoints,
          stats: { skaters, goalies },
          schedule: { dates: [{ games: normalizedGames }] },
          roster,
        });
      } catch (error) {
        console.error("NHL TeamPage load error:", error);
        setTeamData(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [route.params, teamInput],
  );

  useEffect(() => {
    loadTeam(false);
  }, [loadTeam]);

  const team = teamData?.team || null;
  const resolvedAbbr = normalizeAbbr(
    team?.abbreviation || teamInput.abbreviation || teamInput.endpointId,
  );
  const teamColor = NHLService.getTeamColor(resolvedAbbr, colors.primary);
  const teamLogo = getLogo(resolvedAbbr, isDarkMode);

  const skaters = teamData?.stats?.skaters || [];
  const goalies = teamData?.stats?.goalies || [];

  const skaterRows = useMemo(
    () =>
      buildMetricRows(skaters, [
        { key: "goals", label: "Goals", type: "sum" },
        { key: "assists", label: "Assists", type: "sum" },
        { key: "points", label: "Points", type: "sum" },
        { key: "shots", label: "Shots", type: "sum" },
        {
          key: "faceoffWinPctg",
          label: "Faceoff %",
          type: "avg",
          format: (v) => `${(Number(v) * 100).toFixed(1)}%`,
        },
        {
          key: "avgTimeOnIcePerGame",
          label: "Avg TOI",
          type: "avg",
          format: (v) => `${Math.round(Number(v) / 60)}m`,
        },
      ]),
    [skaters],
  );

  const goalieRows = useMemo(
    () =>
      buildMetricRows(goalies, [
        { key: "wins", label: "Wins", type: "sum" },
        { key: "shutouts", label: "Shutouts", type: "sum" },
        {
          key: "savePercentage",
          label: "Save %",
          type: "avg",
          format: (v) => Number(v).toFixed(3),
        },
        {
          key: "goalsAgainstAverage",
          label: "GAA",
          type: "avg",
          format: (v) => Number(v).toFixed(2),
        },
        { key: "saves", label: "Saves", type: "sum" },
      ]),
    [goalies],
  );

  const statsContent =
    skaterRows.length === 0 && goalieRows.length === 0 ? (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          No stats available
        </Text>
      </View>
    ) : (
      <View
        style={{
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 24,
          gap: 12,
        }}
      >
        {skaterRows.length > 0 && (
          <StatBubble
            title="Skaters"
            rows={skaterRows}
            expanded={skaterExpanded}
            onToggle={() => setSkaterExpanded((v) => !v)}
            teamColor={teamColor}
            theme={theme}
          />
        )}
        {goalieRows.length > 0 && (
          <StatBubble
            title="Goalies"
            rows={goalieRows}
            expanded={goalieExpanded}
            onToggle={() => setGoalieExpanded((v) => !v)}
            teamColor={teamColor}
            theme={theme}
          />
        )}
      </View>
    );

  const todayStr = getTodayDateStr();
  const allGamesList = (teamData?.schedule?.dates || []).flatMap(
    (d) => d.games || [],
  );
  const todayGames = allGamesList.filter(
    (g) => gameToLocalDateStr(g.gameDate) === todayStr,
  );
  const pastGames = allGamesList
    .filter((g) => gameToLocalDateStr(g.gameDate) < todayStr)
    .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));
  const upcomingGames = allGamesList
    .filter((g) => gameToLocalDateStr(g.gameDate) > todayStr)
    .sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
  const hasAnyGames =
    todayGames.length + pastGames.length + upcomingGames.length > 0;

  const threshold = Math.max(headerHeight - 40, 80);
  const stickyOpacity = scrollY.interpolate({
    inputRange: [threshold, threshold + 40],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const stickyMiniHeight = scrollY.interpolate({
    inputRange: [threshold, threshold + 40],
    outputRange: [0, 64],
    extrapolate: "clamp",
  });

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={teamColor} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        stickyHeaderIndices={[1]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadTeam(true)}
            tintColor={teamColor}
          />
        }
      >
        <View
          style={[
            styles.header,
            {
              backgroundColor: teamColor + "22",
              borderBottomColor: teamColor,
            },
          ]}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.headerMain}>
            {teamLogo ? (
              <Image
                cachePolicy="memory-disk"
                source={{ uri: teamLogo }}
                style={styles.headerLogo}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  styles.headerLogoFallback,
                  { backgroundColor: teamColor },
                ]}
              >
                <Text
                  style={[
                    styles.headerLogoFallbackText,
                    { color: getTextOnColor(teamColor) },
                  ]}
                >
                  {(team?.abbreviation || "?").charAt(0)}
                </Text>
              </View>
            )}

            <View style={styles.headerTextBlock}>
              <Text
                allowFontScaling={false}
                style={[styles.headerName, { color: teamColor }]}
                numberOfLines={1}
              >
                {team?.name || "NHL Team"}
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.headerLeague, { color: teamColor + "BB" }]}
                numberOfLines={1}
              >
                {team?.league?.name || "National Hockey League"}
              </Text>
              {!!team?.division?.name && (
                <Text
                  allowFontScaling={false}
                  style={[styles.headerDivision, { color: teamColor + "99" }]}
                  numberOfLines={1}
                >
                  {team.division.name}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={{ backgroundColor: theme.surface }}>
          <Animated.View
            style={{
              height: stickyMiniHeight,
              opacity: stickyOpacity,
              overflow: "hidden",
            }}
          >
            <Svg
              style={StyleSheet.absoluteFill}
              width="100%"
              height={64}
              pointerEvents="none"
            >
              <Defs>
                <SvgLinearGradient
                  id="nhlStickyGrad"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <Stop
                    offset="0%"
                    stopColor={theme.surfaceSecondary}
                    stopOpacity="1"
                  />
                  <Stop
                    offset="55%"
                    stopColor={theme.surfaceSecondary}
                    stopOpacity="1"
                  />
                  <Stop
                    offset="100%"
                    stopColor={teamColor}
                    stopOpacity="0.65"
                  />
                </SvgLinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#nhlStickyGrad)" />
            </Svg>

            <View style={styles.stickyMiniContent}>
              {teamLogo ? (
                <Image
                  cachePolicy="memory-disk"
                  source={{ uri: teamLogo }}
                  style={styles.stickyMiniLogo}
                  resizeMode="contain"
                />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text
                  allowFontScaling={false}
                  style={[styles.stickyMiniName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {team?.name || "NHL Team"}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.stickyMiniLeague,
                    { color: theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  National Hockey League
                </Text>
              </View>
            </View>
          </Animated.View>

          <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={styles.tabBarBtn}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.tabBarText,
                    activeTab === tab
                      ? { color: teamColor, fontWeight: "700" }
                      : { color: theme.textSecondary },
                  ]}
                >
                  {tab}
                </Text>
                {activeTab === tab && (
                  <View
                    style={[
                      styles.tabBarIndicator,
                      { backgroundColor: teamColor },
                    ]}
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.content}>
          {activeTab === "Matches" &&
            (!hasAnyGames ? (
              <View style={styles.emptyContainer}>
                <Text
                  style={[styles.emptyText, { color: theme.textSecondary }]}
                >
                  No matches available
                </Text>
              </View>
            ) : (
              <View style={{ paddingBottom: 8 }}>
                <MatchesSection
                  title="Today"
                  games={todayGames}
                  collapsible={false}
                  navigation={navigation}
                  sport={sport}
                  isDarkMode={isDarkMode}
                  theme={theme}
                  colors={colors}
                  teamColor={teamColor}
                  getLogo={getLogo}
                />
                <MatchesSection
                  title="Last Matches"
                  games={pastGames}
                  collapsible={true}
                  navigation={navigation}
                  sport={sport}
                  isDarkMode={isDarkMode}
                  theme={theme}
                  colors={colors}
                  teamColor={teamColor}
                  getLogo={getLogo}
                />
                <MatchesSection
                  title="Upcoming"
                  games={upcomingGames}
                  collapsible={true}
                  navigation={navigation}
                  sport={sport}
                  isDarkMode={isDarkMode}
                  theme={theme}
                  colors={colors}
                  teamColor={teamColor}
                  getLogo={getLogo}
                />
              </View>
            ))}

          {activeTab === "Team" && (
            <TeamTab teamData={teamData} teamColor={teamColor} theme={theme} />
          )}

          {activeTab === "Stats" && statsContent}

          {activeTab === "Roster" &&
            (() => {
              const roster = teamData?.roster || [];
              if (!roster.length) {
                return (
                  <View style={styles.emptyContainer}>
                    <Text
                      style={[styles.emptyText, { color: theme.textSecondary }]}
                    >
                      No roster available
                    </Text>
                  </View>
                );
              }

              const getPosGroup = (abbr) => {
                const pos = String(abbr || "").toUpperCase();
                if (["C", "L", "LW", "R", "RW", "F"].includes(pos))
                  return "Forwards";
                if (["D", "LD", "RD"].includes(pos)) return "Defensemen";
                if (["G", "GK"].includes(pos)) return "Goalies";
                return "Other";
              };

              const groups = {};
              for (const player of roster) {
                const grp = getPosGroup(player.position?.abbreviation);
                if (!groups[grp]) groups[grp] = [];
                groups[grp].push(player);
              }

              const ordered = [
                "Forwards",
                "Defensemen",
                "Goalies",
                "Other",
              ].filter((k) => Array.isArray(groups[k]) && groups[k].length > 0);

              return (
                <View style={{ paddingBottom: 24 }}>
                  {ordered.map((posType) => (
                    <View key={posType} style={rStyles.posSection}>
                      <View
                        style={[
                          rStyles.posSectionHeader,
                          { backgroundColor: teamColor + "22" },
                        ]}
                      >
                        <Text
                          allowFontScaling={false}
                          style={[
                            rStyles.posSectionTitle,
                            { color: teamColor },
                          ]}
                        >
                          {posType}
                        </Text>
                        <Text
                          allowFontScaling={false}
                          style={[
                            rStyles.posSectionCount,
                            { color: teamColor },
                          ]}
                        >
                          {groups[posType].length}
                        </Text>
                      </View>

                      {groups[posType].map((player, idx) => (
                        <RosterPlayerRow
                          key={player.person?.id || idx}
                          player={player}
                          teamColor={teamColor}
                          theme={theme}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              );
            })()}
        </View>
      </Animated.ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 2,
  },
  headerMain: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  headerLogo: {
    width: 68,
    height: 68,
    marginRight: 14,
  },
  headerLogoFallback: {
    width: 68,
    height: 68,
    borderRadius: 34,
    marginRight: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  headerLogoFallbackText: { fontSize: 28, fontWeight: "800" },
  headerTextBlock: { flex: 1 },
  headerName: { fontSize: 22, fontWeight: "800", marginBottom: 3 },
  headerLeague: { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  headerDivision: { fontSize: 12 },
  stickyMiniContent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  stickyMiniLogo: { width: 32, height: 32, marginRight: 10 },
  stickyMiniName: { fontSize: 15, fontWeight: "700" },
  stickyMiniLeague: { fontSize: 11, fontWeight: "500", marginTop: 1 },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBarBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    position: "relative",
  },
  tabBarText: { fontSize: 13 },
  tabBarIndicator: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    height: 2.5,
    borderRadius: 2,
  },
  content: { paddingBottom: 40, paddingTop: 6 },
  emptyContainer: { alignItems: "center", paddingVertical: 56 },
  emptyText: { fontSize: 15 },
  matchCardWrap: {
    marginHorizontal: 12,
    marginTop: 10,
    position: "relative",
    overflow: "visible",
  },
  matchCard: {
    borderRadius: 12,
    overflow: "hidden",
  },
  matchGameBadge: {
    position: "absolute",
    top: -8,
    right: 8,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    zIndex: 2,
  },
  matchGameBadgeText: { fontSize: 10, fontWeight: "700" },
  matchCardInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  matchStatusCol: {
    width: 72,
    alignItems: "center",
  },
  matchDateText: {
    fontSize: 11,
    textAlign: "center",
    marginBottom: 4,
    lineHeight: 15,
  },
  matchStatusText: { fontSize: 12, textAlign: "center" },
  matchTeamsList: { flex: 1 },
  matchTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  matchTeamDivider: { height: StyleSheet.hairlineWidth, marginLeft: 32 },
  matchLogoWrap: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  matchTeamLogo: { width: 24, height: 24 },
  matchTeamLogoFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  matchLogoFallbackText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  matchTeamName: { flex: 1, fontSize: 14 },
  matchScoreText: { fontSize: 16, minWidth: 26, textAlign: "right" },
  matchChevron: { fontSize: 24, lineHeight: 28, paddingLeft: 4 },
});

export default TeamPageScreen;

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Animated,
  RefreshControl,
  Dimensions,
} from "react-native";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
} from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import { MLBService } from "../../services/MLBService";

const { width } = Dimensions.get("window");
// Roster stat chip sizing (account for margins/padding of bubble + dropdown)
const STAT_CHIP_COLS = 3;
const STAT_CHIP_GAP = 8;
const STAT_CHIP_W =
  (width - 2 * 12 - 2 * 14 - STAT_CHIP_GAP * (STAT_CHIP_COLS - 1)) /
  STAT_CHIP_COLS;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getTextOnColor = (hex) => {
  if (!hex) return "#FFFFFF";
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#000000" : "#FFFFFF";
};

const formatDate = (dateStr) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

const formatTime = (dateStr) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
};

// Get today's date string (YYYY-MM-DD) in the device's local timezone.
// If the local time is before 2am, treat it as the previous day's schedule.
const getTodayDateStr = () => {
  try {
    const now = new Date();
    // en-CA locale produces YYYY-MM-DD directly and uses device timezone by default
    const localToday = now.toLocaleDateString("en-CA");
    // If before 2am local time, treat it as still the previous day's schedule
    const localHour = now.getHours();
    if (localHour < 2) {
      const prev = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return prev.toLocaleDateString("en-CA");
    }
    return localToday;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

// Convert a UTC game timestamp (e.g. "2026-04-05T18:10:00Z") to its local date string (YYYY-MM-DD)
const gameToEstDateStr = (gameDate) => {
  if (!gameDate) return "";
  try {
    // new Date(...) creates a Date in the correct instant; toLocaleDateString without
    // a timeZone option will render it using the device's timezone
    return new Date(gameDate).toLocaleDateString("en-CA");
  } catch {
    return (gameDate ?? "").slice(0, 10);
  }
};

// Get the display label for a game card badge
const getGameLabel = (game) => {
  if (game.description) {
    const d = game.description.trim();
    return d.charAt(0).toUpperCase() + d.slice(1);
  }
  if (game.gameType !== "R" && game.seriesDescription) {
    return game.seriesDescription;
  }
  return null;
};

const TABS = ["Team", "Matches", "Stats", "Roster"];

// ─── Team stats helpers ───────────────────────────────────────────────────────

// For hitting: only strikeouts are penalised
const HITTING_LOWER_IS_BETTER = new Set(["Strike Outs"]);

// For pitching: opponent-facing counting/rate stats are all lower-is-better
const PITCHING_LOWER_IS_BETTER = new Set([
  "Runs",
  "Hits",
  "Doubles",
  "Triples",
  "Home Runs",
  "Base On Balls",
  "Avg",
  "At Bats",
  "Obp",
  "Slg",
  "Ops",
  "Stolen Bases",
  "Total Bases",
  "Rbi",
]);

// Build rows from the stat object returned by the /bb/team endpoint.
// Each stat entry has the shape { teamValue, rank, min, max }.
const buildTeamStatRows = (statObj, lowerSet) => {
  if (!statObj) return [];
  return Object.entries(statObj)
    .filter(([, info]) => info?.teamValue != null)
    .map(([key, info]) => {
      const n = parseFloat(info.teamValue);
      const minVal = parseFloat(info.min);
      const maxVal = parseFloat(info.max);
      const isLower = lowerSet.has(key);
      let pct = 0;
      if (!isNaN(n) && !isNaN(minVal) && !isNaN(maxVal) && maxVal !== minVal) {
        const norm = (n - minVal) / (maxVal - minVal);
        pct = isLower ? 1 - norm : norm;
        pct = Math.max(0, Math.min(1, pct));
      }
      return { key, label: key, value: String(info.teamValue), pct, isLower };
    });
};

// ─── Stats bubble (collapsible) ───────────────────────────────────────────────

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

// ─── Roster player row ────────────────────────────────────────────────────────

const RosterPlayerRow = ({ player, teamColor, theme }) => {
  const [expanded, setExpanded] = useState(false);
  const personId = player.person?.id;
  const headshotUrl = personId
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${personId}/headshot/67/current`
    : null;
  const [headshotError, setHeadshotError] = useState(false);
  const statEntries = Object.entries(player.stats ?? {}).filter(
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
            {player.person?.fullName ?? ""}
          </Text>
          <Text
            allowFontScaling={false}
            style={[rStyles.playerMeta, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {player.position?.name ?? ""} • #{player.jerseyNumber ?? ""}
          </Text>
        </View>
        <Text
          allowFontScaling={false}
          style={[rStyles.statusText, { color: statusColor }]}
          numberOfLines={2}
        >
          {player.status?.description ?? ""}
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

// ─── Team tab (standings + coaches) ────────────────────────────────────────────

const TeamTab = ({ teamData, teamId, teamColor, theme }) => {
  const standingsRecords = teamData?.standings?.records ?? [];
  const coaches = teamData?.coaches?.coaches ?? [];

  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 24,
        gap: 12,
      }}
    >
      {/* ── Standings ── */}
      {standingsRecords.map((record, rIdx) => {
        const rows = record.teamRecords ?? [];
        const divName = record.division?.name ?? "Standings";
        return (
          <View
            key={rIdx}
            style={[ttStyles.bubble, { backgroundColor: theme.surface }]}
          >
            <Text
              allowFontScaling={false}
              style={[ttStyles.sectionTitle, { color: teamColor }]}
            >
              {divName}
            </Text>
            {/* header row */}
            <View style={ttStyles.standingHeaderRow}>
              <Text
                style={[
                  ttStyles.colTeam,
                  ttStyles.colHeader,
                  { color: theme.textSecondary },
                ]}
              >
                Team
              </Text>
              <Text
                style={[
                  ttStyles.colStat,
                  ttStyles.colHeader,
                  { color: theme.textSecondary },
                ]}
              >
                W
              </Text>
              <Text
                style={[
                  ttStyles.colStat,
                  ttStyles.colHeader,
                  { color: theme.textSecondary },
                ]}
              >
                L
              </Text>
              <Text
                style={[
                  ttStyles.colStat,
                  ttStyles.colHeader,
                  { color: theme.textSecondary },
                ]}
              >
                GB
              </Text>
              <Text
                style={[
                  ttStyles.colStat,
                  ttStyles.colHeader,
                  { color: theme.textSecondary },
                ]}
              >
                Rank
              </Text>
            </View>
            {rows.map((tr, i) => {
              const isThis =
                tr.team?.id === teamId || tr.team?.id === Number(teamId);
              const overallRecs = tr.records?.overallRecords ?? [];
              const homeRec = overallRecs.find((r) => r.type === "home");
              const awayRec = overallRecs.find((r) => r.type === "away");
              const xwl = tr.records?.expectedRecords?.find(
                (r) => r.type === "xWinLoss",
              );
              const xwlStr = xwl ? `${xwl.wins}-${xwl.losses}` : "—";
              const homeStr = homeRec
                ? `${homeRec.wins}-${homeRec.losses}`
                : "—";
              const awayStr = awayRec
                ? `${awayRec.wins}-${awayRec.losses}`
                : "—";
              const streakCode = tr.streak?.streakCode ?? "";
              const runDiff = (tr.runsScored ?? 0) - (tr.runsAllowed ?? 0);
              const runDiffStr = runDiff > 0 ? `+${runDiff}` : String(runDiff);
              const streakColor = streakCode.startsWith("W")
                ? (theme.success ?? "#4CAF50")
                : streakCode.startsWith("L")
                  ? (theme.error ?? "#E53935")
                  : theme.textSecondary;
              const diffColor =
                runDiff > 0
                  ? (theme.success ?? "#4CAF50")
                  : runDiff < 0
                    ? (theme.error ?? "#E53935")
                    : theme.textSecondary;
              const rowColor = isThis ? teamColor : theme.text;
              const rowMeta = isThis ? teamColor : theme.textSecondary;
              return (
                <View
                  key={tr.team?.id ?? i}
                  style={[
                    ttStyles.standingRow,
                    isThis && { backgroundColor: teamColor + "18" },
                    i < rows.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: theme.border,
                    },
                  ]}
                >
                  {/* main record line */}
                  <View style={ttStyles.standingRowInner}>
                    <Text
                      allowFontScaling={false}
                      style={[
                        ttStyles.colTeam,
                        { color: rowColor, fontWeight: isThis ? "700" : "400" },
                      ]}
                      numberOfLines={1}
                    >
                      {tr.team?.name ?? ""}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[
                        ttStyles.colStat,
                        { color: rowColor, fontWeight: isThis ? "700" : "400" },
                      ]}
                    >
                      {tr.wins ?? "-"}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[
                        ttStyles.colStat,
                        { color: rowColor, fontWeight: isThis ? "700" : "400" },
                      ]}
                    >
                      {tr.losses ?? "-"}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[ttStyles.colStat, { color: rowMeta }]}
                    >
                      {tr.leagueGamesBack ?? "-"}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[ttStyles.colStat, { color: rowMeta }]}
                    >
                      {tr.divisionRank ?? "-"}
                    </Text>
                  </View>

                  {/* secondary stats chips */}
                  <View style={ttStyles.secRow}>
                    {[
                      { label: "Home", value: homeStr, color: rowMeta },
                      { label: "Away", value: awayStr, color: rowMeta },
                      { label: "xWL", value: xwlStr, color: rowMeta },
                      {
                        label: "Streak",
                        value: streakCode || "—",
                        color: streakColor,
                      },
                      {
                        label: "Diff",
                        value: runDiff === 0 ? "0" : runDiffStr,
                        color: diffColor,
                      },
                    ].map(({ label, value, color }) => (
                      <View key={label} style={ttStyles.secChip}>
                        <Text
                          allowFontScaling={false}
                          style={[ttStyles.secValue, { color }]}
                        >
                          {value}
                        </Text>
                        <Text
                          allowFontScaling={false}
                          style={[
                            ttStyles.secLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}

      {/* ── Coaches ── */}
      {coaches.length > 0 && (
        <View style={[ttStyles.bubble, { backgroundColor: theme.surface }]}>
          <Text
            allowFontScaling={false}
            style={[ttStyles.sectionTitle, { color: teamColor }]}
          >
            Coaches
          </Text>
          {coaches.map((coach, i) => (
            <View
              key={i}
              style={[
                ttStyles.coachRow,
                i < coaches.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.border,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  allowFontScaling={false}
                  style={[ttStyles.coachName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {coach.fullName ?? ""}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[ttStyles.coachJob, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {coach.job ?? ""}
                </Text>
              </View>
              <Text
                allowFontScaling={false}
                style={[ttStyles.coachJersey, { color: teamColor }]}
              >
                #{coach.jerseyNumber ?? ""}
              </Text>
            </View>
          ))}
        </View>
      )}

      {standingsRecords.length === 0 && coaches.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 56 }}>
          <Text style={{ fontSize: 15, color: theme.textSecondary }}>
            No team info available
          </Text>
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
  standingHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.2)",
  },
  standingRow: {
    flexDirection: "column",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  standingRowInner: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  secRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  secChip: {
    alignItems: "center",
    minWidth: 44,
  },
  secValue: { fontSize: 12, fontWeight: "700" },
  secLabel: {
    fontSize: 10,
    fontWeight: "500",
    marginTop: 1,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  colHeader: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  colTeam: { flex: 1, fontSize: 13, paddingRight: 6 },
  colStat: { width: 34, textAlign: "center", fontSize: 13 },
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

// ─── Match card ───────────────────────────────────────────────────────────────

const MatchCard = ({
  game,
  idx,
  navigation,
  sport,
  isDarkMode,
  theme,
  colors,
  teamColor,
}) => {
  const label = getGameLabel(game);
  const away = game.teams?.away?.team ?? {};
  const home = game.teams?.home?.team ?? {};
  const awayScore = game.teams?.away?.score;
  const homeScore = game.teams?.home?.score;
  const awayRecord = game.teams?.away?.leagueRecord;
  const homeRecord = game.teams?.home?.leagueRecord;

  const state = game.status?.codedGameState ?? "";
  const isLive = ["I", "MA", "MC"].includes(state);
  const isScheduled = ["S", "P"].includes(state);
  const isFinished = !isLive && !isScheduled && !!state;

  const awayId = away.id ?? away.teamId;
  const homeId = home.id ?? home.teamId;
  const awayLogo = MLBService.getTeamLogo(awayId, isDarkMode);
  const homeLogo = MLBService.getTeamLogo(homeId, isDarkMode);
  const awayColor = MLBService.getTeamColorById(awayId) || colors.primary;
  const homeColor = MLBService.getTeamColorById(homeId) || colors.secondary;
  const awayWinner =
    isFinished &&
    awayScore != null &&
    homeScore != null &&
    awayScore > homeScore;
  const homeWinner =
    isFinished &&
    homeScore != null &&
    awayScore != null &&
    homeScore > awayScore;

  const statusLabel = isScheduled
    ? formatTime(game.gameDate)
    : isLive
      ? "LIVE"
      : game.status?.detailedState?.includes("Final")
        ? "Final"
        : (game.status?.detailedState ?? "").slice(0, 8);

  const gradId = `mg_${idx}`;

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
            sport: sport ?? "mlb",
            gamePk: game.gamePk,
          })
        }
        activeOpacity={0.75}
      >
        {/* Subtle gradient backdrop */}
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
          {/* Date / status column */}
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
                  : { color: theme.textTertiary ?? theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {statusLabel}
            </Text>
          </View>

          {/* Teams column */}
          <View style={styles.matchTeamsList}>
            {/* Away */}
            <View style={styles.matchTeamRow}>
              <View style={styles.matchLogoWrap}>
                {awayLogo ? (
                  <Image
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
                      {(away.abbreviation ?? away.name ?? "A").charAt(0)}
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
                {away.name ?? "Away"}
              </Text>
              {awayRecord != null && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.matchRecord,
                    { color: theme.textTertiary ?? theme.textSecondary },
                  ]}
                >
                  {awayRecord.wins}-{awayRecord.losses}
                </Text>
              )}
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

            {/* Divider */}
            <View
              style={[
                styles.matchTeamDivider,
                { backgroundColor: theme.border },
              ]}
            />

            {/* Home */}
            <View style={styles.matchTeamRow}>
              <View style={styles.matchLogoWrap}>
                {homeLogo ? (
                  <Image
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
                      {(home.abbreviation ?? home.name ?? "H").charAt(0)}
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
                {home.name ?? "Home"}
              </Text>
              {homeRecord != null && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.matchRecord,
                    { color: theme.textTertiary ?? theme.textSecondary },
                  ]}
                >
                  {homeRecord.wins}-{homeRecord.losses}
                </Text>
              )}
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

          {/* Chevron */}
          <Text
            style={[
              styles.matchChevron,
              { color: theme.textTertiary ?? theme.textSecondary },
            ]}
          >
            ›
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

// ─── Matches section (collapsible) ───────────────────────────────────────────

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
}) => {
  const [expanded, setExpanded] = useState(false);
  if (games.length === 0) return null;
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
          key={game.gamePk ?? idx}
          game={game}
          idx={idx}
          navigation={navigation}
          sport={sport ?? "mlb"}
          isDarkMode={isDarkMode}
          theme={theme}
          colors={colors}
          teamColor={teamColor}
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

// ─── Main screen ──────────────────────────────────────────────────────────────

const TeamPageScreen = ({ route, navigation }) => {
  const { teamId, sport } = route.params ?? {};
  const { theme, colors, isDarkMode } = useTheme();

  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("Team");
  const [hitExpanded, setHitExpanded] = useState(false);
  const [pitExpanded, setPitExpanded] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(180);

  const scrollY = useRef(new Animated.Value(0)).current;

  const resolvedId = teamId;
  const teamColor = MLBService.getTeamColorById(resolvedId) || colors.primary;
  const teamLogo = MLBService.getTeamLogo(resolvedId, isDarkMode);

  const loadTeam = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await MLBService.getTeam(resolvedId);
        const d = res?.data ?? null;
        setTeamData(d);
      } catch (e) {
        console.error("TeamPage load error:", e);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [resolvedId],
  );

  useEffect(() => {
    loadTeam(false);
  }, [loadTeam]);

  const team = teamData?.team ?? null;

  // Pick the most recent year's stats (current year preferred, then prior year)
  const pickStatYear = (group) => {
    if (!group) return null;
    const year = new Date().getFullYear();
    if (group[String(year)]) return group[String(year)].stat ?? null;
    if (group[String(year - 1)]) return group[String(year - 1)].stat ?? null;
    const firstKey = Object.keys(group)[0];
    return firstKey ? (group[firstKey].stat ?? null) : null;
  };

  const hitStat = pickStatYear(teamData?.stats?.hitting);
  const pitStat = pickStatYear(teamData?.stats?.pitching);
  const hasHit = !!hitStat;
  const hasPit = !!pitStat;

  const hitRows = buildTeamStatRows(hitStat, HITTING_LOWER_IS_BETTER);
  const pitRows = buildTeamStatRows(pitStat, PITCHING_LOWER_IS_BETTER);

  let statsContent;
  if (!hasHit && !hasPit) {
    statsContent = (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          No stats available
        </Text>
      </View>
    );
  } else {
    statsContent = (
      <View
        style={{
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 24,
          gap: 12,
        }}
      >
        {hasHit && (
          <StatBubble
            title="Hitting"
            rows={hitRows}
            expanded={hitExpanded}
            onToggle={() => setHitExpanded((v) => !v)}
            teamColor={teamColor}
            theme={theme}
          />
        )}
        {hasPit && (
          <StatBubble
            title="Pitching"
            rows={pitRows}
            expanded={pitExpanded}
            onToggle={() => setPitExpanded((v) => !v)}
            teamColor={teamColor}
            theme={theme}
          />
        )}
      </View>
    );
  }

  // Split games into today / past / upcoming
  const todayStr = getTodayDateStr();
  const allGamesList = (teamData?.schedule?.dates ?? []).flatMap(
    (d) => d.games ?? [],
  );
  const todayGames = allGamesList.filter(
    (g) => gameToEstDateStr(g.gameDate) === todayStr,
  );
  const pastGames = allGamesList
    .filter((g) => gameToEstDateStr(g.gameDate) < todayStr)
    .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));
  const upcomingGames = allGamesList
    .filter((g) => gameToEstDateStr(g.gameDate) > todayStr)
    .sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
  const hasAnyGames =
    todayGames.length + pastGames.length + upcomingGames.length > 0;

  // Scroll-driven animations
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
        {/* ── [0] HERO HEADER ─────────────────────────────────────────────── */}
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
          {/* Logo + name block */}
          <View style={styles.headerMain}>
            {teamLogo ? (
              <Image
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
                  {(team?.abbreviation ?? "?").charAt(0)}
                </Text>
              </View>
            )}
            <View style={styles.headerTextBlock}>
              <Text
                allowFontScaling={false}
                style={[styles.headerName, { color: teamColor }]}
                numberOfLines={1}
              >
                {team?.name ?? ""}
              </Text>
              {team?.league?.name ? (
                <Text
                  allowFontScaling={false}
                  style={[styles.headerLeague, { color: teamColor + "BB" }]}
                  numberOfLines={1}
                >
                  {team.league.name}
                </Text>
              ) : null}
              {team?.division?.name ? (
                <Text
                  allowFontScaling={false}
                  style={[styles.headerDivision, { color: teamColor + "99" }]}
                  numberOfLines={1}
                >
                  {team.division.name}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── [1] STICKY UNIT ─────────────────────────────────────────────── */}
        <View style={{ backgroundColor: theme.surface }}>
          {/* Mini team banner — slides in as you scroll past the hero */}
          <Animated.View
            style={{
              height: stickyMiniHeight,
              opacity: stickyOpacity,
              overflow: "hidden",
            }}
          >
            {/* Gradient: far left=surfaceSecondary → far right=teamColor */}
            <Svg
              style={StyleSheet.absoluteFill}
              width="100%"
              height={64}
              pointerEvents="none"
            >
              <Defs>
                <SvgLinearGradient id="sGrad" x1="0%" y1="0%" x2="100%" y2="0%">
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
              <Rect width="100%" height="100%" fill="url(#sGrad)" />
            </Svg>

            <View style={styles.stickyMiniContent}>
              {teamLogo ? (
                <Image
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
                  {team?.name ?? ""}
                </Text>
                {team?.league?.name ? (
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.stickyMiniLeague,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {team.league.name}
                  </Text>
                ) : null}
              </View>
            </View>
          </Animated.View>

          {/* Tab underline bar */}
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

        {/* ── CONTENT ─────────────────────────────────────────────────────── */}
        <View style={styles.content}>
          {/* MATCHES */}
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
                  sport={sport ?? "mlb"}
                  isDarkMode={isDarkMode}
                  theme={theme}
                  colors={colors}
                  teamColor={teamColor}
                />
                <MatchesSection
                  title="Last Matches"
                  games={pastGames}
                  collapsible={true}
                  navigation={navigation}
                  sport={sport ?? "mlb"}
                  isDarkMode={isDarkMode}
                  theme={theme}
                  colors={colors}
                  teamColor={teamColor}
                />
                <MatchesSection
                  title="Upcoming"
                  games={upcomingGames}
                  collapsible={true}
                  navigation={navigation}
                  sport={sport ?? "mlb"}
                  isDarkMode={isDarkMode}
                  theme={theme}
                  colors={colors}
                  teamColor={teamColor}
                />
              </View>
            ))}

          {/* TEAM */}
          {activeTab === "Team" && (
            <TeamTab
              teamData={teamData}
              teamId={resolvedId}
              teamColor={teamColor}
              theme={theme}
            />
          )}

          {/* STATS */}
          {activeTab === "Stats" && statsContent}

          {/* ROSTER */}
          {activeTab === "Roster" &&
            (() => {
              const roster = teamData?.roster ?? [];
              if (roster.length === 0) {
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
                if (!abbr) return "Other";
                if (abbr === "P" || abbr === "SP" || abbr === "RP")
                  return "Pitcher";
                if (abbr === "C") return "Catcher";
                if (["1B", "2B", "3B", "SS", "IF"].includes(abbr))
                  return "Infielder";
                if (["LF", "CF", "RF", "OF"].includes(abbr))
                  return "Outfielder";
                if (abbr === "DH") return "Designated Hitter";
                if (abbr === "TWP") return "Two-Way Player";
                return "Other";
              };
              const POSITION_ORDER = [
                "Catcher",
                "Infielder",
                "Outfielder",
                "Designated Hitter",
                "Two-Way Player",
                "Pitcher",
                "Other",
              ];
              const groups = {};
              for (const player of roster) {
                const grp = getPosGroup(player.position?.abbreviation);
                if (!groups[grp]) groups[grp] = [];
                groups[grp].push(player);
              }
              const sortedKeys = Object.keys(groups).sort((a, b) => {
                if (a === "Pitcher") return 1;
                if (b === "Pitcher") return -1;
                const ai = POSITION_ORDER.indexOf(a);
                const bi = POSITION_ORDER.indexOf(b);
                return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
              });
              const posLabel = (grp) => {
                if (grp === "Pitcher") return "Pitchers";
                if (grp === "Catcher") return "Catchers";
                if (grp === "Infielder") return "Infielders";
                if (grp === "Outfielder") return "Outfielders";
                if (grp === "Designated Hitter") return "Designated Hitters";
                if (grp === "Two-Way Player") return "Two-Way Players";
                return grp;
              };
              return (
                <View style={{ paddingBottom: 24 }}>
                  {sortedKeys.map((posType) => (
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
                          {posLabel(posType)}
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
                          key={player.person?.id ?? idx}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Hero header
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

  // Tab pills (hero header)
  tabPills: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  tabPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  tabPillText: { fontSize: 13, fontWeight: "600" },

  // Sticky mini header
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

  // Tab underline bar (sticky)
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

  // Content
  content: { paddingBottom: 40, paddingTop: 6 },
  emptyContainer: { alignItems: "center", paddingVertical: 56 },
  emptyText: { fontSize: 15 },

  // Match cards
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
  matchRecord: { fontSize: 11, marginRight: 2 },
  matchScoreText: { fontSize: 16, minWidth: 26, textAlign: "right" },
  matchChevron: { fontSize: 24, lineHeight: 28, paddingLeft: 4 },
});

export default TeamPageScreen;

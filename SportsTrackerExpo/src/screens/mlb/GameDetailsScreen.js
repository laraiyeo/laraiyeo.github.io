import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  View,
  Text,
  ScrollView,
  Animated,
  FlatList,
  Modal,
  PanResponder,
  StyleSheet,
  ActivityIndicator,
  Image,
  Dimensions,
  RefreshControl,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
} from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Path,
  G,
} from "react-native-svg";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import WBCService from "../../services/WBCService";
import { useGamePresence } from "../../hooks/useGamePresence";
import { useStreamingAccess } from "../../utils/streamingUtils";
import { WebView } from "react-native-webview";
import { useNavigation } from "@react-navigation/native";

const { width } = Dimensions.get("window");
const SCREEN_SPORT = "mlb";

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
const TeamColumn = ({
  status,
  team,
  score,
  isWinner,
  side,
  isDarkMode,
  theme,
  scoreOpacity,
  onPress,
}) => {
  const logo = WBCService.getTeamLogo(team?.id, isDarkMode);
  const isLive = !["S", "P", "D", "C", "O", "F", "Q", "R"].includes(
    status?.codedGameState,
  );

  return (
    <View style={[styles.teamColumn, { alignItems: "center" }]}>
      {score != null && (
        <Animated.Text
          style={[
            styles.teamScore,
            {
              color: isLive
                ? theme.text
                : isWinner
                  ? theme.text
                  : theme.textSecondary,
              fontWeight: isLive ? "800" : isWinner ? "800" : "400",
              opacity: scoreOpacity ?? 1,
            },
          ]}
        >
          {score}
        </Animated.Text>
      )}
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
        style={{ alignItems: "center", alignSelf: "stretch" }}
      >
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
        <Text
          style={[styles.teamName, { color: theme.text }]}
          numberOfLines={2}
        >
          {team?.name || "—"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Player headshot URL ────────────────────────────────────────────────────────
const playerHeadshotUrl = (playerId) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`;

// Resolve a player entry from `gameData.players` which can sometimes be
// keyed either as `ID<id>` or by the numeric/id string. Production payloads
// have varied historically, so accept both forms.
const resolvePlayer = (playersMap, id) => {
  if (!playersMap || id == null) return null;
  return (
    playersMap[`ID${id}`] ?? playersMap[String(id)] ?? playersMap[id] ?? null
  );
};

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
  { key: "runs", label: "R" },
  { key: "baseOnBalls", label: "BB" },
  { key: "strikeOuts", label: "K" },
  { key: "numberOfPitches", label: "NP" },
];

// ─── Individual player card ───────────────────────────────────────────────────
const PlayerCard = ({
  playerId,
  playerInfo,
  bsPlayer,
  theme,
  teamColor,
  onPress,
}) => {
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
  const number = bsPlayer?.jerseyNumber ? `#${bsPlayer.jerseyNumber}` : "";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        pcStyles.card,
        {
          backgroundColor: theme.surface,
          borderColor: teamColor ?? theme.border,
        },
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
    </TouchableOpacity>
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
    fontSize: 13,
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
const BoxScorePanel = ({
  bsTeamData,
  playersMap,
  theme,
  colors,
  teamColor,
  team,
  boxscore,
  pitchesData,
  awayTeam,
  homeTeam,
  awayScore,
  homeScore,
  isScheduled,
  isFinished,
  gameDateTime,
}) => {
  const bsPlayers = bsTeamData?.players ?? {};
  const allBsPlayers = {
    ...(boxscore?.teams?.away?.players ?? {}),
    ...(boxscore?.teams?.home?.players ?? {}),
  };
  const battingOrder = bsTeamData?.battingOrder ?? [];

  // For scheduled games: use the explicit roster arrays if the API populated them.
  const scheduledBatterIds = bsTeamData?.batters ?? [];
  const scheduledPitcherIds = bsTeamData?.pitchers ?? [];
  const scheduledBenchIds = bsTeamData?.bench ?? [];
  const hasScheduledLineup =
    isScheduled &&
    (scheduledBatterIds.length > 0 || scheduledPitcherIds.length > 0);

  const [section, setSection] = useState(() => {
    if (!isScheduled) return "batting";
    return scheduledBatterIds.length > 0 ? "batting" : "bench";
  });
  const [selectedPlayer, setSelectedPlayer] = useState(null); // { playerId, playerInfo, bsPlayer }

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

  // Bench: everyone not in the batting order and not a pitcher
  const activeSets = new Set([
    ...batterIds.map(Number),
    ...pitcherIds.map(Number),
  ]);
  const rawBenchIds = Object.keys(bsPlayers)
    .map((k) => Number(k.replace("ID", "")))
    .filter((id) => !activeSets.has(id));

  // Sort bench: batters (AB > 0) by AB desc → pitchers (pitching stats) by IP desc → rest
  const benchGetAB = (id) => bsPlayers[`ID${id}`]?.stats?.batting?.atBats ?? 0;
  const benchGetIP = (id) =>
    parseFloat(bsPlayers[`ID${id}`]?.stats?.pitching?.inningsPitched ?? 0);
  const benchHasBat = (id) => benchGetAB(id) > 0;
  const benchHasPit = (id) =>
    !benchHasBat(id) &&
    Object.keys(bsPlayers[`ID${id}`]?.stats?.pitching ?? {}).length > 0;
  const benchBatters = rawBenchIds
    .filter(benchHasBat)
    .sort((a, b) => benchGetAB(b) - benchGetAB(a));
  const benchPitchers = rawBenchIds
    .filter(benchHasPit)
    .sort((a, b) => benchGetIP(b) - benchGetIP(a));
  const benchOthers = rawBenchIds.filter(
    (id) => !benchHasBat(id) && !benchHasPit(id),
  );
  // Finished: hide no-stats players. Live/pre-game: show all (no-stats at bottom).
  const benchIds = isFinished
    ? [...benchBatters, ...benchPitchers]
    : [...benchBatters, ...benchPitchers, ...benchOthers];

  // Resolve which IDs to show for the active section.
  let ids;
  if (isScheduled) {
    if (hasScheduledLineup) {
      if (section === "batting") ids = scheduledBatterIds;
      else if (section === "pitching") ids = scheduledPitcherIds;
      else ids = scheduledBenchIds;
    } else {
      // No lineup data — show the raw bench list from the payload
      ids = scheduledBenchIds.length > 0 ? scheduledBenchIds : benchIds;
    }
  } else {
    ids =
      section === "batting"
        ? batterIds
        : section === "pitching"
          ? pitcherIds
          : benchIds;
  }

  return (
    <View style={{ paddingBottom: 24 }}>
      {/* Section toggle — hidden when scheduled with no lineup data */}
      {(!isScheduled || hasScheduledLineup) && (
        <View style={bsStyles.sectionToggle}>
          {["batting", "pitching", "bench"].map((s) => (
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
                {s === "batting"
                  ? "Batting"
                  : s === "pitching"
                    ? "Pitching"
                    : "Bench"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Player cards */}
      {ids.map((id) => (
        <PlayerCard
          key={id}
          playerId={id}
          playerInfo={resolvePlayer(playersMap, id)}
          bsPlayer={bsPlayers[`ID${id}`] ?? null}
          theme={theme}
          teamColor={teamColor}
          onPress={() =>
            setSelectedPlayer({
              playerId: id,
              playerInfo: resolvePlayer(playersMap, id),
              bsPlayer: bsPlayers[`ID${id}`] ?? null,
            })
          }
        />
      ))}

      {ids.length === 0 && (
        <Text style={[bsStyles.empty, { color: theme.textSecondary }]}>
          No {section} data available.
        </Text>
      )}

      {/* Player detail modal */}
      <PlayerDetailModal
        visible={selectedPlayer != null}
        onClose={() => setSelectedPlayer(null)}
        playerId={selectedPlayer?.playerId}
        playerInfo={selectedPlayer?.playerInfo}
        bsPlayer={selectedPlayer?.bsPlayer}
        teamColor={teamColor}
        teamName={team?.name ?? ""}
        teamId={team?.id}
        allBsPlayers={allBsPlayers}
        pitchesData={pitchesData}
        awayTeam={awayTeam}
        homeTeam={homeTeam}
        awayScore={awayScore}
        homeScore={homeScore}
        gameDate={gameDateTime}
        theme={theme}
        colors={colors}
      />
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

// ─── Batter pitch map helpers ────────────────────────────────────────────────
const BPM_W = 240;
const BPM_H = 220;
const BPM_X_MIN = -2.5;
const BPM_X_MAX = 2.5;
const BPM_Y_MIN = 0.0;
const BPM_Y_MAX = 6.0;
const BPM_PLATE_HALF = 0.7083; // 17 in / 2 ≈ 0.708 ft
const BPM_BALL_R = 8;

const parseBatterPitches = (playerPitchData) => {
  if (!playerPitchData?.byType) return [];
  const result = [];
  Object.entries(playerPitchData.byType).forEach(([pitchType, info]) => {
    const coords = info?.coordinates ?? "";
    coords.split(";").forEach((segment) => {
      const s = segment.trim();
      if (!s) return;
      const colonIdx = s.indexOf(":");
      if (colonIdx === -1) return;
      const num = parseInt(s.substring(0, colonIdx), 10);
      const rest = s.substring(colonIdx + 1);
      const parts = rest.split(",");
      if (parts.length < 3) return;
      const pX = parseFloat(parts[0]);
      const pZ = parseFloat(parts[1]);
      const code = parts[2].trim();
      if (!isNaN(pX) && !isNaN(pZ))
        result.push({ num, pitchType, pX, pZ, code });
    });
  });
  result.sort((a, b) => a.num - b.num);
  return result;
};

const BPM_CALL_COLORS = {
  B: "#4CAF50",
  "*B": "#492300",
  C: "#E53935",
  S: "#E53935",
  T: "#E53935",
  W: "#E53935",
  F: "#FF9800",
  X: "#2196F3",
  E: "#2196F3",
  D: "#2196F3",
  H: "#9C27B0",
};

const BPM_CALL_LABELS = {
  B: "Ball",
  "*B": "Ball",
  C: "Called Strike",
  S: "Swinging Strike",
  T: "Foul Tip",
  F: "Foul",
  X: "In Play",
  E: "In Play",
  D: "In Play",
  H: "HBP",
};

const BatterPitchMapView = ({ playerPitchData, teamColor, theme }) => {
  const allPitches = useMemo(
    () => parseBatterPitches(playerPitchData),
    [playerPitchData],
  );
  const [selTypes, setSelTypes] = useState(new Set());
  const [selCodes, setSelCodes] = useState(new Set());

  const pitchTypes = useMemo(() => {
    const s = new Set();
    allPitches.forEach((p) => s.add(p.pitchType));
    return [...s];
  }, [allPitches]);

  const callCodes = useMemo(() => {
    const s = new Set();
    allPitches.forEach((p) => s.add(p.code));
    return [...s];
  }, [allPitches]);

  const visiblePitches = useMemo(
    () =>
      allPitches.filter((p) => {
        if (selTypes.size > 0 && !selTypes.has(p.pitchType)) return false;
        if (selCodes.size > 0 && !selCodes.has(p.code)) return false;
        return true;
      }),
    [allPitches, selTypes, selCodes],
  );

  const szTop = playerPitchData?.strikeZone?.maxTop ?? 3.5;
  const szBot = playerPitchData?.strikeZone?.minBottom ?? 1.5;
  const xRange = BPM_X_MAX - BPM_X_MIN;
  const yRange = BPM_Y_MAX - BPM_Y_MIN;
  const szRectLeft = ((-BPM_PLATE_HALF - BPM_X_MIN) / xRange) * BPM_W;
  const szRectWidth = ((BPM_PLATE_HALF * 2) / xRange) * BPM_W;
  const szRectTop = ((BPM_Y_MAX - szTop) / yRange) * BPM_H;
  const szRectHeight = ((szTop - szBot) / yRange) * BPM_H;

  const toggleType = (t) =>
    setSelTypes((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });

  // Group codes that share the same human-readable label so we never show
  // two buttons with the same name (e.g. X, E, D all mean "In Play").
  const callGroups = useMemo(() => {
    const map = new Map(); // label → { label, codes[], color }
    callCodes.forEach((code) => {
      const label = BPM_CALL_LABELS[code] ?? code;
      if (!map.has(label)) {
        map.set(label, {
          label,
          codes: [],
          color: BPM_CALL_COLORS[code] ?? "#9E9E9E",
        });
      }
      map.get(label).codes.push(code);
    });
    return [...map.values()];
  }, [callCodes]);

  const toggleGroup = (group) =>
    setSelCodes((prev) => {
      const next = new Set(prev);
      const anyActive = group.codes.some((c) => next.has(c));
      if (anyActive) {
        group.codes.forEach((c) => next.delete(c));
      } else {
        group.codes.forEach((c) => next.add(c));
      }
      return next;
    });

  if (allPitches.length === 0)
    return (
      <View style={{ alignItems: "center", paddingTop: 40, paddingBottom: 24 }}>
        <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
          No pitch data available
        </Text>
      </View>
    );

  return (
    <View>
      {/* Strike zone chart */}
      <View style={{ alignItems: "center", marginBottom: 12 }}>
        <View
          style={[
            bpmStyles.chart,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          {/* Strike zone rectangle */}
          <View
            style={[
              bpmStyles.szRect,
              {
                left: szRectLeft,
                top: szRectTop,
                width: szRectWidth,
                height: szRectHeight,
                borderColor: theme.textSecondary,
              },
            ]}
          />
          {/* Pitch dots */}
          {visiblePitches.map((p) => {
            const dotX = ((p.pX - BPM_X_MIN) / xRange) * BPM_W - BPM_BALL_R;
            const dotY = ((BPM_Y_MAX - p.pZ) / yRange) * BPM_H - BPM_BALL_R;
            const color = BPM_CALL_COLORS[p.code] ?? "#9E9E9E";
            return (
              <View
                key={`bpm-${p.num}-${p.pitchType}`}
                style={[
                  bpmStyles.dot,
                  {
                    left: Math.max(0, Math.min(BPM_W - BPM_BALL_R * 2, dotX)),
                    top: Math.max(0, Math.min(BPM_H - BPM_BALL_R * 2, dotY)),
                    backgroundColor: color,
                    borderColor: "white",
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Legend */}
        {callGroups.length > 0 && (
          <View style={bpmStyles.legendRow}>
            {callGroups.map((group) => (
              <View key={group.label} style={bpmStyles.legendItem}>
                <View
                  style={[
                    bpmStyles.legendDot,
                    { backgroundColor: group.color },
                  ]}
                />
                <Text
                  style={[bpmStyles.legendText, { color: theme.textSecondary }]}
                >
                  {group.label}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Pitch type filter */}
      {pitchTypes.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={[bpmStyles.filterLabel, { color: theme.textSecondary }]}>
            Pitch Type
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={bpmStyles.filterRow}
          >
            {pitchTypes.map((t) => {
              const active = selTypes.has(t);
              return (
                <TouchableOpacity
                  key={t}
                  style={[
                    bpmStyles.filterBtn,
                    {
                      borderColor: active ? teamColor : theme.border,
                      backgroundColor: active
                        ? teamColor + "22"
                        : "transparent",
                    },
                  ]}
                  onPress={() => toggleType(t)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      bpmStyles.filterBtnText,
                      { color: active ? teamColor : theme.textSecondary },
                    ]}
                  >
                    {t}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Result filter */}
      {callGroups.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={[bpmStyles.filterLabel, { color: theme.textSecondary }]}>
            Result
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={bpmStyles.filterRow}
          >
            {callGroups.map((group) => {
              const active = group.codes.some((c) => selCodes.has(c));
              const { color, label } = group;
              return (
                <TouchableOpacity
                  key={label}
                  style={[
                    bpmStyles.filterBtn,
                    {
                      borderColor: active ? color : theme.border,
                      backgroundColor: active ? color + "22" : "transparent",
                    },
                  ]}
                  onPress={() => toggleGroup(group)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[bpmStyles.filterBtnDot, { backgroundColor: color }]}
                  />
                  <Text
                    style={[
                      bpmStyles.filterBtnText,
                      { color: active ? color : theme.textSecondary },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const bpmStyles = StyleSheet.create({
  chart: {
    width: BPM_W,
    height: BPM_H,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  szRect: {
    position: "absolute",
    borderWidth: 1.5,
    borderRadius: 2,
  },
  dot: {
    position: "absolute",
    width: BPM_BALL_R * 2,
    height: BPM_BALL_R * 2,
    borderRadius: BPM_BALL_R,
    borderWidth: 1,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 8,
    gap: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "white",
  },
  legendText: {
    fontSize: 10,
    fontWeight: "500",
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
    paddingHorizontal: 20,
  },
  filterRow: {
    paddingHorizontal: 20,
    paddingBottom: 2,
    gap: 6,
    flexDirection: "row",
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
  },
  filterBtnDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
});

// ─── Player detail modal ──────────────────────────────────────────────────────
const PlayerDetailModal = ({
  visible,
  onClose,
  playerId,
  playerInfo,
  bsPlayer,
  teamColor,
  teamName,
  teamId,
  allBsPlayers,
  pitchesData,
  awayTeam,
  homeTeam,
  awayScore,
  homeScore,
  gameDate,
  theme,
  colors,
}) => {
  const panY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dy > 8 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) panY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 60) {
          onClose();
          panY.setValue(0);
        } else {
          Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  // Compute min/max across all players — must be before early return (hook rule).
  // Only primary-role players feed each bucket so WBC pitchers' tiny at-bat counts
  // don't drag down the batting range (and vice-versa).
  const statMinMax = useMemo(() => {
    const batting = {};
    const pitching = {};
    Object.values(allBsPlayers ?? {}).forEach((p) => {
      const hasBat =
        Object.keys(p?.stats?.batting ?? {}).filter((k) => k !== "summary")
          .length > 0;
      const hasPit =
        Object.keys(p?.stats?.pitching ?? {}).filter((k) => k !== "summary")
          .length > 0;
      const entries = [
        // primary batter only → no pitching stats
        ...(!hasPit && hasBat ? Object.entries(p.stats.batting) : []).map(
          ([k, v]) => ({ bucket: batting, k, v }),
        ),
        // primary pitcher only → no batting stats
        ...(!hasBat && hasPit ? Object.entries(p.stats.pitching) : []).map(
          ([k, v]) => ({ bucket: pitching, k, v }),
        ),
      ];
      entries.forEach(({ bucket, k, v }) => {
        if (k === "summary") return;
        const n = parseFloat(v);
        if (isNaN(n)) return;
        if (!bucket[k]) bucket[k] = { min: n, max: n };
        else {
          bucket[k].min = Math.min(bucket[k].min, n);
          bucket[k].max = Math.max(bucket[k].max, n);
        }
      });
    });
    return { batting, pitching };
  }, [allBsPlayers]);

  const [pdActiveTab, setPdActiveTab] = useState("Stats");
  const [playerShareVisible, setPlayerShareVisible] = useState(false);
  const navigation = useNavigation();
  useEffect(() => {
    setPdActiveTab("Stats");
    setPlayerShareVisible(false);
  }, [playerId]);

  if (!playerId) return null;

  const fullName = playerInfo?.fullName ?? `Player ${playerId}`;
  const jerseyNum = bsPlayer?.jerseyNumber ? `#${bsPlayer.jerseyNumber}` : "";
  const posAbbr =
    bsPlayer?.position?.abbreviation ??
    playerInfo?.primaryPosition?.abbreviation ??
    "—";
  const posName =
    bsPlayer?.position?.name ?? playerInfo?.primaryPosition?.name ?? "Position";

  // Height: MLB API may return "6' 2\"" — strip any backslashes
  const rawHeight = playerInfo?.height ?? "";
  const height = rawHeight.replace(/\\/g, "") || "—";

  // Handedness
  const batCode = playerInfo?.batSide?.code ?? null;
  const pitchCode = playerInfo?.pitchHand?.code ?? null;
  const batting = bsPlayer?.stats?.batting ?? {};
  const pitching = bsPlayer?.stats?.pitching ?? {};
  const hasBatStats = Object.keys(batting).length > 0;
  const hasPitStats = Object.keys(pitching).length > 0;

  const playerPitches = pitchesData?.[String(playerId)] ?? null;
  const hasPitchDisplay =
    playerPitches != null &&
    Object.values(playerPitches?.byType ?? {}).some(
      (info) => (info?.coordinates ?? "").length > 0,
    );

  let handValue = "—";
  let handLabel = "Bats";
  if (hasBatStats && hasPitStats) {
    handValue = `${batCode ?? "—"} / ${pitchCode ?? "—"}`;
    handLabel = "Bat / Pitch";
  } else if (hasPitStats && pitchCode) {
    handValue = pitchCode;
    handLabel = "Throws";
  } else if (batCode) {
    handValue = batCode;
    handLabel = "Bats";
  }

  // ── Stat helpers ─────────────────────────────────────────────────────────
  const PITCHING_LOWER_IS_BETTER = new Set([
    "runs",
    "hits",
    "homeRuns",
    "baseOnBalls",
    "earnedRuns",
    "wildPitches",
    "hitBatsmen",
    "blownSaves",
    "rbi",
    "stolenBases",
  ]);
  const BATTING_LOWER_IS_BETTER = new Set([
    "strikeOuts",
    "groundIntoDoublePlay",
    "catchersInterference",
  ]);

  const formatStatName = (key) =>
    key
      .replace(/([A-Z])/g, " $1")
      .replace(/([a-zA-Z])(\d)/g, "$1 $2")
      .replace(/(\d)([a-zA-Z])/g, "$1 $2")
      .replace(/^./, (s) => s.toUpperCase())
      .trim();

  const buildStatRows = (statsObj, lowerSet, minMaxBucket) =>
    Object.entries(statsObj)
      .filter(([key]) => key !== "summary")
      .map(([key, rawVal]) => {
        const n = parseFloat(rawVal);
        const range = minMaxBucket[key];
        const isLower = lowerSet.has(key);
        let pct = 0;
        if (range && !isNaN(n)) {
          if (range.max !== range.min) {
            const norm = (n - range.min) / (range.max - range.min);
            pct = isLower ? 1 - norm : norm;
          } else {
            pct = isLower ? 0 : 1;
          }
        }
        return {
          key,
          label: formatStatName(key),
          value: String(rawVal),
          pct,
          isLower,
        };
      });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={pdStyles.backdrop} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          pdStyles.sheet,
          {
            backgroundColor: theme.surface,
            borderTopColor: theme.surface,
            transform: [{ translateY: panY }],
          },
        ]}
      >
        {/* Drag strip */}
        <View
          {...panResponder.panHandlers}
          style={[pdStyles.dragStrip, { borderBottomColor: teamColor }]}
        >
          {/* Handle + close/share buttons row */}
          <View style={pdStyles.handleRow}>
            <View style={{ width: 28 + 8 + 28 }} />
            <View
              style={[pdStyles.handle, { backgroundColor: theme.surface }]}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => setPlayerShareVisible(true)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={[
                  pdStyles.iconBtn,
                  { backgroundColor: teamColor + "33" },
                ]}
              >
                <Ionicons name="share-outline" size={16} color={teamColor} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={[pdStyles.iconBtn, { backgroundColor: theme.error }]}
              >
                <Text style={[pdStyles.iconBtnText, { color: theme.text }]}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Headshot centered — tap to open player page */}
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => {
              onClose();
              navigation.navigate("PlayerPage", {
                playerId,
                playerName: fullName,
                teamId,
                sport: SCREEN_SPORT,
              });
            }}
            style={{ alignItems: "center" }}
          >
            <View style={pdStyles.headshotWrap}>
              <Image
                source={{ uri: playerHeadshotUrl(playerId) }}
                style={[pdStyles.headshot, { borderColor: teamColor }]}
                resizeMode="cover"
              />
            </View>

            {/* Full name + jersey • team */}
            <Text
              style={[pdStyles.playerName, { color: theme.text }]}
              numberOfLines={1}
            >
              {fullName}
            </Text>
            {(jerseyNum || teamName) && (
              <Text
                style={[pdStyles.jerseyNum, { color: theme.textSecondary }]}
              >
                {[jerseyNum, teamName].filter(Boolean).join(" • ")}
              </Text>
            )}
          </TouchableOpacity>

          {/* 3-col stats: position | height | hand */}
          <View style={pdStyles.triRow}>
            <View style={pdStyles.triCell}>
              <Text style={[pdStyles.triValue, { color: theme.text }]}>
                {posAbbr}
              </Text>
              <Text style={[pdStyles.triLabel, { color: theme.textSecondary }]}>
                {posName}
              </Text>
            </View>
            <View
              style={[
                pdStyles.triCell,
                pdStyles.triCellMid,
                { borderColor: theme.border },
              ]}
            >
              <Text style={[pdStyles.triValue, { color: theme.text }]}>
                {height}
              </Text>
              <Text style={[pdStyles.triLabel, { color: theme.textSecondary }]}>
                Height
              </Text>
            </View>
            <View style={pdStyles.triCell}>
              <Text style={[pdStyles.triValue, { color: theme.text }]}>
                {handValue}
              </Text>
              <Text style={[pdStyles.triLabel, { color: theme.textSecondary }]}>
                {handLabel}
              </Text>
            </View>
          </View>
        </View>

        {/* Stats / Pitches tab toggle */}
        {hasPitchDisplay && (
          <View style={pdStyles.pdTabBar}>
            {["Stats", "Pitches"].map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[
                  pdStyles.pdTabBtn,
                  pdActiveTab === tab && pdStyles.pdTabBtnActive,
                ]}
                onPress={() => setPdActiveTab(tab)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    pdStyles.pdTabLabel,
                    {
                      color:
                        pdActiveTab === tab ? theme.text : theme.textSecondary,
                    },
                  ]}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Stats list */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 48,
          }}
        >
          {hasPitchDisplay && pdActiveTab === "Pitches" && (
            <BatterPitchMapView
              playerPitchData={playerPitches}
              teamColor={teamColor}
              theme={theme}
            />
          )}
          {(!hasPitchDisplay || pdActiveTab === "Stats") && hasBatStats && (
            <>
              {hasPitStats && (
                <Text style={[pdStyles.statSection, { color: teamColor }]}>
                  Batting
                </Text>
              )}
              {buildStatRows(
                batting,
                BATTING_LOWER_IS_BETTER,
                statMinMax.batting,
              ).map(({ key, label, value, pct }) => (
                <View key={`bat-${key}`} style={pdStyles.statRow}>
                  <Text
                    style={[
                      pdStyles.statRowLabel,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                  <View style={pdStyles.statRowRight}>
                    <Text
                      style={[pdStyles.statRowValue, { color: theme.text }]}
                    >
                      {value}
                    </Text>
                    <View
                      style={[
                        pdStyles.statBarTrack,
                        { backgroundColor: theme.border },
                      ]}
                    >
                      <View
                        style={[
                          pdStyles.statBarFill,
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
            </>
          )}
          {(!hasPitchDisplay || pdActiveTab === "Stats") && hasPitStats && (
            <>
              {hasBatStats && (
                <Text
                  style={[
                    pdStyles.statSection,
                    { color: teamColor, marginTop: 14 },
                  ]}
                >
                  Pitching
                </Text>
              )}
              {buildStatRows(
                pitching,
                PITCHING_LOWER_IS_BETTER,
                statMinMax.pitching,
              ).map(({ key, label, value, pct }) => (
                <View key={`pit-${key}`} style={pdStyles.statRow}>
                  <Text
                    style={[
                      pdStyles.statRowLabel,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                  <View style={pdStyles.statRowRight}>
                    <Text
                      style={[pdStyles.statRowValue, { color: theme.text }]}
                    >
                      {value}
                    </Text>
                    <View
                      style={[
                        pdStyles.statBarTrack,
                        { backgroundColor: theme.border },
                      ]}
                    >
                      <View
                        style={[
                          pdStyles.statBarFill,
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
            </>
          )}
        </ScrollView>
      </Animated.View>
      <PlayerShareCardModal
        visible={playerShareVisible}
        onClose={() => setPlayerShareVisible(false)}
        playerId={playerId}
        playerInfo={playerInfo}
        bsPlayer={bsPlayer}
        teamColor={teamColor}
        teamName={teamName}
        teamId={teamId}
        awayTeam={awayTeam}
        homeTeam={homeTeam}
        awayScore={awayScore}
        homeScore={homeScore}
        gameDate={gameDate}
        theme={theme}
        colors={colors}
      />
    </Modal>
  );
};

const pdStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "85%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 2,
    overflow: "hidden",
  },
  dragStrip: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 2,
  },
  handleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingTop: 10,
    marginBottom: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  iconBtnText: {
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 16,
  },
  headshotWrap: {
    marginBottom: 12,
  },
  headshot: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    backgroundColor: "rgba(128,128,128,0.1)",
  },
  playerName: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 2,
  },
  jerseyNum: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 16,
  },
  triRow: {
    flexDirection: "row",
    width: "100%",
    marginTop: 4,
  },
  triCell: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  triCellMid: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  triValue: {
    fontSize: 22,
    fontWeight: "800",
  },
  triLabel: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  // ── stat rows ──
  statSection: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  statRowLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    paddingRight: 12,
  },
  statRowRight: {
    alignItems: "flex-end",
    gap: 3,
  },
  statBarTrack: {
    width: 64,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  statBarFill: {
    height: "100%",
    borderRadius: 2,
    minWidth: 2,
  },
  statRowValue: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
  pdTabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 10,
    backgroundColor: "rgba(128,128,128,0.1)",
    padding: 3,
  },
  pdTabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 8,
  },
  pdTabBtnActive: {
    backgroundColor: "rgba(128,128,128,0.25)",
  },
  pdTabLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
});

// ─── Pitch call-code → color ─────────────────────────────────────────────────
const getPitchColor = (callCode) => {
  if (["X", "E", "H", "D"].includes(callCode)) return "#2196F3"; // in play
  if (["B", "D", "*B"].includes(callCode)) return "#4CAF50"; // ball
  return "#f44336"; // strike / foul
};

// ─── Strike zone visualizer ───────────────────────────────────────────────────
const StrikeZoneView = ({ pitches, theme, animatedIndex, animTrigger }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animatedIndex == null || animTrigger == null) return;

    // Reset to baseline
    scaleAnim.stopAnimation();
    overlayOpacity.stopAnimation();
    scaleAnim.setValue(1);
    overlayOpacity.setValue(0);

    // Phase 1: pop out → shrink back → slow pulse x3
    Animated.sequence([
      // Expand
      Animated.timing(scaleAnim, {
        toValue: 2.4,
        duration: 350,
        useNativeDriver: true,
      }),
      // Shrink back to normal
      Animated.timing(scaleAnim, {
        toValue: 1.0,
        duration: 280,
        useNativeDriver: true,
      }),
      // 3 slow dark pulses (~1 s each = 3 s total)
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(scaleAnim, {
              toValue: 1.28,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 1.0,
              duration: 500,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(overlayOpacity, {
              toValue: 0.55,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(overlayOpacity, {
              toValue: 0,
              duration: 500,
              useNativeDriver: true,
            }),
          ]),
        ]),
        { iterations: 3 },
      ),
    ]).start();
  }, [animTrigger]);

  return (
    <View
      style={[
        modalStyles.strikeZoneContainer,
        { backgroundColor: theme.background, borderColor: theme.border },
      ]}
    >
      {/* inner zone rectangle */}
      <View
        style={[
          modalStyles.strikeZoneOutline,
          { borderColor: theme.textTertiary },
        ]}
      />
      {pitches.map((pitch, i) => {
        const coords = pitch?.pitchData?.coordinates;
        if (!coords || coords.pX == null || coords.pZ == null) return null;

        const xPct = ((coords.pX + 2.0) / 3.75) * 100;
        const szTop = pitch.pitchData?.strikeZoneTop;
        const szBot = pitch.pitchData?.strikeZoneBottom;
        const yPct =
          szTop && szBot
            ? ((szTop - coords.pZ) / (szTop - szBot)) * 60 + 20
            : 50;

        const finalX = (Math.max(5, Math.min(95, xPct)) / 100) * 145 - 5;
        const finalY = (Math.max(5, Math.min(95, yPct)) / 100) * 125 + 5;
        const color = getPitchColor(pitch?.details?.call?.code);
        const isAnimated = i === animatedIndex;

        if (isAnimated) {
          return (
            <Animated.View
              key={i}
              style={[
                modalStyles.pitchDot,
                {
                  backgroundColor: color,
                  borderColor: color,
                  left: finalX,
                  top: finalY,
                  transform: [{ scale: scaleAnim }],
                  zIndex: 20,
                },
              ]}
            >
              <Text style={modalStyles.pitchNum}>{i + 1}</Text>
              {/* Dark pulse overlay */}
              <Animated.View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: 10,
                  backgroundColor: "rgba(0,0,0,0.55)",
                  opacity: overlayOpacity,
                }}
                pointerEvents="none"
              />
            </Animated.View>
          );
        }

        return (
          <View
            key={i}
            style={[
              modalStyles.pitchDot,
              {
                backgroundColor: color,
                borderColor: color,
                left: finalX,
                top: finalY,
              },
            ]}
          >
            <Text style={modalStyles.pitchNum}>{i + 1}</Text>
          </View>
        );
      })}
    </View>
  );
};

// ─── Share card modal ───────────────────────────────────────────────────────
// ─── Player Share Card Modal ─────────────────────────────────────────────────
const PLAYER_CARD_BAT_STATS = [
  { key: "atBats", label: "AB" },
  { key: "hits", label: "H" },
  { key: "runs", label: "R" },
  { key: "rbi", label: "RBI" },
  { key: "homeRuns", label: "HR" },
  { key: "baseOnBalls", label: "BB" },
  { key: "strikeOuts", label: "K" },
  { key: "stolenBases", label: "SB" },
  { key: "leftOnBase", label: "LOB" },
];
const PLAYER_CARD_PIT_STATS = [
  { key: "inningsPitched", label: "IP" },
  { key: "hits", label: "H" },
  { key: "runs", label: "R" },
  { key: "baseOnBalls", label: "BB" },
  { key: "strikeOuts", label: "K" },
  { key: "homeRuns", label: "HR" },
  { key: "strikePercentage", label: "K%" },
  { key: "numberOfPitches", label: "NP" },
  { key: "battersFaced", label: "BF" },
];

const PlayerShareCardModal = ({
  visible,
  onClose,
  playerId,
  playerInfo,
  bsPlayer,
  teamColor,
  teamName,
  teamId,
  awayTeam,
  homeTeam,
  awayScore,
  homeScore,
  gameDate,
  theme,
  colors,
}) => {
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const { isDarkMode } = useTheme();

  if (!playerId || !playerInfo) return null;

  const batting = bsPlayer?.stats?.batting ?? {};
  const pitching = bsPlayer?.stats?.pitching ?? {};
  const isPitcher =
    Object.keys(pitching).filter((k) => k !== "summary").length > 0;
  const statsObj = isPitcher ? pitching : batting;
  const statSummary = isPitcher ? pitching.summary : batting.summary;
  const statDefs = isPitcher ? PLAYER_CARD_PIT_STATS : PLAYER_CARD_BAT_STATS;

  const posAbbr =
    bsPlayer?.position?.abbreviation ??
    playerInfo?.primaryPosition?.abbreviation ??
    "—";
  const posFullName =
    bsPlayer?.position?.name ?? playerInfo?.primaryPosition?.name ?? "";
  const fullName = playerInfo?.fullName ?? `Player ${playerId}`;
  const teamLogoUri = teamId
    ? WBCService.getTeamLogo(teamId, isDarkMode)
    : null;
  const CARD_SIZE = Math.min(width - 48, 540);

  const handleShare = async () => {
    if (!cardRef.current || sharing) return;
    try {
      setSharing(true);
      // Wait briefly to allow remote images to finish loading/rendering
      await new Promise((res) => setTimeout(res, 350));
      const uri = await cardRef.current.capture();
      await Sharing.shareAsync(uri, { mimeType: "image/png" });
    } catch (e) {
      console.warn("Share failed", e);
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={scStyles.overlay}>
        <ViewShot
          ref={cardRef}
          options={{ format: "png", quality: 1 }}
          style={{ overflow: "hidden" }}
        >
          <View
            style={[
              scStyles.card,
              { width: CARD_SIZE, backgroundColor: theme.surface },
            ]}
          >
            {/* ── Header ── */}
            <View
              style={[
                psStyles.cardHeader,
                {
                  backgroundColor: teamColor + "22",
                  borderBottomColor: teamColor,
                },
              ]}
            >
              {/* Top row: position badge + score */}
              <View style={psStyles.headerTopRow}>
                <View
                  style={[psStyles.posBadge, { backgroundColor: teamColor }]}
                >
                  <Text
                    style={[
                      psStyles.posBadgeText,
                      { color: getTextOnColor(teamColor) },
                    ]}
                  >
                    {posAbbr}
                    {posFullName ? ` • ${posFullName}` : ""}
                  </Text>
                </View>
                {awayScore != null && homeScore != null && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {!!WBCService.getTeamLogo(awayTeam?.id, isDarkMode) && (
                      <Image
                        source={{
                          uri: WBCService.getTeamLogo(awayTeam?.id, isDarkMode),
                        }}
                        style={{ width: 18, height: 18 }}
                        resizeMode="contain"
                      />
                    )}
                    <Text style={[scStyles.cardScore, { color: theme.text }]}>
                      <Text
                        style={{
                          fontWeight:
                            parseInt(awayScore) > parseInt(homeScore)
                              ? "800"
                              : "400",
                        }}
                      >
                        {awayScore}
                      </Text>{" "}
                      <Text>-</Text>{" "}
                      <Text
                        style={{
                          fontWeight:
                            parseInt(homeScore) > parseInt(awayScore)
                              ? "800"
                              : "400",
                        }}
                      >
                        {homeScore}
                      </Text>
                    </Text>
                    {!!WBCService.getTeamLogo(homeTeam?.id, isDarkMode) && (
                      <Image
                        source={{
                          uri: WBCService.getTeamLogo(homeTeam?.id, isDarkMode),
                        }}
                        style={{ width: 18, height: 18 }}
                        resizeMode="contain"
                      />
                    )}
                  </View>
                )}
              </View>

              {/* Headshot + name/summary */}
              <View style={psStyles.headshotRow}>
                <Image
                  source={{ uri: playerHeadshotUrl(playerId) }}
                  style={[psStyles.cardHeadshot, { borderColor: teamColor }]}
                  resizeMode="cover"
                />
                <View style={psStyles.nameBlock}>
                  {!!statSummary && (
                    <Text
                      style={[psStyles.statSummary, { color: theme.text }]}
                      numberOfLines={2}
                    >
                      {statSummary}
                    </Text>
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={[psStyles.fullName, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {fullName}
                      </Text>
                      {!!teamName && (
                        <View style={psStyles.teamNameRow}>
                          {!!teamLogoUri && (
                            <Image
                              source={{ uri: teamLogoUri }}
                              style={psStyles.teamNameLogo}
                              resizeMode="contain"
                            />
                          )}
                          <Text
                            style={[
                              psStyles.teamNameLabel,
                              { color: theme.textSecondary },
                            ]}
                            numberOfLines={1}
                          >
                            {teamName}
                          </Text>
                        </View>
                      )}
                    </View>
                    {!!gameDate &&
                      (() => {
                        const _gd = new Date(gameDate);
                        const _monthDate = _gd.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        });
                        const _year = _gd.toLocaleDateString("en-US", {
                          year: "numeric",
                        });
                        return (
                          <View
                            style={{ alignItems: "flex-end", marginLeft: 6 }}
                          >
                            <Text
                              style={[
                                psStyles.gameDateLine,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {_monthDate}
                            </Text>
                            <Text
                              style={[
                                psStyles.gameDateLine,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {_year}
                            </Text>
                          </View>
                        );
                      })()}
                  </View>
                </View>
              </View>
            </View>

            {/* ── Body: 3×3 stat grid ── */}
            <View style={psStyles.statGrid}>
              {statDefs.map(({ key, label }, i) => (
                <View
                  key={key}
                  style={[
                    psStyles.statCell,
                    { borderColor: theme.border },
                    i % 3 !== 2 && {
                      borderRightWidth: StyleSheet.hairlineWidth,
                    },
                    i < 6 && { borderBottomWidth: StyleSheet.hairlineWidth },
                  ]}
                >
                  <Text style={[psStyles.statVal, { color: theme.text }]}>
                    {statsObj[key] ?? "—"}
                  </Text>
                  <Text
                    style={[psStyles.statLbl, { color: theme.textSecondary }]}
                  >
                    {label}
                  </Text>
                </View>
              ))}
            </View>

            {/* Footer */}
            <View
              style={[scStyles.cardFooter, { borderTopColor: theme.border }]}
            >
              <Text style={[scStyles.cardBrand, { color: theme.text }]}>
                SportsHeart{" "}
                <Ionicons name="heart" size={10} color={colors.primary} />
              </Text>
            </View>
          </View>
        </ViewShot>

        {/* Actions */}
        <View style={scStyles.actions}>
          <TouchableOpacity
            onPress={handleShare}
            disabled={sharing}
            style={[scStyles.actionBtn, { backgroundColor: teamColor }]}
          >
            {sharing ? (
              <Text style={scStyles.actionBtnTxt}>Sharing…</Text>
            ) : (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Ionicons name="share-outline" size={18} color="#fff" />
                <Text style={scStyles.actionBtnTxt}>Share</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClose}
            style={[scStyles.actionBtn, { backgroundColor: theme.border }]}
          >
            <Text style={[scStyles.actionBtnTxt, { color: theme.text }]}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const psStyles = StyleSheet.create({
  cardHeader: {
    padding: 14,
    borderBottomWidth: 2,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  posBadge: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  posBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  headshotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardHeadshot: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    backgroundColor: "rgba(128,128,128,0.1)",
  },
  nameBlock: {
    flex: 1,
    gap: 2,
  },
  statSummary: {
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  fullName: {
    fontSize: 13,
    fontWeight: "600",
  },
  teamNameLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  teamNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  teamNameLogo: {
    width: 16,
    height: 16,
  },
  gameDateLine: {
    fontSize: 10,
    fontWeight: "500",
    marginTop: 1,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  statCell: {
    width: "33.333%",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  statVal: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  statLbl: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 3,
  },
});

const ShareCardModal = ({
  visible,
  onClose,
  play,
  awayTeam,
  homeTeam,
  awayColor,
  homeColor,
  playersMap,
  boxscore,
  theme,
  colors,
}) => {
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const { isDarkMode } = useTheme();

  if (!play) return null;

  const isTop = play?.about?.isTopInning !== false;
  const teamColor = isTop ? awayColor : homeColor;
  const teamAbbr = isTop
    ? (awayTeam?.abbreviation ?? "")
    : (homeTeam?.abbreviation ?? "");
  const inning = play?.about?.inning;
  const event = play?.result?.event ?? "";
  const isScoringPlay = play?.about?.isScoringPlay === true;
  const awayScore = play?.result?.awayScore;
  const homeScore = play?.result?.homeScore;

  const batterId = play?.matchup?.batter?.id;
  const pitcherId = play?.matchup?.pitcher?.id;
  const batterInfo = resolvePlayer(playersMap, batterId);
  const pitcherInfo = resolvePlayer(playersMap, pitcherId);
  const description =
    play?.result?.description ??
    `${batterInfo?.fullName ?? "Batter"} vs ${pitcherInfo?.fullName ?? "Pitcher"}`;
  const batterTeamColor = isTop ? awayColor : homeColor;
  const pitcherTeamColor = isTop ? homeColor : awayColor;

  const allBsPlayers = {
    ...(boxscore?.teams?.away?.players ?? {}),
    ...(boxscore?.teams?.home?.players ?? {}),
  };
  const batterBatting = allBsPlayers[`ID${batterId}`]?.stats?.batting ?? {};
  const pitcherPitching = allBsPlayers[`ID${pitcherId}`]?.stats?.pitching ?? {};

  const playEvents = play?.playEvents ?? [];
  const pitches = playEvents.filter(
    (e) => e?.pitchData?.coordinates?.pX != null,
  );

  const CARD_SIZE = Math.min(width - 48, 540);

  const handleShare = async () => {
    if (!cardRef.current || sharing) return;
    try {
      setSharing(true);
      // allow remote images to finish loading into the view
      await new Promise((res) => setTimeout(res, 350));
      const uri = await cardRef.current.capture();
      await Sharing.shareAsync(uri, { mimeType: "image/png" });
    } catch (e) {
      console.warn("Share failed", e);
    } finally {
      setSharing(false);
    }
  };

  // Inline mini-player for the card
  const PlayerMini = ({ info, bsColor, bStats, pStats, role }) => {
    if (!info) return null;
    const isPitcher = role === "pitcher";
    const statItems = isPitcher
      ? [
          { l: "IP", v: pStats?.inningsPitched },
          { l: "R", v: pStats?.runs },
          { l: "K", v: pStats?.strikeOuts },
        ]
      : [
          { l: "AB", v: bStats?.atBats },
          { l: "H", v: bStats?.hits },
          { l: "RBI", v: bStats?.rbi },
        ];
    return (
      <View style={scStyles.miniPlayer}>
        <Image
          source={{ uri: playerHeadshotUrl(info.id) }}
          style={[scStyles.miniHeadshot, { borderColor: bsColor }]}
          resizeMode="cover"
        />
        <Text
          style={[scStyles.miniName, { color: theme.text }]}
          numberOfLines={1}
        >
          {shortName(info.fullName)}
        </Text>
        <Text style={[scStyles.miniRole, { color: bsColor }]}>
          {isPitcher ? "Pitcher" : "Batter"}
        </Text>
        <View style={scStyles.miniStats}>
          {statItems.map(({ l, v }) => (
            <View key={l} style={scStyles.miniStat}>
              <Text style={[scStyles.miniStatVal, { color: theme.text }]}>
                {v ?? "—"}
              </Text>
              <Text
                style={[scStyles.miniStatLbl, { color: theme.textSecondary }]}
              >
                {l}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={scStyles.overlay}>
        {/* Capturable card */}
        <ViewShot
          ref={cardRef}
          options={{ format: "png", quality: 1 }}
          style={{ overflow: "hidden" }}
        >
          <View
            style={[
              scStyles.card,
              { width: CARD_SIZE, backgroundColor: theme.surface },
            ]}
          >
            {/* ── Top: inning + score + event + description ── */}
            <View
              style={[
                scStyles.cardTop,
                {
                  backgroundColor: teamColor + "22",
                  borderBottomColor: teamColor,
                },
              ]}
            >
              <View style={scStyles.cardTopRow}>
                <Text style={[scStyles.cardInning, { color: theme.text }]}>
                  {isTop ? "▲" : "▼"} {toOrdinal(inning)}
                  {teamAbbr ? ` • ${teamAbbr}` : ""}
                </Text>
                {awayScore != null && homeScore != null && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {!!WBCService.getTeamLogo(awayTeam?.id, isDarkMode) && (
                      <Image
                        source={{
                          uri: WBCService.getTeamLogo(awayTeam?.id, isDarkMode),
                        }}
                        style={{ width: 18, height: 18 }}
                        resizeMode="contain"
                      />
                    )}
                    <Text style={[scStyles.cardScore, { color: theme.text }]}>
                      {awayScore} – {homeScore}
                    </Text>
                    {!!WBCService.getTeamLogo(homeTeam?.id, isDarkMode) && (
                      <Image
                        source={{
                          uri: WBCService.getTeamLogo(homeTeam?.id, isDarkMode),
                        }}
                        style={{ width: 18, height: 18 }}
                        resizeMode="contain"
                      />
                    )}
                  </View>
                )}
              </View>
              {!!event && (
                <Text style={[scStyles.cardEvent, { color: theme.text }]}>
                  {event}
                </Text>
              )}
              {!!description && (
                <Text
                  style={[scStyles.cardDesc, { color: theme.textSecondary }]}
                  numberOfLines={2}
                >
                  {description}
                </Text>
              )}
            </View>

            {/* ── Bottom: pitch chart (left) | matchup + bases (right) ── */}
            <View style={scStyles.cardBottom}>
              {/* Left – pitch locations + hit data */}
              <View style={scStyles.cardLeft}>
                {pitches.length > 0 ? (
                  <StrikeZoneView pitches={pitches} theme={theme} size={120} />
                ) : (
                  <View
                    style={[scStyles.noPitchBox, { borderColor: theme.border }]}
                  >
                    <Text
                      style={{
                        color: theme.textSecondary,
                        fontSize: 10,
                        textAlign: "center",
                      }}
                    >
                      No pitch data
                    </Text>
                  </View>
                )}
                {(() => {
                  const ev = playEvents.find(
                    (e) => e?.hitData?.launchSpeed != null,
                  );
                  if (!ev) return null;
                  const hd = ev.hitData;
                  return (
                    <View
                      style={[
                        scStyles.hitDataBox,
                        { borderTopColor: theme.surface },
                      ]}
                    >
                      <Text
                        style={[
                          scStyles.hitDataTitle,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Hit Data
                      </Text>
                      <View style={scStyles.hitDataCols}>
                        {[
                          {
                            label: "Speed",
                            value: `${Math.round(hd.launchSpeed)} mph`,
                          },
                          {
                            label: "Angle",
                            value: `${Math.round(hd.launchAngle)}°`,
                          },
                          {
                            label: "Dist",
                            value: `${Math.round(hd.totalDistance)} ft`,
                          },
                        ].map(({ label, value }) => (
                          <View key={label} style={scStyles.hitDataCol}>
                            <Text
                              style={[
                                scStyles.hitDataVal,
                                { color: theme.text },
                              ]}
                            >
                              {value}
                            </Text>
                            <Text
                              style={[
                                scStyles.hitDataLbl,
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
                })()}
              </View>

              {/* Right – batter → bases → pitcher */}
              <View
                style={[scStyles.cardRight, { borderLeftColor: theme.border }]}
              >
                <PlayerMini
                  info={batterInfo}
                  bsColor={batterTeamColor}
                  bStats={batterBatting}
                  pStats={{}}
                  role="batter"
                />

                {/* Bases diamond */}
                <View style={scStyles.cardBases}>
                  <View
                    style={[
                      scStyles.cardBaseDiamond,
                      play?.matchup?.postOnSecond
                        ? { backgroundColor: teamColor }
                        : {
                            backgroundColor: "transparent",
                            borderWidth: 1.5,
                            borderColor: theme.textSecondary,
                          },
                    ]}
                  />
                  <View style={scStyles.cardBasesRow}>
                    <View
                      style={[
                        scStyles.cardBaseDiamond,
                        play?.matchup?.postOnThird
                          ? { backgroundColor: teamColor }
                          : {
                              backgroundColor: "transparent",
                              borderWidth: 1.5,
                              borderColor: theme.textSecondary,
                            },
                      ]}
                    />
                    <View
                      style={[
                        scStyles.cardBaseDiamond,
                        play?.matchup?.postOnFirst
                          ? { backgroundColor: teamColor }
                          : {
                              backgroundColor: "transparent",
                              borderWidth: 1.5,
                              borderColor: theme.textSecondary,
                            },
                      ]}
                    />
                  </View>
                </View>

                <PlayerMini
                  info={pitcherInfo}
                  bsColor={pitcherTeamColor}
                  bStats={{}}
                  pStats={pitcherPitching}
                  role="pitcher"
                />
              </View>
            </View>

            {/* Branding footer */}
            <View
              style={[scStyles.cardFooter, { borderTopColor: theme.border }]}
            >
              <Text style={[scStyles.cardBrand, { color: theme.text }]}>
                SportsHeart{" "}
                <Ionicons name="heart" size={10} color={colors.primary} />
              </Text>
            </View>
          </View>
        </ViewShot>

        {/* Action buttons */}
        <View style={scStyles.actions}>
          <TouchableOpacity
            onPress={handleShare}
            disabled={sharing}
            style={[scStyles.actionBtn, { backgroundColor: teamColor }]}
          >
            {sharing ? (
              <Text style={scStyles.actionBtnTxt}>Sharing…</Text>
            ) : (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Ionicons name="share-outline" size={18} color="#fff" />
                <Text style={scStyles.actionBtnTxt}>Share</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClose}
            style={[scStyles.actionBtn, { backgroundColor: theme.border }]}
          >
            <Text style={[scStyles.actionBtnTxt, { color: theme.text }]}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const scStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    padding: 24,
  },
  card: {
    overflow: "hidden",
  },
  cardTop: {
    padding: 14,
    borderBottomWidth: 2,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  cardInning: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  cardScore: {
    fontSize: 12,
    fontWeight: "700",
  },
  cardEvent: {
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 3,
  },
  cardDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  cardBottom: {
    flexDirection: "row",
    minHeight: 180,
  },
  cardLeft: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
  },
  noPitchBox: {
    width: 110,
    height: 110,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 8,
  },
  cardRight: {
    flex: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "space-evenly",
    gap: 8,
  },
  cardFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "flex-end",
  },
  cardBrand: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  actionBtn: {
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 28,
    minWidth: 120,
    alignItems: "center",
  },
  actionBtnTxt: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  // mini player card
  miniPlayer: {
    alignItems: "center",
    gap: 2,
  },
  miniHeadshot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    backgroundColor: "rgba(128,128,128,0.1)",
  },
  miniName: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  miniRole: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  miniStats: {
    flexDirection: "row",
    gap: 8,
  },
  miniStat: {
    alignItems: "center",
  },
  miniStatVal: {
    fontSize: 12,
    fontWeight: "800",
  },
  miniStatLbl: {
    fontSize: 9,
    marginTop: 1,
  },
  // bases
  cardBases: {
    alignItems: "center",
    gap: 5,
  },
  cardBasesRow: {
    flexDirection: "row",
    gap: 17.5,
  },
  cardBaseDiamond: {
    width: 11,
    height: 11,
    borderRadius: 1.5,
    transform: [{ rotate: "45deg" }],
  },
  // hit data in share card
  hitDataBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    width: "100%",
    alignItems: "center",
  },
  hitDataTitle: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  hitDataCols: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
  hitDataCol: {
    alignItems: "center",
    gap: 1,
  },
  hitDataVal: {
    fontSize: 11,
    fontWeight: "800",
  },
  hitDataLbl: {
    fontSize: 8,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
});

// Returns "J. Smith" from "John Smith"
const shortName = (fullName) => {
  if (!fullName) return "";
  const parts = fullName.trim().split(" ");
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
};

// ─── Play detail bottom-sheet modal ──────────────────────────────────────────
const PlayDetailModal = ({
  play,
  awayTeam,
  homeTeam,
  awayColor,
  homeColor,
  playersMap,
  boxscore,
  theme,
  colors,
  visible,
  onClose,
}) => {
  // Swipe-down to dismiss
  const [shareVisible, setShareVisible] = useState(false);
  const panY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dy > 8 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) panY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80) {
          onClose();
          panY.setValue(0);
        } else {
          Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  if (!play) return null;

  const isTop = play?.about?.isTopInning !== false;
  const teamColor = isTop ? awayColor : homeColor;
  const teamAbbr = isTop
    ? (awayTeam?.abbreviation ?? "")
    : (homeTeam?.abbreviation ?? "");
  const inning = play?.about?.inning;
  const event = play?.result?.event ?? "";
  const isScoringPlay = play?.about?.isScoringPlay === true;
  const awayScore = play?.result?.awayScore;
  const homeScore = play?.result?.homeScore;

  // Resolve batter + pitcher from playersMap
  const batterId = play?.matchup?.batter?.id;
  const pitcherId = play?.matchup?.pitcher?.id;
  const batterInfo = resolvePlayer(playersMap, batterId);
  const pitcherInfo = resolvePlayer(playersMap, pitcherId);
  const description =
    play?.result?.description ??
    `${batterInfo?.fullName ?? "Batter"} vs ${pitcherInfo?.fullName ?? "Pitcher"}`;

  // top inning → batter is away, pitcher is home
  const batterTeamColor = isTop ? awayColor : homeColor;
  const pitcherTeamColor = isTop ? homeColor : awayColor;

  // Boxscore stats
  const allBsPlayers = {
    ...(boxscore?.teams?.away?.players ?? {}),
    ...(boxscore?.teams?.home?.players ?? {}),
  };
  const batterBs = allBsPlayers[`ID${batterId}`] ?? null;
  const pitcherBs = allBsPlayers[`ID${pitcherId}`] ?? null;
  const batterBatting = batterBs?.stats?.batting ?? {};
  const pitcherPitching = pitcherBs?.stats?.pitching ?? {};

  // Pitch text builder (FavoritesScreen naming logic)
  const buildPitchText = (ev) => {
    const details = ev.details || {};
    const desc = details.description || "";
    const bName = shortName(batterInfo?.fullName) || "Batter";
    const pName = shortName(pitcherInfo?.fullName) || "Pitcher";
    const speed = ev.pitchData?.startSpeed ?? null;
    const pitchType = details.type?.description || "";
    const balls = ev.count?.balls ?? "";
    const strikes = ev.count?.strikes ?? "";
    const callCode = details.call?.code
      ? String(details.call.code).toUpperCase()
      : null;

    if (callCode === "F") {
      const spd = speed ? `${Math.round(speed)} mph ` : "";
      return `${bName} fouls off ${spd}${pitchType} from ${pName}. Strike ${strikes}`.trim();
    }
    if (callCode === "B") {
      const spd = speed ? `${Math.round(speed)} mph ` : "";
      return `${pName} throws ${spd}${pitchType}. Ball ${balls}`.trim();
    }
    if (callCode === "*B") {
      return `Wild pitch. Ball ${balls}`.trim();
    }
    if (callCode === "C") {
      return `${bName} takes strike ${strikes} looking from ${pName}`.trim();
    }
    if (callCode === "S") {
      const spd = speed ? `${Math.round(speed)} mph ` : "";
      return `${bName} swings at ${spd}${pitchType} from ${pName}. Strike ${strikes}`.trim();
    }
    if (["X", "E", "H", "D"].includes(callCode ?? "")) return desc || "In play";
    return desc || details.event || "";
  };

  // Left-border color per event
  const getEventBorderColor = (ev) => {
    const code = ev.details?.call?.code?.toUpperCase();
    if (["X", "E", "H", "D"].includes(code ?? "")) return "#2196F3";
    if (["B", "D", "*B"].includes(code ?? "")) return "#4CAF50";
    if (["C", "S", "F", "T", "L", "W"].includes(code ?? "")) return "#f44336";
    return theme.border;
  };

  const playEvents = play?.playEvents ?? [];
  const pitches = playEvents.filter(
    (e) => e?.pitchData?.coordinates?.pX != null,
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop tap-to-close */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={modalStyles.backdrop} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          modalStyles.sheet,
          {
            backgroundColor: theme.surface,
            borderTopColor: isScoringPlay ? teamColor : theme.border,
            transform: [{ translateY: panY }],
          },
        ]}
      >
        {/* ── Draggable header strip (swipe here to dismiss) ── */}
        <View
          {...panResponder.panHandlers}
          style={[modalStyles.dragStrip, { borderBottomColor: theme.border }]}
        >
          {/* Drag pip */}
          <View
            style={[modalStyles.handle, { backgroundColor: theme.surface }]}
          />

          {/* Title row */}
          <View style={modalStyles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[modalStyles.sheetInning, { color: theme.text }]}>
                {isTop ? "▲" : "▼"} {toOrdinal(inning)}
                {teamAbbr ? ` • ${teamAbbr}` : ""}
              </Text>
              {!!event && (
                <Text style={[modalStyles.sheetEvent, { color: theme.text }]}>
                  {event}
                </Text>
              )}
              {isScoringPlay && awayScore != null && homeScore != null && (
                <Text style={[modalStyles.sheetScore, { color: teamColor }]}>
                  {awayTeam?.abbreviation ?? "Away"} {awayScore} –{" "}
                  {homeTeam?.abbreviation ?? "Home"} {homeScore}
                </Text>
              )}
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => setShareVisible(true)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={[
                  modalStyles.closeBtn,
                  { backgroundColor: teamColor + "33" },
                ]}
              >
                <Ionicons name="share-outline" size={16} color={teamColor} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={[modalStyles.closeBtn, { backgroundColor: theme.error }]}
              >
                <Text style={[modalStyles.closeBtnText, { color: theme.text }]}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {!!description && (
            <Text
              style={[modalStyles.sheetDesc, { color: theme.textSecondary }]}
            >
              {description}
            </Text>
          )}
        </View>

        {/* ── Scrollable content ── */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {/* ── Matchup ── */}
          {(batterInfo || pitcherInfo) && (
            <View
              style={[
                modalStyles.matchupRow,
                { borderBottomColor: theme.surface },
              ]}
            >
              {/* Batter – left */}
              {batterInfo ? (
                <View style={modalStyles.matchupPlayer}>
                  <Image
                    source={{ uri: playerHeadshotUrl(batterId) }}
                    style={[
                      modalStyles.matchupHeadshot,
                      { borderColor: batterTeamColor },
                    ]}
                    resizeMode="cover"
                  />
                  <Text
                    style={[modalStyles.matchupName, { color: theme.text }]}
                  >
                    {shortName(batterInfo.fullName)}
                  </Text>
                  <Text
                    style={[
                      modalStyles.matchupRole,
                      { color: batterTeamColor },
                    ]}
                  >
                    Batter
                  </Text>
                  <View style={modalStyles.matchupStats}>
                    {[
                      { label: "AB", val: batterBatting.atBats },
                      { label: "H", val: batterBatting.hits },
                      { label: "RBI", val: batterBatting.rbi },
                    ].map(({ label, val }) => (
                      <View key={label} style={modalStyles.matchupStat}>
                        <Text
                          style={[
                            modalStyles.matchupStatVal,
                            { color: theme.text },
                          ]}
                        >
                          {val ?? "—"}
                        </Text>
                        <Text
                          style={[
                            modalStyles.matchupStatLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={modalStyles.matchupPlayer} />
              )}

              {/* Bases diamond */}
              <View style={modalStyles.basesColumn}>
                {/* 2nd base */}
                <View
                  style={[
                    modalStyles.baseDiamond,
                    modalStyles.base2nd,
                    play?.matchup?.postOnSecond
                      ? {
                          backgroundColor: teamColor,
                          shadowColor: teamColor,
                          shadowOpacity: 0.7,
                          shadowRadius: 3,
                          shadowOffset: { width: 0, height: 0 },
                          elevation: 3,
                        }
                      : {
                          backgroundColor: "transparent",
                          borderWidth: 1.5,
                          borderColor: theme.textSecondary,
                        },
                  ]}
                />
                <View style={modalStyles.basesMiddleRow}>
                  {/* 3rd base */}
                  <View
                    style={[
                      modalStyles.baseDiamond,
                      play?.matchup?.postOnThird
                        ? {
                            backgroundColor: teamColor,
                            shadowColor: teamColor,
                            shadowOpacity: 0.7,
                            shadowRadius: 3,
                            shadowOffset: { width: 0, height: 0 },
                            elevation: 3,
                          }
                        : {
                            backgroundColor: "transparent",
                            borderWidth: 1.5,
                            borderColor: theme.textSecondary,
                          },
                    ]}
                  />
                  {/* 1st base */}
                  <View
                    style={[
                      modalStyles.baseDiamond,
                      play?.matchup?.postOnFirst
                        ? {
                            backgroundColor: teamColor,
                            shadowColor: teamColor,
                            shadowOpacity: 0.7,
                            shadowRadius: 3,
                            shadowOffset: { width: 0, height: 0 },
                            elevation: 3,
                          }
                        : {
                            backgroundColor: "transparent",
                            borderWidth: 1.5,
                            borderColor: theme.textSecondary,
                          },
                    ]}
                  />
                </View>
              </View>

              {/* Pitcher – right */}
              {pitcherInfo ? (
                <View
                  style={[
                    modalStyles.matchupPlayer,
                    { alignItems: "flex-end" },
                  ]}
                >
                  <Image
                    source={{ uri: playerHeadshotUrl(pitcherId) }}
                    style={[
                      modalStyles.matchupHeadshot,
                      { borderColor: pitcherTeamColor },
                    ]}
                    resizeMode="cover"
                  />
                  <Text
                    style={[modalStyles.matchupName, { color: theme.text }]}
                  >
                    {shortName(pitcherInfo.fullName)}
                  </Text>
                  <Text
                    style={[
                      modalStyles.matchupRole,
                      { color: pitcherTeamColor },
                    ]}
                  >
                    Pitcher
                  </Text>
                  <View style={modalStyles.matchupStats}>
                    {[
                      { label: "IP", val: pitcherPitching.inningsPitched },
                      { label: "R", val: pitcherPitching.runs },
                      { label: "K", val: pitcherPitching.strikeOuts },
                    ].map(({ label, val }) => (
                      <View key={label} style={modalStyles.matchupStat}>
                        <Text
                          style={[
                            modalStyles.matchupStatVal,
                            { color: theme.text },
                          ]}
                        >
                          {val ?? "—"}
                        </Text>
                        <Text
                          style={[
                            modalStyles.matchupStatLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <View
                  style={[
                    modalStyles.matchupPlayer,
                    { alignItems: "flex-end" },
                  ]}
                />
              )}
            </View>
          )}

          {/* ── Pitch chart (+ optional hit data) ── */}
          {pitches.length > 0 && (
            <View style={modalStyles.zoneSection}>
              <Text
                style={[
                  modalStyles.zoneSectionTitle,
                  { color: theme.textSecondary },
                ]}
              >
                Pitch Locations
              </Text>

              {/* Chart row: strike zone left, hit data right */}
              <View style={modalStyles.zoneRow}>
                <StrikeZoneView pitches={pitches} theme={theme} />

                {/* Hit data — only when present in any playEvent */}
                {(() => {
                  const ev = playEvents.find(
                    (e) => e?.hitData?.launchSpeed != null,
                  );
                  if (!ev) return null;
                  const hd = ev.hitData;
                  const items = [
                    {
                      icon: "💨",
                      label: "Speed",
                      value: `${Math.round(hd.launchSpeed)} mph`,
                    },
                    {
                      icon: "📐",
                      label: "Angle",
                      value: `${Math.round(hd.launchAngle)}°`,
                    },
                    {
                      icon: "📏",
                      label: "Dist",
                      value: `${Math.round(hd.totalDistance)} ft`,
                    },
                  ];
                  return (
                    <View
                      style={[
                        modalStyles.hitDataPanel,
                        {
                          backgroundColor: theme.background,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          modalStyles.zoneSectionTitle,
                          { color: theme.textSecondary, marginBottom: -2 },
                        ]}
                      >
                        Hit Data
                      </Text>
                      {items.map(({ icon, label, value }) => (
                        <View key={label} style={modalStyles.hitDataRow}>
                          <Text style={modalStyles.hitDataIcon}>{icon}</Text>
                          <View style={modalStyles.hitDataText}>
                            <Text
                              style={[
                                modalStyles.hitDataValue,
                                { color: theme.text },
                              ]}
                            >
                              {value}
                            </Text>
                            <Text
                              style={[
                                modalStyles.hitDataLabel,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {label}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  );
                })()}
              </View>

              <View style={modalStyles.legend}>
                {[
                  { label: "Ball", color: "#4CAF50" },
                  { label: "Strike / Foul", color: "#f44336" },
                  { label: "In Play", color: "#2196F3" },
                ].map(({ label, color }) => (
                  <View key={label} style={modalStyles.legendItem}>
                    <View
                      style={[
                        modalStyles.legendDot,
                        { backgroundColor: color },
                      ]}
                    />
                    <Text
                      style={[
                        modalStyles.legendLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── Play events ── */}
          {playEvents.length > 0 && (
            <View style={modalStyles.eventsSection}>
              {[...playEvents].reverse().map((ev, i) => {
                const borderCol = getEventBorderColor(ev);
                const hasPitch = !!ev.pitchData;
                const label = hasPitch
                  ? buildPitchText(ev)
                  : ev.details?.description ||
                    ev.details?.event ||
                    ev.type ||
                    "";
                if (!label) return null;
                const speedStr =
                  hasPitch && ev.pitchData?.startSpeed
                    ? `${Math.round(ev.pitchData.startSpeed)} mph`
                    : null;
                const pitchTypeStr = ev.details?.type?.description ?? null;
                return (
                  <View
                    key={i}
                    style={[
                      modalStyles.eventBubble,
                      {
                        backgroundColor:
                          theme.surfaceSecondary ?? theme.background,
                        borderColor: theme.border,
                        borderLeftColor: borderCol,
                      },
                    ]}
                  >
                    <Text
                      style={[modalStyles.eventText, { color: theme.text }]}
                    >
                      {label}
                    </Text>
                    {hasPitch && (speedStr || pitchTypeStr) && (
                      <Text
                        style={[
                          modalStyles.eventMeta,
                          { color: theme.textTertiary ?? theme.textSecondary },
                        ]}
                      >
                        {[pitchTypeStr, speedStr].filter(Boolean).join(" · ")}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </Animated.View>
      {/* Share card modal */}
      <ShareCardModal
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        play={play}
        awayTeam={awayTeam}
        homeTeam={homeTeam}
        awayColor={awayColor}
        homeColor={homeColor}
        playersMap={playersMap}
        boxscore={boxscore}
        theme={theme}
        colors={colors}
      />
    </Modal>
  );
};

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "85%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 2,
    overflow: "hidden",
  },
  // draggable strip (handle + title row) — panHandlers attached here
  dragStrip: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  closeBtnText: {
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 16,
  },
  sheetInning: {
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 4,
  },
  sheetEvent: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  sheetDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  sheetScore: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  // ── events list ──
  eventsSection: {
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 6,
  },
  eventBubble: {
    borderRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  eventText: {
    fontSize: 13,
    lineHeight: 18,
  },
  eventMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  // ── pitch chart ──
  zoneSection: {
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  zoneRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  hitDataPanel: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    justifyContent: "center",
    gap: 10,
  },
  hitDataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hitDataIcon: {
    fontSize: 16,
    width: 22,
    textAlign: "center",
  },
  hitDataText: {
    gap: 1,
  },
  hitDataValue: {
    fontSize: 15,
    fontWeight: "800",
  },
  hitDataLabel: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  zoneSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  strikeZoneContainer: {
    width: 160,
    height: 160,
    position: "relative",
    borderRadius: 6,
    borderWidth: 1,
  },
  strikeZoneOutline: {
    position: "absolute",
    width: 70,
    height: 80,
    borderWidth: 2,
    backgroundColor: "rgba(128,128,128,0.06)",
    borderRadius: 2,
    top: "50%",
    left: "50%",
    marginLeft: -35,
    marginTop: -40,
  },
  pitchDot: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  pitchNum: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },
  legend: {
    flexDirection: "row",
    gap: 16,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 11,
  },
  noPitches: {
    textAlign: "center",
    fontSize: 13,
    marginTop: 8,
    marginBottom: 24,
  },
  // ── matchup ──
  matchupRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    marginBottom: 0,
  },
  matchupPlayer: {
    flex: 1,
    alignItems: "flex-start",
  },
  matchupHeadshot: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    marginBottom: 6,
    backgroundColor: "rgba(128,128,128,0.1)",
  },
  matchupName: {
    fontSize: 13,
    fontWeight: "700",
  },
  matchupRole: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
    marginBottom: 8,
  },
  matchupStats: {
    flexDirection: "row",
    gap: 12,
  },
  matchupStat: {
    alignItems: "center",
  },
  matchupStatVal: {
    fontSize: 14,
    fontWeight: "800",
  },
  matchupStatLabel: {
    fontSize: 10,
    marginTop: 1,
  },
  matchupDivider: {
    width: 1,
    height: 80,
    marginHorizontal: 12,
    marginTop: 4,
  },
  // bases in modal matchup
  basesColumn: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
    marginHorizontal: 10,
    gap: 5,
  },
  basesMiddleRow: {
    flexDirection: "row",
    gap: 27.5,
  },
  baseDiamond: {
    width: 20,
    height: 20,
    borderRadius: 2,
    transform: [{ rotate: "45deg" }],
  },
  base2nd: {
    // just reuses baseDiamond
  },
});

// ─── Luminance helper: picks black or white text for a given bg hex ───────────
const getTextOnColor = (hex) => {
  if (!hex || !hex.startsWith("#")) return "#ffffff";
  const c = hex.replace("#", "");
  const r = parseInt(c.substr(0, 2), 16) / 255;
  const g = parseInt(c.substr(2, 2), 16) / 255;
  const b = parseInt(c.substr(4, 2), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? "#000000" : "#ffffff";
};

// ─── Ball / Strike circle row ────────────────────────────────────────────────
const CountIndicator = ({ balls, strikes, theme, onColor }) => {
  // On scoring cards use the contrast color; otherwise use semantic colors
  const ballColor = onColor ?? theme.success ?? "#22c55e";
  const strikeColor = onColor ?? theme.error ?? "#ef4444";
  const labelColor = onColor ?? theme.textSecondary;

  return (
    <View style={plStyles.countBlock}>
      {/* Balls row */}
      <View style={plStyles.countRow}>
        <Text style={[plStyles.countLabel, { color: labelColor }]}>B</Text>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              plStyles.countDot,
              {
                backgroundColor: i < balls ? ballColor : "transparent",
                borderColor: ballColor,
              },
            ]}
          />
        ))}
      </View>
      {/* Strikes row */}
      <View style={plStyles.countRow}>
        <Text style={[plStyles.countLabel, { color: labelColor }]}>S</Text>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              plStyles.countDot,
              {
                backgroundColor: i < strikes ? strikeColor : "transparent",
                borderColor: strikeColor,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
};

// ─── Plays panel ─────────────────────────────────────────────────────────────
const PlaysPanel = ({
  allPlays,
  awayTeam,
  homeTeam,
  awayColor,
  homeColor,
  playersMap,
  boxscore,
  theme,
  colors,
}) => {
  const [selectedPlay, setSelectedPlay] = useState(null);

  // Innings sorted descending (most recent first)
  const innings = useMemo(() => {
    return [
      ...new Set((allPlays ?? []).map((p) => p?.about?.inning).filter(Boolean)),
    ].sort((a, b) => b - a);
  }, [allPlays]);

  // Auto-select the most recent inning on load / when innings change
  const [inningFilter, setInningFilter] = useState(null);
  useEffect(() => {
    if (innings.length > 0) {
      setInningFilter((prev) =>
        prev == null || !innings.includes(prev) ? innings[0] : prev,
      );
    }
  }, [innings]);

  const plays = useMemo(() => {
    if (inningFilter == null) return [];
    return [...(allPlays ?? [])]
      .filter((p) => p?.about?.inning === inningFilter)
      .reverse();
  }, [allPlays, inningFilter]);

  return (
    <View style={{ paddingBottom: 24 }}>
      {/* ── Inning filter ── styled like the Away/Home section toggle */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={plStyles.filterScroll}
        contentContainerStyle={plStyles.filterRow}
      >
        {innings.map((item) => {
          const active = inningFilter === item;
          return (
            <TouchableOpacity
              key={String(item)}
              onPress={() => setInningFilter(item)}
              style={[plStyles.filterChip, active && plStyles.filterChipActive]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  plStyles.filterChipLabel,
                  {
                    color: active ? theme.text : theme.textSecondary,
                  },
                ]}
              >
                {`Inn. ${item}`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Play list ── */}
      {plays.length === 0 ? (
        <Text style={[plStyles.empty, { color: theme.textSecondary }]}>
          No plays available.
        </Text>
      ) : (
        plays.map((play, idx) => {
          const isTop = play?.about?.isTopInning !== false;
          const teamColor = isTop ? awayColor : homeColor;
          const teamAbbr = isTop
            ? (awayTeam?.abbreviation ?? "")
            : (homeTeam?.abbreviation ?? "");
          const inning = play?.about?.inning;
          const event = play?.result?.event ?? ""; // Resolve batter + pitcher from playersMap
          const batterId = play?.matchup?.batter?.id;
          const pitcherId = play?.matchup?.pitcher?.id;
          const batterInfo = resolvePlayer(playersMap, batterId);
          const pitcherInfo = resolvePlayer(playersMap, pitcherId);
          const description =
            play?.result?.description ??
            `${batterInfo?.fullName ?? "Batter"} vs ${pitcherInfo?.fullName ?? "Pitcher"}`;
          const isScoringPlay = play?.about?.isScoringPlay === true;
          const awayScore = play?.result?.awayScore;
          const homeScore = play?.result?.homeScore;
          const balls = play?.count?.balls ?? 0;
          const strikes = play?.count?.strikes ?? 0;
          const outs = play?.count?.outs;

          // Scoring plays: fill card with team color, compute contrast text
          const onColor = isScoringPlay ? getTextOnColor(teamColor) : null;
          const cardBg = isScoringPlay ? teamColor : theme.surface;
          const cardBorderColor = isScoringPlay ? teamColor : theme.border;
          const cardBorderLeftColor = isScoringPlay ? teamColor : teamColor;

          const primaryText = onColor ?? theme.text;
          const secondaryText = onColor ? `${onColor}cc` : theme.textSecondary;
          const tertiaryText = onColor ? `${onColor}99` : theme.textTertiary;

          return (
            <TouchableOpacity
              key={idx}
              onPress={() => setSelectedPlay(play)}
              activeOpacity={0.75}
            >
              <View
                style={[
                  plStyles.playCard,
                  {
                    backgroundColor: cardBg,
                    borderColor: cardBorderColor,
                    borderLeftColor: cardBorderLeftColor,
                  },
                ]}
              >
                {/* Header row */}
                <View style={plStyles.playHeader}>
                  <View style={plStyles.playMeta}>
                    <Text
                      style={[
                        plStyles.playInning,
                        { color: isScoringPlay ? onColor : theme.text },
                      ]}
                    >
                      {isTop ? "▲" : "▼"} {toOrdinal(inning)}
                    </Text>
                    {!!teamAbbr && (
                      <Text
                        style={[plStyles.playTeam, { color: secondaryText }]}
                      >
                        {teamAbbr}
                      </Text>
                    )}
                  </View>
                  <View style={plStyles.playRight}>
                    {isScoringPlay && (
                      <Text
                        style={[
                          plStyles.scoringBadge,
                          { color: isScoringPlay ? onColor : teamColor },
                        ]}
                      >
                        SCORES
                      </Text>
                    )}
                    {outs != null && (
                      <Text
                        style={[plStyles.outsLabel, { color: tertiaryText }]}
                      >
                        {outs} {outs === 1 ? "out" : "outs"}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Event */}
                {!!event && (
                  <Text style={[plStyles.eventLabel, { color: primaryText }]}>
                    {event}
                  </Text>
                )}

                {/* Description */}
                {!!description && (
                  <Text
                    style={[plStyles.description, { color: secondaryText }]}
                  >
                    {description}
                  </Text>
                )}

                {/* Bottom row: score stack + count indicator */}
                <View style={plStyles.bottomRow}>
                  {/* Score stack */}
                  {awayScore != null && homeScore != null && (
                    <View style={plStyles.scoreBlock}>
                      <View style={plStyles.scoreTeamRow}>
                        <Text
                          style={[
                            plStyles.scoreAbbr,
                            {
                              color: isScoringPlay ? `${onColor}bb` : awayColor,
                            },
                          ]}
                        >
                          {awayTeam?.abbreviation ?? "Away"}
                        </Text>
                        <Text
                          style={[plStyles.scoreNum, { color: primaryText }]}
                        >
                          {awayScore}
                        </Text>
                      </View>
                      <View style={plStyles.scoreTeamRow}>
                        <Text
                          style={[
                            plStyles.scoreAbbr,
                            {
                              color: isScoringPlay ? `${onColor}bb` : homeColor,
                            },
                          ]}
                        >
                          {homeTeam?.abbreviation ?? "Home"}
                        </Text>
                        <Text
                          style={[plStyles.scoreNum, { color: primaryText }]}
                        >
                          {homeScore}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Bases (small) */}
                  <View style={plStyles.basesSmall}>
                    <View
                      style={[
                        plStyles.baseDiamondSmall,
                        play?.matchup?.postOnSecond
                          ? [
                              plStyles.baseOccupied,
                              {
                                backgroundColor: isScoringPlay
                                  ? primaryText
                                  : teamColor,
                              },
                            ]
                          : [plStyles.baseEmpty, { borderColor: tertiaryText }],
                      ]}
                    />
                    <View style={plStyles.basesSmallRow}>
                      <View
                        style={[
                          plStyles.baseDiamondSmall,
                          play?.matchup?.postOnThird
                            ? [
                                plStyles.baseOccupied,
                                {
                                  backgroundColor: isScoringPlay
                                    ? primaryText
                                    : teamColor,
                                },
                              ]
                            : [
                                plStyles.baseEmpty,
                                { borderColor: tertiaryText },
                              ],
                        ]}
                      />
                      <View
                        style={[
                          plStyles.baseDiamondSmall,
                          play?.matchup?.postOnFirst
                            ? [
                                plStyles.baseOccupied,
                                {
                                  backgroundColor: isScoringPlay
                                    ? primaryText
                                    : teamColor,
                                },
                              ]
                            : [
                                plStyles.baseEmpty,
                                { borderColor: tertiaryText },
                              ],
                        ]}
                      />
                    </View>
                  </View>

                  {/* Count indicator */}
                  <CountIndicator
                    balls={balls}
                    strikes={strikes}
                    theme={theme}
                    onColor={onColor}
                  />
                </View>
              </View>
            </TouchableOpacity>
          );
        })
      )}
      {/* Play detail modal */}
      <PlayDetailModal
        play={selectedPlay}
        awayTeam={awayTeam}
        homeTeam={homeTeam}
        awayColor={awayColor}
        homeColor={homeColor}
        playersMap={playersMap}
        boxscore={boxscore}
        theme={theme}
        colors={colors}
        visible={selectedPlay != null}
        onClose={() => setSelectedPlay(null)}
      />
    </View>
  );
};

const plStyles = StyleSheet.create({
  // ── filter ──
  filterScroll: {
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 4,
    borderRadius: 10,
    backgroundColor: "rgba(128,128,128,0.1)",
    padding: 3,
  },
  filterRow: {
    flexDirection: "row",
    gap: 4,
  },
  filterChip: {
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  filterChipActive: {
    backgroundColor: "rgba(128,128,128,0.25)",
  },
  filterChipLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  // ── play cards ──
  playCard: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 12,
  },
  playHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  playMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  playInning: {
    fontSize: 12,
    fontWeight: "800",
  },
  playTeam: {
    fontSize: 11,
    fontWeight: "600",
  },
  playRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scoringBadge: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  outsLabel: {
    fontSize: 10,
  },
  eventLabel: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  // ── bottom row: score + count ──
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 8,
  },
  scoreBlock: {
    gap: 4,
  },
  scoreTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scoreAbbr: {
    fontSize: 11,
    fontWeight: "700",
    width: 28,
  },
  scoreNum: {
    fontSize: 15,
    fontWeight: "800",
  },
  // ── count indicator ──
  countBlock: {
    alignItems: "flex-end",
    gap: 5,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  countLabel: {
    fontSize: 10,
    fontWeight: "800",
    width: 10,
    marginRight: 2,
  },
  countDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  // ── misc ──
  empty: {
    textAlign: "center",
    marginTop: 32,
    fontSize: 14,
  },
  // bases (small) in play card
  basesSmall: {
    alignItems: "center",
    gap: 3,
    marginBottom: 6,
  },
  basesSmallRow: {
    flexDirection: "row",
    gap: 15,
  },
  baseDiamondSmall: {
    width: 10,
    height: 10,
    borderRadius: 0.5,
    transform: [{ rotate: "45deg" }],
  },
  baseOccupied: {
    // backgroundColor applied inline
  },
  baseEmpty: {
    backgroundColor: "transparent",
    borderWidth: 1,
  },
});

// Short game time: "Mar 3 · 8:08 PM"
const fmtGameTime = (isoString) => {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  const yr = d.getUTCFullYear();
  const march1 = new Date(Date.UTC(yr, 2, 1));
  const edtStart = new Date(
    Date.UTC(yr, 2, 8 + ((7 - march1.getUTCDay()) % 7), 7),
  );
  const nov1 = new Date(Date.UTC(yr, 10, 1));
  const edtEnd = new Date(
    Date.UTC(yr, 10, 1 + ((7 - nov1.getUTCDay()) % 7), 6),
  );
  const offsetMs = d >= edtStart && d < edtEnd ? -4 * 3600000 : -5 * 3600000;
  const local = new Date(d.getTime() + offsetMs);
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = MONTHS[local.getUTCMonth()];
  const day = local.getUTCDate();
  let hr = local.getUTCHours();
  const min = local.getUTCMinutes().toString().padStart(2, "0");
  const ampm = hr >= 12 ? "PM" : "AM";
  hr = hr % 12 || 12;
  return `${month} ${day} \u00b7 ${hr}:${min} ${ampm}`;
};

// ─── Center status badge ──────────────────────────────────────────────────────
const StatusBadge = ({ status, linescore, gameDateTime, theme }) => {
  const state = status?.detailedState || "";
  const isLive = !["S", "P", "D", "C", "O", "F", "Q", "R"].includes(
    status?.codedGameState,
  );
  const inning = linescore?.currentInning;
  const inningState = linescore?.inningState;
  const gameTimeStr = fmtGameTime(gameDateTime);

  let topLabel = state;
  let bottomLabel = "";

  if (isLive && inning) {
    topLabel = state.startsWith("In Progress") ? "In Progress" : state;
    bottomLabel = "";
  } else if (state === "Final") {
    topLabel = "Final";
    if (inning && inning !== 9) bottomLabel = `F/${inning}`;
  }

  return (
    <View style={styles.statusBadge}>
      {isLive && inning != null && (
        <Text style={[styles.inningLabel, { color: theme.text }]}>
          {linescore?.isTopInning === false ? "Bot" : "Top"} {toOrdinal(inning)}
        </Text>
      )}
      {!isLive && !!gameTimeStr && (
        <Text
          style={[styles.gameTimeLabel, { color: theme.text }]}
          numberOfLines={1}
        >
          {gameTimeStr}
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
    </View>
  );
};

// ─── Game Info helpers ──────────────────────────────────────────────────────
const utcToEastern = (isoString) => {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  // Determine US Eastern offset: EDT starts 2nd Sun of March, EST resumes 1st Sun of Nov.
  const yr = d.getUTCFullYear();
  // 2nd Sunday of March
  const march1 = new Date(Date.UTC(yr, 2, 1));
  const edtStart = new Date(
    Date.UTC(yr, 2, 8 + ((7 - march1.getUTCDay()) % 7), 7),
  ); // 2:00 AM EST → 7:00 UTC
  // 1st Sunday of November
  const nov1 = new Date(Date.UTC(yr, 10, 1));
  const edtEnd = new Date(
    Date.UTC(yr, 10, 1 + ((7 - nov1.getUTCDay()) % 7), 6),
  ); // 2:00 AM EDT → 6:00 UTC
  const offsetMs = d >= edtStart && d < edtEnd ? -4 * 3600000 : -5 * 3600000;
  const suffix = d >= edtStart && d < edtEnd ? "EDT" : "EST";
  const local = new Date(d.getTime() + offsetMs);
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = MONTHS[local.getUTCMonth()];
  const day = local.getUTCDate();
  const year = local.getUTCFullYear();
  let hr = local.getUTCHours();
  const min = local.getUTCMinutes().toString().padStart(2, "0");
  const ampm = hr >= 12 ? "PM" : "AM";
  hr = hr % 12 || 12;
  return `${month} ${day}, ${year} @ ${hr}:${min} ${ampm} ${suffix}`;
};

const fmtDuration = (mins) => {
  if (mins == null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}hr ${m}m` : `${m}m`;
};

// ─── Game Info Bubble ────────────────────────────────────────────────────────
const OFFICIAL_TYPE_LABEL = {
  "Home Plate": "Home",
  "First Base": "1st Base",
  "Second Base": "2nd Base",
  "Third Base": "3rd Base",
};
const OFFICIAL_TYPE_ORDER = [
  "Home Plate",
  "First Base",
  "Second Base",
  "Third Base",
];

const GameInfoBubble = ({ gameData, officials, theme }) => {
  const venueObj = gameData?.venue ?? {};
  const venueName = venueObj?.name ?? null;
  const fi = venueObj?.fieldInfo ?? {};
  const weather = gameData?.weather ?? {};
  const gameInfo = gameData?.gameInfo ?? {};

  const hasVenue = !!(venueName || Object.keys(fi).length);
  const hasWeather = !!(weather.condition || weather.temp || weather.wind);
  const hasGame = !!(
    gameInfo.firstPitch ||
    gameInfo.gameDurationMinutes != null ||
    gameInfo.attendance != null
  );
  const officialList = (officials ?? []).filter(
    (o) => OFFICIAL_TYPE_LABEL[o?.officialType],
  );
  const hasOfficials = officialList.length > 0;

  if (!hasVenue && !hasWeather && !hasGame && !hasOfficials) return null;

  const borderCol = theme.border ?? "rgba(128,128,128,0.2)";
  const divider = (
    <View style={[giStyles.divider, { backgroundColor: borderCol }]} />
  );

  const StatCell = ({ label, value }) => (
    <View style={giStyles.statCell}>
      <Text style={[giStyles.statVal, { color: theme.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[giStyles.statLbl, { color: theme.textSecondary }]}>
        {label}
      </Text>
    </View>
  );

  const SectionHeader = ({ title }) => (
    <Text style={[giStyles.sectionHdr, { color: theme.textSecondary }]}>
      {title.toUpperCase()}
    </Text>
  );

  return (
    <View style={[giStyles.bubble, { backgroundColor: theme.surface }]}>
      {/* ── Header ── */}
      <View style={[giStyles.header, { borderBottomColor: borderCol }]}>
        <Text style={[giStyles.headerTitle, { color: theme.text }]}>
          Game Info
        </Text>
      </View>

      {/* ── Venue ── */}
      {hasVenue && (
        <View style={giStyles.section}>
          <SectionHeader title="Venue" />
          {!!venueName && (
            <Text
              style={[giStyles.venueName, { color: theme.text }]}
              numberOfLines={2}
            >
              {venueName}
            </Text>
          )}
          {/* Row 1: Capacity / Turf / Roof */}
          {(fi.capacity != null || fi.turfType || fi.roofType) && (
            <View style={giStyles.statRow}>
              {fi.capacity != null && (
                <StatCell
                  label="Capacity"
                  value={fi.capacity.toLocaleString()}
                />
              )}
              {!!fi.turfType && (
                <StatCell label="Surface" value={fi.turfType} />
              )}
              {!!fi.roofType && <StatCell label="Roof" value={fi.roofType} />}
            </View>
          )}
          {/* Row 2: field distances (leftLine - left - center - right - rightLine) */}
          {(fi.leftLine != null ||
            fi.left != null ||
            fi.center != null ||
            fi.right != null ||
            fi.rightLine != null) && (
            <View style={[giStyles.statRow, { marginTop: 8 }]}>
              {fi.leftLine != null && (
                <StatCell label="LF Line" value={`${fi.leftLine}ft`} />
              )}
              {fi.left != null && (
                <StatCell label="LF" value={`${fi.left}ft`} />
              )}
              {fi.center != null && (
                <StatCell label="CF" value={`${fi.center}ft`} />
              )}
              {fi.right != null && (
                <StatCell label="RF" value={`${fi.right}ft`} />
              )}
              {fi.rightLine != null && (
                <StatCell label="RF Line" value={`${fi.rightLine}ft`} />
              )}
            </View>
          )}
        </View>
      )}

      {/* ── Weather ── */}
      {hasVenue && hasWeather && divider}
      {hasWeather && (
        <View style={giStyles.section}>
          <SectionHeader title="Weather" />
          <View style={giStyles.statRow}>
            {!!weather.condition && (
              <StatCell label="Condition" value={weather.condition} />
            )}
            {!!weather.temp && (
              <StatCell label="Temp" value={`${weather.temp}°F`} />
            )}
            {!!weather.wind && <StatCell label="Wind" value={weather.wind} />}
          </View>
        </View>
      )}

      {/* ── Game Info ── */}
      {(hasVenue || hasWeather) && hasGame && divider}
      {hasGame && (
        <View style={giStyles.section}>
          <SectionHeader title="Game" />
          {!!gameInfo.firstPitch && (
            <View style={giStyles.fullRowCentered}>
              <Text style={[giStyles.statLbl, { color: theme.textSecondary }]}>
                First Pitch
              </Text>
              <Text style={[giStyles.firstPitchVal, { color: theme.text }]}>
                {utcToEastern(gameInfo.firstPitch)}
              </Text>
            </View>
          )}
          <View
            style={[
              giStyles.statRow,
              { marginTop: gameInfo.firstPitch ? 8 : 0 },
            ]}
          >
            {gameInfo.gameDurationMinutes != null && (
              <StatCell
                label="Duration"
                value={fmtDuration(gameInfo.gameDurationMinutes)}
              />
            )}
            {gameInfo.attendance != null && (
              <StatCell
                label="Attendance"
                value={gameInfo.attendance.toLocaleString()}
              />
            )}
          </View>
        </View>
      )}

      {/* ── Officials ── */}
      {(hasVenue || hasWeather || hasGame) && hasOfficials && divider}
      {hasOfficials && (
        <View style={giStyles.section}>
          <SectionHeader title="Umpires" />
          <View style={giStyles.officialsRow}>
            {OFFICIAL_TYPE_ORDER.map((type) => {
              const entry = officialList.find((o) => o.officialType === type);
              if (!entry) return null;
              const words = (entry.official?.fullName ?? "—").split(" ");
              const split = Math.ceil(words.length / 2);
              const line1 = words.slice(0, split).join(" ");
              const line2 = words.slice(split).join(" ") || " ";
              return (
                <View key={type} style={giStyles.officialCell}>
                  <Text style={[giStyles.officialName, { color: theme.text }]}>
                    {line1}
                  </Text>
                  <Text style={[giStyles.officialName, { color: theme.text }]}>
                    {line2}
                  </Text>
                  <Text
                    style={[
                      giStyles.officialType,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {OFFICIAL_TYPE_LABEL[type]}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
};

const giStyles = StyleSheet.create({
  bubble: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  section: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sectionHdr: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  venueName: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
    lineHeight: 18,
  },
  statRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  statCell: {
    flex: 1,
    minWidth: 52,
    alignItems: "center",
    paddingVertical: 4,
  },
  statVal: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  statLbl: {
    fontSize: 10,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  fullRow: {
    marginBottom: 2,
  },
  fullRowCentered: {
    marginBottom: 2,
    alignItems: "center",
  },
  firstPitchVal: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
    textAlign: "center",
  },
  officialsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 4,
  },
  officialCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  officialName: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 15,
  },
  officialType: {
    fontSize: 10,
    fontWeight: "500",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginTop: 4,
  },
});

// ─── Linescore Bubble ───────────────────────────────────────────────────────
const LinescoreBubble = ({
  linescore,
  awayTeam,
  homeTeam,
  awayColor,
  homeColor,
  theme,
}) => {
  const innings = linescore?.innings ?? [];
  const awayTotals = linescore?.teams?.away ?? {};
  const homeTotals = linescore?.teams?.home ?? {};

  if (innings.length === 0) return null;

  const CELL_W = 30; // minimum inning cell width
  const ROW_H = 34; // row height
  const LABEL_W = 44; // team abbr column width
  const TOTAL_W = 32; // R/H/E column width

  // Measure the available width for the innings area so we can stretch cells
  // to fill when there aren't enough innings to make it scrollable.
  const [availableW, setAvailableW] = React.useState(0);
  const cellW =
    availableW > 0 && innings.length > 0
      ? Math.max(CELL_W, availableW / innings.length)
      : CELL_W;

  const headerBg = theme.surfaceSecondary ?? "rgba(128,128,128,0.08)";
  const borderCol = theme.border ?? "rgba(128,128,128,0.2)";

  return (
    <View style={[lsStyles.bubble, { backgroundColor: theme.surface }]}>
      {/* ── outer row: [fixed left] [scrollable innings] [fixed totals] ── */}
      <View style={{ flexDirection: "row" }}>
        {/* ── Fixed left: team abbreviations ── */}
        <View style={{ width: LABEL_W }}>
          {/* header spacer */}
          <View
            style={[
              lsStyles.cell,
              {
                height: ROW_H,
                borderBottomColor: borderCol,
                backgroundColor: headerBg,
              },
            ]}
          />
          {/* away abbr */}
          <View
            style={[
              lsStyles.cell,
              {
                height: ROW_H,
                borderBottomColor: awayColor,
                borderBottomWidth: 2,
                backgroundColor: theme.surface,
              },
            ]}
          >
            <Text
              style={[lsStyles.teamAbbr, { color: theme.text }]}
              numberOfLines={1}
            >
              {awayTeam?.abbreviation ?? "AWY"}
            </Text>
          </View>
          {/* home abbr */}
          <View
            style={[
              lsStyles.cell,
              {
                height: ROW_H,
                borderBottomColor: homeColor,
                borderBottomWidth: 2,
                backgroundColor: theme.surface,
              },
            ]}
          >
            <Text
              style={[lsStyles.teamAbbr, { color: theme.text }]}
              numberOfLines={1}
            >
              {homeTeam?.abbreviation ?? "HME"}
            </Text>
          </View>
        </View>

        {/* ── Scrollable inning columns ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexDirection: "column" }}
          onLayout={(e) => setAvailableW(e.nativeEvent.layout.width)}
        >
          {/* inning number header row */}
          <View style={{ flexDirection: "row" }}>
            {innings.map((inn) => (
              <View
                key={`hdr-${inn.num}`}
                style={[
                  lsStyles.cell,
                  {
                    width: cellW,
                    height: ROW_H,
                    backgroundColor: headerBg,
                    borderBottomColor: borderCol,
                  },
                ]}
              >
                <Text
                  style={[lsStyles.inningNum, { color: theme.textSecondary }]}
                >
                  {inn.num}
                </Text>
              </View>
            ))}
          </View>

          {/* away runs row */}
          <View style={{ flexDirection: "row" }}>
            {innings.map((inn) => (
              <View
                key={`away-${inn.num}`}
                style={[
                  lsStyles.cell,
                  {
                    width: cellW,
                    height: ROW_H,
                    borderBottomColor: awayColor,
                    borderBottomWidth: 2,
                  },
                ]}
              >
                <Text style={[lsStyles.runsText, { color: theme.text }]}>
                  {inn.away?.runs ?? "-"}
                </Text>
              </View>
            ))}
          </View>

          {/* home runs row */}
          <View style={{ flexDirection: "row" }}>
            {innings.map((inn) => (
              <View
                key={`home-${inn.num}`}
                style={[
                  lsStyles.cell,
                  {
                    width: cellW,
                    height: ROW_H,
                    borderBottomColor: homeColor,
                    borderBottomWidth: 2,
                  },
                ]}
              >
                <Text style={[lsStyles.runsText, { color: theme.text }]}>
                  {inn.home?.runs ?? "-"}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* ── Fixed right: R / H / E totals ── */}
        <View style={[lsStyles.totalsSection, { borderLeftColor: borderCol }]}>
          {/* totals header */}
          <View
            style={[
              lsStyles.totalsRow,
              {
                height: ROW_H,
                backgroundColor: headerBg,
                borderBottomColor: borderCol,
              },
            ]}
          >
            {["R", "H", "E"].map((label) => (
              <View
                key={label}
                style={{ width: TOTAL_W, alignItems: "center" }}
              >
                <Text
                  style={[lsStyles.totalHeader, { color: theme.textSecondary }]}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>

          {/* away totals */}
          <View
            style={[
              lsStyles.totalsRow,
              {
                height: ROW_H,
                borderBottomColor: awayColor,
                borderBottomWidth: 2,
              },
            ]}
          >
            {[
              awayTotals.runs ?? "-",
              awayTotals.hits ?? "-",
              awayTotals.errors ?? "-",
            ].map((val, i) => (
              <View key={i} style={{ width: TOTAL_W, alignItems: "center" }}>
                <Text style={[lsStyles.totalVal, { color: theme.text }]}>
                  {val}
                </Text>
              </View>
            ))}
          </View>

          {/* home totals */}
          <View
            style={[
              lsStyles.totalsRow,
              {
                height: ROW_H,
                borderBottomColor: homeColor,
                borderBottomWidth: 2,
              },
            ]}
          >
            {[
              homeTotals.runs ?? "-",
              homeTotals.hits ?? "-",
              homeTotals.errors ?? "-",
            ].map((val, i) => (
              <View key={i} style={{ width: TOTAL_W, alignItems: "center" }}>
                <Text style={[lsStyles.totalVal, { color: theme.text }]}>
                  {val}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
};

const lsStyles = StyleSheet.create({
  bubble: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
  },
  cell: {
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
  },
  teamAbbr: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
    paddingHorizontal: 4,
    textAlign: "center",
  },
  inningNum: {
    fontSize: 11,
    fontWeight: "600",
  },
  runsText: {
    fontSize: 13,
    fontWeight: "700",
  },
  totalsSection: {
    borderLeftWidth: 1,
    flexDirection: "column",
  },
  totalsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
  },
  totalHeader: {
    fontSize: 11,
    fontWeight: "700",
  },
  totalVal: {
    fontSize: 13,
    fontWeight: "700",
  },
});

// ─── Probable Pitchers Bubble ────────────────────────────────────────────────
const ProbablePitchersBubble = ({
  gameData,
  playersMap,
  bsAwayTeam,
  bsHomeTeam,
  awayTeam,
  homeTeam,
  awayColor,
  homeColor,
  theme,
}) => {
  const probPitchers = gameData?.probablePitchers ?? {};
  const awayProbId = probPitchers?.away?.id ?? null;
  const homeProbId = probPitchers?.home?.id ?? null;

  if (!awayProbId && !homeProbId) return null;

  const getPlayerInfo = (id) => (id ? resolvePlayer(playersMap, id) : null);
  const getPitchingStats = (id, bsTeamData) => {
    if (!id) return null;
    const bsPlayer = bsTeamData?.players?.[`ID${id}`];
    return bsPlayer?.seasonStats?.pitching ?? bsPlayer?.stats?.pitching ?? null;
  };

  const awayInfo = getPlayerInfo(awayProbId);
  const homeInfo = getPlayerInfo(homeProbId);
  const awayStats = getPitchingStats(awayProbId, bsAwayTeam);
  const homeStats = getPitchingStats(homeProbId, bsHomeTeam);

  const PitcherCard = ({ teamColor, playerId, playerInfo, stats }) => {
    const wins = stats?.wins ?? null;
    const losses = stats?.losses ?? null;
    const era = stats?.era ?? null;
    const ip = stats?.inningsPitched ?? null;
    const wlStr = wins != null && losses != null ? `${wins}-${losses}` : "—";
    return (
      <View
        style={[
          ppStyles.card,
          { borderColor: teamColor, backgroundColor: theme.surface },
        ]}
      >
        <Text style={[ppStyles.cardLabel, { color: teamColor }]}>
          Probable Pitcher
        </Text>
        <View style={ppStyles.headshotWrap}>
          <Image
            source={{ uri: playerHeadshotUrl(playerId) }}
            style={[ppStyles.headshot, { borderColor: teamColor }]}
          />
        </View>
        <Text
          style={[ppStyles.playerName, { color: theme.text }]}
          numberOfLines={2}
        >
          {playerInfo?.fullName ?? "TBD"}
        </Text>
        <View style={ppStyles.statsRow}>
          {[
            { label: "W-L", value: wlStr },
            { label: "ERA", value: era ?? "—" },
            { label: "IP", value: ip ?? "—" },
          ].map((stat) => (
            <View key={stat.label} style={ppStyles.statCell}>
              <Text style={[ppStyles.statValue, { color: theme.text }]}>
                {stat.value}
              </Text>
              <Text
                style={[ppStyles.statLabel, { color: theme.textSecondary }]}
              >
                {stat.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={ppStyles.container}>
      <PitcherCard
        teamColor={awayColor}
        playerId={awayProbId}
        playerInfo={awayInfo}
        stats={awayStats}
      />
      <PitcherCard
        teamColor={homeColor}
        playerId={homeProbId}
        playerInfo={homeInfo}
        stats={homeStats}
      />
    </View>
  );
};

const ppStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  card: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 12,
    alignItems: "center",
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  headshotWrap: {
    marginBottom: 8,
  },
  headshot: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    backgroundColor: "rgba(128,128,128,0.1)",
  },
  playerName: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 10,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
  },
  statCell: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 14,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
});

// ─── Team Stats Bubble ────────────────────────────────────────────────────────
const fmtStatLabel = (key) =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/([0-9]+)/g, " $1")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());

const STAT_SECTIONS = [
  {
    key: "batting",
    label: "BATTING",
    stats: [
      { key: "hits", label: "Hits", lowerBetter: false },
      { key: "runs", label: "Runs", lowerBetter: false },
      { key: "homeRuns", label: "HR", lowerBetter: false },
      { key: "rbi", label: "RBI", lowerBetter: false },
      { key: "strikeOuts", label: "K", lowerBetter: true },
      { key: "baseOnBalls", label: "BB", lowerBetter: false },
      { key: "stolenBases", label: "SB", lowerBetter: false },
    ],
  },
  {
    key: "pitching",
    label: "PITCHING",
    stats: [
      { key: "strikeOuts", label: "K", lowerBetter: false },
      { key: "baseOnBalls", label: "BB", lowerBetter: true },
      { key: "hits", label: "Hits", lowerBetter: true },
      { key: "strikePercentage", label: "K%", lowerBetter: false },
    ],
  },
  {
    key: "fielding",
    label: "FIELDING",
    stats: [
      { key: "errors", label: "Errors", lowerBetter: true },
      { key: "assists", label: "Assists", lowerBetter: false },
      { key: "putOuts", label: "PO", lowerBetter: false },
      { key: "stolenBases", label: "SB", lowerBetter: true },
    ],
  },
];

const SCHEDULED_STAT_SECTIONS = [
  {
    key: "batting",
    label: "BATTING",
    stats: [
      { key: "avg", label: "AVG", lowerBetter: false },
      { key: "obp", label: "OBP", lowerBetter: false },
      { key: "slg", label: "SLG", lowerBetter: false },
      { key: "ops", label: "OPS", lowerBetter: false },
    ],
  },
  {
    key: "pitching",
    label: "PITCHING",
    stats: [
      { key: "era", label: "ERA", lowerBetter: true },
      { key: "whip", label: "WHIP", lowerBetter: true },
    ],
  },
];

const TeamStatsBubble = ({
  awayTeam,
  homeTeam,
  awayColor,
  homeColor,
  bsAwayTeam,
  bsHomeTeam,
  isScheduled,
  theme,
}) => {
  const awayTs = bsAwayTeam?.teamStats ?? {};
  const homeTs = bsHomeTeam?.teamStats ?? {};

  const activeSections = isScheduled ? SCHEDULED_STAT_SECTIONS : STAT_SECTIONS;

  const sections = activeSections
    .map((sec) => {
      const aw = awayTs[sec.key] ?? {};
      const hm = homeTs[sec.key] ?? {};
      const rows = sec.stats.filter(
        (s) => aw[s.key] != null || hm[s.key] != null,
      );
      return { ...sec, rows, aw, hm };
    })
    .filter((sec) => sec.rows.length > 0);

  if (sections.length === 0) return null;

  return (
    <View style={[tsStyles.container, { backgroundColor: theme.surface }]}>
      {sections.map((sec, si) => (
        <View key={sec.key}>
          {si > 0 && (
            <View
              style={[
                tsStyles.sectionDivider,
                { backgroundColor: theme.border },
              ]}
            />
          )}

          {/* Section header: away abbr — CATEGORY — home abbr */}
          <View style={tsStyles.sectionHeader}>
            <Text
              style={[tsStyles.teamAbbr, { color: awayColor }]}
              numberOfLines={1}
            >
              {awayTeam?.abbreviation ?? ""}
            </Text>
            <Text
              style={[
                tsStyles.sectionLabel,
                { color: theme.subText ?? theme.textSecondary },
              ]}
            >
              {sec.label}
            </Text>
            <Text
              style={[
                tsStyles.teamAbbr,
                { color: homeColor, textAlign: "right" },
              ]}
              numberOfLines={1}
            >
              {homeTeam?.abbreviation ?? ""}
            </Text>
          </View>

          {/* Stat comparison rows */}
          {sec.rows.map((s, ri) => {
            const aRaw = sec.aw[s.key];
            const hRaw = sec.hm[s.key];
            const aNum = parseFloat(aRaw) || 0;
            const hNum = parseFloat(hRaw) || 0;
            const total = aNum + hNum;

            // awayFrac: fraction of bar filled from away (left) side
            // lowerBetter → winning side is the one with lower value,
            //   so give more bar space to the team with the lower value
            let awayFrac =
              total === 0
                ? 0.5
                : s.lowerBetter
                  ? hNum / total // away lower → away gets hNum/(a+h) portion (bigger if away is smaller)
                  : aNum / total; // higher is better → straight proportion

            awayFrac = Math.max(0.05, Math.min(0.95, awayFrac));

            return (
              <View
                key={s.key}
                style={[tsStyles.statRow, { marginTop: ri === 0 ? 0 : 10 }]}
              >
                {/* Away value */}
                <Text
                  style={[
                    tsStyles.statVal,
                    { color: theme.text, textAlign: "right" },
                  ]}
                  numberOfLines={1}
                >
                  {aRaw ?? "—"}
                </Text>

                {/* Split bar + label */}
                <View style={tsStyles.barWrap}>
                  <View style={tsStyles.barTrack}>
                    <View
                      style={[
                        tsStyles.barSegment,
                        { flex: awayFrac, backgroundColor: awayColor },
                      ]}
                    />
                    <View
                      style={[
                        tsStyles.barDivider,
                        { backgroundColor: theme.card },
                      ]}
                    />
                    <View
                      style={[
                        tsStyles.barSegment,
                        { flex: 1 - awayFrac, backgroundColor: homeColor },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      tsStyles.barLabel,
                      { color: theme.subText ?? theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {s.label ?? fmtStatLabel(s.key)}
                  </Text>
                </View>

                {/* Home value */}
                <Text
                  style={[
                    tsStyles.statVal,
                    { color: theme.text, textAlign: "left" },
                  ]}
                  numberOfLines={1}
                >
                  {hRaw ?? "—"}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const tsStyles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  sectionDivider: {
    height: 1,
    marginVertical: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  teamAbbr: {
    width: 40,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textAlign: "center",
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statVal: {
    width: 40,
    fontSize: 13,
    fontWeight: "600",
  },
  barWrap: {
    flex: 1,
    marginHorizontal: 8,
    alignItems: "center",
  },
  barTrack: {
    flexDirection: "row",
    width: "100%",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  barSegment: {
    height: 8,
  },
  barDivider: {
    width: 2,
    height: 8,
  },
  barLabel: {
    fontSize: 10,
    fontWeight: "500",
    marginTop: 3,
  },
});

// ─── Last Play Bubble ───────────────────────────────────────────────────────
const LastPlayBubble = ({ allPlays, playersMap, awayTeam, homeTeam, awayColor, homeColor, theme }) => {
  const lastPlay = useMemo(() => {
    if (!allPlays?.length) return null;
    for (let i = allPlays.length - 1; i >= 0; i--) {
      const p = allPlays[i];
      if (p?.result?.event) return p;
    }
    return null;
  }, [allPlays]);

  if (!lastPlay) return null;

  const isTop = lastPlay?.about?.isTopInning !== false;
  const teamColor = isTop ? awayColor : homeColor;
  const battingAbbr = isTop ? (awayTeam?.abbreviation ?? "") : (homeTeam?.abbreviation ?? "");
  const inning = lastPlay?.about?.inning;
  const halfInning = isTop ? "\u25b2" : "\u25bc";
  const event = lastPlay?.result?.event ?? "";
  const description = lastPlay?.result?.description ?? "";
  const isScoringPlay = lastPlay?.about?.isScoringPlay === true;
  const awayScoreVal = lastPlay?.result?.awayScore;
  const homeScoreVal = lastPlay?.result?.homeScore;
  const batterId = lastPlay?.matchup?.batter?.id;
  const pitcherId = lastPlay?.matchup?.pitcher?.id;
  const batterInfo = resolvePlayer(playersMap, batterId);
  const pitcherInfo = resolvePlayer(playersMap, pitcherId);

  return (
    <View style={[lpStyles.bubble, { backgroundColor: theme.surface, borderColor: teamColor }]}>
      <View style={[lpStyles.header, { borderBottomColor: theme.border, backgroundColor: teamColor + "18" }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={[lpStyles.teamBadge, { backgroundColor: teamColor }]}>
            <Text style={lpStyles.teamBadgeText}>{battingAbbr}</Text>
          </View>
          <Text style={[lpStyles.inningLabel, { color: theme.text }]}>
            {halfInning}{inning ? ` ${toOrdinal(inning)}` : ""}
          </Text>
          {isScoringPlay && (
            <View style={[lpStyles.scoringBadge, { backgroundColor: teamColor + "22", borderColor: teamColor }]}>
              <Text style={[lpStyles.scoringBadgeText, { color: teamColor }]}>SCORING PLAY</Text>
            </View>
          )}
        </View>
        {awayScoreVal != null && homeScoreVal != null && (
          <Text style={[lpStyles.scoreText, { color: theme.textSecondary }]}>
            {awayTeam?.abbreviation ?? ""} {awayScoreVal} - {homeScoreVal} {homeTeam?.abbreviation ?? ""}
          </Text>
        )}
      </View>
      <View style={lpStyles.body}>
        <Text style={[lpStyles.eventText, { color: teamColor }]}>{event}</Text>
        {!!description && (
          <Text style={[lpStyles.descText, { color: theme.textSecondary }]} numberOfLines={4}>{description}</Text>
        )}
        {(batterInfo || pitcherInfo) && (
          <View style={[lpStyles.matchupRow, { borderTopColor: theme.border }]}>
            {batterInfo ? (
              <View style={lpStyles.matchupSide}>
                <Image
                  source={{ uri: playerHeadshotUrl(batterId) }}
                  style={[lpStyles.matchupHeadshot, { borderColor: teamColor }]}
                />
                <View>
                  <Text style={[lpStyles.matchupName, { color: theme.text }]} numberOfLines={1}>{batterInfo.fullName}</Text>
                  <Text style={[lpStyles.matchupRole, { color: theme.textSecondary }]}>Batter</Text>
                </View>
              </View>
            ) : <View style={{ flex: 1 }} />}
            {pitcherInfo ? (
              <View style={[lpStyles.matchupSide, { justifyContent: "flex-end" }]}>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[lpStyles.matchupName, { color: theme.text }]} numberOfLines={1}>{pitcherInfo.fullName}</Text>
                  <Text style={[lpStyles.matchupRole, { color: theme.textSecondary }]}>Pitcher</Text>
                </View>
                <Image
                  source={{ uri: playerHeadshotUrl(pitcherId) }}
                  style={[lpStyles.matchupHeadshot, { borderColor: isTop ? homeColor : awayColor }]}
                />
              </View>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
};

const lpStyles = StyleSheet.create({
  bubble: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1.5,
    marginBottom: 12,
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  teamBadge: {
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  teamBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.4,
  },
  inningLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  scoringBadge: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  scoringBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  scoreText: {
    fontSize: 12,
    fontWeight: "700",
  },
  body: {
    padding: 14,
  },
  eventText: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 5,
  },
  descText: {
    fontSize: 13,
    lineHeight: 18,
  },
  matchupRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  matchupSide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  matchupHeadshot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    backgroundColor: "rgba(128,128,128,0.1)",
  },
  matchupName: {
    fontSize: 13,
    fontWeight: "700",
  },
  matchupRole: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 1,
  },
});

// ─── Current At-Bat Bubble ───────────────────────────────────────────────────
const ORDINAL = (n) => {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
};

const CurrentAtBatBubble = ({
  currentPlay,
  linescore,
  playersMap,
  boxscore,
  awayTeam,
  homeTeam,
  awayColor,
  homeColor,
  animTrigger,
  onPlayerPress,
  theme,
}) => {
  if (!currentPlay) return null;

  const isTop =
    currentPlay?.about?.halfInning === "top" ||
    (currentPlay?.about?.halfInning == null &&
      currentPlay?.about?.isTopInning !== false);
  const teamColor = isTop ? awayColor : homeColor;
  const batterTeamColor = isTop ? awayColor : homeColor;
  const pitcherTeamColor = isTop ? homeColor : awayColor;

  const inning = currentPlay?.about?.inning ?? null;
  const balls = currentPlay?.count?.balls ?? 0;
  const strikes = currentPlay?.count?.strikes ?? 0;
  const outs = currentPlay?.count?.outs ?? 0;

  const batterId = currentPlay?.matchup?.batter?.id;
  const pitcherId = currentPlay?.matchup?.pitcher?.id;
  const batterInfo = batterId ? resolvePlayer(playersMap, batterId) : null;
  const pitcherInfo = pitcherId ? resolvePlayer(playersMap, pitcherId) : null;

  const allBsPlayers = {
    ...(boxscore?.teams?.away?.players ?? {}),
    ...(boxscore?.teams?.home?.players ?? {}),
  };
  const batterBatting = allBsPlayers[`ID${batterId}`]?.stats?.batting ?? {};
  const pitcherPitching = allBsPlayers[`ID${pitcherId}`]?.stats?.pitching ?? {};

  const playEvents = currentPlay?.playEvents ?? [];
  const pitches = playEvents.filter(
    (e) => e?.pitchData?.coordinates?.pX != null,
  );

  // Most recent event that has a call code
  const lastPitch = [...playEvents]
    .reverse()
    .find((e) => e?.details?.call?.code != null);
  const lastCallCode = lastPitch?.details?.call?.code ?? null;
  const lastCallLabel = lastCallCode
    ? (BPM_CALL_LABELS[lastCallCode] ?? lastCallCode)
    : null;
  const lastCallColor = lastCallCode
    ? (BPM_CALL_COLORS[lastCallCode] ?? theme.textSecondary)
    : null;
  const lastPitchType = lastPitch?.details?.type?.description ?? null;
  const lastSpeed = lastPitch?.pitchData?.startSpeed ?? null;
  const lastDesc = lastPitch?.details?.description ?? null;

  // On deck / In hole from linescore.offense (the batting team)
  const offense = linescore?.offense ?? null;
  const onDeckId = offense?.onDeck?.id ?? null;
  const inHoleId = offense?.inHole?.id ?? null;
  const onDeckInfo = onDeckId ? resolvePlayer(playersMap, onDeckId) : null;
  const inHoleInfo = inHoleId ? resolvePlayer(playersMap, inHoleId) : null;

  return (
    <View
      style={[
        cabStyles.container,
        { backgroundColor: theme.surface, borderColor: teamColor },
      ]}
    >
      {/* ── Header: inning label + B/S/O count ── */}
      <View style={cabStyles.headerRow}>
        <Text style={[cabStyles.headerTitle, { color: teamColor }]}>
          {isTop ? "Top" : "Bot"} {inning != null ? ORDINAL(inning) : "—"}
        </Text>
        <View style={cabStyles.countRow}>
          {[
            { label: "B", value: balls, color: "#4CAF50" },
            { label: "S", value: strikes, color: "#f44336" },
            { label: "O", value: outs, color: theme.textSecondary },
          ].map(({ label, value, color }) => (
            <View key={label} style={cabStyles.countItem}>
              <Text style={[cabStyles.countVal, { color }]}>{value}</Text>
              <Text
                style={[cabStyles.countLabel, { color: theme.textSecondary }]}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Last pitch event ── */}
      {!!lastCallLabel && (
        <View
          style={[
            cabStyles.lastEventRow,
            {
              borderColor: theme.border,
              backgroundColor: theme.surface ?? theme.background,
            },
          ]}
        >
          <View
            style={[cabStyles.callBadge, { backgroundColor: lastCallColor }]}
          >
            <Text style={cabStyles.callBadgeText}>{lastCallCode}</Text>
          </View>
          <View style={{ flex: 1 }}>
            {!!lastDesc && (
              <Text
                style={[cabStyles.lastEventDesc, { color: theme.text }]}
                numberOfLines={2}
              >
                {lastDesc}
              </Text>
            )}
            {(!!lastPitchType || lastSpeed != null) && (
              <Text
                style={[
                  cabStyles.lastEventMeta,
                  { color: theme.textSecondary },
                ]}
              >
                {[
                  lastPitchType,
                  lastSpeed != null ? `${Math.round(lastSpeed)} mph` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* ── Matchup: batter | bases diamond | pitcher ── */}
      <View style={cabStyles.matchupRow}>
        {/* Batter */}
        <TouchableOpacity
          activeOpacity={0.75}
          style={[cabStyles.playerCol, { alignItems: "flex-start" }]}
          onPress={() =>
            onPlayerPress?.({
              playerId: batterId,
              playerInfo: batterInfo,
              bsPlayer: allBsPlayers[`ID${batterId}`] ?? null,
              teamColor: batterTeamColor,
              teamName: isTop ? (awayTeam?.name ?? "") : (homeTeam?.name ?? ""),
              teamId: isTop ? awayTeam?.id : homeTeam?.id,
            })
          }
        >
          <Image
            source={{ uri: playerHeadshotUrl(batterId) }}
            style={[cabStyles.headshot, { borderColor: batterTeamColor }]}
            resizeMode="cover"
          />
          <Text
            style={[cabStyles.playerName, { color: theme.text }]}
            numberOfLines={1}
          >
            {shortName(batterInfo?.fullName) ?? "—"}
          </Text>
          <Text style={[cabStyles.playerRole, { color: batterTeamColor }]}>
            Batter
          </Text>
          <View style={cabStyles.miniStats}>
            {[
              { label: "AB", val: batterBatting.atBats },
              { label: "H", val: batterBatting.hits },
              { label: "K", val: batterBatting.strikeOuts },
            ].map(({ label, val }) => (
              <View key={label} style={cabStyles.miniStat}>
                <Text style={[cabStyles.miniStatVal, { color: theme.text }]}>
                  {val ?? "—"}
                </Text>
                <Text
                  style={[
                    cabStyles.miniStatLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>

        {/* Bases diamond */}
        <View style={cabStyles.basesWrap}>
          {/* 2nd base (top) */}
          <View
            style={[
              cabStyles.baseDiamond,
              currentPlay?.matchup?.postOnSecond
                ? {
                    backgroundColor: teamColor,
                    shadowColor: teamColor,
                    shadowOpacity: 0.7,
                    shadowRadius: 3,
                    elevation: 3,
                  }
                : {
                    backgroundColor: "transparent",
                    borderWidth: 1.5,
                    borderColor: theme.textSecondary,
                  },
            ]}
          />
          {/* 3rd (left) and 1st (right) */}
          <View style={cabStyles.basesMiddleRow}>
            <View
              style={[
                cabStyles.baseDiamond,
                currentPlay?.matchup?.postOnThird
                  ? {
                      backgroundColor: teamColor,
                      shadowColor: teamColor,
                      shadowOpacity: 0.7,
                      shadowRadius: 3,
                      elevation: 3,
                    }
                  : {
                      backgroundColor: "transparent",
                      borderWidth: 1.5,
                      borderColor: theme.textSecondary,
                    },
              ]}
            />
            <View
              style={[
                cabStyles.baseDiamond,
                currentPlay?.matchup?.postOnFirst
                  ? {
                      backgroundColor: teamColor,
                      shadowColor: teamColor,
                      shadowOpacity: 0.7,
                      shadowRadius: 3,
                      elevation: 3,
                    }
                  : {
                      backgroundColor: "transparent",
                      borderWidth: 1.5,
                      borderColor: theme.textSecondary,
                    },
              ]}
            />
          </View>
        </View>

        {/* Pitcher */}
        <TouchableOpacity
          activeOpacity={0.75}
          style={[cabStyles.playerCol, { alignItems: "flex-end" }]}
          onPress={() =>
            onPlayerPress?.({
              playerId: pitcherId,
              playerInfo: pitcherInfo,
              bsPlayer: allBsPlayers[`ID${pitcherId}`] ?? null,
              teamColor: pitcherTeamColor,
              teamName: isTop ? (homeTeam?.name ?? "") : (awayTeam?.name ?? ""),
              teamId: isTop ? homeTeam?.id : awayTeam?.id,
            })
          }
        >
          <Image
            source={{ uri: playerHeadshotUrl(pitcherId) }}
            style={[cabStyles.headshot, { borderColor: pitcherTeamColor }]}
            resizeMode="cover"
          />
          <Text
            style={[cabStyles.playerName, { color: theme.text }]}
            numberOfLines={1}
          >
            {shortName(pitcherInfo?.fullName) ?? "—"}
          </Text>
          <Text style={[cabStyles.playerRole, { color: pitcherTeamColor }]}>
            Pitcher
          </Text>
          <View style={cabStyles.miniStats}>
            {[
              { label: "IP", val: pitcherPitching.inningsPitched },
              { label: "K", val: pitcherPitching.strikeOuts },
              { label: "BB", val: pitcherPitching.baseOnBalls },
            ].map(({ label, val }) => (
              <View key={label} style={cabStyles.miniStat}>
                <Text style={[cabStyles.miniStatVal, { color: theme.text }]}>
                  {val ?? "—"}
                </Text>
                <Text
                  style={[
                    cabStyles.miniStatLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Pitch locations ── */}
      {pitches.length > 0 && (
        <View style={[cabStyles.zoneWrap, { borderTopColor: theme.border }]}>
          <Text style={[cabStyles.zoneLabel, { color: theme.textSecondary }]}>
            Pitch Locations
          </Text>
          <StrikeZoneView
            pitches={pitches}
            theme={theme}
            animatedIndex={pitches.length - 1}
            animTrigger={animTrigger}
          />
          <View style={cabStyles.legend}>
            {[
              { label: "Ball", color: "#4CAF50" },
              { label: "Strike / Foul", color: "#f44336" },
              { label: "In Play", color: "#2196F3" },
            ].map(({ label, color }) => (
              <View key={label} style={cabStyles.legendItem}>
                <View
                  style={[cabStyles.legendDot, { backgroundColor: color }]}
                />
                <Text
                  style={[
                    cabStyles.legendLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── On Deck / In Hole ── */}
      {(!!onDeckId || !!inHoleId) && (
        <View style={[cabStyles.nextRow, { borderTopColor: theme.border }]}>
          {[
            { id: onDeckId, info: onDeckInfo, label: "On Deck" },
            { id: inHoleId, info: inHoleInfo, label: "In Hole" },
          ].map(({ id, info, label }, idx) => (
            <View
              key={label}
              style={[
                cabStyles.nextPlayer,
                idx === 0 && {
                  borderRightWidth: 1,
                  borderRightColor: theme.border,
                },
              ]}
            >
              <Image
                source={{ uri: playerHeadshotUrl(id) }}
                style={[
                  cabStyles.nextHeadshot,
                  { borderColor: batterTeamColor },
                ]}
                resizeMode="cover"
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[cabStyles.nextName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {shortName(info?.fullName) ?? "—"}
                </Text>
                <Text
                  style={[cabStyles.nextLabel, { color: theme.textSecondary }]}
                >
                  {label}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const cabStyles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 10,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  countRow: {
    flexDirection: "row",
    gap: 12,
  },
  countItem: {
    alignItems: "center",
    minWidth: 24,
  },
  countVal: {
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 20,
  },
  countLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 1,
  },
  lastEventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  callBadge: {
    marginTop: 6,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  callBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  lastEventDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  lastEventMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  matchupRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  playerCol: {
    flex: 1,
  },
  headshot: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    marginBottom: 4,
  },
  playerName: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 1,
  },
  playerRole: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  miniStats: {
    flexDirection: "row",
    gap: 8,
  },
  miniStat: {
    alignItems: "center",
  },
  miniStatVal: {
    fontSize: 12,
    fontWeight: "700",
  },
  miniStatLabel: {
    fontSize: 9,
    fontWeight: "600",
  },
  basesWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    gap: 6,
  },
  baseDiamond: {
    width: 18,
    height: 18,
    borderRadius: 2,
    transform: [{ rotate: "45deg" }],
  },
  basesMiddleRow: {
    flexDirection: "row",
    gap: 30,
  },
  zoneWrap: {
    borderTopWidth: 1,
    paddingTop: 12,
    paddingBottom: 10,
    alignItems: "center",
  },
  zoneLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  legend: {
    flexDirection: "row",
    gap: 16,
    marginTop: 6,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 10,
    fontWeight: "500",
  },
  nextRow: {
    flexDirection: "row",
    borderTopWidth: 1,
  },
  nextPlayer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  nextHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
  },
  nextName: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 1,
  },
  nextLabel: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});

// ─── Win Probability Chart ────────────────────────────────────────────────────
// WBC probability object: { amount: N, home: "46.4,49.8,...", away: "53.6,..." }
const WinProbabilityChart = ({
  probabilityData,
  allPlays,
  awayTeam,
  homeTeam,
  awayColor,
  homeColor,
  theme,
}) => {
  const chartData = useMemo(() => {
    if (!probabilityData?.home || !probabilityData?.away) return null;
    const homeArr = probabilityData.home.split(",").map(Number);
    const awayArr = probabilityData.away.split(",").map(Number);
    if (!homeArr.length) return null;

    const total = homeArr.length;

    // Build inning-label x positions by finding inning transitions in allPlays.
    const inningLabels = [];
    let lastInning = null;
    const playsLen = allPlays?.length ?? 0;
    if (playsLen > 0) {
      allPlays.forEach((play, playIndex) => {
        const inning = play?.about?.inning;
        const half = play?.about?.halfInning;
        if (inning == null || half !== "top") return;
        if (inning !== lastInning) {
          lastInning = inning;
          const xPct = playsLen > 1 ? (playIndex / (playsLen - 1)) * 100 : 0;
          const suffix =
            inning === 1
              ? "1st"
              : inning === 2
                ? "2nd"
                : inning === 3
                  ? "3rd"
                  : `${inning}th`;
          inningLabels.push({ xPct, label: suffix });
        }
      });
    }

    // Sample down to ≤100 points for rendering performance.
    const maxPts = Math.min(total, 100);
    const sampled = [];
    if (total <= maxPts) {
      for (let i = 0; i < total; i++)
        sampled.push({ h: homeArr[i], a: awayArr[i] });
    } else {
      const step = total / maxPts;
      for (let i = 0; i < maxPts; i++) {
        const idx = Math.floor(i * step);
        sampled.push({ h: homeArr[idx], a: awayArr[idx] });
      }
      const last = { h: homeArr[total - 1], a: awayArr[total - 1] };
      const tail = sampled[sampled.length - 1];
      if (tail.h !== last.h || tail.a !== last.a) sampled.push(last);
    }

    return { sampled, inningLabels };
  }, [probabilityData, allPlays]);

  if (!chartData) return null;
  const { sampled, inningLabels } = chartData;
  const n = sampled.length;

  const homePath = sampled.reduce((p, pt, i) => {
    const x = (i / (n - 1)) * 100;
    const y = 100 - pt.h;
    return p + (i === 0 ? `M${x},${y}` : ` L${x},${y}`);
  }, "");
  const awayPath = sampled.reduce((p, pt, i) => {
    const x = (i / (n - 1)) * 100;
    const y = 100 - pt.a;
    return p + (i === 0 ? `M${x},${y}` : ` L${x},${y}`);
  }, "");

  return (
    <View
      style={[
        styles.winProbContainer,
        { backgroundColor: theme.surface, borderRadius: 12, padding: 12 },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        Win Probability
      </Text>

      {/* Legend */}
      <View style={styles.winProbLegend}>
        <View style={styles.winProbLegendItem}>
          <View
            style={[styles.winProbLegendDot, { backgroundColor: awayColor }]}
          />
          <Text style={[styles.winProbLegendText, { color: theme.text }]}>
            {awayTeam?.abbreviation ?? "Away"}
          </Text>
        </View>
        <View style={styles.winProbLegendItem}>
          <View
            style={[styles.winProbLegendDot, { backgroundColor: homeColor }]}
          />
          <Text style={[styles.winProbLegendText, { color: theme.text }]}>
            {homeTeam?.abbreviation ?? "Home"}
          </Text>
        </View>
      </View>

      {/* Graph */}
      <View style={styles.winProbGraphContainer}>
        {/* Y-axis */}
        <View style={styles.winProbYAxis}>
          {["100%", "75%", "50%", "25%", "0%"].map((l) => (
            <Text
              key={l}
              style={[styles.winProbYLabel, { color: theme.textSecondary }]}
            >
              {l}
            </Text>
          ))}
        </View>

        {/* Chart area */}
        <View style={styles.winProbGraphArea}>
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((pct) => (
            <View
              key={pct}
              style={[
                styles.winProbGridLine,
                {
                  bottom: `${pct}%`,
                  borderBottomColor: theme.textSecondary + "20",
                },
              ]}
            />
          ))}
          {/* 50% centre line */}
          <View
            style={[
              styles.winProbCentreLine,
              { borderBottomColor: theme.textSecondary + "50" },
            ]}
          />
          {/* SVG lines + fills */}
          <View style={StyleSheet.absoluteFillObject}>
            <Svg
              style={StyleSheet.absoluteFillObject}
              width="100%"
              height="100%"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {sampled.map((pt, i) => {
                if (i === 0) return null;
                const prev = sampled[i - 1];
                const x1 = ((i - 1) / (n - 1)) * 100;
                const x2 = (i / (n - 1)) * 100;
                const hY1 = 100 - prev.h;
                const hY2 = 100 - pt.h;
                const aY1 = 100 - prev.a;
                const aY2 = 100 - pt.a;
                return (
                  <G key={i}>
                    {aY1 < hY1 ? (
                      <>
                        <Path
                          d={`M${x1},100 L${x1},${hY1} L${x2},${hY2} L${x2},100 Z`}
                          fill={homeColor}
                          fillOpacity="0.3"
                        />
                        <Path
                          d={`M${x1},${hY1} L${x1},${aY1} L${x2},${aY2} L${x2},${hY2} Z`}
                          fill={awayColor}
                          fillOpacity="0.3"
                        />
                      </>
                    ) : (
                      <>
                        <Path
                          d={`M${x1},100 L${x1},${aY1} L${x2},${aY2} L${x2},100 Z`}
                          fill={awayColor}
                          fillOpacity="0.3"
                        />
                        <Path
                          d={`M${x1},${aY1} L${x1},${hY1} L${x2},${hY2} L${x2},${aY2} Z`}
                          fill={homeColor}
                          fillOpacity="0.3"
                        />
                      </>
                    )}
                  </G>
                );
              })}
              <Path
                d={homePath}
                fill="none"
                stroke={homeColor}
                strokeWidth="0.5"
              />
              <Path
                d={awayPath}
                fill="none"
                stroke={awayColor}
                strokeWidth="0.5"
              />
            </Svg>
          </View>
        </View>
      </View>

      {/* Inning labels */}
      {inningLabels.length > 0 && (
        <View style={[styles.winProbInningRow, { marginLeft: 48 }]}>
          {inningLabels.map((lbl) => (
            <Text
              key={lbl.label}
              style={[
                styles.winProbInningLabel,
                { color: theme.textSecondary, left: `${lbl.xPct}%` },
              ]}
            >
              {lbl.label}
            </Text>
          ))}
        </View>
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
  const { viewerData, isJoined } = useGamePresence(gamePk);

  // Streaming state
  const [streamModalVisible, setStreamModalVisible] = useState(false);
  const [currentStreamType, setCurrentStreamType] = useState("alpha1");
  const [availableStreams, setAvailableStreams] = useState({});
  const [streamUrl, setStreamUrl] = useState("");
  const [isStreamLoading, setIsStreamLoading] = useState(true);
  const { isUnlocked: isStreamingUnlocked } = useStreamingAccess();

  // Mirror streamModalVisible into a ref so the polling interval can check it
  // without a stale closure (same pattern as feedRef below).
  const streamModalVisibleRef = useRef(false);
  useEffect(() => {
    streamModalVisibleRef.current = streamModalVisible;
  }, [streamModalVisible]);

  // Mirror feed into a ref so the polling interval can read the latest value
  // without being listed as an effect dependency (avoids restarting the timer
  // on every data update).
  const feedRef = useRef(null);
  useEffect(() => {
    feedRef.current = feed;
  }, [feed]);

  const loadFeed = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await WBCService.getGameFeed(gamePk);
        setFeed(res?.data ?? null);
      } catch (err) {
        console.error("WBC gameFeed error:", err);
        if (!silent) setError("Failed to load game data.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [gamePk],
  );

  // Initial load
  useEffect(() => {
    if (gamePk) loadFeed(false);
  }, [gamePk]);

  // Auto-refresh every 5 s — only while the game is live.
  // Silent fetch so no spinner / scroll-position reset.
  useEffect(() => {
    if (!gamePk) return;

    const intervalId = setInterval(() => {
      const current = feedRef.current;
      const isLive = !["S", "P", "D", "C", "O", "F", "Q", "R"].includes(
        current?.gameData?.status?.codedGameState,
      );
      if (!isLive) {
        clearInterval(intervalId);
        return;
      }
      if (streamModalVisibleRef.current) return;
      loadFeed(true);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [gamePk, loadFeed]);

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
  const codedGameState = status?.codedGameState ?? "";
  const isScheduled = ["S", "P"].includes(codedGameState);
  const isGameFinished = ["D", "C", "O", "F", "Q", "R"].includes(
    codedGameState,
  );
  const homeWinner =
    isGameFinished &&
    homeScore != null &&
    awayScore != null &&
    homeScore > awayScore;
  const awayWinner =
    isGameFinished &&
    homeScore != null &&
    awayScore != null &&
    awayScore > homeScore;

  const [headerHeight, setHeaderHeight] = useState(0);
  const [activeTab, setActiveTab] = useState("Main");
  const [mainTabKey, setMainTabKey] = useState(0);
  const [cabSelectedPlayer, setCabSelectedPlayer] = useState(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  // Increment mainTabKey every time the Main tab becomes active so the
  // CurrentAtBatBubble pitch animation re-triggers.
  useEffect(() => {
    if (activeTab === "Main") {
      setMainTabKey((k) => k + 1);
    }
  }, [activeTab]);

  const TABS = isScheduled
    ? ["Main", "Away", "Home"]
    : ["Main", "Away", "Home", "Plays"];

  // Reset to Main if Plays tab is active but no longer available
  useEffect(() => {
    if (isScheduled && activeTab === "Plays") setActiveTab("Main");
  }, [isScheduled]);

  // ── Scroll-driven animations ───────────────────────────────────────────
  const threshold = headerHeight > 0 ? headerHeight - 40 : 120;
  const stickyOpacity = scrollY.interpolate({
    inputRange: [threshold, threshold + 40],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const gameScoreOpacity = scrollY.interpolate({
    inputRange: [threshold, threshold + 40],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const stickyMiniHeight = scrollY.interpolate({
    inputRange: [threshold, threshold + 40],
    outputRange: [0, 54],
    extrapolate: "clamp",
  });

  const awayColor = WBCService.getTeamColor(awayTeam?.id) || colors.primary;
  const homeColor = WBCService.getTeamColor(homeTeam?.id) || colors.secondary;

  const currentPlay = feed?.liveData?.plays?.currentPlay ?? null;
  const gameDateTime = gameData?.datetime?.dateTime ?? null;

  const boxscore = feed?.liveData?.boxscore ?? null;
  const playersMap = gameData?.players ?? {};
  const pitchesData = feed?.pitches ?? {};
  const bsAwayTeam = boxscore?.teams?.away ?? null;
  const bsHomeTeam = boxscore?.teams?.home ?? null;
  const allPlays = feed?.liveData?.plays?.allPlays ?? [];

  const venueRaw = gameData?.venue ?? null;
  const venue =
    typeof venueRaw === "string" ? venueRaw : (venueRaw?.name ?? null);

  // ── Streaming helpers ──────────────────────────────────────────────────────
  const STREAM_API_BASE = "https://streamed.pk/api";
  let liveMatchesCache = null;
  let cacheTimestamp = 0;
  const CACHE_DURATION = 30000; // 30 seconds cache

  const fetchLiveMatches = async () => {
    try {
      const now = Date.now();
      if (liveMatchesCache && now - cacheTimestamp < CACHE_DURATION) {
        return liveMatchesCache;
      }

      const response = await fetch(`${STREAM_API_BASE}/matches/baseball`);
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      const allMatches = await response.json();
      const matches = allMatches.filter((match) => {
        const matchSport = match.sport || match.category;
        return matchSport === "baseball";
      });

      liveMatchesCache = matches;
      cacheTimestamp = now;
      return matches;
    } catch (error) {
      console.error("Error fetching live matches:", error);
      return null;
    }
  };

  const fetchStreamsForSource = async (source, sourceId) => {
    try {
      const response = await fetch(
        `${STREAM_API_BASE}/stream/${source}/${sourceId}`,
      );
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error fetching streams for ${source}:`, error);
      return [];
    }
  };

  const normalizeTeamName = (teamName) => {
    const nameMap = {
      "Arizona Diamondbacks": "arizona-diamondbacks",
      "Atlanta Braves": "atlanta-braves",
      "Baltimore Orioles": "baltimore-orioles",
      "Boston Red Sox": "boston-red-sox",
      "Chicago White Sox": "chicago-white-sox",
      "Chicago Cubs": "chicago-cubs",
      "Cincinnati Reds": "cincinnati-reds",
      "Cleveland Guardians": "cleveland-guardians",
      "Colorado Rockies": "colorado-rockies",
      "Detroit Tigers": "detroit-tigers",
      "Houston Astros": "houston-astros",
      "Kansas City Royals": "kansas-city-royals",
      "Los Angeles Angels": "los-angeles-angels",
      "Los Angeles Dodgers": "los-angeles-dodgers",
      "Miami Marlins": "miami-marlins",
      "Milwaukee Brewers": "milwaukee-brewers",
      "Minnesota Twins": "minnesota-twins",
      "New York Yankees": "new-york-yankees",
      "New York Mets": "new-york-mets",
      Athletics: "athletics",
      "Philadelphia Phillies": "philadelphia-phillies",
      "Pittsburgh Pirates": "pittsburgh-pirates",
      "San Diego Padres": "san-diego-padres",
      "San Francisco Giants": "san-francisco-giants",
      "Seattle Mariners": "seattle-mariners",
      "St. Louis Cardinals": "st-louis-cardinals",
      "Tampa Bay Rays": "tampa-bay-rays",
      "Texas Rangers": "texas-rangers",
      "Toronto Blue Jays": "toronto-blue-jays",
      "Washington Nationals": "washington-nationals",
    };

    if (nameMap[teamName]) return nameMap[teamName];

    return teamName
      .toLowerCase()
      .replace(
        /[áéíóúüñçßëïöäåø]/g,
        (c) =>
          ({
            á: "a",
            é: "e",
            í: "i",
            ó: "o",
            ú: "u",
            ü: "u",
            ñ: "n",
            ç: "c",
            ß: "ss",
            ë: "e",
            ï: "i",
            ö: "o",
            ä: "a",
            å: "a",
            ø: "o",
          })[c] || c,
      )
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const findMatchStreams = async (homeTeamName, awayTeamName) => {
    try {
      const liveMatches = await fetchLiveMatches();
      if (
        !liveMatches ||
        !Array.isArray(liveMatches) ||
        liveMatches.length === 0
      ) {
        return {};
      }

      const homeNormalized = normalizeTeamName(homeTeamName).toLowerCase();
      const awayNormalized = normalizeTeamName(awayTeamName).toLowerCase();
      const homeFirstWord = homeNormalized.split("-")[0];
      const awayFirstWord = awayNormalized.split("-")[0];
      const hasSameCity = homeFirstWord === awayFirstWord;

      let bestMatch = null;
      let bestScore = 0;

      const quickMatches = liveMatches
        .slice(0, Math.min(liveMatches.length, 100))
        .filter((match) => {
          const title = match.title.toLowerCase();
          if (hasSameCity) {
            return (
              title.includes(homeNormalized) && title.includes(awayNormalized)
            );
          }
          const homeHasMatch =
            title.includes(homeNormalized.split("-")[0]) ||
            title.includes(homeNormalized.split("-")[1] || "") ||
            match.teams?.home?.name
              ?.toLowerCase()
              .includes(homeNormalized.split("-")[0]);
          const awayHasMatch =
            title.includes(awayNormalized.split("-")[0]) ||
            title.includes(awayNormalized.split("-")[1] || "") ||
            match.teams?.away?.name
              ?.toLowerCase()
              .includes(awayNormalized.split("-")[0]);
          return homeHasMatch && awayHasMatch;
        });

      const matchesToProcess =
        quickMatches.length > 0 ? quickMatches : liveMatches.slice(0, 100);

      for (const match of matchesToProcess) {
        if (!match.sources || match.sources.length === 0) continue;

        const matchTitle = match.title.toLowerCase();
        let totalScore = 0;

        const titleWords = matchTitle.split(/[\s\-]+/);
        const homeParts = homeNormalized.split("-").filter((w) => w.length > 2);
        const awayParts = awayNormalized.split("-").filter((w) => w.length > 2);

        homeParts.forEach((part) => {
          if (titleWords.some((w) => w.includes(part) || part.includes(w)))
            totalScore += 0.4;
        });
        awayParts.forEach((part) => {
          if (titleWords.some((w) => w.includes(part) || part.includes(w)))
            totalScore += 0.4;
        });

        if (match.teams) {
          const homeApiName = match.teams.home?.name?.toLowerCase() || "";
          const awayApiName = match.teams.away?.name?.toLowerCase() || "";
          homeParts.forEach((part) => {
            if (homeApiName.includes(part)) totalScore += 0.6;
          });
          awayParts.forEach((part) => {
            if (awayApiName.includes(part)) totalScore += 0.6;
          });
        }

        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestMatch = match;
          if (bestScore >= 1.0) break;
        }
      }

      if (!bestMatch || bestScore < 0.3) return {};

      const allStreams = {};
      for (const source of bestMatch.sources) {
        try {
          const sourceStreams = await fetchStreamsForSource(
            source.source,
            source.id,
          );
          if (sourceStreams && sourceStreams.length > 0) {
            const firstStream = sourceStreams[0];
            allStreams[source.source] = {
              url: firstStream.embedUrl || firstStream.url,
              embedUrl: firstStream.embedUrl || firstStream.url,
              source: source.source,
              title: `${source.source.charAt(0).toUpperCase() + source.source.slice(1)} Stream`,
            };
          }
        } catch (error) {
          console.error(`Error fetching streams for ${source.source}:`, error);
        }
      }

      return allStreams;
    } catch (error) {
      console.error("Error in findMatchStreams:", error);
      return {};
    }
  };

  const generateStreamUrl = (
    awayTeamName,
    homeTeamName,
    streamType = "alpha1",
  ) => {
    const normalizedAway = normalizeTeamName(awayTeamName);
    const normalizedHome = normalizeTeamName(homeTeamName);
    const streamUrls = {
      alpha1: `https://weakstreams.com/mlb-live-streams/${normalizedAway}-vs-${normalizedHome}-live-stream`,
      alpha2: `https://weakstreams.com/mlb-live-streams/${normalizedHome}-vs-${normalizedAway}-live-stream`,
      bravo: `https://sportsurge.club/mlb/${normalizedAway}-vs-${normalizedHome}`,
      charlie: `https://sportshd.me/mlb/${normalizedAway}-${normalizedHome}`,
    };
    return streamUrls[streamType] || streamUrls.alpha1;
  };

  const openStreamModal = async () => {
    const unlock = isStreamingUnlocked
      ? true
      : gameData?.game?.type !== "R"
        ? true
        : false;

    if (!unlock) {
      Alert.alert(
        "Streaming Locked",
        "Please enter the streaming code in Settings to access live streams.",
        [{ text: "OK" }],
      );
      return;
    }

    if (!awayTeam?.name || !homeTeam?.name) {
      Alert.alert("Error", "Team information not available");
      return;
    }

    setStreamModalVisible(true);
    setIsStreamLoading(true);

    const streams = await findMatchStreams(homeTeam.name, awayTeam.name);
    setAvailableStreams(streams);

    let initialUrl = "";
    let initialStreamType = "";
    const streamKeys = Object.keys(streams);
    if (streamKeys.length > 0) {
      const preferredOrder = ["admin", "alpha", "bravo", "charlie", "delta"];
      initialStreamType =
        preferredOrder.find((type) => streamKeys.includes(type)) ||
        streamKeys[0];
      const streamData = streams[initialStreamType];
      initialUrl = streamData.embedUrl || streamData.url || streamData;
      setCurrentStreamType(initialStreamType);
    } else {
      initialStreamType = "alpha";
      initialUrl = generateStreamUrl(
        awayTeam.name,
        homeTeam.name,
        initialStreamType,
      );
      setCurrentStreamType(initialStreamType);
    }

    setStreamUrl(initialUrl);
    setIsStreamLoading(false);
  };

  const switchStream = (streamType) => {
    setCurrentStreamType(streamType);
    setIsStreamLoading(true);
    let newUrl = "";
    if (availableStreams[streamType]) {
      const streamData = availableStreams[streamType];
      newUrl = streamData.embedUrl || streamData.url || streamData;
    } else {
      newUrl = generateStreamUrl(awayTeam?.name, homeTeam?.name, streamType);
    }
    setStreamUrl(newUrl);
    setTimeout(() => setIsStreamLoading(false), 1000);
  };

  const closeStreamModal = () => {
    setStreamModalVisible(false);
    setStreamUrl("");
    setCurrentStreamType("alpha1");
    setAvailableStreams({});
  };

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
      <Animated.ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        stickyHeaderIndices={[1]}
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
              status={status}
              team={awayTeam}
              score={awayScore}
              isWinner={awayWinner}
              side="away"
              isDarkMode={isDarkMode}
              theme={theme}
              scoreOpacity={gameScoreOpacity}
              onPress={() =>
                awayTeam?.id != null &&
                navigation.navigate("TeamPage", {
                  teamId: awayTeam.id,
                  sport: "mlb",
                })
              }
            />

            <View style={{ flex: 1, alignItems: "center" }}>
              <StatusBadge
                status={status}
                linescore={linescore}
                gameDateTime={gameDateTime}
                theme={theme}
              />

              {/* Live Stream Button — sits below the status badge in the centre column */}
              {!isScheduled && !isGameFinished && (
                <TouchableOpacity
                  style={[styles.streamBtn, { borderColor: colors.primary }]}
                  onPress={openStreamModal}
                  activeOpacity={0.8}
                >
                  <View style={styles.streamBtnInner}>
                    <View
                      style={[
                        styles.streamBtnDot,
                        { backgroundColor: colors.primary },
                      ]}
                    />
                    <Text
                      style={[styles.streamBtnText, { color: colors.primary }]}
                    >
                      Stream
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            <TeamColumn
              status={status}
              team={homeTeam}
              score={homeScore}
              isWinner={homeWinner}
              side="home"
              isDarkMode={isDarkMode}
              theme={theme}
              scoreOpacity={gameScoreOpacity}
              onPress={() =>
                homeTeam?.id != null &&
                navigation.navigate("TeamPage", {
                  teamId: homeTeam.id,
                  sport: "mlb",
                })
              }
            />
          </View>
        </View>

        {/* ── STICKY UNIT (mini game header + tab bar) ─────────────────── */}
        <View style={{ backgroundColor: theme.surface }}>
          {/* Mini game header ─ slides in from behind tab bar */}
          <Animated.View
            style={[
              styles.stickyMini,
              {
                height: stickyMiniHeight,
                opacity: stickyOpacity,
                backgroundColor: theme.surface,
                borderBottomColor: theme.border,
              },
            ]}
          >
            {/* Away */}
            <View style={[styles.miniSide, { justifyContent: "flex-start" }]}>
              {WBCService.getTeamLogo(awayTeam?.id, isDarkMode) ? (
                <Image
                  source={{
                    uri: WBCService.getTeamLogo(awayTeam?.id, isDarkMode),
                  }}
                  style={styles.miniLogo}
                  resizeMode="contain"
                />
              ) : null}
              <Text style={[styles.miniAbbr, { color: awayColor }]}>
                {awayTeam?.abbreviation ?? ""}
              </Text>
              <Text
                style={[
                  styles.miniScore,
                  {
                    color: awayWinner ? theme.text : theme.textSecondary,
                    fontWeight: awayWinner ? "800" : "500",
                  },
                ]}
              >
                {awayScore ?? ""}
              </Text>
            </View>
            {/* Status */}
            <View style={styles.miniStatusBlock}>
              {(() => {
                const isLive = ![
                  "S",
                  "P",
                  "D",
                  "C",
                  "O",
                  "F",
                  "Q",
                  "R",
                ].includes(status?.codedGameState);
                const inning = linescore?.currentInning;
                const isTop = linescore?.isTopInning !== false;
                const currentOuts =
                  currentPlay?.count?.outs ?? linescore?.outs ?? 0;
                if (isLive && inning) {
                  return (
                    <>
                      <Text
                        style={[
                          styles.miniStatusLine,
                          { color: theme.success },
                        ]}
                      >
                        {isTop ? "▲" : "▼"} {toOrdinal(inning)}
                      </Text>
                      <Text
                        style={[
                          styles.miniStatusSub,
                          { color: theme.textTertiary },
                        ]}
                      >
                        {currentOuts} out{currentOuts !== 1 ? "s" : ""}
                      </Text>
                    </>
                  );
                }
                const label =
                  status?.codedGameState === "F" ||
                  status?.detailedState === "Final"
                    ? "Final"
                    : (status?.detailedState ?? "");
                const miniTimeStr = fmtGameTime(gameDateTime);
                const inningLabel = inning && inning > 9 ? `F/${inning}` : null;
                return (
                  <>
                    <Text
                      style={[
                        styles.miniStatusLine,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {label}
                    </Text>
                    {inningLabel ? (
                      <Text
                        style={[
                          styles.miniStatusSub,
                          { color: theme.textTertiary },
                        ]}
                      >
                        {inningLabel}
                      </Text>
                    ) : miniTimeStr ? (
                      <Text
                        style={[
                          styles.miniStatusSub,
                          { color: theme.textTertiary },
                        ]}
                        numberOfLines={1}
                      >
                        {miniTimeStr}
                      </Text>
                    ) : null}
                  </>
                );
              })()}
            </View>
            {/* Home */}
            <View style={[styles.miniSide, { justifyContent: "flex-end" }]}>
              <Text
                style={[
                  styles.miniScore,
                  {
                    color: homeWinner ? theme.text : theme.textSecondary,
                    fontWeight: homeWinner ? "800" : "500",
                  },
                ]}
              >
                {homeScore ?? ""}
              </Text>
              <Text style={[styles.miniAbbr, { color: homeColor }]}>
                {homeTeam?.abbreviation ?? ""}
              </Text>
              {WBCService.getTeamLogo(homeTeam?.id, isDarkMode) ? (
                <Image
                  source={{
                    uri: WBCService.getTeamLogo(homeTeam?.id, isDarkMode),
                  }}
                  style={styles.miniLogo}
                  resizeMode="contain"
                />
              ) : null}
            </View>
          </Animated.View>

          {/* Tab bar */}
          <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
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
                        activeTab === tab
                          ? colors.primary
                          : theme.textSecondary,
                      fontWeight: activeTab === tab ? "700" : "400",
                    },
                  ]}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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
        {activeTab === "Main" && (
          <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
            {/* Scheduled: only game info */}
            {isScheduled && (
              <>
                <ProbablePitchersBubble
                  gameData={gameData}
                  playersMap={playersMap}
                  bsAwayTeam={bsAwayTeam}
                  bsHomeTeam={bsHomeTeam}
                  awayTeam={awayTeam}
                  homeTeam={homeTeam}
                  awayColor={awayColor}
                  homeColor={homeColor}
                  theme={theme}
                />
                <TeamStatsBubble
                  awayTeam={awayTeam}
                  homeTeam={homeTeam}
                  awayColor={awayColor}
                  homeColor={homeColor}
                  bsAwayTeam={bsAwayTeam}
                  bsHomeTeam={bsHomeTeam}
                  isScheduled={true}
                  theme={theme}
                />
                <GameInfoBubble
                  gameData={gameData}
                  officials={boxscore?.officials ?? []}
                  theme={theme}
                />
              </>
            )}

            {/* Finished: linescore + team stats + win probability + game info */}
            {isGameFinished && (
              <>
                <LinescoreBubble
                  linescore={linescore}
                  awayTeam={awayTeam}
                  homeTeam={homeTeam}
                  awayColor={awayColor}
                  homeColor={homeColor}
                  theme={theme}
                />
                <TeamStatsBubble
                  awayTeam={awayTeam}
                  homeTeam={homeTeam}
                  awayColor={awayColor}
                  homeColor={homeColor}
                  bsAwayTeam={bsAwayTeam}
                  bsHomeTeam={bsHomeTeam}
                  theme={theme}
                />
                <WinProbabilityChart
                  probabilityData={feed?.pitches?.probability ?? null}
                  allPlays={allPlays}
                  awayTeam={awayTeam}
                  homeTeam={homeTeam}
                  awayColor={awayColor}
                  homeColor={homeColor}
                  theme={theme}
                />
                <GameInfoBubble
                  gameData={gameData}
                  officials={boxscore?.officials ?? []}
                  theme={theme}
                />
              </>
            )}

            {/* Live / in-progress: all bubbles */}
            {!isScheduled && !isGameFinished && (
              <>
                <LinescoreBubble
                  linescore={linescore}
                  awayTeam={awayTeam}
                  homeTeam={homeTeam}
                  awayColor={awayColor}
                  homeColor={homeColor}
                  theme={theme}
                />
                <CurrentAtBatBubble
                  currentPlay={currentPlay}
                  linescore={linescore}
                  playersMap={playersMap}
                  boxscore={boxscore}
                  awayTeam={awayTeam}
                  homeTeam={homeTeam}
                  awayColor={awayColor}
                  homeColor={homeColor}
                  animTrigger={mainTabKey}
                  onPlayerPress={(info) => setCabSelectedPlayer(info)}
                  theme={theme}
                />
                <LastPlayBubble
                  allPlays={allPlays}
                  playersMap={playersMap}
                  awayTeam={awayTeam}
                  homeTeam={homeTeam}
                  awayColor={awayColor}
                  homeColor={homeColor}
                  theme={theme}
                />
                <TeamStatsBubble
                  awayTeam={awayTeam}
                  homeTeam={homeTeam}
                  awayColor={awayColor}
                  homeColor={homeColor}
                  bsAwayTeam={bsAwayTeam}
                  bsHomeTeam={bsHomeTeam}
                  theme={theme}
                />
                <WinProbabilityChart
                  probabilityData={feed?.pitches?.probability ?? null}
                  allPlays={allPlays}
                  awayTeam={awayTeam}
                  homeTeam={homeTeam}
                  awayColor={awayColor}
                  homeColor={homeColor}
                  theme={theme}
                />
                <GameInfoBubble
                  gameData={gameData}
                  officials={boxscore?.officials ?? []}
                  theme={theme}
                />
              </>
            )}
          </View>
        )}

        {activeTab === "Away" && (
          <BoxScorePanel
            bsTeamData={bsAwayTeam}
            playersMap={playersMap}
            theme={theme}
            colors={colors}
            teamColor={awayColor}
            team={awayTeam}
            boxscore={boxscore}
            pitchesData={pitchesData}
            awayTeam={awayTeam}
            homeTeam={homeTeam}
            awayScore={awayScore}
            homeScore={homeScore}
            isScheduled={isScheduled}
            isFinished={isFinished}
            gameDateTime={gameDateTime}
          />
        )}

        {activeTab === "Home" && (
          <BoxScorePanel
            bsTeamData={bsHomeTeam}
            playersMap={playersMap}
            theme={theme}
            colors={colors}
            teamColor={homeColor}
            team={homeTeam}
            boxscore={boxscore}
            pitchesData={pitchesData}
            awayTeam={awayTeam}
            homeTeam={homeTeam}
            awayScore={awayScore}
            homeScore={homeScore}
            isScheduled={isScheduled}
            isFinished={isFinished}
            gameDateTime={gameDateTime}
          />
        )}

        {activeTab === "Plays" && (
          <PlaysPanel
            allPlays={allPlays}
            awayTeam={awayTeam}
            homeTeam={homeTeam}
            awayColor={awayColor}
            homeColor={homeColor}
            playersMap={playersMap}
            boxscore={boxscore}
            theme={theme}
            colors={colors}
          />
        )}

        <View style={styles.bottomPadding} />
      </Animated.ScrollView>

      {/* ── Stream Modal ───────────────────────────────────────────────── */}
      {(isStreamingUnlocked || gameData?.game?.type !== "R") && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={streamModalVisible}
          onRequestClose={closeStreamModal}
        >
          <View style={styles.streamModalOverlay}>
            <View
              style={[
                styles.streamModalContainer,
                { backgroundColor: theme.surface },
              ]}
            >
              {/* Modal Header */}
              <View
                style={[
                  styles.streamModalHeader,
                  {
                    backgroundColor: theme.surfaceSecondary,
                    borderBottomColor: theme.border,
                  },
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.streamModalTitle, { color: colors.primary }]}
                >
                  Live Stream
                </Text>
                <TouchableOpacity
                  style={[
                    styles.streamCloseButton,
                    { backgroundColor: theme.surfaceSecondary },
                  ]}
                  onPress={closeStreamModal}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.streamCloseText, { color: colors.primary }]}
                  >
                    ×
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Stream Buttons */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={[
                  styles.streamButtonsContainer,
                  {
                    backgroundColor: theme.surfaceSecondary,
                    borderBottomColor: theme.border,
                  },
                ]}
                contentContainerStyle={styles.streamButtonsContent}
              >
                {Object.keys(availableStreams).map((streamKey) => {
                  const capitalizedName =
                    streamKey.charAt(0).toUpperCase() + streamKey.slice(1);
                  return (
                    <TouchableOpacity
                      key={streamKey}
                      style={[
                        styles.streamButton,
                        {
                          backgroundColor:
                            currentStreamType === streamKey
                              ? colors.secondary
                              : theme.surfaceSecondary,
                        },
                        { borderColor: theme.border },
                      ]}
                      onPress={() => switchStream(streamKey)}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.streamButtonText,
                          {
                            color:
                              currentStreamType === streamKey
                                ? "#fff"
                                : colors.primary,
                          },
                        ]}
                      >
                        {capitalizedName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {Object.keys(availableStreams).length === 0 && (
                  <View style={styles.noStreamsMessage}>
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.noStreamsText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      No live streams found for this game
                    </Text>
                  </View>
                )}
              </ScrollView>

              {/* WebView Container */}
              <View style={styles.webViewContainer}>
                {isStreamLoading && (
                  <View style={styles.streamLoadingOverlay}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text
                      allowFontScaling={false}
                      style={[styles.streamLoadingText, { color: "#fff" }]}
                    >
                      Loading stream...
                    </Text>
                  </View>
                )}
                {streamUrl ? (
                  <WebView
                    source={{ uri: streamUrl }}
                    style={styles.webView}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    startInLoadingState={true}
                    scalesPageToFit={true}
                    mixedContentMode="compatibility"
                    allowsInlineMediaPlayback={true}
                    mediaPlaybackRequiresUserAction={false}
                    onLoadStart={() => setIsStreamLoading(true)}
                    onLoadEnd={() => setIsStreamLoading(false)}
                    onError={(error) => {
                      console.error("MLB WebView error:", error);
                      setIsStreamLoading(false);
                    }}
                    userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1"
                    injectedJavaScript={`(function(){
                        function post(obj){
                          try{ window.ReactNativeWebView.postMessage(JSON.stringify(obj)); }catch(e){}
                        }
                        post({type:'instrumentation', event:'init'});
                        window.addEventListener('load', function(){ post({type:'lifecycle', event:'load', href:location.href}); });
                        document.addEventListener('DOMContentLoaded', function(){ post({type:'lifecycle', event:'domcontent', href:location.href}); });
                        try{ const origOpen = window.open; window.open = function(url, target, features){ post({type:'nav', method:'window.open', url:url, target:target}); return null; }; }catch(e){}
                        function instrumentExistingVideos(){ const videos = document.querySelectorAll('video'); videos.forEach(v=>{ if(!v.__instrumented){ v.__instrumented = true; v.addEventListener('play', ()=>post({type:'video', event:'play', src:v.currentSrc || v.src, href:location.href})); v.addEventListener('pause', ()=>post({type:'video', event:'pause', src:v.currentSrc || v.src, href:location.href})); } }); }
                        setInterval(instrumentExistingVideos,1000);
                        true;
                      })();`}
                    onMessage={(event) => {
                      try {
                        const data = JSON.parse(event.nativeEvent.data);
                        console.log("MLB WebView instrumentation:", data);
                      } catch (e) {
                        console.log(
                          "MLB WebView message (raw):",
                          event.nativeEvent.data,
                        );
                      }
                    }}
                    onNavigationStateChange={(navState) => {
                      console.log("MLB WebView navigation state change:", {
                        url: navState.url,
                        title: navState.title,
                        loading: navState.loading,
                      });
                    }}
                    onShouldStartLoadWithRequest={(request) => {
                      console.log(
                        "MLB WebView navigation request:",
                        request.url,
                      );
                      if (request.url === streamUrl) return true;
                      const popupKeywords = [
                        "popup",
                        "ad",
                        "ads",
                        "click",
                        "redirect",
                        "promo",
                      ];
                      const urlLower = request.url.toLowerCase();
                      const hasPopupKeywords = popupKeywords.some((k) =>
                        urlLower.includes(k),
                      );
                      const currentDomain = new URL(streamUrl).hostname;
                      let requestDomain = "";
                      try {
                        requestDomain = new URL(request.url).hostname;
                      } catch (e) {
                        if (
                          urlLower.startsWith("about:blank") ||
                          urlLower.startsWith("data:")
                        ) {
                          return true;
                        }
                        console.log(
                          "MLB WebView: Invalid URL blocked:",
                          request.url,
                        );
                        return false;
                      }
                      const sameRootDomain =
                        requestDomain === currentDomain ||
                        requestDomain.endsWith(`.${currentDomain}`) ||
                        currentDomain.endsWith(`.${requestDomain}`);
                      const allowPatterns = [
                        "/embed/",
                        "/embed-noads/",
                        "/player/",
                        ".m3u8",
                        ".mpd",
                        "about:blank",
                        "data:",
                      ];
                      const allowIfEmbed = allowPatterns.some((p) =>
                        urlLower.includes(p),
                      );
                      if (hasPopupKeywords && !allowIfEmbed) {
                        console.log(
                          "MLB WebView: Blocked popup/ad navigation:",
                          request.url,
                        );
                        return false;
                      }
                      if (sameRootDomain || allowIfEmbed) return true;
                      console.log(
                        "MLB WebView: Blocked cross-domain navigation:",
                        request.url,
                      );
                      return false;
                    }}
                    onOpenWindow={() => false}
                  />
                ) : (
                  <View style={styles.noStreamContainer}>
                    <Text
                      allowFontScaling={false}
                      style={[styles.noStreamText, { color: "#fff" }]}
                    >
                      No stream URL available
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Player detail modal — opened from Current At Bat bubble */}
      {cabSelectedPlayer != null && (
        <PlayerDetailModal
          visible
          onClose={() => setCabSelectedPlayer(null)}
          playerId={cabSelectedPlayer.playerId}
          playerInfo={cabSelectedPlayer.playerInfo}
          bsPlayer={cabSelectedPlayer.bsPlayer}
          teamColor={cabSelectedPlayer.teamColor}
          teamName={cabSelectedPlayer.teamName ?? ""}
          teamId={cabSelectedPlayer.teamId}
          allBsPlayers={{
            ...(boxscore?.teams?.away?.players ?? {}),
            ...(boxscore?.teams?.home?.players ?? {}),
          }}
          pitchesData={pitchesData}
          awayTeam={awayTeam}
          homeTeam={homeTeam}
          awayScore={awayScore}
          homeScore={homeScore}
          gameDate={gameDateTime}
          theme={theme}
          colors={colors}
        />
      )}
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
  },
  inningLabel: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
  },
  gameTimeLabel: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
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
  // ── sticky mini game header ──
  stickyMini: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    overflow: "hidden",
    borderBottomWidth: 1,
  },
  miniSide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  miniLogo: {
    width: 36,
    height: 30,
  },
  miniAbbr: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  miniScore: {
    fontSize: 22,
    lineHeight: 26,
  },
  miniStatusBlock: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 1,
    paddingHorizontal: 4,
  },
  miniStatusLine: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  miniStatusSub: {
    fontSize: 10,
    textAlign: "center",
    marginTop: 1,
  },
  // ── misc ──
  errorBanner: {
    margin: 16,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  bottomPadding: { height: 32 },
  // ── Win Probability chart ──
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  winProbContainer: {
    marginBottom: 10,
  },
  winProbLegend: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 12,
    gap: 24,
  },
  winProbLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  winProbLegendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  winProbLegendText: {
    fontSize: 12,
    fontWeight: "500",
  },
  winProbGraphContainer: {
    flexDirection: "row",
    height: 200,
    marginBottom: 8,
  },
  winProbYAxis: {
    width: 40,
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingRight: 8,
    paddingVertical: 4,
  },
  winProbYLabel: {
    fontSize: 10,
  },
  winProbGraphArea: {
    flex: 1,
    position: "relative",
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: 4,
  },
  winProbGridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    borderBottomWidth: 1,
  },
  winProbCentreLine: {
    position: "absolute",
    bottom: "50%",
    left: 0,
    right: 0,
    borderBottomWidth: 2,
  },
  winProbInningRow: {
    position: "relative",
    height: 20,
    marginTop: 4,
  },
  winProbInningLabel: {
    position: "absolute",
    fontSize: 10,
    fontWeight: "500",
    transform: [{ translateX: -8 }],
  },
  // ── Live Stream Button ──
  streamBtn: {
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  streamBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  streamBtnDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  streamBtnText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  // ── Stream Modal ──
  streamModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  streamModalContainer: {
    borderRadius: 12,
    width: "95%",
    maxWidth: 800,
    height: "85%",
    maxHeight: 600,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  streamModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    borderBottomWidth: 1,
  },
  streamModalTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  streamCloseButton: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    justifyContent: "center",
    alignItems: "center",
  },
  streamCloseText: {
    fontSize: 20,
    fontWeight: "bold",
  },
  streamButtonsContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    maxHeight: 60,
  },
  streamButtonsContent: {
    paddingHorizontal: 10,
    gap: 10,
    alignItems: "center",
  },
  streamButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
    borderWidth: 1,
    marginHorizontal: 5,
  },
  streamButtonText: {
    fontSize: 12,
    fontWeight: "500",
  },
  webViewContainer: {
    flex: 1,
    position: "relative",
  },
  webView: {
    flex: 1,
  },
  streamLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  streamLoadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  noStreamContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
  },
  noStreamText: {
    fontSize: 16,
  },
  noStreamsMessage: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  noStreamsText: {
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
  },
});

export default GameDetailsScreen;

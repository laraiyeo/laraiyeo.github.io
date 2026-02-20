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
} from "react-native";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import WBCService from "../../services/WBCService";
import { useGamePresence } from "../../hooks/useGamePresence";

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
const TeamColumn = ({
  team,
  score,
  isWinner,
  side,
  isDarkMode,
  theme,
  scoreOpacity,
}) => {
  const logo = WBCService.getTeamLogo(team?.id, isDarkMode);

  return (
    <View style={[styles.teamColumn, { alignItems: "center" }]}>
      {score != null && (
        <Animated.Text
          style={[
            styles.teamScore,
            {
              color: isWinner ? theme.text : theme.textSecondary,
              fontWeight: isWinner ? "800" : "400",
              opacity: scoreOpacity ?? 1,
            },
          ]}
        >
          {score}
        </Animated.Text>
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
const BoxScorePanel = ({
  bsTeamData,
  playersMap,
  theme,
  teamColor,
  team,
  boxscore,
}) => {
  const [section, setSection] = useState("batting");
  const [selectedPlayer, setSelectedPlayer] = useState(null); // { playerId, playerInfo, bsPlayer }

  const bsPlayers = bsTeamData?.players ?? {};
  const allBsPlayers = {
    ...(boxscore?.teams?.away?.players ?? {}),
    ...(boxscore?.teams?.home?.players ?? {}),
  };
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

  // Bench: everyone not in the batting order and not a pitcher
  const activeSets = new Set([
    ...batterIds.map(Number),
    ...pitcherIds.map(Number),
  ]);
  const benchIds = Object.keys(bsPlayers)
    .map((k) => Number(k.replace("ID", "")))
    .filter((id) => !activeSets.has(id));

  const ids =
    section === "batting"
      ? batterIds
      : section === "pitching"
        ? pitcherIds
        : benchIds;

  return (
    <View style={{ paddingBottom: 24 }}>
      {/* Section toggle */}
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

      {/* Player cards */}
      {ids.map((id) => (
        <PlayerCard
          key={id}
          playerId={id}
          playerInfo={playersMap?.[`ID${id}`] ?? null}
          bsPlayer={bsPlayers[`ID${id}`] ?? null}
          theme={theme}
          teamColor={teamColor}
          onPress={() =>
            setSelectedPlayer({
              playerId: id,
              playerInfo: playersMap?.[`ID${id}`] ?? null,
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
        allBsPlayers={allBsPlayers}
        theme={theme}
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

// ─── Player detail modal ──────────────────────────────────────────────────────
const PlayerDetailModal = ({
  visible,
  onClose,
  playerId,
  playerInfo,
  bsPlayer,
  teamColor,
  teamName,
  allBsPlayers,
  theme,
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
                style={[pdStyles.iconBtn, { backgroundColor: theme.border }]}
              >
                <Text style={[pdStyles.iconBtnText, { color: theme.text }]}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Headshot centered */}
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
            <Text style={[pdStyles.jerseyNum, { color: theme.textSecondary }]}>
              {[jerseyNum, teamName].filter(Boolean).join(" • ")}
            </Text>
          )}

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
          {hasBatStats && (
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
          {hasPitStats && (
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
});

// ─── Pitch call-code → color ─────────────────────────────────────────────────
const getPitchColor = (callCode) => {
  if (["X", "E", "H", "D"].includes(callCode)) return "#2196F3"; // in play
  if (["B", "D"].includes(callCode)) return "#4CAF50"; // ball
  return "#f44336"; // strike / foul
};

// ─── Strike zone visualizer ───────────────────────────────────────────────────
const StrikeZoneView = ({ pitches, theme }) => (
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
        szTop && szBot ? ((szTop - coords.pZ) / (szTop - szBot)) * 60 + 20 : 50;

      const finalX = (Math.max(5, Math.min(95, xPct)) / 100) * 145 - 5;
      const finalY = (Math.max(5, Math.min(95, yPct)) / 100) * 125 + 5;
      const color = getPitchColor(pitch?.details?.call?.code);

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

// ─── Share card modal ───────────────────────────────────────────────────────
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
}) => {
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(false);

  if (!play) return null;

  const isTop = play?.about?.isTopInning !== false;
  const teamColor = isTop ? awayColor : homeColor;
  const teamAbbr = isTop
    ? (awayTeam?.abbreviation ?? "")
    : (homeTeam?.abbreviation ?? "");
  const inning = play?.about?.inning;
  const event = play?.result?.event ?? "";
  const description = play?.result?.description ?? "";
  const isScoringPlay = play?.about?.isScoringPlay === true;
  const awayScore = play?.result?.awayScore;
  const homeScore = play?.result?.homeScore;

  const batterId = play?.matchup?.batter?.id;
  const pitcherId = play?.matchup?.pitcher?.id;
  const batterInfo = playersMap?.[`ID${batterId}`] ?? null;
  const pitcherInfo = playersMap?.[`ID${pitcherId}`] ?? null;
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

  const CARD_SIZE = width - 48;

  const handleShare = async () => {
    if (!cardRef.current || sharing) return;
    try {
      setSharing(true);
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
          { l: "ER", v: pStats?.runs },
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
                <Text style={[scStyles.cardInning, { color: teamColor }]}>
                  {isTop ? "▲" : "▼"} {toOrdinal(inning)}
                  {teamAbbr ? ` • ${teamAbbr}` : ""}
                </Text>
                {awayScore != null && homeScore != null && (
                  <Text style={[scStyles.cardScore, { color: theme.text }]}>
                    {awayTeam?.abbreviation ?? "A"} {awayScore} – {homeScore}{" "}
                    {homeTeam?.abbreviation ?? "H"}
                  </Text>
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
                SportsHeart <Ionicons name="heart" size={10} color="#dc2626" />
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
    fontWeight: "600",
    letterSpacing: 0.5,
    opacity: 0.6,
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
    gap: 10,
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
  const description = play?.result?.description ?? "";
  const isScoringPlay = play?.about?.isScoringPlay === true;
  const awayScore = play?.result?.awayScore;
  const homeScore = play?.result?.homeScore;

  // Resolve batter + pitcher from playersMap
  const batterId = play?.matchup?.batter?.id;
  const pitcherId = play?.matchup?.pitcher?.id;
  const batterInfo = playersMap?.[`ID${batterId}`] ?? null;
  const pitcherInfo = playersMap?.[`ID${pitcherId}`] ?? null;

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
              <Text style={[modalStyles.sheetInning, { color: teamColor }]}>
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
                      { label: "ER", val: pitcherPitching.runs },
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
          const event = play?.result?.event ?? "";
          const description = play?.result?.description ?? "";
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
                        { color: isScoringPlay ? onColor : teamColor },
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
    if (inning && inning !== 9) bottomLabel = `F/${inning}`;
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
  const { viewerData, isJoined } = useGamePresence(gamePk);

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
  const scrollY = useRef(new Animated.Value(0)).current;

  const TABS = ["Main", "Away", "Home", "Plays"];

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

  const boxscore = feed?.liveData?.boxscore ?? null;
  const playersMap = gameData?.players ?? {};
  const bsAwayTeam = boxscore?.teams?.away ?? null;
  const bsHomeTeam = boxscore?.teams?.home ?? null;
  const allPlays = feed?.liveData?.plays?.allPlays ?? [];

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
              team={awayTeam}
              score={awayScore}
              isWinner={awayWinner}
              side="away"
              isDarkMode={isDarkMode}
              theme={theme}
              scoreOpacity={gameScoreOpacity}
            />

            <StatusBadge status={status} linescore={linescore} theme={theme} />

            <TeamColumn
              team={homeTeam}
              score={homeScore}
              isWinner={homeWinner}
              side="home"
              isDarkMode={isDarkMode}
              theme={theme}
              scoreOpacity={gameScoreOpacity}
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
                {awayScore ?? "-"}
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
                        {linescore?.outs ?? 0} out
                        {linescore?.outs !== 1 ? "s" : ""}
                      </Text>
                    </>
                  );
                }
                const label =
                  status?.codedGameState === "F" ||
                  status?.detailedState === "Final"
                    ? "Final"
                    : (status?.detailedState ?? "");
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
                    {inningLabel && (
                      <Text
                        style={[
                          styles.miniStatusSub,
                          { color: theme.textTertiary },
                        ]}
                      >
                        {inningLabel}
                      </Text>
                    )}
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
                {homeScore ?? "-"}
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
        {activeTab === "Away" && (
          <BoxScorePanel
            bsTeamData={bsAwayTeam}
            playersMap={playersMap}
            theme={theme}
            teamColor={awayColor}
            team={awayTeam}
            boxscore={boxscore}
          />
        )}

        {activeTab === "Home" && (
          <BoxScorePanel
            bsTeamData={bsHomeTeam}
            playersMap={playersMap}
            theme={theme}
            teamColor={homeColor}
            team={homeTeam}
            boxscore={boxscore}
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
          />
        )}

        <View style={styles.bottomPadding} />
      </Animated.ScrollView>
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
});

export default GameDetailsScreen;

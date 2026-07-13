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
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Dimensions,
  PanResponder,
  TouchableWithoutFeedback,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Circle,
  Path,
} from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { useTheme } from "../../context/ThemeContext";
import { MLBService } from "../../services/MLBService";
import WBCService from "../../services/WBCService";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const BASEBALL_SPRITE = require("../../../assets/baseball-1.png");

const RIB_SPEED_OPTIONS = [
  { label: "0.5x", value: 0.5 },
  { label: "1x", value: 1 },
  { label: "1.5x", value: 1.5 },
  { label: "2x", value: 2 },
  { label: "3x", value: 3 },
];

const RIB_BASE_STEP = 3200;
const ribStepMs = (speed) => Math.round(RIB_BASE_STEP / Math.abs(speed));

const DERBY_DIAMOND_SIZE = 180;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDerbyDate = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

const playerHeadshotUrl = (id) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`;

const getTeamIdFromPlayer = (player) =>
  player?.currentTeam?.id ?? player?.team?.id ?? null;

const getTeamColorForPlayer = (player) => {
  const teamId = getTeamIdFromPlayer(player);
  if (teamId) {
    const color = MLBService.getTeamColorById(teamId);
    if (color) return color;
  }
  return "#888888";
};

const getTextOnColor = (hex) => {
  if (!hex || !hex.startsWith("#")) return "#ffffff";
  const c = hex.replace("#", "");
  const r = parseInt(c.substr(0, 2), 16) / 255;
  const g = parseInt(c.substr(2, 2), 16) / 255;
  const b = parseInt(c.substr(4, 2), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? "#000000" : "#ffffff";
};

const AnimBaseball = Animated.createAnimatedComponent(
  require("react-native").Image,
);

// ─── At-Bat Diamond Visualization ─────────────────────────────────────────────
const DerbyDiamondView = ({
  hits = [],
  currentHitIdx = -1,
  teamColor,
  theme,
  colors,
}) => {
  const size = DERBY_DIAMOND_SIZE;
  const cx = size / 2,
    cy = size / 2,
    r = size * 0.38;
  const corners = {
    home: { x: cx, y: cy + r },
    first: { x: cx + r, y: cy },
    second: { x: cx, y: cy - r },
    third: { x: cx - r, y: cy },
  };
  const hitDots = hits.map((h, i) => {
    const angle = (i / Math.max(hits.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const dist = r * (0.4 + (h.isHomeRun ? 0.8 : 0.3) + ((i * 7) % 20) / 100);
    return {
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      hit: h,
      idx: i,
    };
  });
  return (
    <View style={{ alignItems: "center", marginVertical: 8 }}>
      <Svg width={size} height={size}>
        <Path
          d={`M${corners.home.x},${corners.home.y} L${corners.first.x},${corners.first.y} L${corners.second.x},${corners.second.y} L${corners.third.x},${corners.third.y} Z`}
          fill="none"
          stroke={theme.border}
          strokeWidth={2}
        />
        {Object.values(corners).map((c, i) => (
          <Circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={5}
            fill={theme.surfaceSecondary}
            stroke={theme.border}
            strokeWidth={1.5}
          />
        ))}
        {hitDots.map((d) => (
          <Circle
            key={d.idx}
            cx={d.x}
            cy={d.y}
            r={d.idx === currentHitIdx ? 7 : 5}
            fill={d.hit.isHomeRun ? colors.primary : theme.textSecondary}
            stroke={d.idx === currentHitIdx ? "#fff" : "transparent"}
            strokeWidth={d.idx === currentHitIdx ? 2 : 0}
            opacity={d.idx <= currentHitIdx ? 0.9 : 0.25}
          />
        ))}
      </Svg>
    </View>
  );
};

// ─── Hit Timeline ─────────────────────────────────────────────────────────────
const HitTimeline = ({ hits, currentIdx, theme, colors }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={{ paddingHorizontal: 12, gap: 4 }}
  >
    {hits.map((h, i) => {
      const isActive = i === currentIdx;
      const isPast = i < currentIdx;
      return (
        <View
          key={i}
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isActive
              ? colors.primary
              : h.isHomeRun
                ? isPast
                  ? colors.primary + "44"
                  : theme.surfaceSecondary
                : theme.surfaceSecondary,
            borderWidth: isActive ? 2 : 1,
            borderColor: isActive ? "#fff" : theme.border,
          }}
        >
          <Text
            style={{
              fontSize: 8,
              fontWeight: "800",
              color: isActive
                ? "#fff"
                : h.isHomeRun
                  ? colors.primary
                  : theme.textSecondary,
            }}
          >
            {h.isHomeRun ? "HR" : "×"}
          </Text>
        </View>
      );
    })}
  </ScrollView>
);

// ─── Player Profile Modal ────────────────────────────────────────────────────
const PlayerProfileModal = ({
  visible,
  onClose,
  player,
  theme,
  colors,
  isDarkMode,
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
        if (gs.dy > 120 || gs.vy > 0.5) onClose();
        else
          Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  useEffect(() => {
    if (!visible) panY.setValue(0);
  }, [visible]);

  const seasonStats = useMemo(() => {
    for (const group of player?.stats || []) {
      if (group?.type?.displayName === "season") {
        const s = group?.splits || [];
        if (s.length > 0) return s[0]?.stat || {};
      }
    }
    return {};
  }, [player]);

  const metricStats = useMemo(() => {
    for (const group of player?.stats || []) {
      if (group?.type?.displayName === "metricAverages") {
        const result = {};
        (group?.splits || []).forEach((s) => {
          const m = s?.stat?.metric;
          if (m?.name && m?.averageValue != null)
            result[m.name] = { value: m.averageValue, unit: m.unit };
        });
        return result;
      }
    }
    return {};
  }, [player]);

  if (!player) return null;
  const teamId = getTeamIdFromPlayer(player);
  const teamColor = getTeamColorForPlayer(player);
  const teamName = player?.currentTeam?.name || "";
  const teamLogo = teamId ? WBCService.getTeamLogo(teamId, isDarkMode) : null;

  const seasonStatRows = [
    { key: "gamesPlayed", label: "Games" },
    { key: "avg", label: "AVG" },
    { key: "obp", label: "OBP" },
    { key: "slg", label: "SLG" },
    { key: "ops", label: "OPS" },
    { key: "homeRuns", label: "HR" },
    { key: "rbi", label: "RBI" },
    { key: "hits", label: "H" },
    { key: "doubles", label: "2B" },
    { key: "triples", label: "3B" },
    { key: "runs", label: "R" },
    { key: "strikeOuts", label: "SO" },
    { key: "baseOnBalls", label: "BB" },
    { key: "stolenBases", label: "SB" },
    { key: "atBats", label: "AB" },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={sStyles.ribOverlay} />
      </TouchableWithoutFeedback>
      <Animated.View
        style={[
          sStyles.ribSheet,
          {
            backgroundColor: theme.surface,
            borderTopColor: teamColor,
            transform: [{ translateY: panY }],
          },
        ]}
      >
        <View {...panResponder.panHandlers} style={sStyles.ribDragStrip}>
          <View
            style={[sStyles.ribHandle, { backgroundColor: theme.surface }]}
          />
          <View style={sStyles.ribHandleRow}>
            <TouchableOpacity
              onPress={onClose}
              style={[sStyles.ribCloseBtn, { backgroundColor: theme.error }]}
            >
              <Text style={sStyles.ribCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 20,
            paddingVertical: 16,
            gap: 16,
          }}
        >
          <View style={{ width: 80, height: 80, position: "relative" }}>
            <Image
              source={{ uri: playerHeadshotUrl(player?.id) }}
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                borderWidth: 3,
                borderColor: teamColor,
              }}
              resizeMode="cover"
            />
            {teamLogo && (
              <Image
                source={{ uri: teamLogo }}
                style={{
                  position: "absolute",
                  right: -4,
                  bottom: -4,
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                }}
                resizeMode="contain"
              />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 20, fontWeight: "900", color: theme.text }}
            >
              {player?.fullName}
            </Text>
            <Text
              style={{ fontSize: 13, color: theme.textSecondary, marginTop: 2 }}
            >
              {player?.primaryPosition?.name || ""} · {teamName}
            </Text>
            <Text
              style={{ fontSize: 12, color: theme.textTertiary, marginTop: 2 }}
            >
              {player?.height || ""} · {player?.weight || ""} lbs · Age{" "}
              {player?.currentAge || ""}
            </Text>
            <Text style={{ fontSize: 12, color: theme.textTertiary }}>
              {player?.batSide?.description || ""} ·{" "}
              {player?.pitchHand?.description || ""}
            </Text>
          </View>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        >
          {Object.keys(metricStats).length > 0 && (
            <View style={{ marginBottom: 20 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "800",
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  color: colors.primary,
                  marginBottom: 10,
                }}
              >
                STATCAST METRICS
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {Object.entries(metricStats).map(([key, m]) => (
                  <View
                    key={key}
                    style={{
                      flex: 1,
                      minWidth: (SCREEN_W - 60) / 2 - 5,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: theme.border,
                      padding: 12,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 22,
                        fontWeight: "900",
                        color: theme.text,
                      }}
                    >
                      {m.value}
                    </Text>
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "600",
                        color: theme.textTertiary,
                        textTransform: "uppercase",
                      }}
                    >
                      {m.unit || key}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "800",
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: colors.primary,
                marginBottom: 10,
              }}
            >
              SEASON STATS
            </Text>
            <View
              style={{
                borderRadius: 10,
                borderWidth: 1,
                borderColor: theme.border,
                overflow: "hidden",
              }}
            >
              {seasonStatRows.map((row, i) => {
                const val = seasonStats[row.key];
                if (val == null) return null;
                return (
                  <View
                    key={row.key}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      backgroundColor:
                        i % 2 === 0 ? theme.surfaceSecondary : theme.surface,
                      borderBottomWidth:
                        i < seasonStatRows.length - 1
                          ? StyleSheet.hairlineWidth
                          : 0,
                      borderBottomColor: theme.border,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: theme.textSecondary }}>
                      {row.label}
                    </Text>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: theme.text,
                      }}
                    >
                      {val}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "800",
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: colors.primary,
                marginBottom: 10,
              }}
            >
              BACKGROUND
            </Text>
            <View
              style={{
                borderRadius: 10,
                borderWidth: 1,
                borderColor: theme.border,
                padding: 14,
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 13, color: theme.text }}>
                <Text style={{ color: theme.textSecondary }}>Born: </Text>
                {player?.birthDate || "—"} ·{" "}
                {[
                  player?.birthCity,
                  player?.birthStateProvince,
                  player?.birthCountry,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </Text>
              <Text style={{ fontSize: 13, color: theme.text }}>
                <Text style={{ color: theme.textSecondary }}>MLB Debut: </Text>
                {player?.mlbDebutDate || "—"}
              </Text>
              <Text style={{ fontSize: 13, color: theme.text }}>
                <Text style={{ color: theme.textSecondary }}>Draft: </Text>
                {player?.draftYear || "—"}
              </Text>
            </View>
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
};

// ─── Pool Seed Card ───────────────────────────────────────────────────────────
const PoolSeedCard = ({
  seed,
  playersMap,
  isDarkMode,
  theme,
  colors,
  isPreview,
  onPress,
}) => {
  if (!seed) return null;
  const pid = seed?.player?.id;
  const player = pid ? playersMap[pid] : seed?.player;
  const teamId = getTeamIdFromPlayer(player);
  const teamColor = getTeamColorForPlayer(player);
  const hrs = seed?.numHomeRuns ?? 0;
  const topHit = seed?.topDerbyHitData;
  const hasHitData =
    topHit && (topHit.launchSpeed > 0 || topHit.totalDistance > 0);
  const totalPitches = seed?.hits?.length ?? 0;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View
        style={[
          sStyles.poolCard,
          {
            backgroundColor: theme.surfaceSecondary,
            borderColor: seed?.isWinner ? colors.primary : theme.border,
            borderWidth: seed?.isWinner ? 2 : 1,
          },
        ]}
      >
        <View
          style={[
            sStyles.seedBadge,
            { backgroundColor: teamColor + "22", borderColor: teamColor },
          ]}
        >
          <Text style={[sStyles.seedText, { color: teamColor }]}>
            {seed?.seed || "?"}
          </Text>
        </View>
        <View style={sStyles.poolHeadshotWrap}>
          <Image
            source={{ uri: playerHeadshotUrl(pid) }}
            style={[sStyles.poolHeadshot, { borderColor: teamColor }]}
            resizeMode="cover"
          />
          {teamId && (
            <Image
              source={{ uri: WBCService.getTeamLogo(teamId, isDarkMode) }}
              style={sStyles.poolTeamLogo}
              resizeMode="contain"
            />
          )}
        </View>
        <View style={sStyles.poolInfo}>
          <Text
            style={[sStyles.poolName, { color: theme.text }]}
            numberOfLines={1}
          >
            {player?.fullName || "TBD"}
          </Text>
          <Text
            style={[sStyles.poolTeam, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {player?.currentTeam?.name || ""}
          </Text>
          <Text
            style={{ fontSize: 10, color: theme.textTertiary, marginTop: 2 }}
          >
            {totalPitches} pitches
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          {!isPreview && (
            <View style={sStyles.poolHrBlock}>
              <Text style={[sStyles.poolHrCount, { color: colors.primary }]}>
                {hrs}
              </Text>
              <Text
                style={[sStyles.poolHrLabel, { color: theme.textTertiary }]}
              >
                HR
              </Text>
            </View>
          )}
          {hasHitData && (
            <Text
              style={{ fontSize: 9, color: theme.textTertiary, marginTop: 4 }}
            >
              {topHit.launchSpeed > 0 ? `${topHit.launchSpeed} mph` : ""}
              {topHit.totalDistance > 0 ? ` · ${topHit.totalDistance} ft` : ""}
            </Text>
          )}
        </View>
        {seed?.isWinner && (
          <View
            style={[
              sStyles.winnerBadge,
              { backgroundColor: colors.primary + "22" },
            ]}
          >
            <Ionicons name="trophy" size={12} color={colors.primary} />
            <Text style={[sStyles.winnerText, { color: colors.primary }]}>
              WINNER
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ─── Bracket Matchup Card ─────────────────────────────────────────────────────
const BracketMatchupCard = ({
  topSeed,
  bottomSeed,
  playersMap,
  isDarkMode,
  theme,
  colors,
  isPreview,
  onPressTop,
  onPressBottom,
}) => {
  const renderSide = (seed, side) => {
    if (!seed) return null;
    const pid = seed?.player?.id;
    const player = pid ? playersMap[pid] : seed?.player;
    const teamId = getTeamIdFromPlayer(player);
    const teamColor = getTeamColorForPlayer(player);
    const hrs = seed?.numHomeRuns ?? 0;
    const totalPitches = seed?.hits?.length ?? 0;
    return (
      <TouchableOpacity
        onPress={side === "top" ? onPressTop : onPressBottom}
        activeOpacity={0.8}
      >
        <View style={sStyles.bracketSide}>
          <View style={sStyles.bracketSeedBadge}>
            <Text style={[sStyles.bracketSeedText, { color: teamColor }]}>
              {seed?.seed || "?"}
            </Text>
          </View>
          <Image
            source={{ uri: playerHeadshotUrl(pid) }}
            style={[
              sStyles.bracketHeadshot,
              {
                borderColor: seed?.isWinner ? colors.primary : teamColor,
                borderWidth: seed?.isWinner ? 3 : 2,
              },
            ]}
            resizeMode="cover"
          />
          {teamId && (
            <Image
              source={{ uri: WBCService.getTeamLogo(teamId, isDarkMode) }}
              style={sStyles.bracketTeamLogo}
              resizeMode="contain"
            />
          )}
          <View style={sStyles.bracketInfo}>
            <Text
              style={[
                sStyles.bracketName,
                {
                  color: seed?.isWinner ? colors.primary : theme.text,
                  fontWeight: seed?.isWinner ? "800" : "600",
                },
              ]}
              numberOfLines={1}
            >
              {player?.fullName || "TBD"}
            </Text>
            <Text
              style={[sStyles.bracketTeam, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {player?.currentTeam?.abbreviation || ""} · {totalPitches} pitches
            </Text>
          </View>
          <View style={sStyles.bracketHrBlock}>
            <Text
              style={[
                sStyles.bracketHrCount,
                {
                  color: seed?.isWinner ? colors.primary : theme.text,
                  fontWeight: seed?.isWinner ? "800" : "700",
                },
              ]}
            >
              {hrs}
            </Text>
            <Text
              style={[sStyles.bracketHrLabel, { color: theme.textTertiary }]}
            >
              HR
            </Text>
          </View>
          {seed?.isWinner && (
            <View
              style={[
                sStyles.bracketWinnerIcon,
                { backgroundColor: colors.primary + "22" },
              ]}
            >
              <Ionicons name="trophy" size={14} color={colors.primary} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };
  return (
    <View
      style={[
        sStyles.bracketCard,
        { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
      ]}
    >
      {renderSide(topSeed, "top")}
      <View
        style={[sStyles.bracketDivider, { backgroundColor: theme.border }]}
      />
      {renderSide(bottomSeed, "bottom")}
    </View>
  );
};

// ─── Derby Info Bubble ────────────────────────────────────────────────────────
const DerbyInfoBubble = ({ status, rounds, theme, colors }) => {
  const roundTime = rounds?.[0]?.roundTime || 0;
  const pitchesPerRound =
    status?.pitchesInRound || rounds?.[0]?.numberOfPitches || 0;
  const swingsPerRound =
    status?.swingsInRound || rounds?.[0]?.numberOfSwings || 0;
  const bonusDist = status?.bonusDistanceNeededPerRound || 0;
  const bonusCount = status?.bonusCountNeededPerRound || 0;
  const bonusOuts = status?.bonusOutsTotal || 0;
  const bonusTypeOuts = status?.bonusTypeOuts ?? true;
  const timeLeft = status?.currentRoundTimeLeft || "";
  const pitchesRemaining = status?.pitchesRemaining ?? null;
  const swingsRemaining = status?.swingsRemaining ?? null;

  const fmtTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const items = [];
  if (roundTime > 0)
    items.push({
      label: "Round Time",
      value: fmtTime(roundTime),
      icon: "time-outline",
    });
  if (pitchesPerRound > 0)
    items.push({
      label: "Pitches / Round",
      value: String(pitchesPerRound),
      icon: "baseball-outline",
    });
  if (swingsPerRound > 0)
    items.push({
      label: "Swings / Round",
      value: String(swingsPerRound),
      icon: "flash-outline",
    });
  if (bonusDist > 0)
    items.push({
      label: "Bonus Distance",
      value: `${bonusDist} ft`,
      icon: "trending-up-outline",
    });
  if (bonusCount > 0)
    items.push({
      label: "Bonus HR Count",
      value: String(bonusCount),
      icon: "star-outline",
    });
  if (bonusOuts > 0)
    items.push({
      label: `Bonus ${bonusTypeOuts ? "Outs" : "Pitches"}`,
      value: String(bonusOuts),
      icon: "alert-circle-outline",
    });
  if (timeLeft && timeLeft !== "-:--" && timeLeft !== "--")
    items.push({ label: "Time Left", value: timeLeft, icon: "timer-outline" });
  if (pitchesRemaining != null && pitchesRemaining > 0)
    items.push({
      label: "Pitches Left",
      value: String(pitchesRemaining),
      icon: "chevron-down-outline",
    });
  if (swingsRemaining != null && swingsRemaining > 0)
    items.push({
      label: "Swings Left",
      value: String(swingsRemaining),
      icon: "chevron-down-outline",
    });

  if (items.length === 0) return null;

  return (
    <View
      style={[
        sStyles.infoBubble,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={[sStyles.infoHeader, { borderBottomColor: theme.border }]}>
        <Ionicons name="information-circle" size={16} color={colors.primary} />
        <Text style={[sStyles.infoHeaderTitle, { color: theme.text }]}>
          DERBY FORMAT
        </Text>
      </View>
      <View style={sStyles.infoGrid}>
        {items.map((item, i) => (
          <View
            key={i}
            style={[sStyles.infoCell, { borderRightColor: theme.border }]}
          >
            <Ionicons name={item.icon} size={14} color={theme.textTertiary} />
            <Text style={[sStyles.infoValue, { color: theme.text }]}>
              {item.value}
            </Text>
            <Text style={[sStyles.infoLabel, { color: theme.textTertiary }]}>
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

// ─── Live At-Bat / RIB Playback View ─────────────────────────────────────────
const LiveAtBatView = ({
  isRIB,
  ribHitData,
  liveSeed,
  ribCursor,
  ribTotal,
  ribPaused,
  theme,
  colors,
  isDarkMode,
  playersMap,
  onTogglePause,
  onPrev,
  onNext,
}) => {
  const seed = isRIB ? ribHitData?.seed : liveSeed?.seed;
  const player = isRIB
    ? ribHitData?.player
    : liveSeed?.player || playersMap[seed?.player?.id];
  const hit = isRIB
    ? ribHitData?.hit
    : seed?.hits?.length > 0
      ? seed.hits[seed.hits.length - 1]
      : null;
  const round = isRIB ? ribHitData?.round : liveSeed?.round;
  const teamId = getTeamIdFromPlayer(player);
  const teamColor = getTeamColorForPlayer(player);
  const isHR = hit?.isHomeRun;
  const timeLeft = hit?.timeRemaining || "";
  const isBonusTime = hit?.isBonusTime || false;
  const points = hit?.points ?? 0;
  const totalHRs = seed?.numHomeRuns ?? 0;
  const hits = seed?.hits || [];
  const hitIdx = isRIB ? hits.indexOf(hit) : hits.length - 1;

  if (!seed && !isRIB) return null;

  return (
    <View
      style={[
        sStyles.liveCard,
        {
          backgroundColor: theme.surface,
          borderColor: teamColor || theme.border,
        },
      ]}
    >
      <View
        style={[
          sStyles.liveHeader,
          {
            borderBottomColor: theme.border,
            backgroundColor: (teamColor || colors.primary) + "12",
          },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            flex: 1,
          }}
        >
          <View style={{ width: 40, height: 40, position: "relative" }}>
            <Image
              source={{ uri: playerHeadshotUrl(player?.id) }}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                borderWidth: 2,
                borderColor: teamColor || theme.border,
              }}
              resizeMode="cover"
            />
            {teamId && (
              <Image
                source={{ uri: WBCService.getTeamLogo(teamId, isDarkMode) }}
                style={{
                  position: "absolute",
                  right: -3,
                  bottom: -3,
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                }}
                resizeMode="contain"
              />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 14, fontWeight: "800", color: theme.text }}
              numberOfLines={1}
            >
              {player?.fullName || "—"}
            </Text>
            <Text
              style={{ fontSize: 11, color: theme.textSecondary }}
              numberOfLines={1}
            >
              {player?.currentTeam?.name || ""} · Seed {seed?.seed || "?"} ·{" "}
              {totalHRs} HR
            </Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: theme.text }}>
            Round {round || "?"}
          </Text>
          {isRIB && (
            <Text style={{ fontSize: 10, color: theme.textTertiary }}>
              {ribCursor + 1} / {ribTotal}
            </Text>
          )}
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: 20,
          paddingVertical: 8,
        }}
      >
        <View style={{ alignItems: "center" }}>
          <Text
            style={{
              fontSize: 22,
              fontWeight: "900",
              color: isBonusTime ? "#FF9800" : theme.text,
            }}
          >
            {timeLeft && timeLeft !== "--"
              ? timeLeft
              : isBonusTime
                ? "BONUS"
                : "—"}
          </Text>
          <Text
            style={{
              fontSize: 9,
              fontWeight: "600",
              color: theme.textTertiary,
              textTransform: "uppercase",
            }}
          >
            {isBonusTime ? "Bonus Time" : "Time Left"}
          </Text>
        </View>
        <View style={{ width: 1, height: 28, backgroundColor: theme.border }} />
        <View style={{ alignItems: "center" }}>
          <Text
            style={{
              fontSize: 22,
              fontWeight: "900",
              color: points > 0 ? "#22C55E" : theme.text,
            }}
          >
            {seed?.numPoints ?? 0}
          </Text>
          <Text
            style={{
              fontSize: 9,
              fontWeight: "600",
              color: theme.textTertiary,
              textTransform: "uppercase",
            }}
          >
            Points
          </Text>
        </View>
        <View style={{ width: 1, height: 28, backgroundColor: theme.border }} />
        <View style={{ alignItems: "center" }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              borderWidth: 2,
              borderColor: isHR ? "#22C55E" : "#EF4444",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isHR
                ? "rgba(34,197,94,0.15)"
                : "rgba(239,68,68,0.1)",
            }}
          >
            <Text style={{ fontSize: 16 }}>{isHR ? "💣" : "❌"}</Text>
          </View>
          <Text
            style={{
              fontSize: 9,
              fontWeight: "700",
              color: isHR ? "#22C55E" : theme.textSecondary,
              marginTop: 2,
            }}
          >
            {isHR ? "HR!" : "Out"}
          </Text>
        </View>
      </View>

      {hits.length > 0 && (
        <DerbyDiamondView
          hits={hits.map((h) => ({ isHomeRun: h.isHomeRun }))}
          currentHitIdx={hitIdx}
          teamColor={teamColor}
          theme={theme}
          colors={colors}
        />
      )}
      {hits.length > 1 && (
        <HitTimeline
          hits={hits}
          currentIdx={hitIdx}
          theme={theme}
          colors={colors}
        />
      )}

      {isRIB && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            paddingTop: 8,
            paddingBottom: 4,
          }}
        >
          <TouchableOpacity
            onPress={onPrev}
            style={[
              sStyles.miniCtrl,
              { backgroundColor: theme.surfaceSecondary },
            ]}
            disabled={ribCursor === 0}
          >
            <Ionicons
              name="play-skip-back"
              size={16}
              color={ribCursor === 0 ? theme.textTertiary : theme.text}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onTogglePause}
            style={[sStyles.miniPlayBtn, { backgroundColor: colors.primary }]}
          >
            <Ionicons
              name={ribPaused ? "play" : "pause"}
              size={18}
              color="#fff"
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onNext}
            style={[
              sStyles.miniCtrl,
              { backgroundColor: theme.surfaceSecondary },
            ]}
            disabled={ribCursor >= ribTotal - 1}
          >
            <Ionicons
              name="play-skip-forward"
              size={16}
              color={
                ribCursor >= ribTotal - 1 ? theme.textTertiary : theme.text
              }
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// ─── Derby Share Card ─────────────────────────────────────────────────────────
const DerbyShareCard = ({
  visible,
  onClose,
  player,
  result,
  rounds,
  playersMap,
  theme,
  colors,
  isDarkMode,
}) => {
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(false);

  if (!player) return null;

  const teamId = getTeamIdFromPlayer(player);
  const teamColor = getTeamColorForPlayer(player);
  const teamName = player?.currentTeam?.name || "";
  const teamLogo = teamId ? WBCService.getTeamLogo(teamId, isDarkMode) : null;
  const CARD_SIZE = Math.min(SCREEN_W - 48, 400);

  const seasonStats = (() => {
    for (const group of player?.stats || []) {
      if (group?.type?.displayName === "season") {
        const s = group?.splits || [];
        if (s.length > 0) return s[0]?.stat || {};
      }
    }
    return {};
  })();

  const playerResults = [];
  (rounds || []).forEach((r) => {
    (r.matchups || []).forEach((mx) => {
      ["topSeed", "bottomSeed"].forEach((side) => {
        const seed = mx[side];
        if (seed?.player?.id === player?.id)
          playerResults.push({ round: r.round, type: r.type, seed });
      });
    });
  });

  const handleShare = async () => {
    try {
      setSharing(true);
      const uri = await cardRef.current.capture();
      await Sharing.shareAsync(uri, { mimeType: "image/png" });
    } catch (e) {
      console.log("Share error", e);
    } finally {
      setSharing(false);
    }
  };

  const CARD_STATS = [
    { key: "homeRuns", label: "HR" },
    { key: "avg", label: "AVG" },
    { key: "ops", label: "OPS" },
    { key: "rbi", label: "RBI" },
    { key: "hits", label: "H" },
    { key: "strikeOuts", label: "SO" },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={sStyles.shareOverlay}>
        <ViewShot
          ref={cardRef}
          options={{ format: "png", quality: 1 }}
          style={{ overflow: "hidden" }}
        >
          <View
            style={[
              sStyles.shareCard,
              { width: CARD_SIZE, backgroundColor: theme.surface },
            ]}
          >
            <View
              style={[
                sStyles.shareHeader,
                {
                  backgroundColor: teamColor + "22",
                  borderBottomColor: teamColor,
                },
              ]}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <View style={{ width: 56, height: 56, position: "relative" }}>
                  <Image
                    source={{ uri: playerHeadshotUrl(player?.id) }}
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      borderWidth: 2.5,
                      borderColor: teamColor,
                    }}
                    resizeMode="cover"
                  />
                  {teamLogo && (
                    <Image
                      source={{ uri: teamLogo }}
                      style={{
                        position: "absolute",
                        right: -4,
                        bottom: -4,
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                      }}
                      resizeMode="contain"
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: "900",
                      color: theme.text,
                    }}
                  >
                    {player?.fullName}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                    {player?.primaryPosition?.name || ""} · {teamName}
                  </Text>
                  {result && (
                    <Text
                      style={{
                        fontSize: 12,
                        color: colors.primary,
                        fontWeight: "700",
                        marginTop: 2,
                      }}
                    >
                      Round {result.round} ({result.type}) ·{" "}
                      {result.seed?.numHomeRuns ?? 0} HR
                    </Text>
                  )}
                </View>
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {CARD_STATS.map(({ key, label }, i) => (
                <View
                  key={key}
                  style={{
                    width: "33.333%",
                    alignItems: "center",
                    paddingVertical: 12,
                    borderRightWidth:
                      i % 3 !== 2 ? StyleSheet.hairlineWidth : 0,
                    borderBottomWidth: i < 3 ? StyleSheet.hairlineWidth : 0,
                    borderColor: theme.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "800",
                      color: theme.text,
                    }}
                  >
                    {seasonStats[key] ?? "—"}
                  </Text>
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "600",
                      color: theme.textSecondary,
                      textTransform: "uppercase",
                      marginTop: 2,
                    }}
                  >
                    {label}
                  </Text>
                </View>
              ))}
            </View>
            {playerResults.length > 0 && (
              <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "800",
                    color: colors.primary,
                    letterSpacing: 0.5,
                    marginBottom: 6,
                  }}
                >
                  DERBY RESULTS
                </Text>
                {playerResults.map((pr, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                      Round {pr.round} ({pr.type})
                      {pr.seed?.isWinner ? " ✓" : ""}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "800",
                        color: colors.primary,
                      }}
                    >
                      {pr.seed?.numHomeRuns ?? 0} HR
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <View
              style={[sStyles.shareFooter, { borderTopColor: theme.border }]}
            >
              <Text
                style={{ fontSize: 9, fontWeight: "800", color: theme.text }}
              >
                SportsHeart{" "}
                <Ionicons name="heart" size={9} color={colors.primary} />
              </Text>
            </View>
          </View>
        </ViewShot>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <TouchableOpacity
            onPress={handleShare}
            disabled={sharing}
            style={[sStyles.shareBtn, { backgroundColor: colors.primary }]}
          >
            {sharing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Ionicons name="share-outline" size={16} color="#fff" />
                <Text
                  style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}
                >
                  Share
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClose}
            style={[sStyles.shareBtn, { backgroundColor: theme.border }]}
          >
            <Text
              style={{ color: theme.text, fontSize: 14, fontWeight: "700" }}
            >
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
const HomeRunDerbyScreen = ({ navigation, route }) => {
  const { colors, theme, isDarkMode } = useTheme();

  // ALL hooks declared at the top - before any early returns
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("main");
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [shareDerbyPlayer, setShareDerbyPlayer] = useState(null);
  const [shareDerbyResult, setShareDerbyResult] = useState(null);
  const [expandedResultKey, setExpandedResultKey] = useState(null);

  // Reset expanded result when tab changes
  useEffect(() => {
    setExpandedResultKey(null);
  }, [activeTab]);

  // RIB state
  const [ribActive, setRibActive] = useState(false);
  const [ribPaused, setRibPaused] = useState(false);
  const [ribSpeed, setRibSpeed] = useState(1);
  const [ribCursor, setRibCursor] = useState(0);
  const [ribSpeedPopup, setRibSpeedPopup] = useState(false);
  const [ribRoundPopup, setRibRoundPopup] = useState(false);
  const [ribBatterPopup, setRibBatterPopup] = useState(false);
  const [ribSelectedRounds, setRibSelectedRounds] = useState(null);
  const [ribSelectedBatters, setRibSelectedBatters] = useState(null);

  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerH, setHeaderH] = useState(0);
  const [showMini, setShowMini] = useState(false);
  const eventId = route?.params?.eventId;

  const fetchData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        let derbyData = null;
        if (eventId) {
          try {
            const res = await fetch(
              `https://statsapi.mlb.com/api/v1/homeRunDerby/${eventId}`,
              { headers: { "Cache-Control": "no-cache" } },
            );
            if (res.ok) derbyData = await res.json();
          } catch {}
        }
        if (!derbyData?.rounds?.length) {
          const year = new Date().getFullYear();
          derbyData = await MLBService.getHomeRunDerby(year);
          if (!derbyData?.rounds?.length)
            derbyData = await MLBService.getHomeRunDerby(year - 1);
        }
        if (!derbyData?.rounds?.length)
          setError("No Home Run Derby data available.");
        else setData(derbyData);
      } catch {
        setError("Failed to load Home Run Derby data.");
      } finally {
        setLoading(false);
      }
    },
    [eventId],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // All derived data via useMemo
  const info = data?.info || {};
  const status = data?.status || {};
  const rounds = data?.rounds || [];
  const players = data?.players || [];
  const isPreview = status?.state === "Preview";
  const isFinal = status?.state === "Final";
  const isLive = !isPreview && !isFinal;
  const eventName = info?.name || "Home Run Derby";
  const venueName = info?.venue?.name || "";

  const playersMap = useMemo(() => {
    const m = {};
    players.forEach((p) => {
      if (p?.id) m[p.id] = p;
    });
    return m;
  }, [players]);

  const sortedPlayers = useMemo(
    () =>
      [...players].sort((a, b) =>
        (a.lastName || a.fullName || "").localeCompare(
          b.lastName || b.fullName || "",
        ),
      ),
    [players],
  );

  // RIB — uses already-fetched data directly (no separate fetch)
  const ribAllHits = useMemo(() => {
    const hits = [];
    rounds.forEach((r) => {
      (r.matchups || []).forEach((mx, mi) => {
        ["topSeed", "bottomSeed"].forEach((side) => {
          const seed = mx[side];
          if (!seed?.hits?.length) return;
          const pid = seed?.player?.id;
          const player = pid ? playersMap[pid] : null;
          seed.hits.forEach((h) => {
            hits.push({
              round: r.round,
              matchupIdx: mi,
              side,
              player,
              hit: h,
              seed,
            });
          });
        });
      });
    });
    return hits;
  }, [rounds, playersMap]);

  const ribFilteredHits = useMemo(() => {
    let filtered = ribAllHits;
    if (ribSelectedRounds?.size > 0)
      filtered = filtered.filter((h) => ribSelectedRounds.has(h.round));
    if (ribSelectedBatters?.size > 0)
      filtered = filtered.filter((h) => ribSelectedBatters.has(h.player?.id));
    return filtered;
  }, [ribAllHits, ribSelectedRounds, ribSelectedBatters]);

  const ribBatterOptions = useMemo(() => {
    const seen = new Set();
    const list = [];
    ribAllHits.forEach((h) => {
      if (h.player?.id && !seen.has(h.player.id)) {
        seen.add(h.player.id);
        list.push(h.player);
      }
    });
    return list;
  }, [ribAllHits]);

  const ribHasHits = ribFilteredHits.length > 0;
  const ribTotalHits = ribFilteredHits.length;
  const ribCurrentHit = ribFilteredHits[ribCursor] || null;

  const ribBatterHits = useMemo(() => {
    if (!ribCurrentHit) return [];
    const { round, matchupIdx, side } = ribCurrentHit;
    const r = rounds.find((r) => r.round === round);
    const mx = r?.matchups?.[matchupIdx];
    return mx?.[side]?.hits || [];
  }, [ribCurrentHit, rounds]);

  const ribCurrentHitIdx = useMemo(() => {
    if (!ribCurrentHit || !ribBatterHits.length) return -1;
    return ribBatterHits.indexOf(ribCurrentHit.hit);
  }, [ribCurrentHit, ribBatterHits]);

  const ribIntervalRef = useRef(null);
  useEffect(() => {
    if (!ribActive || ribPaused || !ribHasHits) {
      if (ribIntervalRef.current) clearInterval(ribIntervalRef.current);
      ribIntervalRef.current = null;
      return;
    }
    ribIntervalRef.current = setInterval(() => {
      setRibCursor((prev) => {
        if (prev >= ribFilteredHits.length - 1) {
          setRibPaused(true);
          return prev;
        }
        return prev + 1;
      });
    }, ribStepMs(ribSpeed));
    return () => {
      if (ribIntervalRef.current) clearInterval(ribIntervalRef.current);
    };
  }, [ribActive, ribPaused, ribSpeed, ribHasHits, ribFilteredHits.length]);

  const openRIB = useCallback(() => {
    if (!ribAllHits.length) return;
    setRibActive(true);
    setRibPaused(true);
    setRibCursor(0);
  }, [ribAllHits.length]);

  const closeRIB = useCallback(() => {
    setRibActive(false);
    setRibPaused(false);
    setRibCursor(0);
    setRibSelectedRounds(null);
    setRibSelectedBatters(null);
  }, []);

  const handleScroll = useCallback(
    (e) => {
      setShowMini(e.nativeEvent.contentOffset.y > headerH - 20);
    },
    [headerH],
  );

  const finalsWinner = useMemo(() => {
    if (!isFinal || !rounds.length) return null;
    const lastRound = rounds[rounds.length - 1];
    const finalMatchup = lastRound?.matchups?.[0];
    const winnerSeed = finalMatchup?.topSeed?.isWinner
      ? finalMatchup.topSeed
      : finalMatchup?.bottomSeed?.isWinner
        ? finalMatchup.bottomSeed
        : null;
    return winnerSeed?.player?.id ? playersMap[winnerSeed.player.id] : null;
  }, [isFinal, rounds, playersMap]);

  // Find current live batter for at-bat view
  const currentLiveSeed = useMemo(() => {
    if (!isLive) return null;
    for (const round of [...rounds].reverse()) {
      for (const mx of [...(round.matchups || [])].reverse()) {
        for (const side of ["bottomSeed", "topSeed"]) {
          const seed = mx?.[side];
          if (seed?.started && !seed?.complete && seed?.hits?.length > 0) {
            return {
              seed,
              round: round.round,
              type: round.type,
              player: playersMap[seed?.player?.id],
            };
          }
        }
      }
    }
    // Fallback: any started seed with hits
    for (const round of [...rounds].reverse()) {
      for (const mx of [...(round.matchups || [])].reverse()) {
        for (const side of ["bottomSeed", "topSeed"]) {
          const seed = mx?.[side];
          if (seed?.started && seed?.hits?.length > 0) {
            return {
              seed,
              round: round.round,
              type: round.type,
              player: playersMap[seed?.player?.id],
            };
          }
        }
      }
    }
    return null;
  }, [isLive, rounds, playersMap]);

  // Pool round: split seeds into top/bottom groups
  const poolRound = rounds.find((r) => r.type === "Pool");
  const topSeeds = useMemo(() => {
    if (!poolRound) return [];
    const seeds = [];
    (poolRound.matchups || []).forEach((mx) => {
      if (mx.topSeed) seeds.push(mx.topSeed);
    });
    return seeds.sort((a, b) => (a.seed || 0) - (b.seed || 0));
  }, [poolRound]);
  const bottomSeeds = useMemo(() => {
    if (!poolRound) return [];
    const seeds = [];
    (poolRound.matchups || []).forEach((mx) => {
      if (mx.bottomSeed) seeds.push(mx.bottomSeed);
    });
    return seeds.sort((a, b) => (a.seed || 0) - (b.seed || 0));
  }, [poolRound]);

  const bracketRounds = rounds.filter((r) => r.type === "Bracket");

  // NOW the early returns — all hooks already declared
  if (loading) {
    return (
      <View style={[sStyles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[sStyles.loadingText, { color: theme.textSecondary }]}>
          Loading Home Run Derby…
        </Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[sStyles.centered, { backgroundColor: theme.background }]}>
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={theme.textSecondary}
        />
        <Text style={[sStyles.errorText, { color: theme.textSecondary }]}>
          {error || "No data available."}
        </Text>
        <TouchableOpacity
          onPress={() => fetchData()}
          style={[sStyles.retryBtn, { borderColor: colors.primary }]}
        >
          <Text style={[sStyles.retryText, { color: colors.primary }]}>
            Retry
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const threshold = headerH > 0 ? headerH - 40 : 120;
  const stickyMiniHeight = scrollY.interpolate({
    inputRange: [threshold, threshold + 40],
    outputRange: [0, 54],
    extrapolate: "clamp",
  });
  const stickyOpacity = scrollY.interpolate({
    inputRange: [threshold, threshold + 40],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const mainHeaderOpacity = scrollY.interpolate({
    inputRange: [0, Math.max(0, headerH - 40)],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const TAB_LIST = [
    "main",
    "participants",
    ...sortedPlayers.map((p) => `player_${p.id}`),
  ];

  return (
    <View style={[sStyles.screen, { backgroundColor: theme.background }]}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchData(true).finally(() => setRefreshing(false));
            }}
            colors={[colors.primary]}
          />
        }
        scrollEventThrottle={16}
        stickyHeaderIndices={[1]}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { listener: handleScroll, useNativeDriver: false },
        )}
      >
        {/* Main Header */}
        <View
          style={[sStyles.header, { backgroundColor: theme.surface }]}
          onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
        >
          <Svg
            style={StyleSheet.absoluteFill}
            width="115%"
            height={300}
            pointerEvents="none"
          >
            <Defs>
              <LinearGradient
                id="derbyGrad"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <Stop offset="0%" stopColor="#134A8E" stopOpacity="0.3" />
                <Stop offset="50%" stopColor={theme.surface} stopOpacity="0" />
                <Stop offset="100%" stopColor="#AB0003" stopOpacity="0.2" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#derbyGrad)" />
          </Svg>
          <Animated.View style={{ opacity: mainHeaderOpacity }}>
            <View style={sStyles.headerCenter}>
              <Image
                source={require("../../../assets/mlb.png")}
                style={sStyles.headerLogo}
                resizeMode="contain"
              />
              <Text style={[sStyles.headerEventName, { color: theme.text }]}>
                Home Run Derby
              </Text>
              <Text
                style={[sStyles.headerSubName, { color: theme.textSecondary }]}
                numberOfLines={2}
              >
                {eventName}
              </Text>
              {!!venueName && (
                <View style={sStyles.venueRow}>
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={theme.textTertiary}
                  />
                  <Text
                    style={[sStyles.venueText, { color: theme.textTertiary }]}
                  >
                    {venueName}
                  </Text>
                </View>
              )}
              <Text style={[sStyles.dateText, { color: theme.textTertiary }]}>
                {fmtDerbyDate(info?.eventDate)}
              </Text>
            </View>
            <View style={sStyles.statusBadgeWrap}>
              <View
                style={[
                  sStyles.statusBadge,
                  {
                    backgroundColor: isPreview
                      ? "rgba(59,130,246,0.15)"
                      : isLive
                        ? "rgba(34,197,94,0.15)"
                        : "rgba(148,163,184,0.15)",
                    borderColor: isPreview
                      ? "#3B82F6"
                      : isLive
                        ? "#22C55E"
                        : "#94A3B8",
                  },
                ]}
              >
                <View
                  style={[
                    sStyles.statusDot,
                    {
                      backgroundColor: isPreview
                        ? "#3B82F6"
                        : isLive
                          ? "#22C55E"
                          : "#94A3B8",
                    },
                  ]}
                />
                <Text
                  style={[
                    sStyles.statusText,
                    {
                      color: isPreview
                        ? "#3B82F6"
                        : isLive
                          ? "#22C55E"
                          : "#94A3B8",
                    },
                  ]}
                >
                  {isPreview
                    ? "PREVIEW"
                    : isLive
                      ? `ROUND ${status?.currentRound || "?"}`
                      : "FINAL"}
                </Text>
              </View>
            </View>
          </Animated.View>
        </View>

        {/* Sticky Header Section (mini header + tabs) */}
        <View style={{ backgroundColor: theme.surface }}>
          <Animated.View
            style={[
              sStyles.stickyMini,
              {
                height: stickyMiniHeight,
                opacity: stickyOpacity,
                backgroundColor: theme.surface,
                borderBottomColor: theme.border,
              },
            ]}
          >
            <View style={sStyles.miniCenter}>
              <Image
                source={require("../../../assets/mlb.png")}
                style={sStyles.miniLogo}
                resizeMode="contain"
              />
              <Text
                style={[sStyles.miniTitle, { color: theme.text }]}
                numberOfLines={1}
              >
                Home Run Derby
              </Text>
              {finalsWinner && (
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.textSecondary,
                    marginLeft: -5,
                  }}
                >
                  · {finalsWinner.fullName}
                </Text>
              )}
              {isLive && (
                <Text style={{ fontSize: 11, color: "#22C55E", marginLeft: 6 }}>
                  · R{status?.currentRound || "?"}
                </Text>
              )}
            </View>
          </Animated.View>
          <View
            style={[
              sStyles.tabBar,
              {
                backgroundColor: theme.surface,
                borderBottomColor: theme.border,
              },
            ]}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={sStyles.tabBarContent}
            >
              {TAB_LIST.map((tab) => {
                const isPlayerTab = tab.startsWith("player_");
                const pid = isPlayerTab ? Number(tab.split("_")[1]) : null;
                const p = pid ? playersMap[pid] : null;
                const label = isPlayerTab
                  ? p?.lastName || p?.fullName?.split(" ").pop() || "Player"
                  : tab === "main"
                    ? "Main"
                    : tab.charAt(0).toUpperCase() + tab.slice(1);
                const isActive = activeTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    style={[
                      sStyles.tabBtn,
                      isActive && { borderBottomColor: colors.primary },
                    ]}
                    onPress={() => setActiveTab(tab)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        sStyles.tabLabel,
                        {
                          color: isActive
                            ? colors.primary
                            : theme.textSecondary,
                          fontWeight: isActive ? "700" : "500",
                        },
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>

        {/* Tab Content */}
        <View style={{ paddingBottom: 120 }}>
          {/* ── MAIN TAB ── */}
          {activeTab === "main" && (
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              {/* Live At-Bat view when live (not RIB) */}
              {isLive && !ribActive && currentLiveSeed && (
                <LiveAtBatView
                  isRIB={false}
                  liveSeed={currentLiveSeed}
                  theme={theme}
                  colors={colors}
                  isDarkMode={isDarkMode}
                  playersMap={playersMap}
                />
              )}

              {/* Derby Format Info */}
              <DerbyInfoBubble
                status={status}
                rounds={rounds}
                theme={theme}
                colors={colors}
              />

              {/* Pool Round — split into Top Seeds / Bottom Seeds */}
              {poolRound && (
                <View style={{ marginBottom: 20 }}>
                  <View style={sStyles.roundHeader}>
                    <Text
                      style={[sStyles.roundLabel, { color: colors.primary }]}
                    >
                      ROUND 1 — POOL PLAY
                    </Text>
                    <Text
                      style={[sStyles.roundMeta, { color: theme.textTertiary }]}
                    >
                      {poolRound.numBatters} batters ·{" "}
                      {poolRound.numberOfPitches || 0} pitches
                    </Text>
                  </View>
                  <Text
                    style={[sStyles.groupLabel, { color: theme.textSecondary }]}
                  >
                    TOP SEEDS
                  </Text>
                  {topSeeds.map((seed, i) => (
                    <PoolSeedCard
                      key={i}
                      seed={seed}
                      playersMap={playersMap}
                      isDarkMode={isDarkMode}
                      theme={theme}
                      colors={colors}
                      isPreview={isPreview}
                      onPress={() => {
                        if (seed?.player?.id)
                          setActiveTab(`player_${seed.player.id}`);
                      }}
                    />
                  ))}
                  <View style={{ height: 12 }} />
                  <Text
                    style={[sStyles.groupLabel, { color: theme.textSecondary }]}
                  >
                    BOTTOM SEEDS
                  </Text>
                  {bottomSeeds.map((seed, i) => (
                    <PoolSeedCard
                      key={i}
                      seed={seed}
                      playersMap={playersMap}
                      isDarkMode={isDarkMode}
                      theme={theme}
                      colors={colors}
                      isPreview={isPreview}
                      onPress={() => {
                        if (seed?.player?.id)
                          setActiveTab(`player_${seed.player.id}`);
                      }}
                    />
                  ))}
                </View>
              )}

              {/* Bracket Rounds */}
              {bracketRounds.map((round) => {
                const matchups = round.matchups || [];
                const roundLabel =
                  round.round === rounds.length
                    ? "FINALS"
                    : `ROUND ${round.round}`;
                return (
                  <View key={round.round} style={sStyles.roundBlock}>
                    <View style={sStyles.roundHeader}>
                      <Text
                        style={[sStyles.roundLabel, { color: colors.primary }]}
                      >
                        {roundLabel}
                      </Text>
                      <Text
                        style={[
                          sStyles.roundMeta,
                          { color: theme.textTertiary },
                        ]}
                      >
                        {round.numBatters} batters ·{" "}
                        {round.numberOfPitches || 0} pitches
                      </Text>
                    </View>
                    {matchups.map((mx, mi) => {
                      const top = mx.topSeed;
                      const bot = mx.bottomSeed;
                      if (!top && !bot) return null;
                      return (
                        <BracketMatchupCard
                          key={mi}
                          topSeed={top}
                          bottomSeed={bot}
                          playersMap={playersMap}
                          isDarkMode={isDarkMode}
                          theme={theme}
                          colors={colors}
                          isPreview={isPreview}
                          onPressTop={() => {
                            if (top?.player?.id)
                              setActiveTab(`player_${top.player.id}`);
                          }}
                          onPressBottom={() => {
                            if (bot?.player?.id)
                              setActiveTab(`player_${bot.player.id}`);
                          }}
                        />
                      );
                    })}
                  </View>
                );
              })}
            </View>
          )}

          {/* ── PARTICIPANTS TAB ── */}
          {activeTab === "participants" && (
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <Text style={[sStyles.sectionTitle, { color: theme.text }]}>
                ALL PARTICIPANTS
              </Text>
              {sortedPlayers.map((p) => {
                const teamId = getTeamIdFromPlayer(p);
                const teamColor = getTeamColorForPlayer(p);
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      sStyles.participantRow,
                      {
                        backgroundColor: theme.surfaceSecondary,
                        borderColor: theme.border,
                      },
                    ]}
                    onPress={() => setSelectedPlayer(p)}
                  >
                    <View
                      style={{ width: 48, height: 48, position: "relative" }}
                    >
                      <Image
                        source={{ uri: playerHeadshotUrl(p.id) }}
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                          borderWidth: 2,
                          borderColor: teamColor,
                        }}
                        resizeMode="cover"
                      />
                      {teamId && (
                        <Image
                          source={{
                            uri: WBCService.getTeamLogo(teamId, isDarkMode),
                          }}
                          style={{
                            position: "absolute",
                            right: -2,
                            bottom: -2,
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                          }}
                          resizeMode="contain"
                        />
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "700",
                          color: theme.text,
                        }}
                      >
                        {p.fullName}
                      </Text>
                      <Text
                        style={{ fontSize: 12, color: theme.textSecondary }}
                      >
                        {p.primaryPosition?.name || ""} ·{" "}
                        {p.currentTeam?.name || ""}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={theme.textTertiary}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ── PLAYER TAB ── */}
          {activeTab.startsWith("player_") &&
            (() => {
              const pid = Number(activeTab.split("_")[1]);
              const player = playersMap[pid];
              if (!player) return null;
              const teamId = getTeamIdFromPlayer(player);
              const teamColor = getTeamColorForPlayer(player);
              const teamLogo = teamId
                ? WBCService.getTeamLogo(teamId, isDarkMode)
                : null;

              const seasonStats = (() => {
                for (const group of player?.stats || []) {
                  if (group?.type?.displayName === "season") {
                    const s = group?.splits || [];
                    if (s.length > 0) return s[0]?.stat || {};
                  }
                }
                return {};
              })();
              const metricStats = (() => {
                for (const group of player?.stats || []) {
                  if (group?.type?.displayName === "metricAverages") {
                    const result = {};
                    (group?.splits || []).forEach((s) => {
                      const m = s?.stat?.metric;
                      if (m?.name && m?.averageValue != null)
                        result[m.name] = {
                          value: m.averageValue,
                          unit: m.unit,
                        };
                    });
                    return result;
                  }
                }
                return {};
              })();

              const playerResults = [];
              rounds.forEach((r) => {
                (r.matchups || []).forEach((mx) => {
                  ["topSeed", "bottomSeed"].forEach((side) => {
                    const seed = mx[side];
                    if (seed?.player?.id === pid)
                      playerResults.push({
                        round: r.round,
                        type: r.type,
                        seed,
                      });
                  });
                });
              });

              return (
                <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 16,
                      marginBottom: 16,
                    }}
                  >
                    <View
                      style={{ width: 72, height: 72, position: "relative" }}
                    >
                      <Image
                        source={{ uri: playerHeadshotUrl(pid) }}
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 36,
                          borderWidth: 3,
                          borderColor: teamColor,
                        }}
                        resizeMode="cover"
                      />
                      {teamLogo && (
                        <Image
                          source={{ uri: teamLogo }}
                          style={{
                            position: "absolute",
                            right: -4,
                            bottom: -4,
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                          }}
                          resizeMode="contain"
                        />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 20,
                          fontWeight: "900",
                          color: theme.text,
                        }}
                      >
                        {player.fullName}
                      </Text>
                      <Text
                        style={{ fontSize: 13, color: theme.textSecondary }}
                      >
                        {player.primaryPosition?.name || ""} ·{" "}
                        {player.currentTeam?.name || ""}
                      </Text>
                      <Text style={{ fontSize: 12, color: theme.textTertiary }}>
                        {player.height || ""} · {player.weight || ""} lbs · Age{" "}
                        {player.currentAge || ""}
                      </Text>
                    </View>
                  </View>

                  {playerResults.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <Text
                        style={[
                          sStyles.sectionTitle,
                          { color: colors.primary },
                        ]}
                      >
                        DERBY RESULTS
                      </Text>
                      {playerResults.map((pr, i) => {
                        const isExpanded = expandedResultKey === i;
                        const seedHits = pr.seed?.hits || [];
                        const totalHRs = pr.seed?.numHomeRuns ?? 0;
                        const maxLaunchSpeed = seedHits.reduce(
                          (max, h) =>
                            Math.max(
                              max,
                              h?.hitData?.launchSpeed || h?.launchSpeed || 0,
                            ),
                          0,
                        );
                        const maxDistance = seedHits.reduce(
                          (max, h) =>
                            Math.max(
                              max,
                              h?.hitData?.totalDistance ||
                                h?.totalDistance ||
                                0,
                            ),
                          0,
                        );
                        return (
                          <View key={i} style={{ marginBottom: 4 }}>
                            <TouchableOpacity
                              onPress={() =>
                                setExpandedResultKey(isExpanded ? null : i)
                              }
                              activeOpacity={0.7}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                                paddingVertical: 10,
                                paddingHorizontal: 14,
                                borderRadius: 8,
                                backgroundColor: isExpanded
                                  ? colors.primary + "12"
                                  : theme.surfaceSecondary,
                              }}
                            >
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <Ionicons
                                  name={
                                    isExpanded
                                      ? "chevron-down"
                                      : "chevron-forward"
                                  }
                                  size={14}
                                  color={theme.textTertiary}
                                />
                                <Text
                                  style={{
                                    fontSize: 13,
                                    color: isExpanded
                                      ? colors.primary
                                      : theme.textSecondary,
                                    fontWeight: isExpanded ? "700" : "500",
                                  }}
                                >
                                  Round {pr.round} ({pr.type})
                                  {pr.seed?.isWinner ? " ✓" : ""}
                                </Text>
                              </View>
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 10,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 15,
                                    fontWeight: "800",
                                    color: colors.primary,
                                  }}
                                >
                                  {totalHRs} HR
                                </Text>
                                <TouchableOpacity
                                  onPress={() => {
                                    setShareDerbyPlayer(player);
                                    setShareDerbyResult(pr);
                                  }}
                                  hitSlop={{
                                    top: 8,
                                    bottom: 8,
                                    left: 8,
                                    right: 8,
                                  }}
                                >
                                  <Ionicons
                                    name="share-outline"
                                    size={18}
                                    color={theme.textSecondary}
                                  />
                                </TouchableOpacity>
                              </View>
                            </TouchableOpacity>

                            {isExpanded && seedHits.length > 0 && (
                              <View
                                style={{
                                  backgroundColor: theme.surface,
                                  borderRadius: 10,
                                  borderWidth: 1,
                                  borderColor: theme.border,
                                  marginTop: 4,
                                  paddingTop: 12,
                                  paddingBottom: 8,
                                }}
                              >
                                {/* Diamond + summary */}
                                <View
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    paddingHorizontal: 12,
                                    marginBottom: 8,
                                  }}
                                >
                                  <View style={{ flex: 1 }}>
                                    <DerbyDiamondView
                                      hits={seedHits.map((h) => ({
                                        isHomeRun: h.isHomeRun,
                                      }))}
                                      currentHitIdx={seedHits.length - 1}
                                      teamColor={teamColor}
                                      theme={theme}
                                      colors={colors}
                                    />
                                  </View>
                                  <View
                                    style={{
                                      alignItems: "center",
                                      gap: 6,
                                      paddingLeft: 8,
                                    }}
                                  >
                                    <View style={{ alignItems: "center" }}>
                                      <Text
                                        style={{
                                          fontSize: 20,
                                          fontWeight: "900",
                                          color: colors.primary,
                                        }}
                                      >
                                        {totalHRs}
                                      </Text>
                                      <Text
                                        style={{
                                          fontSize: 9,
                                          fontWeight: "700",
                                          color: theme.textTertiary,
                                          textTransform: "uppercase",
                                        }}
                                      >
                                        Home Runs
                                      </Text>
                                    </View>
                                    {maxLaunchSpeed > 0 && (
                                      <View style={{ alignItems: "center" }}>
                                        <Text
                                          style={{
                                            fontSize: 16,
                                            fontWeight: "800",
                                            color: theme.text,
                                          }}
                                        >
                                          {maxLaunchSpeed}
                                        </Text>
                                        <Text
                                          style={{
                                            fontSize: 8,
                                            fontWeight: "600",
                                            color: theme.textTertiary,
                                          }}
                                        >
                                          MPH MAX
                                        </Text>
                                      </View>
                                    )}
                                    {maxDistance > 0 && (
                                      <View style={{ alignItems: "center" }}>
                                        <Text
                                          style={{
                                            fontSize: 16,
                                            fontWeight: "800",
                                            color: theme.text,
                                          }}
                                        >
                                          {maxDistance}
                                        </Text>
                                        <Text
                                          style={{
                                            fontSize: 8,
                                            fontWeight: "600",
                                            color: theme.textTertiary,
                                          }}
                                        >
                                          FT MAX
                                        </Text>
                                      </View>
                                    )}
                                  </View>
                                </View>

                                {/* Hit timeline */}
                                <HitTimeline
                                  hits={seedHits}
                                  currentIdx={seedHits.length - 1}
                                  theme={theme}
                                  colors={colors}
                                />

                                {/* Pitch-by-pitch list */}
                                <View
                                  style={{
                                    paddingHorizontal: 12,
                                    paddingTop: 10,
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 10,
                                      fontWeight: "800",
                                      color: theme.textTertiary,
                                      letterSpacing: 0.5,
                                      marginBottom: 6,
                                    }}
                                  >
                                    PITCH LOG
                                  </Text>
                                  {seedHits.map((h, hi) => {
                                    const isHR = h.isHomeRun;
                                    const isBonus = h.isBonusTime || false;
                                    const time = h.timeRemaining || "";
                                    const speed =
                                      h?.hitData?.launchSpeed ||
                                      h?.launchSpeed ||
                                      null;
                                    const dist =
                                      h?.hitData?.totalDistance ||
                                      h?.totalDistance ||
                                      null;
                                    return (
                                      <View
                                        key={hi}
                                        style={{
                                          flexDirection: "row",
                                          alignItems: "center",
                                          paddingVertical: 5,
                                          borderBottomWidth:
                                            hi < seedHits.length - 1
                                              ? StyleSheet.hairlineWidth
                                              : 0,
                                          borderBottomColor: theme.border,
                                        }}
                                      >
                                        <Text
                                          style={{
                                            width: 24,
                                            fontSize: 11,
                                            fontWeight: "700",
                                            color: theme.textTertiary,
                                            textAlign: "center",
                                          }}
                                        >
                                          {hi + 1}
                                        </Text>
                                        <View
                                          style={{
                                            width: 20,
                                            height: 20,
                                            borderRadius: 10,
                                            alignItems: "center",
                                            justifyContent: "center",
                                            backgroundColor: isHR
                                              ? "rgba(34,197,94,0.15)"
                                              : "rgba(239,68,68,0.1)",
                                            borderWidth: 1,
                                            borderColor: isHR
                                              ? "#22C55E"
                                              : "#EF4444",
                                          }}
                                        >
                                          <Text style={{ fontSize: 10 }}>
                                            {isHR ? "💣" : "❌"}
                                          </Text>
                                        </View>
                                        <Text
                                          style={{
                                            flex: 1,
                                            marginLeft: 8,
                                            fontSize: 12,
                                            fontWeight: "600",
                                            color: isHR
                                              ? "#22C55E"
                                              : theme.textSecondary,
                                          }}
                                        >
                                          {isHR ? "Home Run" : "Out"}
                                          {isBonus ? " (Bonus)" : ""}
                                        </Text>
                                        {speed > 0 && (
                                          <Text
                                            style={{
                                              fontSize: 11,
                                              color: theme.textTertiary,
                                              marginRight: 8,
                                            }}
                                          >
                                            {speed} mph
                                          </Text>
                                        )}
                                        {dist > 0 && (
                                          <Text
                                            style={{
                                              fontSize: 11,
                                              color: theme.textTertiary,
                                              marginRight: 8,
                                            }}
                                          >
                                            {dist} ft
                                          </Text>
                                        )}
                                        {time && time !== "--" && (
                                          <Text
                                            style={{
                                              fontSize: 11,
                                              color: theme.textTertiary,
                                            }}
                                          >
                                            {time}
                                          </Text>
                                        )}
                                      </View>
                                    );
                                  })}
                                </View>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {Object.keys(metricStats).length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <Text
                        style={[
                          sStyles.sectionTitle,
                          { color: colors.primary },
                        ]}
                      >
                        STATCAST
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        {Object.entries(metricStats).map(([key, m]) => (
                          <View
                            key={key}
                            style={{
                              flex: 1,
                              minWidth: (SCREEN_W - 48) / 2 - 4,
                              borderRadius: 10,
                              borderWidth: 1,
                              borderColor: theme.border,
                              padding: 12,
                              alignItems: "center",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 22,
                                fontWeight: "900",
                                color: theme.text,
                              }}
                            >
                              {m.value}
                            </Text>
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: "600",
                                color: theme.textTertiary,
                                textTransform: "uppercase",
                              }}
                            >
                              {m.unit || key}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {Object.keys(seasonStats).length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <Text
                        style={[
                          sStyles.sectionTitle,
                          { color: colors.primary },
                        ]}
                      >
                        SEASON STATS
                      </Text>
                      <View
                        style={{
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: theme.border,
                          overflow: "hidden",
                        }}
                      >
                        {[
                          { key: "gamesPlayed", label: "Games" },
                          { key: "avg", label: "AVG" },
                          { key: "obp", label: "OBP" },
                          { key: "slg", label: "SLG" },
                          { key: "ops", label: "OPS" },
                          { key: "homeRuns", label: "HR" },
                          { key: "rbi", label: "RBI" },
                          { key: "hits", label: "H" },
                          { key: "runs", label: "R" },
                          { key: "strikeOuts", label: "SO" },
                          { key: "baseOnBalls", label: "BB" },
                          { key: "stolenBases", label: "SB" },
                          { key: "atBats", label: "AB" },
                        ]
                          .map((row, i) => {
                            const val = seasonStats[row.key];
                            if (val == null) return null;
                            return (
                              <View
                                key={row.key}
                                style={{
                                  flexDirection: "row",
                                  justifyContent: "space-between",
                                  paddingVertical: 8,
                                  paddingHorizontal: 14,
                                  backgroundColor:
                                    i % 2 === 0
                                      ? theme.surfaceSecondary
                                      : theme.surface,
                                  borderBottomWidth: StyleSheet.hairlineWidth,
                                  borderBottomColor: theme.border,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 13,
                                    color: theme.textSecondary,
                                  }}
                                >
                                  {row.label}
                                </Text>
                                <Text
                                  style={{
                                    fontSize: 14,
                                    fontWeight: "700",
                                    color: theme.text,
                                  }}
                                >
                                  {val}
                                </Text>
                              </View>
                            );
                          })
                          .filter(Boolean)}
                      </View>
                    </View>
                  )}
                </View>
              );
            })()}
        </View>
      </Animated.ScrollView>

      {/* FAB */}
      {!ribActive && ribAllHits.length > 0 && (
        <TouchableOpacity
          style={[
            sStyles.ribFab,
            { backgroundColor: colors.primary, borderColor: theme.border },
          ]}
          onPress={openRIB}
          activeOpacity={0.85}
        >
          <AnimBaseball
            source={BASEBALL_SPRITE}
            style={{ width: 22, height: 22, tintColor: "#fff" }}
          />
          <Text style={sStyles.ribFabText}>Run It Back</Text>
        </TouchableOpacity>
      )}

      {/* RIB Active: Inline At-Bat view */}
      {ribActive && ribCurrentHit && (
        <LiveAtBatView
          isRIB
          ribHitData={ribCurrentHit}
          ribCursor={ribCursor}
          ribTotal={ribTotalHits}
          ribPaused={ribPaused}
          theme={theme}
          colors={colors}
          isDarkMode={isDarkMode}
          playersMap={playersMap}
          onTogglePause={() => setRibPaused((v) => !v)}
          onPrev={() => setRibCursor((c) => Math.max(0, c - 1))}
          onNext={() => setRibCursor((c) => Math.min(ribTotalHits - 1, c + 1))}
        />
      )}

      {/* RIB Dock + Popups */}
      {ribActive && (
        <>
          {(ribSpeedPopup || ribRoundPopup || ribBatterPopup) && (
            <TouchableWithoutFeedback
              onPress={() => {
                setRibSpeedPopup(false);
                setRibRoundPopup(false);
                setRibBatterPopup(false);
              }}
            >
              <View style={sStyles.popupScrim} />
            </TouchableWithoutFeedback>
          )}
          {(ribSpeedPopup || ribRoundPopup || ribBatterPopup) && (
            <View
              style={[
                sStyles.popupCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              {ribSpeedPopup && (
                <>
                  <Text style={[sStyles.popupTitle, { color: theme.text }]}>
                    SPEED
                  </Text>
                  <TouchableOpacity
                    style={[sStyles.popupRow, { borderColor: theme.border }]}
                    onPress={() => {
                      setRibPaused((v) => !v);
                      setRibSpeedPopup(false);
                    }}
                  >
                    <Ionicons
                      name={ribPaused ? "play-outline" : "pause-outline"}
                      size={16}
                      color={theme.text}
                    />
                    <Text
                      style={[sStyles.popupRowLabel, { color: theme.text }]}
                    >
                      {ribPaused ? "Resume" : "Pause"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[sStyles.popupRow, { borderColor: theme.border }]}
                    onPress={() => {
                      setRibCursor(0);
                      setRibSpeedPopup(false);
                    }}
                  >
                    <Ionicons
                      name="refresh-outline"
                      size={16}
                      color={theme.text}
                    />
                    <Text
                      style={[sStyles.popupRowLabel, { color: theme.text }]}
                    >
                      Restart
                    </Text>
                  </TouchableOpacity>
                  {RIB_SPEED_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        sStyles.popupRow,
                        {
                          borderColor: theme.border,
                          backgroundColor:
                            ribSpeed === opt.value
                              ? colors.primary + "22"
                              : "transparent",
                        },
                      ]}
                      onPress={() => {
                        setRibSpeed(opt.value);
                        setRibSpeedPopup(false);
                      }}
                    >
                      <Text
                        style={[sStyles.popupRowLabel, { color: theme.text }]}
                      >
                        {opt.label}
                      </Text>
                      {ribSpeed === opt.value && (
                        <Ionicons
                          name="checkmark"
                          size={18}
                          color={colors.primary}
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {ribRoundPopup && (
                <>
                  <Text style={[sStyles.popupTitle, { color: theme.text }]}>
                    ROUNDS
                  </Text>
                  <TouchableOpacity
                    style={[
                      sStyles.popupRow,
                      {
                        borderColor: theme.border,
                        backgroundColor: !ribSelectedRounds?.size
                          ? colors.primary + "22"
                          : "transparent",
                      },
                    ]}
                    onPress={() => {
                      setRibSelectedRounds(null);
                      setRibCursor(0);
                      setRibRoundPopup(false);
                    }}
                  >
                    <Text
                      style={[sStyles.popupRowLabel, { color: theme.text }]}
                    >
                      All Rounds
                    </Text>
                    {!ribSelectedRounds?.size && (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={colors.primary}
                      />
                    )}
                  </TouchableOpacity>
                  {rounds.map((r) => (
                    <TouchableOpacity
                      key={r.round}
                      style={[
                        sStyles.popupRow,
                        {
                          borderColor: theme.border,
                          backgroundColor: ribSelectedRounds?.has(r.round)
                            ? colors.primary + "22"
                            : "transparent",
                        },
                      ]}
                      onPress={() => {
                        setRibSelectedRounds(new Set([r.round]));
                        setRibCursor(0);
                        setRibRoundPopup(false);
                      }}
                    >
                      <Text
                        style={[sStyles.popupRowLabel, { color: theme.text }]}
                      >
                        Round {r.round}
                        {r.type === "Bracket" && r.round === rounds.length
                          ? " (Finals)"
                          : ""}
                      </Text>
                      {ribSelectedRounds?.has(r.round) && (
                        <Ionicons
                          name="checkmark"
                          size={18}
                          color={colors.primary}
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {ribBatterPopup && (
                <>
                  <Text style={[sStyles.popupTitle, { color: theme.text }]}>
                    BATTERS
                  </Text>
                  <TouchableOpacity
                    style={[
                      sStyles.popupRow,
                      {
                        borderColor: theme.border,
                        backgroundColor: !ribSelectedBatters?.size
                          ? colors.primary + "22"
                          : "transparent",
                      },
                    ]}
                    onPress={() => {
                      setRibSelectedBatters(null);
                      setRibCursor(0);
                      setRibBatterPopup(false);
                    }}
                  >
                    <Text
                      style={[sStyles.popupRowLabel, { color: theme.text }]}
                    >
                      All Batters
                    </Text>
                    {!ribSelectedBatters?.size && (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={colors.primary}
                      />
                    )}
                  </TouchableOpacity>
                  <ScrollView
                    style={{ maxHeight: SCREEN_H * 0.35 }}
                    showsVerticalScrollIndicator={false}
                  >
                    {ribBatterOptions.map((p) => {
                      const sel = ribSelectedBatters?.has(p.id);
                      const tc = getTeamColorForPlayer(p);
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[
                            sStyles.popupRow,
                            {
                              borderColor: theme.border,
                              backgroundColor: sel
                                ? colors.primary + "22"
                                : "transparent",
                            },
                          ]}
                          onPress={() => {
                            setRibSelectedBatters(new Set([p.id]));
                            setRibCursor(0);
                            setRibBatterPopup(false);
                          }}
                        >
                          <Image
                            source={{ uri: playerHeadshotUrl(p.id) }}
                            style={[
                              sStyles.popupPlayerImg,
                              { borderColor: tc },
                            ]}
                            resizeMode="cover"
                          />
                          <Text
                            style={[
                              sStyles.popupRowLabel,
                              { color: theme.text, flex: 1 },
                            ]}
                          >
                            {p.fullName}
                          </Text>
                          {sel && (
                            <Ionicons
                              name="checkmark"
                              size={18}
                              color={colors.primary}
                            />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )}
            </View>
          )}

          {/* RIB Dock */}
          <View style={sStyles.ribDock}>
            <TouchableOpacity
              style={[
                sStyles.ribDockBtn,
                { backgroundColor: theme.surface, borderColor: colors.primary },
              ]}
              onPress={() => setRibSpeedPopup(true)}
            >
              <Ionicons
                name={ribPaused ? "pause-outline" : "play-skip-forward-outline"}
                size={18}
                color={theme.text}
              />
              <View
                style={[
                  sStyles.ribSpeedBadge,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Text style={sStyles.ribSpeedBadgeText}>{ribSpeed}x</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                sStyles.ribDockBtn,
                { backgroundColor: theme.surface, borderColor: colors.primary },
              ]}
              onPress={() => setRibRoundPopup(true)}
            >
              <Ionicons name="baseball-outline" size={18} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                sStyles.ribDockBtn,
                { backgroundColor: theme.surface, borderColor: colors.primary },
              ]}
              onPress={() => setRibBatterPopup(true)}
            >
              <Ionicons name="people-outline" size={18} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                sStyles.ribDockBtn,
                {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                },
              ]}
              onPress={closeRIB}
            >
              <Ionicons name="checkmark-outline" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Player Profile Modal */}
      <PlayerProfileModal
        visible={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        player={selectedPlayer}
        theme={theme}
        colors={colors}
        isDarkMode={isDarkMode}
      />

      {/* Derby Share Card */}
      <DerbyShareCard
        visible={!!shareDerbyPlayer}
        onClose={() => {
          setShareDerbyPlayer(null);
          setShareDerbyResult(null);
        }}
        player={shareDerbyPlayer}
        result={shareDerbyResult}
        rounds={rounds}
        playersMap={playersMap}
        theme={theme}
        colors={colors}
        isDarkMode={isDarkMode}
      />
    </View>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────
const sStyles = StyleSheet.create({
  screen: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { fontSize: 14, marginTop: 8 },
  errorText: { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
  retryBtn: {
    marginTop: 12,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryText: { fontSize: 14, fontWeight: "700" },

  stickyMini: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    overflow: "hidden",
    borderBottomWidth: 1,
  },
  miniCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  miniLogo: { width: 28, height: 18 },
  miniTitle: { fontSize: 15, fontWeight: "800" },

  header: {
    paddingTop: 16,
    paddingBottom: 24,
    paddingHorizontal: 20,
    overflow: "hidden",
    position: "relative",
  },
  headerCenter: { alignItems: "center", paddingTop: 8 },
  headerLogo: { width: 56, height: 36, marginBottom: 10 },
  headerEventName: {
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 4,
  },
  headerSubName: {
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  venueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  venueText: { fontSize: 13 },
  dateText: { fontSize: 12 },
  statusBadgeWrap: { alignItems: "center", marginTop: 14 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },

  tabBar: { borderBottomWidth: 1 },
  tabBarContent: { flexDirection: "row" },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 13 },

  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  roundBlock: { marginBottom: 20 },
  roundHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  roundLabel: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  roundMeta: { fontSize: 11 },
  groupLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 4,
  },

  poolCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 10,
    marginBottom: 6,
  },
  seedBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  seedText: { fontSize: 13, fontWeight: "800" },
  poolHeadshotWrap: { width: 48, height: 48, position: "relative" },
  poolHeadshot: { width: 48, height: 48, borderRadius: 24, borderWidth: 2 },
  poolTeamLogo: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  poolInfo: { flex: 1 },
  poolName: { fontSize: 14, fontWeight: "700" },
  poolTeam: { fontSize: 11, marginTop: 1 },
  poolHrBlock: { alignItems: "center", minWidth: 40 },
  poolHrCount: { fontSize: 24, fontWeight: "900", lineHeight: 28 },
  poolHrLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  winnerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  winnerText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },

  bracketCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 10,
  },
  bracketSide: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
  },
  bracketSeedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(128,128,128,0.1)",
  },
  bracketSeedText: { fontSize: 12, fontWeight: "800" },
  bracketHeadshot: { width: 44, height: 44, borderRadius: 22 },
  bracketTeamLogo: {
    position: "absolute",
    left: 66,
    top: 32,
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  bracketInfo: { flex: 1 },
  bracketName: { fontSize: 14 },
  bracketTeam: { fontSize: 11, marginTop: 1 },
  bracketHrBlock: { alignItems: "center", minWidth: 36 },
  bracketHrCount: { fontSize: 22, lineHeight: 26 },
  bracketHrLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  bracketWinnerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  bracketDivider: { height: StyleSheet.hairlineWidth },

  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },

  // Derby Info Bubble
  infoBubble: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoHeaderTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  infoCell: {
    width: "33.333%",
    alignItems: "center",
    paddingVertical: 8,
    gap: 2,
  },
  infoValue: { fontSize: 15, fontWeight: "800" },
  infoLabel: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  // Live At-Bat Card
  liveCard: {
    borderRadius: 14,
    borderWidth: 2,
    overflow: "hidden",
    marginBottom: 16,
  },
  liveHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  miniCtrl: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  miniPlayBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  // Share Card
  shareOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    padding: 24,
  },
  shareCard: { overflow: "hidden" },
  shareHeader: { padding: 14, borderBottomWidth: 2 },
  shareFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignItems: "flex-end",
  },
  shareBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    minWidth: 100,
    alignItems: "center",
  },

  // FAB
  ribFab: {
    position: "absolute",
    right: 20,
    bottom: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 28,
    borderWidth: 1.5,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    zIndex: 90,
  },
  ribFabText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  // RIB Dock
  ribDock: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 26,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    zIndex: 110,
  },
  ribDockBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  ribSpeedBadge: {
    position: "absolute",
    top: -5,
    right: -6,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 28,
    alignItems: "center",
  },
  ribSpeedBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  // Popup
  popupScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.28)",
    zIndex: 100,
  },
  popupCard: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 86,
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
    zIndex: 105,
    maxHeight: "55%",
  },
  popupTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  popupRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 2,
    gap: 10,
  },
  popupRowLabel: { fontSize: 14, fontWeight: "600" },
  popupPlayerImg: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5 },

  // Player Modal sheet
  ribOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  ribSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "85%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 3,
    paddingBottom: 30,
    overflow: "hidden",
  },
  ribDragStrip: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
  },
  ribHandle: { width: 40, height: 4, borderRadius: 2, marginBottom: 8 },
  ribHandleRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: "100%",
  },
  ribCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  ribCloseText: { color: "#fff", fontSize: 13, fontWeight: "800" },
});

export default HomeRunDerbyScreen;

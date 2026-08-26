import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  ActivityIndicator,
  ScrollView,
  Image,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Alert,
  Share,
  Platform,
  Dimensions,
  TouchableWithoutFeedback,
  PanResponder,
} from "react-native";
import { FontAwesome6, Ionicons } from "@expo/vector-icons";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Path,
  G,
} from "react-native-svg";
import { WebView } from "react-native-webview";
import ViewShot from "react-native-view-shot";
import { useTheme } from "../../context/ThemeContext";
import { useFavorites } from "../../context/FavoritesContext";
import { useNavigation } from "@react-navigation/native";
import { WNBAService } from "../../services/WNBAService";
import ChatComponent from "../../components/ChatComponent";
import useIsLoggedIn from "../../hooks/useIsLoggedIn";
import { useStreamingAccess } from "../../utils/streamingUtils";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as MediaLibrary from "expo-media-library";
import { useGamePresence } from "../../hooks/useGamePresence";
import LiveTrackerEmbed from "../../components/LiveTrackerEmbed";
import LiveTrackerService from "../../services/liveTrackerService";

const { width } = Dimensions.get("window");

// Add this HeaderGradient component near the top of the file, after the imports
const HeaderGradient = ({ awayColor, homeColor, theme, height }) => (
  <View style={[StyleSheet.absoluteFill, { height }]} pointerEvents="none">
    <Svg
      width={width}
      height={height}
      style={{
        transform: [{ translateX: -1 }, { translateY: -1 }],
      }}
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="wnbaHeaderGrad" x1="00%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={awayColor} stopOpacity="0.3" />
          <Stop
            offset="40%"
            stopColor={theme.surfaceSecondary}
            stopOpacity="0"
          />
          <Stop
            offset="60%"
            stopColor={theme.surfaceSecondary}
            stopOpacity="0"
          />
          <Stop offset="100%" stopColor={homeColor} stopOpacity="0.3" />
        </LinearGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#wnbaHeaderGrad)" />
    </Svg>
  </View>
);

// Update the SimpleTeamDisplay component to include timeouts/bonus
const SimpleTeamDisplay = ({
  team,
  logo,
  score,
  side,
  isPre,
  isFinished,
  isWinner,
  isLoser,
  record,
  theme,
  teamColor,
  onPress,
  possession,
  timeoutsRemaining, // Add this prop
  bonusState, // Add this prop
  colors, // Add this prop
}) => {
  const [logoError, setLogoError] = useState(false);
  React.useEffect(() => {
    setLogoError(false);
  }, [logo]);

  const teamAbbr = team?.abbreviation || "";
  const logoOpacity = isFinished ? (isWinner ? 1 : 0.55) : 1;

  const renderLogo = () => {
    if (!logo || logoError) {
      return (
        <View
          style={[
            styles.simpleTeamLogo,
            {
              borderRadius: 32.5,
              backgroundColor: teamColor || colors.primary,
              alignItems: "center",
              justifyContent: "center",
              opacity: logoOpacity,
            },
          ]}
        >
          <Text
            style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}
            numberOfLines={1}
          >
            {teamAbbr}
          </Text>
        </View>
      );
    }
    return (
      <Image
        source={{ uri: logo }}
        style={[styles.simpleTeamLogo, { opacity: logoOpacity }]}
        contentFit="contain"
        onError={() => setLogoError(true)}
      />
    );
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.65}
      style={styles.simpleTeamContainer}
    >
      <View style={styles.simpleTeamTopRow}>
        {side === "away" && renderLogo()}
        {!isPre && (
          <Text
            style={[
              styles.simpleTeamScore,
              {
                color: isWinner
                  ? theme.text
                  : isLoser
                    ? theme.textSecondary
                    : theme.text,
              },
              side === "away" ? styles.scoreRight : styles.scoreLeft,
            ]}
          >
            {score}
          </Text>
        )}
        {side === "home" && renderLogo()}
      </View>
      <View style={styles.simpleTeamInfo}>
        {possession && side === "home" ? (
          <Ionicons
            name="basketball"
            size={12}
            color={theme.textSecondary}
            style={{ marginTop: -14 }}
          />
        ) : null}
        <Text
          style={[
            styles.simpleTeamName,
            {
              color: theme.text,
              opacity: isFinished ? (isWinner ? 1 : 0.55) : 1,
            },
          ]}
          numberOfLines={2}
        >
          {team?.displayName || team?.name || ""}
        </Text>
        {possession && side === "away" ? (
          <Ionicons
            name="basketball"
            size={12}
            color={theme.textSecondary}
            style={{ marginTop: -14 }}
          />
        ) : null}
      </View>

      {record ? (
        <Text
          style={[
            styles.simpleTeamRecord,
            {
              color: theme.textSecondary,
              opacity: isFinished ? (isWinner ? 1 : 0.55) : 1,
            },
          ]}
        >
          {record.displayValue || ""}
        </Text>
      ) : null}

      {/* Add timeouts and bonus indicators here */}
      {!isFinished &&
        !isPre &&
        (timeoutsRemaining > 0 ||
          (bonusState && bonusState.toUpperCase() !== "NONE")) && (
          <View style={{ alignItems: "center", marginTop: -16 }}>
            {/* Timeouts indicators */}
            {timeoutsRemaining > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "center",
                }}
              >
                {Array.from({ length: timeoutsRemaining }).map((_, i) => (
                  <View
                    key={`to-${side}-${i}`}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      marginHorizontal: 1.5,
                      backgroundColor: teamColor || colors.primary,
                      borderWidth: 1,
                      borderColor: teamColor || colors.primary,
                    }}
                  />
                ))}
              </View>
            )}

            {/* Bonus indicator */}
            {bonusState && bonusState.toUpperCase() !== "NONE" && (
              <Text
                style={{
                  color: theme.error,
                  marginTop: 2,
                  fontSize: 11,
                  fontWeight: "800",
                }}
              >
                BONUS
              </Text>
            )}
          </View>
        )}
    </TouchableOpacity>
  );
};

function getTextOnColor(hex) {
  if (!hex) return "#FFFFFF";
  const c = hex.replace("#", "");
  if (c.length < 6) return "#FFFFFF";
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#000000" : "#FFFFFF";
}

function parseHexColor(hex) {
  if (!hex || typeof hex !== "string") return null;
  const raw = hex.trim().replace("#", "");
  if (raw.length !== 3 && raw.length !== 6) return null;
  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

function areColorsSimilar(colorA, colorB) {
  const a = parseHexColor(colorA);
  const b = parseHexColor(colorB);
  if (!a || !b) return false;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  const distance = Math.sqrt(dr * dr + dg * dg + db * db);
  return distance <= 60;
}

function resolveMatchColors({
  homePrimary,
  homeSecondary,
  awayPrimary,
  awaySecondary,
  homeFallback,
  awayFallback,
}) {
  const homeColor = homePrimary ?? homeSecondary ?? homeFallback;
  const awayColor = awayPrimary ?? awaySecondary ?? awayFallback;

  if (!areColorsSimilar(homePrimary, awayPrimary)) {
    return { homeColor, awayColor };
  }

  const awaySecondarySimilar = areColorsSimilar(homePrimary, awaySecondary);
  if (awaySecondarySimilar) {
    return {
      homeColor: homeSecondary ?? homeColor,
      awayColor: awayPrimary ?? awayColor,
    };
  }

  return {
    homeColor,
    awayColor: awaySecondary ?? awayColor,
  };
}

// Smart color selection utility - returns appropriate colors for teams
const getSmartTeamColors = (homeTeam, awayTeam, colors) => {
  return resolveMatchColors({
    homePrimary: homeTeam?.team?.color ? `#${homeTeam.team.color}` : null,
    homeSecondary: homeTeam?.team?.alternateColor
      ? homeTeam.team.alternateColor.startsWith("#")
        ? homeTeam.team.alternateColor
        : `#${homeTeam.team.alternateColor}`
      : null,
    awayPrimary: awayTeam?.team?.color ? `#${awayTeam.team.color}` : null,
    awaySecondary: awayTeam?.team?.alternateColor
      ? awayTeam.team.alternateColor.startsWith("#")
        ? awayTeam.team.alternateColor
        : `#${awayTeam.team.alternateColor}`
      : null,
    homeFallback: colors.primary,
    awayFallback: colors.secondary || "#666",
  });
};

// Stable TeamLogo component outside main component to prevent recreation and state loss
const TeamLogo = React.memo(
  ({
    teamAbbreviation,
    logoUri,
    size = 32,
    style,
    iconStyle,
    colors,
    getTeamLogoUrl,
  }) => {
    const [imageError, setImageError] = useState(false);
    const resolvedUri =
      logoUri ||
      (getTeamLogoUrl ? getTeamLogoUrl("wnba", teamAbbreviation) : null);

    // Reset error state when URI changes
    React.useEffect(() => {
      setImageError(false);
    }, [resolvedUri]);

    // If no URI or image failed to load, show team abbreviation circle
    if (!resolvedUri || imageError) {
      const abbrev = teamAbbreviation || "?";
      return (
        <View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            },
            style,
          ]}
        >
          <Text
            style={{
              color: "#fff",
              fontSize: size * 0.3,
              fontWeight: "800",
            }}
            numberOfLines={1}
          >
            {abbrev}
          </Text>
        </View>
      );
    }

    // Try to load the image directly, fallback to icon on error
    return (
      <Image
        source={{ uri: resolvedUri }}
        style={style}
        onError={() => setImageError(true)}
      />
    );
  },
  (prev, next) => {
    // Only re-render when the effective image URI or size changes (or abbreviation when logoUri not provided)
    const prevUri =
      prev.logoUri ||
      (prev.getTeamLogoUrl
        ? prev.getTeamLogoUrl("wnba", prev.teamAbbreviation)
        : null);
    const nextUri =
      next.logoUri ||
      (next.getTeamLogoUrl
        ? next.getTeamLogoUrl("wnba", next.teamAbbreviation)
        : null);
    return prevUri === nextUri && prev.size === next.size;
  },
);

// Stable wrapper component that will receive theme context as props
const TeamLogoWithTheme = ({ colors, getTeamLogoUrl, ...props }) => (
  <TeamLogo {...props} colors={colors} getTeamLogoUrl={getTeamLogoUrl} />
);

// Memoized Basketball Court Component for performance
const BasketballCourt = React.memo(
  ({ coordinate, isScoring, teamSide, teamColor, styles }) => {
    // Base court without coordinate
    const baseCourt = (
      <View style={styles.miniCourtContainer}>
        <View style={styles.courtContainer}>
          {/* Court outline */}
          <View style={styles.courtOutline} />
          {/* Half court line */}
          <View style={styles.courtOutlineCenterLine} />
          {/* Free throw circles */}
          <View style={styles.freeThrowCircleTop} />
          <View style={styles.freeThrowCircleBottom} />
          {/* Free throw lanes (paint areas) */}
          <View style={styles.freeThrowLaneTop} />
          <View style={styles.freeThrowLaneBottom} />
          {/* Free throw lines */}
          <View style={styles.freeThrowLineTop} />
          <View style={styles.freeThrowLineBottom} />
          {/* Free throw semicircles */}
          <View style={styles.freeThrowSemicircleTop} />
          <View style={styles.freeThrowSemicircleBottom} />
          {/* 3 point semicircles */}
          <View style={styles.threePointSemicircleTop} />
          <View style={styles.threePointSemicircleBottom} />
          {/* Center circle */}
          <View style={styles.centerCircle} />
          {/* Baskets */}
          <View style={styles.basketTop} />
          <View style={styles.basketBottom} />
        </View>
      </View>
    );

    if (
      !coordinate ||
      coordinate.x === undefined ||
      coordinate.y === undefined
    ) {
      return baseCourt;
    }

    const espnX = coordinate.x;
    const espnY = coordinate.y;

    let leftPercent, bottomPercent;

    if (teamSide === "home") {
      bottomPercent = (52 - espnY) * 2;
      leftPercent = espnX * 2;
    } else {
      bottomPercent = espnY * 2 - 6;
      leftPercent = (50 - espnX) * 2;
    }

    const finalLeftPercent = Math.max(2, Math.min(98, leftPercent));
    const finalBottomPercent = Math.max(2, Math.min(98, bottomPercent));
    const finalTeamColor = teamColor.startsWith("#")
      ? teamColor
      : `#${teamColor}`;

    let clampedBottom = finalBottomPercent;
    if (teamSide === "home") {
      clampedBottom = Math.max(clampedBottom, 50);
    } else {
      clampedBottom = Math.min(clampedBottom, 50);
    }

    return (
      <View style={styles.miniCourtContainer}>
        <View style={styles.courtContainer}>
          {/* Court outline */}
          <View style={styles.courtOutline} />
          {/* Half court line */}
          <View style={styles.courtOutlineCenterLine} />
          {/* Free throw circles */}
          <View style={styles.freeThrowCircleTop} />
          <View style={styles.freeThrowCircleBottom} />
          {/* Free throw lanes (paint areas) */}
          <View style={styles.freeThrowLaneTop} />
          <View style={styles.freeThrowLaneBottom} />
          {/* Free throw lines */}
          <View style={styles.freeThrowLineTop} />
          <View style={styles.freeThrowLineBottom} />
          {/* Free throw semicircles */}
          <View style={styles.freeThrowSemicircleTop} />
          <View style={styles.freeThrowSemicircleBottom} />
          {/* 3 point semicircles */}
          <View style={styles.threePointSemicircleTop} />
          <View style={styles.threePointSemicircleBottom} />
          {/* Center circle */}
          <View style={styles.centerCircle} />
          {/* Baskets */}
          <View style={styles.basketTop} />
          <View style={styles.basketBottom} />
          {/* Team side indicator */}
          <Text
            style={[
              styles.teamSideIndicator,
              teamSide === "home" ? styles.teamSideHome : styles.teamSideAway,
              { color: finalTeamColor },
            ]}
          >
            {teamSide.toUpperCase()}
          </Text>
          {/* Shot location */}
          <View
            style={[
              styles.shotMarker,
              isScoring ? styles.madeShotMarker : styles.missedShotMarker,
              {
                position: "absolute",
                left: `${finalLeftPercent}%`,
                bottom: `${clampedBottom}%`,
                backgroundColor: isScoring ? finalTeamColor : "white",
                borderColor: isScoring ? "white" : finalTeamColor,
                marginLeft: -5,
                marginBottom: -5,
              },
            ]}
          />
        </View>
      </View>
    );
  },
);

// Helper to compute player stat color (reuse pattern from NHL)
const getWnbaStatColor = (key, value, theme) => {
  const keyNorm = (key || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (keyNorm === "plusminus") {
    const n = parseFloat(String(value).replace(/[^0-9.\-]/g, ""));
    if (isNaN(n) || n === 0) return theme.text;
    return n < 0 ? theme.error : theme.success;
  }
  return theme.text;
};

const WNBARosterPlayerCard = ({
  player,
  theme,
  teamColor,
  showStats = true,
  showDecision = false,
  onPress,
  statKeys,
  statLabels,
  findPlayerStatsMeta,
}) => {
  const fullName =
    player?.athlete?.displayName ||
    player?.athlete?.fullName ||
    "Unknown Player";
  const initials =
    fullName
      .split(" ")
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("") || "?";
  const number = player?.athlete?.jersey ? `#${player.athlete.jersey}` : "";
  const position =
    player?.athlete?.position?.abbreviation ||
    player?.athlete?.position?.name ||
    "";
  const meta = [number, position].filter(Boolean).join(" \u00B7 ");
  const headshot =
    player?.athlete?.headshot?.href ||
    (player?.athlete?.id
      ? `https://a.espncdn.com/combiner/i?img=/i/headshots/wnba/players/full/${player.athlete.id}.png&w=300`
      : null);
  const [headshotError, setHeadshotError] = useState(false);
  const effectiveHeadshot = headshotError ? null : headshot;

  // Resolve stats
  const metaObj = player?.meta || findPlayerStatsMeta?.(player) || {};
  const labels = metaObj.labels || [];
  const keys = metaObj.keys || [];
  const stats = player?.stats || [];

  // Build a lookup of normalized key-name -> index from the keys/names array.
  // ESPN boxscore provides `names` (e.g. "rebounds","points") parallel to `labels` ("REB","PTS").
  // findPlayerStatsMeta stores names-like data in `keys`. We match against these first.
  const resolveIndex = (name) => {
    const total = stats.length;
    if (total === 0) return -1;
    const norm = (s) => (s || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    const target = norm(name);
    if (!target) return -1;

    // 1) Exact match against keys (field names like "rebounds", "points", "plusMinus")
    for (let i = 0; i < keys.length; i++)
      if (norm(keys[i]) === target) return i;

    // 2) Exact match against labels (display names like "REB", "PTS")
    for (let i = 0; i < labels.length; i++)
      if (norm(labels[i]) === target) return i;

    // 3) Exact match against labels that are known abbreviations
    const labelAbbrevMap = {
      fieldgoalsmadefieldgoalsattempted: ["fg"],
      fieldgoalpct: ["fgpct", "fg%"],
      threepointfieldgoalsmadethreepointfieldgoalsattempted: ["3pt", "3ptfg"],
      freethrowsmadefreethrowsattempted: ["ft"],
      points: ["pts"],
      rebounds: ["reb"],
      assists: ["ast"],
      steals: ["stl"],
      blocks: ["blk"],
      turnovers: ["to"],
      plusminus: ["+/-", "plusminus"],
      minutes: ["min"],
    };
    if (labelAbbrevMap[target]) {
      for (const abbrev of labelAbbrevMap[target]) {
        const abbrevNorm = norm(abbrev);
        for (let i = 0; i < labels.length; i++)
          if (norm(labels[i]) === abbrevNorm) return i;
      }
    }

    // 4) Substring match against keys (exact key must CONTAIN the target or vice-versa)
    for (let i = 0; i < keys.length; i++) {
      const kNorm = norm(keys[i]);
      if (kNorm === target || kNorm.includes(target) || target.includes(kNorm))
        return i;
    }

    // 5) Final fallback: substring match against labels
    for (let i = 0; i < labels.length; i++) {
      const lNorm = norm(labels[i]);
      if (lNorm.includes(target) || target.includes(lNorm)) return i;
    }

    return -1;
  };

  const statToString = (s) => {
    if (s == null) return "\u2014";
    if (typeof s === "number") return String(s);
    if (typeof s === "string") return s;
    if (typeof s === "object") return s.displayValue ?? s.value ?? "\u2014";
    return String(s);
  };

  // Format a raw stat value for display, applying sport-specific formatting
  const formatStatValue = (key, raw) => {
    const s = statToString(raw);
    if (s === "\u2014") return s;

    // +/- : always show sign
    const keyNorm = (key || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (keyNorm === "plusminus") {
      const n = parseFloat(s.replace(/[^0-9.\-]/g, ""));
      if (isNaN(n)) return s;
      return n > 0 ? `+${n}` : String(n);
    }

    // FG% : format as percentage
    if (keyNorm === "fieldgoalpct") {
      const n = parseFloat(s);
      if (!isNaN(n)) {
        const pct = n <= 1 ? n * 100 : n;
        return `${pct.toFixed(1)}%`;
      }
    }

    return s;
  };

  const resolvedStats = (statKeys || []).map((key, i) => {
    const idx = resolveIndex(key);
    const raw = idx >= 0 && stats[idx] != null ? stats[idx] : null;
    return {
      key,
      label: (statLabels || [])[i] || key,
      value: formatStatValue(key, raw),
      raw,
    };
  });

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.82 : 1}
      onPress={onPress}
      disabled={!onPress}
      style={[
        wnbaRosterStyles.playerCard,
        {
          backgroundColor: theme.surface,
          borderColor: teamColor ?? theme.border,
        },
      ]}
    >
      <View style={wnbaRosterStyles.playerTopRow}>
        <View
          style={[
            wnbaRosterStyles.playerHeadshotWrap,
            {
              backgroundColor: `${teamColor}66`,
              borderColor: teamColor ?? theme.border,
            },
          ]}
        >
          {effectiveHeadshot ? (
            <Image
              source={{ uri: effectiveHeadshot }}
              style={wnbaRosterStyles.playerHeadshot}
              contentFit="cover"
              onError={() => setHeadshotError(true)}
            />
          ) : (
            <View style={wnbaRosterStyles.playerFallback}>
              <Text
                style={[
                  wnbaRosterStyles.playerFallbackText,
                  { color: theme.textSecondary },
                ]}
              >
                {initials}
              </Text>
            </View>
          )}
        </View>

        <View style={wnbaRosterStyles.playerNameBlock}>
          <View style={wnbaRosterStyles.playerNameRow}>
            <Text
              style={[wnbaRosterStyles.playerName, { color: theme.text }]}
              numberOfLines={1}
            >
              {fullName}
            </Text>
            {showDecision && player?.decision && (
              <Text
                style={[
                  wnbaRosterStyles.decisionLabel,
                  {
                    color:
                      player.decision === "W"
                        ? theme.success
                        : player.decision === "L"
                          ? theme.error
                          : theme.textSecondary,
                  },
                ]}
              >
                {player.decision === "W"
                  ? "WON"
                  : player.decision === "L"
                    ? "LOSS"
                    : ""}
              </Text>
            )}
          </View>
          {!!meta && (
            <Text
              style={[
                wnbaRosterStyles.playerMeta,
                { color: theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {meta}
            </Text>
          )}
        </View>
      </View>

      {showStats && resolvedStats.length > 0 ? (
        <View style={wnbaRosterStyles.statsRow}>
          {resolvedStats.map((item) => (
            <View key={item.label} style={wnbaRosterStyles.statCell}>
              <Text
                style={[
                  wnbaRosterStyles.statValue,
                  { color: getWnbaStatColor(item.key, item.value, theme) },
                ]}
                numberOfLines={1}
              >
                {item.value}
              </Text>
              <Text
                style={[
                  wnbaRosterStyles.statLabel,
                  { color: theme.textSecondary },
                ]}
              >
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

// ─── WNBA Player Detail Modal ───
const WNBA_STAT_KEYS = [
  "fieldGoalsMade-fieldGoalsAttempted",
  "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
  "freeThrowsMade-freeThrowsAttempted",
  "points",
  "rebounds",
  "assists",
  "steals",
  "blocks",
  "turnovers",
  "plusMinus",
  "minutes",
  "fouls",
];
const WNBA_STAT_DISPLAY_LABELS = [
  "FG",
  "3PT",
  "FT",
  "PTS",
  "REB",
  "AST",
  "STL",
  "BLK",
  "TO",
  "+/-",
  "MIN",
  "FOULS",
];

const resolveWnbaStatIndex = (key, labels, keys) => {
  const norm = (s) => (s || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const target = norm(key);
  // Exact match on keys first
  for (let i = 0; i < (keys || []).length; i++)
    if (norm(keys[i]) === target) return i;
  // Exact match on labels
  for (let i = 0; i < (labels || []).length; i++)
    if (norm(labels[i]) === target) return i;
  // Abbreviation map
  const map = {
    fieldgoalsmadefieldgoalsattempted: ["fg"],
    fieldgoalpct: ["fgpct", "fg%"],
    threepointfieldgoalsmadethreepointfieldgoalsattempted: ["3pt"],
    freethrowsmadefreethrowsattempted: ["ft"],
    points: ["pts"],
    rebounds: ["reb"],
    assists: ["ast"],
    steals: ["stl"],
    blocks: ["blk"],
    turnovers: ["to"],
    plusminus: ["+/-"],
    minutes: ["min"],
    fouls: ["fouls"],
  };
  if (map[target]) {
    for (const abbrev of map[target]) {
      const aNorm = norm(abbrev);
      for (let i = 0; i < (labels || []).length; i++)
        if (norm(labels[i]) === aNorm) return i;
    }
  }
  // Substring on keys
  for (let i = 0; i < (keys || []).length; i++) {
    const kNorm = norm(keys[i]);
    if (kNorm.includes(target) || target.includes(kNorm)) return i;
  }
  return -1;
};

const parseWnbaStatNum = (key, value) => {
  if (value == null || value === "") return null;
  const keyNorm = (key || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  // Handle slash stats like "5-12"
  const slash = raw.match(/^(\d+)-(\d+)$/);
  if (slash) {
    const made = parseInt(slash[1], 10);
    const att = parseInt(slash[2], 10);
    if (keyNorm.includes("pct") || keyNorm.includes("pctg"))
      return att > 0 ? (made / att) * 100 : 0;
    return made;
  }
  // Handle percentage like ".450"
  if (keyNorm.includes("pct") || keyNorm.includes("pctg")) {
    const n = parseFloat(raw);
    if (!isNaN(n)) return n <= 1 ? n * 100 : n;
  }
  const n = parseFloat(raw.replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? null : n;
};

const formatWnbaModalStat = (key, value) => {
  if (value == null || value === "") return "\u2014";
  if (typeof value === "number") return String(value);
  const raw = String(value).trim();
  const keyNorm = (key || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (keyNorm === "plusminus") {
    const n = parseFloat(raw.replace(/[^0-9.\-]/g, ""));
    if (!isNaN(n) && n > 0) return `+${n}`;
  }
  if (keyNorm.includes("pct") || keyNorm.includes("pctg")) {
    const n = parseFloat(raw);
    if (!isNaN(n)) {
      const pct = n <= 1 ? n * 100 : n;
      return `${pct.toFixed(1)}%`;
    }
  }
  return raw;
};

const WNBAPlayerDetailModal = ({
  visible,
  onClose,
  player,
  allPlayers,
  details,
  theme,
  colors,
  isDarkMode,
  getTeamLogoUrl,
  navigation,
  findPlayerStatsMeta,
  onShare,
}) => {
  const panY = useRef(new Animated.Value(0)).current;
  const [compareActive, setCompareActive] = useState(false);
  const [compareChooserVisible, setCompareChooserVisible] = useState(false);
  const [compareTargetId, setCompareTargetId] = useState(null);
  const [headshotError, setHeadshotError] = useState(false);
  const [compareHeadshotError, setCompareHeadshotError] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dy > 8 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) panY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 120) {
          onClose();
        } else {
          Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(panY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  useEffect(() => {
    if (!visible) {
      panY.setValue(0);
      setCompareActive(false);
      setCompareTargetId(null);
      setCompareChooserVisible(false);
      setHeadshotError(false);
      setCompareHeadshotError(false);
    }
  }, [visible]);

  useEffect(() => {
    setCompareHeadshotError(false);
  }, [compareTargetId]);

  if (!player) return null;

  const athlete = player?.athlete;
  const fullName =
    athlete?.displayName || athlete?.fullName || "Unknown Player";
  const jersey = athlete?.jersey;
  const position =
    athlete?.position?.abbreviation || athlete?.position?.name || "";
  const headshot =
    athlete?.headshot?.href ||
    (athlete?.id
      ? `https://a.espncdn.com/combiner/i?img=/i/headshots/wnba/players/full/${athlete.id}.png&w=300`
      : null);

  // Find this player's team
  const playersBox = details?.boxscore?.players || [];
  let playerTeam = null;
  for (const teamBox of playersBox) {
    if (teamBox?.statistics) {
      for (const group of teamBox.statistics) {
        if (group?.athletes) {
          const found = group.athletes.find(
            (a) => String(a?.athlete?.id) === String(athlete?.id),
          );
          if (found) {
            playerTeam = teamBox.team;
            break;
          }
        }
      }
      if (playerTeam) break;
    }
  }
  // Smart team color resolution (avoids similar team colors)
  const _boxTeams = details?.boxscore?.teams || [];
  const _awayEntry =
    _boxTeams.find((t) => t.homeAway === "away") || _boxTeams[0] || null;
  const _homeEntry =
    _boxTeams.find((t) => t.homeAway === "home") || _boxTeams[1] || null;
  const _smartColors =
    _awayEntry && _homeEntry
      ? getSmartTeamColors(_homeEntry, _awayEntry, colors)
      : null;
  const _isAwayTeam =
    playerTeam?.id && String(playerTeam.id) === String(_awayEntry?.team?.id);
  const teamColor = _smartColors
    ? _isAwayTeam
      ? _smartColors.awayColor
      : _smartColors.homeColor
    : playerTeam?.color
      ? playerTeam.color.startsWith("#")
        ? playerTeam.color
        : `#${playerTeam.color}`
      : colors.primary;
  const teamName = playerTeam?.displayName || playerTeam?.name || "";
  const teamAbbrev = playerTeam?.abbreviation || "";
  const teamLogo =
    playerTeam?.logo ||
    (teamAbbrev ? getTeamLogoUrl("wnba", teamAbbrev) : null);

  // Get stat metadata
  const meta = player?.meta || findPlayerStatsMeta?.(player) || {};
  const labels = meta.labels || [];
  const keys = meta.keys || [];
  const stats = player?.stats || [];

  // Build stat rows for this player
  const statRows = WNBA_STAT_KEYS.map((key, i) => {
    const idx = resolveWnbaStatIndex(key, labels, keys);
    const raw = idx >= 0 && stats[idx] != null ? stats[idx] : null;
    const numeric = parseWnbaStatNum(key, raw);
    return {
      key,
      label: WNBA_STAT_DISPLAY_LABELS[i] || key,
      value: formatWnbaModalStat(key, raw),
      numeric,
    };
  });

  // Compare target
  const compareTarget =
    compareTargetId != null
      ? (allPlayers || []).find(
          (p) => String(p?.athlete?.id) === String(compareTargetId),
        ) || null
      : null;

  // Compare target stats — use current player's keys/labels as fallback
  // since all players share the same boxscore group structure
  const compareStatRows = compareTarget
    ? (() => {
        const cMeta =
          compareTarget?.meta || findPlayerStatsMeta?.(compareTarget) || {};
        const cLabels =
          cMeta.labels && cMeta.labels.length > 0 ? cMeta.labels : labels;
        const cKeys = cMeta.keys && cMeta.keys.length > 0 ? cMeta.keys : keys;
        const cStats = compareTarget?.stats || [];
        return WNBA_STAT_KEYS.map((key, i) => {
          const idx = resolveWnbaStatIndex(key, cLabels, cKeys);
          const raw = idx >= 0 && cStats[idx] != null ? cStats[idx] : null;
          return {
            key,
            label: WNBA_STAT_DISPLAY_LABELS[i] || key,
            value: formatWnbaModalStat(key, raw),
            numeric: parseWnbaStatNum(key, raw),
          };
        });
      })()
    : [];
  const compareMap = new Map(compareStatRows.map((r) => [r.key, r]));

  if (compareTarget) {
    console.log(
      "[WNBA MODAL COMPARE] compareTarget:",
      compareTarget?.athlete?.displayName || "unknown",
      "stats.length:",
      (compareTarget?.stats || []).length,
    );
    console.log(
      "[WNBA MODAL COMPARE] compareStatRows:",
      JSON.stringify(
        compareStatRows.map((r) => ({
          key: r.key,
          value: r.value,
          numeric: r.numeric,
        })),
      ),
    );
  }

  // Compute global min/max for bar scaling (mirrors NHL pattern)
  const statRangeByKey = (() => {
    const map = new Map();
    // Seed with current player's own stats so they're always in the range
    statRows.forEach((row) => {
      const value = Number(row?.numeric);
      if (!Number.isFinite(value)) return;
      map.set(row.key, { min: value, max: value });
    });
    // Also include compare target
    compareStatRows.forEach((row) => {
      const value = Number(row?.numeric);
      if (!Number.isFinite(value)) return;
      if (!map.has(row.key)) {
        map.set(row.key, { min: value, max: value });
      } else {
        const prev = map.get(row.key);
        map.set(row.key, {
          min: Math.min(prev.min, value),
          max: Math.max(prev.max, value),
        });
      }
    });
    // Use the current player's resolved keys/labels as fallback
    // since all players share the same boxscore group structure
    const fallbackKeys = keys;
    const fallbackLabels = labels;
    const sourcePlayers = (allPlayers || []).length > 0 ? allPlayers : [player];
    sourcePlayers.forEach((p, pIdx) => {
      const pMeta = p?.meta || {};
      const pKeys =
        pMeta.keys && pMeta.keys.length > 0 ? pMeta.keys : fallbackKeys;
      const pLabels =
        pMeta.labels && pMeta.labels.length > 0 ? pMeta.labels : fallbackLabels;
      const pStats = p?.stats || [];
      WNBA_STAT_KEYS.forEach((key) => {
        const idx = resolveWnbaStatIndex(key, pLabels, pKeys);
        const raw = idx >= 0 && pStats[idx] != null ? pStats[idx] : null;
        const value = parseWnbaStatNum(key, raw);
        if (value == null || !Number.isFinite(value)) return;
        if (!map.has(key)) {
          map.set(key, { min: value, max: value });
          return;
        }
        const prev = map.get(key);
        map.set(key, {
          min: Math.min(prev.min, value),
          max: Math.max(prev.max, value),
        });
      });
    });
    return map;
  })();

  const closeModal = () => {
    panY.setValue(0);
    onClose();
  };

  const renderPairBar = (statKey, leftVal, rightVal, leftColor, rightColor) => {
    const leftNum = Number(leftVal);
    const rightNum = Number(rightVal);
    let a = Number.isFinite(leftNum) ? leftNum : 0;
    let b = Number.isFinite(rightNum) ? rightNum : 0;
    if (statKey === "plusMinus") {
      a = Math.max(0, a);
      b = Math.max(0, b);
    } else {
      a = Math.max(0, Math.abs(a));
      b = Math.max(0, Math.abs(b));
    }
    const sum = a + b;
    const leftPct = sum > 0 ? Math.max(0, Math.min(100, (a / sum) * 100)) : 0;
    const rightPct = sum > 0 ? 100 - leftPct : 0;
    return (
      <View style={{ flexDirection: "row", width: "100%", height: "100%" }}>
        <View
          style={{ flex: leftPct, backgroundColor: leftColor, minWidth: 0 }}
        />
        {leftPct > 0 && rightPct > 0 ? (
          <View style={{ width: 3, backgroundColor: theme.border }} />
        ) : null}
        <View
          style={{ flex: rightPct, backgroundColor: rightColor, minWidth: 0 }}
        />
      </View>
    );
  };

  const CompareAvatar = ({ uri, initials, color, size }) => {
    const [err, setErr] = useState(false);
    const hasImg = !!uri && !err;
    return hasImg ? (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          borderWidth: 1,
          overflow: "hidden",
          backgroundColor: `${color}66`,
        }}
      >
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          onError={() => setErr(true)}
        />
      </View>
    ) : (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
          backgroundColor: `${color}66`,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontSize: 18,
            fontWeight: "700",
            color: theme.text,
          }}
        >
          {initials}
        </Text>
      </View>
    );
  };

  const compareCandidates = (allPlayers || [])
    .filter((p) => String(p?.athlete?.id) !== String(athlete?.id))
    .sort((a, b) =>
      (a?.athlete?.displayName || a?.athlete?.fullName || "").localeCompare(
        b?.athlete?.displayName || b?.athlete?.fullName || "",
      ),
    );

  const playerInitials =
    fullName
      .split(" ")
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("") || "?";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={closeModal}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={closeModal}>
        <View style={wnbaModalStyles.backdrop} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          wnbaModalStyles.sheet,
          {
            backgroundColor: theme.surface,
            borderTopColor: theme.surface,
            transform: [{ translateY: panY }],
          },
        ]}
      >
        {/* Drag strip with handle */}
        <View
          {...panResponder.panHandlers}
          style={[
            wnbaModalStyles.dragStrip,
            { borderBottomColor: !compareActive ? teamColor : theme.border },
          ]}
        >
          <View style={wnbaModalStyles.handleRow}>
            <View style={{ width: 28, height: 28 }} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              {/* Compare button */}
              <TouchableOpacity
                onPress={() => {
                  if (compareActive) {
                    setCompareActive(false);
                    setCompareTargetId(null);
                    setCompareChooserVisible(false);
                  } else {
                    setCompareActive(true);
                  }
                }}
                style={[
                  wnbaModalStyles.iconBtn,
                  {
                    backgroundColor: theme.surfaceSecondary,
                  },
                ]}
              >
                <Ionicons name="people" size={16} color={theme.text} />
              </TouchableOpacity>
              {/* Share button (only when not comparing) */}
              {!compareActive && (
                <TouchableOpacity
                  onPress={() => {
                    if (onShare) onShare(player);
                  }}
                  style={[
                    wnbaModalStyles.iconBtn,
                    { backgroundColor: `${teamColor}33` },
                  ]}
                >
                  <Ionicons name="share-outline" size={16} color={teamColor} />
                </TouchableOpacity>
              )}
              {/* Close button */}
              <TouchableOpacity
                onPress={closeModal}
                style={[
                  wnbaModalStyles.iconBtn,
                  { backgroundColor: theme.error },
                ]}
              >
                <Text
                  style={[wnbaModalStyles.iconBtnText, { color: theme.text }]}
                >
                  X
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {compareActive ? (
            <View
              style={{
                flexDirection: "row",
                width: "100%",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              {/* Left: current player */}
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => {
                  setCompareTargetId(null);
                  setCompareChooserVisible(false);
                }}
                style={{
                  width: "48%",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View style={wnbaModalStyles.headshotWrap}>
                  <View style={{ position: "relative" }}>
                    {headshot && !headshotError ? (
                      <Image
                        source={{ uri: headshot }}
                        style={[
                          wnbaModalStyles.headshot,
                          {
                            borderColor: teamColor,
                            backgroundColor: `${teamColor}66`,
                          },
                        ]}
                        contentFit="cover"
                        onError={() => setHeadshotError(true)}
                      />
                    ) : (
                      <View
                        style={[
                          wnbaModalStyles.headshot,
                          {
                            borderColor: teamColor,
                            backgroundColor: `${teamColor}66`,
                            alignItems: "center",
                            justifyContent: "center",
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 28,
                            fontWeight: "800",
                            color: theme.text,
                          }}
                        >
                          {playerInitials}
                        </Text>
                      </View>
                    )}
                    <View
                      style={wnbaModalStyles.headshotBadge}
                      pointerEvents="none"
                    >
                      <Text style={wnbaModalStyles.headshotBadgeText}>
                        {position || "-"}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text
                  style={[wnbaModalStyles.playerName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {fullName}
                </Text>
                <Text
                  style={[
                    wnbaModalStyles.jerseyNum,
                    { color: theme.textSecondary, marginBottom: -8 },
                  ]}
                >
                  {[jersey ? `#${jersey}` : "", teamName]
                    .filter(Boolean)
                    .join(" \u2022 ")}
                </Text>
              </TouchableOpacity>

              <View
                style={{
                  width: 1,
                  height: 88,
                  backgroundColor: theme.border,
                  alignSelf: "center",
                }}
              />

              {/* Right: compare target */}
              <View
                style={{
                  width: "48%",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {compareTarget ? (
                  <View style={{ alignItems: "center" }}>
                    <View style={{ position: "relative" }}>
                      {(() => {
                        const cAth = compareTarget?.athlete;
                        const cHeadshot =
                          cAth?.headshot?.href ||
                          (cAth?.id
                            ? `https://a.espncdn.com/combiner/i?img=/i/headshots/wnba/players/full/${cAth.id}.png&w=300`
                            : null);
                        const cColor = (() => {
                          let t = null;
                          for (const tb of playersBox) {
                            if (tb?.statistics) {
                              for (const g of tb.statistics) {
                                if (g?.athletes) {
                                  const f = g.athletes.find(
                                    (a) =>
                                      String(a?.athlete?.id) ===
                                      String(cAth?.id),
                                  );
                                  if (f) {
                                    t = tb.team;
                                    break;
                                  }
                                }
                              }
                              if (t) break;
                            }
                          }
                          return t?.color
                            ? t.color.startsWith("#")
                              ? t.color
                              : `#${t.color}`
                            : colors.secondary;
                        })();
                        const cInitials = (cAth?.displayName || "?")
                          .split(" ")
                          .map((n) => n.charAt(0))
                          .join("")
                          .toUpperCase()
                          .slice(0, 2);
                        const cHasImg = !!cHeadshot && !compareHeadshotError;
                        return (
                          <>
                            {cHasImg ? (
                              <Image
                                source={{ uri: cHeadshot }}
                                style={[
                                  wnbaModalStyles.headshot,
                                  {
                                    borderColor: cColor,
                                    backgroundColor: `${cColor}66`,
                                  },
                                ]}
                                contentFit="cover"
                                onError={() => setCompareHeadshotError(true)}
                              />
                            ) : (
                              <View
                                style={[
                                  wnbaModalStyles.headshot,
                                  {
                                    borderColor: cColor,
                                    backgroundColor: `${cColor}66`,
                                    alignItems: "center",
                                    justifyContent: "center",
                                  },
                                ]}
                              >
                                <Text
                                  style={{
                                    fontSize: 28,
                                    fontWeight: "800",
                                    color: theme.text,
                                  }}
                                >
                                  {cInitials}
                                </Text>
                              </View>
                            )}
                            <View
                              style={wnbaModalStyles.headshotBadge}
                              pointerEvents="none"
                            >
                              <Text style={wnbaModalStyles.headshotBadgeText}>
                                {cAth?.position?.abbreviation ||
                                  cAth?.position?.name ||
                                  "-"}
                              </Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => setCompareTargetId(null)}
                              style={[
                                wnbaModalStyles.compareChosenClose,
                                { backgroundColor: theme.error },
                              ]}
                            >
                              <Text
                                style={{
                                  color: theme.text,
                                  fontWeight: "800",
                                }}
                              >
                                X
                              </Text>
                            </TouchableOpacity>
                          </>
                        );
                      })()}
                    </View>
                    <Text
                      style={[
                        wnbaModalStyles.playerName,
                        { color: theme.text, marginTop: 10 },
                      ]}
                    >
                      {compareTarget?.athlete?.displayName ||
                        compareTarget?.athlete?.fullName ||
                        "Unknown"}
                    </Text>
                    <Text
                      style={[
                        wnbaModalStyles.jerseyNum,
                        { color: theme.textSecondary, marginBottom: -8 },
                      ]}
                    >
                      {[
                        compareTarget?.athlete?.jersey
                          ? `#${compareTarget.athlete.jersey}`
                          : "",
                        (() => {
                          for (const tb of playersBox) {
                            if (tb?.statistics) {
                              for (const g of tb.statistics) {
                                if (g?.athletes) {
                                  const f = g.athletes.find(
                                    (a) =>
                                      String(a?.athlete?.id) ===
                                      String(compareTarget?.athlete?.id),
                                  );
                                  if (f) return tb.team?.displayName || "";
                                }
                              }
                            }
                          }
                          return "";
                        })(),
                      ]
                        .filter(Boolean)
                        .join(" \u2022 ")}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => setCompareChooserVisible(true)}
                    style={{
                      width: 88,
                      height: 88,
                      borderRadius: 44,
                      backgroundColor: theme.surfaceSecondary,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 28, color: theme.text }}>+</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : (
            /* ── Non-compare: clickable headshot + info ── */
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => {
                if (athlete?.id && navigation) {
                  closeModal();
                  setTimeout(() => {
                    navigation.navigate("PlayerPage", {
                      playerId: athlete.id,
                      sport: "wnba",
                    });
                  }, 300);
                }
              }}
              style={{ alignItems: "center" }}
            >
              <View style={wnbaModalStyles.headshotWrap}>
                <View style={{ position: "relative" }}>
                  {headshot && !headshotError ? (
                    <Image
                      source={{ uri: headshot }}
                      style={[
                        wnbaModalStyles.headshot,
                        {
                          borderColor: teamColor,
                          backgroundColor: `${teamColor}66`,
                        },
                      ]}
                      contentFit="cover"
                      onError={() => setHeadshotError(true)}
                    />
                  ) : (
                    <View
                      style={[
                        wnbaModalStyles.headshot,
                        {
                          borderColor: teamColor,
                          backgroundColor: `${teamColor}66`,
                          alignItems: "center",
                          justifyContent: "center",
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 28,
                          fontWeight: "800",
                          color: theme.text,
                        }}
                      >
                        {playerInitials}
                      </Text>
                    </View>
                  )}
                  <View
                    style={wnbaModalStyles.headshotBadge}
                    pointerEvents="none"
                  >
                    <Text style={wnbaModalStyles.headshotBadgeText}>
                      {position || "-"}
                    </Text>
                  </View>
                </View>
              </View>
              <Text
                style={[wnbaModalStyles.playerName, { color: theme.text }]}
                numberOfLines={1}
              >
                {fullName}
              </Text>
              <Text
                style={[
                  wnbaModalStyles.jerseyNum,
                  { color: theme.textSecondary },
                ]}
              >
                {[jersey ? `#${jersey}` : "", teamName]
                  .filter(Boolean)
                  .join(" \u2022 ")}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Body: stat rows or compare chooser ── */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={{
            paddingHorizontal: compareChooserVisible ? 10 : 20,
            paddingTop: compareChooserVisible ? 0 : 16,
            paddingBottom: 48,
          }}
        >
          {compareActive && !compareTarget ? (
            compareChooserVisible ? (
              <ScrollView
                style={{ paddingVertical: 8 }}
                showsVerticalScrollIndicator={false}
              >
                {compareCandidates.map((p) => {
                  const a = p?.athlete;
                  const pH =
                    a?.headshot?.href ||
                    (a?.id
                      ? `https://a.espncdn.com/combiner/i?img=/i/headshots/wnba/players/full/${a.id}.png&w=300`
                      : null);
                  const pName = a?.displayName || a?.fullName || "Unknown";
                  const pJersey = a?.jersey ? `#${a.jersey}` : "";
                  const pPos =
                    a?.position?.abbreviation || a?.position?.name || "";
                  let pTeam = null;
                  for (const tb of playersBox) {
                    if (tb?.statistics) {
                      for (const g of tb.statistics) {
                        if (g?.athletes) {
                          const f = g.athletes.find(
                            (x) => String(x?.athlete?.id) === String(a?.id),
                          );
                          if (f) {
                            pTeam = tb.team;
                            break;
                          }
                        }
                      }
                      if (pTeam) break;
                    }
                  }
                  const pColor = pTeam?.color
                    ? pTeam.color.startsWith("#")
                      ? pTeam.color
                      : `#${pTeam.color}`
                    : theme.border;
                  const pLogo = pTeam?.logo || null;

                  return (
                    <TouchableOpacity
                      key={`compare-${a?.id}`}
                      activeOpacity={0.8}
                      onPress={() => {
                        setCompareTargetId(String(a?.id));
                        setCompareChooserVisible(false);
                      }}
                    >
                      <View
                        style={[
                          wnbaModalStyles.compareBubble,
                          {
                            borderColor: pColor,
                            backgroundColor: theme.surface,
                            borderWidth: 1,
                          },
                        ]}
                      >
                        <View style={wnbaModalStyles.compareRow}>
                          <View
                            style={[
                              wnbaModalStyles.compareHeadshotWrap,
                              {
                                borderWidth: 1,
                                borderColor: pColor,
                                overflow: "visible",
                              },
                            ]}
                          >
                            <CompareAvatar
                              uri={pH}
                              initials={pName
                                .split(" ")
                                .map((n) => n.charAt(0))
                                .join("")
                                .toUpperCase()
                                .slice(0, 2)}
                              color={pColor}
                              size={48}
                            />
                            {!!pLogo && (
                              <Image
                                source={{ uri: pLogo }}
                                style={[
                                  wnbaModalStyles.compareTeamLogo,
                                  {
                                    borderColor: pColor,
                                    backgroundColor: `${pColor}33`,
                                  },
                                ]}
                                contentFit="contain"
                              />
                            )}
                          </View>
                          <View style={wnbaModalStyles.compareInfo}>
                            <Text
                              style={[
                                wnbaModalStyles.compareName,
                                { color: theme.text },
                              ]}
                              numberOfLines={1}
                            >
                              {pName}
                            </Text>
                            <Text
                              style={[
                                wnbaModalStyles.compareSub,
                                { color: theme.textSecondary },
                              ]}
                              numberOfLines={1}
                            >
                              {(pJersey ? `${pJersey}` : "") +
                                (pTeam?.displayName || pTeam?.name
                                  ? ` \u2022 ${pTeam.displayName || pTeam.name}`
                                  : "")}
                            </Text>
                          </View>
                          <Text
                            style={[
                              wnbaModalStyles.comparePos,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {pPos.toUpperCase() || "-"}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={{ alignItems: "center", marginBottom: 12 }}>
                <Text style={{ color: theme.textSecondary, fontSize: 20 }}>
                  Click + to select a player
                </Text>
              </View>
            )
          ) : (
            /* ── Stat rows ── */
            statRows.map((row, idx) => {
              const cmp = compareActive ? compareMap.get(row.key) : null;
              const isPM = row.key === "plusMinus";
              const rightColor = cmp
                ? (() => {
                    let t = null;
                    for (const tb of playersBox) {
                      if (tb?.statistics) {
                        for (const g of tb.statistics) {
                          if (g?.athletes) {
                            const f = g.athletes.find(
                              (x) =>
                                String(x?.athlete?.id) ===
                                String(compareTarget?.athlete?.id),
                            );
                            if (f) {
                              t = tb.team;
                              break;
                            }
                          }
                        }
                        if (t) break;
                      }
                    }
                    return t?.color
                      ? t.color.startsWith("#")
                        ? t.color
                        : `#${t.color}`
                      : colors.secondary;
                  })()
                : null;

              return (
                <React.Fragment key={row.key}>
                  <View style={wnbaModalStyles.statRow}>
                    <Text
                      style={[
                        wnbaModalStyles.statRowValueLeft,
                        {
                          color: isPM
                            ? getWnbaStatColor(row.key, row.value, theme)
                            : theme.text,
                        },
                      ]}
                    >
                      {row.value}
                    </Text>
                    <View style={wnbaModalStyles.statBarWrap}>
                      <View
                        style={[
                          wnbaModalStyles.statBarTrack,
                          { backgroundColor: theme.border, width: "100%" },
                        ]}
                      >
                        {cmp
                          ? renderPairBar(
                              row.key,
                              row.numeric,
                              cmp.numeric,
                              teamColor,
                              rightColor,
                            )
                          : (() => {
                              const raw = Number(row?.numeric);
                              const base = Number.isFinite(raw) ? raw : 0;
                              const normalized =
                                row?.key === "plusMinus"
                                  ? base
                                  : Math.max(0, Math.abs(base));
                              const range = statRangeByKey.get(row.key) || null;
                              let pct = 0;
                              if (row?.key === "plusMinus") {
                                const min = Number(range?.min);
                                const max = Number(range?.max);
                                if (
                                  Number.isFinite(min) &&
                                  Number.isFinite(max) &&
                                  max > min
                                ) {
                                  pct = Math.round(
                                    ((normalized - min) / (max - min)) * 100,
                                  );
                                } else {
                                  pct = normalized > 0 ? 100 : 0;
                                }
                              } else {
                                const maxAbs = Number.isFinite(
                                  Number(range?.max),
                                )
                                  ? Math.max(
                                      Math.abs(range.max),
                                      Math.abs(Number(range?.min) || 0),
                                    )
                                  : 0;
                                pct =
                                  maxAbs > 0
                                    ? Math.round((normalized / maxAbs) * 100)
                                    : 0;
                              }
                              return (
                                <View
                                  style={[
                                    wnbaModalStyles.statBarFill,
                                    {
                                      width: `${Math.max(0, Math.min(100, pct))}%`,
                                      backgroundColor: teamColor,
                                    },
                                  ]}
                                />
                              );
                            })()}
                      </View>
                      <Text
                        style={[
                          wnbaModalStyles.statRowLabelBelow,
                          {
                            color: theme.textSecondary,
                            alignSelf: cmp ? "center" : "flex-end",
                            textAlign: cmp ? "center" : undefined,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {row.label}
                      </Text>
                    </View>
                    {cmp && (
                      <View style={wnbaModalStyles.statRowRight}>
                        <Text
                          style={[
                            wnbaModalStyles.statRowValueRight,
                            {
                              color: isPM
                                ? getWnbaStatColor(cmp.key, cmp.value, theme)
                                : theme.text,
                            },
                          ]}
                        >
                          {cmp.value}
                        </Text>
                      </View>
                    )}
                  </View>
                  {idx !== statRows.length - 1 && (
                    <View
                      style={[
                        wnbaModalStyles.statDivider,
                        { backgroundColor: theme.border },
                      ]}
                    />
                  )}
                </React.Fragment>
              );
            })
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
};

const WNBATeamRosterSection = ({
  details,
  theme,
  teamSide,
  teamColor,
  colors,
  getTeamLogoUrl,
  isDarkMode,
  navigation,
  findPlayerStatsMeta,
  onPlayerPress,
}) => {
  const [sectionKey, setSectionKey] = useState("starters");

  const isGameFinished = useMemo(() => {
    const comp =
      details?.header?.competitions?.[0] ||
      details?.boxscore?.game ||
      details?.game ||
      null;
    const st = comp?.status?.type || details?.game?.status?.type || {};
    return !!(
      st?.state === "post" ||
      (st?.description || "").toLowerCase().includes("final") ||
      st?.completed
    );
  }, [details]);

  const isGameLive = useMemo(() => {
    const comp =
      details?.header?.competitions?.[0] ||
      details?.boxscore?.game ||
      details?.game ||
      null;
    const st = comp?.status?.type || details?.game?.status?.type || {};
    return st?.state === "in";
  }, [details]);

  const isGameScheduled = useMemo(() => {
    const comp =
      details?.header?.competitions?.[0] ||
      details?.boxscore?.game ||
      details?.game ||
      null;
    const st = comp?.status?.type || details?.game?.status?.type || {};
    return st?.state === "pre";
  }, [details]);

  // Get team object
  const team = useMemo(() => {
    if (!details?.boxscore?.teams) return null;
    const teams = details.boxscore.teams;
    return teams.find((t) => t.homeAway === teamSide) || null;
  }, [details, teamSide]);

  // Collect all players
  const allPlayers = useMemo(() => {
    if (!team) return [];
    const playersBox = details?.boxscore?.players || [];
    const teamBox = playersBox.find(
      (pb) =>
        pb?.team?.id === team.team?.id ||
        pb?.team?.abbreviation === team.team?.abbreviation,
    );
    const teamPlayers = teamBox?.statistics || [];
    const result = [];
    teamPlayers.forEach((positionGroup) => {
      if (positionGroup?.athletes) {
        positionGroup.athletes.forEach((athlete) => {
          result.push({
            ...athlete,
            position: positionGroup.name,
            isOnCourt: athlete.active === true,
          });
        });
      }
    });
    return result;
  }, [details, team, teamSide]);

  // Check if there is explicit onCourt data
  const hasOnCourtData = useMemo(() => {
    if (isGameFinished || isGameScheduled) return false;
    const onCourt = details?.onCourt;
    if (Array.isArray(onCourt) && onCourt.length > 0) {
      const onCourtData = onCourt.find(
        (ice) => String(ice.teamId) === String(team?.team?.id),
      );
      if (onCourtData?.entries?.length > 0) return true;
    }
    const hasActiveFlags = allPlayers.some((p) => p.active === true);
    return hasActiveFlags;
  }, [details, team, allPlayers, isGameFinished, isGameScheduled]);

  // Scheduled game data
  const injuries = useMemo(() => {
    if (!isGameScheduled || !team) return [];
    const teamInjuries = (details?.injuries || []).find(
      (inj) =>
        String(inj?.team?.id) === String(team.team?.id) ||
        inj?.team?.abbreviation === team.team?.abbreviation,
    );
    return teamInjuries?.injuries || [];
  }, [details, isGameScheduled, team, teamSide]);

  const lastFiveGames = useMemo(() => {
    if (!isGameScheduled || !team) return [];
    const teamLastFive = (details?.lastFiveGames || []).find(
      (l5) =>
        String(l5?.team?.id) === String(team.team?.id) ||
        l5?.team?.abbreviation === team.team?.abbreviation,
    );
    return teamLastFive?.events || [];
  }, [details, isGameScheduled, team, teamSide]);

  // Build sections
  const sections = useMemo(() => {
    const result = [];

    if (isGameScheduled) {
      const starters = allPlayers.filter((p) => p.starter === true);
      const bench = allPlayers.filter((p) => p.starter !== true);
      if (starters.length > 0)
        result.push({ key: "starters", label: "Starters", players: starters });
      if (bench.length > 0)
        result.push({ key: "bench", label: "Bench", players: bench });
      if (injuries.length > 0)
        result.push({
          key: "injured",
          label: "Injured",
          players: injuries,
          isInjured: true,
        });
      return result;
    }

    if (isGameFinished) {
      const starters = allPlayers.filter((p) => p.starter === true);
      const bench = allPlayers.filter((p) => p.starter !== true);
      if (starters.length > 0)
        result.push({ key: "starters", label: "Starters", players: starters });
      if (bench.length > 0)
        result.push({ key: "bench", label: "Bench", players: bench });
      return result;
    }

    // Live game
    if (hasOnCourtData) {
      const onCourt = allPlayers.filter((p) => p.isOnCourt);
      const bench = allPlayers.filter((p) => !p.isOnCourt);
      if (onCourt.length > 0)
        result.push({ key: "oncourt", label: "On Court", players: onCourt });
      if (bench.length > 0)
        result.push({ key: "bench", label: "Bench", players: bench });
      return result;
    }

    // Live but no onCourt data: fallback to starters/bench
    const starters = allPlayers.filter((p) => p.starter === true);
    const bench = allPlayers.filter((p) => p.starter !== true);
    if (starters.length > 0)
      result.push({ key: "starters", label: "Starters", players: starters });
    if (bench.length > 0)
      result.push({ key: "bench", label: "Bench", players: bench });
    return result;
  }, [allPlayers, hasOnCourtData, isGameFinished, isGameScheduled, injuries]);

  // Active section
  useEffect(() => {
    if (!sections.some((s) => s.key === sectionKey)) {
      setSectionKey(sections[0]?.key || "starters");
    }
  }, [sectionKey, sections]);

  const activeSection =
    sections.find((s) => s.key === sectionKey) || sections[0] || null;
  const activePlayers = activeSection?.players || [];
  const isInjuredSection = activeSection?.isInjured === true;

  // Sort bench players by MIN descending
  const sortedActivePlayers = useMemo(() => {
    if (sectionKey !== "bench" || activePlayers.length === 0)
      return activePlayers;
    try {
      const headerNames =
        details?.boxscore?.players?.[0]?.statistics?.[0]?.names ||
        details?.boxscore?.players?.[0]?.statistics?.[0]?.labels ||
        details?.boxscore?.players?.[0]?.statistics?.[0]?.keys ||
        [];
      const normalize = (s) =>
        (s || "")
          .toString()
          .replace(/[^a-z0-9]/gi, "")
          .toLowerCase();
      let minIdx = 12;
      for (let i = 0; i < headerNames.length; i++) {
        if (normalize(headerNames[i]) === "min") {
          minIdx = i;
          break;
        }
      }
      const statToNumber = (s) => {
        if (s == null) return 0;
        if (typeof s === "object") s = s.displayValue ?? s.value ?? "";
        if (typeof s === "number") return s;
        if (typeof s === "string") {
          const mmss = s.match(/^(\d+):(\d{2})$/);
          if (mmss) return parseInt(mmss[1], 10) + parseInt(mmss[2], 10) / 60;
          const n = parseFloat(s);
          if (!isNaN(n)) return n;
          const m = s.match(/(\d+(?:\.\d+)?)/);
          if (m) return parseFloat(m[1]);
          return 0;
        }
        return 0;
      };
      return [...activePlayers].sort((a, b) => {
        const aVal =
          a?.stats && a.stats[minIdx] != null ? a.stats[minIdx] : null;
        const bVal =
          b?.stats && b.stats[minIdx] != null ? b.stats[minIdx] : null;
        return statToNumber(bVal) - statToNumber(aVal);
      });
    } catch (e) {
      return activePlayers;
    }
  }, [activePlayers, details, sectionKey]);

  // Stat keys for live/finished game player cards
  const GAME_STAT_KEYS = [
    "fieldGoalsMade-fieldGoalsAttempted",
    "points",
    "rebounds",
    "assists",
    "plusMinus",
    "minutesPlayed",
  ];
  const GAME_STAT_LABELS = ["FG", "PTS", "REB", "AST", "+/-", "MIN"];

  const SEASON_STAT_KEYS = [
    "fieldGoalsMade-fieldGoalsAttempted",
    "fieldGoalPct",
    "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
    "avgPoints",
    "avgRebounds",
    "avgAssists",
  ];
  const SEASON_STAT_LABELS = ["FG", "FG%", "3PT", "PTS", "REB", "AST"];

  const currentStatKeys = isGameScheduled ? SEASON_STAT_KEYS : GAME_STAT_KEYS;
  const currentStatLabels = isGameScheduled
    ? SEASON_STAT_LABELS
    : GAME_STAT_LABELS;

  // Render injury row
  const renderInjury = (inj, idx) => (
    <View
      key={`inj-${idx}`}
      style={[
        {
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          marginBottom: 4,
        },
      ]}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 4,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>
          {inj?.athlete?.displayName || "Unknown Player"}
        </Text>
        <Text
          style={{ fontSize: 12, color: theme.textSecondary, marginLeft: 8 }}
        >
          {inj?.athlete?.jersey && inj?.athlete?.position?.abbreviation
            ? `\u2022 #${inj.athlete.jersey} \u2022 ${inj.athlete.position.abbreviation}`
            : inj?.athlete?.jersey
              ? `#${inj.athlete.jersey}`
              : inj?.athlete?.position?.abbreviation || ""}
        </Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: "bold",
            textTransform: "uppercase",
            color:
              inj?.status === "Out"
                ? "#F44336"
                : inj?.status === "Day-To-Day"
                  ? "#FF9800"
                  : theme.textSecondary,
          }}
        >
          {inj?.status || "Unknown Status"}
        </Text>
        {inj?.details?.detail && (
          <Text
            style={{
              fontSize: 11,
              fontStyle: "italic",
              color: theme.textSecondary,
            }}
          >
            {inj.details.detail}
          </Text>
        )}
      </View>
    </View>
  );

  // Render last-5-game card
  const renderLastFiveGame = (game, idx) => (
    <TouchableOpacity
      key={`mini-${teamSide}-${idx}`}
      activeOpacity={0.8}
      onPress={() => {
        const gid = game.id || game.gameId || game.eventId || game.event?.id;
        if (gid)
          navigation?.navigate("GameDetails", {
            gameId: gid,
            sport: "wnba",
            summerLeague: null,
          });
      }}
    >
      <View
        style={[
          wnbaRosterStyles.miniGameCard,
          { backgroundColor: theme.surfaceSecondary || theme.surface },
        ]}
      >
        <View style={wnbaRosterStyles.miniGameHeader}>
          <Text
            style={[
              wnbaRosterStyles.miniGameResult,
              { color: game.gameResult === "W" ? "#4CAF50" : "#F44336" },
            ]}
          >
            {game.gameResult || "L"}
          </Text>
          <Text style={[wnbaRosterStyles.miniGameScore, { color: theme.text }]}>
            {game.score ||
              `${game.awayTeamScore || 0}-${game.homeTeamScore || 0}`}
          </Text>
        </View>
        <View style={wnbaRosterStyles.miniGameInfo}>
          <TeamLogoWithTheme
            colors={colors}
            getTeamLogoUrl={getTeamLogoUrl}
            teamAbbreviation={game.opponent?.abbreviation}
            logoUri={
              isDarkMode
                ? game.opponent?.logos?.[1]?.href ||
                  game.opponent?.logos?.[1]?.url
                : game.opponent?.logos?.[0]?.href ||
                  game.opponent?.logos?.[0]?.url
            }
            size={32}
            style={wnbaRosterStyles.miniGameOpponentLogo}
          />
          <View style={wnbaRosterStyles.miniGameMeta}>
            <Text
              style={[wnbaRosterStyles.miniGameOpponent, { color: theme.text }]}
            >
              {game.atVs} {game.opponent?.abbreviation || "OPP"}
            </Text>
            <Text
              style={[
                wnbaRosterStyles.miniGameDate,
                { color: theme.textSecondary },
              ]}
            >
              {new Date(game.gameDate || game.date || "").toLocaleDateString(
                [],
                {
                  month: "short",
                  day: "numeric",
                },
              )}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (!team) return null;

  return (
    <View style={{ paddingBottom: 64 }}>
      {/* Section toggle */}
      {sections.length > 1 && (
        <View style={wnbaRosterStyles.sectionToggle}>
          {sections.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={[
                wnbaRosterStyles.sectionBtn,
                sectionKey === s.key && wnbaRosterStyles.sectionBtnActive,
              ]}
              onPress={() => setSectionKey(s.key)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  wnbaRosterStyles.sectionLabel,
                  {
                    color:
                      sectionKey === s.key ? theme.text : theme.textSecondary,
                  },
                ]}
              >
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={{ padding: 12 }}>
        {/* Scheduled game: Injuries + Last 5 Games above the player list */}
        {isGameScheduled && (
          <>
            {injuries.length > 0 && (
              <View
                style={[
                  wnbaRosterStyles.scheduleSection,
                  { backgroundColor: theme.surface },
                ]}
              >
                <View style={wnbaRosterStyles.scheduleSectionHeader}>
                  <FontAwesome6
                    name="user-injured"
                    size={16}
                    color={theme.text}
                  />
                  <Text
                    style={[
                      wnbaRosterStyles.scheduleSectionTitle,
                      { color: theme.text },
                    ]}
                  >
                    Injuries ({injuries.length})
                  </Text>
                </View>
                <View style={{ padding: 12 }}>
                  {injuries.map((inj, ii) => renderInjury(inj, ii))}
                </View>
              </View>
            )}
            {lastFiveGames.length > 0 && (
              <View
                style={[
                  wnbaRosterStyles.scheduleSection,
                  { backgroundColor: theme.surface, marginTop: 12 },
                ]}
              >
                <View style={wnbaRosterStyles.scheduleSectionHeader}>
                  <FontAwesome6
                    name="calendar-days"
                    size={16}
                    color={theme.text}
                  />
                  <Text
                    style={[
                      wnbaRosterStyles.scheduleSectionTitle,
                      { color: theme.text },
                    ]}
                  >
                    Last 5 Games
                  </Text>
                </View>
                <View style={{ padding: 8 }}>
                  {lastFiveGames
                    .slice(0, 5)
                    .map((g, i) => renderLastFiveGame(g, i))}
                </View>
              </View>
            )}
          </>
        )}
      </View>

      {/* Injured section */}
      <View style={{ marginTop: -20 }}>
        {isInjuredSection
          ? null
          : /* Player cards */
            sortedActivePlayers.map((player, idx) => (
              <WNBARosterPlayerCard
                key={player?.key || `${sectionKey}-${idx}`}
                player={player}
                theme={theme}
                teamColor={teamColor}
                showStats={activeSection?.key !== "injured"}
                onPress={
                  typeof onPlayerPress === "function"
                    ? () => onPlayerPress(player)
                    : undefined
                }
                statKeys={currentStatKeys}
                statLabels={currentStatLabels}
                findPlayerStatsMeta={findPlayerStatsMeta}
              />
            ))}
      </View>

      {/* Empty state */}
      {sortedActivePlayers.length === 0 && (
        <Text
          style={[wnbaRosterStyles.emptyText, { color: theme.textSecondary }]}
        >
          No roster data available.
        </Text>
      )}
    </View>
  );
};

const WNBAPlaysTabSection = ({
  details,
  theme,
  colors,
  onPlayerPress,
  onOpenSharePlayCard,
  getTeamLogoUrl,
}) => {
  const [activeType, setActiveType] = useState("ALL");
  const [periodIndex, setPeriodIndex] = useState(0);
  const [selectedGoalPlay, setSelectedGoalPlay] = useState(null);
  const [expandedPlayKey, setExpandedPlayKey] = useState(null);

  const rawPlays = useMemo(() => {
    const src = details?.plays || details?.boxscore?.playByPlay || [];
    return Array.isArray(src)
      ? src
      : src?.items && Array.isArray(src.items)
        ? src.items
        : [];
  }, [details]);

  const awayTeam = useMemo(() => {
    const comp =
      details?.header?.competitions?.[0] ||
      details?.game?.competitions?.[0] ||
      null;
    const comps = comp?.competitors || [];
    const a = comps.find((c) => c.homeAway === "away") || comps[0] || {};
    return {
      id: a?.team?.id || a?.id,
      abbr: a?.team?.abbreviation || a?.abbreviation || "AWY",
      name: a?.team?.displayName || a?.team?.name || "Away",
    };
  }, [details]);

  const homeTeam = useMemo(() => {
    const comp =
      details?.header?.competitions?.[0] ||
      details?.game?.competitions?.[0] ||
      null;
    const comps = comp?.competitors || [];
    const h = comps.find((c) => c.homeAway === "home") || comps[1] || {};
    return {
      id: h?.team?.id || h?.id,
      abbr: h?.team?.abbreviation || h?.abbreviation || "HME",
      name: h?.team?.displayName || h?.team?.name || "Home",
    };
  }, [details]);

  const awaySmartColor = useMemo(() => {
    const comp =
      details?.header?.competitions?.[0] ||
      details?.game?.competitions?.[0] ||
      null;
    const comps = comp?.competitors || [];
    const a = comps.find((c) => c.homeAway === "away") || comps[0];
    const h = comps.find((c) => c.homeAway === "home") || comps[1];
    const sc = getSmartTeamColors(h, a, colors);
    return sc.awayColor;
  }, [details, colors]);

  const homeSmartColor = useMemo(() => {
    const comp =
      details?.header?.competitions?.[0] ||
      details?.game?.competitions?.[0] ||
      null;
    const comps = comp?.competitors || [];
    const a = comps.find((c) => c.homeAway === "away") || comps[0];
    const h = comps.find((c) => c.homeAway === "home") || comps[1];
    const sc = getSmartTeamColors(h, a, colors);
    return sc.homeColor;
  }, [details, colors]);

  // Find player in boxscore by athlete ID
  const findPlayerBoxscore = useCallback(
    (athleteId) => {
      if (!athleteId) return null;
      const playersBox = details?.boxscore?.players || [];
      for (const teamBox of playersBox) {
        if (!teamBox?.statistics) continue;
        for (const group of teamBox.statistics) {
          if (!Array.isArray(group?.athletes)) continue;
          const found = group.athletes.find(
            (a) => String(a?.athlete?.id) === String(athleteId),
          );
          if (found) {
            return {
              ...found,
              team: teamBox.team || null,
              position: group.name || "",
              meta: {
                labels: Array.isArray(group.labels)
                  ? group.labels.slice()
                  : Array.isArray(group.keys)
                    ? group.keys.slice()
                    : [],
                keys: Array.isArray(group.keys) ? group.keys.slice() : null,
              },
            };
          }
        }
      }
      return null;
    },
    [details],
  );

  // Classify WNBA play type
  const classifyPlayType = useCallback((play) => {
    if (play?.scoringPlay) return "SCORING";
    const text = String(play?.text || play?.description || "").toLowerCase();
    if (text.includes("foul")) return "FOUL";
    if (text.includes("turnover")) return "TURNOVER";
    if (text.includes("rebound")) return "REBOUND";
    if (text.includes("block")) return "BLOCK";
    if (text.includes("steal")) return "STEAL";
    if (text.includes("timeout")) return "TIMEOUT";
    if (text.includes("substitution")) return "SUBSTITUTION";
    if (text.includes("violation")) return "VIOLATION";
    if (text.includes("free throw")) return "FREE THROW";
    if (text.includes("miss") || text.includes("block")) return "MISS";
    return "PLAY";
  }, []);

  const toTypeLabel = (raw) => String(raw || "PLAY").toUpperCase();

  const toPeriodChip = (periodDisplay) => {
    const s = String(periodDisplay || "");
    if (s.includes("1")) return "Q1";
    if (s.includes("2")) return "Q2";
    if (s.includes("3")) return "Q3";
    if (s.includes("4")) return "Q4";
    if (s.toLowerCase().includes("ot")) return "OT";
    return s || "Q?";
  };

  const preparedPlays = useMemo(() => {
    if (rawPlays.length === 0) return [];

    const scored = { away: 0, home: 0 };
    const scorerCounts = {};

    const rows = rawPlays.map((play, idx) => {
      const text = play?.text || play?.description || play?.displayText || "";
      const periodDisplay =
        play?.period?.displayValue || String(play?.period || "");
      const clock =
        play?.clock?.displayValue || play?.clock || play?.time || "--:--";
      const isScoring = !!play?.scoringPlay;
      const scoreValue = play?.scoreValue || play?.pointsAttempted || 0;
      const playTeamId = play?.team?.id;
      const coordX = play?.coordinate?.x;
      const coordY = play?.coordinate?.y;

      const typeKey = classifyPlayType(play);
      const typeLabel = toTypeLabel(typeKey);

      // Resolve scorer for scoring plays
      const scorerId =
        play?.participants && play.participants.length > 0
          ? play.participants[0]?.athlete?.id || null
          : null;
      const scorerBox = scorerId ? findPlayerBoxscore(scorerId) : null;
      const scorerName =
        scorerBox?.athlete?.displayName || scorerBox?.athlete?.fullName || "";
      const scorerHeadshot =
        scorerBox?.athlete?.headshot?.href ||
        (scorerId
          ? `https://a.espncdn.com/combiner/i?img=/i/headshots/wnba/players/full/${scorerId}.png&w=300`
          : null);
      const scorerPosition = scorerBox?.athlete?.position?.abbreviation || "";
      const scorerPoints = scorerBox?.stats
        ? (() => {
            const meta = scorerBox?.meta || {};
            const idx = (meta.keys || []).indexOf("points");
            const raw = idx >= 0 ? scorerBox.stats[idx] : null;
            return raw != null ? String(raw) : "";
          })()
        : "";

      // Resolve assister (2nd participant)
      const assistId =
        play?.participants && play.participants.length > 1
          ? play.participants[1]?.athlete?.id || null
          : null;
      const assistBox = assistId ? findPlayerBoxscore(assistId) : null;
      const assistName =
        assistBox?.athlete?.displayName || assistBox?.athlete?.fullName || "";
      const assistHeadshot =
        assistBox?.athlete?.headshot?.href ||
        (assistId
          ? `https://a.espncdn.com/combiner/i?img=/i/headshots/wnba/players/full/${assistId}.png&w=300`
          : null);
      const assistPosition = assistBox?.athlete?.position?.abbreviation || "";

      // Track scorer goals count
      if (scorerId) {
        if (!scorerCounts[scorerId]) scorerCounts[scorerId] = 0;
        if (isScoring) scorerCounts[scorerId] += 1;
      }

      const isAway = String(playTeamId) === String(awayTeam.id);
      const isHome = String(playTeamId) === String(homeTeam.id);
      const teamColor = isAway
        ? awaySmartColor
        : isHome
          ? homeSmartColor
          : theme.border;
      const teamAbbr = isAway ? awayTeam.abbr : isHome ? homeTeam.abbr : null;
      const teamLogo = isAway
        ? getTeamLogoUrl("wnba", awayTeam.abbr)
        : isHome
          ? getTeamLogoUrl("wnba", homeTeam.abbr)
          : null;

      // Score tracking
      const scoreBefore = { away: scored.away, home: scored.home };
      if (play?.awayScore != null && play?.homeScore != null) {
        scored.away = Number(play.awayScore) || 0;
        scored.home = Number(play.homeScore) || 0;
      } else if (isScoring && isAway) {
        scored.away += Number(scoreValue) || 2;
      } else if (isScoring && isHome) {
        scored.home += Number(scoreValue) || 2;
      }

      let scoringSide = null;
      if (isScoring) {
        if (scored.away > scoreBefore.away) scoringSide = "away";
        else if (scored.home > scoreBefore.home) scoringSide = "home";
        else if (isAway) scoringSide = "away";
        else if (isHome) scoringSide = "home";
      }

      return {
        key: `${idx}-${typeKey}-${periodDisplay}`,
        rawPlay: play,
        idx,
        typeKey,
        typeLabel,
        text,
        period: periodDisplay,
        periodLabel: toPeriodChip(periodDisplay),
        clock,
        isScoring,
        scoreValue,
        scoreBefore,
        scoreAt: { away: scored.away, home: scored.home },
        scoringSide,
        teamColor,
        borderColor: teamColor,
        teamAbbr,
        teamLogo,
        playTeamId,
        isAway,
        isHome,
        coordX: Number.isFinite(Number(coordX)) ? Number(coordX) : null,
        coordY: Number.isFinite(Number(coordY)) ? Number(coordY) : null,
        hasCoords:
          Number.isFinite(Number(coordX)) && Number.isFinite(Number(coordY)),
        scorerId,
        scorerName,
        scorerHeadshot,
        scorerPosition,
        scorerPoints,
        scorerGoalsInGame:
          isScoring && scorerId ? scorerCounts[scorerId] || 1 : 0,
        assistId,
        assistName,
        assistHeadshot,
        assistPosition,
      };
    });

    return rows.reverse();
  }, [
    rawPlays,
    awayTeam,
    homeTeam,
    awaySmartColor,
    homeSmartColor,
    theme.border,
    classifyPlayType,
    findPlayerBoxscore,
    getTeamLogoUrl,
  ]);

  // Scorer avatar with error tracking → falls back to player initials
  const ScorerAvatar = ({
    uri,
    teamColor,
    playerName,
    borderColor,
    size = 44,
  }) => {
    const [err, setErr] = useState(false);
    const showImg = !!uri && !err;
    const initials = String(playerName || "P")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase();
    return showImg ? (
      <Image
        source={{ uri }}
        style={[
          styles.playsGoalAvatar,
          {
            borderColor: borderColor || teamColor,
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
        contentFit="cover"
        onError={() => setErr(true)}
      />
    ) : (
      <View
        style={[
          styles.playsGoalAvatar,
          styles.playsGoalAvatarFallback,
          {
            borderColor: borderColor || teamColor,
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <Text style={styles.playsGoalAvatarFallbackText}>
          {initials || "?"}
        </Text>
      </View>
    );
  };

  // Popup avatar with error tracking → falls back to player initials
  const PopupAvatar = ({ uri, teamColor, playerName, teamAbbr }) => {
    const [err, setErr] = useState(false);
    const showImg = !!uri && !err;
    const initials = String(playerName || "P")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase();
    return showImg ? (
      <Image
        source={{ uri }}
        style={[
          styles.playerPopupAvatar,
          {
            borderColor: teamColor || theme.border,
            backgroundColor: `${teamColor || theme.border}66`,
          },
        ]}
        contentFit="cover"
        onError={() => setErr(true)}
      />
    ) : (
      <View
        style={[
          styles.playerPopupAvatar,
          styles.playerPopupAvatarFallback,
          {
            backgroundColor: `${teamColor || theme.border}66`,
            borderColor: teamColor || theme.border,
          },
        ]}
      >
        <Text style={[styles.playerPopupInitials, { color: theme.text }]}>
          {initials || "?"}
        </Text>
      </View>
    );
  };

  const filterTypes = useMemo(() => {
    const unique = new Set(preparedPlays.map((r) => r.typeLabel));
    const ordered = ["ALL"];
    const preferred = [
      "SCORING",
      "FOUL",
      "TURNOVER",
      "REBOUND",
      "BLOCK",
      "STEAL",
      "FREE THROW",
      "MISS",
      "TIMEOUT",
      "SUBSTITUTION",
      "VIOLATION",
      "PLAY",
    ];
    preferred.forEach((t) => {
      if (unique.has(t)) ordered.push(t);
    });
    unique.forEach((t) => {
      if (!ordered.includes(t)) ordered.push(t);
    });
    return ordered;
  }, [preparedPlays]);

  useEffect(() => {
    if (!filterTypes.includes(activeType)) setActiveType("ALL");
  }, [activeType, filterTypes]);

  const periodOptions = useMemo(() => {
    const unique = [
      ...new Set(preparedPlays.map((r) => r.periodLabel).filter(Boolean)),
    ];
    // Sort Q1..Q4..OT in order
    const order = ["Q1", "Q2", "Q3", "Q4", "OT"];
    return unique.sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai >= 0 ? ai : 99) - (bi >= 0 ? bi : 99);
    });
  }, [preparedPlays]);

  useEffect(() => {
    if (periodOptions.length === 0) {
      setPeriodIndex(0);
      return;
    }
    // Default to the last (most recent) period
    setPeriodIndex(periodOptions.length - 1);
  }, [periodOptions]);

  const selectedPeriod = periodOptions[periodIndex] || null;

  const visibleRows = useMemo(() => {
    const byType =
      activeType === "ALL"
        ? preparedPlays
        : preparedPlays.filter((r) => r.typeLabel === activeType);
    if (!selectedPeriod) return byType;
    return byType.filter((r) => r.periodLabel === selectedPeriod);
  }, [activeType, preparedPlays, selectedPeriod]);

  useEffect(() => {
    if (!expandedPlayKey) return;
    if (!visibleRows.some((r) => r.key === expandedPlayKey))
      setExpandedPlayKey(null);
  }, [expandedPlayKey, visibleRows]);

  const renderScore = (row, textColor) => (
    <Text style={[styles.playsScoreText, { color: textColor }]}>
      <Text
        style={
          row.isScoring && row.scoringSide === "away"
            ? styles.playsScoreNumBold
            : styles.playsScoreNum
        }
      >
        {row.scoreAt.away}
      </Text>
      {" - "}
      <Text
        style={
          row.isScoring && row.scoringSide === "home"
            ? styles.playsScoreNumBold
            : styles.playsScoreNum
        }
      >
        {row.scoreAt.home}
      </Text>
    </Text>
  );

  // Open scorer player modal
  const openScorerModal = useCallback(
    (row) => {
      if (!row?.scorerId || !onPlayerPress) return;
      const box = findPlayerBoxscore(row.scorerId);
      if (box) {
        onPlayerPress(box);
      }
      setSelectedGoalPlay(null);
    },
    [onPlayerPress, findPlayerBoxscore],
  );

  // Open share card for scoring play
  const openShareFromPlay = useCallback(() => {
    if (!selectedGoalPlay?.isScoring || !onOpenSharePlayCard) return;
    const row = selectedGoalPlay;
    const p = {
      id: row.idx,
      playText: row.text,
      period: row.period,
      clock: row.clock,
      awayScore: row.scoreAt.away,
      homeScore: row.scoreAt.home,
      isScoring: true,
      scoreValue: row.scoreValue,
      playTeamColor: row.teamColor,
      coordX: row.coordX,
      coordY: row.coordY,
      playTeamId: row.playTeamId,
      scorerId: row.scorerId,
      rawPlay: row.rawPlay,
      awayLogoUri: getTeamLogoUrl("wnba", awayTeam.abbr),
      homeLogoUri: getTeamLogoUrl("wnba", homeTeam.abbr),
      awayAbbreviation: awayTeam.abbr,
      homeAbbreviation: homeTeam.abbr,
    };
    console.log(
      "[SHARE PLAY] openShareFromPlay passing:",
      JSON.stringify({
        id: p.id,
        scorerId: p.scorerId,
        hasRawPlay: !!p.rawPlay,
        rawPlayParticipants: p.rawPlay?.participants?.length,
        coordX: p.coordX,
        coordY: p.coordY,
      }),
    );
    setSelectedGoalPlay(null);
    onOpenSharePlayCard(p);
  }, [
    selectedGoalPlay,
    onOpenSharePlayCard,
    getTeamLogoUrl,
    awayTeam,
    homeTeam,
  ]);

  if (preparedPlays.length === 0) {
    return (
      <View style={styles.playsSectionWrap}>
        <View style={styles.playsEmptyWrap}>
          <Text style={[styles.playsEmptyText, { color: theme.textSecondary }]}>
            No plays available
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.playsSectionWrap}>
      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.playsFilterRow}
      >
        {filterTypes.map((type) => {
          const active = activeType === type;
          return (
            <TouchableOpacity
              key={type}
              activeOpacity={0.8}
              onPress={() => setActiveType(type)}
              style={[
                styles.playsFilterChip,
                {
                  borderColor: active ? theme.text : theme.border,
                  backgroundColor: active
                    ? theme.surfaceSecondary
                    : theme.surface,
                },
              ]}
            >
              <Text
                style={[
                  styles.playsFilterChipText,
                  { color: active ? theme.text : theme.textSecondary },
                ]}
              >
                {type}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Play cards */}
      <View style={styles.playsCardsWrap}>
        {visibleRows.map((row) => {
          const headerColor = row.isScoring ? "#FFFFFF" : theme.text;
          const bodyColor = row.isScoring ? "#FFFFFF" : theme.textSecondary;
          const showExpandedCourt =
            row.hasCoords && expandedPlayKey === row.key;

          return (
            <View key={row.key} style={styles.playsRowWrap}>
              <View style={styles.playsTimeCol}>
                <Text style={[styles.playsMinuteText, { color: theme.text }]}>
                  {row.clock}
                </Text>
                <Text
                  style={[
                    styles.playsPeriodText,
                    { color: theme.textSecondary },
                  ]}
                >
                  {row.periodLabel}
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={row.isScoring || row.hasCoords ? 0.85 : 1}
                disabled={!row.isScoring && !row.hasCoords}
                onPress={() => {
                  if (row.isScoring) {
                    setSelectedGoalPlay(row);
                    return;
                  }
                  if (!row.hasCoords) return;
                  setExpandedPlayKey((prev) =>
                    prev === row.key ? null : row.key,
                  );
                }}
                style={[
                  styles.playsCard,
                  {
                    borderColor: row.borderColor,
                    backgroundColor: row.isScoring
                      ? row.teamColor + "66"
                      : theme.surface,
                  },
                ]}
              >
                <View style={styles.playsCardHeaderRow}>
                  <Text style={[styles.playsCardTitle, { color: headerColor }]}>
                    {row.typeLabel}
                  </Text>
                  {renderScore(row, headerColor)}
                </View>

                {!!row.text && (
                  <Text
                    style={[styles.playsCardMainText, { color: bodyColor }]}
                  >
                    {row.text}
                  </Text>
                )}

                {/* Scoring play: headshot + basketball icon with points */}
                {row.isScoring && (
                  <View style={styles.playsGoalPlayerRow}>
                    <View style={styles.playsGoalAvatarWrap}>
                      <ScorerAvatar
                        uri={row.scorerHeadshot}
                        teamColor={row.teamColor}
                        playerName={row.scorerName}
                        borderColor={row.teamColor}
                        size={44}
                      />

                      {!!row.teamLogo && (
                        <View
                          style={[
                            styles.playsGoalTeamBadge,
                            {
                              borderColor: row.teamColor,
                              backgroundColor: row.teamColor + "66",
                            },
                          ]}
                        >
                          <Image
                            source={{ uri: row.teamLogo }}
                            style={styles.playsGoalTeamLogo}
                            contentFit="contain"
                          />
                        </View>
                      )}

                      {!!row.scorerPosition && (
                        <View
                          style={[
                            styles.playsGoalPosBadge,
                            {
                              backgroundColor: theme.surface,
                              borderColor: theme.surface,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.playsGoalPosText,
                              { color: theme.text },
                            ]}
                          >
                            {row.scorerPosition}
                          </Text>
                        </View>
                      )}

                      {/* Basketball icon + player's total game points */}
                      <View
                        style={[
                          styles.playsGoalCountBadge,
                          { backgroundColor: theme.surface },
                        ]}
                      >
                        <Ionicons
                          name="basketball"
                          size={9}
                          color={theme.text}
                        />
                        <Text
                          style={[
                            styles.playsGoalCountText,
                            { color: theme.text },
                          ]}
                        >
                          {row.scorerPoints || ""}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.playsGoalTextCol}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: bodyColor,
                        }}
                        numberOfLines={1}
                      >
                        {row.scorerName}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Expanded basketball court for non-scoring plays with coords */}
                {showExpandedCourt && (
                  <View
                    style={[
                      styles.playsInlineRinkWrap,
                      {
                        borderColor: row.borderColor,
                        backgroundColor: theme.surfaceSecondary,
                      },
                    ]}
                  >
                    <View
                      style={{
                        flex: 1,
                        transform: [
                          { rotate: "90deg" },
                          { scale: 1.1 },
                          { translateX: 6 },
                        ],
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <BasketballCourt
                        coordinate={{ x: row.coordX, y: row.coordY }}
                        isScoring={false}
                        teamSide={row.isAway ? "away" : "home"}
                        teamColor={row.teamColor || "552583"}
                        styles={styles}
                      />
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* Period pager */}
      {periodOptions.length > 1 && (
        <View style={styles.playsPagerRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={periodIndex >= periodOptions.length - 1}
            onPress={() =>
              setPeriodIndex((idx) =>
                Math.min(periodOptions.length - 1, idx + 1),
              )
            }
            style={[
              styles.playsPagerBtn,
              {
                borderColor: theme.border,
                backgroundColor: theme.surface,
                opacity: periodIndex >= periodOptions.length - 1 ? 0.45 : 1,
              },
            ]}
          >
            <Text style={[styles.playsPagerBtnText, { color: theme.text }]}>
              Next
            </Text>
          </TouchableOpacity>
          <Text
            style={[styles.playsPagerLabel, { color: theme.textSecondary }]}
          >
            {selectedPeriod || "?"}
          </Text>
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={periodIndex <= 0}
            onPress={() => setPeriodIndex((idx) => Math.max(0, idx - 1))}
            style={[
              styles.playsPagerBtn,
              {
                borderColor: theme.border,
                backgroundColor: theme.surface,
                opacity: periodIndex <= 0 ? 0.45 : 1,
              },
            ]}
          >
            <Text style={[styles.playsPagerBtnText, { color: theme.text }]}>
              Previous
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Event popup modal for scoring plays */}
      <Modal
        visible={!!selectedGoalPlay}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedGoalPlay(null)}
      >
        <View style={styles.playerPopupOverlay}>
          <TouchableWithoutFeedback onPress={() => setSelectedGoalPlay(null)}>
            <View style={styles.playerPopupBackdropTap} />
          </TouchableWithoutFeedback>

          <View
            style={[
              styles.playerPopupCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View
              style={[
                styles.playerPopupHeader,
                { borderBottomColor: theme.border },
              ]}
            >
              <Text
                style={[styles.playerPopupHeaderTitle, { color: theme.text }]}
              >
                Play Details
              </Text>
              <TouchableOpacity
                onPress={() => setSelectedGoalPlay(null)}
                style={[
                  styles.playerPopupCloseBtn,
                  { backgroundColor: theme.error || colors.primary },
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.playerPopupCloseText,
                    { color: theme.textSecondary },
                  ]}
                >
                  ✕
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.playerPopupBody}>
              {/* Scorer section */}
              {!!selectedGoalPlay?.scorerName && (
                <View
                  style={[
                    styles.playerPopupSection,
                    { borderColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.playerPopupTitle,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Scorer
                  </Text>
                  <TouchableOpacity
                    activeOpacity={selectedGoalPlay?.scorerId ? 0.8 : 1}
                    disabled={!selectedGoalPlay?.scorerId}
                    onPress={() => openScorerModal(selectedGoalPlay)}
                    style={[
                      styles.playerPopupRow,
                      { backgroundColor: theme.surfaceSecondary },
                    ]}
                  >
                    <PopupAvatar
                      uri={selectedGoalPlay?.scorerHeadshot}
                      teamColor={selectedGoalPlay?.teamColor}
                      playerName={selectedGoalPlay?.scorerName}
                      teamAbbr={selectedGoalPlay?.teamAbbr}
                    />
                    <View style={styles.playerPopupNameCol}>
                      {(() => {
                        const nameParts = String(
                          selectedGoalPlay?.scorerName || "",
                        )
                          .split(" ")
                          .filter(Boolean);
                        const firstName =
                          nameParts.length > 1
                            ? nameParts.slice(0, -1).join(" ")
                            : "";
                        const lastName =
                          nameParts.length > 0
                            ? nameParts[nameParts.length - 1]
                            : "Unknown";
                        return (
                          <>
                            <Text
                              style={[
                                styles.playerPopupFirstName,
                                { color: theme.textSecondary },
                              ]}
                              numberOfLines={1}
                            >
                              {firstName ||
                                selectedGoalPlay?.scorerPosition ||
                                " "}
                            </Text>
                            <Text
                              style={[
                                styles.playerPopupLastName,
                                { color: theme.text },
                              ]}
                              numberOfLines={1}
                            >
                              {lastName}
                            </Text>
                          </>
                        );
                      })()}
                    </View>
                  </TouchableOpacity>
                </View>
              )}

              {/* Assister section (2nd participant) */}
              {!!selectedGoalPlay?.assistName && (
                <View
                  style={[
                    styles.playerPopupSection,
                    { borderColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.playerPopupTitle,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Assisted By
                  </Text>
                  <TouchableOpacity
                    activeOpacity={selectedGoalPlay?.assistId ? 0.8 : 1}
                    disabled={!selectedGoalPlay?.assistId}
                    onPress={() => {
                      if (!selectedGoalPlay?.assistId || !onPlayerPress) return;
                      const box = findPlayerBoxscore(selectedGoalPlay.assistId);
                      if (box) {
                        onPlayerPress(box);
                        setSelectedGoalPlay(null);
                      }
                    }}
                    style={[
                      styles.playerPopupRow,
                      { backgroundColor: theme.surfaceSecondary },
                    ]}
                  >
                    <PopupAvatar
                      uri={selectedGoalPlay?.assistHeadshot}
                      teamColor={selectedGoalPlay?.teamColor}
                      playerName={selectedGoalPlay?.assistName}
                      teamAbbr={selectedGoalPlay?.teamAbbr}
                    />
                    <View style={styles.playerPopupNameCol}>
                      {(() => {
                        const nameParts = String(
                          selectedGoalPlay?.assistName || "",
                        )
                          .split(" ")
                          .filter(Boolean);
                        const firstName =
                          nameParts.length > 1
                            ? nameParts.slice(0, -1).join(" ")
                            : "";
                        const lastName =
                          nameParts.length > 0
                            ? nameParts[nameParts.length - 1]
                            : "Unknown";
                        return (
                          <>
                            <Text
                              style={[
                                styles.playerPopupFirstName,
                                { color: theme.textSecondary },
                              ]}
                              numberOfLines={1}
                            >
                              {firstName ||
                                selectedGoalPlay?.assistPosition ||
                                " "}
                            </Text>
                            <Text
                              style={[
                                styles.playerPopupLastName,
                                { color: theme.text },
                              ]}
                              numberOfLines={1}
                            >
                              {lastName}
                            </Text>
                          </>
                        );
                      })()}
                    </View>
                  </TouchableOpacity>
                </View>
              )}

              {/* Share card button */}
              {selectedGoalPlay?.isScoring && (
                <View
                  style={[
                    styles.playerPopupSection,
                    { borderColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.playerPopupTitle,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Play Share Card
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={openShareFromPlay}
                    style={[
                      styles.goalShareActionBtn,
                      {
                        backgroundColor: theme.surfaceSecondary,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name="share-outline"
                      size={16}
                      color={theme.text}
                    />
                    <Text
                      style={[
                        styles.goalShareActionText,
                        { color: theme.text },
                      ]}
                    >
                      Open Play Share Card
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── WNBA Linescore Table (NHL-style card with horizontal scroll) ───
const WNBALinescoreTable = ({
  details,
  theme,
  colors,
  getTeamLogoUrl,
  isDarkMode,
}) => {
  const competitors = details?.header?.competitions?.[0]?.competitors || [];
  const awayComp = competitors.find((c) => c.homeAway === "away");
  const homeComp = competitors.find((c) => c.homeAway === "home");
  if (!awayComp || !homeComp) return null;
  const awayLineScores = awayComp.linescores || [];
  const homeLineScores = homeComp.linescores || [];
  const maxPeriods = Math.max(awayLineScores.length, homeLineScores.length);
  if (maxPeriods === 0) return null;

  const awayAbbr = awayComp.team?.abbreviation || "AWY";
  const homeAbbr = homeComp.team?.abbreviation || "HME";
  const awayTotal = awayComp.score || "0";
  const homeTotal = homeComp.score || "0";
  const teams = details?.boxscore?.teams || [];
  const awayTeam = teams.find((t) => t.homeAway === "away");
  const homeTeam = teams.find((t) => t.homeAway === "home");
  const sc = getSmartTeamColors(homeTeam, awayTeam, colors);
  const awayColor = sc.awayColor;
  const homeColor = sc.homeColor;

  const periodLabels = [];
  for (let i = 0; i < maxPeriods; i++) {
    periodLabels.push(i < 4 ? String(i + 1) : `OT${i > 4 ? i - 3 : ""}`);
  }

  const CELL_W = 32;
  const ROW_H = 34;
  const LABEL_W = 48;
  const TOTAL_W = 38;
  const headerBg = theme.surfaceSecondary ?? "rgba(128,128,128,0.08)";
  const borderCol = theme.border ?? "rgba(128,128,128,0.2)";

  return (
    <View
      style={[
        wnbaStatsStyles.linescoreCard,
        { backgroundColor: theme.surface },
      ]}
    >
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: LABEL_W }}>
          <View
            style={[
              wnbaStatsStyles.linescoreCell,
              {
                height: ROW_H,
                borderBottomColor: borderCol,
                backgroundColor: headerBg,
              },
            ]}
          />
          <View
            style={[
              wnbaStatsStyles.linescoreCell,
              {
                height: ROW_H,
                borderBottomColor: awayColor,
                borderBottomWidth: 2,
              },
            ]}
          >
            <Text
              style={[wnbaStatsStyles.linescoreTeamAbbr, { color: theme.text }]}
            >
              {awayAbbr}
            </Text>
          </View>
          <View
            style={[
              wnbaStatsStyles.linescoreCell,
              {
                height: ROW_H,
                borderBottomColor: homeColor,
                borderBottomWidth: 2,
              },
            ]}
          >
            <Text
              style={[wnbaStatsStyles.linescoreTeamAbbr, { color: theme.text }]}
            >
              {homeAbbr}
            </Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row" }}>
            {periodLabels.map((label, idx) => (
              <View
                key={`h-${idx}`}
                style={[
                  wnbaStatsStyles.linescoreCell,
                  {
                    flex: 1,
                    height: ROW_H,
                    backgroundColor: headerBg,
                    borderBottomColor: borderCol,
                  },
                ]}
              >
                <Text
                  style={[
                    wnbaStatsStyles.linescorePeriodNum,
                    { color: theme.textSecondary },
                  ]}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row" }}>
            {periodLabels.map((_, idx) => (
              <View
                key={`a-${idx}`}
                style={[
                  wnbaStatsStyles.linescoreCell,
                  {
                    flex: 1,
                    height: ROW_H,
                    borderBottomColor: awayColor,
                    borderBottomWidth: 2,
                  },
                ]}
              >
                <Text
                  style={[
                    wnbaStatsStyles.linescoreRunsText,
                    { color: theme.text },
                  ]}
                >
                  {awayLineScores[idx]?.displayValue || "0"}
                </Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row" }}>
            {periodLabels.map((_, idx) => (
              <View
                key={`hm-${idx}`}
                style={[
                  wnbaStatsStyles.linescoreCell,
                  {
                    flex: 1,
                    height: ROW_H,
                    borderBottomColor: homeColor,
                    borderBottomWidth: 2,
                  },
                ]}
              >
                <Text
                  style={[
                    wnbaStatsStyles.linescoreRunsText,
                    { color: theme.text },
                  ]}
                >
                  {homeLineScores[idx]?.displayValue || "0"}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <View
          style={[
            wnbaStatsStyles.linescoreTotalsSection,
            { borderLeftColor: borderCol },
          ]}
        >
          <View
            style={[
              wnbaStatsStyles.linescoreTotalsRow,
              {
                height: ROW_H,
                backgroundColor: headerBg,
                borderBottomColor: borderCol,
              },
            ]}
          >
            <View style={{ width: TOTAL_W, alignItems: "center" }}>
              <Text
                style={[
                  wnbaStatsStyles.linescoreTotalHeader,
                  { color: theme.textSecondary },
                ]}
              >
                T
              </Text>
            </View>
          </View>
          <View
            style={[
              wnbaStatsStyles.linescoreTotalsRow,
              {
                height: ROW_H,
                borderBottomColor: awayColor,
                borderBottomWidth: 2,
              },
            ]}
          >
            <View style={{ width: TOTAL_W, alignItems: "center" }}>
              <Text
                style={[
                  wnbaStatsStyles.linescoreTotalVal,
                  { color: theme.text },
                ]}
              >
                {awayTotal}
              </Text>
            </View>
          </View>
          <View
            style={[
              wnbaStatsStyles.linescoreTotalsRow,
              {
                height: ROW_H,
                borderBottomColor: homeColor,
                borderBottomWidth: 2,
              },
            ]}
          >
            <View style={{ width: TOTAL_W, alignItems: "center" }}>
              <Text
                style={[
                  wnbaStatsStyles.linescoreTotalVal,
                  { color: theme.text },
                ]}
              >
                {homeTotal}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

// ─── WNBA Stats Section (NHL-style bar fills, no faceoff/SOG) ───
const WNBAStatsSection = ({ details, theme, colors, isDarkMode }) => {
  if (!details?.boxscore?.teams) return null;
  const teams = details.boxscore.teams;
  const awayTeam = teams.find((t) => t.homeAway === "away") || teams[0];
  const homeTeam = teams.find((t) => t.homeAway === "home") || teams[1];
  const { homeColor, awayColor } = getSmartTeamColors(
    homeTeam,
    awayTeam,
    colors,
  );

  const competition = details?.header?.competitions?.[0] || null;
  const statusType = competition?.status?.type || {};
  const isScheduled = statusType?.state === "pre";

  let keyStats = [];
  if (isScheduled) {
    keyStats = [
      "avgShots",
      "avgGoals",
      "avgGoalsAgainst",
      "powerPlayGoals",
      "powerPlayPct",
      "penaltyKillPct",
      "penaltyMinutes",
    ];
  } else {
    keyStats = [
      "fieldGoalsMade-fieldGoalsAttempted",
      "fieldGoalPct",
      "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
      "freeThrowsMade-freeThrowsAttempted",
      "totalRebounds",
      "offensiveRebounds",
      "defensiveRebounds",
      "assists",
      "steals",
      "blocks",
      "turnovers",
      "turnoverPoints",
      "largestLead",
    ];
  }

  const parseNum = (val) => {
    if (!val) return 0;
    const s = String(val);
    const slash = s.match(/^(\d+)-(\d+)$/);
    if (slash) return parseInt(slash[1], 10);
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };

  const rows = keyStats
    .map((statName) => {
      const awayStat = awayTeam?.statistics?.find((s) => s.name === statName);
      const homeStat = homeTeam?.statistics?.find((s) => s.name === statName);
      if (!awayStat && !homeStat) return null;
      const awayVal = awayStat?.displayValue || "0";
      const homeVal = homeStat?.displayValue || "0";
      const label = awayStat?.label || homeStat?.label || statName;
      return {
        key: statName,
        label,
        awayVal,
        homeVal,
        awayNum: parseNum(awayVal),
        homeNum: parseNum(homeVal),
      };
    })
    .filter(Boolean);

  return (
    <>
      {rows.length !== 0 && (
        <View
          style={[
            wnbaStatsStyles.card,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View
            style={[
              wnbaStatsStyles.headerRow,
              { borderBottomColor: theme.border },
            ]}
          >
            <Text style={[wnbaStatsStyles.headerTitle, { color: theme.text }]}>
              Stats
            </Text>
          </View>
          <View style={wnbaStatsStyles.body}>
            {rows.length === 0 ? (
              <Text
                style={[
                  wnbaStatsStyles.emptyText,
                  { color: theme.textTertiary },
                ]}
              >
                No stats available
              </Text>
            ) : (
              rows.map((row) => {
                const total = row.awayNum + row.homeNum;
                const awayShare = total > 0 ? row.awayNum / total : 0.5;
                const homeShare = total > 0 ? row.homeNum / total : 0.5;
                return (
                  <View key={row.key} style={wnbaStatsStyles.statRowWrap}>
                    <View style={wnbaStatsStyles.statValueRow}>
                      <Text
                        style={[
                          wnbaStatsStyles.statValueText,
                          { color: theme.text },
                        ]}
                      >
                        {row.awayVal}
                      </Text>
                      <Text
                        style={[
                          wnbaStatsStyles.statValueText,
                          { color: theme.text },
                        ]}
                      >
                        {row.homeVal}
                      </Text>
                    </View>
                    <View
                      style={[
                        wnbaStatsStyles.statBarTrack,
                        { backgroundColor: theme.surfaceSecondary },
                      ]}
                    >
                      <View
                        style={[
                          wnbaStatsStyles.statBarFillLeft,
                          {
                            width: `${Math.max(0, Math.min(100, awayShare * 100))}%`,
                            backgroundColor: awayColor,
                          },
                        ]}
                      />
                      <View
                        style={[
                          wnbaStatsStyles.statBarFillRight,
                          {
                            width: `${Math.max(0, Math.min(100, homeShare * 100))}%`,
                            backgroundColor: homeColor,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        wnbaStatsStyles.statCategoryLabel,
                        { color: theme.textSecondary },
                      ]}
                      numberOfLines={2}
                    >
                      {row.label.toUpperCase()}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </View>
      )}
    </>
  );
};

// ─── WNBA Leaders Section (NHL three-stars style per team) ───
const WNBALeadersSection = ({
  details,
  theme,
  colors,
  getTeamLogoUrl,
  isDarkMode,
}) => {
  if (!details?.leaders || !Array.isArray(details.leaders)) return null;

  const teams = details?.boxscore?.teams || [];
  const awayEntry = teams.find((t) => t.homeAway === "away");
  const homeEntry = teams.find((t) => t.homeAway === "home");
  const sc = getSmartTeamColors(homeEntry, awayEntry, colors);

  const colorForTeam = (abbr) => {
    const a = String(abbr || "").toUpperCase();
    if (a === String(awayEntry?.team?.abbreviation || "").toUpperCase())
      return sc.awayColor;
    if (a === String(homeEntry?.team?.abbreviation || "").toUpperCase())
      return sc.homeColor;
    return colors.primary;
  };

  // Sort so away team shows first
  const awayAbbr = String(awayEntry?.team?.abbreviation || "").toUpperCase();
  const sortedLeaders = [...(details.leaders || [])].sort((a, b) => {
    const aIsAway =
      String(a?.team?.abbreviation || "").toUpperCase() === awayAbbr;
    const bIsAway =
      String(b?.team?.abbreviation || "").toUpperCase() === awayAbbr;
    if (aIsAway && !bIsAway) return -1;
    if (!aIsAway && bIsAway) return 1;
    return 0;
  });

  return (
    <View
      style={[
        wnbaStatsStyles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View
        style={[wnbaStatsStyles.headerRow, { borderBottomColor: theme.border }]}
      >
        <Text style={[wnbaStatsStyles.headerTitle, { color: theme.text }]}>
          Leaders
        </Text>
      </View>
      {sortedLeaders.map((teamLeaders, teamIdx) => {
        const teamAbbr = teamLeaders.team?.abbreviation || "";
        const teamColor = colorForTeam(teamAbbr);
        const teamLogoUri = teamLeaders.team?.logos?.[isDarkMode ? 1 : 0]?.href;

        return (
          <View
            key={`leaders-${teamIdx}`}
            style={[
              wnbaStatsStyles.leadersTeamBlock,
              teamIdx < sortedLeaders.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: theme.border,
              },
            ]}
          >
            <View
              style={[
                wnbaStatsStyles.leadersTeamHeader,
                { backgroundColor: `${teamColor}15` },
              ]}
            >
              <TeamLogoWithTheme
                colors={colors}
                getTeamLogoUrl={getTeamLogoUrl}
                teamAbbreviation={teamAbbr}
                logoUri={teamLogoUri}
                size={24}
                style={{ width: 24, height: 24, marginRight: 8 }}
              />
              <Text
                style={[wnbaStatsStyles.leadersTeamName, { color: theme.text }]}
              >
                {teamLeaders.team?.displayName || teamAbbr}
              </Text>
            </View>
            {teamLeaders.leaders?.map((category, catIdx) => (
              <View
                key={`cat-${catIdx}`}
                style={wnbaStatsStyles.leadersCategoryBlock}
              >
                <Text
                  style={[
                    wnbaStatsStyles.leadersCategoryTitle,
                    { color: theme.textSecondary },
                  ]}
                >
                  {category.displayName}
                </Text>
                {category.leaders?.slice(0, 3).map((leader, li) => {
                  const athlete = leader.athlete || {};
                  const fullName =
                    athlete.fullName || athlete.displayName || "";
                  const headshot =
                    athlete.headshot?.href || athlete.headshot || null;
                  const jersey = athlete.jersey || "";
                  const position =
                    athlete.position?.abbreviation ||
                    athlete.position?.name ||
                    "";
                  const initials =
                    fullName
                      .split(" ")
                      .filter(Boolean)
                      .map((p) => p.charAt(0))
                      .slice(0, 2)
                      .join("")
                      .toUpperCase() || "?";
                  return (
                    <View
                      key={`l-${li}`}
                      style={[
                        wnbaStatsStyles.leaderRow,
                        {
                          backgroundColor:
                            theme.surfaceSecondary || theme.surface,
                        },
                      ]}
                    >
                      <View
                        style={[
                          wnbaStatsStyles.leaderHeadshotWrap,
                          {
                            borderColor: teamColor,
                            backgroundColor: `${teamColor}33`,
                          },
                        ]}
                      >
                        {headshot ? (
                          <Image
                            source={{ uri: headshot }}
                            style={wnbaStatsStyles.leaderHeadshot}
                            contentFit="cover"
                          />
                        ) : (
                          <View
                            style={[
                              wnbaStatsStyles.leaderHeadshot,
                              {
                                alignItems: "center",
                                justifyContent: "center",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                wnbaStatsStyles.leaderInitials,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {initials}
                            </Text>
                          </View>
                        )}
                        {!!teamLogoUri && (
                          <View
                            style={[
                              wnbaStatsStyles.leaderTeamBadge,
                              {
                                borderColor: teamColor,
                                backgroundColor: `${teamColor}33`,
                              },
                            ]}
                          >
                            <Image
                              source={{ uri: teamLogoUri }}
                              style={{ width: 16, height: 16 }}
                              contentFit="contain"
                            />
                          </View>
                        )}
                      </View>
                      <View style={wnbaStatsStyles.leaderNameCol}>
                        <Text
                          style={[
                            wnbaStatsStyles.leaderDisplayName,
                            { color: theme.text },
                          ]}
                          numberOfLines={1}
                        >
                          {athlete.displayName || fullName}
                        </Text>
                        <Text
                          style={[
                            wnbaStatsStyles.leaderMeta,
                            { color: theme.textSecondary },
                          ]}
                          numberOfLines={1}
                        >
                          {[jersey ? `#${jersey}` : "", position]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </View>
                      <Text
                        style={[
                          wnbaStatsStyles.leaderValue,
                          { color: colors.primary },
                        ]}
                      >
                        {leader.displayValue}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
};

// ─── WNBA Series Summary Section (NHL-style) ───
const WNBASeriesSummarySection = ({
  details,
  theme,
  colors,
  homeColor,
  awayColor,
  homeOnly,
  onToggleHomeOnly,
  getTeamLogoUrl,
  isDarkMode,
  seriesSummary,
}) => {
  const competitors = details?.header?.competitions?.[0]?.competitors || [];
  const awayComp = competitors.find((c) => c.homeAway === "away");
  const homeComp = competitors.find((c) => c.homeAway === "home");
  if (!awayComp || !homeComp || !seriesSummary) return null;

  const awayAbbr = awayComp.team?.abbreviation || "AWY";
  const homeAbbr = homeComp.team?.abbreviation || "HME";
  const awayLogoUri =
    awayComp.team?.logos?.[isDarkMode ? 1 : 0]?.href ||
    getTeamLogoUrl("wnba", awayAbbr);
  const homeLogoUri =
    homeComp.team?.logos?.[isDarkMode ? 1 : 0]?.href ||
    getTeamLogoUrl("wnba", homeAbbr);

  const homeWinsCount = Number(seriesSummary?.homeWins ?? 0);
  const awayWinsCount = Number(seriesSummary?.awayWins ?? 0);
  const total = homeWinsCount + awayWinsCount;
  const homeFlex = total > 0 ? homeWinsCount : 1;
  const awayFlex = total > 0 ? awayWinsCount : 1;

  return (
    <View style={[wnbaSeriesStyles.card, { backgroundColor: theme.surface }]}>
      <View
        style={[
          wnbaSeriesStyles.headerRow,
          { borderBottomColor: theme.border },
        ]}
      >
        <Text style={[wnbaSeriesStyles.headerTitle, { color: theme.text }]}>
          SEASON SERIES
        </Text>
        <TouchableOpacity
          style={[
            wnbaSeriesStyles.homeFilterBtn,
            {
              borderColor: homeColor,
              backgroundColor: homeOnly ? `${homeColor}1A` : theme.surface,
            },
          ]}
          onPress={onToggleHomeOnly}
          activeOpacity={0.8}
        >
          {homeLogoUri ? (
            <Image
              source={{ uri: homeLogoUri }}
              style={wnbaSeriesStyles.homeFilterLogo}
              contentFit="contain"
            />
          ) : (
            <View
              style={[
                wnbaSeriesStyles.homeFilterLogoFallback,
                { backgroundColor: theme.surfaceSecondary },
              ]}
            >
              <Text
                style={[
                  wnbaSeriesStyles.homeFilterLogoFallbackText,
                  { color: theme.textSecondary },
                ]}
              >
                {homeAbbr.charAt(0)}
              </Text>
            </View>
          )}
          <Text
            style={[
              wnbaSeriesStyles.homeFilterText,
              { color: homeOnly ? theme.text : theme.textSecondary },
            ]}
          >
            HOME
          </Text>
        </TouchableOpacity>
      </View>
      <View style={wnbaSeriesStyles.bodyRow}>
        <View
          style={[wnbaSeriesStyles.sideBlock, wnbaSeriesStyles.sideBlockLeft]}
        >
          {awayLogoUri ? (
            <Image
              source={{ uri: awayLogoUri }}
              style={wnbaSeriesStyles.logo}
              contentFit="contain"
            />
          ) : (
            <View
              style={[
                wnbaSeriesStyles.logoPlaceholder,
                { backgroundColor: theme.surfaceSecondary },
              ]}
            >
              <Text
                style={[
                  wnbaSeriesStyles.logoInitial,
                  { color: theme.textSecondary },
                ]}
              >
                {awayAbbr.charAt(0)}
              </Text>
            </View>
          )}
          <Text style={[wnbaSeriesStyles.winCount, { color: theme.text }]}>
            {awayWinsCount}
          </Text>
        </View>
        <View style={wnbaSeriesStyles.centerBlock}>
          <Text
            style={[wnbaSeriesStyles.vsText, { color: theme.textSecondary }]}
          >
            VS
          </Text>
        </View>
        <View
          style={[wnbaSeriesStyles.sideBlock, wnbaSeriesStyles.sideBlockRight]}
        >
          <Text style={[wnbaSeriesStyles.winCount, { color: theme.text }]}>
            {homeWinsCount}
          </Text>
          {homeLogoUri ? (
            <Image
              source={{ uri: homeLogoUri }}
              style={wnbaSeriesStyles.logo}
              contentFit="contain"
            />
          ) : (
            <View
              style={[
                wnbaSeriesStyles.logoPlaceholder,
                { backgroundColor: theme.surfaceSecondary },
              ]}
            >
              <Text
                style={[
                  wnbaSeriesStyles.logoInitial,
                  { color: theme.textSecondary },
                ]}
              >
                {homeAbbr.charAt(0)}
              </Text>
            </View>
          )}
        </View>
      </View>
      <View
        style={[
          wnbaSeriesStyles.summaryFooter,
          {
            borderTopColor: theme.surface,
            backgroundColor: theme.surfaceSecondary,
          },
        ]}
      >
        <View
          style={[
            wnbaSeriesStyles.summaryFooterFill,
            {
              flex: awayFlex,
              backgroundColor: awayColor,
              borderRightColor: theme.surface,
              borderRightWidth: 2.5,
            },
          ]}
        />
        <View
          style={[
            wnbaSeriesStyles.summaryFooterFill,
            { flex: homeFlex, backgroundColor: homeColor },
          ]}
        />
      </View>
    </View>
  );
};

// ─── WNBA Series Match Card (NHL-style with gradient) ───
const WNBASeriesMatchCard = ({
  event,
  details,
  theme,
  colors,
  navigation,
  homeColor,
  awayColor,
  getTeamLogoUrl,
  isDarkMode,
}) => {
  if (!event) return null;
  const homeTeam = event.competitors?.find((c) => c.homeAway === "home");
  const awayTeam = event.competitors?.find((c) => c.homeAway === "away");
  if (!homeTeam || !awayTeam) return null;

  const currentHomeId = details?.header?.competitions?.[0]?.competitors?.find(
    (c) => c.homeAway === "home",
  )?.team?.id;
  const currentAwayId = details?.header?.competitions?.[0]?.competitors?.find(
    (c) => c.homeAway === "away",
  )?.team?.id;

  const leftTeam = awayTeam;
  const rightTeam = homeTeam;
  const leftAbbr = leftTeam.team?.abbreviation || "AWY";
  const rightAbbr = rightTeam.team?.abbreviation || "HME";
  const leftName =
    leftTeam.team?.shortDisplayName || leftTeam.team?.displayName || leftAbbr;
  const rightName =
    rightTeam.team?.shortDisplayName ||
    rightTeam.team?.displayName ||
    rightAbbr;
  const leftLogoUri =
    leftTeam.team?.logos?.[isDarkMode ? 1 : 0]?.href ||
    getTeamLogoUrl("wnba", leftAbbr);
  const rightLogoUri =
    rightTeam.team?.logos?.[isDarkMode ? 1 : 0]?.href ||
    getTeamLogoUrl("wnba", rightAbbr);
  const leftScore = event.statusType?.completed ? leftTeam.score : null;
  const rightScore = event.statusType?.completed ? rightTeam.score : null;
  const hasScore = leftScore != null && rightScore != null;
  const leftWon = hasScore && Number(leftScore) > Number(rightScore);
  const rightWon = hasScore && Number(rightScore) > Number(leftScore);
  const live = event.status === "in" || event.status === "live";

  const startTime = event.date || "";
  const { time, ampm } = (() => {
    try {
      const d = new Date(startTime);
      const fmt = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      const parts = fmt.formatToParts(d);
      const h = parts.find((p) => p.type === "hour")?.value || "";
      const m = parts.find((p) => p.type === "minute")?.value || "00";
      const ap = parts.find((p) => p.type === "dayPeriod")?.value || "";
      return { time: `${h}:${m}`, ampm: ap };
    } catch {
      return { time: "--:--", ampm: "" };
    }
  })();

  const leftColor =
    awayTeam?.team?.id === currentAwayId ? awayColor : homeColor;
  const rightColor =
    homeTeam?.team?.id === currentHomeId ? homeColor : awayColor;

  const gradId = `wnba_series_${String(event.id ?? Math.random()).replace(/[^a-zA-Z0-9_]/g, "_")}`;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => {
        if (event.id)
          navigation?.navigate("GameDetails", {
            gameId: String(event.id),
            sport: "wnba",
          });
      }}
      disabled={!navigation || !event.id}
      style={[
        wnbaSeriesStyles.matchCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={wnbaSeriesStyles.matchCardTopRow}>
        <Text
          style={[
            wnbaSeriesStyles.matchCardTopText,
            { color: theme.textSecondary },
          ]}
          numberOfLines={1}
        >
          {new Date(startTime).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}{" "}
          · WNBA
        </Text>
      </View>
      <View
        style={[
          wnbaSeriesStyles.matchCardBody,
          { backgroundColor: theme.surfaceSecondary ?? theme.background },
        ]}
      >
        <Svg
          style={StyleSheet.absoluteFill}
          width="100%"
          height="100%"
          pointerEvents="none"
        >
          <Defs>
            <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={leftColor} stopOpacity="0.35" />
              <Stop offset="35%" stopColor={leftColor} stopOpacity="0" />
              <Stop offset="65%" stopColor={rightColor} stopOpacity="0" />
              <Stop offset="100%" stopColor={rightColor} stopOpacity="0.35" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${gradId})`} />
        </Svg>
        <View style={wnbaSeriesStyles.matchCardInner}>
          <View style={wnbaSeriesStyles.matchTeamSide}>
            {leftLogoUri ? (
              <Image
                source={{ uri: leftLogoUri }}
                style={[
                  wnbaSeriesStyles.matchTeamLogo,
                  { opacity: !hasScore ? 1 : leftWon ? 1 : 0.55 },
                ]}
                contentFit="contain"
              />
            ) : (
              <View
                style={[
                  wnbaSeriesStyles.matchTeamLogo,
                  wnbaSeriesStyles.logoFallback,
                  { backgroundColor: `${leftColor}40` },
                ]}
              >
                <Text
                  style={[
                    wnbaSeriesStyles.logoFallbackText,
                    { color: theme.text },
                  ]}
                >
                  {leftAbbr.charAt(0)}
                </Text>
              </View>
            )}
            <View style={wnbaSeriesStyles.matchTeamTextCol}>
              <Text
                style={[
                  wnbaSeriesStyles.matchTeamName,
                  {
                    color: theme.text,
                    opacity: !hasScore ? 1 : leftWon ? 1 : 0.55,
                    fontWeight: leftWon ? "700" : "500",
                  },
                ]}
                numberOfLines={2}
              >
                {leftName}
              </Text>
            </View>
          </View>
          <View style={wnbaSeriesStyles.matchScoreBlock}>
            {live && (
              <Text
                style={[
                  wnbaSeriesStyles.matchStatusText,
                  { color: theme.error, marginTop: -6, fontWeight: "700" },
                ]}
              >
                LIVE
              </Text>
            )}
            {hasScore ? (
              <View style={wnbaSeriesStyles.matchScoreRow}>
                <Text
                  style={[
                    wnbaSeriesStyles.matchScore,
                    {
                      color: live
                        ? theme.error
                        : leftWon
                          ? theme.text
                          : theme.textSecondary,
                      fontWeight: leftWon ? "800" : "500",
                      opacity: leftWon ? 1 : 0.55,
                    },
                  ]}
                >
                  {leftScore}
                </Text>
                <Text
                  style={[
                    wnbaSeriesStyles.matchScoreDash,
                    { color: live ? theme.error : theme.textTertiary },
                  ]}
                >
                  -
                </Text>
                <Text
                  style={[
                    wnbaSeriesStyles.matchScore,
                    {
                      color: live
                        ? theme.error
                        : rightWon
                          ? theme.text
                          : theme.textSecondary,
                      fontWeight: rightWon ? "800" : "500",
                      opacity: rightWon ? 1 : 0.55,
                    },
                  ]}
                >
                  {rightScore}
                </Text>
              </View>
            ) : (
              <>
                <Text
                  style={[
                    wnbaSeriesStyles.matchScore,
                    { color: theme.text, fontWeight: "800" },
                  ]}
                >
                  {time}
                </Text>
                <Text
                  style={[
                    wnbaSeriesStyles.matchTimeAmPm,
                    { color: theme.textSecondary },
                  ]}
                >
                  {ampm.toUpperCase()}
                </Text>
              </>
            )}
          </View>
          <View style={wnbaSeriesStyles.matchTeamSideAway}>
            <View
              style={[
                wnbaSeriesStyles.matchTeamTextCol,
                wnbaSeriesStyles.matchTeamTextColAway,
              ]}
            >
              <Text
                style={[
                  wnbaSeriesStyles.matchTeamName,
                  wnbaSeriesStyles.matchTeamNameAway,
                  {
                    color: theme.text,
                    fontWeight: rightWon ? "700" : "500",
                    opacity: !hasScore ? 1 : rightWon ? 1 : 0.55,
                  },
                ]}
                numberOfLines={2}
              >
                {rightName}
              </Text>
            </View>
            {rightLogoUri ? (
              <Image
                source={{ uri: rightLogoUri }}
                style={[
                  wnbaSeriesStyles.matchTeamLogo,
                  { opacity: !hasScore ? 1 : rightWon ? 1 : 0.55 },
                ]}
                contentFit="contain"
              />
            ) : (
              <View
                style={[
                  wnbaSeriesStyles.matchTeamLogo,
                  wnbaSeriesStyles.logoFallback,
                  { backgroundColor: `${rightColor}40` },
                ]}
              >
                <Text
                  style={[
                    wnbaSeriesStyles.logoFallbackText,
                    { color: theme.text },
                  ]}
                >
                  {rightAbbr.charAt(0)}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ─── Styles for NHL-style WNBA components ───
const wnbaStatsStyles = StyleSheet.create({
  linescoreCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    overflow: "hidden",
  },
  linescoreCell: {
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
  },
  linescoreTeamAbbr: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  linescorePeriodNum: { fontSize: 11, fontWeight: "600" },
  linescoreRunsText: { fontSize: 13, fontWeight: "700" },
  linescoreTotalsSection: { borderLeftWidth: 1, flexDirection: "column" },
  linescoreTotalsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
  },
  linescoreTotalHeader: { fontSize: 11, fontWeight: "700" },
  linescoreTotalVal: { fontSize: 13, fontWeight: "700" },
  card: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  body: { paddingHorizontal: 14, paddingVertical: 12, gap: 14 },
  statRowWrap: { gap: 6 },
  statValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statValueText: { fontSize: 14, fontWeight: "700" },
  statBarTrack: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    flexDirection: "row",
  },
  statBarFillLeft: {
    height: "100%",
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
  },
  statBarFillRight: {
    height: "100%",
    marginLeft: "auto",
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  statCategoryLabel: { textAlign: "center", fontSize: 11, fontWeight: "600" },
  emptyText: { textAlign: "center", fontSize: 12, fontWeight: "500" },
  leadersTeamBlock: { paddingHorizontal: 14, paddingVertical: 10 },
  leadersTeamHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  leadersTeamName: { fontSize: 14, fontWeight: "700" },
  leadersCategoryBlock: { marginBottom: 10 },
  leadersCategoryTitle: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 4,
    gap: 10,
  },
  leaderHeadshotWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "visible",
    borderWidth: 2,
    position: "relative",
  },
  leaderHeadshot: { width: "100%", height: "100%", borderRadius: 22 },
  leaderInitials: { fontSize: 14, fontWeight: "700" },
  leaderTeamBadge: {
    position: "absolute",
    left: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  leaderNameCol: { flex: 1, minWidth: 0 },
  leaderDisplayName: { fontSize: 13, fontWeight: "700" },
  leaderMeta: { fontSize: 11, marginTop: 1 },
  leaderValue: {
    fontSize: 18,
    fontWeight: "800",
    minWidth: 40,
    textAlign: "right",
  },
});

const wnbaSeriesStyles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  sideBlock: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  sideBlockLeft: { justifyContent: "flex-start" },
  sideBlockRight: { justifyContent: "flex-end" },
  logo: { width: 50, height: 50 },
  logoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  logoInitial: { fontSize: 11, fontWeight: "800" },
  winCount: { fontSize: 26, fontWeight: "800", lineHeight: 30 },
  centerBlock: { alignItems: "center", justifyContent: "center", minWidth: 76 },
  vsText: { fontSize: 18, fontWeight: "800", letterSpacing: 0.5 },
  summaryFooter: {
    height: 12.5,
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summaryFooterFill: { height: "100%" },
  homeFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  homeFilterLogo: { width: 20, height: 14 },
  homeFilterLogoFallback: {
    width: 20,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  homeFilterLogoFallbackText: { fontSize: 8, fontWeight: "800" },
  homeFilterText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  matchesWrap: { marginHorizontal: 12, marginTop: 10, gap: 10 },
  matchCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  matchCardTopRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  matchCardTopText: { fontSize: 10, fontWeight: "600", textAlign: "center" },
  matchCardBody: { overflow: "hidden" },
  matchCardInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
    gap: 10,
  },
  matchTeamSide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  matchTeamSideAway: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  matchTeamLogo: { width: 50, height: 50, marginHorizontal: -5 },
  logoFallback: {
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  logoFallbackText: { fontSize: 13, fontWeight: "700" },
  matchTeamName: { fontSize: 13, fontWeight: "500", flexWrap: "wrap" },
  matchTeamTextCol: { flex: 1, minWidth: 0 },
  matchTeamTextColAway: { alignItems: "flex-end" },
  matchTeamNameAway: { textAlign: "right" },
  matchScoreBlock: { alignItems: "center", paddingHorizontal: 8, minWidth: 80 },
  matchScoreRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  matchScore: { fontSize: 22, minWidth: 24, textAlign: "center" },
  matchScoreDash: { fontSize: 18 },
  matchStatusText: { fontSize: 10, marginTop: 4 },
  matchTimeAmPm: { fontSize: 10, fontWeight: "600", marginTop: 2 },
  emptyText: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "500",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  showMoreBtn: {
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  showMoreText: { fontSize: 12, fontWeight: "700" },
});

const WNBAGameDetailsScreen = ({ route }) => {
  // Live tracker state & resolver (WNBA)
  const { width } = Dimensions.get("window");
  const [liveTrackerVisible, setLiveTrackerVisible] = useState(false);
  const [liveTrackerUuid, setLiveTrackerUuid] = useState(null);
  // live tracker resolver effect is attached after `details` is declared
  const { gameId, summerLeague } = route.params || {};
  const { theme, colors, getTeamLogoUrl, isDarkMode, currentColorPalette } =
    useTheme();
  const { isFavorite, toggleFavorite } = useFavorites();
  const navigation = useNavigation();
  const stickyHeaderOpacity = useRef(new Animated.Value(0)).current;
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState(null);

  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerHeight, setHeaderHeight] = useState(0);

  // Calculate sticky thresholds based on header height
  const stickyThreshold = headerHeight > 0 ? headerHeight - 30 : 150;
  const stickyOpacity = scrollY.interpolate({
    inputRange: [stickyThreshold, stickyThreshold + 40],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const stickyMiniHeight = scrollY.interpolate({
    inputRange: [stickyThreshold, stickyThreshold + 40],
    outputRange: [0, 54],
    extrapolate: "clamp",
  });

  useEffect(() => {
    let cancelled = false;
    const resolveTracker = async () => {
      // Prefer explicit id passed via route params
      const provided = route?.params?.liveTrackerMatchId;
      if (provided) {
        setLiveTrackerUuid(provided);
        return;
      }

      // Prefer a diary URL passed from the scoreboard; fallback to basketball diary
      const diaryUrl =
        route?.params?.liveTrackerDiaryUrl ||
        LiveTrackerService.buildDiaryUrl("basketball");

      // Derive team names from details
      const competition =
        details?.header?.competitions?.[0] ||
        details?.competitions?.[0] ||
        details?.game ||
        null;

      const homeName =
        details?.homeCompetitor?.team?.displayName ||
        competition?.competitors?.find((c) => c.homeAway === "home")?.team
          ?.displayName ||
        "";
      const awayName =
        details?.awayCompetitor?.team?.displayName ||
        competition?.competitors?.find((c) => c.homeAway === "away")?.team
          ?.displayName ||
        "";

      if (!diaryUrl || !homeName || !awayName) return;

      try {
        await LiveTrackerService.initDiary(diaryUrl);
        const id = await LiveTrackerService.findMatchIdByTeams(
          homeName,
          awayName,
          "basketball",
        );
        if (!cancelled && id) setLiveTrackerUuid(id);
      } catch (e) {
        // ignore
      }
    };

    resolveTracker();
    return () => {
      cancelled = true;
    };
  }, [
    details,
    route?.params?.liveTrackerMatchId,
    route?.params?.liveTrackerDiaryUrl,
  ]);
  const [activeTab, setActiveTab] = useState("stats");

  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [shareCardPlayer, setShareCardPlayer] = useState(null);
  const [shareCardHeadshotError, setShareCardHeadshotError] = useState(false);
  const shareCardRef = useRef(null);
  const [sharePlayCard, setSharePlayCard] = useState(null);
  const sharePlayCardRef = useRef(null);
  const [selectedModalPlayer, setSelectedModalPlayer] = useState(null);
  const [seriesHomeOnly, setSeriesHomeOnly] = useState(false);
  const [seriesVisibleCount, setSeriesVisibleCount] = useState(5);

  useEffect(() => {
    // Reset fallback state whenever a different player card is opened.
    setShareCardHeadshotError(false);
  }, [shareCardPlayer?.player?.athlete?.id]);

  // Lightweight plays state (kept to avoid runtime errors from residual UI references)
  const [playsData, setPlaysData] = useState(null);
  const [awayScorers, setAwayScorers] = useState([]);
  const [homeScorers, setHomeScorers] = useState([]);
  const [openPlays, setOpenPlays] = useState(new Set());
  const lastPlaysHash = useRef(null);

  // Lazy loading state for plays
  const [visiblePlaysCount, setVisiblePlaysCount] = useState(30);
  const [isLoadingMorePlays, setIsLoadingMorePlays] = useState(false);

  // Game presence tracking
  const { viewerData, isJoined } = useGamePresence(gameId);

  // Stream-related state variables
  const [streamModalVisible, setStreamModalVisible] = useState(false);
  const [currentStreamType, setCurrentStreamType] = useState("alpha");
  const [availableStreams, setAvailableStreams] = useState({});
  const [streamUrl, setStreamUrl] = useState("");
  const [isStreamLoading, setIsStreamLoading] = useState(true);
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const isLoggedIn = useIsLoggedIn();

  // Streaming access check
  const { isUnlocked: isStreamingUnlocked } = useStreamingAccess();

  // Function to get the current app icon image source
  const getCurrentAppIconSource = () => {
    const themeType = isDarkMode ? "dark" : "light";
    const palette = currentColorPalette || "red"; // Default to red if not available
    const iconMap = {
      dark_blue: require("../../../assets/dark/blue.png"),
      dark_red: require("../../../assets/dark/red.png"),
      dark_green: require("../../../assets/dark/green.png"),
      dark_purple: require("../../../assets/dark/purple.png"),
      dark_gold: require("../../../assets/dark/gold.png"),
      light_blue: require("../../../assets/light/blue.png"),
      light_red: require("../../../assets/light/red.png"),
      light_green: require("../../../assets/light/green.png"),
      light_purple: require("../../../assets/light/purple.png"),
      light_gold: require("../../../assets/light/gold.png"),
    };

    const iconKey = `${themeType}_${palette}`;
    return iconMap[iconKey] || iconMap["dark_red"]; // fallback to default
  };

  // Memoized team IDs for performance - prevents repeated calculations
  const awayTeamId = useMemo(() => {
    const away =
      details?.boxscore?.teams?.[0] ||
      details?.header?.competitions?.[0]?.competitors?.find(
        (c) => c.homeAway === "away",
      );
    return away?.id || away?.team?.id || null;
  }, [details]);

  // Collect all players for compare feature
  const allModalPlayers = useMemo(() => {
    if (!details?.boxscore?.players) return [];
    const result = [];
    const playersBox = details.boxscore.players;
    for (const teamBox of playersBox) {
      if (!teamBox?.statistics) continue;
      for (const group of teamBox.statistics) {
        if (!Array.isArray(group?.athletes)) continue;
        for (const athlete of group.athletes) {
          const meta = findPlayerStatsMeta?.(athlete) || {};
          result.push({
            ...athlete,
            meta,
            position: group.name,
          });
        }
      }
    }
    return result;
  }, [details, details?.boxscore?.players, findPlayerStatsMeta]);

  const openWnbaPlayerModal = useCallback((player) => {
    setSelectedModalPlayer(player);
  }, []);

  // Helper to color plusMinus stat values: negative => theme.error, positive => theme.success, zero/invalid => theme.text
  const getStatTextColor = (key, rawValue) => {
    if (key !== "plusMinus") return theme.text;
    try {
      let num = null;
      if (rawValue == null) num = 0;
      else if (typeof rawValue === "object")
        num = parseFloat(
          rawValue.displayValue ?? rawValue.value ?? String(rawValue),
        );
      else num = parseFloat(String(rawValue).replace(/[^0-9.-]/g, ""));
      if (isNaN(num) || num === 0) return theme.text;
      return num < 0 ? theme.error : theme.success;
    } catch (e) {
      return theme.text;
    }
  };

  const homeTeamId = useMemo(() => {
    const home =
      details?.boxscore?.teams?.[1] ||
      details?.header?.competitions?.[0]?.competitors?.find(
        (c) => c.homeAway === "home",
      );
    return home?.id || home?.team?.id || null;
  }, [details]);

  // Series computation (NHL-style)
  const hasSeriesData = useMemo(() => {
    return (
      Array.isArray(details?.seasonseries) && details.seasonseries.length > 0
    );
  }, [details?.seasonseries]);

  const seriesEvents = useMemo(() => {
    if (!hasSeriesData) return [];
    const allEvents = [];
    (details.seasonseries || []).forEach((series) => {
      (series.events || []).forEach((event) => {
        if (event) allEvents.push(event);
      });
    });
    const currentHomeId = String(homeTeamId || "");
    const currentAwayId = String(awayTeamId || "");
    if (!currentHomeId || !currentAwayId) return [];
    return allEvents
      .filter((event) => {
        const eventHomeId = event.competitors?.find(
          (c) => c.homeAway === "home",
        )?.team?.id;
        const eventAwayId = event.competitors?.find(
          (c) => c.homeAway === "away",
        )?.team?.id;
        const ids = [String(eventHomeId || ""), String(eventAwayId || "")];
        if (!ids.includes(currentHomeId) || !ids.includes(currentAwayId))
          return false;
        if (seriesHomeOnly && String(eventHomeId) !== currentHomeId)
          return false;
        return true;
      })
      .sort((a, b) => {
        const aTs = new Date(a?.date || 0).getTime();
        const bTs = new Date(b?.date || 0).getTime();
        return (Number.isNaN(bTs) ? 0 : bTs) - (Number.isNaN(aTs) ? 0 : aTs);
      });
  }, [
    hasSeriesData,
    details?.seasonseries,
    homeTeamId,
    awayTeamId,
    seriesHomeOnly,
  ]);

  const seriesSummary = useMemo(() => {
    if (!seriesEvents.length) return { homeWins: 0, awayWins: 0 };
    const currentHomeId = String(homeTeamId || "");
    let homeWinsCount = 0;
    let awayWinsCount = 0;
    seriesEvents.forEach((event) => {
      const homeComp = event.competitors?.find((c) => c.homeAway === "home");
      const awayComp = event.competitors?.find((c) => c.homeAway === "away");
      const hScore = Number(homeComp?.score);
      const aScore = Number(awayComp?.score);
      if (
        !Number.isFinite(hScore) ||
        !Number.isFinite(aScore) ||
        hScore === aScore
      )
        return;
      const winnerId =
        hScore > aScore ? homeComp?.team?.id : awayComp?.team?.id;
      if (String(winnerId) === currentHomeId) homeWinsCount++;
      else awayWinsCount++;
    });
    return { homeWins: homeWinsCount, awayWins: awayWinsCount };
  }, [seriesEvents, homeTeamId]);

  // Toggle function for plays - optimized with auto-open plays section
  const togglePlay = useCallback(
    (playKey) => {
      // Auto-switch to plays tab if not already there
      if (activeTab !== "plays") {
        setActiveTab("plays");
      }

      setOpenPlays((prevOpen) => {
        const newOpen = new Set(prevOpen);
        if (newOpen.has(playKey)) {
          newOpen.delete(playKey);
        } else {
          newOpen.add(playKey);
        }
        return newOpen;
      });
    },
    [activeTab],
  );

  // Function to load more plays
  const loadMorePlays = useCallback(() => {
    if (isLoadingMorePlays || !playsData) return;

    console.log(
      `[PLAYS DEBUG] Loading more plays. Current: ${visiblePlaysCount}, Total: ${playsData.length}`,
    );
    setIsLoadingMorePlays(true);

    // Simulate a small delay to prevent rapid loading
    setTimeout(() => {
      setVisiblePlaysCount((prev) => Math.min(prev + 30, playsData.length));
      setIsLoadingMorePlays(false);
      console.log(
        `[PLAYS DEBUG] Loaded more plays. New count: ${Math.min(
          visiblePlaysCount + 30,
          playsData.length,
        )}`,
      );
    }, 100);
  }, [isLoadingMorePlays, playsData, visiblePlaysCount]);

  // Reset visible plays count when switching to plays tab
  const resetPlaysCount = useCallback(() => {
    setVisiblePlaysCount(30);
  }, []);

  // Stream API functions (adapted from NFL)
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

      const response = await fetch(`${STREAM_API_BASE}/matches/basketball`);
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      const allMatches = await response.json();
      console.log(`Found ${allMatches.length} total live matches`);

      // Filter matches by basketball / wnba
      const matches = allMatches.filter((match) => {
        const matchSport = match.sport || match.category;
        return (
          matchSport === "basketball" ||
          matchSport === "wnba" ||
          (match.title &&
            (match.title.toLowerCase().includes("wnba") ||
              match.title.toLowerCase().includes("basketball")))
        );
      });
      console.log(`Filtered to ${matches.length} basketball matches`);

      liveMatchesCache = matches;
      cacheTimestamp = now;

      return matches;
    } catch (error) {
      console.error("Error fetching live matches:", error);
      return [];
    }
  };

  const fetchStreamsForSource = async (source, sourceId) => {
    try {
      const response = await fetch(
        `${STREAM_API_BASE}/stream/${source}/${sourceId}`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch streams: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error fetching streams for ${source}:`, error);
      return [];
    }
  };

  // Team name normalization for WNBA
  const normalizeWNBATeamName = (teamName) => {
    if (!teamName) return "";

    const wnbaMappings = {};

    if (wnbaMappings[teamName]) return wnbaMappings[teamName];

    return teamName
      .toLowerCase()
      .replace(/á/g, "a")
      .replace(/é/g, "e")
      .replace(/í/g, "i")
      .replace(/ó/g, "o")
      .replace(/ú/g, "u")
      .replace(/ü/g, "u")
      .replace(/ñ/g, "n")
      .replace(/ç/g, "c")
      .replace(/ß/g, "ss")
      .replace(/ë/g, "e")
      .replace(/ï/g, "i")
      .replace(/ö/g, "o")
      .replace(/ä/g, "a")
      .replace(/å/g, "a")
      .replace(/ø/g, "o")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const findWNBAMatchStreams = async (homeTeamName, awayTeamName) => {
    try {
      console.log(
        `Finding WNBA streams for: ${awayTeamName} vs ${homeTeamName}`,
      );

      const liveMatches = await fetchLiveMatches();
      if (
        !liveMatches ||
        !Array.isArray(liveMatches) ||
        liveMatches.length === 0
      ) {
        console.log("No live WNBA matches data available");
        return {};
      }

      const homeNormalized = normalizeWNBATeamName(homeTeamName).toLowerCase();
      const awayNormalized = normalizeWNBATeamName(awayTeamName).toLowerCase();

      console.log(
        `Normalized WNBA team names: {homeNormalized: '${homeNormalized}', awayNormalized: '${awayNormalized}'}`,
      );

      let bestMatch = null;
      let bestScore = 0;

      for (let i = 0; i < Math.min(liveMatches.length, 200); i++) {
        const match = liveMatches[i];
        if (!match.sources || match.sources.length === 0) continue;

        const matchTitle = (match.title || "").toLowerCase();
        let totalScore = 0;

        const strategies = [
          () => {
            let score = 0;
            if (
              matchTitle.includes(homeNormalized) &&
              matchTitle.includes(awayNormalized)
            ) {
              score += 1.0;
            } else {
              const homeParts = homeNormalized
                .split("-")
                .filter((w) => w.length > 2);
              const awayParts = awayNormalized
                .split("-")
                .filter((w) => w.length > 2);
              let homeMatches = 0;
              let awayMatches = 0;
              homeParts.forEach((part) => {
                if (matchTitle.includes(part)) homeMatches++;
              });
              awayParts.forEach((part) => {
                if (matchTitle.includes(part)) awayMatches++;
              });
              if (homeMatches >= 1 && awayMatches >= 1) score += 0.8;
            }
            return score;
          },
          () => {
            let score = 0;
            if (match.teams) {
              const homeTeamMatch = (
                match.teams.home?.name ||
                match.teams.home?.title ||
                ""
              ).toLowerCase();
              const awayTeamMatch = (
                match.teams.away?.name ||
                match.teams.away?.title ||
                ""
              ).toLowerCase();
              if (homeTeamMatch && awayTeamMatch) {
                if (
                  homeTeamMatch.includes(homeNormalized.split("-")[0]) &&
                  awayTeamMatch.includes(awayNormalized.split("-")[0])
                ) {
                  score += 0.9;
                }
              }
            }
            return score;
          },
        ];

        strategies.forEach((s) => {
          totalScore += s();
        });

        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestMatch = match;
          if (bestScore >= 1.0) break;
        }
      }

      if (!bestMatch || bestScore < 0.25) {
        console.log(
          `No good matching WNBA live match found (best score: ${bestScore})`,
        );
        return {};
      }

      console.log(
        `Found matching WNBA match: ${
          bestMatch.title || bestMatch.id
        } (score: ${bestScore})`,
      );

      const allStreams = {};
      for (const source of bestMatch.sources) {
        try {
          const sourceStreams = await fetchStreamsForSource(
            source.source,
            source.id,
          );
          if (sourceStreams && sourceStreams.length > 0) {
            const firstStream = sourceStreams[0];
            const sourceKey = source.source;
            allStreams[sourceKey] = {
              url:
                firstStream.embedUrl ||
                firstStream.url ||
                firstStream.embed_url ||
                firstStream.embed,
              embedUrl:
                firstStream.embedUrl ||
                firstStream.url ||
                firstStream.embed_url ||
                firstStream.embed,
              source: source.source,
              title: `${
                source.source.charAt(0).toUpperCase() + source.source.slice(1)
              } Stream`,
            };
            console.log(
              `Added WNBA stream for ${source.source}:`,
              allStreams[sourceKey],
            );
          }
        } catch (error) {
          console.error(
            `Error fetching WNBA streams for ${source.source}:`,
            error,
          );
        }
      }

      console.log("Final WNBA streams found:", allStreams);
      return allStreams;
    } catch (error) {
      console.error("Error in findWNBAMatchStreams:", error);
      return {};
    }
  };

  const generateWNBAStreamUrl = (
    awayTeamName,
    homeTeamName,
    streamType = "alpha",
  ) => {
    const normalizedAway = normalizeWNBATeamName(awayTeamName);
    const normalizedHome = normalizeWNBATeamName(homeTeamName);
    const streamUrls = {
      alpha: `https://weakstreams.com/wnba-live-streams/${normalizedAway}-vs-${normalizedHome}-live-stream`,
      bravo: `https://sportsurge.club/wnba/${normalizedAway}-vs-${normalizedHome}`,
      charlie: `https://sportshd.me/wnba/${normalizedAway}-${normalizedHome}`,
    };
    return streamUrls[streamType] || streamUrls.alpha;
  };

  // Stream modal functions
  const openStreamModal = async () => {
    try {
      console.log("openStreamModal: invoked");

      // Check if streaming is unlocked
      if (!isStreamingUnlocked) {
        Alert.alert(
          "Streaming Locked",
          "Please enter the streaming code in Settings to access live streams.",
          [{ text: "OK" }],
        );
        return;
      }

      const competition =
        details?.header?.competitions?.[0] ||
        details?.competitions?.[0] ||
        details?.game?.competitions?.[0];
      if (!competition) {
        console.warn("openStreamModal: competition not found on details");
        return;
      }

      const competitors = competition?.competitors || competition?.teams || [];

      let homeComp =
        competitors.find(
          (c) => c.homeAway === "home" || c.side === "home" || c.isHome,
        ) || null;
      let awayComp =
        competitors.find(
          (c) =>
            c.homeAway === "away" ||
            c.side === "away" ||
            (!c.homeAway && !c.side && !c.isHome),
        ) || null;

      if (!homeComp && competitors.length === 2) {
        homeComp =
          competitors[0]?.homeAway === "home" ? competitors[0] : competitors[1];
      }
      if (!awayComp && competitors.length === 2) {
        awayComp =
          competitors[0] === homeComp ? competitors[1] : competitors[0];
      }

      const homeTeam =
        homeComp?.team ||
        homeComp?.team?.team ||
        homeComp?.home ||
        homeComp?.teamData ||
        null;
      const awayTeam =
        awayComp?.team ||
        awayComp?.team?.team ||
        awayComp?.away ||
        awayComp?.teamData ||
        null;

      if (!awayTeam || !homeTeam) {
        console.warn("openStreamModal: team info missing after fallbacks");
        return;
      }

      // Show modal immediately so user sees something while we fetch
      setAvailableStreams({});
      setStreamUrl("");
      setCurrentStreamType("alpha");
      setStreamModalVisible(true);
      setIsStreamLoading(true);

      const homeName =
        homeTeam.displayName ||
        homeTeam.name ||
        homeTeam.fullName ||
        homeTeam.abbreviation ||
        "";
      const awayName =
        awayTeam.displayName ||
        awayTeam.name ||
        awayTeam.fullName ||
        awayTeam.abbreviation ||
        "";

      const streams = await findWNBAMatchStreams(homeName, awayName);
      console.log("openStreamModal: streams result =", streams);
      setAvailableStreams(streams || {});

      let initialUrl = "";
      let initialStreamType = "";

      const streamKeys = Object.keys(streams || {});
      if (streamKeys.length > 0) {
        const preferredOrder = ["admin", "alpha", "bravo", "charlie", "delta"];
        initialStreamType =
          preferredOrder.find((type) => streamKeys.includes(type)) ||
          streamKeys[0];

        const streamData = streams[initialStreamType];
        initialUrl = streamData?.embedUrl || streamData?.url || streamData;
        setCurrentStreamType(initialStreamType);
      } else {
        initialStreamType = "alpha";
        initialUrl = generateWNBAStreamUrl(
          awayName,
          homeName,
          initialStreamType,
        );
        setCurrentStreamType(initialStreamType);
      }

      console.log(
        "openStreamModal: initialStreamType =",
        initialStreamType,
        "initialUrl =",
        initialUrl,
      );
      setStreamUrl(initialUrl);
      setIsStreamLoading(false);
    } catch (err) {
      console.error("openStreamModal: caught error", err);
      setIsStreamLoading(false);
    }
  };

  const switchStream = (streamType) => {
    setCurrentStreamType(streamType);
    setIsStreamLoading(true);
    let newUrl = "";
    if (availableStreams[streamType]) {
      const streamData = availableStreams[streamType];
      newUrl = streamData.embedUrl || streamData.url || streamData;
    } else {
      const awayTeam = details?.competitions?.[0]?.competitors?.find(
        (comp) => !comp.homeAway || comp.homeAway === "away",
      )?.team;
      const homeTeam = details?.competitions?.[0]?.competitors?.find(
        (comp) => comp.homeAway === "home",
      )?.team;
      newUrl = generateWNBAStreamUrl(
        awayTeam?.displayName || awayTeam?.name,
        homeTeam?.displayName || homeTeam?.name,
        streamType,
      );
    }
    setStreamUrl(newUrl);
    setTimeout(() => setIsStreamLoading(false), 1000);
  };

  const closeStreamModal = () => {
    setStreamModalVisible(false);
    setStreamUrl("");
    setIsStreamLoading(true);
  };

  // Fetch immediately when stream modal closes to resume updates
  useEffect(() => {
    if (!streamModalVisible && gameId && details) {
      // Only fetch if we were previously showing the modal (not on initial load)
      const wasModalOpen = streamModalVisible === false;
      if (wasModalOpen) {
        console.log("Stream modal closed, fetching fresh WNBA game data");
        WNBAService.getGameDetails(gameId, summerLeague)
          .then(setDetails)
          .catch((e) =>
            console.error(
              "Failed to fetch WNBA game details after stream modal close",
              e,
            ),
          );
      }
    }
  }, [streamModalVisible, gameId]);

  // helper: convert hex to rgba for subtle tinting (hoisted so render paths can use it)

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await WNBAService.getGameDetails(gameId, summerLeague);
        if (mounted) setDetails(data);
      } catch (e) {
        console.error("Failed to load WNBA game details", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [gameId]);

  // Sticky header scroll handler (replicates NFL approach)
  const handleScroll = (event) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    const fadeStartY = 100;
    const fadeEndY = 150;
    let opacity = 0;
    if (scrollY >= fadeStartY) {
      if (scrollY >= fadeEndY) opacity = 1;
      else opacity = (scrollY - fadeStartY) / (fadeEndY - fadeStartY);
    }
    const shouldShow = opacity > 0;
    if (shouldShow !== showStickyHeader) setShowStickyHeader(shouldShow);
    Animated.timing(stickyHeaderOpacity, {
      toValue: opacity,
      duration: 0,
      useNativeDriver: true,
    }).start();
  };

  // Auto-refresh game details every 4 seconds for live updates (stop when game is completed)
  useEffect(() => {
    if (!gameId || !details) return;

    // Check if game is completed to stop auto-refresh
    const competition =
      details?.header?.competitions?.[0] ||
      details?.boxscore?.game ||
      details?.game ||
      null;
    const statusType =
      competition?.status?.type || details?.game?.status?.type || {};
    const isGameCompleted = !!(
      statusType?.state === "post" ||
      (statusType?.description || "").toLowerCase().includes("final") ||
      statusType?.completed
    );

    // Don't auto-refresh if game is completed
    if (isGameCompleted) {
      console.log("Game completed, stopping auto-refresh");
      return;
    }

    const intervalId = setInterval(async () => {
      // Skip update if stream modal is open
      if (streamModalVisible) {
        console.log("Stream modal open, skipping WNBA game update");
        return;
      }

      try {
        const data = await WNBAService.getGameDetails(gameId, summerLeague);
        setDetails(data);

        // Check if game just completed and stop future refreshes
        const newCompetition =
          data?.header?.competitions?.[0] ||
          data?.boxscore?.game ||
          data?.game ||
          null;
        const newStatusType =
          newCompetition?.status?.type || data?.game?.status?.type || {};
        const newIsGameCompleted = !!(
          newStatusType?.state === "post" ||
          (newStatusType?.description || "").toLowerCase().includes("final") ||
          newStatusType?.completed
        );

        if (newIsGameCompleted) {
          console.log("Game just completed, stopping auto-refresh");
          clearInterval(intervalId);
        }
      } catch (e) {
        console.error("Failed to refresh WNBA game details", e);
        // Don't show loading or reset details on refresh errors - keep current data
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [gameId, details, streamModalVisible]);

  // Lightweight plays processing for WNBA - simplified version without heavy computation
  useEffect(() => {
    if (!details) {
      setPlaysData(null);
      setAwayScorers([]);
      setHomeScorers([]);
      return;
    }

    // Derive away/home teams inside the useEffect to avoid dependency issues
    const competitionObj =
      details?.header?.competitions?.[0] ||
      details?.game?.competitions?.[0] ||
      details?.competition ||
      null;
    let away = null;
    let home = null;

    if (competitionObj && Array.isArray(competitionObj.competitors)) {
      const comps = competitionObj.competitors;
      away = comps.find((c) => c.homeAway === "away") || comps[0] || null;
      home = comps.find((c) => c.homeAway === "home") || comps[1] || null;
    } else {
      const teams = details?.boxscore?.teams
        ? Object.values(details.boxscore.teams)
        : [];
      away = teams.find((t) => t.team?.homeAway === "away") || teams[0] || null;
      home = teams.find((t) => t.team?.homeAway === "home") || teams[1] || null;
    }

    // Get raw plays data
    const rawPlaysSource =
      details?.plays || details?.boxscore?.playByPlay || [];
    let playsArray = [];
    if (Array.isArray(rawPlaysSource)) {
      playsArray = rawPlaysSource.slice();
    } else if (rawPlaysSource?.items && Array.isArray(rawPlaysSource.items)) {
      playsArray = rawPlaysSource.items.slice();
    }

    if (playsArray.length === 0) {
      setPlaysData([]);
      setAwayScorers([]);
      setHomeScorers([]);
      return;
    }

    // Simple processing - just normalize basic play data without heavy computation
    const processedPlays = playsArray.map((play, index) => {
      const playText =
        play?.text || play?.description || play?.displayText || "";
      const period = play?.period?.displayValue || play?.period || "";
      const clock =
        play?.clock?.displayValue || play?.clock || play?.time || "";
      const isScoring = !!play?.scoringPlay;
      const pointsAttempted = play?.pointsAttempted || 0;
      const scoreValue = play?.scoreValue;
      const playTeamId = play?.team?.id;
      const scorerId =
        play?.participants && play.participants.length > 0
          ? play.participants[0]?.athlete?.id || null
          : null;

      // Determine team color and border based on team.id
      let borderColor = "transparent";
      let borderWidth = 0;
      let playTeamColor = null;

      if (playTeamId) {
        // Get smart colors that avoid similarity
        const smartColors = getSmartTeamColors(home, away, colors);

        if (away?.team?.id === playTeamId) {
          playTeamColor = smartColors.awayColor;
          borderColor = playTeamColor;
          borderWidth = 4;
        } else if (home?.team?.id === playTeamId) {
          playTeamColor = smartColors.homeColor;
          borderColor = playTeamColor;
          borderWidth = 4;
        }
      }

      return {
        id: play?.id || index,
        playText,
        period,
        clock,
        awayScore: play?.awayScore || 0,
        homeScore: play?.homeScore || 0,
        isScoring,
        pointsAttempted,
        scoreValue,
        textColor: theme.text,
        borderLeftWidth: borderWidth,
        borderLeftColor: borderColor,
        playTeamColor,
        awayLogoUri: getTeamLogoUrl(
          "wnba",
          away?.team?.abbreviation || away?.abbreviation,
        ),
        homeLogoUri: getTeamLogoUrl(
          "wnba",
          home?.team?.abbreviation || home?.abbreviation,
        ),
        awayAbbreviation: away?.team?.abbreviation || away?.abbreviation,
        homeAbbreviation: home?.team?.abbreviation || home?.abbreviation,
        // Add coordinate data for shot charts
        coordX: play?.coordinate?.x,
        coordY: play?.coordinate?.y,
        playTeamId: playTeamId,
        scorerId,
      };
    });

    // Sort plays by sequence/time
    processedPlays.sort((a, b) => {
      const aSeq = parseInt(a?.id || "0", 10) || 0;
      const bSeq = parseInt(b?.id || "0", 10) || 0;
      return bSeq - aSeq; // Most recent first
    });

    setPlaysData(processedPlays);

    // Simple scorer extraction for basketball
    const scoringPlays = playsArray.filter((play) => play?.scoringPlay);
    const awayScorers = [];
    const homeScorers = [];

    scoringPlays.forEach((play) => {
      const playText = play?.text || play?.description || "";
      const period = play?.period?.displayValue || play?.period || "";
      const clock = play?.clock?.displayValue || play?.clock || "";

      if (playText) {
        const scorerInfo = `${playText} (${period} - ${clock})`;
        // Simple team detection based on context - this could be improved
        if (
          playText.toLowerCase().includes("away") ||
          playText.includes(away?.team?.abbreviation || "")
        ) {
          awayScorers.push(scorerInfo);
        } else if (
          playText.toLowerCase().includes("home") ||
          playText.includes(home?.team?.abbreviation || "")
        ) {
          homeScorers.push(scorerInfo);
        }
      }
    });

    setAwayScorers(awayScorers);
    setHomeScorers(homeScorers);
  }, [details, theme.text, colors.primary, getTeamLogoUrl]);

  if (loading)
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );

  if (!details)
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text }}>No details available</Text>
      </View>
    );

  // Prefer the header competition (soccer-style canonical) first, then fall back to other shapes
  const competition =
    details?.header?.competitions?.[0] ||
    details?.boxscore?.game ||
    details?.game ||
    null;
  const statusDesc =
    competition?.status?.type?.description ||
    details?.game?.status?.type?.description ||
    details?.status?.type?.description ||
    "";
  const gameDate =
    competition?.date || details?.game?.date || details?.date || "";

  // Prefer competition competitors (header/competition) if available, otherwise fall back to boxscore structure
  const competitionObj =
    details?.header?.competitions?.[0] ||
    details?.game?.competitions?.[0] ||
    details?.competition ||
    null;
  let away = null;
  let home = null;

  if (competitionObj && Array.isArray(competitionObj.competitors)) {
    const comps = competitionObj.competitors;
    away = comps.find((c) => c.homeAway === "away") || comps[0] || null;
    home = comps.find((c) => c.homeAway === "home") || comps[1] || null;
  } else {
    const teams = details?.boxscore?.teams
      ? Object.values(details.boxscore.teams)
      : [];
    away = teams.find((t) => t.team?.homeAway === "away") || teams[0] || null;
    home = teams.find((t) => t.team?.homeAway === "home") || teams[1] || null;
  }

  // Debug logs removed - ready for visual verification

  // Determine winner/loser so we can apply "loser" styling to name/logo/score
  const awayScoreNum =
    parseInt(away?.score ?? away?.team?.score ?? "0", 10) || 0;
  const homeScoreNum =
    parseInt(home?.score ?? home?.team?.score ?? "0", 10) || 0;
  const statusType =
    competition?.status?.type || details?.game?.status?.type || {};
  const isGameFinal = !!(
    statusType?.state === "post" ||
    (statusType?.description || "").toLowerCase().includes("final") ||
    statusType?.completed
  );

  let homeIsWinner = false;
  let awayIsWinner = false;
  let isDraw = false;
  if (isGameFinal) {
    if (homeScoreNum > awayScoreNum) homeIsWinner = true;
    else if (awayScoreNum > homeScoreNum) awayIsWinner = true;
    else isDraw = true;
  }
  const homeIsLoser = isGameFinal && !isDraw && !homeIsWinner;
  const awayIsLoser = isGameFinal && !isDraw && !awayIsWinner;

  // helper: convert hex to rgba for subtle tinting (hoisted so render path can use it)
  const hexToRgba = (hex, alpha = 0.12) => {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    const h = hex.replace("#", "");
    const bigint = parseInt(
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h,
      16,
    );
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Get WNBA game status like soccer's getMatchStatus
  const getGameStatus = () => {
    if (!details)
      return {
        text: "FT",
        detail: "Full Time",
        isLive: false,
        isPre: false,
        isPost: true,
      };

    const status =
      competition?.status || details?.game?.status || details?.status;
    const state = status?.type?.state;
    const clock = status?.clock || status?.displayClock || "0:00";
    const period = status?.period || 1;
    const clockFormat = clock === "0.0" ? "End" : clock;
    const description = status?.type?.description || "";

    if (state === "pre") {
      // Game not started - show date and time
      const date = new Date(gameDate || Date.now());
      const timeText = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const today = new Date();
      const isToday = date.toDateString() === today.toDateString();

      return {
        text: description || timeText,
        detail: isToday
          ? "Today"
          : date.toLocaleDateString([], { month: "short", day: "numeric" }),
        isLive: false,
        isPre: true,
        isPost: false,
      };
    } else if (state === "in") {
      // Game in progress - show period and clock
      const statusDesc = status?.type?.description || "";

      // Check for intermission
      if (statusDesc.toLowerCase().includes("halftime")) {
        return {
          text: "HALF",
          detail: `${statusDesc}`,
          isLive: true,
          isPre: false,
          isPost: false,
        };
      }

      // Regular play - show period
      let periodText = "";
      if (period === 1) periodText = "1st";
      else if (period === 2) periodText = "2nd";
      else if (period === 3) periodText = "3rd";
      else if (period === 4) periodText = "4th";
      else if (period > 4) periodText = "OT";

      return {
        text: clockFormat || "0:00",
        detail: `${periodText} Quarter`,
        isLive: true,
        isPre: false,
        isPost: false,
      };
    } else {
      // Game finished
      return {
        text: "FT",
        detail: "Final",
        isLive: false,
        isPre: false,
        isPost: true,
      };
    }
  };

  // Normalize ESPN coords (x: -99..99 => left..right, y: -42..42 => top..bottom)
  // Use fixed dimensions for the mini rink (180x120 from miniField style)
  const normalizeCoord = (x, y) => {
    const rinkWidth = 180;
    const rinkHeight = 120;

    // Clamp inputs
    const clampedX = Math.max(-99, Math.min(99, Number(x)));
    const clampedY = Math.max(-42, Math.min(42, Number(y)));

    // rink interior is inset by 4px (rinkOutline uses top/left/right/bottom = 4)
    const inset = 4;
    const innerW = rinkWidth - inset * 2;
    const innerH = rinkHeight - inset * 2;

    // ESPN origin: 0,0 is center. x:-99..99, y:-42..42
    const px = ((clampedX + 99) / (99 + 99)) * innerW; // map to 0..innerW
    // y: positive is up in ESPN (user said 42 is up), but in screen coords y increases downward
    const py = (1 - (clampedY + 42) / (42 + 42)) * innerH; // flip y

    // Add inset offset and center the marker (subtract half marker size)
    return {
      left: inset + px - 6, // 6 = half of marker width (12px)
      top: inset + py - 6, // 6 = half of marker height (12px)
    };
  };

  // Find stat metadata for a player (labels/keys) from details.boxscore.players
  const findPlayerStatsMeta = (playerObj) => {
    try {
      const playersBox = details?.boxscore?.players || [];
      const athleteId = String(
        playerObj?.athlete?.id ||
          playerObj?.athlete?.athleteId ||
          playerObj?.athlete?.athleteid ||
          "",
      );
      for (const teamBox of playersBox) {
        if (!teamBox || !Array.isArray(teamBox.statistics)) continue;
        for (const group of teamBox.statistics) {
          if (!Array.isArray(group.athletes)) continue;
          const found = group.athletes.find(
            (a) =>
              String(
                a?.athlete?.id ||
                  a?.athlete?.athleteId ||
                  a?.athlete?.athleteid,
              ) === athleteId,
          );
          if (found) {
            return {
              labels: Array.isArray(group.labels)
                ? group.labels.slice()
                : Array.isArray(group.keys)
                  ? group.keys.slice()
                  : [],
              keys: Array.isArray(group.keys) ? group.keys.slice() : null,
              groupName: group.name || "",
            };
          }
        }
      }
    } catch (e) {
      // ignore
    }
    return { labels: null, keys: null, groupName: null };
  };

  // Percent-based normalizer (matches soccer approach which places dots using percent offsets)
  // Returns leftPercent (0..100) and bottomPercent (0..100)
  // Adjusted for WNBA rink proportions and ESPN coordinate system
  const normalizeCoordPercent = (x, y) => {
    const clampedX = Math.max(-99, Math.min(99, Number(x)));
    const clampedY = Math.max(-42, Math.min(42, Number(y)));

    // ESPN coordinates: x=-99 (left) to x=99 (right), y=-42 (bottom) to y=42 (top)
    // Map to percentages with some adjustment for better visual match
    // Add a small margin to keep dots away from the very edges
    const margin = 10; // 5% margin on each side
    const leftPercent =
      margin + ((clampedX + 99) / (99 + 99)) * (100 - 2 * margin);
    const bottomPercent =
      margin + ((clampedY + 42) / (42 + 42)) * (100 - 2 * margin);

    return { leftPercent, bottomPercent };
  };

  const ensureHexColor = (raw) => {
    if (!raw) return null;
    if (typeof raw !== "string") return null;
    const v = raw.trim();
    if (v.startsWith("#")) return v;
    // short 3 or 6 char hex without #
    if (/^[0-9A-Fa-f]{3}$/.test(v) || /^[0-9A-Fa-f]{6}$/.test(v))
      return `#${v}`;
    return null;
  };

  // Removed old renderBasketballCourt function - now using memoized BasketballCourt component for better performance

  // Function to render team statistics
  // Helper function to render stats row with bar fills (like soccer)
  const renderStatsRow = (
    label,
    homeValue,
    awayValue,
    homeColor,
    awayColor,
  ) => {
    const homeNum =
      typeof homeValue === "number" ? homeValue : parseFloat(homeValue) || 0;
    const awayNum =
      typeof awayValue === "number" ? awayValue : parseFloat(awayValue) || 0;
    const total = homeNum + awayNum;
    const homePercent = total > 0 ? (homeNum / total) * 100 : 50;
    const awayPercent = total > 0 ? (awayNum / total) * 100 : 50;

    return (
      <View key={label} style={styles.statsRow}>
        <Text
          style={[
            styles.statsValue,
            styles.statsValueAway,
            { color: theme.text },
          ]}
        >
          {awayValue}
        </Text>
        <View style={styles.statsBarContainer}>
          <View style={[styles.statsBar, { backgroundColor: theme.border }]}>
            <View
              style={[
                styles.statsBarFill,
                styles.statsBarFillAway,
                { width: `${awayPercent}%`, backgroundColor: awayColor },
              ]}
            />
            <View
              style={[
                styles.statsBarFill,
                styles.statsBarFillHome,
                { width: `${homePercent}%`, backgroundColor: homeColor },
              ]}
            />
          </View>
          <Text style={[styles.statsLabel, { color: theme.textSecondary }]}>
            {label}
          </Text>
        </View>
        <Text
          style={[
            styles.statsValue,
            styles.statsValueHome,
            { color: theme.text },
          ]}
        >
          {homeValue}
        </Text>
      </View>
    );
  };

  const renderTeamStats = () => {
    if (!details?.boxscore?.teams) return null;

    const teams = details.boxscore.teams;
    const awayTeam = teams.find((t) => t.homeAway === "away") || teams[0];
    const homeTeam = teams.find((t) => t.homeAway === "home") || teams[1];

    // Check if game is scheduled to use different stats
    const competition =
      details?.header?.competitions?.[0] ||
      details?.boxscore?.game ||
      details?.game ||
      null;
    const statusType =
      competition?.status?.type || details?.game?.status?.type || {};
    const isScheduled = !!(
      statusType?.state === "pre" ||
      (statusType?.description || "").toLowerCase().includes("scheduled")
    );

    let keyStats = [];
    if (isScheduled) {
      // For scheduled games, use the stats that are actually available in a.txt
      keyStats = [
        "avgShots",
        "avgGoals",
        "avgGoalsAgainst",
        "powerPlayGoals",
        "powerPlayPct",
        "penaltyKillPct",
        "penaltyMinutes",
      ];
    } else {
      // For live/finished games, use the standard stats
      keyStats = [
        "fieldGoalsMade-fieldGoalsAttempted",
        "fieldGoalPct",
        "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
        "freeThrowsMade-freeThrowsAttempted",
        "totalRebounds",
        "offensiveRebounds",
        "defensiveRebounds",
        "assists",
        "steals",
        "blocks",
        "turnovers",
        "turnoverPoints",
        "largestLead",
      ];
    }

    // Get team colors with smart color selection to avoid similar colors
    const { homeColor, awayColor } = getSmartTeamColors(
      homeTeam,
      awayTeam,
      colors,
    );

    return (
      <View style={styles.teamStatsContainer}>
        <Text style={[styles.statsSectionTitle, { color: theme.text }]}>
          Team Statistics
        </Text>
        <View style={styles.statsHeader}>
          <View style={styles.teamHeaderLeft}>
            <TeamLogoWithTheme
              colors={colors}
              getTeamLogoUrl={getTeamLogoUrl}
              teamAbbreviation={awayTeam?.team?.abbreviation}
              logoUri={awayTeam?.team?.logos?.[isDarkMode ? 1 : 0]?.href}
              size={24}
              style={styles.teamSmallLogo}
            />
            <Text style={[styles.teamStatsTeamName, { color: theme.text }]}>
              {awayTeam?.team?.abbreviation}
            </Text>
          </View>
          <View style={styles.teamHeaderRight}>
            <Text style={[styles.teamStatsTeamName, { color: theme.text }]}>
              {homeTeam?.team?.abbreviation}
            </Text>
            <TeamLogoWithTheme
              colors={colors}
              getTeamLogoUrl={getTeamLogoUrl}
              teamAbbreviation={homeTeam?.team?.abbreviation}
              logoUri={homeTeam?.team?.logos?.[isDarkMode ? 1 : 0]?.href}
              size={24}
              style={[styles.teamSmallLogo, { marginLeft: 8 }]}
            />
          </View>
        </View>

        {keyStats.map((statName) => {
          const awayStat = awayTeam?.statistics?.find(
            (s) => s.name === statName,
          );
          const homeStat = homeTeam?.statistics?.find(
            (s) => s.name === statName,
          );

          if (!awayStat && !homeStat) return null;

          const homeValue = homeStat?.displayValue || "0";
          const awayValue = awayStat?.displayValue || "0";
          const label = awayStat?.label || homeStat?.label || statName;

          return renderStatsRow(
            label,
            homeValue,
            awayValue,
            homeColor,
            awayColor,
          );
        })}
      </View>
    );
  };

  // Function to render linescore table
  const renderLinescore = () => {
    if (!details?.header?.competitions?.[0]?.competitors) return null;

    const competitors = details?.header?.competitions?.[0]?.competitors || [];
    const awayTeam = competitors.find((c) => c.homeAway === "away");
    const homeTeam = competitors.find((c) => c.homeAway === "home");

    if (!awayTeam || !homeTeam) return null;

    // Get linescore data
    const awayLineScores = awayTeam.linescores || [];
    const homeLineScores = homeTeam.linescores || [];

    // Determine number of periods (quarters + overtime)
    const maxPeriods = Math.max(awayLineScores.length, homeLineScores.length);
    if (maxPeriods === 0) return null;

    // Create header labels
    const periodLabels = [];
    for (let i = 0; i < maxPeriods; i++) {
      if (i < 4) {
        periodLabels.push((i + 1).toString());
      } else {
        periodLabels.push(`OT${i > 4 ? i - 3 : ""}`);
      }
    }

    return (
      <View
        style={[
          styles.linescoreContainer,
          {
            backgroundColor: theme.surface,
            borderRadius: 12,
            marginVertical: 12,
            padding: 12,
          },
        ]}
      >
        <Text
          style={[styles.sectionTitle, { color: theme.text, marginBottom: 12 }]}
        >
          Linescore
        </Text>

        <View style={styles.linescoreTable}>
          {/* Header row */}
          <View
            style={[
              styles.linescoreHeaderRow,
              { backgroundColor: theme.surfaceSecondary || "rgba(0,0,0,0.05)" },
            ]}
          >
            <View style={styles.linescoreTeamHeaderCell}>
              <Text
                style={[
                  styles.linescoreHeaderText,
                  { color: theme.textSecondary },
                ]}
              ></Text>
            </View>
            {periodLabels.map((label, index) => (
              <View key={index} style={styles.linescorePeriodCell}>
                <Text
                  style={[
                    styles.linescoreHeaderText,
                    { color: theme.textSecondary },
                  ]}
                >
                  {label}
                </Text>
              </View>
            ))}
            <View style={styles.linescoreTotalCell}>
              <Text
                style={[
                  styles.linescoreHeaderText,
                  { color: theme.textSecondary },
                ]}
              >
                T
              </Text>
            </View>
          </View>

          {/* Away team row */}
          <View style={styles.linescoreTeamRow}>
            <View style={styles.linescoreTeamHeaderCell}>
              <View style={styles.linescoreTeamInfo}>
                <TeamLogoWithTheme
                  colors={colors}
                  getTeamLogoUrl={getTeamLogoUrl}
                  teamAbbreviation={awayTeam.team?.abbreviation}
                  logoUri={awayTeam.team?.logos?.[isDarkMode ? 1 : 0]?.href}
                  size={20}
                  style={styles.linescoreTeamLogo}
                />
              </View>
            </View>
            {periodLabels.map((_, index) => (
              <View key={index} style={styles.linescorePeriodCell}>
                <Text
                  style={[styles.linescoreScoreText, { color: theme.text }]}
                >
                  {awayLineScores[index]?.displayValue || "0"}
                </Text>
              </View>
            ))}
            <View style={styles.linescoreTotalCell}>
              <Text style={[styles.linescoreTotalText, { color: theme.text }]}>
                {awayTeam.score || "0"}
              </Text>
            </View>
          </View>

          {/* Home team row */}
          <View style={styles.linescoreTeamRow}>
            <View style={styles.linescoreTeamHeaderCell}>
              <View style={styles.linescoreTeamInfo}>
                <TeamLogoWithTheme
                  colors={colors}
                  getTeamLogoUrl={getTeamLogoUrl}
                  teamAbbreviation={homeTeam.team?.abbreviation}
                  logoUri={homeTeam.team?.logos?.[isDarkMode ? 1 : 0]?.href}
                  size={20}
                  style={styles.linescoreTeamLogo}
                />
              </View>
            </View>
            {periodLabels.map((_, index) => (
              <View key={index} style={styles.linescorePeriodCell}>
                <Text
                  style={[styles.linescoreScoreText, { color: theme.text }]}
                >
                  {homeLineScores[index]?.displayValue || "0"}
                </Text>
              </View>
            ))}
            <View style={styles.linescoreTotalCell}>
              <Text style={[styles.linescoreTotalText, { color: theme.text }]}>
                {homeTeam.score || "0"}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // Function to render win probability graph
  const renderWinProbabilityGraph = () => {
    if (!details?.winprobability || !Array.isArray(details.winprobability))
      return null;
    if (!details?.plays || !Array.isArray(details.plays)) return null;

    const winProbData = details.winprobability;
    const playsData = details.plays;
    if (winProbData.length === 0) return null;

    // Get team colors with smart color selection to avoid similar colors
    const competitors = details?.header?.competitions?.[0]?.competitors || [];
    const awayTeam = competitors.find((c) => c.homeAway === "away");
    const homeTeam = competitors.find((c) => c.homeAway === "home");

    const { homeColor, awayColor } = getSmartTeamColors(
      homeTeam,
      awayTeam,
      colors,
    );

    // Create a map of playId to period info
    const playPeriodMap = {};
    playsData.forEach((play) => {
      if (play.id && play.period) {
        playPeriodMap[play.id] = play.period;
      }
    });

    // Helper function to format period display
    const formatPeriod = (periodNumber) => {
      if (periodNumber <= 4) {
        const suffixes = ["", "1st", "2nd", "3rd", "4th"];
        return suffixes[periodNumber];
      } else if (periodNumber === 5) {
        return "OT";
      } else {
        return `${periodNumber - 4}OT`;
      }
    };

    // Create data points with period information
    const graphData = winProbData.map((point, index) => {
      const playInfo = playPeriodMap[point.playId];
      const homeWinPct = parseFloat(point.homeWinPercentage) * 100 || 0;
      const awayWinPct = 100 - homeWinPct;

      return {
        x: index,
        homeWinPercentage: homeWinPct,
        awayWinPercentage: awayWinPct,
        playId: point.playId,
        period: playInfo ? playInfo.number : null,
        periodDisplay: playInfo ? formatPeriod(playInfo.number) : null,
      };
    });

    // Sample data more evenly for better visualization
    const maxDataPoints = Math.min(graphData.length, 100);
    let sampledData;
    if (graphData.length <= maxDataPoints) {
      sampledData = graphData;
    } else {
      const step = graphData.length / maxDataPoints;
      sampledData = [];
      for (let i = 0; i < maxDataPoints; i++) {
        const index = Math.floor(i * step);
        sampledData.push(graphData[index]);
      }
      // Always include the last data point
      if (
        sampledData[sampledData.length - 1] !== graphData[graphData.length - 1]
      ) {
        sampledData.push(graphData[graphData.length - 1]);
      }
    }

    // Find period change points for x-axis labels using sampled data
    const periodLabels = [];
    let currentPeriod = null;
    sampledData.forEach((point, index) => {
      if (point.period && point.period !== currentPeriod) {
        currentPeriod = point.period;
        const xPosition = (index / (sampledData.length - 1)) * 100;
        periodLabels.push({
          x: xPosition,
          period: point.periodDisplay,
        });
      }
    });

    return (
      <View style={{ padding: 12, marginTop: -6, marginBottom: -20 }}>
        <View
          style={[
            styles.winProbabilityContainer,
            {
              backgroundColor: theme.surface,
              borderRadius: 12,
              padding: 12,
              marginVertical: 12,
              borderColor: theme.border,
              borderWidth: StyleSheet.hairlineWidth,
            },
          ]}
        >
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.text, marginBottom: 16 },
            ]}
          >
            Win Probability
          </Text>

          <View style={styles.winProbabilityLegend}>
            <View style={styles.legendItem}>
              <View
                style={[styles.legendColor, { backgroundColor: awayColor }]}
              />
              <Text style={[styles.legendText, { color: theme.text }]}>
                {awayTeam?.team?.abbreviation || "AWAY"}
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[styles.legendColor, { backgroundColor: homeColor }]}
              />
              <Text style={[styles.legendText, { color: theme.text }]}>
                {homeTeam?.team?.abbreviation || "HOME"}
              </Text>
            </View>
          </View>

          <View style={styles.graphContainer}>
            <View style={styles.yAxisLabels}>
              <Text style={[styles.yAxisLabel, { color: theme.textSecondary }]}>
                100%
              </Text>
              <Text style={[styles.yAxisLabel, { color: theme.textSecondary }]}>
                75%
              </Text>
              <Text style={[styles.yAxisLabel, { color: theme.textSecondary }]}>
                50%
              </Text>
              <Text style={[styles.yAxisLabel, { color: theme.textSecondary }]}>
                25%
              </Text>
              <Text style={[styles.yAxisLabel, { color: theme.textSecondary }]}>
                0%
              </Text>
            </View>

            <View style={styles.graphArea}>
              {/* Background grid lines */}
              <View style={styles.gridLines}>
                {[0, 25, 50, 75, 100].map((percentage) => (
                  <View
                    key={percentage}
                    style={[
                      styles.gridLine,
                      {
                        bottom: `${percentage}%`,
                        borderBottomColor: theme.textSecondary + "20",
                      },
                    ]}
                  />
                ))}
              </View>

              {/* 50% center line */}
              <View
                style={[
                  styles.centerLine,
                  { borderBottomColor: theme.textSecondary + "40" },
                ]}
              />

              {/* Win probability lines using SVG */}
              <View style={styles.svgContainer}>
                <Svg
                  style={StyleSheet.absoluteFillObject}
                  width="100%"
                  height="100%"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <Defs>
                    <LinearGradient
                      id="higherTeamGradient"
                      x1="0%"
                      y1="0%"
                      x2="0%"
                      y2="100%"
                    >
                      <Stop
                        offset="0%"
                        stopColor={homeColor}
                        stopOpacity="0.4"
                      />
                      <Stop
                        offset="100%"
                        stopColor={homeColor}
                        stopOpacity="0.1"
                      />
                    </LinearGradient>
                    <LinearGradient
                      id="lowerTeamGradient"
                      x1="0%"
                      y1="0%"
                      x2="0%"
                      y2="100%"
                    >
                      <Stop
                        offset="0%"
                        stopColor={awayColor}
                        stopOpacity="0.4"
                      />
                      <Stop
                        offset="100%"
                        stopColor={awayColor}
                        stopOpacity="0.1"
                      />
                    </LinearGradient>
                  </Defs>

                  {sampledData.length > 1 &&
                    sampledData.map((point, index) => {
                      if (index === 0) return null;

                      const prevPoint = sampledData[index - 1];
                      const x1 = ((index - 1) / (sampledData.length - 1)) * 100;
                      const x2 = (index / (sampledData.length - 1)) * 100;

                      const homeY1 = 100 - prevPoint.homeWinPercentage;
                      const homeY2 = 100 - point.homeWinPercentage;
                      const awayY1 = 100 - prevPoint.awayWinPercentage;
                      const awayY2 = 100 - point.awayWinPercentage;

                      // Determine which team has higher probability for this segment
                      const avgHomeWin =
                        (prevPoint.homeWinPercentage +
                          point.homeWinPercentage) /
                        2;
                      const avgAwayWin =
                        (prevPoint.awayWinPercentage +
                          point.awayWinPercentage) /
                        2;

                      return (
                        <G key={index}>
                          {awayY1 < homeY1 ? (
                            // AWAY team is winning → away line is ABOVE home line
                            <>
                              {/* Home fill (bottom → home line) */}
                              <Path
                                d={`M${x1},100 L${x1},${homeY1} L${x2},${homeY2} L${x2},100 Z`}
                                fill={homeColor}
                                fillOpacity="0.3"
                              />
                              {/* Away fill (home line → away line) */}
                              <Path
                                d={`M${x1},${homeY1} L${x1},${awayY1} L${x2},${awayY2} L${x2},${homeY2} Z`}
                                fill={awayColor}
                                fillOpacity="0.3"
                              />
                            </>
                          ) : (
                            // HOME team is winning → home line is ABOVE away line
                            <>
                              {/* Away fill (bottom → away line) */}
                              <Path
                                d={`M${x1},100 L${x1},${awayY1} L${x2},${awayY2} L${x2},100 Z`}
                                fill={awayColor}
                                fillOpacity="0.3"
                              />
                              {/* Home fill (away line → home line) */}
                              <Path
                                d={`M${x1},${awayY1} L${x1},${homeY1} L${x2},${homeY2} L${x2},${awayY2} Z`}
                                fill={homeColor}
                                fillOpacity="0.3"
                              />
                            </>
                          )}
                        </G>
                      );
                    })}

                  {/* Draw the actual lines */}
                  {sampledData.length > 1 && (
                    <>
                      {/* Home team line */}
                      <Path
                        d={sampledData.reduce((path, point, index) => {
                          const x = (index / (sampledData.length - 1)) * 100;
                          const y = 100 - point.homeWinPercentage;
                          return (
                            path + (index === 0 ? `M${x},${y}` : ` L${x},${y}`)
                          );
                        }, "")}
                        fill="none"
                        stroke={homeColor}
                        strokeWidth=".5"
                      />
                      {/* Away team line */}
                      <Path
                        d={sampledData.reduce((path, point, index) => {
                          const x = (index / (sampledData.length - 1)) * 100;
                          const y = 100 - point.awayWinPercentage;
                          return (
                            path + (index === 0 ? `M${x},${y}` : ` L${x},${y}`)
                          );
                        }, "")}
                        fill="none"
                        stroke={awayColor}
                        strokeWidth=".5"
                      />
                    </>
                  )}
                </Svg>
              </View>
            </View>
          </View>

          {/* Period labels as x-axis */}
          {periodLabels.length > 0 && (
            <View style={[styles.periodLabelsContainer, { marginLeft: 48 }]}>
              {periodLabels.map((label, index) => (
                <Text
                  key={index}
                  style={[
                    styles.periodLabel,
                    {
                      color: theme.textSecondary,
                      left: `${label.x}%`,
                    },
                  ]}
                >
                  {label.period}
                </Text>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  };

  // Function to render season series section
  const renderSeasonSeries = () => {
    if (!details?.seasonseries || !Array.isArray(details.seasonseries))
      return null;

    // Separate playoff and season series
    const playoffSeries = details.seasonseries.filter(
      (series) =>
        series.type === 3 ||
        series.type === "playoffs" ||
        (series.title && series.title.toLowerCase().includes("playoff")),
    );
    const regularSeasonSeries = details.seasonseries.filter(
      (series) =>
        series.type === 2 ||
        series.type === "season" ||
        (series.title && series.title.toLowerCase().includes("season")),
    );

    // If no specific filtering works, show all series
    const allSeries =
      playoffSeries.length === 0 && regularSeasonSeries.length === 0
        ? details.seasonseries
        : [];

    if (
      playoffSeries.length === 0 &&
      regularSeasonSeries.length === 0 &&
      allSeries.length === 0
    )
      return null;

    const renderGameEvent = (event, eventIndex) => {
      const homeTeam = event.competitors?.find((c) => c.homeAway === "home");
      const awayTeam = event.competitors?.find((c) => c.homeAway === "away");

      // Determine winner/loser for styling
      const homeWon = event.statusType?.completed && homeTeam?.winner;
      const awayWon = event.statusType?.completed && awayTeam?.winner;

      return (
        <TouchableOpacity
          key={`event-${eventIndex}`}
          style={[
            styles.seasonSeriesGameEvent,
            { backgroundColor: theme.surfaceSecondary || theme.surface },
          ]}
          onPress={() => {
            // Navigate to game details
            navigation.navigate("GameDetails", {
              gameId: event.id,
              sport: "wnba",
              summerLeague: null,
            });
          }}
        >
          {/* Team logos and scores */}
          <View style={styles.gameEventMainContent}>
            {/* Away Team */}
            <View
              style={[
                styles.gameEventTeamSection,
                awayWon && styles.winnerTeam,
              ]}
            >
              <View style={styles.gameEventTeamLogoScore}>
                <TeamLogoWithTheme
                  colors={colors}
                  getTeamLogoUrl={getTeamLogoUrl}
                  teamAbbreviation={awayTeam?.team?.abbreviation}
                  logoUri={awayTeam?.team?.logos?.[isDarkMode ? 1 : 0]?.href}
                  size={32}
                  style={[
                    styles.gameEventTeamLogo,
                    { opacity: awayWon ? 1 : homeWon ? 0.5 : 1 },
                  ]}
                />
                <Text
                  style={[
                    styles.gameEventScore,
                    {
                      color: awayWon
                        ? colors.primary || "#4CAF50"
                        : homeWon
                          ? theme.textSecondary
                          : colors.primary,
                    },
                  ]}
                >
                  {event.statusType?.completed ? awayTeam?.score || "0" : ""}
                </Text>
              </View>
              <Text
                style={[
                  styles.gameEventTeamAbbr,
                  {
                    color: awayWon
                      ? colors.primary
                      : homeWon
                        ? theme.textSecondary
                        : colors.primary,
                  },
                ]}
              >
                {awayTeam?.team?.abbreviation}
              </Text>
            </View>

            {/* Status and Date in middle */}
            <View style={styles.gameEventStatusSection}>
              <Text
                style={[styles.gameEventStatus, { color: theme.textSecondary }]}
              >
                {event.statusType?.detail || event.status}
              </Text>
              <Text
                style={[styles.gameEventDate, { color: theme.textSecondary }]}
              >
                {new Date(event.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
            </View>

            {/* Home Team */}
            <View
              style={[
                styles.gameEventTeamSection,
                homeWon && styles.winnerTeam,
              ]}
            >
              <View style={styles.gameEventTeamLogoScore}>
                <Text
                  style={[
                    styles.gameEventScore,
                    {
                      color: homeWon
                        ? colors.primary || "#4CAF50"
                        : awayWon
                          ? theme.textSecondary
                          : colors.primary,
                    },
                  ]}
                >
                  {event.statusType?.completed ? homeTeam?.score || "0" : ""}
                </Text>
                <TeamLogoWithTheme
                  colors={colors}
                  getTeamLogoUrl={getTeamLogoUrl}
                  teamAbbreviation={homeTeam?.team?.abbreviation}
                  logoUri={homeTeam?.team?.logos?.[isDarkMode ? 1 : 0]?.href}
                  size={32}
                  style={[
                    styles.gameEventTeamLogoHome,
                    { opacity: homeWon ? 1 : awayWon ? 0.5 : 1 },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.gameEventTeamAbbr,
                  {
                    color: homeWon
                      ? colors.primary
                      : awayWon
                        ? theme.textSecondary
                        : colors.primary,
                  },
                ]}
              >
                {homeTeam?.team?.abbreviation}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    };

    return (
      <View
        style={[
          styles.seasonSeriesContainer,
          {
            backgroundColor: theme.surface,
            borderRadius: 12,
            paddingHorizontal: 8,
            paddingVertical: 12,
            marginVertical: 12,
          },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Season Series
        </Text>

        {playoffSeries.length > 0 && (
          <View style={styles.seasonSeriesTypeContainer}>
            <Text
              style={[
                styles.seasonSeriesTypeTitle,
                { color: theme.textSecondary },
              ]}
            >
              Playoffs
            </Text>
            {playoffSeries.map((series, index) => (
              <View
                key={`playoff-${index}`}
                style={[
                  styles.seasonSeriesGameItem,
                  { backgroundColor: theme.surfaceSecondary || theme.surface },
                ]}
              >
                <Text
                  style={[styles.seasonSeriesSummary, { color: theme.text }]}
                >
                  {series.summary}
                </Text>
                {series.events &&
                  series.events.map((event, eventIndex) =>
                    renderGameEvent(event, eventIndex),
                  )}
              </View>
            ))}
          </View>
        )}

        {regularSeasonSeries.length > 0 && (
          <View style={styles.seasonSeriesTypeContainer}>
            <Text
              style={[
                styles.seasonSeriesTypeTitle,
                { color: theme.textSecondary },
              ]}
            >
              Regular Season
            </Text>
            {regularSeasonSeries.map((series, index) => (
              <View
                key={`regular-${index}`}
                style={[
                  styles.seasonSeriesGameItem,
                  { backgroundColor: theme.surfaceSecondary || theme.surface },
                ]}
              >
                <Text
                  style={[styles.seasonSeriesSummary, { color: theme.text }]}
                >
                  {series.summary}
                </Text>
                {series.events &&
                  series.events.map((event, eventIndex) =>
                    renderGameEvent(event, eventIndex),
                  )}
              </View>
            ))}
          </View>
        )}

        {allSeries.length > 0 && (
          <View style={styles.seasonSeriesTypeContainer}>
            <Text
              style={[
                styles.seasonSeriesTypeTitle,
                { color: theme.textSecondary },
              ]}
            >
              Season Series
            </Text>
            {allSeries.map((series, index) => (
              <View
                key={`all-${index}`}
                style={[
                  styles.seasonSeriesGameItem,
                  { backgroundColor: theme.surfaceSecondary || theme.surface },
                ]}
              >
                <Text
                  style={[styles.seasonSeriesSummary, { color: theme.text }]}
                >
                  {series.summary}
                </Text>
                {series.events &&
                  series.events.map((event, eventIndex) =>
                    renderGameEvent(event, eventIndex),
                  )}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  // Function to render leaders section (enhanced layout)
  const renderLeaders = () => {
    if (!details?.leaders || !Array.isArray(details.leaders)) return null;

    return (
      <View
        style={[
          styles.leadersContainer,
          {
            backgroundColor: theme.surface,
            borderRadius: 12,
            paddingHorizontal: 8,
            paddingVertical: 12,
            marginVertical: 12,
          },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Leaders
        </Text>
        {details.leaders.map((teamLeaders, teamIdx) => (
          <View key={teamIdx} style={styles.teamLeadersContainer}>
            <View style={styles.teamLeadersHeader}>
              <TeamLogoWithTheme
                colors={colors}
                getTeamLogoUrl={getTeamLogoUrl}
                teamAbbreviation={teamLeaders.team?.abbreviation}
                logoUri={teamLeaders.team?.logos?.[isDarkMode ? 1 : 0]?.href}
                size={24}
                style={styles.teamLeadersLogo}
              />
              <Text style={[styles.teamLeadersName, { color: theme.text }]}>
                {teamLeaders.team?.displayName}
              </Text>
            </View>

            {teamLeaders.leaders?.map((category, catIdx) => (
              <View key={catIdx} style={styles.leaderCategory}>
                <Text
                  style={[
                    styles.leaderCategoryTitle,
                    { color: theme.textSecondary },
                  ]}
                >
                  {category.displayName}
                </Text>

                {category.leaders?.slice(0, 5).map((leader, leaderIdx) => {
                  const athlete = leader.athlete || {};
                  const fullName =
                    athlete.fullName || athlete.displayName || "";
                  const parts = fullName.trim().split(" ");
                  const lastName =
                    parts.length > 1 ? parts.pop() : parts[0] || "";
                  const firstPart = parts.join(" ") || "";
                  const jerseyNumber =
                    athlete.jersey ||
                    athlete.jerseyNumber ||
                    athlete.number ||
                    null;
                  const position =
                    athlete.position?.abbreviation ||
                    athlete.position?.name ||
                    "";
                  const headshot =
                    athlete.headshot?.href ||
                    athlete.headshot ||
                    athlete.photo ||
                    athlete.headshotUrl ||
                    null;

                  return (
                    <View
                      key={leaderIdx}
                      style={[
                        styles.enhancedLeaderItem,
                        {
                          backgroundColor:
                            theme.surfaceSecondary || theme.surface,
                        },
                      ]}
                    >
                      <View style={styles.leaderHeadshotContainer}>
                        {headshot ? (
                          <Image
                            source={{ uri: headshot }}
                            style={styles.leaderHeadshot}
                          />
                        ) : (
                          <View
                            style={[
                              styles.leaderHeadshot,
                              styles.leaderHeadshotPlaceholder,
                              { backgroundColor: theme.surface },
                            ]}
                          >
                            <Text
                              style={[
                                styles.leaderInitials,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {(
                                firstPart.charAt(0) + lastName.charAt(0)
                              ).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.leaderNameContainer}>
                        <Text
                          style={[styles.leaderFullName, { color: theme.text }]}
                          numberOfLines={1}
                        >
                          {athlete.displayName || athlete.shortName || fullName}
                        </Text>
                        <Text
                          style={[
                            styles.leaderJerseyPosition,
                            { color: theme.textSecondary },
                          ]}
                          numberOfLines={1}
                        >
                          {jerseyNumber && position
                            ? `#${jerseyNumber} • ${position}`
                            : jerseyNumber
                              ? `#${jerseyNumber}`
                              : position
                                ? position
                                : ""}
                        </Text>
                      </View>

                      <View style={styles.leaderValueContainer}>
                        <Text
                          style={[
                            styles.leaderBigValue,
                            { color: colors.primary },
                          ]}
                        >
                          {leader.displayValue}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  };

  // Function to render plays in soccer-style containers
  const renderPlays = () => {
    // Use precomputed playsData when available (fast path). If not, fall back to computing inline.
    if (playsData && Array.isArray(playsData)) {
      if (playsData.length === 0) {
        return (
          <View style={styles.noPlaysContainer}>
            <Text style={[styles.noPlaysText, { color: theme.textSecondary }]}>
              No plays available
            </Text>
          </View>
        );
      }

      // Only render the visible plays for performance
      const visiblePlays = playsData.slice(0, visiblePlaysCount);
      console.log(
        `[PLAYS DEBUG] Rendering ${visiblePlays.length} of ${playsData.length} plays`,
      );

      const renderedPlays = visiblePlays.map((p, index) => {
        const playKey = p.id ?? index;
        const isOpen = openPlays.has(playKey);

        return (
          <View
            key={playKey}
            style={[
              styles.playContainer,
              {
                backgroundColor: p.isScoring
                  ? p.playTeamColor
                    ? hexToRgba(p.playTeamColor, 0.12)
                    : theme.surface
                  : theme.surface,
              },
              p.borderLeftColor
                ? {
                    borderLeftWidth: p.borderLeftWidth,
                    borderLeftColor: p.borderLeftColor,
                  }
                : null,
            ]}
          >
            <TouchableOpacity
              style={styles.playHeader}
              onPress={() => togglePlay(playKey)}
              onLongPress={() => {
                if (p && p.isScoring) setSharePlayCard(p);
              }}
              delayLongPress={250}
              activeOpacity={0.7}
            >
              <View style={styles.playMainInfo}>
                <View style={styles.playTeamsScore}>
                  <View style={styles.teamScoreDisplay}>
                    {p.awayAbbreviation ? (
                      <TeamLogoWithTheme
                        colors={colors}
                        getTeamLogoUrl={getTeamLogoUrl}
                        teamAbbreviation={p.awayAbbreviation}
                        logoUri={p.awayLogoUri}
                        size={20}
                        style={[
                          styles.teamLogoSmall,
                          p.isScoring && styles.logoDarkOverride,
                        ]}
                      />
                    ) : null}
                    <Text style={[styles.scoreSmall, { color: p.textColor }]}>
                      {p.awayScore}
                    </Text>
                  </View>
                  <Text style={[styles.scoreSeparator, { color: theme.text }]}>
                    -
                  </Text>
                  <View style={styles.teamScoreDisplay}>
                    <Text style={[styles.scoreSmall, { color: p.textColor }]}>
                      {p.homeScore}
                    </Text>
                    {p.homeAbbreviation ? (
                      <TeamLogoWithTheme
                        colors={colors}
                        getTeamLogoUrl={getTeamLogoUrl}
                        teamAbbreviation={p.homeAbbreviation}
                        logoUri={p.homeLogoUri}
                        size={20}
                        style={[
                          styles.teamLogoSmall,
                          p.isScoring && styles.logoDarkOverride,
                        ]}
                      />
                    ) : null}
                  </View>
                </View>
                <View style={styles.playSummary}>
                  <Text
                    style={[styles.playDescription, { color: p.textColor }]}
                  >
                    {p.playText}
                  </Text>
                  {p.isScoring && (
                    <View
                      style={[
                        styles.scoreIndicator,
                        { backgroundColor: p.playTeamColor || colors.primary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.scoreIndicatorText,
                          { color: theme.text },
                        ]}
                      >
                        {p.scoreValue
                          ? `+${p.scoreValue} Point${
                              p.scoreValue !== 1 ? "s" : ""
                            }`
                          : "GOAL"}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.playRightSection}>
                <View style={styles.playTimePeriod}>
                  <Text
                    style={[styles.playPeriod, { color: theme.textSecondary }]}
                  >
                    {p.period}
                  </Text>
                  <Text
                    style={[styles.playClock, { color: theme.textSecondary }]}
                  >
                    {p.clock}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.playToggle}
                  onPress={() => togglePlay(playKey)}
                >
                  <Text style={[styles.toggleIcon, { color: theme.text }]}>
                    {isOpen ? "▲" : "▼"}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>

            {isOpen && (
              <View style={styles.playDetails}>
                <View style={styles.playDetailsContent}>
                  <View style={styles.playDetailsRow}>
                    <View style={styles.miniFieldContainer}>
                      {/* Optimized Basketball court with memoization */}
                      <BasketballCourt
                        key={`court-${p.id}`}
                        coordinate={(() => {
                          // Check for valid coordinates
                          if (
                            p.coordX != null &&
                            p.coordY != null &&
                            p.coordX > -1000000 &&
                            p.coordY > -1000000 &&
                            p.coordX < 1000000 &&
                            p.coordY < 1000000
                          ) {
                            return { x: p.coordX, y: p.coordY };
                          }
                          // Fallback coordinates for invalid data
                          return {
                            x: p.isScoring || p.pointsAttempted === 1 ? 25 : 0,
                            y: p.isScoring || p.pointsAttempted === 1 ? 17 : 0,
                          };
                        })()}
                        isScoring={p.isScoring}
                        teamSide={
                          away?.team?.id === p.playTeamId ? "away" : "home"
                        }
                        teamColor={ensureHexColor(p.playTeamColor) || "552583"}
                        styles={styles}
                      />
                    </View>

                    <View
                      style={[
                        styles.playEventInfo,
                        {
                          backgroundColor: p.isScoring
                            ? "rgba(255,255,255,0.12)"
                            : theme.background,
                          flex: 1,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.playDescription, { color: theme.text }]}
                      >
                        {p.playText}
                      </Text>
                      {(p.clock || p.period) && (
                        <Text
                          style={[
                            styles.playClock,
                            { color: theme.textSecondary, marginTop: 8 },
                          ]}
                        >
                          {p.period ? `${p.period} - ${p.clock}` : p.clock}
                        </Text>
                      )}
                    </View>

                    {/* Copy card is opened via long-press on the play header (no inline button) */}
                  </View>
                </View>
              </View>
            )}
          </View>
        );
      });

      // Add load more button if there are more plays to show
      const loadMoreButton = [];
      if (visiblePlaysCount < playsData.length) {
        loadMoreButton.push(
          <TouchableOpacity
            key="load-more-button"
            style={[styles.loadMoreButton, { backgroundColor: colors.primary }]}
            onPress={loadMorePlays}
            disabled={isLoadingMorePlays}
          >
            {isLoadingMorePlays ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.loadMoreText, { color: "#fff" }]}>
                Load More Plays ({playsData.length - visiblePlaysCount}{" "}
                remaining)
              </Text>
            )}
          </TouchableOpacity>,
        );
      }

      return [...renderedPlays, ...loadMoreButton];
    }

    // fallback (previous inline computation) — keep for safety but should rarely run now
    return (
      <View style={styles.noPlaysContainer}>
        <Text style={[styles.noPlaysText, { color: theme.textSecondary }]}>
          No plays available
        </Text>
      </View>
    );
  };

  // Team navigation function with proper ID handling
  const navigateToTeam = (team) => {
    if (!team || (!team.id && !team.team?.id)) {
      console.warn(
        "WNBA GameDetails navigateToTeam: Invalid team object",
        team,
      );
      return;
    }

    const teamId = team.id || team.team?.id;
    const abbreviation = team.abbreviation || team.team?.abbreviation;
    const displayName =
      team.displayName ||
      team.team?.displayName ||
      team.name ||
      team.team?.name;

    const teamData = {
      teamId,
      abbreviation,
      displayName,
      sport: "wnba",
    };

    navigation.navigate("TeamPage", teamData);
  };

  // Helper function to handle favorite toggle - optimized with direct team data
  const handleFavoriteToggle = async (team, teamId) => {
    if (!teamId) {
      console.warn(
        "WNBA GameDetails handleFavoriteToggle: Invalid team ID",
        team,
      );
      return;
    }

    const teamData = {
      teamId,
      abbreviation: team.abbreviation || team.team?.abbreviation,
      displayName:
        team.displayName ||
        team.team?.displayName ||
        team.name ||
        team.team?.name,
      sport: "wnba",
    };

    await toggleFavorite(teamData);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Main Content */}
      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        stickyHeaderIndices={[1]} // This makes the second child (sticky header) sticky
      >
        {/* Main Header Section */}
        <View
          style={[
            styles.simpleHeaderCard,
            {
              backgroundColor: theme.surfaceSecondary,
              borderColor: "rgba(0,0,0,0.08)",
            },
          ]}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        >
          <HeaderGradient
            awayColor={getSmartTeamColors(home, away, colors).awayColor}
            homeColor={getSmartTeamColors(home, away, colors).homeColor}
            theme={theme}
            height={headerHeight}
          />

          {/* League and venue info */}
          <View style={styles.simpleLeagueRow}>
            <Text
              style={[styles.simpleLeagueText, { color: theme.textTertiary }]}
              numberOfLines={1}
            >
              {[
                details?.gameInfo?.venue?.fullName,
                details?.header?.season?.type === 1 ? "WNBA" : null,
                details?.header?.gameNote ||
                  (details?.header?.season?.type === 1 ? "Preseason" : "WNBA"),
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>

          {/* Main teams and score row */}
          <View style={styles.simpleMainRow}>
            {/* Away Team */}
            <SimpleTeamDisplay
              team={away?.team}
              logo={
                away?.team?.logo ||
                away?.logo ||
                getTeamLogoUrl("wnba", away?.team?.abbreviation)
              }
              score={awayScoreNum}
              side="away"
              isPre={getGameStatus().isPre}
              isFinished={isGameFinal}
              isWinner={awayIsWinner}
              isLoser={awayIsLoser}
              record={
                (details?.header?.season?.type === 2 ||
                  details?.header?.season?.type === 1) &&
                (getGameStatus().isPre || getGameStatus().isPost)
                  ? away?.record?.[0]
                  : null
              }
              possesion={away?.possession}
              theme={theme}
              teamColor={getSmartTeamColors(home, away, colors).awayColor}
              onPress={() => navigateToTeam(away)}
              timeoutsRemaining={(() => {
                try {
                  const teamObj = away || {};
                  return Math.max(
                    0,
                    Number(
                      teamObj.timeoutsRemaining ??
                        teamObj?.team?.timeoutsRemaining ??
                        teamObj?.statistics?.find((s) =>
                          /timeoutsRemaining/i.test(s?.name || s?.label || ""),
                        )?.value ??
                        0,
                    ) || 0,
                  );
                } catch (e) {
                  return 0;
                }
              })()}
              bonusState={(() => {
                try {
                  const teamObj = away || {};
                  const foulsRaw =
                    teamObj.fouls ??
                    teamObj?.team?.fouls ??
                    teamObj?.statistics?.find((s) =>
                      /foul/i.test(s?.name || s?.label || ""),
                    )?.value ??
                    null;
                  return (
                    (foulsRaw && foulsRaw.bonusState) ||
                    (foulsRaw && foulsRaw.bonus) ||
                    null
                  );
                } catch (e) {
                  return null;
                }
              })()}
              colors={colors}
            />

            {/* Center Status */}
            <View style={styles.simpleStatusCenter}>
              <View style={styles.simpleStatusBadge}>
                <Text
                  style={[
                    styles.simpleStatusMain,
                    {
                      color: isGameFinal
                        ? theme.textSecondary
                        : getGameStatus().isLive
                          ? theme.error || colors.primary
                          : getGameStatus().isPre
                            ? theme.text
                            : theme.text,
                    },
                  ]}
                >
                  {getGameStatus().text}
                </Text>
                <Text
                  style={[
                    styles.simpleStatusSub,
                    { color: theme.textTertiary },
                  ]}
                >
                  {getGameStatus().isLive
                    ? getGameStatus().detail
                    : `${
                        new Date(gameDate)
                          .toLocaleDateString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                          .split(", ")[1]
                      } • ${new Date(gameDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}`}
                </Text>
              </View>

              {/* Stream button - only for live games when unlocked */}
              {(() => {
                const statusType =
                  competition?.status?.type ||
                  details?.game?.status?.type ||
                  {};
                const isLive = statusType?.state === "in";

                return isLive && isStreamingUnlocked ? (
                  <TouchableOpacity
                    style={[
                      styles.simpleStreamBtn,
                      { borderColor: colors.primary },
                    ]}
                    onPress={openStreamModal}
                    activeOpacity={0.8}
                  >
                    <View style={styles.simpleStreamBtnInner}>
                      <View
                        style={[
                          styles.simpleStreamBtnDot,
                          { backgroundColor: colors.primary },
                        ]}
                      />
                      <Text
                        style={[
                          styles.simpleStreamBtnText,
                          { color: colors.primary },
                        ]}
                      >
                        Stream
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : null;
              })()}
            </View>

            {/* Home Team */}
            <SimpleTeamDisplay
              team={home?.team}
              logo={
                home?.team?.logo ||
                home?.logo ||
                getTeamLogoUrl("wnba", home?.team?.abbreviation)
              }
              score={homeScoreNum}
              side="home"
              isPre={getGameStatus().isPre}
              isFinished={isGameFinal}
              isWinner={homeIsWinner}
              isLoser={homeIsLoser}
              record={
                (details?.header?.season?.type === 2 ||
                  details?.header?.season?.type === 1) &&
                (getGameStatus().isPre || getGameStatus().isPost)
                  ? home?.record?.[0]
                  : null
              }
              possesion={home?.possession}
              theme={theme}
              teamColor={getSmartTeamColors(home, away, colors).homeColor}
              onPress={() => navigateToTeam(home)}
              timeoutsRemaining={(() => {
                try {
                  const teamObj = home || {};
                  return Math.max(
                    0,
                    Number(
                      teamObj.timeoutsRemaining ??
                        teamObj?.team?.timeoutsRemaining ??
                        teamObj?.statistics?.find((s) =>
                          /timeoutsRemaining/i.test(s?.name || s?.label || ""),
                        )?.value ??
                        0,
                    ) || 0,
                  );
                } catch (e) {
                  return 0;
                }
              })()}
              bonusState={(() => {
                try {
                  const teamObj = home || {};
                  const foulsRaw =
                    teamObj.fouls ??
                    teamObj?.team?.fouls ??
                    teamObj?.statistics?.find((s) =>
                      /foul/i.test(s?.name || s?.label || ""),
                    )?.value ??
                    null;
                  return (
                    (foulsRaw && foulsRaw.bonusState) ||
                    (foulsRaw && foulsRaw.bonus) ||
                    null
                  );
                } catch (e) {
                  return null;
                }
              })()}
              colors={colors}
            />
          </View>
        </View>

        {/* Sticky Header Section containing Mini Header and Tab Bar */}
        <View
          style={[
            styles.stickyUnit,
            {
              backgroundColor: theme.surface,
              borderBottomColor: theme.border,
            },
          ]}
        >
          {/* Animated Mini Header */}
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
            <View style={styles.miniSide}>
              <Image
                source={{
                  uri:
                    away?.team?.logo ||
                    away?.logo ||
                    getTeamLogoUrl("wnba", away?.team?.abbreviation),
                }}
                style={[
                  styles.miniLogo,
                  { opacity: isGameFinal ? (awayIsWinner ? 1 : 0.55) : 1 },
                ]}
                contentFit="contain"
              />
              <Text
                style={[
                  styles.miniAbbr,
                  {
                    color: theme.text,
                    opacity: isGameFinal ? (awayIsWinner ? 1 : 0.55) : 1,
                  },
                ]}
                numberOfLines={1}
              >
                {away?.team?.abbreviation || "AWY"}
              </Text>
              {!getGameStatus().isPre && (
                <Text
                  style={[
                    styles.miniScore,
                    {
                      color: awayIsWinner ? theme.text : theme.textSecondary,
                      fontWeight: isGameFinal && awayIsWinner ? "700" : "400",
                    },
                  ]}
                >
                  {awayScoreNum}
                </Text>
              )}
            </View>

            <View style={styles.miniStatusBlock}>
              <Text
                style={[styles.miniStatusLine, { color: theme.text }]}
                numberOfLines={1}
              >
                {getGameStatus().text}
              </Text>
              <Text
                style={[styles.miniStatusSub, { color: theme.textTertiary }]}
                numberOfLines={1}
              >
                {getGameStatus().isLive
                  ? getGameStatus().detail
                  : `${
                      new Date(gameDate)
                        .toLocaleDateString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                        .split(", ")[1]
                    } • ${new Date(gameDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}`}
              </Text>
            </View>

            <View style={[styles.miniSide, { justifyContent: "flex-end" }]}>
              {!getGameStatus().isPre && (
                <Text
                  style={[
                    styles.miniScore,
                    {
                      color: homeIsWinner ? theme.text : theme.textSecondary,
                      fontWeight: isGameFinal && homeIsWinner ? "700" : "400",
                    },
                  ]}
                >
                  {homeScoreNum}
                </Text>
              )}
              <Text
                style={[
                  styles.miniAbbr,
                  {
                    color: theme.text,
                    opacity: isGameFinal ? (homeIsWinner ? 1 : 0.55) : 1,
                  },
                ]}
                numberOfLines={1}
              >
                {home?.team?.abbreviation || "HME"}
              </Text>
              <Image
                source={{
                  uri:
                    home?.team?.logo ||
                    home?.logo ||
                    getTeamLogoUrl("wnba", home?.team?.abbreviation),
                }}
                style={[
                  styles.miniLogo,
                  { opacity: isGameFinal ? (homeIsWinner ? 1 : 0.55) : 1 },
                ]}
                contentFit="contain"
              />
            </View>
          </Animated.View>

          {/* Tab Bar */}
          <View style={styles.tabBarWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabBarContent}
            >
              {[
                "stats",
                "away",
                "home",
                "plays",
                ...(hasSeriesData ? ["series"] : []),
              ].map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[
                    styles.tabBarButton,
                    { width: width / 4 },
                    activeTab === tab && { borderBottomColor: colors.primary },
                  ]}
                  onPress={() => {
                    if (tab === "plays") {
                      resetPlaysCount();
                    }
                    if (activeTab === "series") {
                      setSeriesVisibleCount(5);
                      setSeriesHomeOnly(false);
                    }
                    setActiveTab(tab);
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.tabBarLabel,
                      {
                        color:
                          activeTab === tab
                            ? colors.primary
                            : theme.textSecondary,
                        fontWeight: activeTab === tab ? "700" : "500",
                      },
                    ]}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        {/* Tab Content */}
        <View style={styles.contentArea}>
          <View style={styles.tabContent}>
            {activeTab === "stats" && (
              <View style={{ paddingBottom: 80 }}>
                {/* NHL-style Linescore Table */}
                <WNBALinescoreTable
                  details={details}
                  theme={theme}
                  colors={colors}
                  getTeamLogoUrl={getTeamLogoUrl}
                  isDarkMode={isDarkMode}
                />

                {/* NHL-style Stats Section (bar fills) */}
                <WNBAStatsSection
                  details={details}
                  theme={theme}
                  colors={colors}
                  isDarkMode={isDarkMode}
                />

                {/* Win Probability Graph */}
                {renderWinProbabilityGraph()}

                {/* NHL-style Leaders Section */}
                <WNBALeadersSection
                  details={details}
                  theme={theme}
                  colors={colors}
                  getTeamLogoUrl={getTeamLogoUrl}
                  isDarkMode={isDarkMode}
                />
              </View>
            )}

            {activeTab === "series" && (
              <View style={{ paddingTop: 6, paddingBottom: 80 }}>
                <WNBASeriesSummarySection
                  details={details}
                  theme={theme}
                  colors={colors}
                  homeColor={getSmartTeamColors(home, away, colors).homeColor}
                  awayColor={getSmartTeamColors(home, away, colors).awayColor}
                  homeOnly={seriesHomeOnly}
                  onToggleHomeOnly={() => {
                    setSeriesHomeOnly((prev) => !prev);
                    setSeriesVisibleCount(5);
                  }}
                  getTeamLogoUrl={getTeamLogoUrl}
                  isDarkMode={isDarkMode}
                  seriesSummary={seriesSummary}
                />
                <View style={wnbaSeriesStyles.matchesWrap}>
                  {seriesEvents
                    .slice(0, seriesVisibleCount)
                    .map((event, idx) => (
                      <WNBASeriesMatchCard
                        key={String(event?.id || idx)}
                        event={event}
                        details={details}
                        theme={theme}
                        colors={colors}
                        navigation={navigation}
                        homeColor={
                          getSmartTeamColors(home, away, colors).homeColor
                        }
                        awayColor={
                          getSmartTeamColors(home, away, colors).awayColor
                        }
                        getTeamLogoUrl={getTeamLogoUrl}
                        isDarkMode={isDarkMode}
                      />
                    ))}
                  {seriesEvents.length === 0 && (
                    <Text
                      style={[
                        wnbaSeriesStyles.emptyText,
                        {
                          color: theme.textTertiary,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      No series matches available for this filter.
                    </Text>
                  )}
                  {seriesVisibleCount < seriesEvents.length && (
                    <TouchableOpacity
                      style={[
                        wnbaSeriesStyles.showMoreBtn,
                        {
                          borderColor: theme.border,
                          backgroundColor: theme.surface,
                        },
                      ]}
                      onPress={() =>
                        setSeriesVisibleCount((prev) =>
                          Math.min(prev + 5, seriesEvents.length),
                        )
                      }
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          wnbaSeriesStyles.showMoreText,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Show more
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {activeTab === "home" && (
              <WNBATeamRosterSection
                details={details}
                theme={theme}
                teamSide="home"
                teamColor={getSmartTeamColors(home, away, colors).homeColor}
                colors={colors}
                getTeamLogoUrl={getTeamLogoUrl}
                isDarkMode={isDarkMode}
                navigation={navigation}
                findPlayerStatsMeta={findPlayerStatsMeta}
                onPlayerPress={openWnbaPlayerModal}
              />
            )}

            {activeTab === "away" && (
              <WNBATeamRosterSection
                details={details}
                theme={theme}
                teamSide="away"
                teamColor={getSmartTeamColors(home, away, colors).awayColor}
                colors={colors}
                getTeamLogoUrl={getTeamLogoUrl}
                isDarkMode={isDarkMode}
                navigation={navigation}
                findPlayerStatsMeta={findPlayerStatsMeta}
                onPlayerPress={openWnbaPlayerModal}
              />
            )}

            {activeTab === "plays" && (
              <WNBAPlaysTabSection
                details={details}
                theme={theme}
                colors={colors}
                onPlayerPress={openWnbaPlayerModal}
                onOpenSharePlayCard={(p) => setSharePlayCard(p)}
                getTeamLogoUrl={getTeamLogoUrl}
              />
            )}
          </View>
        </View>

        {/* Player Details Modal */}
        <Modal
          visible={!!selectedPlayer}
          animationType="slide"
          transparent
          onRequestClose={() => setSelectedPlayer(null)}
        >
          <View
            style={[
              styles.modalOverlay,
              { backgroundColor: "rgba(0,0,0,0.6)" },
            ]}
          >
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: theme.surface,
                  borderWidth: 1,
                  borderColor: (() => {
                    try {
                      if (!selectedPlayer) return theme.border;
                      const player = selectedPlayer.player;
                      const athlete = player?.athlete;
                      const playersBox = details?.boxscore?.players || [];
                      let team = null;
                      for (const teamBox of playersBox) {
                        if (teamBox?.statistics) {
                          for (const group of teamBox.statistics) {
                            if (group?.athletes) {
                              const found = group.athletes.find(
                                (a) =>
                                  String(a?.athlete?.id) ===
                                  String(athlete?.id),
                              );
                              if (found) {
                                team = teamBox.team;
                                break;
                              }
                            }
                          }
                          if (team) break;
                        }
                      }
                      const { homeColor, awayColor } = getSmartTeamColors(
                        home,
                        away,
                        colors,
                      );
                      return team
                        ? String(team.id) === String(away?.team?.id || away?.id)
                          ? awayColor
                          : homeColor
                        : theme.border;
                    } catch (e) {
                      return theme.border;
                    }
                  })(),
                },
              ]}
            >
              {selectedPlayer &&
                (() => {
                  const player = selectedPlayer.player;
                  const athlete = player?.athlete;
                  const meta = selectedPlayer.meta || {};
                  const labels = meta.labels || [];
                  const keys = meta.keys || [];
                  const stats = player?.stats || [];
                  const groupName = meta.groupName || "";
                  // Player info
                  const headshot = athlete?.headshot?.href;
                  const fullName =
                    athlete?.displayName || athlete?.fullName || "";
                  const shortName = athlete?.shortName || "";
                  const jersey = athlete?.jersey;
                  const position =
                    athlete?.position?.abbreviation ||
                    athlete?.position?.name ||
                    "";

                  // Team info - get from the team box that contains this player
                  let team = null;
                  let teamName = "";
                  let teamLogo = null;

                  // Regular logic for boxscore players
                  const playersBox = details?.boxscore?.players || [];
                  for (const teamBox of playersBox) {
                    if (teamBox?.statistics) {
                      for (const group of teamBox.statistics) {
                        if (group?.athletes) {
                          const found = group.athletes.find(
                            (a) =>
                              String(a?.athlete?.id) === String(athlete?.id),
                          );
                          if (found) {
                            team = teamBox.team;
                            break;
                          }
                        }
                      }
                      if (team) break;
                    }
                  }
                  teamName = team?.displayName || team?.name || "";
                  teamLogo =
                    team?.logo ||
                    (team?.abbreviation
                      ? getTeamLogoUrl("wnba", team.abbreviation)
                      : null);
                  const teamAbbreviation = team?.abbreviation || "";

                  const gameDate = details?.header?.competitions?.[0]?.date;
                  const formattedDate = gameDate
                    ? new Date(gameDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "";

                  // Determine smart colors for this game and pick headshot background
                  const { homeColor, awayColor } = getSmartTeamColors(
                    home,
                    away,
                    colors,
                  );
                  const headshotBg = team
                    ? String(team.id) === String(away?.team?.id || away?.id)
                      ? awayColor
                      : homeColor
                    : theme.surface;

                  // Define most important stats for basketball players
                  let importantStatIndices = [];
                  let importantLabels = [];

                  // Basketball players: PTS, REB, AST, FG%, 3P%, FT%, STL, BLK, TO
                  const basketballStats = [
                    "minutes",
                    "points",
                    "rebounds",
                    "assists",
                    "plusMinus",
                    "fouls",
                    "steals",
                    "blocks",
                    "turnovers",
                    "fieldGoalsMade-fieldGoalsAttempted",
                    "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
                    "freeThrowsMade-freeThrowsAttempted",
                  ];
                  basketballStats.forEach((statKey) => {
                    const idx = keys.indexOf(statKey);
                    if (idx >= 0) {
                      importantStatIndices.push(idx);
                      importantLabels.push(labels[idx] || statKey);
                    }
                  });

                  // If we don't have the specific keys, use the first available stats
                  if (importantStatIndices.length === 0 && stats.length > 0) {
                    importantStatIndices = stats
                      .map((_, idx) => idx)
                      .slice(0, 6);
                    importantLabels = labels.slice(0, 6);
                  }

                  return (
                    <>
                      <View style={styles.modalHeader}>
                        <View style={styles.modalPlayerInfo}>
                          {headshot ? (
                            <Image
                              source={{ uri: headshot }}
                              style={[
                                styles.modalHeadshot,
                                {
                                  backgroundColor: headshotBg || theme.surface,
                                },
                              ]}
                            />
                          ) : (
                            <View
                              style={[
                                styles.modalHeadshotPlaceholder,
                                { backgroundColor: theme.surface },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.modalInitials,
                                  { color: theme.textSecondary },
                                ]}
                              >
                                {fullName
                                  .split(" ")
                                  .map((n) => n.charAt(0))
                                  .join("")
                                  .toUpperCase()
                                  .slice(0, 2)}
                              </Text>
                            </View>
                          )}
                          <View style={styles.modalPlayerDetails}>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                flexWrap: "wrap",
                              }}
                            >
                              <Text
                                style={[
                                  styles.modalName,
                                  { color: theme.text },
                                ]}
                                numberOfLines={1}
                              >
                                {fullName}
                              </Text>
                              <Text
                                style={[
                                  styles.modalPlayerMeta,
                                  {
                                    color: theme.textSecondary,
                                    marginLeft: 8,
                                  },
                                ]}
                                numberOfLines={1}
                              >
                                {jersey && position
                                  ? `#${jersey} • ${position}`
                                  : jersey
                                    ? `#${jersey}`
                                    : position
                                      ? position
                                      : ""}
                              </Text>
                            </View>
                            <View style={styles.modalTeamRow}>
                              {teamLogo && (
                                <TeamLogoWithTheme
                                  colors={colors}
                                  getTeamLogoUrl={getTeamLogoUrl}
                                  teamAbbreviation={teamAbbreviation}
                                  style={styles.shareCardTeamLogo}
                                />
                              )}
                              <Text
                                style={[
                                  styles.modalTeam,
                                  { color: theme.textSecondary },
                                ]}
                                numberOfLines={1}
                              >
                                {teamName}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => setSelectedPlayer(null)}
                          style={styles.modalClose}
                        >
                          <Text style={{ fontSize: 18, color: theme.text }}>
                            ✕
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.modalStatsHeader}>
                        <Text
                          style={[
                            styles.modalStatsTitle,
                            { color: theme.text },
                          ]}
                        >
                          Game Statistics
                        </Text>
                        <Text
                          style={[
                            styles.modalStatsDate,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {formattedDate}
                        </Text>
                      </View>

                      <ScrollView
                        style={styles.modalStatsContainer}
                        contentContainerStyle={{ padding: 12 }}
                        scrollEnabled={false}
                      >
                        {importantStatIndices.length > 0 ? (
                          <View style={styles.modalStatsGrid}>
                            {importantStatIndices.map((statIdx, i) => (
                              <View
                                key={i}
                                style={[
                                  styles.modalStatBox,
                                  {
                                    backgroundColor:
                                      theme.surfaceSecondary || theme.surface,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.modalStatBoxValue,
                                    {
                                      color: getStatTextColor(
                                        keys[statIdx],
                                        stats[statIdx],
                                      ),
                                    },
                                  ]}
                                >
                                  {stats[statIdx] ?? "-"}
                                </Text>
                                <Text
                                  style={[
                                    styles.modalStatBoxLabel,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  {importantLabels[i]}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text
                            style={{
                              color: theme.textSecondary,
                              textAlign: "center",
                              marginTop: 20,
                            }}
                          >
                            No stats available
                          </Text>
                        )}
                      </ScrollView>
                    </>
                  );
                })()}
            </View>
          </View>
        </Modal>

        {/* Shareable Play Copy Card Modal (NHL goal share card style) */}
        <Modal
          visible={!!sharePlayCard}
          animationType="fade"
          transparent
          onRequestClose={() => setSharePlayCard(null)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.85)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              ref={sharePlayCardRef}
              collapsable={false}
              style={{
                backgroundColor: theme.surface,
                width: width - 48,
                overflow: "hidden",
              }}
            >
              {sharePlayCard &&
                (() => {
                  const p = sharePlayCard;

                  // Resolve scorer
                  const scorerId = p.scorerId || null;
                  const playersBox = details?.boxscore?.players || [];
                  let foundPlayer = null;
                  if (scorerId) {
                    for (const teamBox of playersBox) {
                      for (const group of teamBox.statistics || []) {
                        for (const athlete of group.athletes || []) {
                          const aid = String(
                            athlete?.athlete?.id ||
                              athlete?.athlete?.athleteId ||
                              athlete?.athlete?.athleteid ||
                              "",
                          );
                          if (aid === String(scorerId)) {
                            foundPlayer = {
                              athlete: athlete.athlete,
                              stats: athlete.stats || [],
                              team: teamBox.team,
                            };
                            break;
                          }
                        }
                        if (foundPlayer) break;
                      }
                      if (foundPlayer) break;
                    }
                  }

                  // Resolve assister (2nd participant)
                  const assistId =
                    p.rawPlay?.participants?.length > 1
                      ? p.rawPlay.participants[1]?.athlete?.id || null
                      : null;
                  let foundAssist = null;
                  if (assistId) {
                    for (const teamBox of playersBox) {
                      for (const group of teamBox.statistics || []) {
                        for (const athlete of group.athletes || []) {
                          const aid = String(
                            athlete?.athlete?.id ||
                              athlete?.athlete?.athleteId ||
                              "",
                          );
                          if (aid === String(assistId)) {
                            foundAssist = {
                              athlete: athlete.athlete,
                              team: teamBox.team,
                            };
                            break;
                          }
                        }
                        if (foundAssist) break;
                      }
                      if (foundAssist) break;
                    }
                  }
                  const assistName =
                    foundAssist?.athlete?.displayName ||
                    foundAssist?.athlete?.fullName ||
                    "";

                  const displayName =
                    (foundPlayer &&
                      (foundPlayer.athlete?.displayName ||
                        foundPlayer.athlete?.fullName)) ||
                    "Unknown Player";
                  const initials = displayName
                    .split(" ")
                    .map((n) => n.charAt(0))
                    .join("")
                    .toUpperCase()
                    .slice(0, 2);

                  // Resolve stats
                  const statLabels = ["PTS", "REB", "AST", "FG", "STL", "MIN"];
                  let statValues = statLabels.map(() => "-");
                  if (foundPlayer) {
                    const meta = findPlayerStatsMeta(foundPlayer) || {};
                    const mLabels = meta.labels || [];
                    const mKeys = meta.keys || [];
                    const normalize = (s) =>
                      (s || "")
                        .toString()
                        .replace(/[^a-z0-9]/gi, "")
                        .toLowerCase();
                    const findIndexFor = (target) => {
                      const nTarget = normalize(target);
                      for (let i = 0; i < mLabels.length; i++) {
                        if (normalize(mLabels[i]) === nTarget) return i;
                      }
                      for (let i = 0; i < mLabels.length; i++) {
                        if (
                          normalize(mLabels[i]).includes(nTarget) ||
                          nTarget.includes(normalize(mLabels[i]))
                        )
                          return i;
                      }
                      for (let i = 0; i < (mKeys || []).length; i++) {
                        if (
                          normalize(mKeys[i]).includes(nTarget) ||
                          nTarget.includes(normalize(mKeys[i]))
                        )
                          return i;
                      }
                      return -1;
                    };
                    statValues = statLabels.map((lbl) => {
                      const idx = findIndexFor(lbl);
                      if (
                        idx >= 0 &&
                        foundPlayer.stats &&
                        foundPlayer.stats[idx] != null
                      )
                        return String(foundPlayer.stats[idx]);
                      return "-";
                    });
                  }

                  // Determine headshot, team logo and color
                  let headshot = null;
                  let teamLogo = null;
                  let teamColor = null;
                  if (foundPlayer && foundPlayer.athlete) {
                    headshot =
                      foundPlayer.athlete.headshot?.href ||
                      foundPlayer.athlete.headshot ||
                      null;
                  }
                  if (foundPlayer && foundPlayer.team) {
                    teamLogo =
                      foundPlayer.team.logo ||
                      (foundPlayer.team.abbreviation
                        ? getTeamLogoUrl("wnba", foundPlayer.team.abbreviation)
                        : null);
                  } else if (p.playTeamId) {
                    const comp = details?.header?.competitions?.[0];
                    const competitors = comp?.competitors || [];
                    const awayC = competitors.find(
                      (c) => c.homeAway === "away",
                    );
                    const homeC = competitors.find(
                      (c) => c.homeAway === "home",
                    );
                    if (awayC?.team?.id === p.playTeamId) {
                      teamLogo = awayC?.team?.logo;
                    } else if (homeC?.team?.id === p.playTeamId) {
                      teamLogo = homeC?.team?.logo;
                    }
                  }
                  // Use smart team color already resolved by plays list
                  const safeTeamColor =
                    ensureHexColor(p.playTeamColor) ||
                    p.playTeamColor ||
                    colors.primary;
                  const textOnTeam = getTextOnColor(safeTeamColor);

                  const awayBold =
                    parseInt(p.awayScore) > parseInt(p.homeScore);
                  const homeBold =
                    parseInt(p.homeScore) > parseInt(p.awayScore);

                  return (
                    <>
                      {/* ── Header ── */}
                      <View
                        style={[
                          styles.wnbaCardHeader,
                          {
                            backgroundColor: `${safeTeamColor}33`,
                            borderBottomColor: safeTeamColor,
                            padding: 14,
                            borderBottomWidth: 2,
                          },
                        ]}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 2,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: "700",
                              color: theme.text,
                            }}
                          >
                            {p.clock || ""}
                            {p.period ? ` \u2022 ${p.period}` : ""}
                          </Text>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            {p.awayLogoUri ? (
                              <TeamLogoWithTheme
                                colors={colors}
                                getTeamLogoUrl={getTeamLogoUrl}
                                logoUri={p.awayLogoUri}
                                size={26}
                                style={{
                                  width: 26,
                                  height: 26,
                                  marginHorizontal: -4,
                                }}
                              />
                            ) : null}
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "700",
                                color: theme.text,
                              }}
                            >
                              <Text
                                style={{ fontWeight: awayBold ? "800" : "400" }}
                              >
                                {p.awayScore ?? "0"}
                              </Text>
                              {" - "}
                              <Text
                                style={{ fontWeight: homeBold ? "800" : "400" }}
                              >
                                {p.homeScore ?? "0"}
                              </Text>
                            </Text>
                            {p.homeLogoUri ? (
                              <TeamLogoWithTheme
                                colors={colors}
                                getTeamLogoUrl={getTeamLogoUrl}
                                logoUri={p.homeLogoUri}
                                size={26}
                                style={{
                                  width: 26,
                                  height: 26,
                                  marginHorizontal: -4,
                                }}
                              />
                            ) : null}
                          </View>
                        </View>
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "800",
                            color: theme.text,
                          }}
                        >
                          <Ionicons
                            name="basketball"
                            size={14}
                            color={theme.text}
                          />{" "}
                          {p.scoreValue ? `${p.scoreValue}PT Basket` : "Basket"}
                        </Text>
                        {!!p.playText && (
                          <Text
                            style={{
                              marginTop: 5,
                              fontSize: 11,
                              fontWeight: "500",
                              color: theme.textSecondary,
                              lineHeight: 16,
                            }}
                            numberOfLines={2}
                          >
                            {p.playText}
                          </Text>
                        )}
                      </View>

                      {/* ── Body ── */}
                      <View
                        style={{ paddingVertical: 14, paddingHorizontal: 14 }}
                      >
                        <View
                          style={{
                            width: "100%",
                            flexDirection: "row",
                            alignItems: "stretch",
                            gap: 10,
                            position: "relative",
                          }}
                        >
                          {/* Court column */}
                          <View
                            style={{
                              flex: 1,
                              borderRadius: 12,
                              paddingVertical: 6,
                              paddingHorizontal: 4,
                              alignItems: "center",
                              justifyContent: "center",
                              overflow: "hidden",
                            }}
                          >
                            <View
                              style={{
                                transform: [{ rotate: "0deg" }, { scale: 1 }],
                              }}
                            >
                              <BasketballCourt
                                key={`share-court-${p.id}`}
                                coordinate={(() => {
                                  if (
                                    p.coordX != null &&
                                    p.coordY != null &&
                                    p.coordX > -1000000 &&
                                    p.coordY > -1000000 &&
                                    p.coordX < 1000000 &&
                                    p.coordY < 1000000
                                  ) {
                                    return { x: p.coordX, y: p.coordY };
                                  }
                                  return { x: 25, y: 17 };
                                })()}
                                isScoring={p.isScoring}
                                teamSide={
                                  away?.team?.id === p.playTeamId
                                    ? "away"
                                    : "home"
                                }
                                teamColor={
                                  ensureHexColor(p.playTeamColor) ||
                                  safeTeamColor
                                }
                                styles={styles}
                              />
                            </View>
                          </View>

                          {/* Divider */}
                          <View
                            pointerEvents="none"
                            style={{
                              position: "absolute",
                              left: "50%",
                              marginLeft: -0.5,
                              top: 8,
                              width: 1,
                              bottom: 8,
                              backgroundColor: theme.border,
                            }}
                          />

                          {/* Player column */}
                          <View
                            style={{
                              flex: 1,
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 0,
                            }}
                          >
                            {headshot ? (
                              <Image
                                source={{ uri: headshot }}
                                style={{
                                  width: 72,
                                  height: 72,
                                  borderRadius: 36,
                                  borderWidth: 2,
                                  borderColor: safeTeamColor,
                                  backgroundColor: `${safeTeamColor}66`,
                                }}
                                contentFit="cover"
                              />
                            ) : (
                              <View
                                style={{
                                  width: 72,
                                  height: 72,
                                  borderRadius: 36,
                                  borderWidth: 2,
                                  borderColor: safeTeamColor,
                                  backgroundColor: `${safeTeamColor}66`,
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 24,
                                    fontWeight: "800",
                                    color: textOnTeam,
                                  }}
                                >
                                  {initials}
                                </Text>
                              </View>
                            )}

                            <Text
                              style={{
                                fontSize: 17,
                                fontWeight: "800",
                                textAlign: "center",
                                color: theme.text,
                                marginBottom: 4,
                              }}
                              numberOfLines={1}
                            >
                              {displayName}
                            </Text>

                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              {teamLogo ? (
                                <TeamLogoWithTheme
                                  colors={colors}
                                  getTeamLogoUrl={getTeamLogoUrl}
                                  teamAbbreviation={
                                    foundPlayer?.team?.abbreviation || ""
                                  }
                                  style={{ width: 24, height: 24 }}
                                />
                              ) : null}
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: "600",
                                  color: theme.textSecondary,
                                }}
                                numberOfLines={1}
                              >
                                {foundPlayer?.team?.displayName || ""}
                              </Text>
                            </View>

                            {!!assistName && (
                              <View
                                style={{
                                  marginTop: 4,
                                  alignItems: "center",
                                  width: "100%",
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 9,
                                    fontWeight: "800",
                                    letterSpacing: 0.6,
                                    textTransform: "uppercase",
                                    color: theme.textSecondary,
                                    marginBottom: 2,
                                  }}
                                >
                                  ASSISTED BY
                                </Text>
                                <Text
                                  style={{
                                    fontSize: 12,
                                    fontWeight: "700",
                                    color: theme.text,
                                    textAlign: "center",
                                  }}
                                  numberOfLines={1}
                                >
                                  {assistName}
                                </Text>
                              </View>
                            )}

                            <View
                              style={{
                                marginTop: 6,
                                width: "100%",
                                flexDirection: "row",
                                flexWrap: "wrap",
                              }}
                            >
                              {statLabels.slice(0, 6).map((lbl, i) => (
                                <View
                                  key={lbl}
                                  style={{
                                    alignItems: "center",
                                    width: "33.333%",
                                    paddingVertical: 8,
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 15,
                                      fontWeight: "800",
                                      color: theme.text,
                                    }}
                                  >
                                    {statValues[i]}
                                  </Text>
                                  <Text
                                    style={{
                                      marginTop: 1,
                                      fontSize: 9,
                                      fontWeight: "700",
                                      letterSpacing: 0.3,
                                      textTransform: "uppercase",
                                      color: theme.textSecondary,
                                    }}
                                  >
                                    {lbl}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        </View>
                      </View>

                      {/* ── Footer ── */}
                      <View
                        style={{
                          borderTopWidth: StyleSheet.hairlineWidth,
                          paddingVertical: 6,
                          paddingHorizontal: 12,
                          alignItems: "flex-end",
                          borderTopColor: theme.border,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: "800",
                            letterSpacing: 0.5,
                            color: theme.text,
                          }}
                        >
                          SportsHeart{" "}
                          <Ionicons
                            name="heart"
                            size={10}
                            color={colors.primary}
                          />
                        </Text>
                      </View>
                    </>
                  );
                })()}
            </View>

            {/* Share actions */}
            <View style={[styles.shareCardActions, { marginTop: 12 }]}>
              <View style={styles.shareCardTopButtons}>
                <TouchableOpacity
                  style={[
                    styles.shareCardButton,
                    { backgroundColor: colors.secondary },
                  ]}
                  onPress={async () => {
                    try {
                      const uri = await captureRef(sharePlayCardRef, {
                        format: "png",
                        quality: 2,
                      });
                      if (Platform.OS === "ios" || Platform.OS === "android") {
                        await Sharing.shareAsync(uri, {
                          mimeType: "image/png",
                          UTI: "public.png",
                          dialogTitle: "Share Play",
                        });
                      } else {
                        await Share.share({ url: uri, title: "Play" });
                      }
                    } catch (e) {
                      console.error("Error sharing play copy card", e);
                      Alert.alert("Error", "Failed to share play copy card");
                    }
                  }}
                >
                  <Ionicons name="share-outline" size={20} color="white" />
                  <Text style={styles.shareCardButtonText}>Share</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.shareCardCancelButton,
                    { backgroundColor: theme.surfaceSecondary },
                  ]}
                  onPress={() => setSharePlayCard(null)}
                >
                  <Ionicons name="close" size={20} color={theme.text} />
                  <Text
                    style={[styles.shareCardButtonText, { color: theme.text }]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Shareable Player Card Modal */}
        <Modal
          visible={!!shareCardPlayer}
          animationType="fade"
          transparent
          onRequestClose={() => setShareCardPlayer(null)}
        >
          <View
            style={[
              styles.modalOverlay,
              { backgroundColor: "rgba(0,0,0,0.85)" },
            ]}
          >
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
              }}
            >
              <View
                ref={shareCardRef}
                collapsable={false}
                style={[
                  styles.wnbaShareCard,
                  { width: width - 48, backgroundColor: theme.surface },
                ]}
              >
                {shareCardPlayer &&
                  (() => {
                    const player = shareCardPlayer.player;
                    const athlete = player?.athlete;
                    const meta = shareCardPlayer.meta || {};
                    const labels = meta.labels || [];
                    const keys = meta.keys || [];
                    const stats = player?.stats || [];

                    // Player info
                    const headshot = `https://a.espncdn.com/combiner/i?img=/i/headshots/wnba/players/full/${athlete?.id}.png&w=300`;
                    const hasValidHeadshot =
                      !!athlete?.id && !shareCardHeadshotError;
                    const fullName =
                      athlete?.displayName || athlete?.fullName || "";
                    const jersey = athlete?.jersey;
                    const position =
                      athlete?.position?.name ||
                      athlete?.position?.abbreviation ||
                      "";

                    // Team info
                    let team = null;

                    const playersBox = details?.boxscore?.players || [];
                    for (const teamBox of playersBox) {
                      if (teamBox?.statistics) {
                        for (const group of teamBox.statistics) {
                          if (group?.athletes) {
                            const found = group.athletes.find(
                              (a) =>
                                String(a?.athlete?.id) === String(athlete?.id),
                            );
                            if (found) {
                              team = teamBox.team;
                              break;
                            }
                          }
                        }
                        if (team) break;
                      }
                    }
                    const teamName = team?.displayName || team?.name || "";
                    const teamLogo = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/wnba/500${isDarkMode ? "-dark" : ""}/${team?.abbreviation}.png&w=80&h=80`;
                    // Smart team color resolution (avoids similar team colors)
                    const _shrBoxTeams = details?.boxscore?.teams || [];
                    const _shrAwayEntry =
                      _shrBoxTeams.find((t) => t.homeAway === "away") ||
                      _shrBoxTeams[0] ||
                      null;
                    const _shrHomeEntry =
                      _shrBoxTeams.find((t) => t.homeAway === "home") ||
                      _shrBoxTeams[1] ||
                      null;
                    const _shrSmartColors =
                      _shrAwayEntry && _shrHomeEntry
                        ? getSmartTeamColors(
                            _shrHomeEntry,
                            _shrAwayEntry,
                            colors,
                          )
                        : null;
                    const _shrIsAwayTeam =
                      team?.id &&
                      String(team.id) === String(_shrAwayEntry?.team?.id);
                    const teamColor = _shrSmartColors
                      ? _shrIsAwayTeam
                        ? _shrSmartColors.awayColor
                        : _shrSmartColors.homeColor
                      : team?.color
                        ? team.color.startsWith("#")
                          ? team.color
                          : `#${team.color}`
                        : colors.primary || "#333";

                    // Get game info for score display
                    const competition = details?.header?.competitions?.[0];
                    const competitors = competition?.competitors || [];
                    const awayCompetitor = competitors.find(
                      (c) => c.homeAway === "away",
                    );
                    const homeCompetitor = competitors.find(
                      (c) => c.homeAway === "home",
                    );
                    const awayScore = awayCompetitor?.score || "0";
                    const homeScore = homeCompetitor?.score || "0";
                    const awayLogo =
                      awayCompetitor?.team?.logos?.[isDarkMode ? "1" : "0"]
                        ?.href || awayCompetitor?.team?.logo;
                    const homeLogo =
                      homeCompetitor?.team?.logos?.[isDarkMode ? "1" : "0"]
                        ?.href || homeCompetitor?.team?.logo;

                    const textOnTeam = getTextOnColor(teamColor);

                    // Helper: parse "M-A" → percentage string or null
                    const slashPct = (val) => {
                      const m = String(val || "").match(/^(\d+)-(\d+)$/);
                      if (!m) return null;
                      const made = parseInt(m[1], 10);
                      const att = parseInt(m[2], 10);
                      if (att === 0) return "0%";
                      return `${Math.round((made / att) * 100)}%`;
                    };

                    // Best-3 stat summary (stacked value/label per stat)
                    const SUMMARY_CANDIDATES = [
                      { key: "points", label: "PTS" },
                      { key: "rebounds", label: "REB" },
                      { key: "assists", label: "AST" },
                      { key: "steals", label: "STL" },
                      { key: "blocks", label: "BLK" },
                      {
                        key: "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
                        label: "3PM",
                      },
                    ];
                    const SUMMARY_FALLBACKS = [
                      { key: "points", label: "PTS" },
                      { key: "rebounds", label: "REB" },
                      { key: "assists", label: "AST" },
                    ];
                    const resolveStat = ({ key, label }) => {
                      const idx = keys.indexOf(key);
                      if (idx < 0) return null;
                      const raw = stats[idx];
                      const val = raw != null ? String(raw) : null;
                      if (val == null) return null;
                      const num = parseFloat(val.replace(/[^0-9.\-]/g, ""));
                      return {
                        label,
                        val,
                        num: isNaN(num) ? 0 : Math.abs(num),
                      };
                    };
                    const earned = SUMMARY_CANDIDATES.map(resolveStat)
                      .filter((s) => s && s.num > 0)
                      .sort((a, b) => b.num - a.num)
                      .slice(0, 3);
                    // Fill to 3 with PTS/REB/AST if needed (skip any already earned)
                    if (earned.length < 3) {
                      const earnedKeys = new Set(
                        SUMMARY_CANDIDATES.filter((_, i) =>
                          earned.some(
                            (e) => e.label === SUMMARY_CANDIDATES[i]?.label,
                          ),
                        ).map((c) => c.key),
                      );
                      for (const fb of SUMMARY_FALLBACKS) {
                        if (earned.length >= 3) break;
                        if (earnedKeys.has(fb.key)) continue;
                        const s = resolveStat(fb);
                        if (s) {
                          earned.push(s);
                          earnedKeys.add(fb.key);
                        }
                      }
                    }
                    const summaryStats = earned.slice(0, 3);

                    // 12-stat grid: 9 core + MIN, +/-, FOULS
                    const TWELVE_STATS = [
                      { key: "points", label: "PTS", slash: false },
                      { key: "rebounds", label: "REB", slash: false },
                      { key: "assists", label: "AST", slash: false },
                      { key: "steals", label: "STL", slash: false },
                      { key: "blocks", label: "BLK", slash: false },
                      { key: "turnovers", label: "TO", slash: false },
                      { key: "minutes", label: "MIN", slash: false },
                      {
                        key: "plusMinus",
                        label: "+/-",
                        slash: false,
                        isPlusMinus: true,
                      },
                      { key: "fouls", label: "FOULS", slash: false },
                      {
                        key: "fieldGoalsMade-fieldGoalsAttempted",
                        label: "FG",
                        slash: true,
                      },
                      {
                        key: "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
                        label: "3PT",
                        slash: true,
                      },
                      {
                        key: "freeThrowsMade-freeThrowsAttempted",
                        label: "FT",
                        slash: true,
                      },
                    ];
                    const twelveStats = TWELVE_STATS.map(
                      ({ key, label, slash, isPlusMinus }) => {
                        const idx = keys.indexOf(key);
                        const raw =
                          idx >= 0 && stats[idx] != null ? stats[idx] : null;
                        const val = raw != null ? String(raw) : "\u2014";
                        const pct = slash && raw != null ? slashPct(raw) : null;
                        return { label, val, pct, isPlusMinus };
                      },
                    );

                    return (
                      <>
                        {/* ── Header ── */}
                        <View
                          style={[
                            styles.wnbaCardHeader,
                            {
                              backgroundColor: teamColor + "22",
                              borderBottomColor: teamColor,
                            },
                          ]}
                        >
                          {/* Top row: position badge + score */}
                          <View style={styles.wnbaCardTopRow}>
                            <View
                              style={[
                                styles.wnbaPosBadge,
                                { backgroundColor: teamColor },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.wnbaPosBadgeText,
                                  { color: textOnTeam },
                                ]}
                              >
                                {jersey ? `#${jersey}` : ""}
                                {jersey && position ? " \u2022 " : ""}
                                {position}
                              </Text>
                            </View>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              {!!awayLogo && (
                                <Image
                                  source={{ uri: awayLogo }}
                                  style={{ width: 18, height: 18 }}
                                  resizeMode="contain"
                                />
                              )}
                              <Text
                                style={[
                                  styles.wnbaCardScoreText,
                                  { color: theme.text },
                                ]}
                              >
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
                              {!!homeLogo && (
                                <Image
                                  source={{ uri: homeLogo }}
                                  style={{ width: 18, height: 18 }}
                                  resizeMode="contain"
                                />
                              )}
                            </View>
                          </View>

                          {/* Headshot + name/summary row */}
                          <View style={styles.wnbaHeadshotRow}>
                            {hasValidHeadshot ? (
                              <Image
                                source={{ uri: headshot }}
                                style={[
                                  styles.wnbaCardHeadshot,
                                  { borderColor: teamColor },
                                ]}
                                onError={() => setShareCardHeadshotError(true)}
                                resizeMode="cover"
                              />
                            ) : (
                              <View
                                style={[
                                  styles.wnbaCardHeadshot,
                                  {
                                    borderColor: teamColor,
                                    backgroundColor: teamColor + "22",
                                    justifyContent: "center",
                                    alignItems: "center",
                                  },
                                ]}
                              >
                                <Text
                                  style={{
                                    fontSize: 20,
                                    fontWeight: "800",
                                    color: "#fff",
                                  }}
                                >
                                  {fullName
                                    .split(" ")
                                    .map((n) => n.charAt(0))
                                    .join("")
                                    .toUpperCase()
                                    .slice(0, 2)}
                                </Text>
                              </View>
                            )}
                            <View style={styles.wnbaNameBlock}>
                              {summaryStats.length > 0 && (
                                <View style={styles.wnbaSummaryRow}>
                                  {summaryStats.map(({ val, label }) => (
                                    <View
                                      key={label}
                                      style={styles.wnbaSummaryCell}
                                    >
                                      <Text
                                        style={[
                                          styles.wnbaSummaryVal,
                                          { color: theme.text },
                                        ]}
                                      >
                                        {val}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.wnbaSummaryLbl,
                                          { color: theme.textSecondary },
                                        ]}
                                      >
                                        {label}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
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
                                    style={[
                                      styles.wnbaCardFullName,
                                      { color: theme.text },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {fullName}
                                  </Text>
                                  {!!teamName && (
                                    <View style={styles.wnbaTeamNameRow}>
                                      {!!teamLogo && (
                                        <Image
                                          source={{ uri: teamLogo }}
                                          style={styles.wnbaTeamNameLogo}
                                          resizeMode="contain"
                                        />
                                      )}
                                      <Text
                                        style={[
                                          styles.wnbaTeamNameLabel,
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
                                    const _monthDate = _gd.toLocaleDateString(
                                      "en-US",
                                      { month: "short", day: "numeric" },
                                    );
                                    const _year = _gd.toLocaleDateString(
                                      "en-US",
                                      { year: "numeric" },
                                    );
                                    return (
                                      <View
                                        style={{
                                          alignItems: "flex-end",
                                          marginLeft: 6,
                                        }}
                                      >
                                        <Text
                                          style={[
                                            styles.wnbaTeamNameLabel,
                                            { color: theme.textSecondary },
                                          ]}
                                        >
                                          {_monthDate}
                                        </Text>
                                        <Text
                                          style={[
                                            styles.wnbaTeamNameLabel,
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

                        {/* ── 4×3 Stat Grid ── */}
                        <View style={styles.wnbaStatGrid}>
                          {twelveStats.map(
                            ({ label, val, pct, isPlusMinus }, i) => {
                              const pmNum = isPlusMinus
                                ? parseFloat(
                                    String(val).replace(/[^0-9.\-]/g, ""),
                                  )
                                : null;
                              const pmColor =
                                isPlusMinus && !isNaN(pmNum)
                                  ? pmNum > 0
                                    ? theme.success
                                    : pmNum < 0
                                      ? theme.error
                                      : theme.text
                                  : theme.text;
                              return (
                                <View
                                  key={label}
                                  style={[
                                    styles.wnbaStatCell,
                                    { borderColor: theme.border },
                                    i % 3 !== 2 && {
                                      borderRightWidth:
                                        StyleSheet.hairlineWidth,
                                    },
                                    i < 9 && {
                                      borderBottomWidth:
                                        StyleSheet.hairlineWidth,
                                    },
                                  ]}
                                >
                                  {!!pct && (
                                    <Text
                                      style={[
                                        styles.wnbaStatPct,
                                        { color: theme.textSecondary },
                                      ]}
                                    >
                                      {pct}
                                    </Text>
                                  )}
                                  <Text
                                    style={[
                                      styles.wnbaStatVal,
                                      { color: pmColor },
                                    ]}
                                  >
                                    {val}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.wnbaStatLbl,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    {label}
                                  </Text>
                                </View>
                              );
                            },
                          )}
                        </View>
                      </>
                    );
                  })()}
                {/* ── Footer ── */}
                <View
                  style={[
                    styles.wnbaCardFooter,
                    { borderTopColor: theme.border },
                  ]}
                >
                  <Text style={[styles.wnbaCardBrand, { color: theme.text }]}>
                    SportsHeart{" "}
                    <Ionicons name="heart" size={10} color={colors.primary} />
                  </Text>
                </View>
              </View>

              {/* Share buttons below the card */}
              <View style={styles.shareCardActions}>
                <View style={styles.shareCardTopButtons}>
                  <TouchableOpacity
                    style={[
                      styles.shareCardButton,
                      { backgroundColor: colors.secondary },
                    ]}
                    onPress={async () => {
                      try {
                        const uri = await captureRef(shareCardRef, {
                          format: "png",
                          quality: 2,
                        });

                        if (
                          Platform.OS === "ios" ||
                          Platform.OS === "android"
                        ) {
                          await Sharing.shareAsync(uri, {
                            mimeType: "image/png",
                            UTI: "public.png",
                            dialogTitle: "Share Player Stats",
                          });
                        } else {
                          await Share.share({
                            url: uri,
                            title: "Player Stats",
                          });
                        }
                      } catch (error) {
                        console.error("Error sharing:", error);
                        Alert.alert("Error", "Failed to share player stats");
                      }
                    }}
                  >
                    <Ionicons name="share-outline" size={24} color="white" />
                    <Text style={styles.shareCardButtonText}>Share</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.shareCardCancelButton,
                      { backgroundColor: theme.surfaceSecondary },
                    ]}
                    onPress={() => setShareCardPlayer(null)}
                  >
                    <Ionicons name="close" size={24} color={theme.text} />
                    <Text
                      style={[
                        styles.shareCardButtonText,
                        { color: theme.text },
                      ]}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>

        {/* WNBA Player Detail Modal */}
        <WNBAPlayerDetailModal
          visible={!!selectedModalPlayer}
          onClose={() => setSelectedModalPlayer(null)}
          player={selectedModalPlayer}
          allPlayers={allModalPlayers}
          details={details}
          theme={theme}
          colors={colors}
          isDarkMode={isDarkMode}
          getTeamLogoUrl={getTeamLogoUrl}
          navigation={navigation}
          findPlayerStatsMeta={findPlayerStatsMeta}
          onShare={(player) => {
            setSelectedModalPlayer(null);
            setShareCardPlayer({
              player,
              meta: player?.meta || findPlayerStatsMeta?.(player) || {},
              displayName:
                player?.athlete?.displayName ||
                player?.athlete?.fullName ||
                "Unknown Player",
            });
          }}
        />

        {/* Stream Modal - Only render when streaming is unlocked */}
        {isStreamingUnlocked && (
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
                      styles.streamModalCloseButton,
                      { backgroundColor: theme.surfaceSecondary },
                    ]}
                    onPress={closeStreamModal}
                  >
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.streamModalCloseText,
                        { color: colors.primary },
                      ]}
                    >
                      ×
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Stream Source Buttons */}
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
                  {Object.keys(availableStreams)
                    .slice(0, 5)
                    .map((source) => (
                      <TouchableOpacity
                        key={source}
                        style={[
                          styles.streamSourceButton,
                          {
                            backgroundColor:
                              currentStreamType === source
                                ? colors.primary
                                : theme.surfaceSecondary,
                          },
                          { borderColor: theme.border },
                        ]}
                        onPress={() => switchStream(source)}
                      >
                        <Text
                          allowFontScaling={false}
                          style={[
                            styles.streamSourceButtonText,
                            {
                              color:
                                currentStreamType === source
                                  ? "#fff"
                                  : colors.primary,
                            },
                          ]}
                        >
                          {source.charAt(0).toUpperCase() + source.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
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
                      style={styles.streamWebView}
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
                        console.error("WebView error:", error);
                        setIsStreamLoading(false);
                      }}
                      userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1"
                      injectedJavaScript={`(function(){
                        // Diagnostics instrumentation for native WebView
                        function post(obj){
                          try{ window.ReactNativeWebView.postMessage(JSON.stringify(obj)); }catch(e){}
                        }

                        post({type:'instrumentation', event:'init'});

                        // Log important lifecycle events
                        window.addEventListener('load', function(){ post({type:'lifecycle', event:'load', href:location.href}); });
                        document.addEventListener('DOMContentLoaded', function(){ post({type:'lifecycle', event:'domcontent', href:location.href}); });

                        // Observe navigation attempts via assign/replace/href
                        try{ const origAssign = Location.prototype.assign; Location.prototype.assign = function(url){ post({type:'nav', method:'assign', url:url}); return origAssign.call(this, url); }; }catch(e){}
                        try{ const origReplace = Location.prototype.replace; Location.prototype.replace = function(url){ post({type:'nav', method:'replace', url:url}); return origReplace.call(this, url); }; }catch(e){}
                        try{ const hrefDesc = Object.getOwnPropertyDescriptor(Location.prototype,'href') || {}; if(hrefDesc && hrefDesc.set){ const origHrefSet = hrefDesc.set; Object.defineProperty(Location.prototype,'href',{ set:function(url){ post({type:'nav', method:'href', url:url}); return origHrefSet.call(this,url); }, get: hrefDesc.get }); } }catch(e){}

                        try{ const origOpen = window.open; window.open = function(url, target, features){ post({type:'nav', method:'window.open', url:url, target:target}); return origOpen.call(this,url,target,features); }; }catch(e){}

                        try{ const observer = new MutationObserver(function(muts){ muts.forEach(m => { m.addedNodes && m.addedNodes.forEach(n=>{ if(n.nodeType===1){ const tag = n.tagName.toLowerCase(); if(tag==='video' || tag==='iframe' || n.querySelector && (n.querySelector('video')||n.querySelector('iframe'))){ post({type:'dom', action:'added', tag:tag, html:n.outerHTML ? (n.outerHTML.substring(0,200)) : null, href:location.href}); } } }); m.removedNodes && m.removedNodes.forEach(n=>{ if(n.nodeType===1){ const tag = n.tagName.toLowerCase(); if(tag==='video' || tag==='iframe' || (n.querySelector && (n.querySelector('video')||n.querySelector('iframe')))){ post({type:'dom', action:'removed', tag:tag, href:location.href}); } } }); }); }); observer.observe(document.documentElement || document.body, { childList:true, subtree:true }); post({type:'instrumentation', event:'observer_started'}); }catch(e){ post({type:'instrumentation', event:'observer_error', error:String(e)}); }

                        function instrumentExistingVideos(){ const videos = document.querySelectorAll('video'); videos.forEach(v=>{ if(!v.__instrumented){ v.__instrumented = true; v.addEventListener('play', ()=>post({type:'video', event:'play', src:v.currentSrc || v.src, href:location.href})); v.addEventListener('pause', ()=>post({type:'video', event:'pause', src:v.currentSrc || v.src, href:location.href})); v.addEventListener('ended', ()=>post({type:'video', event:'ended', src:v.currentSrc || v.src, href:location.href})); } }); }
                        setInterval(instrumentExistingVideos,1000);

                        true;
                      })();`}
                      onMessage={(event) => {
                        try {
                          const data = JSON.parse(event.nativeEvent.data);
                          console.log("WebView instrumentation:", data);
                        } catch (e) {
                          console.log(
                            "WebView message (raw):",
                            event.nativeEvent.data,
                          );
                        }
                      }}
                      onNavigationStateChange={(navState) => {
                        console.log("WebView navigation state change:", {
                          url: navState.url,
                          title: navState.title,
                          loading: navState.loading,
                        });
                      }}
                      onShouldStartLoadWithRequest={(request) => {
                        console.log(
                          "WNBA WebView navigation request:",
                          request.url,
                        );

                        // Allow the initial stream URL to load
                        if (request.url === streamUrl) {
                          return true;
                        }

                        // Keywords that often indicate popups/ads
                        const popupKeywords = [
                          "popup",
                          "ad",
                          "ads",
                          "click",
                          "redirect",
                          "promo",
                        ];
                        const urlLower = request.url.toLowerCase();
                        const hasPopupKeywords = popupKeywords.some((keyword) =>
                          urlLower.includes(keyword),
                        );

                        // Determine domains and allow same root/subdomains
                        const currentDomain = new URL(streamUrl).hostname;
                        let requestDomain = "";
                        try {
                          requestDomain = new URL(request.url).hostname;
                        } catch (e) {
                          // Allow about:blank/data: URLs used by embeds
                          if (
                            urlLower.startsWith("about:blank") ||
                            urlLower.startsWith("data:")
                          ) {
                            return true;
                          }
                          console.log("Invalid URL:", request.url);
                          return false;
                        }

                        const sameRootDomain =
                          requestDomain === currentDomain ||
                          requestDomain.endsWith(`.${currentDomain}`) ||
                          currentDomain.endsWith(`.${requestDomain}`);

                        // Allow certain embed/navigation patterns even when cross-domain
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

                        // Block navigation if it looks like a popup/ad and not an embed/resource
                        if (hasPopupKeywords && !allowIfEmbed) {
                          console.log(
                            "Blocked WNBA popup/cross-domain navigation:",
                            request.url,
                          );
                          return false;
                        }

                        // If it's same root domain or matches known embed/resource patterns, allow
                        if (sameRootDomain || allowIfEmbed) {
                          return true;
                        }

                        console.log(
                          "Blocked WNBA popup/cross-domain navigation:",
                          request.url,
                        );
                        return false;
                      }}
                      onOpenWindow={() => false}
                    />
                  ) : (
                    <View style={styles.noStreamContainer}>
                      <Text
                        style={[styles.noStreamText, { color: theme.text }]}
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
      </Animated.ScrollView>

      {isLoggedIn && (
        <>
          {/* Floating Chat Button */}
          <TouchableOpacity
            style={[
              styles.floatingChatButton,
              { backgroundColor: colors.secondary },
            ]}
            onPress={() => setChatModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={24}
              color="#fff"
            />
          </TouchableOpacity>

          {/* Chat Modal */}
          <Modal
            animationType="slide"
            transparent={true}
            visible={chatModalVisible}
            onRequestClose={() => setChatModalVisible(false)}
            presentationStyle="pageSheet"
          >
            <View style={styles.chatModalOverlay}>
              <View
                style={[
                  styles.chatModalContent,
                  { backgroundColor: theme.surface, paddingBottom: 20 },
                ]}
              >
                {/* Chat Modal Header */}
                <View
                  style={[
                    styles.chatModalHeader,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.chatModalTitle, { color: theme.text }]}
                  >
                    {details?.header?.competitions?.[0]?.competitors
                      ? `${
                          details.header.competitions[0].competitors.find(
                            (c) => c.homeAway === "away",
                          )?.team?.name || "Away"
                        } vs ${
                          details.header.competitions[0].competitors.find(
                            (c) => c.homeAway === "home",
                          )?.team?.name || "Home"
                        }`
                      : "Chat"}
                  </Text>
                  <TouchableOpacity
                    style={styles.chatModalCloseButton}
                    onPress={() => setChatModalVisible(false)}
                  >
                    <Ionicons name="close" size={24} color={theme.text} />
                  </TouchableOpacity>
                </View>

                {/* Chat Content */}
                <View style={styles.chatModalBody}>
                  {details && (
                    <ChatComponent
                      gameId={gameId}
                      gameData={details}
                      hideHeader={true}
                    />
                  )}
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
};

// Insert modal component outside main return so it can be referenced by styles if needed
// (We'll render it conditionally inside the component below)

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  teamRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  logo: { width: 48, height: 48, marginRight: 12 },
  // Sticky header styles (from NFL)
  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "white",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 1000,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  stickyTeamAway: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-start",
  },
  stickyTeamHome: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-end",
  },
  stickyTeamLogo: {
    width: 28,
    height: 28,
    marginHorizontal: 8,
  },
  stickyTeamScore: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#013369",
    minWidth: 35,
    textAlign: "center",
  },
  stickyTeamName: {
    fontSize: 14,
    fontWeight: "600",
    marginHorizontal: 8,
  },
  stickyStatus: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  stickyStatusText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#013369",
    textAlign: "center",
  },
  stickyClock: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    marginTop: 2,
  },
  /* Soccer-like header card styles */
  headerCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  competitionText: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  headerMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  teamBlock: {
    flex: 1,
    alignItems: "center",
  },
  teamLogoLarge: {
    width: 56,
    height: 56,
    marginBottom: 8,
  },
  teamNameLarge: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  scorerText: {
    fontSize: 12,
    marginTop: 4,
  },
  scoreBlock: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  scoreLarge: {
    fontSize: 36,
    fontWeight: "800",
  },
  statusBadge: {
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusBadgeText: {
    color: "#fff",
    fontWeight: "700",
  },
  dateText: {
    marginTop: 12,
    textAlign: "center",
    fontSize: 12,
  },

  /* Scorers section styles */
  scorersSection: {
    marginTop: 12,
    marginBottom: 8,
  },
  scorersList: {
    marginBottom: 8,
  },
  scorerItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    justifyContent: "center",
  },
  scorerIcon: {
    marginRight: 6,
  },
  scorerText: {
    fontSize: 13,
    fontWeight: "500",
  },
  scorersSectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 8,
  },
  scorersColumn: {
    flex: 1,
    paddingHorizontal: 8,
  },
  scorersCenter: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Faceoff bar styles */
  faceoffContainer: {
    alignItems: "center",
    marginVertical: 20,
  },
  faceoffTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
  },
  faceoffBarContainer: {
    alignItems: "center",
    width: "80%",
  },
  faceoffBar: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    backgroundColor: "#f0f0f0",
    flexDirection: "row",
    overflow: "hidden",
  },
  faceoffBarSegment: {
    height: "100%",
  },
  faceoffLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 16,
  },
  faceoffLabel: {
    flexDirection: "row",
    alignItems: "center",
  },
  faceoffColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  faceoffLabelText: {
    fontSize: 14,
    fontWeight: "500",
  },

  /* Team stats styles */
  teamStatsContainer: {
    marginVertical: 12,
    paddingHorizontal: 4,
    width: "100%",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
    textAlign: "center",
  },
  statsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  teamStatsTeamName: {
    fontSize: 16,
    fontWeight: "600",
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  statValue: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },
  statLabel: {
    flex: 2,
    fontSize: 14,
    textAlign: "center",
  },

  /* Leaders styles */
  leadersContainer: {
    marginVertical: 20,
    paddingHorizontal: 0,
  },
  teamLeadersContainer: {
    marginBottom: 24,
    paddingHorizontal: 0,
  },
  teamLeadersHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  teamLeadersLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  teamLeadersName: {
    fontSize: 16,
    fontWeight: "600",
  },
  leaderCategory: {
    marginBottom: 16,
    paddingLeft: 0,
  },
  leaderCategoryTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  leaderItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  leaderName: {
    fontSize: 14,
  },
  leaderValue: {
    fontSize: 14,
    fontWeight: "500",
  },

  /* Season Series styles */
  seasonSeriesContainer: {
    marginVertical: 20,
    paddingHorizontal: 0,
  },
  seasonSeriesTypeContainer: {
    marginBottom: 16,
  },
  seasonSeriesTypeTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 8,
  },
  seasonSeriesGameItem: {
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
  },
  seasonSeriesDescription: {
    fontSize: 12,
    marginBottom: 4,
  },
  seasonSeriesSummary: {
    fontSize: 14,
    fontWeight: "500",
  },
  seasonSeriesGameEvent: {
    marginVertical: 6,
    padding: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  gameEventMainContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  gameEventTeamSection: {
    alignItems: "center",
    flex: 1,
  },
  winnerTeam: {
    opacity: 1,
  },
  gameEventTeamLogoScore: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  gameEventTeamLogo: {
    width: 32,
    height: 32,
    marginRight: 8,
  },
  gameEventTeamLogoHome: {
    width: 32,
    height: 32,
    marginLeft: 8,
  },
  gameEventTeamAbbr: {
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
  },
  gameEventStatusSection: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  gameEventStatus: {
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
  },
  gameEventScore: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "bold",
  },
  gameEventDate: {
    fontSize: 11,
    textAlign: "center",
    fontWeight: "400",
  },

  /* Linescore styles */
  linescoreContainer: {
    marginVertical: 16,
  },
  linescoreTable: {
    borderRadius: 8,
    overflow: "hidden",
  },
  linescoreHeaderRow: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  linescoreTeamRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  linescoreTeamHeaderCell: {
    flex: 2,
    paddingVertical: 8,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  linescorePeriodCell: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 35,
  },
  linescoreTotalCell: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.02)",
    minWidth: 40,
  },
  linescoreTeamInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  linescoreTeamLogo: {
    marginRight: 8,
    width: 20,
    height: 20,
  },
  linescoreHeaderText: {
    fontSize: 12,
    fontWeight: "600",
  },
  linescoreTeamText: {
    fontSize: 14,
    fontWeight: "500",
  },
  linescoreScoreText: {
    fontSize: 14,
    fontWeight: "500",
  },
  linescoreTotalText: {
    fontSize: 14,
    fontWeight: "700",
  },

  /* Win Probability Graph styles */
  winProbabilityContainer: {
    marginVertical: 16,
  },
  winProbabilityLegend: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 16,
    gap: 24,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    fontWeight: "500",
  },
  graphContainer: {
    flexDirection: "row",
    height: 200,
    marginBottom: 16,
  },
  yAxisLabels: {
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingRight: 8,
    paddingVertical: 4,
    width: 40,
  },
  yAxisLabel: {
    fontSize: 10,
  },
  graphArea: {
    flex: 1,
    position: "relative",
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: 4,
  },
  svgContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gridLines: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    borderBottomWidth: 1,
  },
  centerLine: {
    position: "absolute",
    bottom: "50%",
    left: 0,
    right: 0,
    borderBottomWidth: 2,
  },
  graphBars: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  barContainer: {
    position: "absolute",
    width: 3,
    height: "100%",
    marginLeft: -1.5,
  },
  probabilityBar: {
    position: "absolute",
    width: "100%",
    borderRadius: 1,
  },
  probabilityDot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: -1.5,
    marginBottom: -3,
  },
  dataPoint: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    marginLeft: -2,
    marginBottom: -2,
  },
  periodLabelsContainer: {
    position: "relative",
    height: 20,
    marginTop: 8,
  },
  periodLabel: {
    position: "absolute",
    fontSize: 10,
    fontWeight: "500",
    transform: [{ translateX: -10 }], // Center the label
  },

  /* Roster styles */
  rosterContainer: {
    marginVertical: 20,
  },
  rosterHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    justifyContent: "center",
  },
  rosterTeamLogo: {
    width: 32,
    height: 32,
    marginRight: 12,
  },
  rosterTeamName: {
    fontSize: 18,
    fontWeight: "700",
  },
  rosterSection: {
    marginBottom: 24,
  },
  rosterSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  rosterSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 12,
    borderRadius: 6,
    backgroundColor: "#999",
    borderWidth: 1,
    borderColor: "#fff",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },

  /* Modern roster styles */
  modernRosterSection: {
    marginBottom: 16,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  modernSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  modernSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  modernPlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 4,
    borderRadius: 8,
    minHeight: 40,
  },
  playerInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  playerNameSection: {
    flex: 1,
  },
  modernPlayerName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  playerDetails: {
    fontSize: 12,
    fontWeight: "400",
  },
  playerStatsSection: {
    flexDirection: "row",
    alignItems: "center",
    width: 150,
    justifyContent: "flex-end",
  },
  modernPlayerStat: {
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 18,
    minWidth: 36,
    textAlign: "right",
  },
  statHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  statHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  statHeaderColumn: {
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 18,
    minWidth: 36,
    textAlign: "right",
    textTransform: "uppercase",
  },
  sectionDivider: {
    height: 1,
    borderBottomWidth: 1,
    marginVertical: 8,
    marginHorizontal: 12,
    opacity: 0.3,
  },

  /* Faceoff circle styles (matching soccer exactly) */
  faceoffContainer: {
    marginVertical: 12,
    alignItems: "center",
  },
  faceoffTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  faceoffSection: {
    alignItems: "center",
    marginBottom: 8,
  },
  faceoffCircleContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  faceoffCircle: {
    width: 120,
    height: 120,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  faceoffSvg: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  faceoffCenter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: "center",
    alignItems: "center",
    position: "absolute",
    zIndex: 10,
    backgroundColor: "#fff",
  },
  faceoffCenterText: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  faceoffValues: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    gap: 50,
  },
  faceoffTeam: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  faceoffColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  faceoffTeamText: {
    fontSize: 14,
    fontWeight: "600",
  },

  /* Match stats card to visually match soccer layout */
  matchStatsCard: {
    backgroundColor: "#111",
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
  },
  matchStatsTitle: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    color: "#fff",
  },
  teamSmallLogo: {
    width: 22,
    height: 22,
    resizeMode: "contain",
    marginRight: 8,
  },
  teamHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  teamHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  playerStats: {
    flex: 2,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  playerStat: {
    fontSize: 12,
    marginLeft: 8,
  },

  /* Soccer-exact layout styles */
  soccerMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 8,
  },
  soccerTeamSection: {
    flex: 1,
    alignItems: "center",
  },
  soccerTeamLogo: {
    width: 56,
    height: 56,
    marginBottom: 8,
  },
  soccerTeamName: {
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 2,
  },
  teamNameWithFavorite: {
    alignItems: "center",
    width: "100%",
  },
  teamNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  favoriteIconHeader: {
    marginRight: 4,
  },
  favoriteButton: {
    padding: 4,
  },
  soccerScorerText: {
    fontSize: 12.5,
    textAlign: "center",
  },
  soccerScoreSection: {
    alignItems: "center",
    paddingHorizontal: 20,
  },
  soccerScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  soccerScore: {
    fontSize: 36,
    fontWeight: "800",
    marginHorizontal: 12,
  },
  scoreDash: {
    fontSize: 24,
    fontWeight: "600",
    marginHorizontal: 8,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  statusDash: {
    fontSize: 12,
    fontWeight: "600",
    marginHorizontal: 8,
  },
  statusDetail: {
    fontSize: 11,
    fontWeight: "500",
  },
  soccerStatusBadge: {
    backgroundColor: "#9E9E9E",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  soccerStatusText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  soccerFullTimeText: {
    fontSize: 11,
    textAlign: "center",
  },
  losingTeamLogo: {
    opacity: 0.5,
  },

  /* Tab styles */
  tabContainer: {
    marginHorizontal: 0,
    marginTop: 4,
    borderRadius: 12,
    padding: 4,
  },
  tabRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  tab: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    alignItems: "center",
  },
  lastTab: {
    marginRight: 0,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
  },
  tabContent: {
    margin: 0,
    paddingTop: 12,
    minHeight: 200,
  },

  /* NHL-style Plays tab styles */
  playsSectionWrap: {
    paddingTop: 12,
    paddingBottom: 40,
  },
  playsEmptyWrap: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  playsEmptyText: {
    fontSize: 13,
    textAlign: "center",
    fontWeight: "500",
  },
  playsFilterRow: {
    gap: 8,
    paddingHorizontal: 12,
  },
  playsFilterChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  playsFilterChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  playsCardsWrap: {
    marginTop: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  playsRowWrap: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  playsTimeCol: {
    width: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
  },
  playsMinuteText: {
    fontSize: 14,
    fontWeight: "800",
  },
  playsPeriodText: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "700",
  },
  playsCard: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  playsCardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  playsCardTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
    flex: 1,
  },
  playsScoreText: {
    fontSize: 12,
    fontWeight: "500",
  },
  playsScoreNum: {
    fontWeight: "500",
  },
  playsScoreNumBold: {
    fontWeight: "800",
  },
  playsCardMainText: {
    marginTop: 7,
    fontSize: 13,
    fontWeight: "600",
  },
  playsGoalPlayerRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  playsGoalAvatarWrap: {
    width: 44,
    height: 44,
    position: "relative",
    flexShrink: 0,
  },
  playsGoalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  playsGoalAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.16)",
  },
  playsGoalAvatarFallbackText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  playsGoalTeamBadge: {
    position: "absolute",
    left: -2,
    bottom: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },
  playsGoalTeamLogo: {
    width: 20,
    height: 20,
  },
  playsGoalPosBadge: {
    position: "absolute",
    right: -3,
    bottom: -3,
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  playsGoalPosText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  playsGoalCountBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  playsGoalCountText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  playsGoalTextCol: {
    flex: 1,
    minWidth: 0,
  },
  playsGoalScorerName: {
    fontSize: 12,
    fontWeight: "700",
  },
  playsGoalAssistText: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
  },
  playsInlineRinkWrap: {
    marginTop: 10,
    width: "100%",
    aspectRatio: 320 / 188,
    borderRadius: 10,
    borderWidth: 1,
    padding: 6,
    overflow: "hidden",
  },
  playsPagerRow: {
    marginTop: 8,
    marginHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 50,
  },
  playsPagerBtn: {
    minWidth: 92,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  playsPagerBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  playsPagerLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  /* Event popup modal styles (shared with plays section) */
  playerPopupOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  playerPopupBackdropTap: {
    ...StyleSheet.absoluteFillObject,
  },
  playerPopupCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  playerPopupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  playerPopupHeaderTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  playerPopupCloseBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  playerPopupCloseText: {
    fontSize: 13,
    fontWeight: "800",
  },
  playerPopupBody: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  playerPopupSection: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 10,
  },
  playerPopupTitle: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.45,
    marginBottom: 8,
  },
  playerPopupRow: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  playerPopupAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
  },
  playerPopupAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  playerPopupInitials: {
    fontSize: 17,
    fontWeight: "800",
  },
  playerPopupNameCol: {
    flex: 1,
    minWidth: 0,
  },
  playerPopupFirstName: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  playerPopupLastName: {
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 18,
  },
  goalShareActionBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  goalShareActionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  /* Plays styles (matching soccer) */
  playContainer: {
    marginVertical: 6,
    marginHorizontal: 0,
    borderRadius: 12,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    alignSelf: "stretch",
  },
  playHeader: {
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playMainInfo: {
    flex: 1,
    marginRight: 16,
  },
  playTeamsScore: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  teamScoreDisplay: {
    flexDirection: "row",
    alignItems: "center",
  },
  teamLogoSmall: {
    width: 20,
    height: 20,
    marginHorizontal: 4,
  },
  scoreSmall: {
    fontSize: 14,
    fontWeight: "bold",
  },
  scoreSeparator: {
    fontSize: 14,
    fontWeight: "bold",
    marginHorizontal: 8,
  },
  playSummary: {
    flex: 1,
  },
  playTimePeriod: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  playPeriod: {
    fontSize: 12,
    fontWeight: "600",
    marginRight: 8,
  },
  playClock: {
    fontSize: 12,
    fontWeight: "600",
  },
  playDescription: {
    fontSize: 14,
    marginBottom: 4,
  },
  goalBadge: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  goalBadgeText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  logoDarkOverride: {
    // prevent any tint from theming and ensure proper sizing for dark logos
    tintColor: undefined,
  },
  noPlaysContainer: {
    alignItems: "center",
    padding: 24,
  },
  noPlaysText: {
    fontSize: 16,
    textAlign: "center",
  },
  playRightSection: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    minHeight: 60,
  },
  scoreIndicator: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#ff6b35",
    backgroundColor: "#ff6b351a",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  scoreIndicatorText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#ff6b35",
  },
  playToggle: {
    padding: 8,
  },
  toggleIcon: {
    fontSize: 16,
    fontWeight: "bold",
  },
  playDetails: {
    padding: 16,
    paddingTop: 0,
  },
  playDetailsContent: {
    alignItems: "center",
  },
  playDetailsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
  },
  miniFieldContainer: {
    marginRight: 16,
    alignItems: "center",
  },
  miniField: {
    width: 180,
    height: 120,
    marginVertical: 16,
    alignSelf: "center",
  },
  // Mini Basketball Court Styles (based on scoreboard.js)
  miniCourtContainer: {
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
    height: 200,
    marginLeft: 0,
    marginTop: 0,
    marginBottom: 5, // Reduced from 15 to 5
    marginRight: 12, // Added right margin
  },
  courtContainer: {
    width: 150,
    height: 200,
    position: "relative",
    backgroundColor: "#D2691E", // Basketball court orange/brown
    borderWidth: 2,
    borderColor: "#8B4513",
    borderRadius: 4,
  },
  courtOutline: {
    position: "absolute",
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    borderWidth: 2,
    borderColor: "white",
    borderRadius: 2,
  },
  // Half court line (using pseudo-element concept with separate view)
  courtOutlineCenterLine: {
    position: "absolute",
    top: "50%",
    left: 2,
    right: 2,
    height: 2,
    backgroundColor: "white",
    marginTop: -1,
  },
  freeThrowCircleTop: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    left: "50%",
    top: 32,
    marginLeft: -15,
  },
  freeThrowCircleBottom: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    left: "50%",
    bottom: 32,
    marginLeft: -15,
  },
  freeThrowSemicircleTop: {
    position: "absolute",
    width: 40,
    height: 20,
    borderWidth: 2,
    borderColor: "white",
    borderTopWidth: 0,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    left: "50%",
    bottom: 130,
    marginLeft: -20,
    backgroundColor: "transparent",
  },
  freeThrowSemicircleBottom: {
    position: "absolute",
    width: 40,
    height: 20,
    borderWidth: 2,
    borderColor: "white",
    borderBottomWidth: 0,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    left: "50%",
    top: 130,
    marginLeft: -20,
    backgroundColor: "transparent",
  },
  threePointSemicircleTop: {
    position: "absolute",
    width: 120,
    height: 75,
    borderWidth: 2,
    borderColor: "white",
    borderTopWidth: 0,
    borderBottomLeftRadius: 60,
    borderBottomRightRadius: 60,
    left: "50%",
    bottom: 118,
    marginLeft: -60,
    backgroundColor: "transparent",
  },
  threePointSemicircleBottom: {
    position: "absolute",
    width: 120,
    height: 75,
    borderWidth: 2,
    borderColor: "white",
    borderBottomWidth: 0,
    borderTopLeftRadius: 60,
    borderTopRightRadius: 60,
    left: "50%",
    top: 118,
    marginLeft: -60,
    backgroundColor: "transparent",
  },
  centerCircle: {
    position: "absolute",
    width: 30,
    height: 30,
    borderWidth: 2,
    borderColor: "white",
    borderRadius: 15,
    top: "50%",
    left: "50%",
    marginTop: -15,
    marginLeft: -15,
  },
  basketTop: {
    position: "absolute",
    width: 12,
    height: 3,
    backgroundColor: "#FF4500", // Basketball orange
    left: "50%",
    top: 10,
    marginLeft: -6,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#8B0000",
  },
  basketBottom: {
    position: "absolute",
    width: 12,
    height: 3,
    backgroundColor: "#FF4500", // Basketball orange
    left: "50%",
    bottom: 10,
    marginLeft: -6,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#8B0000",
  },
  teamSideIndicator: {
    position: "absolute",
    fontSize: 8,
    fontWeight: "bold",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    zIndex: 10,
  },
  teamSideHome: {
    top: 2,
    left: 2,
  },
  teamSideAway: {
    bottom: 2,
    right: 2,
  },
  shotMarker: {
    width: 12,
    height: 12,
    borderRadius: 8,
    zIndex: 10,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
  },
  madeShotMarker: {
    borderColor: "white",
  },
  missedShotMarker: {
    backgroundColor: "white",
  },
  // Free throw lanes (key/paint areas) - represented as additional elements
  freeThrowLaneTop: {
    position: "absolute",
    width: 40,
    height: 45,
    borderWidth: 2,
    borderColor: "white",
    borderBottomWidth: 0,
    borderRadius: 0,
    top: 2,
    left: "50%",
    marginLeft: -20,
    backgroundColor: "transparent",
  },
  freeThrowLaneBottom: {
    position: "absolute",
    width: 40,
    height: 45,
    borderWidth: 2,
    borderColor: "white",
    borderTopWidth: 0,
    borderRadius: 0,
    bottom: 2,
    left: "50%",
    marginLeft: -20,
    backgroundColor: "transparent",
  },
  // Free throw lines
  freeThrowLineTop: {
    position: "absolute",
    width: 40,
    height: 2,
    backgroundColor: "white",
    top: 47,
    left: "50%",
    marginLeft: -20,
  },
  freeThrowLineBottom: {
    position: "absolute",
    width: 40,
    height: 2,
    backgroundColor: "white",
    bottom: 47,
    left: "50%",
    marginLeft: -20,
  },
  // Three-point line styles removed to match web version exactly
  playEventInfo: {
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  playMarker: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#999",
    borderWidth: 1,
    borderColor: "#fff",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  /* Player modal styles */
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxHeight: "80%",
    borderRadius: 12,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  modalPlayerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  modalHeadshot: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
  },
  modalHeadshotPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ddd",
  },
  modalInitials: {
    fontSize: 18,
    fontWeight: "700",
  },
  modalPlayerDetails: {
    flex: 1,
  },
  modalName: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  modalPlayerMeta: {
    fontSize: 13,
    marginBottom: 4,
  },
  modalTeamRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  modalTeamLogo: {
    width: 16,
    height: 16,
    marginRight: 6,
  },
  modalTeam: {
    fontSize: 12,
  },
  modalClose: {
    paddingLeft: 12,
    paddingRight: 4,
    justifyContent: "center",
  },
  modalStatsHeader: {
    padding: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  modalStatsTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  modalStatsDate: {
    fontSize: 12,
  },
  modalStatsContainer: {
    maxHeight: "100%",
  },
  modalStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  modalStatBox: {
    width: "30%",
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modalStatBoxValue: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  modalStatBoxLabel: {
    fontSize: 11,
    textAlign: "center",
    textTransform: "uppercase",
    fontWeight: "600",
  },
  modalStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.03)",
  },
  modalStatLabel: {
    fontSize: 14,
    flex: 1,
  },
  modalStatValue: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
  },
  /* Additional leader / stats section styles (enhanced leaders layout) */
  leaderHeadshotContainer: {
    width: 48,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  leaderHeadshot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#ddd",
  },
  leaderHeadshotPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  leaderNameContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  leaderFullName: {
    fontSize: 14,
    fontWeight: "600",
  },
  leaderJerseyPosition: {
    fontSize: 12,
    marginTop: 2,
  },
  leaderFirstName: {
    fontSize: 13,
    fontWeight: "600",
  },
  leaderLastName: {
    fontSize: 13,
    fontWeight: "700",
  },
  leaderJerseyContainer: {
    width: 56,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingLeft: 8,
  },
  leaderJerseyNumber: {
    fontSize: 12,
    fontWeight: "700",
  },
  leaderPosition: {
    fontSize: 11,
    marginTop: 4,
  },
  leaderValueContainer: {
    width: 72,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingLeft: 12,
  },
  leaderBigValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  statsSectionInner: {
    marginBottom: 12,
    alignItems: "center",
  },
  leaderInitials: {
    fontSize: 14,
    fontWeight: "600",
  },
  enhancedLeaderItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  /* Soccer-style stats row with bar fills */
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  statsValue: {
    fontSize: 14,
    fontWeight: "bold",
    minWidth: 30,
    textAlign: "center",
  },
  statsValueAway: {
    // Away team value on left
  },
  statsValueHome: {
    // Home team value on right
  },
  statsBarContainer: {
    flex: 1,
    marginHorizontal: 12,
    alignItems: "center",
  },
  statsBar: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    flexDirection: "row",
    marginBottom: 4,
  },
  statsBarFill: {
    height: "100%",
  },
  statsBarFillAway: {
    // Away team fill (left side)
  },
  statsBarFillHome: {
    // Home team fill (right side)
  },
  statsSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    textAlign: "center",
  },

  // Stream Modal Styles
  streamButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    marginVertical: 8,
    borderRadius: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  streamButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  streamModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  streamModalContainer: {
    width: "95%",
    maxWidth: 800,
    height: "85%",
    maxHeight: 325,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  streamModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  streamModalTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  streamModalCloseButton: {
    padding: 8,
  },
  streamModalCloseText: {
    fontSize: 26,
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
  streamSourceButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 80,
    alignItems: "center",
    marginHorizontal: 5,
  },
  streamSourceButtonText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  webViewContainer: {
    flex: 1,
    position: "relative",
  },
  streamLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    zIndex: 1,
  },
  streamTypeContainer: {
    paddingVertical: 12,
  },
  streamTypeScrollView: {
    paddingHorizontal: 16,
  },
  streamTypeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
  },
  streamTypeButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  streamQualityText: {
    fontSize: 12,
    marginTop: 2,
  },
  streamContent: {
    flex: 1,
  },
  streamLoadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  streamLoadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  streamWebView: {
    flex: 1,
  },
  noStreamContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  noStreamText: {
    fontSize: 16,
    textAlign: "center",
  },
  // Modern section header styles
  modernSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  modernSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  modernRosterSection: {
    padding: 16,
    borderRadius: 12,
    marginVertical: 4,
  },
  // Mini game card styles
  miniGameCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 6,
  },
  miniGameHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  miniGameResult: {
    fontSize: 17.5,
    fontWeight: "bold",
    width: 20,
    textAlign: "center",
  },
  miniGameScore: {
    fontSize: 15,
    fontWeight: "600",
  },
  miniGameInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  miniGameOpponentLogo: {
    width: 20,
    height: 20,
  },
  miniGameDate: {
    fontSize: 12,
  },
  miniGameMeta: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  miniGameOpponent: {
    fontSize: 12,
    fontWeight: "600",
  },
  // Injury styles
  injuryItem: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    marginBottom: 4,
  },
  injuryPlayerName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  injuryDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  injuryStatus: {
    fontSize: 12,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  injuryDetail: {
    fontSize: 11,
    fontStyle: "italic",
    flex: 1,
    textAlign: "right",
  },
  // Floating Chat Button
  floatingChatButton: {
    position: "absolute",
    bottom: 30,
    left: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  // Chat Modal Styles
  chatModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0)",
    justifyContent: "flex-end",
  },
  chatModalContent: {
    height: "85%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  chatModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  chatModalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
    textAlign: "center",
    marginRight: -20,
  },
  chatModalCloseButton: {
    padding: 4,
  },
  chatModalBody: {
    flex: 1,
  },
  loadMoreButton: {
    margin: 16,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  loadMoreText: {
    fontSize: 16,
    fontWeight: "600",
  },
  // Shareable Card Styles
  shareCard: {
    width: 350,
    borderRadius: 0,
    padding: 20,
    marginHorizontal: 20,
  },
  wnbaShareCard: {
    overflow: "hidden",
  },
  wnbaCardHeader: {
    padding: 14,
    borderBottomWidth: 2,
  },
  wnbaCardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  wnbaPosBadge: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  wnbaPosBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  wnbaCardScoreText: {
    fontSize: 12,
    fontWeight: "700",
  },
  wnbaHeadshotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  wnbaCardHeadshot: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    backgroundColor: "rgba(128,128,128,0.1)",
  },
  wnbaNameBlock: {
    flex: 1,
    gap: 2,
  },
  wnbaSummaryRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 4,
  },
  wnbaSummaryCell: {
    alignItems: "center",
  },
  wnbaSummaryVal: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 20,
  },
  wnbaSummaryLbl: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 1,
  },
  wnbaCardFullName: {
    fontSize: 13,
    fontWeight: "600",
  },
  wnbaTeamNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  wnbaTeamNameLogo: {
    width: 16,
    height: 16,
  },
  wnbaTeamNameLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  wnbaStatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  wnbaStatCell: {
    width: "33.333%",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    position: "relative",
  },
  wnbaStatPct: {
    position: "absolute",
    top: 5,
    right: 7,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  wnbaStatVal: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  wnbaStatLbl: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 3,
  },
  wnbaCardFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "flex-end",
  },
  wnbaCardBrand: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  shareCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  shareCardPlayerInfo: {
    flexDirection: "row",
    flex: 1,
  },
  shareCardHeadshot: {
    width: 70,
    height: 70,
    borderRadius: 35,
    marginRight: 12,
  },
  shareCardHeadshotPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 35,
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  shareCardInitials: {
    fontSize: 24,
    fontWeight: "bold",
  },
  shareCardPlayerDetails: {
    flex: 1,
    justifyContent: "center",
  },
  shareCardName: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 4,
  },
  shareCardPlayerMeta: {
    fontSize: 14,
    marginBottom: 4,
  },
  shareCardTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  shareCardTeamLogo: {
    width: 20,
    height: 20,
    marginRight: 6,
  },
  shareCardTeam: {
    fontSize: 13,
  },
  shareCardAppLogoContainer: {
    width: 50,
    height: 50,
    marginLeft: 8,
    borderRadius: 6,
    overflow: "hidden",
    position: "relative",
  },
  shareCardAppLogo: {
    width: "100%",
    height: "100%",
  },
  shareCardStatsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.2)",
  },
  shareCardStatsTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  shareCardScoreDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  shareCardScoreLogo: {
    width: 20,
    height: 20,
  },
  shareCardScore: {
    fontSize: 16,
    fontWeight: "bold",
  },
  shareCardScoreSeparator: {
    fontSize: 14,
    marginHorizontal: 2,
  },
  shareCardStatsContainer: {
    paddingBottom: 0,
  },
  shareCardStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginBottom: -50,
  },
  shareCardStatBox: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: 12,
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 5,
  },
  shareCardStatBoxValue: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 4,
    transform: [{ translateY: -3 }],
  },
  shareCardStatBoxLabel: {
    fontSize: 11,
    textAlign: "center",
  },
  shareCardFooter: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
  },
  shareCardFooterText: {
    fontSize: 15,
    fontWeight: "800",
  },
  shareCardActions: {
    alignItems: "center",
    marginTop: 20,
    paddingHorizontal: 20,
  },
  shareCardTopButtons: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  shareCardButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  shareCardCancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  shareCardButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  simpleHeaderCard: {
    padding: 20,
    overflow: "hidden",
    position: "relative",
    borderBottomWidth: 0,
    marginBottom: 0,
    borderWidth: 1,
  },
  simpleLeagueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  simpleLeagueText: {
    fontSize: 12,
    fontWeight: "500",
  },
  simpleMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 0,
  },
  simpleTeamContainer: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  simpleTeamLogo: {
    width: 65,
    height: 65,
  },
  simpleTeamInfo: {
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 120,
    flexDirection: "row",
    gap: 6,
  },
  simpleTeamName: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
    textAlign: "center",
    marginBottom: 14,
  },
  simpleTeamScore: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "800",
    minWidth: 24,
    textAlign: "center",
  },
  simpleTeamRecord: {
    marginTop: -18,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  simpleStatusCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  simpleStatusBadge: {
    paddingHorizontal: 8,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  simpleStatusMain: {
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  simpleStatusSub: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 2,
  },
  simpleStreamBtn: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
    borderWidth: 1,
  },
  simpleStreamBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  simpleStreamBtnDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  simpleStreamBtnText: {
    fontWeight: "700",
    fontSize: 12,
  },
  simpleScorersSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 12,
    minHeight: 24,
  },
  simpleScorersSide: {
    flex: 1,
    alignItems: "flex-start",
    gap: 2,
  },
  simpleScorersCenter: {
    width: 28,
    alignItems: "center",
    paddingTop: 2,
  },
  simpleScorerText: {
    fontSize: 11,
    lineHeight: 16,
  },
  simpleDateText: {
    marginTop: 12,
    textAlign: "center",
    fontSize: 11,
  },
  simpleTeamTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: -5,
    gap: 8,
  },
  scoreRight: {
    marginRight: 8,
  },
  scoreLeft: {
    marginLeft: 8,
  },
  stickyUnit: {
    borderBottomWidth: 1,
  },

  // Animated mini header
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

  miniAbbr: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  miniLogo: {
    width: 35,
    height: 35,
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

  // Tab bar styles
  tabBarWrapper: {
    justifyContent: "center",
    borderBottomWidth: 0,
  },

  tabBarContent: {
    flexDirection: "row",
  },

  tabBarButton: {
    width: Dimensions.get("window").width / 4,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },

  tabBarLabel: {
    fontSize: 13,
  },

  // Content area
  contentArea: {
    flex: 1,
    padding: 0,
    marginTop: -12,
  },
});

const wnbaRosterStyles = StyleSheet.create({
  playerCard: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  playerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  playerHeadshotWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 2,
  },
  playerHeadshot: {
    width: "100%",
    height: "100%",
  },
  playerFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  playerFallbackText: {
    fontSize: 18,
    fontWeight: "700",
  },
  playerNameBlock: {
    flex: 1,
    marginLeft: 10,
  },
  playerName: {
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  playerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  decisionLabel: {
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 8,
  },
  playerMeta: {
    fontSize: 12,
    marginTop: 2,
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
  teamHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    justifyContent: "center",
  },
  teamLogo: {
    width: 32,
    height: 32,
    marginRight: 12,
  },
  teamName: {
    fontSize: 18,
    fontWeight: "700",
  },
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
  seasonStatsLabel: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 2,
  },
  emptyText: {
    textAlign: "center",
    marginTop: 32,
    fontSize: 14,
  },
  scheduleSection: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  scheduleSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  scheduleSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  miniGameCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 6,
  },
  miniGameHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  miniGameResult: {
    fontSize: 17.5,
    fontWeight: "bold",
    width: 20,
    textAlign: "center",
  },
  miniGameScore: {
    fontSize: 15,
    fontWeight: "600",
  },
  miniGameInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  miniGameOpponentLogo: {
    width: 20,
    height: 20,
  },
  miniGameDate: {
    fontSize: 12,
  },
  miniGameMeta: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  miniGameOpponent: {
    fontSize: 12,
    fontWeight: "600",
  },
});

const wnbaModalStyles = StyleSheet.create({
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
  headshotBadge: {
    position: "absolute",
    left: -6,
    bottom: -6,
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  headshotBadgeText: {
    color: "white",
    fontSize: 11,
    fontWeight: "800",
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
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  statRowValueLeft: {
    width: 80,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "left",
    paddingRight: 8,
    alignSelf: "center",
    marginTop: -6,
  },
  statRowValueRight: {
    width: 80,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "right",
    paddingLeft: 8,
    alignSelf: "center",
    marginTop: -6,
  },
  statBarWrap: {
    flex: 1,
    marginLeft: 6,
    flexDirection: "column",
    justifyContent: "center",
  },
  statRowLabelBelow: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 6,
    alignSelf: "flex-end",
  },
  statRowRight: {
    alignItems: "flex-end",
    gap: 3,
  },
  statBarTrack: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  statBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  statDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: -4,
    marginVertical: 8,
    width: "100%",
  },
  compareRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  compareHeadshotWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "visible",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  compareHeadshotImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
  },
  compareTeamLogo: {
    position: "absolute",
    right: -6,
    bottom: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  compareInfo: {
    flex: 1,
    justifyContent: "center",
  },
  compareName: {
    fontSize: 15,
    fontWeight: "800",
  },
  compareSub: {
    fontSize: 12,
  },
  comparePos: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
  },
  compareBubble: {
    marginVertical: 8,
    borderRadius: 12,
    padding: 6,
    borderWidth: 1,
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  compareChosenClose: {
    position: "absolute",
    right: -6,
    top: -6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default WNBAGameDetailsScreen;

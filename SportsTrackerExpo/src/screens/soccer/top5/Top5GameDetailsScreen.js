import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { FontAwesome6, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useGamePresence } from "../../../hooks/useGamePresence";
import { useTheme } from "../../../context/ThemeContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("window");

const FOOTBALL_BASE = "https://laraiyeogithubio-production-08da.up.railway.app";

const GAME_CACHE_KEY = (id) => `@gameDetail_v2:${id}`;
const GAME_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// ─── Polling helpers (same pattern as Top5ScoreboardScreen) ──────────────────
const INTERVAL_SLOW = 30 * 60 * 1000; // 30 minutes
const INTERVAL_FAST = 5 * 1000; // 5 seconds
const SOON_THRESHOLD = 5 * 60 * 1000; // 5 minutes before kick-off

const isLiveState = (stateCode) => {
  const code = (stateCode || "").toUpperCase();
  const finished = [
    "FT",
    "AET",
    "FT_PEN",
    "POSTP",
    "CANC",
    "ABAN",
    "WO",
    "WALKOVER",
    "CUT",
    "AWA",
  ];
  const scheduled = ["", "NS", "TBA", "DELAYED"];
  return !finished.includes(code) && !scheduled.includes(code);
};

const isFinishedState = (stateCode) => {
  const code = (stateCode || "").toUpperCase();
  return [
    "FT",
    "AET",
    "FT_PEN",
    "POSTP",
    "CANC",
    "ABAN",
    "WO",
    "WALKOVER",
    "CUT",
    "AWA",
  ].includes(code);
};

const getPollingIntervalForFixture = (fixture) => {
  if (!fixture) return INTERVAL_SLOW;
  const code = fixture?.state?.state || "";
  if (isLiveState(code)) return INTERVAL_FAST;
  if (!isFinishedState(code)) {
    try {
      const startMs = new Date(
        fixture.starting_at.replace(" ", "T") + "Z",
      ).getTime();
      const now = Date.now();
      if (startMs - now <= SOON_THRESHOLD && startMs > now)
        return INTERVAL_FAST;
    } catch (_) {}
  }
  return INTERVAL_SLOW;
};

// ─── Goal time formatter ──────────────────────────────────────────────────────
function formatGoalTime(e) {
  const min = e.minute != null ? `${e.minute}'` : "";
  const extra = e.extra_minute ? `+${e.extra_minute}'` : "";
  const addLow = (e.addition || "").toLowerCase();
  const isP =
    addLow.includes("penalty") &&
    !addLow.includes("awarded") &&
    !addLow.includes("missed");
  return `${min}${extra}${isP ? " (P.)" : ""}`;
}

// ─── Header gradient (home left → away right) ────────────────────────────────
const HeaderGradient = ({ homeColor, awayColor, theme, height }) => (
  <View style={[StyleSheet.absoluteFill, { height }]} pointerEvents="none">
    <Svg width={width} height={height} pointerEvents="none">
      <Defs>
        <LinearGradient id="sGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={homeColor} stopOpacity="0.30" />
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
          <Stop offset="100%" stopColor={awayColor} stopOpacity="0.30" />
        </LinearGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#sGrad)" />
    </Svg>
  </View>
);

// ─── Status badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ fixture, theme }) => {
  const code = (fixture?.state?.state || "").toUpperCase();
  const shortName =
    fixture?.state?.short_name || fixture?.state?.name || code || "—";
  const live = isLiveState(code);
  const finished = isFinishedState(code);

  // Format kick-off time in EST (source is UTC-1, EST is UTC-5 → subtract 4 h)
  let timeStr = null;
  try {
    const d = new Date(fixture.starting_at.replace(" ", "T") + "Z");
    const est = new Date(d.getTime() - 4 * 60 * 60 * 1000);
    const h = est.getUTCHours();
    const m = String(est.getUTCMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    timeStr = `${h % 12 || 12}:${m} ${ampm} EST`;
  } catch (_) {}

  // Format date
  let dateStr = null;
  try {
    const d = new Date(fixture.starting_at.replace(" ", "T") + "Z");
    const months = [
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
    dateStr = `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
  } catch (_) {}

  return (
    <View style={styles.statusBadge}>
      {live ? (
        <View style={{ alignItems: "center" }}>
          <View
            style={[
              styles.liveDot,
              { backgroundColor: theme.error || "#e03131" },
            ]}
          />
          <Text
            style={[styles.statusMain, { color: theme.error || "#e03131" }]}
          >
            {shortName}
          </Text>
        </View>
      ) : finished ? (
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.statusMain, { color: theme.textSecondary }]}>
            {shortName}
          </Text>
          {!!timeStr && (
            <Text style={[styles.statusSub, { color: theme.textTertiary }]}>
              {timeStr}
            </Text>
          )}
        </View>
      ) : (
        <View style={{ alignItems: "center" }}>
          {!!dateStr && (
            <Text style={[styles.statusSub, { color: theme.textTertiary }]}>
              {dateStr}
            </Text>
          )}
          <Text style={[styles.statusMain, { color: theme.text }]}>
            {timeStr || shortName}
          </Text>
        </View>
      )}
    </View>
  );
};

// ─── Team side (logo + score row + name below) ────────────────────────────────
const TeamSide = ({
  team,
  score,
  redCards = 0,
  isWinner,
  isFinished,
  isLive,
  scoreOpacity,
  side,
  theme,
  colors,
  onPress,
}) => {
  const logoUri =
    team?.image_path && !team.image_path.includes("placeholder")
      ? team.image_path
      : null;
  const color = team?.colorPrimary || colors.primary;

  // score beside logo: home = [logo][score], away = [score][logo]
  const scoreNode =
    (isLive || isFinished) && score != null ? (
      <Animated.Text
        style={[
          styles.teamScore,
          {
            color: isWinner ? theme.text : theme.textSecondary,
            fontWeight: isWinner ? "800" : "400",
            opacity: isFinished && !isWinner ? 0.6 : 1,
            opacity: scoreOpacity ?? 1,
          },
        ]}
      >
        {score}
      </Animated.Text>
    ) : null;

  const logoNode = logoUri ? (
    <Image
      source={{ uri: logoUri }}
      style={styles.teamLogo}
      contentFit="contain"
      cachePolicy="memory-disk"
    />
  ) : (
    <View
      style={[styles.teamLogoPlaceholder, { backgroundColor: color + "30" }]}
    >
      <Text style={[styles.teamLogoInitial, { color }]}>
        {(team?.name || "?")[0].toUpperCase()}
      </Text>
    </View>
  );

  return (
    <TouchableOpacity
      style={[styles.teamSide, side === "away" && styles.teamSideAway]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
    >
      <View style={side === "home" ? styles.logoScoreRow : styles.scoreLogo}>
        {side === "home" ? (
          <>
            {logoNode}
            {scoreNode}
          </>
        ) : (
          <>
            {scoreNode}
            {logoNode}
          </>
        )}
      </View>
      <View
        style={[
          styles.teamNameRow,
          side === "away" ? styles.teamNameRowAway : styles.teamNameRowHome,
        ]}
      >
        {side === "away" && redCards > 0 ? (
          <View style={styles.teamCardsRow}>
            {Array.from({ length: redCards }).map((_, idx) => (
              <MaterialCommunityIcons
                key={`${team?.id ?? "team"}:red:${idx}`}
                name="card"
                size={14}
                color={theme.error || "#e03131"}
                style={styles.redCardIcon}
              />
            ))}
          </View>
        ) : null}
        <Text
          style={[styles.teamName, { color: theme.text }]}
          numberOfLines={2}
          textBreakStrategy="simple"
        >
          {team?.name || "—"}
        </Text>
        {side === "home" && redCards > 0 ? (
          <View style={styles.teamCardsRow}>
            {Array.from({ length: redCards }).map((_, idx) => (
              <MaterialCommunityIcons
                key={`${team?.id ?? "team"}:red:${idx}`}
                name="card"
                size={14}
                color={theme.error || "#e03131"}
                style={styles.redCardIcon}
              />
            ))}
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

// ─── Man of the Match helpers ───────────────────────────────────────────────
const MOTM_POS_MAP = {
  Goalkeeper: "GK",
  "Centre Back": "CB",
  "Left Back": "LB",
  "Right Back": "RB",
  "Left Wing": "LW",
  "Right Wing": "RW",
  Sweeper: "SW",
  "Defensive Midfielder": "DM",
  "Central Midfielder": "CM",
  "Left Midfielder": "LM",
  "Right Midfielder": "RM",
  "Attacking Midfielder": "AM",
  "Left Winger": "LW",
  "Right Winger": "RW",
  "Second Striker": "SS",
  "Centre Forward": "CF",
  "Left Wing Forward": "LW",
  "Right Wing Forward": "RW",
  Striker: "ST",
  Defender: "DF",
  Midfielder: "MF",
  Attacker: "FW",
};

function motmGetPosAbbr(name) {
  if (!name) return null;
  if (MOTM_POS_MAP[name]) return MOTM_POS_MAP[name];
  if (name.includes(" "))
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function motmGetRatingColor(r) {
  if (r <= 6.0) return "#dc3545";
  if (r <= 7.0) return "#ffbf00";
  if (r <= 8.0) return "#28a745";
  return "#8b5cf6";
}

function motmTextOnBg(hex) {
  if (!hex) return "#FFFFFF";
  const c = hex.replace("#", "");
  if (c.length < 6) return "#000000";
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5
    ? "#000000"
    : "#FFFFFF";
}

function motmGetStat(details, ...names) {
  for (const n of names) {
    const d = (details ?? []).find(
      (d) => (d.type?.name ?? "").toLowerCase() === n.toLowerCase(),
    );
    if (d?.data?.value != null) return d.data.value;
  }
  return null;
}

function getLineupRating(lineup) {
  const ratingDetail = (lineup?.details ?? []).find(
    (d) => (d.type?.name ?? "").toLowerCase() === "rating",
  );
  const rating = parseFloat(ratingDetail?.data?.value ?? 0);
  return Number.isFinite(rating) && rating > 0 ? rating : null;
}

function getPerformerBucket(lineup) {
  const pos = (lineup?.position?.name ?? "").toLowerCase();
  if (pos.includes("attack")) return "Attacker";
  if (pos.includes("mid")) return "Midfielder";
  if (pos.includes("def")) return "Defender";
  return null;
}

// ─── Man of the Match card ────────────────────────────────────────────────────
const ManOfTheMatch = ({ entry, theme, colors }) => {
  const { lineup, team, rating } = entry;
  const player = lineup.player;
  const teamColor = team?.colorPrimary || colors.primary;
  const posAbbr = motmGetPosAbbr(lineup.detailedposition?.name ?? null);
  const ratingColor = motmGetRatingColor(rating);
  const ratingTextColor = motmTextOnBg(ratingColor);

  const goals = motmGetStat(lineup.details, "goals");
  const assists = motmGetStat(lineup.details, "assists");
  const minutes = motmGetStat(lineup.details, "minutes played");
  const stats = [
    goals != null ? { label: "GLS", value: String(goals) } : null,
    assists != null ? { label: "AST", value: String(assists) } : null,
    minutes != null ? { label: "MP", value: `${minutes}'` } : null,
  ].filter(Boolean);

  const imgUri =
    player?.image_path && !player.image_path.includes("placeholder")
      ? player.image_path
      : null;
  const initials =
    [player?.firstname?.[0], player?.lastname?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "?";

  const teamLogoUri =
    team?.image_path && !team.image_path.includes("placeholder")
      ? team.image_path
      : null;

  return (
    <View style={[motmStyles.card, { backgroundColor: theme.surface }]}>
      {/* Gradient */}
      <Svg
        width={width - 24}
        height={200}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient id="motmGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={teamColor} stopOpacity="0.25" />
            <Stop offset="65%" stopColor={teamColor} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect width={width - 24} height={200} fill="url(#motmGrad)" />
      </Svg>

      <View style={[motmStyles.headerRow, { borderBottomColor: theme.border }]}>
        <View
          style={[motmStyles.headerAccent, { backgroundColor: teamColor }]}
        />
        <Text style={[motmStyles.headerTitle, { color: theme.text }]}>
          MAN OF THE MATCH
        </Text>
      </View>

      {/* Main row */}
      <View style={motmStyles.mainRow}>
        {/* Headshot */}
        <View style={motmStyles.headshotWrap}>
          {imgUri ? (
            <Image
              source={{ uri: imgUri }}
              style={[
                motmStyles.headshot,
                {
                  backgroundColor: teamColor + "30",
                  borderColor: teamColor,
                  borderWidth: 2,
                },
              ]}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View
              style={[
                motmStyles.headshot,
                {
                  backgroundColor: teamColor + "30",
                  borderColor: teamColor,
                  borderWidth: 2,
                  alignItems: "center",
                  justifyContent: "center",
                },
              ]}
            >
              <Text style={[motmStyles.headshotInitials, { color: teamColor }]}>
                {initials}
              </Text>
            </View>
          )}
          {/* Rating badge — top right */}
          <View
            style={[motmStyles.ratingBadge, { backgroundColor: ratingColor }]}
          >
            <Text style={[motmStyles.ratingText, { color: ratingTextColor }]}>
              {rating.toFixed(1)} ★
            </Text>
          </View>
          {/* Position badge — bottom right */}
          {!!posAbbr && (
            <View
              style={[
                motmStyles.posBadge,
                { backgroundColor: theme.surfaceSecondary },
              ]}
            >
              <Text
                style={[motmStyles.posText, { color: theme.textSecondary }]}
              >
                {posAbbr}
              </Text>
            </View>
          )}
        </View>

        {/* Name */}
        <View style={motmStyles.nameBlock}>
          <Text
            style={[motmStyles.firstName, { color: theme.text }]}
            numberOfLines={1}
          >
            {player?.firstname || ""}
          </Text>
          <Text
            style={[motmStyles.lastName, { color: theme.text }]}
            numberOfLines={1}
          >
            {player?.lastname || player?.name || ""}
          </Text>
        </View>

        {/* Stats */}
        {stats.length > 0 && (
          <View style={motmStyles.statsCol}>
            {stats.map((s) => (
              <View key={s.label} style={motmStyles.statItem}>
                <Text style={[motmStyles.statValue, { color: theme.text }]}>
                  {s.value}
                </Text>
                <Text
                  style={[motmStyles.statLabel, { color: theme.textSecondary }]}
                >
                  {s.label}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={[motmStyles.footer, { borderTopColor: teamColor }]}>
        {teamLogoUri ? (
          <Image
            source={{ uri: teamLogoUri }}
            style={motmStyles.footerLogo}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        ) : (
          <View
            style={[
              motmStyles.footerLogoPlaceholder,
              { backgroundColor: teamColor + "30" },
            ]}
          >
            <Text style={{ color: teamColor, fontSize: 9, fontWeight: "800" }}>
              {(team?.name || "?")[0].toUpperCase()}
            </Text>
          </View>
        )}
        <Text
          style={[motmStyles.footerTeamName, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {team?.name || ""}
        </Text>
      </View>
    </View>
  );
};

const POSITION_BUCKET_ORDER = ["Attacker", "Midfielder", "Defender"];

const PerformerItem = ({ entry, side, theme, teamColor, onPress }) => {
  if (!entry) return null;

  const { lineup, rating } = entry;
  const player = lineup.player ?? {};
  const imgUri =
    player?.image_path && !player.image_path.includes("placeholder")
      ? player.image_path
      : null;
  const posAbbr = motmGetPosAbbr(
    lineup.detailedposition?.name ?? lineup.position?.name ?? null,
  );
  const ratingColor = motmGetRatingColor(rating);
  const ratingTextColor = motmTextOnBg(ratingColor);
  const initials =
    [player?.firstname?.[0], player?.lastname?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() ||
    (player?.name ?? "?")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() ||
    "?";

  const content = (
    <>
      {side === "away" ? (
        <View style={[tpStyles.nameBlock, tpStyles.nameBlockAway]}>
          <Text
            style={[tpStyles.firstName, { color: theme.text }]}
            numberOfLines={1}
          >
            {player?.firstname || ""}
          </Text>
          <Text
            style={[tpStyles.lastName, { color: theme.text }]}
            numberOfLines={1}
          >
            {player?.lastname || player?.name || ""}
          </Text>
        </View>
      ) : null}

      <View style={tpStyles.headshotWrap}>
        {imgUri ? (
          <Image
            source={{ uri: imgUri }}
            style={[
              tpStyles.headshot,
              {
                backgroundColor: `${teamColor}30`,
                borderColor: teamColor,
                borderWidth: 2,
              },
            ]}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View
            style={[
              tpStyles.headshot,
              {
                backgroundColor: `${teamColor}30`,
                borderColor: teamColor,
                borderWidth: 2,
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Text style={[tpStyles.headshotInitials, { color: theme.text }]}>
              {initials}
            </Text>
          </View>
        )}

        <View
          style={[
            tpStyles.ratingBadge,
            side === "away"
              ? tpStyles.ratingBadgeAway
              : tpStyles.ratingBadgeHome,
            { backgroundColor: ratingColor },
          ]}
        >
          <Text style={[tpStyles.ratingText, { color: ratingTextColor }]}>
            {rating.toFixed(1)}
          </Text>
        </View>

        {!!posAbbr && (
          <View
            style={[
              tpStyles.posBadge,
              side === "away" ? tpStyles.posBadgeAway : tpStyles.posBadgeHome,
              { backgroundColor: theme.surfaceSecondary },
            ]}
          >
            <Text style={[tpStyles.posText, { color: theme.textSecondary }]}>
              {posAbbr}
            </Text>
          </View>
        )}
      </View>

      {side === "home" ? (
        <View style={tpStyles.nameBlock}>
          <Text
            style={[tpStyles.firstName, { color: theme.text }]}
            numberOfLines={1}
          >
            {player?.firstname || ""}
          </Text>
          <Text
            style={[tpStyles.lastName, { color: theme.text }]}
            numberOfLines={1}
          >
            {player?.lastname || player?.name || ""}
          </Text>
        </View>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[tpStyles.playerRow, side === "away" && tpStyles.playerRowAway]}
        activeOpacity={0.75}
        onPress={onPress}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={[tpStyles.playerRow, side === "away" && tpStyles.playerRowAway]}
    >
      {content}
    </View>
  );
};

const TopPerformersSection = ({
  mode,
  onModeChange,
  performers,
  home,
  away,
  homeColor,
  awayColor,
  theme,
  colors,
  navigation,
}) => {
  const activePerformers = performers?.[mode] ?? { home: [], away: [] };
  const homeEntries = activePerformers.home ?? [];
  const awayEntries = activePerformers.away ?? [];

  if (!homeEntries.length && !awayEntries.length) return null;

  const renderSide = (entries, side, sideColor) => (
    <View style={tpStyles.sideCol}>
      {entries.map((entry, idx) => {
        const player = entry.lineup?.player ?? {};
        const playerId = player.id ?? entry.lineup?.player_id ?? null;
        const playerName =
          player.name ||
          `${player.firstname ?? ""} ${player.lastname ?? ""}`.trim() ||
          "Player";

        return (
          <PerformerItem
            key={`${side}:${playerId ?? idx}:${entry.bucket ?? "match"}`}
            entry={entry}
            side={side}
            theme={theme}
            teamColor={sideColor}
            onPress={
              playerId != null
                ? () =>
                    navigation.navigate("Top5PlayerDetail", {
                      playerId,
                      playerName,
                    })
                : undefined
            }
          />
        );
      })}
    </View>
  );

  return (
    <View style={[tpStyles.card, { backgroundColor: theme.surface }]}>
      <View style={[tpStyles.headerRow, { borderBottomColor: theme.border }]}>
        <Text style={[tpStyles.headerTitle, { color: theme.text }]}>
          TOP PERFORMERS
        </Text>
        <View
          style={[
            tpStyles.toggleWrap,
            { backgroundColor: theme.surfaceSecondary },
          ]}
        >
          {[
            { key: "match", label: "MATCH" },
            { key: "position", label: "POSITION" },
          ].map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[
                tpStyles.toggleBtn,
                item.key === mode && { backgroundColor: theme.surface },
              ]}
              activeOpacity={0.75}
              onPress={() => onModeChange(item.key)}
            >
              <Text
                style={[
                  tpStyles.toggleText,
                  {
                    color:
                      item.key === mode ? colors.primary : theme.textSecondary,
                    fontWeight: item.key === mode ? "700" : "500",
                  },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={tpStyles.body}>
        <Svg
          width={width - 24}
          height="100%"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Defs>
            <LinearGradient id="topPerfGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={homeColor} stopOpacity="0.16" />
              <Stop
                offset="50%"
                stopColor={theme.surfaceSecondary}
                stopOpacity="0"
              />
              <Stop offset="100%" stopColor={awayColor} stopOpacity="0.16" />
            </LinearGradient>
          </Defs>
          <Rect width={width - 24} height="100%" fill="url(#topPerfGrad)" />
        </Svg>

        <View style={tpStyles.bodyInner}>
          {renderSide(homeEntries, "home", homeColor)}
          {renderSide(awayEntries, "away", awayColor)}
        </View>
      </View>

      <View style={tpStyles.footerTopBar}>
        <View
          style={[tpStyles.footerTopHalf, { backgroundColor: homeColor }]}
        />
        <View
          style={[tpStyles.footerTopHalf, { backgroundColor: awayColor }]}
        />
      </View>
      <View style={tpStyles.footer}>
        <View style={tpStyles.footerTeamBlock}>
          {home?.image_path ? (
            <Image
              source={{ uri: home.image_path }}
              style={tpStyles.footerLogo}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : null}
          <Text
            style={[tpStyles.footerTeamName, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {home?.name || ""}
          </Text>
        </View>
        <View style={[tpStyles.footerTeamBlock, tpStyles.footerTeamBlockAway]}>
          <Text
            style={[tpStyles.footerTeamName, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {away?.name || ""}
          </Text>
          {away?.image_path ? (
            <Image
              source={{ uri: away.image_path }}
              style={tpStyles.footerLogo}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : null}
        </View>
      </View>
    </View>
  );
};

const EventsSection = ({
  events,
  periods,
  scores,
  stateCode,
  homeId,
  awayId,
  theme,
  accentColor,
  colors,
}) => {
  if (!events?.length) return null;

  const rows = [...events]
    .filter(
      (e) =>
        e?.minute != null &&
        !!e.player_name &&
        (e.participant_id === homeId || e.participant_id === awayId),
    )
    .sort((a, b) => {
      const aT = (a.minute ?? 0) * 100 + (a.extra_minute ?? 0);
      const bT = (b.minute ?? 0) * 100 + (b.extra_minute ?? 0);
      return aT - bT;
    });

  if (!rows.length) return null;

  const isFinished = isFinishedState(stateCode);

  const scoreByDescription = (description, participant) => {
    const value = scores?.find(
      (s) =>
        s?.description === description && s?.score?.participant === participant,
    )?.score?.goals;
    return value == null ? null : Number(value);
  };

  const getScoreTextStyle = (value, other) => {
    const isHigher =
      value != null && other != null && Number(value) > Number(other);
    return {
      color: isHigher ? colors.primary : theme.text,
      fontWeight: isHigher ? "800" : "400",
    };
  };

  const renderScorePair = (homeScore, awayScore) => {
    const hs = homeScore == null ? "-" : String(homeScore);
    const as = awayScore == null ? "-" : String(awayScore);
    return (
      <Text style={[evStyles.periodDividerScore, { color: theme.text }]}>
        <Text style={getScoreTextStyle(homeScore, awayScore)}>{hs}</Text>
        {" - "}
        <Text style={getScoreTextStyle(awayScore, homeScore)}>{as}</Text>
      </Text>
    );
  };

  const periodIdsInOrder =
    (periods ?? []).map((p) => p?.id).filter((id) => id != null) || [];
  const knownPeriodIdSet = new Set(periodIdsInOrder);
  const unknownPeriodIds = [...new Set(rows.map((e) => e?.period_id))].filter(
    (id) => id != null && !knownPeriodIdSet.has(id),
  );
  const orderedPeriodIds = [...periodIdsInOrder, ...unknownPeriodIds];

  const periodBlocks =
    orderedPeriodIds.length > 0
      ? orderedPeriodIds
          .map((periodId, idx) => ({
            key: periodId,
            index: idx,
            events: rows.filter((e) => e.period_id === periodId),
          }))
          .filter((block) => block.events.length > 0)
      : [{ key: "all", index: 0, events: rows }];

  const totalBlocks = periodBlocks.length;

  const renderPeriodDivider = (label, key) => {
    const firstHalfHome = scoreByDescription("1ST_HALF", "home");
    const firstHalfAway = scoreByDescription("1ST_HALF", "away");
    const currentHome = scoreByDescription("CURRENT", "home");
    const currentAway = scoreByDescription("CURRENT", "away");
    const secondOnlyHome = scoreByDescription("2ND_HALF_ONLY", "home");
    const secondOnlyAway = scoreByDescription("2ND_HALF_ONLY", "away");

    return (
      <View key={key} style={evStyles.periodDividerRow}>
        <View
          style={[
            evStyles.periodDividerLine,
            { backgroundColor: theme.border },
          ]}
        />
        <View
          style={[
            evStyles.periodDividerBadge,
            {
              borderColor: theme.border,
              backgroundColor: theme.surfaceSecondary,
            },
          ]}
        >
          <Text
            style={[
              evStyles.periodDividerLabel,
              { color: theme.textSecondary },
            ]}
          >
            {label}
          </Text>
          {label === "HT" ? (
            renderScorePair(firstHalfHome, firstHalfAway)
          ) : (
            <View style={evStyles.periodDividerFtScores}>
              {renderScorePair(currentHome, currentAway)}
              {(secondOnlyHome != null || secondOnlyAway != null) && (
                <Text
                  style={[
                    evStyles.periodDividerBracket,
                    { color: theme.textSecondary },
                  ]}
                >
                  {" ("}
                  <Text
                    style={getScoreTextStyle(secondOnlyHome, secondOnlyAway)}
                  >
                    {secondOnlyHome == null ? "-" : String(secondOnlyHome)}
                  </Text>
                  {" - "}
                  <Text
                    style={getScoreTextStyle(secondOnlyAway, secondOnlyHome)}
                  >
                    {secondOnlyAway == null ? "-" : String(secondOnlyAway)}
                  </Text>
                  {")"}
                </Text>
              )}
            </View>
          )}
        </View>
        <View
          style={[
            evStyles.periodDividerLine,
            { backgroundColor: theme.border },
          ]}
        />
      </View>
    );
  };

  const renderMinute = (e) => (
    <Text style={[evStyles.minuteText, { color: theme.text }]}>
      {e.minute}
      {e.extra_minute != null ? (
        <Text
          style={{ color: theme.textSecondary }}
        >{`+${e.extra_minute}`}</Text>
      ) : null}
      <Text style={{ color: theme.text }}>{"'"}</Text>
    </Text>
  );

  const renderLabel = (e, isHome) => {
    const playerName = e.player_name || "Unknown";
    if (!e.result) return playerName;

    const parts = e.result.split("-");
    if (parts.length !== 2) return `${playerName} (${e.result})`;

    const [homeGoals, awayGoals] = parts;

    return (
      <>
        {`${playerName} (`}
        <Text
          style={
            isHome
              ? { color: colors.primary, fontWeight: "800" }
              : { color: theme.text, fontWeight: "400" }
          }
        >
          {homeGoals}
        </Text>
        {" - "}
        <Text
          style={
            !isHome
              ? { color: colors.primary, fontWeight: "800" }
              : { color: theme.text, fontWeight: "400" }
          }
        >
          {awayGoals}
        </Text>
        {")"}
      </>
    );
  };

  const isSubstitutionEvent = (e) =>
    (e.addition || "").toLowerCase().includes("substitution");

  const getGoalDetail = (e) => {
    if (e.related_player_name) return `Assisted by ${e.related_player_name}`;
    if (e.info) return e.info;
    return null;
  };

  const renderEventIcon = (e) => {
    const addLow = (e.addition || "").toLowerCase();
    if (addLow.includes("redcard")) {
      return (
        <MaterialCommunityIcons
          name="card"
          size={16}
          color={theme.error || "#e03131"}
          style={evStyles.cardIcon}
        />
      );
    }
    if (addLow.includes("yellowcard")) {
      return (
        <MaterialCommunityIcons
          name="card"
          size={16}
          color="#facc15"
          style={evStyles.cardIcon}
        />
      );
    }
    if (
      (addLow.includes("goal") || addLow.includes("penalty")) &&
      e.result != null
    ) {
      return (
        <FontAwesome6
          name="soccer-ball"
          size={14}
          color="#FFFFFF"
          style={evStyles.ballIcon}
        />
      );
    }
    if (addLow.includes("goal") && e.result == null) {
      return (
        <FontAwesome6
          name="soccer-ball"
          size={14}
          color={theme.error || "#e03131"}
          style={evStyles.ballIcon}
        />
      );
    }
    return null;
  };

  const renderSubLine = ({ text, color, rotation, iconFirst }) => {
    if (!text) return null;
    const icon = (
      <FontAwesome6
        name="circle-arrow-left"
        size={12}
        color={color}
        style={[evStyles.swapIcon, { transform: [{ rotate: rotation }] }]}
      />
    );

    return (
      <View style={evStyles.detailLine}>
        {iconFirst ? icon : null}
        <Text style={[evStyles.detailText, { color }]} numberOfLines={1}>
          {text}
        </Text>
        {!iconFirst ? icon : null}
      </View>
    );
  };

  const renderEventContent = (event, isHome) => {
    const addLow = (event.addition || "").toLowerCase();
    const iconFirst = isHome;

    if (isSubstitutionEvent(event)) {
      return (
        <View
          style={[
            evStyles.textBlock,
            evStyles.textBlockTwoLine,
            !isHome && evStyles.textBlockAway,
          ]}
        >
          {renderSubLine({
            text: event.player_name,
            color: theme.success,
            rotation: isHome ? "180deg" : "0deg",
            iconFirst,
          })}
          {renderSubLine({
            text: event.related_player_name,
            color: theme.error || "#e03131",
            rotation: isHome ? "0deg" : "180deg",
            iconFirst,
          })}
        </View>
      );
    }

    const goalDetail = getGoalDetail(event);
    const isDisallowed = addLow.includes("disallowed");
    const showsGoalDetail =
      !isDisallowed &&
      (addLow.includes("goal") || addLow.includes("penalty")) &&
      !!goalDetail;
    const showsSecondLine = isDisallowed || showsGoalDetail;

    return (
      <View
        style={[
          evStyles.textBlock,
          showsSecondLine && evStyles.textBlockTwoLine,
          !isHome && evStyles.textBlockAway,
        ]}
      >
        <View style={[evStyles.detailLine, !isHome && evStyles.detailLineAway]}>
          {iconFirst ? renderEventIcon(event) : null}
          <Text
            style={[
              evStyles.eventText,
              { color: theme.text },
              !isHome && evStyles.eventTextAway,
            ]}
            numberOfLines={1}
          >
            {renderLabel(event, isHome)}
          </Text>
          {!iconFirst ? renderEventIcon(event) : null}
        </View>
        {isDisallowed ? (
          <Text
            style={[
              evStyles.goalDetailText,
              { color: theme.textSecondary },
              !isHome && evStyles.goalDetailTextAway,
            ]}
            numberOfLines={1}
          >
            Goal disallowed
          </Text>
        ) : showsGoalDetail ? (
          <Text
            style={[
              evStyles.goalDetailText,
              { color: theme.textSecondary },
              !isHome && evStyles.goalDetailTextAway,
            ]}
            numberOfLines={1}
          >
            {goalDetail}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[evStyles.card, { backgroundColor: theme.surface }]}>
      <View style={[evStyles.headerRow, { borderBottomColor: theme.surface }]}>
        <Text style={[evStyles.headerTitle, { color: theme.text }]}>
          EVENTS
        </Text>
      </View>

      <View style={evStyles.body}>
        {periodBlocks.map((block, blockIdx) => (
          <View key={`${block.key}:${blockIdx}`}>
            {block.events.map((event, idx) => {
              const isHome = event.participant_id === homeId;
              return (
                <View
                  key={`${event.participant_id}:${event.player_id ?? idx}:${event.minute}:${event.extra_minute ?? 0}:${idx}`}
                  style={evStyles.row}
                >
                  <View
                    style={[
                      evStyles.eventLane,
                      isHome ? evStyles.eventLaneHome : evStyles.eventLaneAway,
                    ]}
                  >
                    {isHome ? (
                      <View style={evStyles.inlineRowHome}>
                        {renderMinute(event)}
                        {renderEventContent(event, true)}
                      </View>
                    ) : (
                      <View style={evStyles.inlineRowAway}>
                        {renderEventContent(event, false)}
                        {renderMinute(event)}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}

            {blockIdx < totalBlocks - 1
              ? renderPeriodDivider("HT", `ht:${block.key}`)
              : isFinished && renderPeriodDivider("FT", `ft:${block.key}`)}
          </View>
        ))}
      </View>
    </View>
  );
};

// ─── Game Info section ───────────────────────────────────────────────────────
const degreesToCompass = (deg) => {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
};

const GameInfoSection = ({ venue, weather, league, startingAt, theme }) => {
  if (!venue && !weather && !league && !startingAt) return null;

  const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

  const venueImgUri =
    venue?.image_path && !venue.image_path.includes("placeholder")
      ? venue.image_path
      : null;

  const temp = weather?.temperature?.day;
  const feelsLike = weather?.feelslike?.day;
  const windSpeed = weather?.wind?.speed;
  const windDir = weather?.wind?.direction;
  const clouds = weather?.clouds;
  const desc = weather?.description;

  const hasWeather = temp != null || windSpeed != null || clouds != null;

  const leagueImgUri =
    league?.image_path && !league.image_path.includes("placeholder")
      ? league.image_path
      : null;
  const country = league?.country ?? null;
  const countryImgUri =
    country?.image_path && !country.image_path.includes("placeholder")
      ? country.image_path
      : null;

  const hasMeta = !!league || !!country || !!startingAt;

  let dateTop = null;
  let dateBottom = null;
  try {
    if (startingAt) {
      const d = new Date(startingAt.replace(" ", "T") + "Z");
      if (!Number.isNaN(d.getTime())) {
        const days = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ];
        const months = [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ];
        dateTop = `${days[d.getUTCDay()]}, ${d.getUTCDate()}`;
        dateBottom = `${months[d.getUTCMonth()]}, ${d.getUTCFullYear()}`;
      }
    }
  } catch (_) {}

  const fmt1 = (n) => (n != null ? `${Math.round(n * 10) / 10}` : "—");

  const weatherItems = [
    {
      label: "TEMP",
      value: temp != null ? `${fmt1(temp)}°` : "—",
      mini: feelsLike != null ? `${fmt1(feelsLike)}°` : null,
      windSuffix: null,
    },
    {
      label: "WIND",
      value: windSpeed != null ? fmt1(windSpeed) : "—",
      windSuffix: " km/h",
      mini:
        windDir != null ? `${windDir}° (${degreesToCompass(windDir)})` : null,
    },
    {
      label: "CLOUD",
      value: clouds ?? "—",
      windSuffix: null,
      mini: desc ? capFirst(desc) : null,
    },
  ];

  return (
    <View style={[giStyles.card, { backgroundColor: theme.surface }]}>
      <View style={[giStyles.headerRow, { borderBottomColor: theme.border }]}>
        <Text style={[giStyles.headerTitle, { color: theme.text }]}>
          GAME INFO
        </Text>
      </View>

      {venue ? (
        <View style={giStyles.venueRow}>
          {venueImgUri ? (
            <Image
              source={{ uri: venueImgUri }}
              style={giStyles.venueImg}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View
              style={[
                giStyles.venueImgPlaceholder,
                { backgroundColor: theme.surfaceSecondary },
              ]}
            />
          )}
          <View style={giStyles.venueInfo}>
            {venue.name ? (
              <Text
                style={[giStyles.venueName, { color: theme.text }]}
                numberOfLines={2}
              >
                {venue.name}
              </Text>
            ) : null}
            {venue.city_name ? (
              <Text style={[giStyles.venueSub, { color: theme.textSecondary }]}>
                {venue.city_name}
              </Text>
            ) : null}
            {venue.capacity != null ? (
              <Text style={[giStyles.venueSub, { color: theme.textTertiary }]}>
                {Number(venue.capacity).toLocaleString()} capacity
              </Text>
            ) : null}
            {venue.surface ? (
              <Text style={[giStyles.venueSub, { color: theme.textTertiary }]}>
                {capFirst(venue.surface)}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {hasWeather ? (
        <>
          {venue ? (
            <View
              style={[giStyles.divider, { backgroundColor: theme.border }]}
            />
          ) : null}
          <View style={giStyles.weatherRow}>
            {weatherItems.map((item) => (
              <View key={item.label} style={giStyles.weatherItem}>
                {item.windSuffix ? (
                  <Text style={[giStyles.weatherValue, { color: theme.text }]}>
                    {item.value}
                    <Text
                      style={[
                        giStyles.weatherValueSuffix,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {item.windSuffix}
                    </Text>
                  </Text>
                ) : (
                  <Text style={[giStyles.weatherValue, { color: theme.text }]}>
                    {item.value}
                  </Text>
                )}
                {item.mini ? (
                  <Text
                    style={[
                      giStyles.weatherMini,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {item.mini}
                  </Text>
                ) : null}
                <Text
                  style={[giStyles.weatherLabel, { color: theme.textTertiary }]}
                >
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {hasMeta ? (
        <>
          {(venue || hasWeather) && (
            <View style={[giStyles.divider, { backgroundColor: theme.border }]} />
          )}
          <View style={giStyles.metaRow}>
            <View style={giStyles.metaLeft}>
              {(league?.name || leagueImgUri) && (
                <View style={giStyles.metaLine}>
                  {leagueImgUri ? (
                    <Image
                      source={{ uri: leagueImgUri }}
                      style={giStyles.metaLogo}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View
                      style={[
                        giStyles.metaLogoPlaceholder,
                        { backgroundColor: theme.surfaceSecondary },
                      ]}
                    />
                  )}
                  <Text
                    style={[giStyles.metaPrimaryText, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {league?.name || "League"}
                  </Text>
                </View>
              )}

              {(country?.name || countryImgUri) && (
                <View style={giStyles.metaLine}>
                  {countryImgUri ? (
                    <Image
                      source={{ uri: countryImgUri }}
                      style={giStyles.metaLogo}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View
                      style={[
                        giStyles.metaLogoPlaceholder,
                        { backgroundColor: theme.surfaceSecondary },
                      ]}
                    />
                  )}
                  <Text
                    style={[
                      giStyles.metaSecondaryText,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {country?.name || "Country"}
                  </Text>
                </View>
              )}
            </View>

            <View style={giStyles.metaRight}>
              {dateTop ? (
                <Text style={[giStyles.metaDateTop, { color: theme.text }]}>
                  {dateTop}
                </Text>
              ) : null}
              {dateBottom ? (
                <Text
                  style={[
                    giStyles.metaDateBottom,
                    { color: theme.textSecondary },
                  ]}
                >
                  {dateBottom}
                </Text>
              ) : null}
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
};

// ─── Referees section ───────────────────────────────────────────────────────
const RefereesSection = ({ referees, theme, navigation }) => {
  if (!referees?.length) return null;

  const refs = referees.filter((r) => r?.referee?.lastname);

  if (!refs.length) return null;

  return (
    <View style={[refStyles.card, { backgroundColor: theme.surface }]}>
      <View style={[refStyles.headerRow, { borderBottomColor: theme.border }]}>
        <Text style={[refStyles.headerTitle, { color: theme.text }]}>
          REFEREES
        </Text>
      </View>
      <View style={refStyles.body}>
        {refs.map((entry, idx) => {
          const ref = entry.referee;
          if (entry.referee_id != null && navigation) {
            return (
              <TouchableOpacity
                key={entry.referee_id}
                activeOpacity={0.75}
                onPress={() =>
                  navigation.navigate("Top5RefereeDetail", {
                    refereeId: entry.referee_id,
                    refereeName:
                      ref.name ||
                      `${ref.firstname ?? ""} ${ref.lastname ?? ""}`.trim(),
                  })
                }
                style={refStyles.refTouch}
              >
                <View style={refStyles.refItem}>
                  <Text
                    style={[
                      refStyles.firstName,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {ref.firstname || ""}
                  </Text>
                  <Text
                    style={[refStyles.lastName, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {ref.lastname}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }

          return (
            <View key={idx} style={refStyles.refItem}>
              <Text
                style={[refStyles.firstName, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {ref.firstname || ""}
              </Text>
              <Text
                style={[refStyles.lastName, { color: theme.text }]}
                numberOfLines={1}
              >
                {ref.lastname}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const H2HSummarySection = ({ home, away, summary, theme }) => {
  if (!home || !away || !summary) return null;

  const homeLogoUri =
    home?.image_path && !home.image_path.includes("placeholder")
      ? home.image_path
      : null;
  const awayLogoUri =
    away?.image_path && !away.image_path.includes("placeholder")
      ? away.image_path
      : null;

  return (
    <View style={[h2hStyles.card, { backgroundColor: theme.surface }]}>
      <View style={[h2hStyles.headerRow, { borderBottomColor: theme.border }]}>
        <Text style={[h2hStyles.headerTitle, { color: theme.text }]}>H2H</Text>
      </View>

      <View style={h2hStyles.bodyRow}>
        <View style={[h2hStyles.sideBlock, h2hStyles.sideBlockLeft]}>
          {homeLogoUri ? (
            <Image
              source={{ uri: homeLogoUri }}
              style={h2hStyles.logo}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : (
            <View
              style={[
                h2hStyles.logoPlaceholder,
                { backgroundColor: theme.surfaceSecondary },
              ]}
            >
              <Text style={[h2hStyles.logoInitial, { color: theme.textSecondary }]}>
                {(home?.name || "?")[0].toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[h2hStyles.winCount, { color: theme.text }]}>
            {summary.homeWins}
          </Text>
        </View>

        <View style={h2hStyles.centerBlock}>
          <Text style={[h2hStyles.drawCount, { color: theme.text }]}>
            {summary.draws}
          </Text>
          <Text style={[h2hStyles.drawLabel, { color: theme.textSecondary }]}>
            Draws
          </Text>
        </View>

        <View style={[h2hStyles.sideBlock, h2hStyles.sideBlockRight]}>
          <Text style={[h2hStyles.winCount, { color: theme.text }]}>
            {summary.awayWins}
          </Text>
          {awayLogoUri ? (
            <Image
              source={{ uri: awayLogoUri }}
              style={h2hStyles.logo}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : (
            <View
              style={[
                h2hStyles.logoPlaceholder,
                { backgroundColor: theme.surfaceSecondary },
              ]}
            >
              <Text style={[h2hStyles.logoInitial, { color: theme.textSecondary }]}>
                {(away?.name || "?")[0].toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

// ─── Tabs ────────────────────────────────────────────────────────────────────
const TABS = ["Main", "Home", "Away", "Stats", "Commentary", "H2H"];

// ─── Main screen ──────────────────────────────────────────────────────────────
const Top5GameDetailsScreen = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const { fixtureId, homeTeamId, awayTeamId } = route.params ?? {};

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { viewerData, isJoined } = useGamePresence(fixtureId);
  const [error, setError] = useState(null);
  const [headerH, setHeaderH] = useState(180);
  const [activeTab, setActiveTab] = useState("Main");
  const [performerMode, setPerformerMode] = useState("match");
  const scrollY = useRef(new Animated.Value(0)).current;

  const dataRef = useRef(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        // ── AsyncStorage cache for finished / old games ───────────────────
        if (!silent) {
          try {
            const raw = await AsyncStorage.getItem(GAME_CACHE_KEY(fixtureId));
            if (raw) {
              const { data: cachedData, ts } = JSON.parse(raw);
              if (Date.now() - ts < GAME_CACHE_TTL_MS) {
                setData(cachedData);
                return;
              }
            }
          } catch (_) {}
        }

        const res = await fetch(
          `${FOOTBALL_BASE}/football/game/${fixtureId}/${homeTeamId}/${awayTeamId}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const responseData = json?.data ?? null;
        setData(responseData);

        // Persist cache for finished or started-more-than-24h-ago games
        const fx = responseData?.fixtureData;
        if (fx) {
          const code = fx.state?.state || "";
          const startMs = fx.starting_at
            ? new Date(fx.starting_at.replace(" ", "T") + "Z").getTime()
            : null;
          const isOld =
            startMs != null && Date.now() - startMs > 24 * 60 * 60 * 1000;
          if (isFinishedState(code) || isOld) {
            AsyncStorage.setItem(
              GAME_CACHE_KEY(fixtureId),
              JSON.stringify({ data: responseData, ts: Date.now() }),
            ).catch(() => {});
          }
        }
      } catch (err) {
        console.error("Top5 game fetch error:", err);
        if (!silent) setError("Failed to load match data.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [fixtureId, homeTeamId, awayTeamId],
  );

  // ── Polling (same pattern as Top5ScoreboardScreen) ───────────────────────
  const intervalRef = useRef(null);
  const currentIntervalMs = useRef(null);
  const isFocusedRef = useRef(false);

  const schedulePolling = useCallback(
    (fixture) => {
      if (!isFocusedRef.current) return;
      const desired = getPollingIntervalForFixture(fixture);

      // Don't poll for finished games
      if (!fixture || isFinishedState(fixture?.state?.state ?? "")) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          currentIntervalMs.current = null;
        }
        return;
      }

      if (currentIntervalMs.current === desired && intervalRef.current) return;

      if (intervalRef.current) clearInterval(intervalRef.current);
      currentIntervalMs.current = desired;
      intervalRef.current = setInterval(async () => {
        await loadData(true);
        schedulePolling(dataRef.current?.fixtureData ?? null);
      }, desired);
    },
    [loadData],
  );

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      const hasExistingData = !!dataRef.current?.fixtureData;
      loadData(hasExistingData).then(() => {
        schedulePolling(dataRef.current?.fixtureData ?? null);
      });
      return () => {
        isFocusedRef.current = false;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          currentIntervalMs.current = null;
        }
      };
    }, [loadData, schedulePolling]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
    schedulePolling(dataRef.current?.fixtureData ?? null);
    setRefreshing(false);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const fixture = data?.fixtureData ?? null;

  const home = fixture?.participants?.find((p) => p.meta?.location === "home");
  const away = fixture?.participants?.find((p) => p.meta?.location === "away");

  // Scores: look for description === "CURRENT"
  const homeScore =
    fixture?.scores?.find(
      (s) => s.description === "CURRENT" && s.score?.participant === "home",
    )?.score?.goals ?? null;
  const awayScore =
    fixture?.scores?.find(
      (s) => s.description === "CURRENT" && s.score?.participant === "away",
    )?.score?.goals ?? null;

  const stateCode = fixture?.state?.state || "";
  const live = isLiveState(stateCode);
  const finished = isFinishedState(stateCode);

  const homeWins = home?.meta?.winner === true;
  const awayWins = away?.meta?.winner === true;

  const homeColor = home?.colorPrimary || colors.primary;
  const awayColor = away?.colorPrimary || colors.secondary || "#666";

  const redCardsByTeam = useMemo(() => {
    const counts = { home: 0, away: 0 };
    for (const event of fixture?.events ?? []) {
      const addLow = (event?.addition || "").toLowerCase();
      if (!addLow.includes("redcard")) continue;
      if (event?.player_id == null) continue;
      if (event?.rescinded === true) continue;
      if (event.participant_id === home?.id) counts.home += 1;
      if (event.participant_id === away?.id) counts.away += 1;
    }
    return counts;
  }, [fixture, home, away]);

  const venueName = fixture?.venue?.name ?? null;
  const threshold = headerH > 0 ? headerH - 40 : 120;
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

  // ── Goal scorers ─────────────────────────────────────────────────────────
  const scorers = useMemo(() => {
    if (!fixture) return { home: [], away: [] };
    const events = fixture.events ?? [];
    const lineups = fixture.lineups ?? [];

    const playerMap = new Map(
      lineups
        .filter((l) => l.player_id != null)
        .map((l) => [l.player_id, l.player]),
    );

    const homeId = home?.id;
    const awayId = away?.id;

    const goalEvents = events
      .filter((e) => {
        if (e.rescinded === true) return false;
        if (e.result == null) return false;
        const addLow = (e.addition || "").toLowerCase();
        return (
          addLow.includes("goal") ||
          (addLow.includes("penalty") &&
            !addLow.includes("missed") &&
            !addLow.includes("awarded"))
        );
      })
      .sort((a, b) => {
        const aT = (a.minute ?? 0) * 100 + (a.extra_minute ?? 0);
        const bT = (b.minute ?? 0) * 100 + (b.extra_minute ?? 0);
        return aT - bT;
      });

    function groupByPlayer(evts) {
      const map = new Map();
      for (const e of evts) {
        const key = e.player_id ?? `name_${e.player_name}`;
        if (!map.has(key)) {
          const player = e.player_id ? playerMap.get(e.player_id) : null;
          const lastName =
            player?.lastname ||
            (e.player_name ? e.player_name.split(" ").pop() : "?");
          map.set(key, { lastName, goals: [] });
        }
        map.get(key).goals.push(e);
      }
      return [...map.values()].sort((a, b) => {
        const aT =
          (a.goals[0]?.minute ?? 0) * 100 + (a.goals[0]?.extra_minute ?? 0);
        const bT =
          (b.goals[0]?.minute ?? 0) * 100 + (b.goals[0]?.extra_minute ?? 0);
        return aT - bT;
      });
    }

    return {
      home: groupByPlayer(
        goalEvents.filter((e) => e.participant_id === homeId),
      ),
      away: groupByPlayer(
        goalEvents.filter((e) => e.participant_id === awayId),
      ),
    };
  }, [fixture, home, away]);

  // ── Man of the Match ─────────────────────────────────────────────────────
  const manOfTheMatch = useMemo(() => {
    if (stateCode !== "FT") return null;
    const lineups = fixture?.lineups ?? [];
    if (lineups.length === 0) return null;

    let candidates = lineups;
    if (homeWins) candidates = lineups.filter((l) => l.team_id === home?.id);
    else if (awayWins)
      candidates = lineups.filter((l) => l.team_id === away?.id);

    let best = null;
    let bestRating = -1;
    for (const l of candidates) {
      const rd = (l.details ?? []).find(
        (d) => (d.type?.name ?? "").toLowerCase() === "rating",
      );
      const r = parseFloat(rd?.data?.value ?? 0);
      if (r > bestRating) {
        bestRating = r;
        best = l;
      }
    }
    if (!best || bestRating <= 0) return null;

    const team = best.team_id === home?.id ? home : away;
    return { lineup: best, team, rating: bestRating };
  }, [fixture, stateCode, homeWins, awayWins, home, away]);

  const topPerformers = useMemo(() => {
    const makeEntries = (teamId) =>
      (fixture?.lineups ?? [])
        .filter((lineup) => lineup.team_id === teamId)
        .map((lineup) => ({
          lineup,
          rating: getLineupRating(lineup),
          bucket: getPerformerBucket(lineup),
        }))
        .filter((entry) => entry.rating != null)
        .sort((a, b) => b.rating - a.rating);

    const buildPositionEntries = (entries) =>
      POSITION_BUCKET_ORDER.map((bucket) =>
        entries.find((entry) => entry.bucket === bucket),
      ).filter(Boolean);

    const homeEntries = makeEntries(home?.id);
    const awayEntries = makeEntries(away?.id);

    return {
      match: {
        home: homeEntries.slice(0, 3),
        away: awayEntries.slice(0, 3),
      },
      position: {
        home: buildPositionEntries(homeEntries),
        away: buildPositionEntries(awayEntries),
      },
    };
  }, [fixture, home, away]);

  const h2hSummary = useMemo(() => {
    const matches = data?.h2hData ?? [];
    if (!matches.length || !home?.id || !away?.id) {
      return { homeWins: 0, awayWins: 0, draws: 0 };
    }

    let homeWinsCount = 0;
    let awayWinsCount = 0;
    let drawsCount = 0;

    for (const m of matches) {
      const participants = m?.participants ?? [];
      const homeParticipant = participants.find((p) => p?.id === home.id);
      const awayParticipant = participants.find((p) => p?.id === away.id);

      if (!homeParticipant || !awayParticipant) continue;

      const homeWinner = homeParticipant?.meta?.winner;
      const awayWinner = awayParticipant?.meta?.winner;

      if (homeWinner === true) homeWinsCount += 1;
      else if (awayWinner === true) awayWinsCount += 1;
      else if (homeWinner === false && awayWinner === false) drawsCount += 1;
    }

    return {
      homeWins: homeWinsCount,
      awayWins: awayWinsCount,
      draws: drawsCount,
    };
  }, [data, home, away]);

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading match…
        </Text>
      </View>
    );
  }

  if (error || !fixture) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          {error || "Match data unavailable."}
        </Text>
        <TouchableOpacity
          style={[styles.retryBtn, { borderColor: colors.primary }]}
          onPress={() => loadData(false)}
          activeOpacity={0.7}
        >
          <Text style={[styles.retryBtnText, { color: colors.primary }]}>
            Retry
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const homeAbbr =
    home?.short_code || home?.name?.slice(0, 3)?.toUpperCase() || "";
  const awayAbbr =
    away?.short_code || away?.name?.slice(0, 3)?.toUpperCase() || "";

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Animated.ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        stickyHeaderIndices={[1]}
      >
        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <View
          style={[styles.header, { backgroundColor: theme.surfaceSecondary }]}
          onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
        >
          <HeaderGradient
            homeColor={homeColor}
            awayColor={awayColor}
            theme={theme}
            height={headerH}
          />

          {/* Venue · League row */}
          {(venueName || fixture.league) && (
            <View style={styles.leagueRow}>
              {fixture.league?.image_path ? (
                <Image
                  source={{ uri: fixture.league.image_path }}
                  style={styles.leagueLogo}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              ) : null}
              <Text
                style={[styles.leagueName, { color: theme.textTertiary }]}
                numberOfLines={1}
              >
                {[venueName, fixture.league?.name].filter(Boolean).join(" · ")}
              </Text>
            </View>
          )}

          {/* Teams row */}
          <View style={styles.teamsRow}>
            {/* Home (left) */}
            <TeamSide
              team={home}
              score={homeScore}
              redCards={redCardsByTeam.home}
              isWinner={homeWins}
              isFinished={finished}
              isLive={live}
              scoreOpacity={gameScoreOpacity}
              side="home"
              theme={theme}
              colors={colors}
              onPress={
                home?.id
                  ? () =>
                      navigation.navigate("Top5TeamDetail", {
                        teamId: home.id,
                        teamName: home.name,
                      })
                  : undefined
              }
            />

            {/* Status (centre) */}
            <StatusBadge fixture={fixture} theme={theme} />

            {/* Away (right) */}
            <TeamSide
              team={away}
              score={awayScore}
              redCards={redCardsByTeam.away}
              isWinner={awayWins}
              isFinished={finished}
              isLive={live}
              scoreOpacity={gameScoreOpacity}
              side="away"
              theme={theme}
              colors={colors}
              onPress={
                away?.id
                  ? () =>
                      navigation.navigate("Top5TeamDetail", {
                        teamId: away.id,
                        teamName: away.name,
                      })
                  : undefined
              }
            />
          </View>

          {/* Scorers */}
          {scorers && (scorers.home.length > 0 || scorers.away.length > 0) && (
            <View style={styles.scorersSection}>
              {/* Home (left of ball) */}
              <View style={styles.scorersSideLeft}>
                {scorers.home.map((scorer, idx) => (
                  <Text
                    key={idx}
                    style={[styles.scorerText, { color: theme.textSecondary }]}
                    numberOfLines={2}
                  >
                    {scorer.lastName}
                    {"\u00a0"}
                    {scorer.goals.map(formatGoalTime).join(", ")}
                  </Text>
                ))}
              </View>
              {/* Ball */}
              <View style={styles.scorersBallCol}>
                <FontAwesome6
                  name="soccer-ball"
                  size={12}
                  color={theme.textSecondary}
                />
              </View>
              {/* Away (right of ball) */}
              <View style={styles.scorersSideRight}>
                {scorers.away.map((scorer, idx) => (
                  <Text
                    key={idx}
                    style={[styles.scorerText, { color: theme.textSecondary }]}
                    numberOfLines={2}
                  >
                    {scorer.lastName}
                    {" "}
                    {scorer.goals.map(formatGoalTime).join(", ")}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* ── STICKY UNIT (mini header + tab bar) ───────────────────────── */}
        <View
          style={[
            styles.stickyUnit,
            {
              backgroundColor: theme.surface,
              borderBottomColor: theme.border,
            },
          ]}
        >
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
            <View style={[styles.miniSide, { justifyContent: "flex-start" }]}>
              {home?.image_path ? (
                <Image
                  source={{ uri: home.image_path }}
                  style={styles.miniLogo}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              ) : null}
              <Text style={[styles.miniAbbr, { color: homeColor }]}>
                {homeAbbr}
              </Text>
              <Text
                style={[
                  styles.miniScore,
                  {
                    color: homeWins ? theme.text : theme.textSecondary,
                    fontWeight: homeWins ? "800" : "500",
                  },
                ]}
              >
                {homeScore ?? ""}
              </Text>
            </View>

            <View style={styles.miniStatusBlock}>
              {live ? (
                <>
                  <Text
                    style={[
                      styles.miniStatusLine,
                      { color: theme.error || "#e03131" },
                    ]}
                  >
                    {fixture?.state?.short_name ||
                      fixture?.state?.name ||
                      stateCode}
                  </Text>
                  <Text
                    style={[
                      styles.miniStatusSub,
                      { color: theme.textTertiary },
                    ]}
                  >
                    Live
                  </Text>
                </>
              ) : finished ? (
                <>
                  <Text
                    style={[
                      styles.miniStatusLine,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {fixture?.state?.short_name ||
                      fixture?.state?.name ||
                      stateCode}
                  </Text>
                  <Text
                    style={[
                      styles.miniStatusSub,
                      { color: theme.textTertiary },
                    ]}
                    numberOfLines={1}
                  >
                    Final
                  </Text>
                </>
              ) : (
                <>
                  <Text
                    style={[
                      styles.miniStatusLine,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {(() => {
                      try {
                        const d = new Date(
                          fixture.starting_at.replace(" ", "T") + "Z",
                        );
                        const est = new Date(d.getTime() - 4 * 60 * 60 * 1000);
                        const h = est.getUTCHours();
                        const m = String(est.getUTCMinutes()).padStart(2, "0");
                        const ampm = h >= 12 ? "PM" : "AM";
                        return `${h % 12 || 12}:${m} ${ampm}`;
                      } catch (_) {
                        return (
                          fixture?.state?.short_name ||
                          fixture?.state?.name ||
                          stateCode
                        );
                      }
                    })()}
                  </Text>
                  <Text
                    style={[
                      styles.miniStatusSub,
                      { color: theme.textTertiary },
                    ]}
                    numberOfLines={1}
                  >
                    {(() => {
                      try {
                        const d = new Date(
                          fixture.starting_at.replace(" ", "T") + "Z",
                        );
                        return d.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          timeZone: "UTC",
                        });
                      } catch (_) {
                        return "";
                      }
                    })()}
                  </Text>
                </>
              )}
            </View>

            <View style={[styles.miniSide, { justifyContent: "flex-end" }]}>
              <Text
                style={[
                  styles.miniScore,
                  {
                    color: awayWins ? theme.text : theme.textSecondary,
                    fontWeight: awayWins ? "800" : "500",
                  },
                ]}
              >
                {awayScore ?? ""}
              </Text>
              <Text style={[styles.miniAbbr, { color: awayColor }]}>
                {awayAbbr}
              </Text>
              {away?.image_path ? (
                <Image
                  source={{ uri: away.image_path }}
                  style={styles.miniLogo}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              ) : null}
            </View>
          </Animated.View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabBarContent}
            style={styles.tabBarWrapper}
            bounces={false}
          >
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.tabBarButton,
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
                    styles.tabBarLabel,
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
          </ScrollView>
        </View>

        {/* ── TAB CONTENT ──────────────────────────────────────────────────── */}
        <View style={styles.tabContent}>
          {activeTab === "Main" && (
            <View style={{ paddingTop: 6 }}>
              {manOfTheMatch ? (
                <ManOfTheMatch
                  entry={manOfTheMatch}
                  theme={theme}
                  colors={colors}
                />
              ) : null}
              <EventsSection
                events={fixture.events ?? []}
                periods={fixture.periods ?? []}
                scores={fixture.scores ?? []}
                stateCode={stateCode}
                homeId={home?.id}
                awayId={away?.id}
                theme={theme}
                accentColor={homeColor}
                colors={colors}
              />
              <TopPerformersSection
                mode={performerMode}
                onModeChange={setPerformerMode}
                performers={topPerformers}
                home={home}
                away={away}
                homeColor={homeColor}
                awayColor={awayColor}
                theme={theme}
                colors={colors}
                navigation={navigation}
              />
              <GameInfoSection
                venue={fixture.venue ?? null}
                weather={fixture.weatherreport ?? null}
                league={fixture.league ?? null}
                startingAt={fixture.starting_at ?? null}
                theme={theme}
              />
              <RefereesSection
                referees={fixture.referees ?? []}
                theme={theme}
                navigation={navigation}
              />
            </View>
          )}
          {activeTab === "Home" && (
            <View style={styles.comingSoon}>
              <Text
                style={[styles.comingSoonText, { color: theme.textTertiary }]}
              >
                Home tab coming soon
              </Text>
            </View>
          )}
          {activeTab === "Away" && (
            <View style={styles.comingSoon}>
              <Text
                style={[styles.comingSoonText, { color: theme.textTertiary }]}
              >
                Away tab coming soon
              </Text>
            </View>
          )}
          {activeTab === "Stats" && (
            <View style={styles.comingSoon}>
              <Text
                style={[styles.comingSoonText, { color: theme.textTertiary }]}
              >
                Stats tab coming soon
              </Text>
            </View>
          )}
          {activeTab === "Commentary" && (
            <View style={styles.comingSoon}>
              <Text
                style={[styles.comingSoonText, { color: theme.textTertiary }]}
              >
                Commentary tab coming soon
              </Text>
            </View>
          )}
          {activeTab === "H2H" && (
            <View style={{ paddingTop: 6 }}>
              <H2HSummarySection
                home={home}
                away={away}
                summary={h2hSummary}
                theme={theme}
              />
            </View>
          )}
        </View>

        <View style={{ height: 32 }} />
      </Animated.ScrollView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
    padding: 24,
  },
  loadingText: { fontSize: 14, textAlign: "center" },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  retryBtnText: { fontSize: 14, fontWeight: "700" },

  // ── Header ──
  header: {
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 16,
    overflow: "hidden",
    position: "relative",
  },
  venue: {
    fontSize: 12,
    textAlign: "center",
    marginBottom: 14,
    letterSpacing: 0.2,
  },
  teamsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  teamSide: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  teamSideAway: {
    alignItems: "center",
  },

  // Logo + score layouts
  logoScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scoreLogo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  teamLogo: {
    width: 64,
    height: 56,
  },
  teamLogoPlaceholder: {
    width: 64,
    height: 56,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  teamLogoInitial: {
    fontSize: 22,
    fontWeight: "800",
  },
  teamScore: {
    fontSize: 42,
    lineHeight: 48,
    fontWeight: "800",
  },
  teamName: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
    maxWidth: 130,
    textAlign: "center",
  },
  teamNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    maxWidth: 130,
  },
  teamNameRowHome: {
    flexDirection: "row",
  },
  teamNameRowAway: {
    flexDirection: "row",
  },
  teamCardsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  redCardIcon: {
    transform: [{ rotate: "90deg" }],
  },

  // Status badge (centre column)
  statusBadge: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    minWidth: 64,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginBottom: 4,
  },
  statusMain: {
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  statusSub: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 2,
  },

  // League row
  leagueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    gap: 6,
  },
  leagueLogo: {
    width: 20,
    height: 20,
  },
  leagueName: {
    fontSize: 12,
    fontWeight: "500",
  },

  // Scorers section
  scorersSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 10,
    minHeight: 24,
    marginBottom: -2.5,
  },
  scorersSideLeft: {
    flex: 1,
    alignItems: "flex-end",
    paddingRight: 8,
    gap: 2,
  },
  scorersSideRight: {
    flex: 1,
    alignItems: "flex-start",
    paddingLeft: 8,
    gap: 2,
  },
  scorersBallCol: {
    width: 28,
    alignItems: "center",
    paddingTop: 2,
  },
  scorerText: {
    fontSize: 11,
    lineHeight: 16,
  },

  // Tab bar
  stickyUnit: {
    borderBottomWidth: 1,
  },
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
    width: 28,
    height: 24,
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
  tabBarWrapper: {
    borderBottomWidth: 0,
  },
  tabBarContent: {
    flexDirection: "row",
  },
  tabBarButton: {
    width: width / 4,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabBarLabel: {
    fontSize: 13,
  },
  tabContent: {
    flex: 1,
  },

  // Coming soon
  comingSoon: {
    alignItems: "center",
    paddingTop: 48,
  },
  comingSoonText: {
    fontSize: 14,
  },
});

// ─── Man of the Match styles ─────────────────────────────────────────────────
const motmStyles = StyleSheet.create({
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
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerAccent: {
    width: 4,
    height: 16,
    borderRadius: 2,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 12,
  },
  headshotWrap: {
    width: 52,
    height: 52,
    position: "relative",
    flexShrink: 0,
  },
  headshot: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  headshotInitials: {
    fontSize: 20,
    fontWeight: "800",
  },
  ratingBadge: {
    position: "absolute",
    top: -3,
    right: -7,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: "center",
  },
  ratingText: {
    fontSize: 10,
    fontWeight: "800",
  },
  posBadge: {
    position: "absolute",
    bottom: -3,
    right: -7,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  posText: {
    fontSize: 9,
    fontWeight: "700",
  },
  nameBlock: {
    flex: 1,
  },
  firstName: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 17,
  },
  lastName: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 22,
  },
  statsCol: {
    flexDirection: "row",
    gap: 14,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    marginTop: 2,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderTopWidth: 1.5,
    gap: 7,
    paddingHorizontal: 14,
  },
  footerLogo: {
    width: 18,
    height: 18,
  },
  footerLogoPlaceholder: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  footerTeamName: {
    fontSize: 12,
    fontWeight: "600",
  },
});

const evStyles = StyleSheet.create({
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
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerAccent: {
    width: 4,
    height: 16,
    borderRadius: 2,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  body: {
    paddingHorizontal: 14,
  },
  row: {
    width: "100%",
    minHeight: 38,
  },
  eventLane: {
    width: "100%",
    paddingVertical: 10,
  },
  eventLaneHome: {
    alignItems: "flex-start",
  },
  eventLaneAway: {
    alignItems: "flex-end",
  },
  inlineRowHome: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    maxWidth: "88%",
  },
  inlineRowAway: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    maxWidth: "88%",
  },
  minuteText: {
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 0,
    alignSelf: "center",
  },
  cardIcon: {
    transform: [{ rotate: "90deg" }],
  },
  ballIcon: {
    width: 14,
    textAlign: "center",
  },
  swapIcon: {
    width: 14,
    textAlign: "center",
  },
  textBlock: {
    flexShrink: 1,
    minWidth: 0,
  },
  textBlockTwoLine: {
    justifyContent: "center",
  },
  textBlockAway: {
    alignItems: "flex-end",
  },
  detailLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  detailLineAway: {
    justifyContent: "flex-end",
  },
  detailText: {
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 1,
  },
  goalDetailText: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  goalDetailTextAway: {
    textAlign: "right",
  },
  eventText: {
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 1,
  },
  eventTextAway: {
    textAlign: "right",
  },
  periodDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 4,
  },
  periodDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  periodDividerBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  periodDividerLabel: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  periodDividerScore: {
    fontSize: 16,
    fontWeight: "400",
  },
  periodDividerFtScores: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  periodDividerBracket: {
    fontSize: 16,
    fontWeight: "400",
  },
});

const tpStyles = StyleSheet.create({
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
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  toggleWrap: {
    flexDirection: "row",
    borderRadius: 999,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  toggleText: {
    fontSize: 11,
  },
  body: {
    position: "relative",
    overflow: "hidden",
  },
  bodyInner: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  sideCol: {
    flex: 1,
    gap: 10,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 48,
  },
  playerRowAway: {
    justifyContent: "flex-end",
  },
  headshotWrap: {
    width: 42,
    height: 42,
    position: "relative",
    flexShrink: 0,
  },
  headshot: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  headshotInitials: {
    fontSize: 15,
    fontWeight: "800",
  },
  ratingBadge: {
    position: "absolute",
    top: -3,
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 24,
    alignItems: "center",
  },
  ratingBadgeHome: {
    right: -7,
  },
  ratingBadgeAway: {
    left: -7,
  },
  ratingText: {
    fontSize: 9,
    fontWeight: "800",
  },
  posBadge: {
    position: "absolute",
    bottom: -3,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  posBadgeHome: {
    right: -7,
  },
  posBadgeAway: {
    left: -7,
  },
  posText: {
    fontSize: 8,
    fontWeight: "700",
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  nameBlockAway: {
    alignItems: "flex-end",
  },
  firstName: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 14,
  },
  lastName: {
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 17,
  },
  footerTopBar: {
    flexDirection: "row",
    height: 2,
  },
  footerTopHalf: {
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  footerTeamBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
  },
  footerTeamBlockAway: {
    justifyContent: "flex-end",
  },
  footerLogo: {
    width: 18,
    height: 18,
  },
  footerTeamName: {
    fontSize: 12,
    fontWeight: "600",
  },
});

// ─── Game Info styles ─────────────────────────────────────────────────────────
const giStyles = StyleSheet.create({
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
  venueRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    gap: 12,
  },
  venueImg: {
    width: 100,
    height: 73,
    borderRadius: 8,
    flexShrink: 0,
  },
  venueImgPlaceholder: {
    width: 100,
    height: 73,
    borderRadius: 8,
    flexShrink: 0,
  },
  venueInfo: {
    flex: 1,
    gap: 3,
  },
  venueName: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  venueSub: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  weatherRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  weatherItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  weatherValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  weatherValueSuffix: {
    fontSize: 11,
    fontWeight: "400",
  },
  weatherMini: {
    fontSize: 11,
    fontWeight: "500",
  },
  weatherLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  metaLeft: {
    flex: 1,
    gap: 7,
  },
  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  metaLogo: {
    width: 16,
    height: 16,
  },
  metaLogoPlaceholder: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  metaPrimaryText: {
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
  },
  metaSecondaryText: {
    fontSize: 12,
    fontWeight: "500",
    flexShrink: 1,
  },
  metaRight: {
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: 108,
  },
  metaDateTop: {
    fontSize: 12,
    fontWeight: "700",
  },
  metaDateBottom: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
});

// ─── Referees styles ─────────────────────────────────────────────────────────
const refStyles = StyleSheet.create({
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
  body: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  refItem: {
    flex: 1,
    alignItems: "center",
  },
  refTouch: {
    flex: 1,
  },
  firstName: {
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 15,
  },
  lastName: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
  },
});

const h2hStyles = StyleSheet.create({
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
  bodyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  sideBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  sideBlockLeft: {
    justifyContent: "flex-start",
  },
  sideBlockRight: {
    justifyContent: "flex-end",
  },
  logo: {
    width: 24,
    height: 24,
  },
  logoPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  logoInitial: {
    fontSize: 11,
    fontWeight: "800",
  },
  winCount: {
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 30,
  },
  centerBlock: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 76,
  },
  drawCount: {
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 30,
  },
  drawLabel: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
  },
});

export default Top5GameDetailsScreen;
